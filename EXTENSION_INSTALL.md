# 安装为 Chrome / Edge 新标签页

扩展构建完成后不依赖 `localhost`，也不需要运行 `启动网站.bat`。

## 生成扩展

在项目目录运行：

```powershell
npm run package:extension
```

命令会生成：

- `dist-extension`：用于浏览器“加载已解压的扩展程序”
- `artifacts/site-hub-extension.zip`：便于备份或传输，安装前需要先解压

## Chrome

1. 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目中的 `dist-extension` 文件夹。
5. 新建标签页，确认出现“Mysimple”收藏主页。

## Microsoft Edge

1. 打开 `edge://extensions/`。
2. 打开左侧“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本项目中的 `dist-extension` 文件夹。
5. 如果 Edge 询问是否保留新标签页扩展，选择保留。

## 搜索与数据

- 在页面搜索框中输入时，会筛选当前收藏；按 Enter 会使用浏览器当前默认搜索引擎搜索网页。
- 新标签页打开后，Chrome/Edge 默认仍会把键盘焦点放在顶部地址栏，这是浏览器原生行为。
- 扩展数据与 `http://localhost:5173` 的网页数据相互独立。
- 如需迁移，在旧网页的“管理分组”中导出 JSON，再在扩展中导入。
- 无痕窗口不会被新标签页扩展接管。
