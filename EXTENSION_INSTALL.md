# 安装 Mysimple 新标签页扩展

适用于 Chrome / Microsoft Edge。安装后不依赖 localhost，也不需要启动开发服务器。

## 获取安装文件

从 [GitHub Releases](https://github.com/DewMysimple/GuoYoung/releases/latest) 下载 `site-hub-extension.zip`，解压到长期保留的文件夹。浏览器要加载的是直接包含 `manifest.json` 的目录，不能直接加载 ZIP。

也可以从源码生成安装文件：

```powershell
npm.cmd ci
npm.cmd run package:extension
```

需要 Node.js 和 PowerShell。命令生成 `dist-extension/`、固定解压目录 `artifacts/site-hub-extension/` 和 `artifacts/site-hub-extension.zip`；前两个目录均可用于加载扩展。

## Chrome

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择直接包含 `manifest.json` 的安装目录。
5. 新建标签页，确认出现 Mysimple 收藏主页。

## Microsoft Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”，选择安装目录。
4. 如果 Edge 询问是否保留新标签页扩展，选择保留。
5. 新建标签页查看 Mysimple。

## 更新与迁移

- 更新前可在“设置 → 数据 → 导出”备份收藏。将新版本解压到原安装目录，再到扩展管理页点击**重新加载**，然后重新打开新标签页。
- 源码构建更新时，重新运行打包命令，并在浏览器中重新加载对应目录。
- 不要为更新而先卸载扩展，也不要随意移动已加载目录；卸载可能清除扩展本地数据。
- 网页版、扩展版、Chrome 和 Edge 的数据相互独立。迁移整库请使用“设置 → 数据”的导出 / 导入；“管理分组”的资源导出只包含单个分组。
- 收藏 JSON 不包含回收站、搜索历史、浏览器历史和本地壁纸文件；本地壁纸迁移后需重新选择。

## 使用说明

- 输入搜索词会查找两个收藏工作区中的活动收藏；按 Enter 使用浏览器默认搜索引擎搜索网页。
- 新标签页初始焦点仍由浏览器放在地址栏，这是浏览器原生行为。
- 历史记录首次使用时会请求可选权限。拒绝授权仍可使用网站收藏；授权后删除历史 URL 会同时删除浏览器内该 URL 的记录。
- 无痕窗口不由此扩展接管。工具栏固定需要在浏览器扩展菜单手动完成。

返回[项目介绍](./README.md)。
