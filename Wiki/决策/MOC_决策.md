---
type: moc
status: active
created: 2026-08-09
updated: 2026-08-09
tags:
  - adr
  - moc
---

# 决策 MOC

[[Wiki/MOC_项目知识|← 返回项目知识 MOC]]

> 本工程所有已确认架构/接口/约束决策的索引。一篇一决定；已接受不改写；变更时新增 ADR 并双向标注 supersedes / superseded_by。

| ADR | 标题 | 状态 | 支撑日志 |
| --- | --- | --- | --- |
| [[Wiki/决策/ADR-001\|ADR-001]] | 采用 React 19 + Vite 7 + Tailwind v4 的无状态库单页工作台 | accepted | [[Wiki/日志/功能添加/第001次\|功能添加·第001次]] |
| [[Wiki/决策/ADR-002\|ADR-002]] | 单一源码经 `--mode extension` 双模式构建 | accepted | [[Wiki/日志/功能添加/第005次\|功能添加·第005次]] |
| [[Wiki/决策/ADR-003\|ADR-003]] | 存储键恒为 `site-hub:v1`，版本写入 state 内部并逐级迁移 | accepted | 功能添加·第001/003/006/009/011/012次 |
| [[Wiki/决策/ADR-004\|ADR-004]] | 图标采用七级自动回退链与 64px 高清门槛 | accepted | 功能添加·第008次、Bug处理·第004次、工程讨论·第001次 |
| [[Wiki/决策/ADR-005\|ADR-005]] | 分组视图采用单行横向轨道 | superseded | [[Wiki/日志/功能添加/第011次\|功能添加·第011次]] |
| [[Wiki/决策/ADR-006\|ADR-006]] | 分组视图改为自适应换行网格并禁用 100vw | accepted | [[Wiki/日志/Bug处理/第005次\|Bug处理·第005次]] |
| [[Wiki/决策/ADR-007\|ADR-007]] | 拖拽以 50px 直线距离为唯一判定阈值 | accepted | 功能添加·第004/008次、Bug处理·第006次 |
| [[Wiki/决策/ADR-008\|ADR-008]] | 拖拽采用冻结槽位快照、18px 滞回与独立落点意图 | accepted | Bug处理·第007/008/009次、工程讨论·第002次 |
| [[Wiki/决策/ADR-009\|ADR-009]] | 高级微调只开放几何参数，颜色统一由主题色管理 | accepted | [[Wiki/日志/功能添加/第012次\|功能添加·第012次]] |
| [[Wiki/决策/ADR-010\|ADR-010]] | 锁定 framer-motion 精确版本并 override motion-dom | accepted | [[Wiki/日志/Bug处理/第003次\|Bug处理·第003次]] |
| [[Wiki/决策/ADR-011\|ADR-011]] | 大改动走两段式协作，037 轮起每轮出 ZIP 并递增版本 | accepted | 功能添加·第013次、Bug处理·第006/008次 |
| [[Wiki/决策/ADR-012\|ADR-012]] | 采用分层 Wiki 与六分类独立编号日志 | accepted | 工程讨论·第003次、工程维护·第001次 |

## 相关页面

- [[Wiki/MOC_项目知识|项目知识 MOC]]
- [[Wiki/工作流与记忆维护|工作流与记忆维护]]
