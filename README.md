<div align="center">

<img src="assets/readme/hero.gif" alt="ToolKnit Desktop 2.0" width="100%" />

<h1>ToolKnit Desktop 2.0</h1>

<p><strong>本地文件工作台 · 桌面端、网页端与 AI Agent 工作流</strong></p>

<p>
  把 PDF、PPT、图像、音频、视频、文本和 AI 内容工作，收拢到一套清晰、可靠、可复用的工具体系里。
</p>

<p>
  <a href="https://toolknit.com"><img src="https://img.shields.io/badge/首选入口-ToolKnit.com-0f766e?style=for-the-badge&logo=googlechrome&logoColor=white" alt="打开 ToolKnit.com" /></a>
  <a href="https://github.com/ZihangDong/toolknit-desktop/releases"><img src="https://img.shields.io/badge/桌面端-Windows%20下载-2563eb?style=for-the-badge&logo=windows&logoColor=white" alt="下载 Windows 桌面端" /></a>
  <a href="#cli--mcp--agent"><img src="https://img.shields.io/badge/CLI%20%2B%20MCP-Agent%20工作流-7c3aed?style=for-the-badge&logo=githubactions&logoColor=white" alt="CLI 与 MCP Agent" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/2.0-Preview-d97706?style=for-the-badge&labelColor=92400e" alt="ToolKnit 2.0 Preview" />
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-2563eb?style=for-the-badge&logo=windows&logoColor=white" alt="Windows 10/11" />
  <img src="https://img.shields.io/badge/Local--first-文件留在本机-0f766e?style=for-the-badge" alt="Local first" />
  <img src="https://img.shields.io/badge/Tauri-2.x-475569?style=for-the-badge" alt="Tauri 2.x" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-334155?style=for-the-badge" alt="Apache 2.0 license" /></a>
</p>

<p>
  <a href="https://github.com/ZihangDong/toolknit-desktop/stargazers"><img src="https://img.shields.io/github/stars/ZihangDong/toolknit-desktop?style=for-the-badge&logo=github&logoColor=white&label=Stars&color=f59e0b" alt="GitHub stars" /></a>
  <a href="https://github.com/ZihangDong/toolknit-desktop/network/members"><img src="https://img.shields.io/github/forks/ZihangDong/toolknit-desktop?style=for-the-badge&logo=github&logoColor=white&label=Forks&color=64748b" alt="GitHub forks" /></a>
  <a href="https://github.com/ZihangDong/toolknit-desktop/issues"><img src="https://img.shields.io/github/issues/ZihangDong/toolknit-desktop?style=for-the-badge&logo=github&logoColor=white&label=Issues&color=ef4444" alt="GitHub issues" /></a>
  <a href="https://github.com/ZihangDong/toolknit-desktop/graphs/contributors"><img src="https://img.shields.io/github/contributors/ZihangDong/toolknit-desktop?style=for-the-badge&logo=github&logoColor=white&label=Contributors&color=8b5cf6" alt="GitHub contributors" /></a>
</p>

</div>

<table cellpadding="18" cellspacing="0">
  <tr>
    <td width="50%" valign="top">
      <p><img src="https://cdn.simpleicons.org/googlechrome/0f766e" width="24" height="24" alt="" /> <strong>先用网页版</strong></p>
      <p>无需安装，打开浏览器即可使用同名官方网页端。</p>
      <p><a href="https://toolknit.com"><strong>打开 ToolKnit.com</strong></a></p>
      <sub>适合快速体验、跨平台使用和不方便安装桌面应用的场景。</sub>
    </td>
    <td width="50%" valign="top">
      <p><img src="https://cdn.simpleicons.org/windows/2563eb" width="24" height="24" alt="" /> <strong>再用桌面端</strong></p>
      <p>Windows 本地优先版本，适合长期文件工作、离线处理和可视化编辑。</p>
      <p><a href="https://github.com/ZihangDong/toolknit-desktop/releases"><strong>查看桌面端下载</strong></a></p>
      <sub>2.0 正式安装包发布后，会同步更新 Release 入口。</sub>
    </td>
  </tr>
