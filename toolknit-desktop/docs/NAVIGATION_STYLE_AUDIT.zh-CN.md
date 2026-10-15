# ToolKnit Desktop 导航样式审计

审计与接入日期：2026-10-10。实际 package 版本：3.1.0。

## 当前接入实现

已将用户确认的隔离预览效果接入工具页及采用完整工具导航的二级页面。首页保留原导航；AI 配置和更新页保留专用栏。2026-10-11 程序声明与使用规范已改为完整共享工具导航。下方第 1–7 节保留接入前的审计基线，其中数量和样式统计不代表接入后的状态。

- `src/shared/tool-page-chrome.js` 统一准备图标、按钮角色与导航布局类，幂等执行，不另绑事件。通过共享工具壳、可信模板挂载及懒加载边界接入，保留旧 DOM ID、动作属性和原事件代理。
- `src/tool-nav-unified.css` 统一视觉：白天白底、深色近黑底；返回为反色实心圆，悬停向右扩展成胶囊并同步推动标题，三角形变为左箭头；网页版和支持作者使用可重复触发的图标变换，设置和窗口控制使用浅色方形悬停底。系统启用减少动态效果时停用动画与过渡。法律页已复用 `toolTopbarMarkup` 完整动作和帮助中心布局，不再保留紧凑导航例外。
- 删除旧版返回描边、上移/整体缩放、分散在工具/主题里的导航颜色及悬停规则，移除提词器无消费者的旧按钮规则。预览页复用正式共享组件，迁移用临时清理脚本已删除。
- 最大化图标仍由 `app/window-runtime.js` 更新；本轮未更改窗口动作、工具业务、版本号或原生命令。

回归入口：`node scripts/test-tool-page-chrome-browser.mjs`，另复用现有主题、PDF 安全页和重复文件工具浏览器回归。测试证据保存在本地忽略目录 `tmp/`，最终通过情况同步根目录 `changelog.md`。浏览器夹具无法替代 Windows 原生窗口动作实测。

## 接入前审计基线

## 1. 结论与统计口径

覆盖 70 个桌面工具入口（66 个独立工具 overlay），以及首页、设置、帮助、反馈、捐赠、法律、AI 文档编辑子页、PPT 草稿编辑子页、AI 配置、更新品牌栏、更新舞台栏。共 81 个逻辑导航对象、77 个独立导航区域；5 个开发者工具入口共用同一导航区域，因此入口数与独立区域数不同。

| 统计项 | 结果 | 定义 |
| --- | --- | --- |
| 导航背景配色 | 8 组 | 同一对象白天/深色的 background-color 配对 |
| 整体导航样式 | 18 组组合 | 双主题背景，加各按钮正常/hover 的文字、背景、有效边框、圆角、transform 和返回描边状态 |
| 按钮样式组合 | 返回 9、网页版本 9、支持作者 8、设置 5、最小化 6、最大化 6、关闭 7 | 按按钮角色分别比较双主题正常/hover；缺少该按钮的对象不计入该角色 |
| 悬停表现 | 6 类 | 变色、描边绘制、上移、放大、图标移动/文字隐藏、无变化；可以叠加 |

18 组是本报告限定指标下的实际样式组合，不代表存在 18 套独立导航模板。背景透明度细微差异也会形成一组；首页和专用编辑器的合理差异不应一律判定为缺陷。计数未包含所有字体、尺寸、阴影与动画时长差异，不能作为全量视觉等价证明。

最明显的问题是：多数工具的深色“网页版本”没有悬停反馈；工具页设置和窗口按钮也普遍没有反馈；清理重复文件单独采用放大效果；PPT 草稿编辑子页白天返回按钮仍为浅色文字，存在可读性风险。

## 2. 导航背景的 8 组配色

下表数量按逻辑入口计，总数 81。透明背景实际观感还取决于父级背景、背景图和滤镜。

| 白天模式 | 深色模式 | 数量 | 对象 |
| --- | --- | --- | --- |
| 白色，透明度 0.96 | rgba(8,8,9,0.94) | 57 | 55 个常见工具页、AI 文档编辑、PPT 草稿编辑 |
| #ffffff | rgba(8,8,9,0.94) | 15 | 7 个 PPT 工具、6 个开发者入口、设置、捐赠 |
| 白色，透明度 0.98 | rgba(8,8,9,0.94) | 1 | 提词器 |
| 白色，透明度 0.97 | rgba(8,8,9,0.94) | 1 | 智能颜色替换 |
| #ffffff | rgba(8,8,9,0.92) | 2 | 首页、帮助 |
| #ffffff | rgba(8,8,9,0.72) | 1 | 反馈 |
| #ffffff | transparent | 2 | 法律、AI 配置 |
| transparent | transparent | 2 | 更新品牌栏、更新舞台栏；使用父级背景 |

