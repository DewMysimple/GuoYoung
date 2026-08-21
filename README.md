# Mysimple · 网站收藏（site-hub）

一个可高度自定义的**本地网站收藏新标签页**。同一个 React 源码既可作为网页（`dist/`）使用，也可打包为 Chrome / Edge 的 MV3 扩展（`dist-extension/`）接管浏览器新标签页。所有数据只保存在本地浏览器，无后端、无账号。

## 两种形态

| 形态 | 产物 | 入口 | 适用场景 |
| --- | --- | --- | --- |
| 网页版 | `dist/` | 任意静态服务器 / 双击 `启动网站.bat`（Windows） | 本地当作起始页 |
| 扩展版 | `dist-extension/` | 浏览器扩展管理页加载，接管新标签页 | 打开新标签页即用 |

两套产物由同一源码经不同构建模式生成（见下方「常用命令」）。

## 技术栈

- React 19 + TypeScript + Vite 7 + Tailwind v4（Vite 插件形式，无独立 config）
- 拖拽：`@dnd-kit/core` + `@dnd-kit/sortable`
- 动效：`framer-motion`（**精确锁定 `12.23.12`**，见 `package.json` 的 `overrides`）
- 图标：`@phosphor-icons/react` + `simple-icons`
- 测试：vitest（单元）+ @playwright/test（E2E）
- 状态集中在自研 hook（`src/lib/use-site-hub.ts`），不引入 Redux / Zustand

## 快速开始

```bash
npm install
npm run dev          # 开发服务器（端口 5173）
```

Windows 用户也可直接双击 `启动网站.bat`。

## 常用命令

| 命令 | 说明 | 产出 |
| --- | --- | --- |
| `npm run dev` | 开发服务器 | `http://localhost:5173` |
| `npm run build` | 类型检查 + 网页版生产构建 | `dist/` |
| `npm run build:extension` | 类型检查 + 扩展版生产构建 | `dist-extension/` |
| `npm run package:extension` | 构建扩展并打包为 ZIP（PowerShell） | `artifacts/*.zip` |
| `npm run preview` | 预览网页版构建产物 | 本地静态预览 |
| `npm test` | 运行单元测试用例（vitest） | 控制台报告 |
| `npm run test:watch` | 单元测试监听模式 | — |
| `npm run test:e2e` | 运行 Playwright E2E | `playwright-report/` |
| `npm run lint:wiki` | 校验工程记忆 Wiki 完整性 | 控制台报告 |

## 端口说明

- 开发与 `start-site-hub.vbs` 使用 **5173**。
- Playwright E2E 使用 **4173**（baseURL `127.0.0.1:4173`）。
- 两套端口互不冲突，不要混用。

## 目录结构导览

```
WebPage/
├─ src/                  # 应用源码（App.tsx / components/ / lib/）
├─ scripts/             # wiki-lint.mjs、package-extension.ps1 等
├─ Wiki/                # 工程记忆（见下方「工程记忆」）
├─ dist/                # 网页版构建产物
├─ dist-extension/      # 扩展版构建产物
├─ README.md            # 本文件
├─ AGENTS.md            # AI 协作契约（Agent 必读）
├─ EXTENSION_INSTALL.md # 扩展安装指引
├─ package.json
└─ .gitignore
```

## 扩展安装

参见 [`EXTENSION_INSTALL.md`](./EXTENSION_INSTALL.md)。改动扩展相关代码后，需重新构建并**到扩展管理页点「重新加载」**才能生效（无热更新）。

## 数据与隐私

- 全部数据保存在本地：网页版用 `localStorage`，扩展版用 `chrome.storage.local`，存储键恒为 **`site-hub:v1`**。
- 不申请全站读取权限；图标获取依赖 `favicon` 权限与七级回退链。
- 支持导出 / 导入为自描述 JSON，便于备份与迁移。

## 测试

- 单元：约 14 个测试文件、89 例（vitest，`npm test`）。
- E2E：Playwright 25 条 test × 2 project（chromium + Pixel 7 移动端），口径见 `Wiki/测试与验证基线.md`。
- 拖拽、图标、布局等关键路径均有回归用例。

## 已知限制

- 原生新标签页的搜索框不可嵌入，搜索委托给浏览器搜索引擎。
- 无痕窗口不接管新标签页；扩展无法自行固定到工具栏（均为浏览器平台限制）。
- 发版目前全手工，无 CI。
- 三处版本号尚未统一：`package.json` 1.0.0 / `public/manifest.json` 1.1.5 / `dist/manifest.json` 1.1.0。

## 工程记忆

本项目配套一套可持久化的工程记忆 Wiki，位于 `Wiki/`：

- **新人 / 新 Agent 接手**：先读 [`AGENTS.md`](./AGENTS.md)，再读 [`Wiki/MOC_项目知识.md`](./Wiki/MOC_项目知识.md)。
- 记忆分层：源码/测试为事实层，`Wiki/日志` 为不可改写事件层，其余 `Wiki/` 为可修订知识层（含 12 篇 ADR 与 9 个主题页）。
- 每次协作后按要求写日志，并提交前跑 `npm run lint:wiki`。
