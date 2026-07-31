# ToolKnit Desktop 构建指南

本文档面向希望从源码构建 ToolKnit 桌面端的开发者。

## 环境要求

- Windows 10 或更高版本
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- 稳定的网络连接(用于下载 Rust 依赖)

## 推荐开发工具

- [VS Code](https://code.visualstudio.com/) + [Tauri 官方插件](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- 或 [Trae](https://www.trae.ai/) / [Cursor](https://cursor.sh/) 等 AI IDE

## 前置准备

### 1. 克隆仓库

```bash
git clone https://github.com/ZihangDong/toolknit-desktop.git
cd toolknit-desktop
```

### 2. 下载 ffmpeg.exe

由于 GitHub 单文件 100MB 限制,ffmpeg.exe 没有包含在仓库中,需要手动下载:

1. 下载 [ffmpeg-master-latest-win64-gpl.zip](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip)
2. 解压后将 `bin/ffmpeg.exe` 放到以下路径:

```
toolknit-desktop/
└── src-tauri/
    └── resources/
        └── ffmpeg/
            └── ffmpeg.exe
```

## 开发模式

```bash
cd toolknit-desktop
npm install
npm run tauri dev
```

开发服务器启动后,会自动打开应用窗口。前端代码修改后会热更新,Rust 代码修改后需要重新编译。

## 生产构建

```bash
cd toolknit-desktop
npm run tauri build
```

构建产物:

- 单文件 exe: `src-tauri/target/release/toolknit-desktop.exe`
- NSIS 安装包: `src-tauri/target/release/bundle/nsis/toolknit-desktop_*_x64-setup.exe`

## 常见问题

### 1. 构建时提示 ffmpeg.exe 不存在

确认 `src-tauri/resources/ffmpeg/ffmpeg.exe` 是否存在。这是音视频处理必需的。

### 2. Rust 编译非常慢

首次编译需要下载大量依赖,可能需要 10-20 分钟。后续增量编译会快很多(约 40 秒)。

### 3. 提示 `toolknit-desktop.exe` 正在运行无法覆盖

关闭正在运行的 ToolKnit 进程后再重新构建:

```bash
taskkill /F /IM toolknit-desktop.exe
```

### 4. 网络问题导致依赖下载失败

如果 Rust crates 下载失败,可以配置国内镜像,例如 [rsproxy](https://rsproxy.cn/) 或 [中科大镜像](https://mirrors.ustc.edu.cn/help/crates.io-index.html)。

## 项目结构

```
toolknit-desktop/
├── src/                    # 前端源码
│   ├── main.js            # 主逻辑
│   ├── styles.css         # 样式
│   ├── locales/           # 中英文语言包
│   └── ...
├── src-tauri/             # Tauri/Rust 后端
│   ├── src/               # Rust 源码
│   ├── resources/         # 资源文件(ffmpeg.exe)
│   └── tauri.conf.json    # Tauri 配置
├── index.html             # 应用入口
└── package.json
```

## 打包配置

安装包配置位于 `src-tauri/tauri.conf.json` 的 `bundle` 部分:

- `targets`: `["app", "nsis"]` 同时生成单文件 exe 和安装包
- `resources`: 指定 ffmpeg.exe 作为内置资源
- `windows.nsis`: NSIS 安装器配置,支持中英文

## 需要帮助?

- 查看 [README.md](README.md)
- 提交 [Issue](https://github.com/ZihangDong/toolknit-desktop/issues)