## 3. 不同按钮的实际表现

### 网页版本

| 页面组 | 白天 hover | 深色 hover |
| --- | --- | --- |
| 通用工具、4 个 PDF 特例、开发者工具，共 60 入口 | 文字 #60636a 变 #171717，背景变 #f0f1f3 | #8b8b87 文字、透明背景均不变 |
| 7 个 PPT 工具 | 文字变 #17181b，背景变 #f0f1f3 | 无变化 |
| 提词器 | 背景变 #e9eaec | 无变化 |
| 清理重复文件 | 透明背景，整体 scale(1.05)，文字变 #202428 | 透明背景，整体 scale(1.05)，文字变 #f2f3f4 |
| 智能颜色替换 | 无变化 | 无变化 |
| 首页、帮助、反馈、捐赠 | 文字变 #111111，背景变 #eeeeee | 文字变 #f5f5f3，背景变 #171717 |
| 设置 | 背景变 #eeeeee | 无变化 |
| AI 文档编辑子页 | 背景变 #f0f1f3 | 有浅色文字和 #171717 悬停背景 |
| PPT 草稿编辑子页 | #8b8b87 文字、透明背景无变化 | 同样无变化 |

70 个工具入口中，69 个深色网页版按钮没有以上指标的 hover 变化，只有清理重复文件采用放大反馈；白天智能颜色替换也没有变化。这是最终计算样式结果，不是仅凭 CSS 中有没有写 :hover 判断。

### 返回

- 大多数页面采用胶囊按钮、微弱背景变化和 conic-gradient 描边；共享描边绘制时间为 560ms，不上移。
- 智能颜色替换白天背景 white 变 #f0f1f3；设置和 AI 文档编辑白天 white 变 #eeeeee，同时保留描边。
- 帮助、反馈、法律采用旧返回表现，没有同一套描边；帮助/反馈深色可上移 1px。
- PPT 草稿编辑子页白天导航底色为白色 0.96，返回文字却为 #f5f5f3，按钮底色仅白色 0.03/0.06；这是优先修复的白天漏适配风险。
- AI 配置白天按钮为 38px 高，灰色悬停底和边框；深色仍为旧白色胶囊黑字，hover 图标移向中心、文字隐藏。源码导航高度也分别为 68px 与 50px，主题间结构不一致。

### 支持作者

- 工具页常见白天黑底白字，hover 背景 #171717 变 #303030，并上移 1px；深色浅底黑字主要通过上移反馈。
- 4 个 PDF 特例、7 个 PPT、提词器白天 hover 连边框一起变 #303030，通用组的边框仍为 #171717。
- 智能颜色替换白天只有上移，背景没有变色。
- 首页深色 hover 背景变纯白；帮助、反馈、捐赠白天变色但不上移，深色又有上移。
- PPT 草稿编辑子页白天仍是浅底黑字，与其他工具的黑底白字不同；应与返回漏适配一起检查。

### 设置和窗口按钮

- 70 个工具入口的设置、最小化、最大化在双主题下均没有本次检测指标的 hover 变化。
- 工具关闭按钮同样普遍无变化；提词器仅白天有红底白字，深色仍无变化。
- 首页、帮助、反馈、捐赠存在灰色背景反馈，与工具页不一致。
- 设置页的当前设置按钮有固定选中背景，这属于当前页状态，不应当作 hover 故障。
- AI 文档编辑子页的设置按钮白天无反馈，深色有反馈；PPT 草稿编辑子页两主题均无反馈。
- 更新舞台窗口按钮是 28px 圆形，普通导航动作常用 34px、6px 圆角；舞台关闭 hover 为 #cf3b3b。舞台固定深色设计属于特殊场景，不能只凭按钮白字判定为主题遗漏。

## 4. 18 组组合对应的全部页面

下面保留源码 toolId，便于后续直接定位，不需要再次猜页面归属。

| 组 | 数量 | 页面/入口 |
| --- | --- | --- |
| 通用工具 | 50 | 见下方完整列表 |
| PDF 支持按钮边框特例 | 4 | pdf-to-scan、pdf-page-number、pdf-crop、pdf-editor |
| PPT 工具 | 7 | ppt-text、ppt-compress、ppt-outline、ppt-to-pdf、ppt-to-image、ppt-images、ppt-draft |
| 提词器 | 1 | teleprompter |
| 清理重复文件 | 1 | duplicate-file-cleanup |
| 智能颜色替换 | 1 | image-color-replace |
| 开发者工具 | 6 | hash-crypto、json-tools、base64、url-codec、uuid、jwt |
| 首页 | 1 | home |
| 设置 | 1 | settings |
| 帮助 | 1 | help |
| 反馈 | 1 | feedback |
| 捐赠 | 1 | donation |
| 法律 | 1 | legal |
| AI 文档编辑子页 | 1 | ai-document-editor |
| PPT 草稿编辑子页 | 1 | ppt-draft-editor |
| AI 配置 | 1 | ai-key |
| 更新品牌栏 | 1 | update-brand |
| 更新舞台栏 | 1 | update-stage |

