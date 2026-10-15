# 版本检查与代码许可维护

本轮实现日期：2026-10-14。应用版本仍为 3.1.0，尚未发布。

## 版本来源与发布顺序

- GitHub：`https://api.github.com/repos/ZihangDong/toolknit-desktop/tags`。
- AtomGit：`https://api.atomgit.com/api/v5/repos/ZihangDong/toolknit-desktop/tags`。
- 两处并发读取，任一来源成功即可；按语义版本选择较高的正式标签，忽略预发布和无关标签。不读取 Release 正文或远程 Markdown。
- 单源最多 3 页，每页 100 条，响应上限 512 KiB，8 秒超时覆盖请求头、正文及分页。缓存 6 小时，手动检查强制刷新；镜像暂时落后不会覆盖已确认的较高版本。
- 下载地址始终为 `https://toolknit.com/exe.html`，不会使用 API 或缓存里的任意跳转地址。检查只请求公开标签，不上传用户文件或凭据。
- 主应用可见后检查，无需停留首页；托盘隐藏启动等待窗口恢复，网络恢复可重试失败检查。浏览器预览与取色辅助窗口不自动检查。
- 新版弹框无关闭、稍后或更新说明入口；Escape、背景点击、打开官网均不会解锁。浏览器启动失败提供重试。下载安装后重新启动应用，不做静默安装。
- **先确保官网已提供可用安装包，再发布正式版本标签。** 两处有任一较高标签即可触发强制更新，不要求镜像完全同步。镜像自动同步属于托管平台配置，本轮未设置。
- 两处都不可用时不阻止应用使用；旧版客户端不会因仓库变化自动获得新检查实现，需要安装新版。

## 责任边界与公开契约

- `src/update-service.js`：标签来源、版本校验、分页/正文/时间边界与 `toolknit.update-check.v2` 缓存；不继续使用 v1 的延后记录。
- `src/app/update-runtime.js`：版本状态与主窗口自动检查；生命周期管理定时器、可见性及联网监听，页面退出拒绝迟到结果。
- `src/update-dialog.js`、CSS 与静态模板：原生顶层 dialog、焦点锁、语言与主题、下载失败重试及幂等销毁。CSS 显式设置 `margin: auto`，避免全局 reset 破坏居中。
- 新模板 ID：`updateDialog`、`updateDialogTitle`、`updateDialogCopy`；按钮数据属性：`data-update-download`；状态类：`update-dialog-open`。没有新增 Tauri command、CLI/MCP 工具或文件上传接口。
- 2026-10-14 预览反馈调整：去除下载按钮自动聚焦时的绿色轮廓，保留焦点锁与键盘透明度反馈；火箭白天黑色、深色白色，仅弹框打开时循环小幅位移/转动，减少动态效果时停用动画。
- 已删除旧 `update-preview.js`、CSS、HTML 与旧浏览器测试 helper；设置及首页引用改为新弹框。

## 许可范围

- 根目录、桌面端与 CLI 的 LICENSE 使用未经改写的官方 PolyForm Noncommercial 1.0.0 正文；NOTICE 指明作者、商业授权联系与保留权利。
- 新授权的作者代码及修改适用新许可。旧 Apache-2.0 授权不撤销；原文本保存在各层 `LICENSES/Apache-2.0.txt`。未改动旧代码、既有第三方贡献与依赖保留原许可。贡献者保留自身版权。
- Joshua-Zion PR #67 的颜色空间比较改编保留 Apache-2.0 声明，不借更换顶层 LICENSE 改写第三方权利。
- PolyForm Noncommercial 是源码可见许可，不是 OSI 开源许可；不将非商业许可描述为“禁止复制”或撤销历史授权。
- package、锁文件根包、Cargo、README、贡献说明和程序声明同步；CLI 包及桌面安装资源携带 LICENSE、NOTICE 与旧 Apache 正文。

## 验证与边界

- `test:update-service`：双源、单源失败、双源失败、正式版本筛选、乱序分页、大小/时间边界、并发、缓存及可见性/联网/退出恢复。
- `test:license`：官方正文摘要、三处一致性、历史授权、第三方例外、metadata 及打包资源。
- `scripts/test-update-dialog-browser.mjs`：双主题、中英文、4 种窗口尺寸、实际设置入口、居中、滚动、焦点锁、Escape/背景点击、重复检查、下载失败/重试、语言切换和销毁。
- 架构、构建、安全、完整发布门禁与 Rust 验证通过；发布门禁 103 项脚本，Rust 215 passed、9 ignored。较大 JS chunk 和既有 crypto externalization 仍为已知构建提示。
- 真实公开接口检查返回正式版本 `3.0.0` 和官网地址。较高版本弹框使用隔离的 API 响应验证，没有发布测试标签。
- 更新弹框专项已使用本机 Chrome 通过。初次综合 `test:theme-browser` 超时实际发生在帮助页的 Escape 关闭检查，返回按钮已正常扩展至 64px；调整窗口及截图后测试未将焦点放回帮助页。最终检查补上显式焦点，并把法律页导航按钮断言同步为当前 8 项（含帮助、反馈），完整综合主题回归通过，控制台错误为 0。
- 2026-10-14 已按用户授权完成无签名生产安装包、资源审计及 Windows 隔离安装器 15 项回归；缺失 WebView2 的分支使用桩模拟，未做全新虚拟机或真实重启验收。未提交、推送、创建版本标签或发布 Release。安装包及校验信息见 [最终打包验证记录](RELEASE_3_1_FINAL_CHECK.zh-CN.md)。