</table>

## ToolKnit 2.0

ToolKnit Desktop 2.0 是一套面向 Windows 的本地文件工作台。它把常用文件处理、AI 内容生产、专业文档工作流和 IDE Agent 自动化放在同一个产品体系里。

同一份本地文件可以被桌面端预览、被 CLI 批处理、被 MCP Agent 调用，并且拥有明确的输入、输出、进度、错误和安全边界。

<p>
  <img src="https://img.shields.io/badge/49-桌面工具-0f766e?style=for-the-badge" alt="49 desktop tools" />
  <img src="https://img.shields.io/badge/11-功能分类-2563eb?style=for-the-badge" alt="11 categories" />
  <img src="https://img.shields.io/badge/46-MCP%20能力-7c3aed?style=for-the-badge" alt="46 MCP capabilities" />
  <img src="https://img.shields.io/badge/3-工作方式-d97706?style=for-the-badge" alt="3 ways to work" />
  <img src="https://img.shields.io/badge/Windows-首发平台-475569?style=for-the-badge&logo=windows&logoColor=white" alt="Windows first platform" />
  <img src="https://img.shields.io/badge/Local--first-隐私策略-0f766e?style=for-the-badge" alt="Local first privacy policy" />
</p>

## 三种工作方式

<table cellpadding="16" cellspacing="0">
  <tr>
    <td width="33%" valign="top">
      <p><img src="https://cdn.simpleicons.org/googlechrome/0f766e" width="28" height="28" alt="" /></p>
      <p><img src="https://img.shields.io/badge/WEB-TOOLKNIT.COM-0f766e?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Web ToolKnit.com" /></p>
      <h3>网页端</h3>
      <p>开箱即用，无需安装。适合快速处理和跨平台访问。</p>
      <a href="https://toolknit.com">进入 ToolKnit.com</a>
    </td>
    <td width="33%" valign="top">
      <p><img src="https://cdn.simpleicons.org/windows/2563eb" width="28" height="28" alt="" /></p>
      <p><img src="https://img.shields.io/badge/DESKTOP-WINDOWS-2563eb?style=for-the-badge&logo=windows&logoColor=white" alt="Desktop Windows" /></p>
      <h3>桌面端</h3>
      <p>文件留在本机，提供预览、拖拽、批量处理、可视化编辑和依赖管理。</p>
      <a href="https://github.com/ZihangDong/toolknit-desktop/releases">查看 Releases</a>
    </td>
    <td width="33%" valign="top">
      <p><img src="https://api.iconify.design/lucide:workflow.svg?color=%237c3aed" width="28" height="28" alt="" /></p>
      <p><img src="https://img.shields.io/badge/CLI%20%2B%20MCP-AGENT-7c3aed?style=for-the-badge&logo=githubactions&logoColor=white" alt="CLI MCP Agent" /></p>
      <h3>CLI 与 Agent</h3>
      <p>适合脚本、批处理、CI 和 IDE Agent，用自然语言调用可验证的本地能力。</p>
      <a href="#cli--mcp--agent">查看接入方式</a>
    </td>
  </tr>
</table>

## 完整功能目录

下面按桌面端的 11 个分类列出全部 49 项工具。名称对应应用内入口，支持的 CLI / MCP 能力会在相应工具成熟后提供同一套输入输出契约。

### <img src="https://cdn.simpleicons.org/adobeacrobatreader/ed1c24" width="24" height="24" alt="PDF" /> PDF 文档工具 · 9 项

`PDF 合并` · `PDF 拆分` · `PDF 转图像` · `PDF 编辑器` · `PDF 页面旋转` · `PDF 文件加密` · `PDF 文件解密` · `PDF 文件压缩` · `PDF 文字增强`