通用工具 50 个入口：

```text
clipboard-history, excel-to-pdf, pdf-rotate, pdf-split, pdf-merge,
pdf-to-image, pdf-text-markdown, pdf-ai-markdown, pdf-encrypt, pdf-decrypt,
pdf-enhance, pdf-compress, transcription, audio-extract, convert,
audio-clip, bpm-detect, large-file-cleanup, c-drive-cleanup, color-extractor,
video-convert, video-frame, video-gif, bg-removal, markdown-editor,
image-convert, image-compress, image-crop, image-stitch, icon-gen,
hardware-overview, hardware-cpu-memory, hardware-gpu-display,
hardware-mainboard, hardware-storage, hardware-network-devices,
hardware-power-sensors, color-space-compare, password-gen, timestamp-calc,
bmi-calc, mortgage-calc, interest-calc, typing-test, text-stats,
text-format, ai-polish, ai-translate, ai-doc, ai-table
```

## 5. 来源与不统一原因

已经存在共享导航模板，本次发现主要来自样式叠加，不需要再造一套导航组件。

| 责任/覆盖层 | 位置（桌面端目录相对路径） | 作用 |
| --- | --- | --- |
| 工具导航模板 | src/shared/tool-page-shell.js:2 | toolTopbarMarkup()，共享返回、网页版、支持、设置、窗口按钮 |
| PDF 工作台复用 | src/shared/pdf-workbench.js:10 | 使用既有导航；根级 tool-page-shell.js 是兼容入口 |
| 统一工具样式 | src/tool-nav-unified.css:253 | 高优先级普通状态给网页版透明背景/弱文字，会压过部分低优先级 hover |
| 同文件追加层 | src/tool-nav-unified.css:487 | 再次定义广泛选择器；与前面的高优先级规则叠加 |
| 返回描边 | src/tool-nav-unified.css:553 | conic-gradient 描边，560ms，并有 reduced-motion 处理 |
| 按钮尺寸/圆角 | src/tool-nav-unified.css:647 | 常用动作 34px，网页版 6px 圆角，支持按钮胶囊 |
| 首页样式 | src/styles/pages/home-v2.css:137 | 独立 hover、支持按钮上移 |
| PDF 白天覆盖 | src/styles/themes/pdf-tools-light.css:35 | 白天导航背景和按钮颜色/hover |
| PPT 白天覆盖 | src/styles/themes/ppt-tools-light.css:84 | PPT 单独的白天按钮覆盖 |
| 辅助页白天覆盖 | src/styles/themes/settings-light.css:44、help-light.css:32、secondary-pages-light.css:16 | 设置、帮助、反馈、捐赠另有按钮规则 |
| 清理重复文件例外 | src/features/duplicate-file-cleanup/duplicate-file-cleanup.css:4 | 局部透明底、scale(1.05)、160ms |
| 颜色替换白天规则 | src/styles/themes/image-color-replace-light.css:78 | 存在 hover 规则，但最终网页版 hover 被其他规则压住 |
| 提词器白天例外 | src/styles/themes/teleprompter-light.css:57 | 网页版灰底和关闭按钮红色 |
| 嵌套编辑器 | src/features/ai-document/template.html:140、src/features/ppt-draft/template.js:268、ppt-draft.css:989 | 子页模板和局部头部样式，与主工具页主题覆盖不完全一致 |
| AI 配置旧动画 | src/styles/pages/account-feedback.css:12 | 旧图标移动/文字隐藏；secondary-pages-light.css:110 又在白天重写 |
| 更新专用导航 | src/update-preview.css:442 | 专用品牌栏/舞台栏、圆形窗口按钮 |

`src/styles/components/navigation.css` 目前只有迁移占位说明，尚未成为统一样式的实际责任文件。

`index.html:66–71` 的加载顺序为工具页面样式、tool-nav-unified.css、themes/index.css；工具自身 CSS 在懒加载时又会加入。共享模板相同并不保证最终颜色和 hover 相同；选择器优先级、主题覆盖和后加载的 feature CSS 共同决定结果。

## 6. 建议的后续处理顺序

