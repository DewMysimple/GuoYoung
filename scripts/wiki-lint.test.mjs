import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { lintWiki } from './wiki-lint.mjs';

const categories = ['功能添加', 'UI修改', 'Bug处理', '工程讨论', '测试验证', '工程维护'];
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mysimple-wiki-lint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const logDir = path.join(root, 'wiki_memory', '日志');
  const logs = categories.map((category, index) => {
    const target = path.join(logDir, category, '第001次.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const text = `# 第001次\n\n- 时间：2026-08-09 14:00:0${index}（北京时间）\n- 对话类型：${category}\n- 主题标签：迁移、验证\n- 源自原轮次：${index === 0 ? '1-45' : '无'}\n- 本轮目标：验证历史保全\n- 日志索引：[[日志/MOC_工作日志|工作日志 MOC]]\n- 分类索引：[[日志/MOC_工作日志#${category}|${category}]]\n- 相关知识：无\n\n${['已确认的决策', '检查与操作', '文件变更', '测试与验证', '问题、结果与下一步'].map((heading) => `## ${heading}\n\n已核对。`).join('\n\n')}\n`;
    fs.writeFileSync(target, text);
    return target;
  });
  const moc = path.join(logDir, 'MOC_工作日志.md');
  fs.writeFileSync(moc, '| 日志 |\n| --- |\n' + [...logs].reverse().map((target) => `| [第001次](${encodeURI(path.relative(logDir, target).split(path.sep).join('/'))}) |`).join('\n'));
  return { root, logs, moc };
}

test('migrated numbered logs use one generated Markdown index without rewriting history', (t) => {
  const { root } = fixture(t);
  assert.deepEqual(lintWiki(root).errors, []);
});

test('new numbered logs retain category sequence and exact timestamp order', (t) => {
  const { root, logs, moc } = fixture(t);
  const next = path.join(path.dirname(logs[5]), '第002次.md');
  fs.writeFileSync(next, fs.readFileSync(logs[5], 'utf8').replace('# 第001次', '# 第002次').replace('2026-08-09 14:00:05', '2026-10-30 19:00:00'));
  fs.writeFileSync(moc, fs.readFileSync(moc, 'utf8').replace('| --- |', '| --- |\n| [第002次](工程维护/第002次.md) |'));
  assert.deepEqual(lintWiki(root).errors, []);
});

test('duplicate source coverage and timestamps remain errors after migration', (t) => {
  const { root, logs } = fixture(t);
  fs.writeFileSync(logs[1], fs.readFileSync(logs[1], 'utf8').replace('源自原轮次：无', '源自原轮次：45').replace('14:00:01', '14:00:00'));
  const result = lintWiki(root);
  assert(result.errors.some((message) => message.includes('时间戳重复')));
  assert(result.errors.some((message) => message.includes('源轮次 45 被 2')));
});

test('one total index rejects duplicate registration and chronological inversions', (t) => {
  const { root, moc } = fixture(t);
  const first = fs.readFileSync(moc, 'utf8').split('\n')[2];
  fs.appendFileSync(moc, '\n' + first);
  const result = lintWiki(root);
  assert(result.errors.some((message) => message.includes('出现 2 次')));
  assert(result.errors.some((message) => message.includes('时间非倒序')));
});

test('missing structure, classification drift and competing category indexes fail', (t) => {
  const { root, logs } = fixture(t);
  fs.writeFileSync(logs[0], fs.readFileSync(logs[0], 'utf8').replace('## 测试与验证', '## 验证').replace('对话类型：功能添加', '对话类型：工程维护'));
  fs.writeFileSync(path.join(path.dirname(logs[0]), 'MOC_功能添加.md'), '# 旧分类导航');
  const result = lintWiki(root);
  assert(result.errors.some((message) => message.includes('日志缺章节')));
  assert(result.errors.some((message) => message.includes('对话类型不符')));
  assert(result.errors.some((message) => message.includes('不再维护独立导航')));
});

test('superseded decisions require replacement and table aliases stay escaped', (t) => {
  const { root } = fixture(t);
  const decisions = path.join(root, 'wiki_memory', '决策');
  fs.mkdirSync(decisions);
  fs.writeFileSync(path.join(decisions, 'ADR-001.md'), '---\nstatus: superseded\n---\n\n| [[决策/ADR-002|新决定]] |');
  const result = lintWiki(root);
  assert(result.errors.some((message) => message.includes('缺 superseded_by')));
  assert(result.errors.some((message) => message.includes('别名未转义')));
});