支持拖拽排序、逐页预览、选页导出、页面旋转、文字替换、文本与图像插入、追加合并、密码保护、扫描件增强和多等级压缩。PDF、密码和导出结果默认只在本机处理。

### <img src="https://cdn.simpleicons.org/microsoftpowerpoint/d24726" width="24" height="24" alt="PPT" /> PPT 演示文稿工具 · 7 项

`PPT 转 PDF` · `PPT 转图片` · `PPT 图片提取` · `PPT 文本提取` · `PPT 压缩` · `AI 生成 PPT 大纲` · `AI 生成 PPT 草稿 / PPTX`

支持逐页渲染、页码选择、PNG/JPG/WebP 输出、素材去重、标题正文备注提取、Markdown/TXT/JSON 导出、媒体清理，以及从主题和资料生成结构化大纲与可编辑 PPTX 草稿。PPT 渲染运行时按需下载。

### <img src="https://cdn.simpleicons.org/imagemagick/31a8ff" width="24" height="24" alt="Image" /> 图像工具 · 5 项

`图片格式转换` · `图片压缩` · `长图拼接` · `图标生成器` · `配色提取器`

支持 JPG、PNG、WebP、BMP、GIF、SVG 互转，批量压缩，横向 / 纵向 / 无缝拼接图片或 PDF 页面，生成多尺寸 PNG、ICO、SVG 图标并打包 ZIP，以及输出 HEX、RGB、HSL 主色和色卡比例。

### <img src="https://cdn.simpleicons.org/ffmpeg/007808" width="24" height="24" alt="Audio and video" /> 音频工具 · 4 项

`音频格式转换` · `BPM 节拍测速` · `音频剪辑` · `音频提取`

支持 MP3、AAC、WAV、FLAC、ALAC、OGG、WMA 等格式互转，离线 BPM 分析，波形可视化剪辑和从视频中提取音轨。FFmpeg 按需安装，源文件不会被覆盖。

### <img src="https://api.iconify.design/lucide:film.svg?color=%23dc2626" width="24" height="24" alt="Video" /> 视频工具 · 3 项

`视频格式转换` · `视频高清单帧图` · `视频截取 GIF`

支持 MP4、AVI、MKV、MOV、WebM、FLV、WMV、TS、M4V 等格式转换，按精确时间点导出 PNG/JPG 单帧，以及从 30 秒以内片段生成调色板优化 GIF。

### <img src="https://cdn.simpleicons.org/markdown/000000" width="24" height="24" alt="Text" /> 文本与转写 · 3 项

`音视频提取文字` · `文本统计器` · `文本格式化`

Whisper 模型下载到本机后，可离线识别中英文音频和视频并输出 TXT、SRT、JSON；文本统计提供字符、词、行、段落、句子、标点和阅读时间数据；格式化工具用于整理纯文本内容。

### <img src="https://api.iconify.design/lucide:calculator.svg?color=%232563eb" width="24" height="24" alt="Calculator" /> 计算器工具 · 5 项

`体脂率计算器` · `时间戳计算器` · `房贷计算器` · `利息计算器` · `密码生成器`

覆盖健康估算、Unix 时间戳转换、房贷月供、单利 / 复利计算和安全随机密码生成，适合在桌面端随手完成小型计算。

### <img src="https://api.iconify.design/lucide:palette.svg?color=%23db2777" width="24" height="24" alt="Creative" /> 创意工具 · 1 项

`打字测试器`

提供中英文打字练习、计时、速度、正确率和结果统计。配色提取属于图像工具，避免同一能力在目录中重复计算。

### <img src="https://api.iconify.design/lucide:broom.svg?color=%23ea580c" width="24" height="24" alt="Cleanup" /> 清理工具 · 1 项

`AI 大文件清理`

