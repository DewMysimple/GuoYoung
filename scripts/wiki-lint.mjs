#!/usr/bin/env node
/*
 * WebPage Wiki 校验器（Node 版，移植自 ChatAgent/wiki_lint.py）
 * 规则：19 条移植 + 4 条 WebPage 新增 = 23 条。
 * 运行：npm run lint:wiki  （cwd 应为项目根，脚本以自身位置推导 rootDir）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wikiDir = path.join(rootDir, 'Wiki');
const CATS = ['功能添加', 'UI修改', 'Bug处理', '工程讨论', '测试验证', '工程维护'];

const errors = [];
const err = (m) => errors.push(m);
const rel = (p) => path.relative(rootDir, p);

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const stripCode = (t) => t.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');

function field(content, label) {
  const m = content.match(new RegExp(`^(?:- )?${label}：(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

function linkTarget(inner) {
  let s = inner;
  const i = s.indexOf('|');
  if (i >= 0) s = s.slice(0, i);
  s = s.replace(/\\$/, '').trim();
  return s;
}

function resolveLink(target) {
  return fs.existsSync(path.join(rootDir, target + '.md'));
}

function parseFM(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const obj = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (mm) obj[mm[1]] = mm[2].trim();
  }
  return obj;
}

function fileLinks(absFile) {
  const txt = stripCode(fs.readFileSync(absFile, 'utf8'));
  const out = [];
  for (const m of txt.matchAll(/\[\[([^\]]+)\]\]/g)) out.push(m[1]);
  return out;
}

// ---------------------------------------------------------------------------
// 结构检查（规则 1、2、20）
// ---------------------------------------------------------------------------
if (!fs.existsSync(wikiDir)) {
  console.error('未找到 Wiki 目录：' + wikiDir);
  process.exit(1);
}

const required = [
  path.join(wikiDir, 'MOC_项目知识.md'),
  path.join(wikiDir, '日志', 'MOC_工作日志.md'),
  path.join(wikiDir, '决策', 'MOC_决策.md'),
  ...CATS.map((c) => path.join(wikiDir, '日志', c, `MOC_${c}.md`)),
];
for (const f of required) if (!fs.existsSync(f)) err(`缺少必需文件：${rel(f)}`);

const logDir = path.join(wikiDir, '日志');
if (fs.existsSync(logDir)) {
  const subdirs = fs.readdirSync(logDir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  for (const d of subdirs) if (!CATS.includes(d)) err(`日志下存在非约定分类目录：${d}`);
  // 规则 2：日志只能出现在 6 个约定分类目录内
  for (const f of walk(logDir)) {
    const r = path.relative(logDir, f);
    const parts = r.split(path.sep);
    const base = path.basename(f);
    if (base === 'README.md') continue;
    if (base === 'MOC_工作日志.md') continue;
    if (parts.length >= 2 && CATS.includes(parts[0])) continue;
    err(`日志出现在非约定位置：${r}`);
  }
}

// ---------------------------------------------------------------------------
// 收集日志文件
// ---------------------------------------------------------------------------
const logFiles = [];
for (const c of CATS) {
  const dir = path.join(logDir, c);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^第(\d{3})次\.md$/);
    if (m) logFiles.push({ cat: c, file: path.join(dir, f), name: f, num: parseInt(m[1], 10) });
  }
}

// ---------------------------------------------------------------------------
// 链接检查（规则 3、4、5）
// ---------------------------------------------------------------------------
const allMd = walk(wikiDir);
for (const f of allMd) {
  for (const inner of fileLinks(f)) {
    const t = linkTarget(inner);
    if (!resolveLink(t)) err(`断链：${rel(f)} -> [[${inner}]]`);
  }
}

// BFS 可达性（规则 5）
{
  const start = path.join(wikiDir, 'MOC_项目知识.md');
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur) || !fs.existsSync(cur)) continue;
    visited.add(cur);
    for (const inner of fileLinks(cur)) {
      const abs = path.join(rootDir, linkTarget(inner) + '.md');
      if (fs.existsSync(abs) && !visited.has(abs)) queue.push(abs);
    }
  }
  const logPaths = new Set(logFiles.map((l) => l.file));
  const knowledgePages = allMd.filter((f) => !logPaths.has(f));
  for (const kp of knowledgePages) if (!visited.has(kp)) err(`知识页不可达（无法从 MOC_项目知识 经 BFS 到达）：${rel(kp)}`);
}

// ---------------------------------------------------------------------------
// 知识页检查（规则 6、7、8、9、10）
// ---------------------------------------------------------------------------
const knowledgePages = allMd.filter((f) => !logFiles.some((l) => l.file === f));
for (const f of knowledgePages) {
  const base = path.basename(f);
  const isMoc = base.startsWith('MOC_');
  const isReadme = base === 'README.md';
  const content = fs.readFileSync(f, 'utf8');
  if (!content.startsWith('---')) { err(`知识页缺少 frontmatter：${rel(f)}`); continue; }
  const fm = parseFM(content);
  if (!fm.type || !fm.status || !fm.created || !fm.updated) err(`frontmatter 缺字段(type/status/created/updated)：${rel(f)}`);
  if (!isMoc && !isReadme) {
    if (!/## 依据/.test(content)) err(`缺少 ## 依据：${rel(f)}`);
    if (!/## 相关页面/.test(content)) err(`缺少 ## 相关页面：${rel(f)}`);
  }
}

const decisionDir = path.join(wikiDir, '决策');
for (const f of walk(decisionDir)) {
  const base = path.basename(f);
  if (/^ADR-\d+\.md$/.test(base)) {
    const fm = parseFM(fs.readFileSync(f, 'utf8'));
    if (fm.status === 'superseded' && !fm.superseded_by) err(`ADR 标记 superseded 但缺 superseded_by：${base}`);
  }
}

const decMoc = path.join(decisionDir, 'MOC_决策.md');
if (fs.existsSync(decMoc)) {
  const txt = fs.readFileSync(decMoc, 'utf8');
  const adrs = walk(decisionDir).filter((f) => /^ADR-\d+\.md$/.test(path.basename(f)));
  for (const a of adrs) {
    const id = path.basename(a).replace(/\.md$/, '');
    if (!txt.includes(id)) err(`决策 MOC 漏记 ${id}`);
  }
}

// ---------------------------------------------------------------------------
// 日志检查（规则 11、12、13、14、15、16、22、23）
// ---------------------------------------------------------------------------
for (const l of logFiles) {
  const content = fs.readFileSync(l.file, 'utf8');
  const r = rel(l.file);
  if (content.startsWith('---')) err(`日志不得有 frontmatter：${r}`);

  const hm = content.match(/^# 第(\d{3})次/m);
  if (!hm) err(`日志首行非 '# 第NNN次'：${r}`);
  else if (hm[1] !== String(l.num).padStart(3, '0')) err(`编号不一致：${r} 文件名 ${l.num} vs 标题 ${hm[1]}`);

  for (const h of ['已确认的决策', '检查与操作', '文件变更', '测试与验证', '问题、结果与下一步'])
    if (!content.includes(`## ${h}`)) err(`日志缺章节 ## ${h}：${r}`);

  const type = field(content, '对话类型');
  if (type !== l.cat) err(`对话类型不符目录：日志 ${r} 写「${type}」但位于 ${l.cat}`);

  const tags = field(content, '主题标签');
  if (!tags) err(`主题标签为空：${r}`);

  if (!content.includes('MOC_工作日志')) err(`日志未链接总 MOC：${r}`);
  if (!content.includes(`MOC_${l.cat}`)) err(`日志未链接分类 MOC：${r}`);

  const time = field(content, '时间');
  if (time) {
    const tm = time.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (!tm) err(`时间格式非法：${r} -> ${time}`);
  } else err(`日志缺时间：${r}`);
}

// 规则 12：编号连续
for (const c of CATS) {
  const nums = logFiles.filter((l) => l.cat === c).map((l) => l.num).sort((a, b) => a - b);
  for (let i = 0; i < nums.length; i++) if (nums[i] !== i + 1) { err(`分类 ${c} 编号不连续，缺 ${i + 1}`); break; }
}

// 规则 23：时间戳唯一
{
  const seen = new Map();
  for (const l of logFiles) {
    const time = field(fs.readFileSync(l.file, 'utf8'), '时间');
    if (!time) continue;
    const tm = time.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (!tm) continue;
    const ts = tm[1];
    if (!seen.has(ts)) seen.set(ts, []);
    seen.get(ts).push(rel(l.file));
  }
  for (const [ts, files] of seen) if (files.length > 1) err(`时间戳重复 ${ts}：${files.join('、')}`);
}

// 规则 21：源轮次覆盖率审计
{
  const counts = {};
  for (const l of logFiles) {
    const src = field(fs.readFileSync(l.file, 'utf8'), '源自原轮次');
    if (!src || src === '无') continue;
    for (const part of src.split(/[、,，\s]+/)) {
      const m = part.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
      if (!m) { err(`源自原轮次 格式异常：${rel(l.file)} -> ${part}`); continue; }
      const a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
      for (let i = a; i <= b; i++) counts[i] = (counts[i] || 0) + 1;
    }
  }
  for (let i = 1; i <= 45; i++) {
    if (!counts[i]) err(`源轮次 ${i} 未被任何日志覆盖`);
    else if (counts[i] > 1) err(`源轮次 ${i} 被 ${counts[i]} 篇日志重复覆盖`);
  }
  const maxCovered = Math.max(0, ...Object.keys(counts).map(Number));
  if (maxCovered > 45) err(`源轮次覆盖存在越界（>45）：最大 ${maxCovered}`);
}

// ---------------------------------------------------------------------------
// MOC 与表格检查（规则 17、18、19）
// ---------------------------------------------------------------------------
function tableLogLinks(absFile) {
  if (!fs.existsSync(absFile)) return [];
  const links = [];
  for (const line of fs.readFileSync(absFile, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\s*\|[\s:-]+\|\s*$/.test(line)) continue;
    const m = line.match(/\[\[([^\]]+)\]\]/);
    if (m) links.push(path.join(rootDir, linkTarget(m[1]) + '.md'));
  }
  return links;
}

const totalMoc = path.join(logDir, 'MOC_工作日志.md');
const totalLinks = tableLogLinks(totalMoc);
{
  const cnt = {};
  for (const p of totalLinks) cnt[p] = (cnt[p] || 0) + 1;
  for (const l of logFiles) {
    const n = cnt[l.file] || 0;
    if (n !== 1) err(`总 MOC 中日志出现 ${n} 次（应为1）：${rel(l.file)}`);
  }
}

for (const c of CATS) {
  const cm = path.join(logDir, c, `MOC_${c}.md`);
  if (!fs.existsSync(cm)) continue;
  const links = tableLogLinks(cm);
  const cc = {};
  for (const p of links) cc[p] = (cc[p] || 0) + 1;
  for (const l of logFiles.filter((x) => x.cat === c)) {
    const n = cc[l.file] || 0;
    if (n !== 1) err(`分类 MOC ${c} 中日志出现 ${n} 次（应为1）：${rel(l.file)}`);
  }
  for (const p of links) {
    if (!logFiles.some((l) => l.cat === c && l.file === p)) err(`分类 MOC ${c} 出现越界日志链接：${rel(p)}`);
  }
}

// 规则 18：排序
function cells(line) { return line.split('|').slice(1, -1).map((s) => s.trim()); }
if (fs.existsSync(totalMoc)) {
  const times = [];
  for (const line of fs.readFileSync(totalMoc, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|') || /^\s*\|[\s:-]+\|\s*$/.test(line)) continue;
    const cs = cells(line);
    const tm = (cs[1] || '').match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (tm) times.push(tm[1]);
  }
  for (let i = 0; i < times.length - 1; i++)
    if (times[i] < times[i + 1]) err(`总 MOC 时间非倒序：行${i + 1} ${times[i]} < 行${i + 2} ${times[i + 1]}`);
}
for (const c of CATS) {
  const cm = path.join(logDir, c, `MOC_${c}.md`);
  if (!fs.existsSync(cm)) continue;
  const nums = [];
  for (const line of fs.readFileSync(cm, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|') || /^\s*\|[\s:-]+\|\s*$/.test(line)) continue;
    const m = line.match(/第(\d{3})次/);
    if (m) nums.push(parseInt(m[1], 10));
  }
  for (let i = 0; i < nums.length - 1; i++)
    if (nums[i] < nums[i + 1]) err(`分类 MOC ${c} 编号非倒序：行${i + 1} ${nums[i]} < 行${i + 2} ${nums[i + 1]}`);
}

// 规则 19：表格内别名转义
for (const f of allMd) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const inner = m[1];
      if (inner.includes('|') && !inner.includes('\\|'))
        err(`表格内 wiki-link 别名未转义（应写作 \\|）：${rel(f)} -> ${line.trim().slice(0, 60)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 结果输出
// ---------------------------------------------------------------------------
const logPaths = new Set(logFiles.map((l) => l.file));
const kpCount = allMd.filter((f) => !logPaths.has(f)).length;
let linkCount = 0;
for (const f of allMd) linkCount += fileLinks(f).length;

if (errors.length) {
  console.error(`\nWiki 校验失败，共 ${errors.length} 项：\n`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
} else {
  console.log(`Wiki 校验通过：知识页 ${kpCount} 个，日志 ${logFiles.length} 篇，链接 ${linkCount} 条`);
}