1. 先由用户确定通用按钮的目标效果：灰底变色、轻微放大或描边，避免继续逐工具补不同方案。
2. 复用现有 tool-page-shell，集中维护导航颜色、圆角、hover 和动画 token。优先整理既有统一 CSS 的冲突，不新增导航组件，不大范围改工具业务。
3. 优先修复 PPT 草稿编辑白天返回的浅字问题，以及网页版/窗口按钮的 hover 丢失；然后收敛 PDF/PPT/辅助页与清理工具的局部覆盖。
4. 首页保留自己的入口职责；更新舞台等专用导航明确列为例外。统一同角色按钮的交互，不要求所有页面结构完全相同。
5. 修复后再做双主题正常/hover 检查，并抽查多工具连续打开的 CSS 加载顺序，保留主题切换、返回、窗口操作和 reduced-motion 回归。

这些都是待确认的修复建议，本轮没有修改产品 CSS、版本、changelog 或 Git 历史。

## 7. 方法、证据与限制

- 使用 Edge headless + Playwright，1440x900 浏览器窗口，独立页面隔离每个工具的首次懒加载，读取最终 getComputedStyle()，并以 CDP 强制 :hover。为取得终态临时禁用按钮 transition；动画类型和时长另读源码，因此没有宣称逐帧动画视觉验收。
- 覆盖所有 70 个工具入口，核对首页 data-tool 与 lazy specs，并补测不同窗口动作 data 属性。没有工具加载失败或未捕获 pageerror。
- 转写在浏览器环境禁用，采用模板挂载后的样式审计；不代表原生转写已验证。辅助页和编辑器子页以展示已有模板检测，没有生成真实 AI 文档或 PPT。辅助模板部分祖先临时设为 display:flex，因此不把其测得的布局尺寸作为产品故障证据。
- 审计阻止外部 HTTP 请求，没有输入用户文件或真实密钥，没有运行清理、AI 生成或更新安装。本轮未验证 Windows 原生窗口操作、低高度/窄窗口布局、连续多工具 CSS 累积和像素级最终观感。
- 原始结果和临时 harness 留在本地 ignored tmp/navigation-audit/computed.json、tmp/nav-audit.mjs；报告自身包含分组和关键色值，不依赖提交这些临时文件。
- 本轮产物为审计报告和外部维护 Skill 规则更新；文档检查不代替后续样式修复的 build/行为回归。

## 8. 2026-10-10 接入结果

上文第 1–7 节保留接入前的审计快照，其中旧样式行号与修复建议不代表当前实现。

- 已将用户确认的隔离预览效果接入共享工具导航。`src/shared/tool-page-chrome.js` 只准备图标及内部样式类，由既有工具壳、可信模板挂载和懒加载边界调用；动作继续交给原事件代理和窗口运行时，保留 DOM ID 与动作属性。
- 当前导航颜色、尺寸和交互统一维护在 `src/tool-nav-unified.css`。返回实心圆悬停向右展开并推动标题；网页版和支持作者图标切换可重复触发；窗口与设置按钮提供方形悬停背景。首页保留独立导航；当时法律内容栏、AI 配置和更新页保留专用结构，法律页已在 10 月 11 日补齐。
- 清理旧导航颜色、返回描边、整体缩放和重复悬停规则，以及无消费者的提词器按钮样式；导航 CSS 从约 850 行收敛至约 205 行。隔离预览复用正式模块，不维护第二套实现；审计证据和预览留在 ignored `tmp/`，不进入发布源码。
- 70 个工具双主题审计、5 个代表工具交互回归、减少动态效果、真实应用启动、架构、构建、99 项发布回归、1280 项安全检查、CLI/MCP 和发布产物审计通过。
- Windows 原生窗口动作需桌面程序验证；当时未恢复本地缺失的捐赠图片，相关主题图片检查未通过，删除来源未确认。保留既有构建警告。当时未提交、推送、打包或发布。

## 9. 2026-10-11 素材恢复与法律导航补齐

- 恢复全部 16 份受 Git 跟踪的缺失图片，每份内容均与 HEAD 原件哈希一致；包含 5 份程序素材、3 份文档素材和 8 份 README 分类图。无法从未提交删除确认操作者或删除时间，不将其归因于用户。
- 程序声明/使用规范复用共享 `toolTopbarMarkup`、现有动作代理和 Help Center 布局，补齐右侧 6 个动作。顶部固定显示 `ToolKnit Program Declaration` / `ToolKnit Usage Policy`，正文与侧栏保持双语；清除 `.tk-nav-compact` 和法律页旧布局覆盖。
- 复用帮助页的设置关闭逻辑，进入法律页时移除设置的可见状态与临时层级；法律页打开设置时关闭自身，避免支持作者弹框或设置页被遮挡，不新增竞争 z-index。
- 图片解码、实际默认深色壁纸、26 组帮助/法律布局、118 个中英文帮助章节、30 组二级页面布局与产物素材检查通过。旧安装包未更新，不作为本次修复验收依据。
- 产物审计新增必要图片存在、非空及源/构建字节一致门禁。清理素材必须追踪动态路径、CSS、懒加载与文档消费者，不能只凭 import 使用次数判断。
