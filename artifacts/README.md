# artifacts 目录约定

本目录保存本地构建交付物、真实浏览器验收资料和临时诊断素材。除扩展交付项外，正式验收资料按扩展版本归档。

## 正式开发目录

唯一正式工程根目录为 `E:/Software Development/WebPage`。按用户要求直接安全迁移，27项过渡链接和C盘临时数据副本已移除；原 `C:/Users/Administrator/Desktop/WebPage` 仅剩0子项的普通空目录，无链接、源码或缓存，不再作为工程入口。删除该空目录被自动审核拒绝，未返回理由，未继续重试。编辑、运行命令和新工作区使用E盘。浏览器原C路径登记的扩展需从 `E:/Software Development/WebPage/artifacts/site-hub-extension` 加载已解压扩展，浏览器配置文件保持。新路径已通过完整回归、双构建及真实浏览器截图，开发区约0.30GiB；详见本轮日志。

## 固定交付路径

- `site-hub-extension/`：可直接在扩展管理页加载的解压目录。该目录保持在 `artifacts` 根目录。
- `site-hub-extension.zip`：扩展安装包。打包脚本继续覆盖此固定路径。

`npm.cmd run package:extension`（`buildStart.cmd` 调用此命令）先构建 `dist-extension`，再删除并重建固定解压目录、从构建目录复制文件，最后生成 ZIP。ZIP 文件本身不会自动解压或更新安装目录。当前脚本不保留旧资源；第018次为兼容已打开页面而保留3个旧资源，是当轮手动覆盖复制的交付方式。

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

- `legacy/screenshots/`：早期未带扩展版本号的正式截图，已在本轮移到下述外部归档。
- `working/raw-recordings/`：Playwright 原始录屏和未裁剪诊断素材，仅供回查。
- `working/logs/`：本地视觉巡检服务器日志。

历史 Wiki 日志是封存记录，其中的旧路径不回写。2026-10-04 第019次将当前 1.2.34 以外的 `artifacts/releases` 版本资料、`artifacts/legacy` 以及 `.codex-video-review` 移出开发区；共 12,985 文件 / 6,124,650,709 字节，逐文件 SHA256 核验一致。

归档根目录为 `D:/Mysimple-diagnostics/2026-10-04/workspace-migration/archive`，保留工程内原相对路径。例如旧 `artifacts/releases/v1.2.32/site-hub-extension.zip` 位于归档根目录下同一路径。逐文件清单为其父目录的 `archive-manifest.json`；迁移前盘点、复制核验和迁移中临时链接记录也位于该诊断目录，临时链接记录不代表长期开发入口。更早第017次 working 归档仍在原诊断目录，按该轮日志映射定位，不重复搬移。

开发区继续保留当前 `releases/v1.2.34`、固定解压目录/ZIP 和有用途的 working 工具。详见 [工程维护·第019次](../Wiki/日志/工程维护/第019次.md)。

### 清理 working

清理前先确认运行依赖与归档用途。原始录屏、失败证据、报告和复现脚本先在工作目录外归档，核对文件数量、大小与 SHA-256 后再移除原件；可重新生成的热力图、缓存和过期构建可以删除。目录链接和文件链接只移除入口，不递归操作链接目标。

2026-10-04第017次清理结束时，working仅保留审核服务native-backdrop-review与两项巡检工具使用的wallpaper-inventory.json。之后第046次新增native-flash-current复现脚本12文件/25,333bytes，已逐文件SHA256一致归档至D:/Mysimple-diagnostics/2026-10-04/native-flash/final-helpers，清单为同诊断根目录final-helper-manifest.json；递归及明确12个LiteralPath文件删除均被自动审核拒绝，未返回理由，原件保留且不再重试。第019次迁移继续保留这约25KB脚本，working当前为审核服务、壁纸索引及native-flash-current三项。旧相对路径归档映射见 [工程维护·第017次](../Wiki/日志/工程维护/第017次.md)，复现资料见 [Bug处理·第046次](../Wiki/日志/Bug处理/第046次.md)，旧版本资料本轮归档见上节。

## 玻璃交互的整屏逐帧诊断

1.2.34保留卡片宿主原生背景模糊，以根中性filter、有限小前景提示与普通来源堆叠顺序处理远端变化；拖拽来源/目标/浮层沿用普通卡片材质，网站归位来源保持可见。授权的同机已录场景与工程回归通过，继续同配置开发审核，后续已补交1.2.34安装包，见 [工程维护·第018次](../Wiki/日志/工程维护/第018次.md)；实测口径见 [测试与验证基线](../Wiki/测试与验证基线.md)，候选与最后生产结果分别记录于 [Bug处理·第046次](../Wiki/日志/Bug处理/第046次.md)。

`page.screenshot()` 和浏览器录屏会触发画面回读，不能单独作为远端闪线的验收证据。Windows 上可使用真实鼠标、桌面无损录制与每帧双热力图：