先在本机扫描大文件，再由本地规则和可选 AI 只分析文件名、大小、修改时间和目录线索；删除前逐项确认，最终移入回收站，不读取或上传文件内容。

### <img src="https://cdn.simpleicons.org/openai/10a37f" width="24" height="24" alt="AI" /> AI 工作台 · 4 项

`AI 文字润色` · `AI 智能翻译` · `AI 文档生成` · `AI 表格生成`

AI 文档支持多页 PDF、可编辑工程文件、编号图、预览、检查、编辑、撤销和重新渲染；AI 表格支持 CSV、XLSX、PDF、PNG、可编辑项目、行列与图表编号、公式修改和重新渲染。只有明确调用 AI 时，相关文字才会发送到你配置的模型服务。

### <img src="https://cdn.simpleicons.org/windows11/0078d4" width="24" height="24" alt="Hardware" /> 硬件工具 · 7 项

`整机概览` · `CPU 与内存` · `GPU 与显示器` · `主板与固件` · `存储健康` · `网络设备` · `电源传感器`

只读查看 Windows、设备型号、CPU、内存、显卡、显示器、主板、BIOS、安全启动、TPM、虚拟化、磁盘、网络和电源传感器信息；CPU 与内存页面还提供实时状态刷新。

## 本地优先与隐私边界

<img src="https://api.iconify.design/lucide:shield-check.svg?color=%230f766e" width="24" height="24" alt="" /> **默认本地**：桌面端的 PDF、PPT、图像、音频、视频、文本、计算器、硬件和清理工具在设备本地运行，源文件不会上传到 ToolKnit 服务器。

<img src="https://api.iconify.design/lucide:key-round.svg?color=%23d97706" width="24" height="24" alt="" /> **明确授权**：只有主动使用 AI 润色、翻译、AI 文档、AI 表格、PPT 文本 AI 整理、AI PPT 大纲、AI PPTX 草稿或转写后的 `refine` 时，相关文字才会发送到你配置的模型服务。

<img src="https://api.iconify.design/lucide:download-cloud.svg?color=%232563eb" width="24" height="24" alt="" /> **按需依赖**：FFmpeg、Whisper 模型和 PPT 渲染运行时按需下载，支持依赖检测、校验和镜像源选择。

CLI 和 MCP 默认要求明确输入与输出路径，不覆盖已有文件；密码等敏感输入不会写入日志、输出 JSON、文件名或 Agent 回复。

## 产品预览

<p align="center">
  <img src="toolknit-desktop/docs/assets/readme-home.png" alt="ToolKnit Desktop workbench preview" width="100%" />
</p>

<p align="center"><sub>2.0 工作台首页预览 · 最终发布截图会随正式版本同步更新</sub></p>

<table cellpadding="10" cellspacing="0">
  <tr>
    <td width="50%" valign="top">
      <p align="center"><strong>ToolKnit.com 网页端</strong></p>
      <a href="https://toolknit.com"><img src="assets/readme/web-version.png" alt="ToolKnit.com web version" width="100%" height="250" style="object-fit:cover; border-radius:8px;" /></a>
    </td>
    <td width="50%" valign="top">
      <p align="center"><strong>AI 文档工程工作流</strong></p>
      <img src="assets/readme/categories/category-ai.png" alt="AI workbench preview" width="100%" height="250" style="object-fit:cover; border-radius:8px;" />
    </td>
  </tr>
</table>

<details>
  <summary><strong>查看工具分类截图</strong></summary>

<p align="center"><sub>分类截图统一使用 1210 x 780 画布，避免同一组预览出现不同高度。</sub></p>

