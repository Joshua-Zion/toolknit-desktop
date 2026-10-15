# V3.1 发布前检查报告

检查启动：2026-10-13；依赖修补验证完成：2026-10-14。版本：3.1.0，尚未发布。分支：`codex/v3-release-workflow`。

2026-10-14 后续安装器修补：已生成新的生产配置 NSIS 包，15 个隔离执行场景与全部 102 项发布脚本通过。最新安装包哈希、测试边界及尚未执行的干净 Windows 虚拟机/重启验收见 [Windows 安装验证](WINDOWS_INSTALLER_VALIDATION.zh-CN.md)。下文的旧安装包状态保留为此前检查快照，不能作为当前产物信息。

结论：生产配置、用户更新说明、私有 Skill 隔离、依赖修补及项目回归检查已完成。官方 npm 审计为零漏洞，隔离目录已用当前锁文件执行全新 `npm ci` 并完成受影响回归。此次没有提交、推送、签名、创建标签、上传安装包或发布 npm / GitHub Release。

## 已完成的整理

- 正式入口为 `npm run build:release-package`，不加载测试配置或 `qa-devtools` feature。生产主窗口与截图辅助窗口关闭 DevTools，能力清单显式保留 `default`、`screenshot-windows`，避免截图窗口权限丢失。
- Vite 生产构建显式关闭 source map；隔离的 F12 测试流程仍保留供后续维护，不影响正式默认配置。
- 根目录 [changelog.md](../../changelog.md) 将连续迭代合并为用户可读的最终功能说明，保留 V3.1 未发布状态；同步 [更新预告](../../docs/desktop-update.md)，保留已发布历史。
- 原始详细日志完整备份到 `.codex-backups/release-preflight-20261013/changelog-internal.md`，该目录由 Git 忽略，不作为发布资源。
- 维护 Skill 仅保存在用户的私有 Skill 目录。Git 忽略与发布产物检查排除 Skill、内部维护记录、调试配置、测试目录和 source map；没有改动应用的 Apache-2.0 授权协议。
- 发布资源检查继续核对默认背景、蜘蛛、Logo 与捐赠图片的源文件和构建文件字节一致性，未删除产品素材或授权说明。

