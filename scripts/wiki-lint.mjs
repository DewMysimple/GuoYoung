#!/usr/bin/env node
/* Project-specific checks. Generic schema, references and readiness: memory.py check. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CATS = ['功能添加', 'UI修改', 'Bug处理', '工程讨论', '测试验证', '工程维护'];
const HEADINGS = ['已确认的决策', '检查与操作', '文件变更', '测试与验证', '问题、结果与下一步'];
const field = (content, label) => content.match(new RegExp(`^(?:- )?${label}：(.*)$`, 'm'))?.[1].trim();
const stripCode = (text) => text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`[^`]*`/g, '');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(target) : entry.name.endsWith('.md') ? [target] : [];
  });
}

function parseFM(content) {
  const yaml = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  return Object.fromEntries([...yaml.matchAll(/^([\w-]+):\s*(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
}

function tableLogLinks(content, moc, memoryDir) {
  const targets = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    for (const match of line.matchAll(/\[\[([^\]]+)\]\]|(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      let target;
      if (match[1]) {
        target = match[1].split('|')[0].replace(/\\$/, '').split('#')[0].trim();
        if (!target.endsWith('.md')) target += '.md';
        targets.push(path.resolve(memoryDir, target));
      } else {
        try { target = decodeURIComponent(match[2].split('#')[0]); }
        catch { continue; } // memory.py reports malformed references.
        if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) targets.push(path.resolve(path.dirname(moc), target));
      }
    }
  }
  return targets;
}

export function lintWiki(rootDir) {
  const memoryDir = path.join(rootDir, 'wiki_memory');
  const logDir = path.join(memoryDir, '日志');
  const errors = [];
  const err = (message) => errors.push(message);
  const rel = (target) => path.relative(rootDir, target);
  if (!fs.existsSync(memoryDir)) return { errors: [`未找到 wiki_memory 目录：${memoryDir}`], logs: 0 };
  if (fs.existsSync(path.join(rootDir, 'Wiki'))) err('旧 Wiki 目录仍存在；工程只能保留一个有效记忆根');

  for (const category of CATS) {
    if (!fs.existsSync(path.join(logDir, category))) err(`缺少日志分类目录：${category}`);
  }
  const logs = [];
  for (const target of walk(logDir)) {
    const parts = path.relative(logDir, target).split(path.sep);
    if (parts.length === 1 && parts[0] === 'MOC_工作日志.md') continue;
    if (parts.length !== 2 || !CATS.includes(parts[0])) {
      err(`日志出现在非约定位置：${rel(target)}`);
      continue;
    }
    if (/^(?:MOC_|README\.md$)/.test(parts[1])) {
      err(`分类目录不再维护独立导航：${rel(target)}`);
      continue;
    }
    const content = fs.readFileSync(target, 'utf8');
    const title = content.match(/^# 第(\d{3})次(?:\r?\n|$)/);
    const numberedName = parts[1].match(/^第(\d{3})次\.md$/);
    if (!numberedName) err(`日志文件名非法：${rel(target)}`);
    if (content.startsWith('---')) err(`日志不得有 frontmatter：${rel(target)}`);
    if (!title) err(`日志首行非 '# 第NNN次'：${rel(target)}`);
    else if (numberedName && title[1] !== numberedName[1]) err(`日志编号与文件名不一致：${rel(target)}`);
    for (const heading of HEADINGS) {
      if (!new RegExp(`^## ${heading}\\s*$`, 'm').test(content)) err(`日志缺章节 ## ${heading}：${rel(target)}`);
    }
    const category = parts[0];
    if (field(content, '对话类型') !== category) err(`对话类型不符目录：${rel(target)}`);
    for (const label of ['主题标签', '源自原轮次', '本轮目标', '日志索引', '分类索引', '相关知识']) {
      if (!field(content, label)) err(`日志缺少 ${label}：${rel(target)}`);
    }
    if (!field(content, '日志索引')?.includes('MOC_工作日志')) err(`日志未链接总 MOC：${rel(target)}`);
    if (!field(content, '分类索引')?.includes('MOC_工作日志')) err(`分类索引须链接唯一总 MOC 的分类锚点：${rel(target)}`);
    const time = field(content, '时间')?.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
    if (!time) err(`时间格式非法或缺失：${rel(target)}`);
    logs.push({ path: target, content, category, number: title ? Number(title[1]) : null, time });
  }

  // Historical category identities and reconstructed source rounds must survive migration.
  for (const category of CATS) {
    const numbers = logs.filter((log) => log.category === category && log.number !== null)
      .map((log) => log.number).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) { err(`分类 ${category} 编号不连续或重复，预期 ${i + 1}`); break; }
    }
  }
  const seenTimes = new Map();
  const rounds = new Map();
  for (const log of logs) {
    if (log.time) {
      if (seenTimes.has(log.time)) err(`时间戳重复 ${log.time}：${rel(seenTimes.get(log.time))}、${rel(log.path)}`);
      seenTimes.set(log.time, log.path);
    }
    const source = field(log.content, '源自原轮次');
    if (!source || source === '无') continue;
    for (const part of source.split(/[、,，\s]+/)) {
      const match = part.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
      if (!match) { err(`源自原轮次格式异常：${rel(log.path)} -> ${part}`); continue; }
      const first = Number(match[1]), last = Number(match[2] ?? match[1]);
      if (first < 1 || last > 45 || last < first) { err(`源自原轮次越界：${rel(log.path)} -> ${part}`); continue; }
      for (let round = first; round <= last; round++) rounds.set(round, (rounds.get(round) ?? 0) + 1);
    }
  }
  for (let round = 1; round <= 45; round++) {
    const count = rounds.get(round) ?? 0;
    if (count !== 1) err(`源轮次 ${round} 被 ${count} 篇日志覆盖（应为1）`);
  }

  const totalMoc = path.join(logDir, 'MOC_工作日志.md');
  if (!fs.existsSync(totalMoc)) err('缺少日志/MOC_工作日志.md');
  else {
    const targets = tableLogLinks(fs.readFileSync(totalMoc, 'utf8'), totalMoc, memoryDir);
    const logByPath = new Map(logs.map((log) => [log.path, log]));
    for (const log of logs) {
      const count = targets.filter((target) => target === log.path).length;
      if (count !== 1) err(`总 MOC 中日志出现 ${count} 次（应为1）：${rel(log.path)}`);
    }
    const registeredLogs = targets.map((target) => logByPath.get(target)).filter(Boolean);
    for (let i = 0; i + 1 < registeredLogs.length; i++) {
      const current = registeredLogs[i], next = registeredLogs[i + 1];
      if (current.time && next.time && current.time < next.time) err(`总 MOC 时间非倒序：${rel(current.path)} < ${rel(next.path)}`);
    }
  }

  for (const target of walk(path.join(memoryDir, '决策'))) {
    if (!/^ADR-\d+(?:-.+)?\.md$/.test(path.basename(target))) continue;
    const fm = parseFM(fs.readFileSync(target, 'utf8'));
    if (fm.status === 'superseded' && !fm.superseded_by) err(`ADR 标记 superseded 但缺 superseded_by：${rel(target)}`);
  }
  for (const target of walk(memoryDir)) {
    for (const line of stripCode(fs.readFileSync(target, 'utf8')).split(/\r?\n/)) {
      if (!line.trim().startsWith('|')) continue;
      for (const match of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
        if (/(?<!\\)\|/.test(match[1])) err(`表格内 wiki-link 别名未转义（应写作 \\|）：${rel(target)}`);
      }
    }
  }
  return { errors, logs: logs.length };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const rootDir = path.resolve(path.dirname(thisFile), '..');
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== '--require-ready')) {
    console.error('用法：npm.cmd run lint:wiki [-- --require-ready]');
    process.exitCode = 2;
  } else {
    const check = spawnSync('python', [path.join(rootDir, 'wiki_memory', '工具', 'memory.py'),
      'check', '--project', rootDir, ...(flags.includes('--require-ready') ? ['--require-ready'] : [])],
    { stdio: 'inherit', windowsHide: true });
    if (check.error) {
      console.error(`无法运行记忆检查（需要 Python 3.10+）：${check.error.message}`);
      process.exitCode = 1;
    } else if (check.status !== 0) process.exitCode = check.status ?? 1;
    else {
      const result = lintWiki(rootDir);
      if (result.errors.length) {
        console.error(`Wiki 项目校验失败，共 ${result.errors.length} 项：`);
        for (const error of result.errors) console.error('  ✗ ' + error);
        process.exitCode = 1;
      } else console.log(`Wiki 项目校验通过：日志 ${result.logs} 篇，历史覆盖 1–45，单一日志索引`);
    }
  }
}
