import { getLang } from './i18n.js';
import { HELP_CONTENT_EN } from './help-data-en.js';

export const HELP_CONTENT = {
  'overview': {
    title: '功能概览',
    html: `<div class="help-doc">
      <h2>ToolKnit 功能概览</h2>
      <p>ToolKnit 是一款<strong>纯本地</strong>多功能工具箱桌面应用，涵盖 PDF、图像、音频、视频、文本、计算器、创意和 AI 八大工具分类，所有文件处理均在本地完成，不上传服务器。</p>

      <h3>工具分类一览</h3>
      <div class="help-tool-grid">
        <div class="help-tool-card"><div class="help-tool-card-name">PDF 工具</div><div class="help-tool-card-desc">合并、拆分、旋转、加密、解密、压缩、文字增强</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">图像工具</div><div class="help-tool-card-desc">格式转换、图片压缩、图标生成器</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">音频工具</div><div class="help-tool-card-desc">格式转换、BPM 测速、剪辑、裁剪、合并、提取</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">视频工具</div><div class="help-tool-card-desc">格式转换、压缩、裁剪、转 GIF、合并</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">文本工具</div><div class="help-tool-card-desc">文本对比、字符统计、格式化、编码转换</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">计算器工具</div><div class="help-tool-card-desc">科学计算、单位换算、汇率换算、贷款计算</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">创意工具</div><div class="help-tool-card-desc">配色提取、配色生成、密码生成器、打字测试</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">AI 工具</div><div class="help-tool-card-desc">AI 润色、AI 翻译、AI 文档、AI 对话</div></div>
      </div>

      <h3>核心特性</h3>
      <ul>
        <li><strong>纯本地处理</strong>：所有文件操作在设备本地完成，文件不上传任何服务器</li>
        <li><strong>批量操作</strong>：支持批量文件处理，提高工作效率</li>
        <li><strong>拖拽上传</strong>：支持拖拽文件到工具页面直接处理</li>
        <li><strong>双语界面</strong>：支持中文和英文切换</li>
        <li><strong>自动更新</strong>：支持在线检查并下载新版本</li>
        <li><strong>FFmpeg 扩展</strong>：音视频工具自动下载 FFmpeg 扩展包</li>
      </ul>

      <div class="help-note">
        <p>部分工具（如音频转换、视频转换）需要 FFmpeg 扩展包，首次使用时会提示下载，下载后即可离线使用。</p>
      </div>
    </div>`
  },

  'install': {
    title: '安装与启动',
    html: `<div class="help-doc">
      <h2>安装与启动</h2>

      <h3>系统要求</h3>
      <ul>
        <li>操作系统：Windows 10/11（64 位）</li>
        <li>内存：建议 4GB 以上</li>
        <li>磁盘空间：至少 200MB（含 FFmpeg 扩展包约 300MB）</li>
      </ul>

      <h3>安装步骤</h3>
      <ol class="help-steps">
        <li>下载 ToolKnit 安装包（<code>.exe</code> 安装程序）</li>
        <li>双击运行安装程序，选择安装路径</li>
        <li>等待安装完成，桌面会出现 ToolKnit 快捷方式</li>
        <li>双击快捷方式启动应用</li>
      </ol>

      <h3>首次启动</h3>
      <p>首次启动时，应用会自动检测系统环境。如果使用音视频相关工具，会提示下载 FFmpeg 扩展包，根据网络情况下载约 80-100MB。</p>

      <div class="help-note">
        <p>安装程序会根据系统语言自动选择下载源（中文用户使用国内源，英文用户使用海外源），确保下载速度最优。</p>
      </div>
    </div>`
  },

  'settings': {
    title: '设置与偏好',
    html: `<div class="help-doc">
      <h2>设置与偏好</h2>
      <p>点击左侧边栏底部的<strong>设置图标</strong>进入设置页面，可进行以下配置：</p>

      <h3>语言切换</h3>
      <p>支持<strong>中文</strong>和<strong>English</strong>两种语言，切换后界面立即生效。</p>

      <h3>版本与更新</h3>
      <p>显示当前版本号，点击"检查更新"可手动检测新版本。如果有新版本，会显示更新日志并提示下载。</p>

      <h3>默认存储位置</h3>
      <p>显示文件默认保存路径（通常为"文档"文件夹下的 ToolKnit 目录），点击"打开文件夹"可快速访问。</p>

      <h3>帮助与反馈</h3>
      <p>点击"帮助中心"打开本帮助页面；点击"反馈 BUG"可提交问题反馈。</p>
    </div>`
  },

  'update': {
    title: '版本更新',
    html: `<div class="help-doc">
      <h2>版本更新</h2>

      <h3>自动检查更新</h3>
      <p>ToolKnit 在启动时会自动检查新版本。如果发现新版本，会弹出更新提示窗口，显示新版本号和更新日志。</p>

      <h3>手动检查更新</h3>
      <ol class="help-steps">
        <li>点击侧边栏底部的<strong>设置图标</strong></li>
        <li>在"版本与更新"区域点击"检查更新"按钮</li>
        <li>如果有新版本，点击"立即更新"开始下载</li>
        <li>下载完成后应用会自动安装并重启</li>
      </ol>

      <h3>强制更新</h3>
      <p>某些关键版本会触发强制更新，用户必须更新到最新版本才能继续使用，确保应用安全性和稳定性。</p>

      <div class="help-note">
        <p>更新下载采用双源策略：中文用户优先从国内源下载，英文用户优先从海外源下载，确保下载速度。</p>
      </div>
    </div>`
  },

  'pdf-merge': {
    title: 'PDF 文件合并',
    html: `<div class="help-doc">
      <h2>PDF 文件合并</h2>
      <p>将多个 PDF 文件按顺序合并为一个 PDF 文件。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在 PDF 工具分类中点击"PDF 文件合并"</li>
        <li>点击"上传 PDF 文件"或拖拽文件到页面</li>
        <li>拖拽文件列表可调整合并顺序</li>
        <li>点击"开始合并"按钮</li>
        <li>等待处理完成，成功后弹出提示并可打开保存文件夹</li>
      </ol>

      <h3>注意事项</h3>
      <ul>
        <li>所有文件必须是 PDF 格式</li>
        <li>合并顺序按列表中的排列顺序</li>
        <li>处理完成后文件保存到默认存储位置</li>
      </ul>
    </div>`
  },

  'pdf-split': {
    title: 'PDF 文件拆分',
    html: `<div class="help-doc">
      <h2>PDF 文件拆分</h2>
      <p>按页码范围将 PDF 拆分为多个文件，或提取指定页面。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传需要拆分的 PDF 文件</li>
        <li>输入要提取的页码范围（如 <code>1-3,5,7-10</code>）</li>
        <li>点击"开始拆分"</li>
        <li>处理完成后在保存目录查看拆分后的文件</li>
      </ol>

      <div class="help-note">
        <p>页码格式支持：单页（<code>5</code>）、范围（<code>1-10</code>）、逗号分隔多段（<code>1-3,5,7-10</code>）。</p>
      </div>
    </div>`
  },

  'pdf-rotate': {
    title: 'PDF 页面旋转',
    html: `<div class="help-doc">
      <h2>PDF 页面旋转</h2>
      <p>旋转 PDF 中的页面方向，支持单页旋转和整体旋转。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传 PDF 文件</li>
        <li>选择旋转角度：90°、180°、270°</li>
        <li>选择旋转范围：全部页面或指定页面</li>
        <li>点击"开始旋转"，完成后下载结果</li>
      </ol>
    </div>`
  },

  'pdf-encrypt': {
    title: 'PDF 文件加密',
    html: `<div class="help-doc">
      <h2>PDF 文件加密</h2>
      <p>为 PDF 文件添加密码保护和权限控制。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传需要加密的 PDF 文件</li>
        <li>设置打开密码（用户密码）</li>
        <li>可选：设置权限密码（所有者密码）</li>
        <li>选择权限：是否允许打印、复制、修改</li>
        <li>点击"开始加密"，完成后下载加密后的 PDF</li>
      </ol>

      <div class="help-note">
        <p>请妥善保管密码，忘记密码后将无法恢复 PDF 内容。</p>
      </div>
    </div>`
  },

  'pdf-decrypt': {
    title: 'PDF 文件解密',
    html: `<div class="help-doc">
      <h2>PDF 文件解密</h2>
      <p>移除 PDF 文件的密码保护和使用限制。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传已加密的 PDF 文件</li>
        <li>输入正确的密码</li>
        <li>点击"开始解密"</li>
        <li>完成后下载解密后的 PDF</li>
      </ol>

      <div class="help-note">
        <p>解密需要知道原密码，无法破解未知密码的 PDF。</p>
      </div>
    </div>`
  },

  'pdf-compress': {
    title: 'PDF 文件压缩',
    html: `<div class="help-doc">
      <h2>PDF 文件压缩</h2>
      <p>压缩 PDF 文件体积，支持三种压缩等级。</p>

      <h3>压缩等级</h3>
      <ul>
        <li><strong>低</strong>：轻度压缩，画质损失最小</li>
        <li><strong>中</strong>：平衡压缩，推荐大多数场景</li>
        <li><strong>高</strong>：最大压缩，体积最小但画质有一定损失</li>
      </ul>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传一个或多个 PDF 文件</li>
        <li>选择压缩等级</li>
        <li>点击"开始压缩"</li>
        <li>处理完成后查看压缩结果，支持打开文件夹</li>
      </ol>
    </div>`
  },

  'pdf-enhance': {
    title: 'PDF 文字增强',
    html: `<div class="help-doc">
      <h2>PDF 文字增强</h2>
      <p>提升 PDF 中模糊文字的清晰度，通过去噪和锐化处理增强文字可读性。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传需要增强的 PDF 文件</li>
        <li>点击"开始增强"</li>
        <li>等待处理完成，下载增强后的 PDF</li>
      </ol>

      <div class="help-note">
        <p>文字增强效果取决于原始 PDF 的扫描质量，对于极度模糊的文档效果可能有限。</p>
      </div>
    </div>`
  },

  'img-convert': {
    title: '图片格式转换',
    html: `<div class="help-doc">
      <h2>图片格式转换</h2>
      <p>支持 JPG、PNG、WebP、BMP、GIF 五种主流图片格式互转，批量处理。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在图像工具分类中点击"图片格式转换"</li>
        <li>上传一个或多个图片文件</li>
        <li>选择目标格式（JPG / PNG / WebP / BMP / GIF）</li>
        <li>点击"开始转换"</li>
        <li>处理完成后弹出成功提示，可打开保存文件夹</li>
      </ol>

      <div class="help-note">
        <p>转换过程保留原始分辨率，不改变图片尺寸。</p>
      </div>
    </div>`
  },

  'img-compress': {
    title: '图片压缩',
    html: `<div class="help-doc">
      <h2>图片压缩</h2>
      <p>压缩图片体积，支持三档画质选择，批量处理。</p>

      <h3>压缩等级</h3>
      <ul>
        <li><strong>低</strong>：高质量，体积较大</li>
        <li><strong>中</strong>：平衡画质与体积（推荐）</li>
        <li><strong>高</strong>：最大压缩，体积最小</li>
      </ul>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传一个或多个图片文件</li>
        <li>选择压缩等级</li>
        <li>点击"开始压缩"</li>
        <li>处理完成后显示压缩结果，可打开文件夹查看</li>
      </ol>

      <p>支持格式：JPG / PNG / WebP / BMP / GIF</p>
    </div>`
  },

  'icon-gen': {
    title: '图标生成器',
    html: `<div class="help-doc">
      <h2>图标生成器</h2>
      <p>上传一张图片，一键生成全套图标（PNG 多尺寸 + ICO + SVG），打包为 ZIP 下载。</p>

      <h3>生成内容</h3>
      <ul>
        <li><strong>PNG 图标</strong>：16/24/32/48/64/96/128/144/152/167/180/192/256/384/512/1024px 共 16 种尺寸</li>
        <li><strong>ICO 文件</strong>：多尺寸 ICO（16~256px），适用于 Windows 应用程序图标</li>
        <li><strong>favicon.ico</strong>：经典网站 favicon（16/32/48px）</li>
        <li><strong>SVG 文件</strong>：矢量图标，任意尺寸不失真</li>
      </ul>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传一张图片（JPG 或 PNG）</li>
        <li>点击"开始生成"</li>
        <li>等待蜘蛛精灵遮罩层显示生成进度</li>
        <li>生成完成后自动下载 <code>icons.zip</code></li>
        <li>成功弹框中可点击"打开文件夹"查看文件</li>
      </ol>

      <div class="help-note">
        <p>图片会自动裁剪为正方形（居中裁剪），建议使用正方形或接近正方形的图片以获得最佳效果。</p>
      </div>
    </div>`
  },

  'audio-convert': {
    title: '音频格式转换',
    html: `<div class="help-doc">
      <h2>音频格式转换</h2>
      <p>支持 MP3、AAC、WAV、FLAC、ALAC、OGG、WMA 等格式互转，批量处理。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在音频工具分类中点击"音频文件格式转换"</li>
        <li>上传一个或多个音频文件</li>
        <li>选择目标格式</li>
        <li>点击"开始转换"</li>
        <li>处理完成后弹出成功提示</li>
      </ol>

      <div class="help-note">
        <p>首次使用音频转换需要下载 FFmpeg 扩展包（约 80-100MB），下载后即可离线使用。</p>
      </div>

      <h3>格式说明</h3>
      <ul>
        <li><strong>MP3</strong>：最通用有损格式，兼容性最好</li>
        <li><strong>AAC</strong>：高压缩比有损格式</li>
        <li><strong>WAV</strong>：无损未压缩格式</li>
        <li><strong>FLAC</strong>：无损压缩格式</li>
        <li><strong>OGG</strong>：开源有损格式</li>
      </ul>
    </div>`
  },

  'bpm-detect': {
    title: 'BPM 节拍测速',
    html: `<div class="help-doc">
      <h2>BPM 节拍测速器</h2>
      <p>上传音频文件，自动检测音乐的 BPM（每分钟节拍数）。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传音频文件</li>
        <li>点击"开始检测"</li>
        <li>等待分析完成，显示 BPM 结果</li>
      </ol>

      <div class="help-note">
        <p>BPM 检测对纯音乐/电子音乐效果最佳，人声为主的歌曲可能检测不够准确。</p>
      </div>
    </div>`
  },

  'audio-clip': {
    title: '音频剪辑',
    html: `<div class="help-doc">
      <h2>音频剪辑</h2>
      <p>波形可视化剪辑，支持区域选择、播放预览、精准裁剪。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传音频文件</li>
        <li>在波形图上拖拽选择要保留的区域</li>
        <li>点击播放预览选中的片段</li>
        <li>确认后点击"裁剪"按钮</li>
        <li>导出剪辑后的音频文件</li>
      </ol>
    </div>`
  },

  'audio-trim': {
    title: '音频裁剪',
    html: `<div class="help-doc">
      <h2>音频裁剪</h2>
      <p>快速截取音频片段，支持淡入淡出效果，精确到毫秒。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传音频文件</li>
        <li>设置起始时间和结束时间</li>
        <li>可选：开启淡入/淡出效果</li>
        <li>点击"开始裁剪"</li>
        <li>导出裁剪后的音频</li>
      </ol>
    </div>`
  },

  'audio-merge': {
    title: '音频合并',
    html: `<div class="help-doc">
      <h2>音频合并</h2>
      <p>将多段音频无缝拼接为一个文件。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传多个音频文件</li>
        <li>拖拽调整合并顺序</li>
        <li>点击"开始合并"</li>
        <li>导出合并后的音频文件</li>
      </ol>
    </div>`
  },

  'audio-extract': {
    title: '音频提取',
    html: `<div class="help-doc">
      <h2>音频提取</h2>
      <p>从视频文件中提取音频轨道，保存为独立音频文件。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传视频文件（支持 MP4 / MOV / MKV 等）</li>
        <li>选择输出音频格式</li>
        <li>点击"开始提取"</li>
        <li>导出提取的音频文件</li>
      </ol>
    </div>`
  },

  'video-convert': {
    title: '视频格式转换',
    html: `<div class="help-doc">
      <h2>视频格式转换</h2>
      <p>支持 MP4、AVI、MKV、MOV、WebM、FLV、WMV、TS 八种格式互转，批量处理。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在视频工具分类中点击"视频格式转换"</li>
        <li>上传一个或多个视频文件</li>
        <li>选择目标格式</li>
        <li>点击"开始转换"</li>
        <li>处理完成后弹出成功提示</li>
      </ol>

      <div class="help-note">
        <p>视频转换需要 FFmpeg 扩展包，首次使用时会提示下载。</p>
      </div>
    </div>`
  },

  'video-compress': {
    title: '视频压缩',
    html: `<div class="help-doc">
      <h2>视频压缩</h2>
      <p>减小视频文件体积，支持多种压缩等级。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传视频文件</li>
        <li>选择压缩等级</li>
        <li>点击"开始压缩"</li>
        <li>完成后下载压缩后的视频</li>
      </ol>
    </div>`
  },

  'video-trim': {
    title: '视频裁剪',
    html: `<div class="help-doc">
      <h2>视频裁剪</h2>
      <p>截取视频中的指定片段。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传视频文件</li>
        <li>设置起始时间和结束时间</li>
        <li>点击"开始裁剪"</li>
        <li>导出裁剪后的视频</li>
      </ol>
    </div>`
  },

  'video-gif': {
    title: '视频转 GIF',
    html: `<div class="help-doc">
      <h2>视频转 GIF</h2>
      <p>将视频片段转换为 GIF 动图，适合制作表情包。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传视频文件</li>
        <li>选择要转换的时间段</li>
        <li>设置 GIF 尺寸和帧率</li>
        <li>点击"开始转换"</li>
        <li>导出 GIF 文件</li>
      </ol>
    </div>`
  },

  'video-merge': {
    title: '视频合并',
    html: `<div class="help-doc">
      <h2>视频合并</h2>
      <p>拼接多个视频文件为一个。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传多个视频文件</li>
        <li>拖拽调整合并顺序</li>
        <li>点击"开始合并"</li>
        <li>导出合并后的视频</li>
      </ol>

      <div class="help-note">
        <p>建议合并相同分辨率和帧率的视频以获得最佳效果。</p>
      </div>
    </div>`
  },

  'text-diff': {
    title: '文本对比',
    html: `<div class="help-doc">
      <h2>文本对比</h2>
      <p>比较两段文本的差异，高亮显示不同之处。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在左侧输入框粘贴原始文本</li>
        <li>在右侧输入框粘贴修改后文本</li>
        <li>点击"对比"按钮</li>
        <li>查看差异结果，新增/删除/修改部分会高亮显示</li>
      </ol>
    </div>`
  },

  'text-counter': {
    title: '字符统计',
    html: `<div class="help-doc">
      <h2>字符统计</h2>
      <p>实时统计文本的字符数、单词数、行数、段落数。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在输入框中输入或粘贴文本</li>
        <li>统计结果实时显示</li>
      </ol>
    </div>`
  },

  'text-formatter': {
    title: '格式化',
    html: `<div class="help-doc">
      <h2>代码格式化</h2>
      <p>支持 JSON、XML、SQL 代码格式化和美化。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>选择格式化类型（JSON / XML / SQL）</li>
        <li>粘贴需要格式化的代码</li>
        <li>点击"格式化"按钮</li>
        <li>查看格式化后的结果，可一键复制</li>
      </ol>
    </div>`
  },

  'text-encoder': {
    title: '编码转换',
    html: `<div class="help-doc">
      <h2>编码转换</h2>
      <p>支持 Base64、URL、Hex 编码/解码。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>选择编码类型（Base64 / URL / Hex）</li>
        <li>输入要编码或解码的内容</li>
        <li>点击"编码"或"解码"按钮</li>
        <li>查看结果并复制</li>
      </ol>
    </div>`
  },

  'calc-scientific': {
    title: '科学计算',
    html: `<div class="help-doc">
      <h2>科学计算器</h2>
      <p>支持三角函数、对数、幂运算等高级数学计算。</p>

      <h3>支持功能</h3>
      <ul>
        <li>基本运算：加、减、乘、除</li>
        <li>三角函数：sin、cos、tan（支持角度/弧度）</li>
        <li>对数：log、ln</li>
        <li>幂运算：x²、xʸ、√x</li>
        <li>常数：π、e</li>
      </ul>
    </div>`
  },

  'calc-unit': {
    title: '单位换算',
    html: `<div class="help-doc">
      <h2>单位换算</h2>
      <p>支持长度、重量、温度等常见单位换算。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>选择换算类型（长度/重量/温度）</li>
        <li>输入数值</li>
        <li>选择源单位和目标单位</li>
        <li>自动显示换算结果</li>
      </ol>
    </div>`
  },

  'calc-currency': {
    title: '汇率换算',
    html: `<div class="help-doc">
      <h2>汇率换算</h2>
      <p>实时汇率计算，支持主流货币之间的换算。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>选择源货币和目标货币</li>
        <li>输入金额</li>
        <li>自动显示换算结果</li>
      </ol>

      <div class="help-note">
        <p>汇率数据为参考值，实际交易请以银行或金融机构报价为准。</p>
      </div>
    </div>`
  },

  'calc-loan': {
    title: '贷款计算',
    html: `<div class="help-doc">
      <h2>贷款计算器</h2>
      <p>计算贷款月供、总利息、还款计划，支持等额本息和等额本金。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>输入贷款金额</li>
        <li>输入年利率</li>
        <li>输入贷款期限（年/月）</li>
        <li>选择还款方式（等额本息/等额本金）</li>
        <li>查看月供、总利息、还款明细</li>
      </ol>
    </div>`
  },

  'creative-color': {
    title: '配色提取器',
    html: `<div class="help-doc">
      <h2>配色提取器</h2>
      <p>上传图片，自动提取主色调，生成色卡展示。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>上传图片文件</li>
        <li>自动分析提取主色调</li>
        <li>查看色卡层叠展示</li>
        <li>点击颜色可复制 HEX 值</li>
      </ol>
    </div>`
  },

  'creative-palette': {
    title: '配色生成',
    html: `<div class="help-doc">
      <h2>配色生成</h2>
      <p>生成和谐的配色方案，支持多种配色规则。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>选择基础颜色</li>
        <li>选择配色规则（互补色/类似色/三元色等）</li>
        <li>自动生成配色方案</li>
        <li>点击颜色复制 HEX 值</li>
      </ol>
    </div>`
  },

  'creative-password': {
    title: '密码生成器',
    html: `<div class="help-doc">
      <h2>密码生成器</h2>
      <p>生成安全随机密码，支持简易、中等、终极三种强度。</p>

      <h3>强度说明</h3>
      <ul>
        <li><strong>简易</strong>：8位，仅字母和数字</li>
        <li><strong>中等</strong>：12位，字母+数字+特殊字符</li>
        <li><strong>终极</strong>：20位，全字符集，最高安全性</li>
      </ul>
    </div>`
  },

  'creative-typing': {
    title: '打字测试器',
    html: `<div class="help-doc">
      <h2>打字测试器</h2>
      <p>中英文双语词库，多档难度，实时测试打字速度。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>选择语言（中文/英文）</li>
        <li>选择难度等级</li>
        <li>点击"开始测试"</li>
        <li>按照提示文本输入</li>
        <li>测试结束后查看 WPM 和准确率</li>
      </ol>
    </div>`
  },

  'ai-polish': {
    title: 'AI 文字润色',
    html: `<div class="help-doc">
      <h2>AI 文字润色</h2>
      <p>智能分析文本并优化表达，支持多种润色方向。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>输入需要润色的文本</li>
        <li>选择润色方向（正式/简洁/学术/口语化等）</li>
        <li>点击"开始润色"</li>
        <li>对比原文和润色结果</li>
        <li>复制满意的结果</li>
      </ol>
    </div>`
  },

  'ai-translate': {
    title: 'AI 智能翻译',
    html: `<div class="help-doc">
      <h2>AI 智能翻译</h2>
      <p>逐句对照翻译，高亮显示对应关系。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>输入需要翻译的文本</li>
        <li>选择源语言和目标语言</li>
        <li>点击"开始翻译"</li>
        <li>查看逐句对照翻译结果</li>
      </ol>
    </div>`
  },

  'ai-doc': {
    title: 'AI 文档生成',
    html: `<div class="help-doc">
      <h2>AI 文档生成</h2>
      <p>通过对话式交互生成专业 PDF 文档，自动排版。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>输入文档主题和要求</li>
        <li>AI 自动生成文档内容</li>
        <li>预览生成结果</li>
        <li>导出为 PDF 文件</li>
      </ol>
    </div>`
  },

  'ai-chat': {
    title: 'AI 对话',
    html: `<div class="help-doc">
      <h2>AI 对话</h2>
      <p>智能问答助手，支持多轮对话。</p>

      <h3>使用方法</h3>
      <ol class="help-steps">
        <li>在输入框中输入问题</li>
        <li>AI 自动生成回答</li>
        <li>可继续追问进行多轮对话</li>
      </ol>
    </div>`
  },

  'faq-general': {
    title: '通用问题',
    html: `<div class="help-doc">
      <h2>常见问题 - 通用</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：ToolKnit 是免费的吗？</div>
        <div class="help-faq-a">A：是的，ToolKnit 完全免费使用，不包含任何广告或内购。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：文件会上传到服务器吗？</div>
        <div class="help-faq-a">A：不会。所有文件处理均在本地完成，文件不会上传到任何服务器。AI 工具仅将文本内容发送到 AI 接口进行处理。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：支持哪些操作系统？</div>
        <div class="help-faq-a">A：目前支持 Windows 10/11（64 位），macOS 和 Linux 版本正在规划中。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：如何切换语言？</div>
        <div class="help-faq-a">A：点击侧边栏底部的设置图标，在"语言"区域选择中文或 English 即可。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：文件保存在哪里？</div>
        <div class="help-faq-a">A：默认保存在"文档"文件夹下的 ToolKnit 目录中。可在设置页面查看和打开存储位置。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：支持批量处理吗？</div>
        <div class="help-faq-a">A：支持。大部分工具（PDF 合并、图片转换、音频转换等）都支持批量文件处理。</div>
      </div>
    </div>`
  },

  'faq-ffmpeg': {
    title: 'FFmpeg 相关',
    html: `<div class="help-doc">
      <h2>常见问题 - FFmpeg</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：什么是 FFmpeg 扩展包？</div>
        <div class="help-faq-a">A：FFmpeg 是一个开源的多媒体处理库，ToolKnit 的音频转换、视频转换等功能依赖它。首次使用相关功能时会自动提示下载。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：FFmpeg 下载需要多大空间？</div>
        <div class="help-faq-a">A：FFmpeg 扩展包约 80-100MB，下载后会保存在应用目录下，之后可离线使用。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：下载 FFmpeg 失败怎么办？</div>
        <div class="help-faq-a">A：请检查网络连接，尝试关闭防火墙/杀毒软件后重试。应用会自动从多个备用源尝试下载。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：可以手动安装 FFmpeg 吗？</div>
        <div class="help-faq-a">A：FFmpeg 扩展包由应用自动管理，无需手动安装。如果遇到问题，可以尝试重新下载。</div>
      </div>
    </div>`
  },

  'faq-privacy': {
    title: '隐私与安全',
    html: `<div class="help-doc">
      <h2>常见问题 - 隐私与安全</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：我的文件安全吗？</div>
        <div class="help-faq-a">A：是的。所有文件处理（PDF、图片、音频、视频等）均在本地完成，不会上传到任何服务器。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：AI 工具会保存我的数据吗？</div>
        <div class="help-faq-a">A：AI 工具（润色、翻译、对话等）会将文本内容发送到 AI 接口进行处理，但不会在本地保存您的输入内容。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：PDF 加密安全吗？</div>
        <div class="help-faq-a">A：PDF 加密使用行业标准加密算法，安全性取决于密码强度。建议使用 8 位以上包含字母、数字、特殊字符的密码。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：应用会收集使用数据吗？</div>
        <div class="help-faq-a">A：ToolKnit 不收集任何用户隐私数据，不包含追踪代码或分析工具。</div>
      </div>
    </div>`
  },

  'faq-update': {
    title: '更新问题',
    html: `<div class="help-doc">
      <h2>常见问题 - 更新</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：如何检查更新？</div>
        <div class="help-faq-a">A：进入设置页面，在"版本与更新"区域点击"检查更新"按钮。应用启动时也会自动检查。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：更新下载很慢怎么办？</div>
        <div class="help-faq-a">A：应用会根据系统语言自动选择最优下载源。如果仍然很慢，请检查网络连接或尝试更换网络环境。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：可以跳过强制更新吗？</div>
        <div class="help-faq-a">A：不可以。强制更新通常包含重要的安全修复或功能改进，必须更新后才能继续使用。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：更新失败怎么办？</div>
        <div class="help-faq-a">A：请检查网络连接，关闭防火墙/杀毒软件后重试。如果问题持续，可以手动下载最新版安装包覆盖安装。</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q：更新会丢失我的设置吗？</div>
        <div class="help-faq-a">A：不会。更新只替换应用程序文件，用户设置和数据不会受到影响。</div>
      </div>
    </div>`
  }
};

export function getHelpContent() {
  return getLang() === 'zh' ? HELP_CONTENT : HELP_CONTENT_EN;
}

export { HELP_CONTENT_EN };

export default HELP_CONTENT;