<table cellpadding="8" cellspacing="0">
  <tr>
    <td width="50%" valign="top"><strong>PDF</strong><br /><img src="assets/readme/categories/category-pdf.png" alt="PDF tools" width="100%" /></td>
    <td width="50%" valign="top"><strong>AI 与内容工作流</strong><br /><img src="assets/readme/categories/category-ai.png" alt="AI and content tools" width="100%" /></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><strong>图像</strong><br /><img src="assets/readme/categories/category-image.png" alt="Image tools" width="100%" /></td>
    <td width="50%" valign="top"><strong>音频</strong><br /><img src="assets/readme/categories/category-audio.png" alt="Audio tools" width="100%" /></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><strong>视频</strong><br /><img src="assets/readme/categories/category-video.png" alt="Video tools" width="100%" /></td>
    <td width="50%" valign="top"><strong>文本</strong><br /><img src="assets/readme/categories/category-text.png" alt="Text tools" width="100%" /></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><strong>硬件</strong><br /><img src="assets/readme/categories/category-hardware.png" alt="Hardware tools" width="100%" /></td>
    <td width="50%" valign="top"><strong>计算器与其他</strong><br /><img src="assets/readme/categories/category-calculator.png" alt="Calculator tools" width="100%" /></td>
  </tr>
</table>
</details>

## 下载与运行

### 直接使用网页端

