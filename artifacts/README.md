# artifacts 目录约定

本目录保存本地构建交付物、真实浏览器验收资料和临时诊断素材。除扩展交付项外，正式验收资料按扩展版本归档。

## 固定交付路径

- `site-hub-extension/`：可直接在扩展管理页加载的解压目录。该目录保持在 `artifacts` 根目录。
- `site-hub-extension.zip`：扩展安装包。打包脚本继续覆盖此固定路径。

## GitHub Release 发布

扩展安装包通过 GitHub Release 发布，不把构建产物塞进源码提交历史：

1. 更新 `public/manifest.json` 的版本号并提交源码。
2. 在提交上创建同版本标签，例如 `git tag v1.1.20`，再执行 `git push origin v1.1.20`。
3. `.github/workflows/publish-extension.yml` 会在 Windows runner 上执行依赖安装、扩展构建和打包，并将 `site-hub-extension.zip` 上传为对应 Release 的资产。

也可以在 GitHub 的 **Actions → Publish extension release → Run workflow** 手动运行；手动运行会读取当前 manifest 版本并创建或更新对应 Release。解压目录仅用于本地“加载已解压的扩展”，不会上传到 Release，也不会被 Git 跟踪。

## 正式验收资料

```text
releases/
└─ v<manifest.version>/
   ├─ screenshots/
   └─ recordings/
```

- PNG 截图放入 `screenshots/`。
- WEBM 录屏放入 `recordings/`。
- 文件名描述场景，不必重复版本号；版本以父目录为准。
- `scripts/capture.mjs` 和 E2E 截图会读取 `public/manifest.json`，自动写入当前版本目录。

## 历史与临时资料

- `legacy/screenshots/`：早期未带扩展版本号的正式截图。
- `working/raw-recordings/`：Playwright 原始录屏和未裁剪诊断素材，仅供回查。
- `working/logs/`：本地视觉巡检服务器日志。

历史 Wiki 日志是封存记录，其中的旧 `artifacts/<文件名>` 路径不回写；可按文件名在 `releases/` 或 `legacy/` 中定位。
