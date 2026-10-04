// Same-machine glass performance probe. Input exports stay private.
// CAPTURE_MODES can compare normal rendering with native card backdrops disabled.
// The latter is a diagnostic counterfactual, never a visual correctness check.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
if (!process.env.CAPTURE_STATE || !process.env.CAPTURE_WALLPAPER) throw new Error('CAPTURE_STATE and CAPTURE_WALLPAPER are required');
const out = process.env.CAPTURE_OUTPUT ?? 'artifacts/working/glass-performance';
await mkdir(out, { recursive:true });
const state = JSON.parse(await readFile(process.env.CAPTURE_STATE,'utf8')).state;
const wallpaper = await readFile(process.env.CAPTURE_WALLPAPER);
const url = 'https://glass-diagnostic.invalid/wallpaper.png';
state.wallpaper = {...state.wallpaper, source:'url',url};
const native = process.env.CAPTURE_EXTENSION === '1';
const trace = process.env.CAPTURE_TRACE === '1';
const browser = native ? null : await chromium.launch({channel:'msedge',headless:false,ignoreDefaultArgs:['--hide-scrollbars']});
const report = [];
try {
for (const mode of (process.env.CAPTURE_MODES ?? 'baseline').split(',')) {
 if (!['baseline','no-filter'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
 const options = { viewport:{width:1920,height:926},deviceScaleFactor:1 };
 const extension = resolve(process.env.CAPTURE_EXTENSION_DIR ?? 'dist-extension');
 const version = JSON.parse(await readFile(native ? join(extension,'manifest.json') : 'public/manifest.json','utf8')).version;
 const context = native ? await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(),'mysimple-perf-')), {...options,channel:'chromium',headless:false,ignoreDefaultArgs:['--hide-scrollbars'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]}) : await browser.newContext(options);
 try {
 const worker = native ? context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker') : null;
 const base = native ? `chrome-extension://${new URL(worker.url()).host}/index.html` : process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4198';
 await context.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__perf = {active:false,frames:[],callbacks:[],longTasks:[]};
  window.requestAnimationFrame = cb => raf(t => {
   const start=performance.now(); cb(t);
   if(window.__perf.active) window.__perf.callbacks.push({name:cb.name,ms:performance.now()-start});
  });
  new PerformanceObserver(list => {if(window.__perf.active)window.__perf.longTasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:true});
  let previous;
  const tick = t => {if(window.__perf.active && previous !== undefined)window.__perf.frames.push(t-previous);previous=window.__perf.active?t:undefined;raf(tick);};raf(tick);
 });
 const page = await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(url,r=>r.fulfill({contentType:'image/png',body:wallpaper}));
 await page.goto(base);
 await expect(page.getByRole('button',{name:'打开设置'})).toBeVisible();
 await page.evaluate(async ({state,native})=>{ if(native)await chrome.storage.local.set({'site-hub:v1':JSON.stringify(state)}); else localStorage.setItem('site-hub:v1',JSON.stringify(state)); },{state,native});
 await page.reload();
 await page.locator('.wallpaper-layer img').evaluate(img=>img.decode());
 await page.evaluate(()=>{document.title='Mysimple glass performance diagnostic';});
 await page.bringToFront();
 await page.waitForTimeout(4000);
 if(mode.includes('no-filter'))await page.addStyleTag({content:':root:has(.app-shell.has-wallpaper) :is(.site-card,.add-site-card){backdrop-filter:none!important}'});
 const session=await context.newCDPSession(page);await session.send('Performance.enable');
 for(const action of (process.env.CAPTURE_ACTIONS ?? 'hover,scroll,large-return').split(',')) {
  if(!['hover','scroll','large-return'].includes(action))throw new Error(`Unknown action: ${action}`);
  await page.evaluate(()=>scrollTo(0,0));
  await page.mouse.move(10,850);
  await page.waitForTimeout(600);
  const cards=await page.locator('.site-card[data-site-dnd-id]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()).filter(r=>r.y>=0&&r.bottom<926));
  if(cards.length<8)throw new Error('Eight visible cards are required');
  const environment=await page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus(),dpr:devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency}));
  await writeFile(join(out,`${mode}-${action}-environment.json`),JSON.stringify(environment,null,2));
  if(process.env.CAPTURE_REQUIRE_FOCUS==='1' && (!environment.focused || environment.visibility!=='visible'))throw new Error('Foreground performance sample was not started: diagnostic page is not focused and visible');
  if(trace)await session.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc,gpu',transferMode:'ReturnAsStream'});
  await page.evaluate(()=>{Object.assign(window.__perf,{active:true,frames:[],callbacks:[],longTasks:[]})});
  const before=(await session.send('Performance.getMetrics')).metrics;
  const start=Date.now();
  if(action==='hover')for(let i=0;i<80;i++){const r=cards[i%Math.min(cards.length,8)];await page.mouse.move(r.x+r.width*.6,r.y+r.height*.5);await page.waitForTimeout(40);}
  else if(action==='scroll')for(let i=0;i<80;i++){await page.mouse.wheel(0,i<40?30:-30);await page.waitForTimeout(40);}
  else for(let i=0;i<32;i++){await page.mouse.wheel(0,i%4<2?900:-900);await page.waitForTimeout(70);}
  const elapsed=Date.now()-start;
  const after=(await session.send('Performance.getMetrics')).metrics;
  const samples=await page.evaluate(()=>{window.__perf.active=false;return window.__perf});
  const environmentAfter=await page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()}));
  // Trace extraction happens after measurement so its I/O is not frame latency.
  if(trace){
   const complete=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));
   await session.send('Tracing.end');
   const {stream}=await complete;let contents='';
   for(;;){const chunk=await session.send('IO.read',{handle:stream});contents+=chunk.data;if(chunk.eof)break;}
   await session.send('IO.close',{handle:stream});
   await writeFile(join(out,`${mode}-${action}-trace.json`),contents);
  }
  const metrics=Object.fromEntries(after.map(x=>[x.name,x.value-(before.find(y=>y.name===x.name)?.value??0)]));
  const frames=[...samples.frames].sort((a,b)=>a-b);
  const callbacks={};for(const c of samples.callbacks){const s=callbacks[c.name]??={count:0,total:0,max:0};s.count++;s.total+=c.ms;s.max=Math.max(s.max,c.ms);}
  const foregroundAtEndpoints=environment.focused && environmentAfter.focused && environment.visibility==='visible' && environmentAfter.visibility==='visible';
  const row={mode,action,elapsed,environment,environmentAfter,foregroundAtEndpoints,frameCount:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],over33:frames.filter(x=>x>33.5).length,callbacks,longTasks:samples.longTasks,metrics};
  report.push(row);console.log(JSON.stringify(row));
  await writeFile(`${out}/report.json`,JSON.stringify({version,browser:context.browser().version(),native,viewport:options.viewport,trace,errors,report},null,2));
  if(process.env.CAPTURE_REQUIRE_FOCUS==='1' && !foregroundAtEndpoints)throw new Error('Foreground performance sample is invalid: diagnostic page lost focus or visibility');
  await page.waitForTimeout(600);
 }
 await page.screenshot({path:join(out,`${mode}-after.png`)});
 if(errors.length)throw new Error(`${errors.length} page errors; see report.json`);
 } finally {await context.close();}
}
} finally {await browser?.close();}
