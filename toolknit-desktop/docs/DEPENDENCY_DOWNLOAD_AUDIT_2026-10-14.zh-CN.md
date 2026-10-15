# 依赖检测与模型下载优化报告

日期：2026-10-14。分支：`codex/v3-release-workflow`。桌面端版本：3.1.0，未发布。

## 结论

本轮已修复依赖发现不完整、自动来源丢失回退、网络等待缺少空闲超时、断点续传验证不足及部分失败提示不清晰的问题。完成真实下载、哈希校验、FFmpeg 安装探测和本地翻译安装运行验证；发布回归及 Rust 全量测试通过。

自动切换来源能减少单一服务不可达导致的失败，但不能保证所有运营商和网络环境均可下载。本轮测试不是干净 Windows 虚拟机安装验收。

## 检测链路

| 依赖 | 现在的发现范围 | 可用性确认 |
| --- | --- | --- |
| FFmpeg | 显式绝对路径或安装目录、程序管理目录、Winget 包目录/链接、Scoop、Chocolatey、常见安装目录、App Paths、进程 PATH 和当前 Windows 注册表 PATH | 执行版本探测，退出成功且输出 FFmpeg 版本；缓存校验文件大小和修改时间 |
| LibreOffice | 显式路径、程序管理目录、安装注册表/UNO、常见安装与便携目录、Scoop、当前 Windows PATH | 真实启动及版本探测；优先 soffice.com，缓存仅接纳已验证且未变化的文件 |

- 读取当前 Windows PATH，使用户在应用启动后安装依赖也可重新检测。
- 只检查已知位置和有限包目录，不扫描整个硬盘。
- 状态检测移至后台，避免冷启动探测阻塞界面；并发检测串行化，避免重复启动外部进程。
- FFmpeg 使用 2 秒探测期限，并持续排空输出，避免管道堵塞。
- LibreOffice 的托管运行时保留 CRT 检查；开发专用运行时目录仅参与 debug 构建检测。
- WPS、Microsoft Office 的存在不代表有 LibreOffice UNO/soffice 转换能力，不作为此依赖已满足的证据。

真实 LibreOffice 检测找到已有开发缓存中的 26.2.5.2：首次约 12.34 秒，再次缓存检测约 54 微秒。该结果证明版本探测和缓存有效，不证明全新系统安装场景已通过。

## 下载与安装修复

1. 保留自动来源候选链。中文自动选择优先镜像，英文优先官方；失败后切换候选。明确选择单一来源时仍尊重用户选择。
2. 每次网络等待设置 20 秒空闲期限，取消期间约每 50 毫秒检查；不是把大型文件下载总时间限制为 20 秒。
3. 续传必须匹配请求偏移、文件总大小及 Content-Range；服务器忽略 Range 返回 200 时重新从头写入。
4. 已完整下载的临时文件先做 SHA-256 校验，避免再请求文件末尾产生 416；损坏缓存清除后重试。
5. 网络中断保留可续传文件；拒绝临时文件符号链接/重解析点。写盘失败不反复换源下载。
6. 抠图模型增加完整哈希检查，避免仅凭大小把损坏文件认定为可用；镜像文件校验失败后允许下一来源。
7. FFmpeg 新可执行文件先解压、探测再替换，发布失败回滚旧文件；本地解压失败保留已校验压缩包。Office 和本地翻译继续使用 staging、运行验证及旧版本回滚。
8. 下载与卸载互斥，避免正在写入的运行时被删除；限制高频进度通知。
9. FFmpeg、Whisper、抠图下载失败增加中英文可操作提示，区分网络、校验、存储和取消。
10. 翻译引擎保留官方与加速候选；7 个模型文件使用 Mozilla 官方附件 CDN，每个文件允许一次有界重试。

## 来源测评

以下为本机默认网络路由测试，HTTP HEAD 不等于完整下载或安装成功。多轮 HEAD 结果有波动；17:03 附近一轮共 23 项，17 项返回 200，6 项超时。日志只记录最终主机，不输出带签名的重定向地址。

| 对象 | 配置的来源 | 实测与判断 |
| --- | --- | --- |
| FFmpeg 6.1.1 | GitHub / cdn.npmmirror.com / gh-proxy.com | 最新 HEAD：镜像约 0.17 秒，加速约 1.29 秒，GitHub 超时；镜像完整文件校验成功 |
| LibreOffice 26.2.5 | 清华 TUNA / Document Foundation 官方分发 | HEAD 均成功，官方本轮重定向南京大学镜像；清华完整 MSI 校验成功 |
| Whisper base/small/medium | huggingface.co / hf-mirror.com | 官方多次超时，镜像 HEAD 成功；镜像最终仍可能到 cas-bridge.xethub.hf.co，不保证全程国内存储 |
| MODNet | Hugging Face / HF 镜像 | 官方本轮超时；镜像完整下载和 SHA-256 校验成功 |
| MTranServer 4.0.33 引擎 | GitHub / gh-proxy.com | 官方 HEAD 有超时，但真实 GET 和安装成功；加速 HEAD 成功。不能仅凭 HEAD 下结论 |
| 中英翻译的 7 个模型文件 | firefox-settings-attachments.cdn.mozilla.net | HEAD 全部成功，约 0.37–0.43 秒；真实全套下载、压缩与解压后校验、双向运行成功 |

完整文件测试：

