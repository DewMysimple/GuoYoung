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

## 玻璃交互的整屏逐帧诊断

`page.screenshot()` 和浏览器录屏会触发画面回读，不能单独作为远端闪线的验收证据。Windows 上可使用真实鼠标、桌面无损录制与每帧双热力图：

```powershell
$env:CAPTURE_STATE = 'C:\fixtures\export.json'
$env:CAPTURE_WALLPAPER = 'C:\fixtures\wallpaper.png'
$env:CAPTURE_BASE_URL = 'http://127.0.0.1:4173'
$env:CAPTURE_OUTPUT = 'artifacts/working/glass-desktop'
$env:CAPTURE_DDA = '1'
node scripts/capture-glass-desktop.mjs
python scripts/analyze-glass-desktop.py artifacts/working/glass-desktop
```

需要已启动的页面、含分组导航和至少八张卡片的导出配置、Edge、PATH 中的 FFmpeg，以及 Python 的 OpenCV / NumPy。当前录制尺寸固定为 1920×1006，浏览器视口为 1920×926；桌面必须容纳该尺寸。`CAPTURE_EXTENSION=1` 改用隔离配置文件加载 `dist-extension`；省略 `CAPTURE_DDA` 使用 GDI 桌面采集作交叉核对。

- 实验使用隔离浏览器数据，不写回传入配置或壁纸；输入文件与录制资料不提交。录制时保持实验窗口在前台，守护进程发现切换窗口会令本次录制无效。
- 录制前用原生鼠标与 DOM `pointermove` 校准视口偏移并复核第二个坐标；报告保留 `pointerCalibration`。某些 Chromium 的原生窗口坐标不含顶栏高度，未经校准的“无变化”不能证明卡片实际被经过。
- `desktop.mkv` 为无损录制；`report.json` 记录几何、鼠标命令和实际页面鼠标事件。录制过程中不调用页面截图。
- `heatmaps/` 对解码出的每一帧输出整屏 PNG：左侧对比录制首帧，右侧对比上一帧。任意非零色差均增强显示，不用容差隐藏变化。
- `heatmap-viewer.html` 可直接本地打开，支持逐帧滑动、方向键和播放。鼠标时间若只能近似对齐，会在页面中注明。
- `heatmap-report.json` 同时记录整屏差异和远端统计。远端统计排除实际遍历的左侧卡片、左侧导航及异步图标；**热力图本身不排除任何像素**。分析命令检测到远端变化返回 1，表示需要调查，并不自动判定所有变化都是同一个缺陷。
- 原版复现、候选样式与最终产品应使用不同输出目录；不能把单个裁剪区域归零当作整屏通过，也不能把实验候选归零当作滚动、折射、设置及扩展模式均已验证。
- `CAPTURE_SCROLL_Y=550` 可在录制前滚动，脚本只遍历完整可见卡片。浏览器左下角的链接地址提示仍保留在热力图与原统计中；若产生差分，须记录位置和归因，不能直接把它说成页面闪影或把原统计改成零。
- 显式壁纸材质使用普通 SVG filter。`read-glass-material.mjs` 读取实际滤镜图，光学回归另外检查真实条纹模糊和边缘折射，防止滤镜失效造成“远端无变化”的假通过。