责任文件：`.gitignore`、`README_EN.md`、两处用户更新说明、`package.json`、`vite.config.js`、`tauri.conf.json`、`scripts/lib/release-file-policy.mjs`、发布产物审计、QA 配置契约测试及维护指南。未修改版本号、原生命令、事件、storage key 或 CLI/MCP 参数；新增独立正式构建脚本和产物排除检查。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run test:release` | 最终依赖对齐后的隔离环境重跑通过全部 101 项脚本，包含架构、项目安全、CLI/MCP、版本、构建与发布产物审计 |
| 版本一致性 | 8 个 manifest、4 个运行时常量、70 个工具页标签、4 处法律版本说明通过 |
| Skill 集成严格审计 | 71 个工具、12 个分类；首页、懒加载与 README 一致，中英文无缺键或占位符差异 |
| 私有维护 Skill 校验 | `quick_validate.py` 通过；仓库未跟踪私有 Skill |
| 发布资源 | 17 个 public 文件、550 个构建文件、31 项原生资源通过；未发现私有维护文件或调试注入 |
| 实际生产编译 | `npm run build:release-package -- --no-bundle` 成功 |
| 实际编译 feature | `custom-protocol`、`default`，不含 `qa-devtools` |
| 生产二进制 | 未发现 `toolknit.qa-devtools` 注入或 `remote-debugging-port=9223` 标记 |
| 工作区格式 | `git diff --check` 通过 |

Rust 完整回归为 207 passed、7 ignored；Edge Markdown 双主题专项覆盖流程图、公式、导出安全、关闭重开和原生输出路径。相关行为证据和真实 Windows 未覆盖项见 [稳定性报告](V3_STABILITY_REVIEW_20261013.zh-CN.md)。

## 依赖安全与可重复构建

使用官方 npm registry 执行全量审计，桌面端 339 个依赖记录、CLI 131 个依赖记录均为 0 vulnerabilities。修补同时覆盖生产和开发依赖，未使用 `npm audit fix --force` 或无约束 override。

| 包 | 最终锁定版本 | 修补与验证 |
| --- | --- | --- |
| brace-expansion | 锁定 1.1.21 / 2.1.7 | 已应用补丁版本并通过桌面、CLI 全新安装审计 |
| markdown-it | 锁定 15.0.2 | 已应用补丁版本；Markdown linkify、公式、Mermaid 和导出安全回归通过 |
| DOMPurify | 锁定 3.4.17 | 已应用补丁版本；预览与 HTML 导出保留 MathML，同时继续过滤危险链接和事件属性 |
| Mermaid / 嵌套 KaTeX | Mermaid 12.2.0；顶层 KaTeX 0.18.4 | 通过升级 Mermaid 移除受影响的嵌套 KaTeX 版本；流程图、时序图、类图、状态图回归通过 |
| source-map-js | 锁定 1.2.2 | 开发依赖审计发现并同步修补，避免只修生产依赖遗漏开发链 |

隔离目录 `D:/Toolknit EXE 8.30/.codex-backups/release-clean-20261013/toolknit-desktop` 先确认没有 `node_modules`，再使用当前 `package-lock.json` 执行全新 `npm ci`，安装 295 个包；安装后的版本与锁文件逐项核对，并重新运行审计、构建和受影响浏览器测试。CLI 也在无 `node_modules` 的目录中执行全新安装并通过审计。该验证覆盖当前源码的可重复依赖安装，不等同于全新 Windows 虚拟机的安装器、重启或升级验收。

隔离目录包含当前未提交源码快照，而非仅测试旧 HEAD；源码、依赖清单与锁文件已核对一致。Rust 回归和生产编译复用原工作目录的编译缓存，并非全新 Rust 缓存验证。浏览器脚本借用原目录的 Playwright 测试驱动，应用构建和运行依赖来自隔离目录的全新安装。

Rust 锁文件同步将 `quinn-proto` 更新到 0.11.18，并通过 `cargo test --locked`；离线缓存 RustSec 数据库审计为 0 vulnerabilities，保留 `proc-macro-error 1.0.4` 未维护提示和 `glib 0.18.5` 信息项。在线 RustSec 数据库刷新因网络连接失败未能确认新鲜度，不能把离线数据库结果表述为在线最新审计。

已用 `cargo tree --locked --target x86_64-pc-windows-msvc -i quinn-proto` 和 `-i glib` 核实：两者均不在当前 Windows 默认生产依赖链中。跨平台或以后启用 HTTP/3 时需重新评估；未通过忽略规则压制 RustSec 信息。

Tauri 前端 API 与对话框插件已分别统一到与 Rust 端匹配的 `2.12.3` 和 `2.8.2`；这是干净生产构建首次暴露的版本契约问题，已修复而不是绕过检查。Mermaid 12 升级后的编辑器行为已通过 focused、双主题浏览器和导出安全回归。

## 生产程序与安装包状态

本轮只编译生产程序，没有生成新的正式安装包。生产程序位于 `src-tauri/target/release/toolknit-desktop.exe`：

- 文件 / 产品版本：3.1.0；大小：55,478,784 bytes。
- SHA-256：`89CA7C88895FE86E6E315572FF80FE55090FC49AA7EA7B8B4E937225EC87E1A1`。
- Authenticode 状态：`NotSigned`。没有签名授权或签名操作，不将其描述为已签名。

此前生成的 `F12-test-20261013-222010` 安装包及同目录遗留的通用命名 setup 都来自测试配置，不能改名作为正式安装包发布。正式安装包、签名、覆盖升级、重启登录和真实托盘验收仍需单独授权和 Windows 环境检查。

## 剩余验收与维护复盘

用户反馈的偶发关闭无响应和托盘恢复后导航消失尚未在真实 Windows 主 WebView 复现；本轮没有把编译成功当作该问题已彻底解决。重启登录、长期常驻、多显示器 DPI 与正式安装/覆盖升级仍需原生环境验收，浏览器验证不替代这些场景。

既有大 chunk、浏览器 crypto externalization、Vite plugin timing、Windows linker 消息和 `STATIC_VCRUNTIME` 弃用提示属于非阻断构建提示；它们不代表本轮依赖审计失败。

本轮经验已补入私有 Skill：干净依赖验证使用当前源码与锁文件，先构建前端再执行需要嵌入产物的 Rust 门禁，核对 Tauri JS/Rust 版本并实际生产编译；全新 npm 安装、共享 Rust 编译缓存与 Windows 安装验收分别报告。Skill 校验通过，仍仅保留在用户私有目录。现有工作区改动均保留，未执行清理、回退或 Git 远端操作。