| 内容 | 字节数 / 约 MiB | 下载耗时 | 结果 |
| --- | --- | --- | --- |
| FFmpeg 压缩包，npmmirror | 29,581,307 / 28.21 | 1.54 秒 | 大小与固定 SHA-256 一致 |
| LibreOffice MSI，清华 | 372,948,992 / 355.67 | 9.87 秒 | 大小与固定 SHA-256 一致；未在本轮执行全新 MSI 安装 |
| Whisper base，HF 镜像 | 147,951,465 / 141.10 | 4.48 秒 | 大小与固定 SHA-256 一致 |
| MODNet，HF 镜像 | 25,888,640 / 24.69 | 3.54 秒 | 大小与固定 SHA-256 一致 |
| 本地翻译引擎与全套模型 | 201,647,315 / 192.31 | 安装与翻译实测合计 286.75 秒 | 下载、哈希、解压、staging 检测、安装和双向翻译全部成功 |

这些是不同轮次的实际测量，不能用文件较小的测试耗时推断所有用户下载大型模型的速度。Whisper small/medium 本轮检查来源可达性和固定元数据，未完整下载其大文件。部分官方/加速地址完整下载失败，自动候选链的价值在于能继续使用其他来源。

FFmpeg 真实产品下载、解压与版本探测约 11.20 秒；含重复替换验证的测试总计约 16.49 秒。翻译引擎下载阶段本机约 0.5–0.7 MB/s，模型 CDN 更快；安装验证不能承诺固定耗时。

## 本地翻译运行测量

| 场景 | 实测耗时 |
| --- | --- |
| 英文转中文，冷启动，2 个文本块 | 4.45 秒 |
| 中文转英文，1 个文本块 | 0.89 秒 |
| 英文转中文，热启动，20 段文本 | 1.18 秒 |

这些计时不包含 OCR、外部 AI 图像提取、截图排版或下载。不能据此宣称截图翻译全程稳定低于 15 秒。真实测试使用隔离临时目录，成功后关闭引擎并清理目录，不替换用户已安装模型。

## 配置与责任边界

- `src-tauri/src/platform/runtime_discovery.rs`：共享检测路径及 Windows 注册表读取。
- `src-tauri/src/platform/dependency_download.rs`：网络空闲期限、取消、续传响应和完整缓存验证。
- `native_runtime/dependencies.rs`、`office/ppt.rs`：FFmpeg/Office 探测、缓存与下载发布。
- `native_runtime/transcription.rs`、`onnx_segmenter.rs`：Whisper 与 MODNet 来源候选、下载与校验。
- `native_runtime/local_translation/install.rs`、`process.rs`：翻译续传、隔离真实安装和性能验证。
- `src/app/dependency-helpers.js`、既有应用编排和双语字典：保留自动候选语义与可见失败提示。
- `scripts/audit-dependency-sources.mjs`：可重复的来源 HEAD 和可选完整校验。

现有 Tauri 命令名、返回数据、进度事件、DOM、存储 key、CLI/MCP 参数保持兼容；来源参数新增内部 auto-china/auto-official 语义，原有 auto/china/official 继续有效。用户 AI 密钥与服务配置未改动。Windows OCR 与随包的 qpdf/Whisper 执行组件不属于按需模型下载源，不增加另一套下载机制。

## 验证结果

- 依赖 focused 契约通过。
- `npm run test:release`：102 项脚本通过，包含架构、前端构建、安全发布检查、安装器、CLI/MCP 和产物检查；安全检查 1346 项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：215 passed、0 failed、9 ignored。忽略项为环境/真实下载等可选测试，未统一执行；本轮另行显式执行 FFmpeg 真实安装、已有 LibreOffice 探测、本地翻译真实安装三项并通过。
- 系统 Edge 翻译管理浏览器回归通过：白天/深色、宽中窄屏及常规/低高度共 12 组，覆盖下载进度、取消、网络/校验失败、修复、卸载、语言、焦点和重开。
- 实际完整网络文件校验结果见上表。
- 保留已有大 chunk、浏览器 crypto externalization 与 Windows linker 信息；无新增编译警告。

重复测评命令（在桌面端目录执行）：

```powershell
node scripts/audit-dependency-sources.mjs
node scripts/audit-dependency-sources.mjs --verify-small
node scripts/audit-dependency-sources.mjs --verify-office
npm run test:dependencies
cargo test --manifest-path src-tauri/Cargo.toml
```

带 verify 参数会真实下载文件到临时目录，测试后清理。默认仅做 HEAD。测试环境缺少 Playwright 下载的 Chromium 时，可通过 `TOOLKNIT_TEST_BROWSER` 显式使用已安装 Edge。

## 限制与后续判断

- 未验证干净虚拟机的全新 Office 安装、管理员拒绝及重启；本轮只验证完整 MSI 和已有真实 LibreOffice 启动。
- 未验证每家运营商及代理组合。模型镜像不是全程国内托管保证；Mozilla 附件 CDN 当前测试成功，不代表所有地区永远可达。
- 本轮不升级固定运行时版本、不变更 AI 提供商配置、不打测试安装包、不提交、不推送、不发布。
- 已把复盘经验同步到私有维护 Skill：自动来源不能提前降为单一来源、完整缓存先校验、存储错误不换源，以及区分来源探测、下载、安装、运行证据。Skill 不复制到仓库或产物。
