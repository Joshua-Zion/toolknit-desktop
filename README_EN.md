<div align="center">

# ToolKnit

### Multi-functional Toolbox · Open Source Desktop Edition

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-success.svg)]()
[![Tauri](https://img.shields.io/badge/Tauri-2.x-orange.svg)](https://tauri.app)
[![Release](https://img.shields.io/badge/Download-latest-brightgreen.svg)](https://toolknit.com/exe.html)

**One-stop audio/video · image · document · AI toolbox. All processing runs locally, privacy-first.**

---

### Web Version (Online, more features, no installation)

# [toolknit.com](https://toolknit.com)

</div>

---

[简体中文](README.md) · English

---

## Introduction

ToolKnit is a multi-functional desktop toolbox that integrates everyday audio/video processing, image conversion/compression, PDF/document processing, AI chat, and text utilities into one application. All file processing runs entirely on your local machine — no files are uploaded to any server, ensuring privacy and security.

> **This desktop edition is the open-source companion of the ToolKnit web app.**
> The web version is more complete, requires no installation, works cross-platform, and is ready to use instantly. We recommend using it first:
> **[toolknit.com](https://toolknit.com)**

## Features

### Document Tools (Document Studio)

| Tool | Description |
|------|-------------|
| PDF Merge | Merge multiple PDFs into one |
| PDF Split | Split PDF by page ranges |
| PDF Rotate | Rotate PDF pages |
| PDF Encrypt | Add password protection to PDF |
| PDF Decrypt | Remove PDF password |
| PDF Compress | Reduce PDF file size |
| PDF Enhance | Improve PDF clarity |

### Image Tools (Pixel Lab)

| Tool | Description |
|------|-------------|
| Image Convert | Batch convert image formats (JPG/PNG/WebP/BMP/GIF) |
| Image Compress | Compress image file size |
| Icon Generator | Generate app icons |

### Audio & Video Tools (Sound Studio)

| Tool | Description |
|------|-------------|
| Audio Convert | Batch convert audio formats |
| BPM Detect | Detect audio beats per minute |
| Audio Trim | Precisely trim audio clips |
| Audio Extract | Extract audio tracks from video |
| Video Convert | Batch convert video formats |

### AI Tools

| Tool | Description |
|------|-------------|
| AI Polish | Smart text polishing |
| AI Translate | Multi-language translation |
| AI Doc | Smart document processing |
| AI Table | Smart table processing |

> AI tools support DeepSeek / OpenAI / Qwen (Tongyi Qianwen) / Moonshot. Users configure their own API keys; data goes directly to the model provider, not through any third party.

### Text & Utilities

| Tool | Description |
|------|-------------|
| Color Extractor | Extract color palettes from images |
| Text Stats | Count characters and lines |
| Text Format | Case conversion and more |
| Typing Test | Typing speed practice |
| BMI Calculator | Body mass index calculator |
| Timestamp Calc | Unix timestamp converter |

## Download & Usage

### Option 1: Download Installer (Recommended)

No environment setup required. Download the pre-built installer:

**[Download from toolknit.com](https://toolknit.com/exe.html)**

### Option 2: Build from Source

For developers who want to modify and build themselves.

#### Requirements

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) (stable)
- Windows 10+

#### Build Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/ZihangDong/toolknit-desktop.git
   cd toolknit-desktop
   ```

2. **Download ffmpeg.exe (Required)**

   Due to GitHub's 100MB single-file limit, ffmpeg.exe is not included in the repository. Please download it manually:

   - Download: [ffmpeg-master-latest-win64-gpl.zip](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip)
   - Extract and place `bin/ffmpeg.exe` into:

     ```
     toolknit-desktop/src-tauri/resources/ffmpeg/ffmpeg.exe
     ```

   - The directory structure should look like:

     ```
     toolknit-desktop/
     └── src-tauri/
         └── resources/
             └── ffmpeg/
                 └── ffmpeg.exe   ← place here
     ```

3. **Install dependencies and build**

   ```bash
   npm install
   npm run tauri build
   ```

   After the build completes, the installer will be in `src-tauri/target/release/bundle/`.

4. **Run in development mode**

   ```bash
   npm run tauri dev
   ```

## About the Web Version

The ToolKnit web app ([toolknit.com](https://toolknit.com)) is a more complete online version:

- No installation, works instantly in the browser
- More features, continuously updated
- Cross-platform (Windows / macOS / Linux / mobile)
- No environment setup required

**[Try the web version now](https://toolknit.com)**

## Tech Stack

| Category | Technology |
|----------|------------|
| Desktop Framework | [Tauri 2.x](https://tauri.app/) (Rust) |
| Frontend | Vanilla JavaScript + [Vite](https://vitejs.dev/) |
| Audio/Video Processing | ffmpeg (bundled, no extra install) |
| AI Models | DeepSeek / OpenAI / Qwen / Moonshot (user-provided keys) |
| ML Models | whisper (speech recognition), yolov8 (watermark detection) |

## License

This project is open-sourced under the [MIT License](LICENSE). You are free to use, modify, and distribute it.

## Links

- Web App: [toolknit.com](https://toolknit.com)
- Download Desktop: [toolknit.com/exe.html](https://toolknit.com/exe.html)
- Issue Tracker: [GitHub Issues](https://github.com/ZihangDong/toolknit-desktop/issues)
- Sponsor: [toolknit.com](https://toolknit.com) (bottom of page)

---

<div align="center">

**Like ToolKnit? Try the full version at [toolknit.com](https://toolknit.com)!**

If this project helps you, please consider giving it a Star.

</div>
