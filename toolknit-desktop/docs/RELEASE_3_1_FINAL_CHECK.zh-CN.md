# V3.1 生产安装包最终检查

## 2026-10-15 最终候选包

- 在下述检查基础上加入抠图 GPU 初始化/推理失败转 CPU、手动 CPU 模式及失败会话恢复；已获用户确认，进入仓库正式发布流程。
- 使用 `npm run build:release-package` 重新生成 Windows x64 无签名包，生产配置未启用 QA / DevTools，版本仍为 `3.1.0`。
- 安装包路径不变；生成时间为 2026-10-15 11:54，大小 55,397,257 字节（52.83 MiB），ProductVersion 为 `3.1.0`，签名状态 `NotSigned`。
- SHA-256：`64400497F04C22373B260FA5453B4F1F5A5A220FCD557E072404C81E4A16BE07`。
- 完整发布门禁 103 项脚本通过；Rust 为 223 passed、9 ignored；抠图双主题/双语浏览器 5 组检查和真实 MODNet CPU 冒烟通过。目标 Win10 / GT730 未做实机验证。
- 正式包再次通过资源审计：17 个 public 文件、518 个前端产物、38 项原生资源。安装脚本包含 ONNX、DirectML 及所需 x64 VC 运行库。
- 发布源码使用 Git 提交快照生成 ZIP，排除本机未跟踪/忽略文件；私有 Skill 不在仓库或安装资源中。仓库发布不等于 npm 发布，也不代表官网已同步。

## 2026-10-14 历史候选包

检查日期：2026-10-14。分支：`codex/v3-release-workflow`。版本：`3.1.0`。
本记录确认本地生产打包完成，不代表已上传或正式发布；根目录更新日志仍保留未发布状态。

## 安装包

- 文件：`src-tauri/target/release/bundle/nsis/toolknit-desktop_3.1.0_x64-setup.exe`。
- 生成时间：2026-10-14 21:40（本机时间）。
- 大小：55,432,803 字节，52.86 MiB。
- SHA-256：`27179EF5C087E1F09790CB1093E426DA7E5179E42FD56A07F5D9717C876E7B8D`。
- 安装器与程序的 ProductVersion 均为 `3.1.0`，Authenticode 状态均为 `NotSigned`。
- 程序 SHA-256：`C7175F91065AB163F57B8B7776CAC16D68B48A12C8EAB63AEAAA6B617752382A`。

## 生产配置和素材

- 使用 `npm run build:release-package`（`tauri build`），未合并测试配置。实际 release 编译特性仅为 `custom-protocol`、`default`，不包含 `qa-devtools`。
- 主窗口、截图及取色辅助窗口关闭 DevTools，未注入 QA F12 钩子；生产权限清单为 `default`、`screenshot-windows`。
- 产物审计核对 17 个 public 文件、518 个前端产物及 38 项原生资源；私有 Skill、调试标记、source map 和隔离预览不进入产物。
- Logo、蜘蛛、默认深色背景和捐赠图片非空且构建前后字节一致。生成的 NSIS 明确包含 ONNX Runtime、DirectML 及四个补齐的 VC 运行库 DLL。
- 新许可、NOTICE、历史 Apache 授权和第三方声明包含于资源清单，保持既有第三方权利。
- 用户查看的隔离预览已关闭，对应开发服务器已停止，仅删除本轮临时预览文件；没有清理未知改动或素材。

## 验证结果

- `npm run test:release`：103 项脚本通过，含架构、版本、更新、安全、工具、安装器契约、CLI/MCP、干净工作区 CLI 包及资源审计。
- `cargo test --manifest-path src-tauri/Cargo.toml`：215 passed、0 failed、9 ignored。
- `npm run test:theme-browser`：本机 Chrome 通过；帮助/法律 26 个布局、122 项双语内容，反馈/支持作者/AI 配置 30 个布局，依赖弹框 48 个布局，以及更新弹框双主题、双语、四种尺寸和焦点锁检查。控制台错误为 0。
- 修正的是综合主题测试的旧假设：Escape 前显式聚焦帮助页；法律导航从 6 项更新到当前 8 项，并验证新增帮助/反馈按钮。没有修改对应业务行为。
- 正式打包后的 `npm run test:release-artifacts` 再次通过；首页、懒加载及文档均为 71 工具、12 分类，集成审计 `--strict` 通过，双语键与占位符无缺口。
- 官方 npm registry 的生产依赖与完整依赖 `npm audit` 均报告 0 vulnerabilities。锁文件依赖范围本轮未变；实际 Vite 8.3.4、Tauri JS API 2.12.3 与生产 Rust 构建兼容。
- `scripts/test-windows-installer-native.ps1`：15 项隔离回归通过。核对安装目录、安装程序哈希、卸载与自启动项所有权；验证有效运行时、缺失/无效版本、更新补装、引导器失败及 3010 重启返回码。使用独立产品身份与测试注册表，不卸载宿主机 WebView2，不启动第二个真实应用实例。
- `git diff --check` 通过。详细日志留在 Git 忽略的 `tmp/final-production-*.log`，安装器证据位于 `tmp/installer-native-e5da501da466497e9e6085285ef48ac4/`。

## 验证边界与发布顺序

- 隔离安装器测试复用生产载荷、修改为独立测试身份；WebView2 缺失、失败及重启分支使用桩，不等同于无 WebView2 的全新 Windows 虚拟机或真实重启验收。本轮按用户此前决定不做这些实机环境测试。
- `embedBootstrapper` 仍需联网下载微软运行时，并非离线完整 WebView2；不承诺所有设备或网络环境均已覆盖。
- 既有大 JS chunk、crypto externalization 和 Windows linker 提示继续保留，未发现新增阻断问题。
- 必须先在 `https://toolknit.com/exe.html` 准备可下载的新安装包，再发布较高的 GitHub/AtomGit 正式标签，避免强制更新指向尚未就绪的包。
- 本轮没有提交、推送、修改版本、创建标签、上传安装包或发布 Release。