打开 [ToolKnit.com](https://toolknit.com)，无需安装即可开始使用网页端工具。

### 安装 Windows 桌面端

从 [GitHub Releases](https://github.com/ZihangDong/toolknit-desktop/releases) 获取安装包。2.0 正式发布后，安装包、校验文件和版本说明会在 Release 页面同步提供。

当前版本仍处于 2.0 发布准备阶段，正式安装包发布前请以仓库 Release 页面为准。

### 从源码运行

```powershell
git clone https://github.com/ZihangDong/toolknit-desktop.git
Set-Location toolknit-desktop\toolknit-desktop
npm ci
npm run tauri dev
```

要求：Windows 10/11、Node.js `20.12.0` 或更高版本；构建原生桌面端还需要 Rust stable 工具链。

## CLI / MCP / Agent

<a id="cli--mcp--agent"></a>

ToolKnit 将适合自动化的本地文件能力提供给命令行、脚本和支持 MCP 的 IDE Agent。桌面端负责可视化预览和交互，CLI 负责批处理，Agent 负责自然语言编排。

### 安装 CLI

```powershell
npm install --global @toolknit/cli
toolknit doctor --json
toolknit --help
```

### MCP 配置

在 Trae、Cursor、VS Code 或其他支持 MCP 的客户端中添加：

```json
{
  "mcpServers": {
    "toolknit": {
      "command": "toolknit",
      "args": ["mcp", "serve"]
    }
  }
}
```

基础文件工具和非 AI PPT 工具不需要 AI Key。AI 文档、AI 表格、PPT 文本整理、AI PPT 大纲、AI PPTX 草稿和转写后的 `refine` 二次润色，需要在 CLI/MCP 进程环境中配置 `DEEPSEEK_API_KEY` 或 `TOOLKNIT_AI_API_KEY`。

完整说明：

- [CLI 与 MCP 契约](toolknit-desktop/docs/cli-agent.md)
- [中文 Agent 手册](toolknit-desktop/docs/agent-guide.zh-CN.md)
- [English Agent guide](toolknit-desktop/docs/agent-guide.en.md)
- [AI 文档工程规范](toolknit-desktop/docs/ai-document-project-spec.md)

## 贡献者

ToolKnit 的代码、文档、测试、设计和问题反馈都来自真实的协作。贡献者区域会展示参与项目建设的用户头像、姓名和 GitHub 链接。

<p align="center">
  <a href="https://github.com/ZihangDong/toolknit-desktop/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=ZihangDong/toolknit-desktop&max=48&columns=12" alt="ToolKnit contributors circular avatar wall" />
  </a>
</p>

<p align="center"><sub>头像墙来自 GitHub 贡献记录；正式发布前可以在下方模板中补充姓名、角色和个人链接。</sub></p>

<!--
贡献者手工名单模板：头像保持圆形，姓名和角色与 GitHub 主页对应。
<table cellpadding="10" cellspacing="0">
  <tr>
    <td align="center"><a href="https://github.com/USERNAME"><img src="https://github.com/USERNAME.png?size=160" width="88" height="88" style="border-radius:50%;" alt="姓名" /><br /><sub><strong>姓名</strong></sub></a><br /><sub>代码 / 文档 / 设计</sub></td>
  </tr>
</table>
-->

## 捐赠支持者

目前公开记录的项目支持全部来自现金捐赠。每一笔支持都会用于测试设备、依赖镜像、文档维护、版本发布和后续功能开发。

<table cellpadding="12" cellspacing="0">
  <tr>
    <td width="50%" align="center" valign="top">
      <p><img src="https://api.iconify.design/lucide:scan-line.svg?color=%231677ff" width="24" height="24" alt="" /> <strong>支付宝</strong></p>
      <img src="assets/wechat-qr.jpg" alt="支付宝捐赠二维码" width="240" height="240" />
    </td>
    <td width="50%" align="center" valign="top">
      <p><img src="https://api.iconify.design/lucide:scan-line.svg?color=%2307c160" width="24" height="24" alt="" /> <strong>微信支付</strong></p>
      <img src="assets/alipay-qr.png" alt="微信支付捐赠二维码" width="240" height="240" />
    </td>
  </tr>
</table>

<p align="center"><img src="https://img.shields.io/badge/公开捐赠总额-83.88%20元-d97706?style=for-the-badge" alt="公开捐赠总额 83.88 元" /></p>

| 支持者 | 金额 | 日期 |
| --- | ---: | --- |
| 匿名开源支持者 | 23.88 元 | 2026-08-03 |
| 匿名开源支持者 | 2 元 | 2026-08-04 |
| 匿名开源支持者（烤肠基金） | 5 元 | 2026-08-06 |
| 匿名开源支持者 | 50 元 | 2026-08-06 |
| 匿名开源支持者（工具编织） | 3 元 | 2026-08-06 |

<p><sub>捐赠不是付费外包承诺，但会帮助 ToolKnit 保持开源、纯净、可维护和持续更新。公开记录见 <a href="toolknit-desktop/public/contributors.json">contributors.json</a>。</sub></p>

## Star History

<p align="center">
  <a href="https://star-history.com/#ZihangDong/toolknit-desktop&Date">
    <img src="https://api.star-history.com/svg?repos=ZihangDong/toolknit-desktop&type=Date" alt="ToolKnit GitHub star history" width="100%" />
  </a>
</p>

<p align="center"><img src="assets/readme/star-growth.svg" alt="ToolKnit star growth" width="78%" /></p>

## 参与项目

- 提交可复现的 [Bug 反馈](https://github.com/ZihangDong/toolknit-desktop/issues/new?template=bug_report.yml)。
- 提交 [功能建议](https://github.com/ZihangDong/toolknit-desktop/issues/new?template=feature_request.yml)。
- 阅读 [贡献指南](CONTRIBUTING.md) 了解开发、测试和 Pull Request 流程。
- 查看 [构建指南](BUILD.md) 在本地运行桌面端。

## 网页端与品牌边界

[ToolKnit.com](https://toolknit.com) 是同名网页端产品，提供无需安装的在线体验和持续更新的网页能力。桌面端开源仓库专注于 Windows 本地文件处理、CLI 和 MCP；网页端的服务、域名、账号、托管服务和运营能力不属于本仓库的开源授权范围。

## 开源协议

ToolKnit Desktop 和 CLI/MCP 源代码采用 [Apache License 2.0](LICENSE) 开源。

该协议不授予 ToolKnit 名称、Logo、视觉标识、域名、官网、托管网页服务、服务账号或其他独立运营产品的使用权。详见 [NOTICE](NOTICE)。

<p align="center">
  <sub>ToolKnit Desktop 2.0 · Local-first tools for real work</sub>
</p>