```powershell
$env:CAPTURE_STATE = 'C:\fixtures\export.json'
$env:CAPTURE_WALLPAPER = 'C:\fixtures\wallpaper.png'
$env:CAPTURE_BASE_URL = 'http://127.0.0.1:4173'
$env:CAPTURE_OUTPUT = 'D:\Mysimple-diagnostics\glass-desktop'
$env:CAPTURE_DDA = '1'
node scripts/capture-glass-desktop.mjs
python scripts/analyze-glass-desktop.py D:\Mysimple-diagnostics\glass-desktop
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
- 当前可见壁纸为实际 img，卡片、拖动浮层与普通控件直接使用原生背景滤镜。`read-glass-material.mjs` 检查宿主实际 backdrop-filter 和可选折射位移图，不从旧逐卡 feImage/profile 或 WallpaperSource 变量读取壁纸来源。历史报告中的 wallpaper sampling 和多 blur pass 来源于 1.2.32 CSS 绘制路径，不作为当前机制。光学回归仍需另外检查真实条纹模糊和边缘折射，防止滤镜失效造成“远端无变化”的假通过。

## 滚动后材质延迟与性能

整屏热力图不能区分正常滚动与材质迟到。对此使用两个独立证据：

- `CAPTURE_SCENARIO=scroll-return` 使桌面录制脚本发送原生滚轮消息，大幅离开首排后返回并停留；支持平铺配置，不要求分组导航。录制器输出第一帧后才开始输入，报告保留实际 `scrollY` 时间线。单次滚轮可能被浏览器限制为一屏，因此返回阶段发送两次；必须检查最终滚动位置，不能仅按发送量推断。
- `scripts/analyze-glass-settling.py` 在每个视频帧中跟踪固定标记，用相对坐标采样不含文字的玻璃区域。输出全部帧 JSON、位置与材质变化曲线，统计位置停止后材质相对本段末帧何时稳定。默认模板匹配至少 0.93，材质区域 9×9 平滑降低编码噪声，平均 RGB 差异阈值为 1/255；这些参数全部写入报告。稳定错误也可能得到 0ms，单个区域的结果不能外推为全屏正确。

```powershell
python scripts/analyze-glass-settling.py capture.mp4 reference.png artifacts/working/settling `
  --template 98 221 22 22 --search 85 175 50 865 --patch 92 40 30 55
```

模板与搜索范围是像素坐标 `x y width height`；`--patch` 的前两项是相对已定位标记的偏移。上述坐标仅为示例，需按本次录制确定。标记应在整个序列中保持相同，优先使用稳定标题文字，避免晚加载 favicon；材质区域应避开文字、按钮、鼠标与异步图标。通过原画面确认匹配和异常，不把有损视频编码噪声直接当作材质问题。

需要验证“大幅返回是否恢复初始像素”时，先将上述跟踪输出写入 `<capture>/card-0/settling-report.json`，再执行：

```powershell
python scripts/analyze-glass-return.py artifacts/working/glass-desktop
```

- 该目录须包含同次采集的 `desktop.mkv`、`report.json` 和跟踪报告；可用 `--tracking` 指定相对目录内的其他跟踪报告。需有初始静止段及两次回到相同标记位置的完整停留段，每段至少 45 个解码帧；初始参考尾窗必须连续 45 帧原始像素相同。
- 以初始静止段末帧为参考，首排每卡默认取右侧 28×48 安静材质区域；对每个返回帧比较原始无损 RGB，无空间平滑、通道容差为 0。输出 `raw-return.json` 与 `raw-return-filmstrip.png`，保留每帧平均差、最大差和变化通道数。
- 恢复要求末尾连续至少 45 个解码帧与初始参考相同；末帧不同或尾窗不足会记为 `recovered=false`、`strictSettlingMs=null`，不会把“稳定但错误”判为正确。工具从 ffprobe 读取完整递增 PTS，用实际显示时间差报告毫秒，并保留 nominal 帧率换算；到达前必须有可信的不同标记，离开过程必须可定位，且首个返回时间间隔不超过 1.5 个 nominal 帧，否则到达延迟不可测。缺失/不一致标记、可能漏过首个返回帧或未恢复令分析以非零状态结束。
- 报告保留各尾窗帧数、时间与最大间隔；到达间隔检查不保证整个录制绝无丢帧，45 解码帧也不能脱离 PTS 外推为固定墙钟时长。工具另检查解码帧数与跟踪一致、ROI 不越界。默认 ROI 对应密集桌面夹具，必须用原图/拼图确认没有文字、按钮、鼠标和异步内容；其他布局不能直接沿用结论。
- 该工具只分析已录制像素，不验证前台窗口、指针命中、浏览器版本或实际磨砂生效；必须结合录制守卫、光学阳性控制和远端悬停检查。跟踪结果也不能与另一段视频混用。

`node scripts/capture-glass-performance.mjs` 复用 `CAPTURE_STATE`、`CAPTURE_WALLPAPER`、`CAPTURE_BASE_URL`、`CAPTURE_OUTPUT` 和 `CAPTURE_EXTENSION=1`，测量悬停、小幅滚动和大幅往返的 rAF 帧间隔、长任务、脚本/样式/布局耗时。`CAPTURE_TRACE=1` 另存 Chromium 性能追踪，提取追踪文件的耗时不计入测量。`CAPTURE_EXTENSION_DIR` 可选择已归档扩展，进行相同配置的版本对照。不要同时执行其他浏览器验收污染性能样本。

- `CAPTURE_ACTIONS=hover,scroll,large-return` 可选择动作。
- `CAPTURE_MODES=baseline,no-filter` 提供当前有效的因果对照；baseline 为正常绘制，no-filter 只关闭网站卡片的 filter/backdrop-filter。旧逐卡更新链已移除，freeze / freeze-no-filter 不再支持。关闭滤镜会改变实际材质，只能辅助归因，不能作为修复或视觉正确性证明。
- 真实网页与扩展应使用不同输出目录。浏览器版本、窗口尺寸、产品版本、追踪开关和错误保留在报告中；结果是当前机器的采样，不能宣称所有设备恒定帧率或零延迟。
- 性能脚本记录每个动作开始/结束时的页面焦点与可见性。`CAPTURE_REQUIRE_FOCUS=1` 会拒绝开始时未聚焦的采样，并把结束时失焦的采样判为无效；端点检查不能替代桌面录制期间的持续前台守护。旧报告未记录这些字段，不据此补写前台状态。
