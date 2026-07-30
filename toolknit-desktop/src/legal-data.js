import { getLang } from './i18n.js';

const LEGAL_CONTENT_ZH = {
  'declaration': {
    title: '程序声明',
    html: `<div class="help-doc">
      <h2>程序声明</h2>
      <p>本声明旨在明确 ToolKnit（以下简称"本软件"）的开发者（以下简称"开发者"）与用户之间的权利义务关系。用户在安装、使用本软件之前，请仔细阅读本声明。一旦用户开始使用本软件，即视为已充分理解并接受本声明的全部内容。</p>

      <h3>一、软件性质</h3>
      <p>本软件是一款<strong>免费、非开源</strong>的本地多功能工具箱桌面应用程序，由开发者独立开发和维护。本软件不包含任何广告、内购或付费功能，不以盈利为目的。</p>

      <h3>二、本地处理与隐私</h3>
      <p>本软件的<strong>所有文件处理功能</strong>（包括但不限于 PDF、图片、音频、视频、文本等工具）均在用户本地设备上完成，不会将用户的文件上传到任何服务器。开发者无法获取、查看或恢复用户处理的任何文件内容。</p>
      <p>本软件的 AI 工具（包括 AI 润色、AI 翻译、AI 文档生成、AI 对话）需要将用户输入的<strong>文本内容</strong>发送至第三方 AI 接口（DeepSeek）进行处理。该过程仅传输文本数据，不涉及文件上传。AI 接口的数据处理受其自身的隐私政策约束，开发者无法控制第三方服务的隐私实践。</p>

      <h3>三、用户数据与统计</h3>
      <p>本软件<strong>不收集</strong>任何用户个人隐私数据，不包含追踪代码、分析工具或用户行为统计功能。本软件仅在以下场景与服务器通信：</p>
      <ul>
        <li><strong>用户认证</strong>：用户注册、登录时传输邮箱、用户名等账户信息</li>
        <li><strong>使用次数统计</strong>：仅记录工具使用次数计数（不包含文件内容或个人信息），用于展示总使用次数</li>
        <li><strong>版本更新检查</strong>：检查是否有新版本可用</li>
        <li><strong>反馈提交</strong>：用户主动提交的反馈内容</li>
        <li><strong>AI 接口调用</strong>：AI 工具处理文本时调用第三方 API</li>
      </ul>

      <h3>四、第三方组件</h3>
      <p>本软件使用了以下开源第三方组件和库：</p>
      <ul>
        <li><strong>FFmpeg</strong>：多媒体处理库，用于音频/视频格式转换、压缩等功能</li>
        <li><strong>pdf-lib</strong>：PDF 文档处理库</li>
        <li><strong>Lucide Icons</strong>：图标库</li>
        <li><strong>其他开源库</strong>：详见各库的开源许可协议</li>
      </ul>
      <p>这些第三方组件的版权归各自所有者所有，本软件仅作为使用者调用其功能。开发者不对第三方组件的安全性、稳定性或合规性承担责任。</p>

      <h3>五、免责声明</h3>
      <div class="help-note">
        <p><strong>1. 文件处理风险</strong>：尽管本软件在本地处理文件，用户仍应在使用前备份重要文件。开发者不对因使用本软件导致的任何文件损坏、数据丢失、格式错误等后果承担责任。</p>
      </div>
      <div class="help-note">
        <p><strong>2. AI 生成内容</strong>：本软件的 AI 工具生成的内容由第三方 AI 模型自动生成，开发者不保证内容的准确性、完整性、合法性或适用性。用户应自行判断和审核 AI 生成的内容，并对其使用行为承担全部责任。</p>
      </div>
      <div class="help-note">
        <p><strong>3. 服务可用性</strong>：本软件的在线功能（用户认证、版本更新、AI 接口等）依赖于服务器和网络环境。开发者不保证这些功能的持续可用性，不对因网络故障、服务器维护、第三方服务变更等原因导致的服务中断承担责任。</p>
      </div>
      <div class="help-note">
        <p><strong>4. 不可抗力</strong>：因自然灾害、政策法规变更、网络攻击等不可抗力因素导致的服务中断或数据损失，开发者不承担责任。</p>
      </div>

      <h3>六、知识产权</h3>
      <p>本软件的界面设计、图标、代码结构、功能实现等知识产权归开发者所有。用户不得对本软件进行反编译、反汇编、逆向工程或其他试图获取源代码的行为。</p>
      <p>用户使用本软件处理的文件和数据，其知识产权归用户或相关权利人所有，开发者不主张任何权利。</p>

      <h3>七、使用限制</h3>
      <p>用户在使用本软件时，应遵守以下限制：</p>
      <ul>
        <li>不得将本软件用于任何违法、侵权或危害他人利益的目的</li>
        <li>不得利用本软件处理侵犯他人知识产权的文件</li>
        <li>不得对本软件进行二次销售、捆绑销售或商业分发</li>
        <li>不得篡改、移除本软件中的版权声明或免责声明</li>
      </ul>

      <h3>八、声明变更</h3>
      <p>开发者保留随时修改本声明的权利。声明变更后，用户继续使用本软件即视为接受修改后的声明。开发者将通过软件更新或应用内通知的方式告知用户声明变更事项。</p>

      <h3>九、适用法律</h3>
      <p>本声明的解释和适用以中华人民共和国法律为准。因本声明或使用本软件产生的任何争议，双方应友好协商解决；协商不成的，任何一方均可向开发者所在地有管辖权的人民法院提起诉讼。</p>

      <h3>十、联系方式</h3>
      <p>如对本声明有任何疑问，可通过软件内的<strong>反馈功能</strong>与开发者联系。</p>

      <div class="help-note">
        <p>最后更新日期：2025年7月1日<br/>开发者：董子航</p>
      </div>
    </div>`
  },

  'usage-policy': {
    title: '使用规范',
    html: `<div class="help-doc">
      <h2>使用规范</h2>
      <p>本使用规范旨在明确用户在使用 ToolKnit（以下简称"本软件"）时应遵守的规则和注意事项。用户在使用本软件前，请仔细阅读本规范。一旦开始使用本软件，即视为已充分理解并接受本规范的全部内容。</p>

      <h3>一、合法使用</h3>
      <p>用户在使用本软件时，必须遵守中华人民共和国相关法律法规以及用户所在国家/地区的适用法律。用户不得利用本软件从事以下行为：</p>
      <ul>
        <li>处理、制作或传播违反法律法规的文件内容</li>
        <li>处理侵犯他人知识产权、商业秘密或个人隐私的文件</li>
        <li>利用本软件进行任何危害网络安全、信息安全的行为</li>
        <li>利用本软件处理涉及国家秘密、商业机密的敏感文件（建议使用专业涉密设备处理）</li>
        <li>以本软件为工具进行诈骗、侵权或其他违法犯罪活动</li>
      </ul>

      <h3>二、AI 工具使用规范</h3>
      <p>本软件集成的 AI 工具（AI 润色、AI 翻译、AI 文档生成、AI 对话）调用第三方 AI 接口提供服务。用户在使用 AI 工具时应遵守以下规范：</p>
      <ul>
        <li><strong>内容合法性</strong>：不得输入违法、色情、暴力、歧视等不良内容</li>
        <li><strong>隐私保护</strong>：不得输入他人个人信息、医疗记录、财务数据等敏感隐私内容</li>
        <li><strong>知识产权</strong>：不得输入受版权保护且未获授权的文本内容</li>
        <li><strong>商业机密</strong>：不得输入涉及商业机密或保密协议保护的文本内容</li>
        <li><strong>滥用禁止</strong>：不得通过自动化脚本等方式对 AI 接口进行恶意高频调用</li>
      </ul>
      <div class="help-note">
        <p>AI 生成的内容仅供参考，不构成任何专业建议（法律、医疗、财务等）。用户应对 AI 生成内容的准确性和适用性进行独立判断。</p>
      </div>

      <h3>三、文件处理注意事项</h3>
      <p>本软件的文件处理功能在本地完成，但用户仍需注意以下事项：</p>
      <ul>
        <li><strong>备份重要文件</strong>：处理前请务必备份原始文件，避免因操作失误导致文件损坏</li>
        <li><strong>检查处理结果</strong>：处理完成后请检查输出文件，确认结果符合预期</li>
        <li><strong>PDF 加密</strong>：请妥善保管加密密码，遗忘密码后将无法恢复 PDF 内容</li>
        <li><strong>大文件处理</strong>：处理大文件可能消耗较多系统资源，建议关闭其他高负载程序</li>
        <li><strong>格式兼容性</strong>：部分格式转换可能存在兼容性限制，建议先小批量测试</li>
      </ul>

      <h3>四、账户使用规范</h3>
      <p>本软件提供用户注册和登录功能（用于收藏同步等功能）。用户在使用账户时应遵守以下规范：</p>
      <ul>
        <li>注册时提供真实有效的邮箱地址</li>
        <li>妥善保管账户密码，不得将账户转让、出借或共享给他人</li>
        <li>不得注册多个账户进行滥用</li>
        <li>账户安全由用户自行负责，因账户泄露导致的损失由用户承担</li>
      </ul>

      <h3>五、FFmpeg 扩展包</h3>
      <p>本软件的音视频处理功能依赖 FFmpeg 扩展包。用户在使用相关功能时应了解：</p>
      <ul>
        <li>FFmpeg 扩展包由本软件自动下载和管理，无需用户手动安装</li>
        <li>FFmpeg 遵循 LGPL 或 GPL 许可协议，用户可从 FFmpeg 官网获取源代码</li>
        <li>扩展包下载约 80-100MB，建议在 Wi-Fi 环境下下载</li>
      </ul>

      <h3>六、软件更新</h3>
      <p>本软件支持在线检查更新和自动更新。用户应了解：</p>
      <ul>
        <li>建议保持软件为最新版本，以获得最佳体验和安全性</li>
        <li>部分关键更新可能为强制更新，用户必须更新后才能继续使用</li>
        <li>更新过程不会影响用户的设置和数据</li>
        <li>用户可手动检查更新：设置 → 版本与更新 → 检查更新</li>
      </ul>

      <h3>七、禁止行为</h3>
      <p>用户在使用本软件时，以下行为被严格禁止：</p>
      <ul>
        <li><strong>逆向工程</strong>：不得对本软件进行反编译、反汇编、调试或代码分析</li>
        <li><strong>篡改软件</strong>：不得修改、破解、移除软件的功能限制或安全机制</li>
        <li><strong>商业分发</strong>：不得将本软件进行二次销售、捆绑销售或作为商业产品分发</li>
        <li><strong>恶意传播</strong>：不得将本软件与恶意软件、病毒捆绑传播</li>
        <li><strong>冒名顶替</strong>：不得冒充开发者发布虚假信息或软件</li>
      </ul>

      <h3>八、违规处理</h3>
      <p>如用户违反本使用规范，开发者有权采取以下措施：</p>
      <ul>
        <li>暂停或终止用户的账户使用权限</li>
        <li>限制或禁止用户使用在线功能（AI 接口、反馈等）</li>
        <li>对严重违规行为，保留追究法律责任的权利</li>
      </ul>

      <h3>九、规范变更</h3>
      <p>开发者保留随时修改本使用规范的权利。规范变更后，用户继续使用本软件即视为接受修改后的规范。</p>

      <h3>十、责任限制</h3>
      <div class="help-note">
        <p>本软件以"现状"提供，开发者不对软件的<strong>适用性、稳定性、准确性</strong>做出任何明示或暗示的保证。在适用法律允许的最大范围内，开发者不对因使用或无法使用本软件导致的任何直接或间接损失（包括但不限于数据丢失、利润损失、业务中断）承担责任。</p>
      </div>

      <div class="help-note">
        <p>最后更新日期：2025年7月1日<br/>开发者：董子航</p>
      </div>
    </div>`
  }
};

const LEGAL_CONTENT_EN = {
  'declaration': {
    title: 'Program Declaration',
    html: `<div class="help-doc">
      <h2>Program Declaration</h2>
      <p>This declaration aims to clarify the rights and obligations between the developer of ToolKnit (hereinafter "the Software") and the user. Please read this declaration carefully before installing and using the Software. By using the Software, you are deemed to have fully understood and accepted all contents of this declaration.</p>

      <h3>1. Software Nature</h3>
      <p>The Software is a <strong>free, non-open-source</strong> local multi-functional toolbox desktop application, independently developed and maintained by the developer. The Software contains no advertisements, in-app purchases, or paid features, and is not intended for profit.</p>

      <h3>2. Local Processing & Privacy</h3>
      <p>All file processing features of the Software (including but not limited to PDF, image, audio, video, text tools) are performed on the user's local device. User files are not uploaded to any server. The developer cannot access, view, or recover any file content processed by users.</p>
      <p>The AI tools of the Software (AI Polish, AI Translate, AI Document Generation, AI Chat) require sending user-input <strong>text content</strong> to a third-party AI API (DeepSeek) for processing. This process only transmits text data and does not involve file uploads. The data processing of the AI API is subject to its own privacy policy, and the developer cannot control the privacy practices of third-party services.</p>

      <h3>3. User Data & Statistics</h3>
      <p>The Software <strong>does not collect</strong> any user personal privacy data, and contains no tracking code, analytics tools, or user behavior statistics. The Software only communicates with servers in the following scenarios:</p>
      <ul>
        <li><strong>User Authentication</strong>: Transmitting email, username, and other account information during registration and login</li>
        <li><strong>Usage Count</strong>: Only recording tool usage count (excluding file content or personal information), used to display total usage</li>
        <li><strong>Version Update Check</strong>: Checking for available new versions</li>
        <li><strong>Feedback Submission</strong>: Feedback content voluntarily submitted by users</li>
        <li><strong>AI API Calls</strong>: Calling third-party APIs when AI tools process text</li>
      </ul>

      <h3>4. Third-Party Components</h3>
      <p>The Software uses the following open-source third-party components and libraries:</p>
      <ul>
        <li><strong>FFmpeg</strong>: Multimedia processing library, used for audio/video format conversion, compression, etc.</li>
        <li><strong>pdf-lib</strong>: PDF document processing library</li>
        <li><strong>Lucide Icons</strong>: Icon library</li>
        <li><strong>Other open-source libraries</strong>: See respective open-source license agreements</li>
      </ul>
      <p>The copyrights of these third-party components belong to their respective owners. The Software only uses them as a caller. The developer is not responsible for the security, stability, or compliance of third-party components.</p>

      <h3>5. Disclaimer</h3>
      <div class="help-note">
        <p><strong>1. File Processing Risk</strong>: Although the Software processes files locally, users should back up important files before use. The developer is not liable for any file corruption, data loss, format errors, or other consequences resulting from the use of the Software.</p>
      </div>
      <div class="help-note">
        <p><strong>2. AI-Generated Content</strong>: Content generated by the Software's AI tools is automatically produced by third-party AI models. The developer does not guarantee the accuracy, completeness, legality, or applicability of such content. Users should independently judge and review AI-generated content and assume full responsibility for their use.</p>
      </div>
      <div class="help-note">
        <p><strong>3. Service Availability</strong>: The online features of the Software (user authentication, version updates, AI API, etc.) depend on servers and network environments. The developer does not guarantee the continuous availability of these features and is not liable for service interruptions caused by network failures, server maintenance, third-party service changes, etc.</p>
      </div>
      <div class="help-note">
        <p><strong>4. Force Majeure</strong>: The developer is not liable for service interruptions or data losses caused by force majeure factors such as natural disasters, policy changes, or cyber attacks.</p>
      </div>

      <h3>6. Intellectual Property</h3>
      <p>The intellectual property rights of the Software's interface design, icons, code structure, and feature implementation belong to the developer. Users may not reverse compile, reverse assemble, reverse engineer, or otherwise attempt to obtain the source code of the Software.</p>
      <p>The intellectual property of files and data processed by users using the Software belongs to the user or relevant rights holders, and the developer claims no rights thereto.</p>

      <h3>7. Usage Restrictions</h3>
      <p>When using the Software, users must comply with the following restrictions:</p>
      <ul>
        <li>Must not use the Software for any illegal, infringing, or harmful purposes</li>
        <li>Must not use the Software to process files that infringe others' intellectual property</li>
        <li>Must not resell, bundle-sell, or commercially distribute the Software</li>
        <li>Must not tamper with or remove copyright notices or disclaimers in the Software</li>
      </ul>

      <h3>8. Declaration Changes</h3>
      <p>The developer reserves the right to modify this declaration at any time. After changes are made, continued use of the Software constitutes acceptance of the modified declaration. The developer will inform users of declaration changes through software updates or in-app notifications.</p>

      <h3>9. Applicable Law</h3>
      <p>This declaration is interpreted and applied in accordance with the laws of the People's Republic of China. Any disputes arising from this declaration or the use of the Software shall be resolved through amicable negotiation; if negotiation fails, either party may file a lawsuit with the people's court having jurisdiction at the developer's location.</p>

      <h3>10. Contact</h3>
      <p>If you have any questions about this declaration, you can contact the developer through the <strong>Feedback</strong> feature in the Software.</p>

      <div class="help-note">
        <p>Last updated: July 1, 2025<br/>Developer: Zihang Dong</p>
      </div>
    </div>`
  },

  'usage-policy': {
    title: 'Usage Policy',
    html: `<div class="help-doc">
      <h2>Usage Policy</h2>
      <p>This usage policy aims to clarify the rules and precautions that users must follow when using ToolKnit (hereinafter "the Software"). Please read this policy carefully before using the Software. By using the Software, you are deemed to have fully understood and accepted all contents of this policy.</p>

      <h3>1. Lawful Use</h3>
      <p>When using the Software, users must comply with the relevant laws and regulations of the People's Republic of China and the applicable laws of the user's country/region. Users must not use the Software to engage in the following:</p>
      <ul>
        <li>Processing, producing, or distributing file content that violates laws and regulations</li>
        <li>Processing files that infringe others' intellectual property, trade secrets, or personal privacy</li>
        <li>Using the Software for any behavior that endangers network or information security</li>
        <li>Using the Software to process sensitive files involving state secrets or trade secrets (professional classified equipment is recommended)</li>
        <li>Using the Software as a tool for fraud, infringement, or other illegal activities</li>
      </ul>

      <h3>2. AI Tool Usage Policy</h3>
      <p>The AI tools integrated into the Software (AI Polish, AI Translate, AI Document Generation, AI Chat) call third-party AI APIs to provide services. Users must follow these rules when using AI tools:</p>
      <ul>
        <li><strong>Content Legality</strong>: Must not input illegal, pornographic, violent, discriminatory, or other harmful content</li>
        <li><strong>Privacy Protection</strong>: Must not input others' personal information, medical records, financial data, or other sensitive privacy content</li>
        <li><strong>Intellectual Property</strong>: Must not input copyrighted text content without authorization</li>
        <li><strong>Trade Secrets</strong>: Must not input text content involving trade secrets or protected by confidentiality agreements</li>
        <li><strong>Anti-Abuse</strong>: Must not make malicious high-frequency calls to AI APIs through automated scripts or other means</li>
      </ul>
      <div class="help-note">
        <p>AI-generated content is for reference only and does not constitute any professional advice (legal, medical, financial, etc.). Users should independently judge the accuracy and applicability of AI-generated content.</p>
      </div>

      <h3>3. File Processing Precautions</h3>
      <p>The Software processes files locally, but users should still note the following:</p>
      <ul>
        <li><strong>Back Up Important Files</strong>: Always back up original files before processing to avoid file corruption from operational errors</li>
        <li><strong>Check Results</strong>: After processing, check the output files to confirm the results meet expectations</li>
        <li><strong>PDF Encryption</strong>: Keep your encryption password safe — PDF content cannot be recovered if the password is lost</li>
        <li><strong>Large Files</strong>: Processing large files may consume significant system resources; close other high-load programs</li>
        <li><strong>Format Compatibility</strong>: Some format conversions may have compatibility limitations; test with small batches first</li>
      </ul>

      <h3>4. Account Usage Policy</h3>
      <p>The Software offers user registration and login (for favorites sync and other features). Users must follow these rules when using accounts:</p>
      <ul>
        <li>Provide a real and valid email address during registration</li>
        <li>Keep account passwords secure; do not transfer, lend, or share accounts with others</li>
        <li>Do not register multiple accounts for abuse</li>
        <li>Users are responsible for their own account security; losses due to account leakage are borne by the user</li>
      </ul>

      <h3>5. FFmpeg Extension</h3>
      <p>The audio/video processing features of the Software depend on the FFmpeg extension. Users should understand the following when using related features:</p>
      <ul>
        <li>The FFmpeg extension is automatically downloaded and managed by the Software; no manual installation required</li>
        <li>FFmpeg is licensed under LGPL or GPL; users can obtain source code from the FFmpeg official website</li>
        <li>The extension download is approximately 80-100MB; downloading over Wi-Fi is recommended</li>
      </ul>

      <h3>6. Software Updates</h3>
      <p>The Software supports online update checks and automatic updates. Users should understand:</p>
      <ul>
        <li>It is recommended to keep the Software up to date for the best experience and security</li>
        <li>Some critical updates may be mandatory; users must update before continuing to use the Software</li>
        <li>The update process does not affect user settings and data</li>
        <li>Users can manually check for updates: Settings → Version & Updates → Check for Updates</li>
      </ul>

      <h3>7. Prohibited Behaviors</h3>
      <p>The following behaviors are strictly prohibited when using the Software:</p>
      <ul>
        <li><strong>Reverse Engineering</strong>: Must not reverse compile, disassemble, debug, or analyze the code of the Software</li>
        <li><strong>Tampering</strong>: Must not modify, crack, or remove feature restrictions or security mechanisms</li>
        <li><strong>Commercial Distribution</strong>: Must not resell, bundle-sell, or distribute the Software as a commercial product</li>
        <li><strong>Malicious Distribution</strong>: Must not bundle the Software with malware or viruses for distribution</li>
        <li><strong>Impersonation</strong>: Must not impersonate the developer to publish false information or software</li>
      </ul>

      <h3>8. Violation Handling</h3>
      <p>If users violate this usage policy, the developer reserves the right to take the following measures:</p>
      <ul>
        <li>Suspend or terminate the user's account access</li>
        <li>Restrict or prohibit users from using online features (AI API, feedback, etc.)</li>
        <li>For serious violations, reserve the right to pursue legal responsibility</li>
      </ul>

      <h3>9. Policy Changes</h3>
      <p>The developer reserves the right to modify this usage policy at any time. After changes are made, continued use of the Software constitutes acceptance of the modified policy.</p>

      <h3>10. Limitation of Liability</h3>
      <div class="help-note">
        <p>The Software is provided "as is," and the developer makes no express or implied warranties regarding the <strong>applicability, stability, or accuracy</strong> of the Software. To the maximum extent permitted by applicable law, the developer is not liable for any direct or indirect losses (including but not limited to data loss, profit loss, business interruption) resulting from the use of or inability to use the Software.</p>
      </div>

      <div class="help-note">
        <p>Last updated: July 1, 2025<br/>Developer: Zihang Dong</p>
      </div>
    </div>`
  }
};

export function getLegalContent() {
  return getLang() === 'zh' ? LEGAL_CONTENT_ZH : LEGAL_CONTENT_EN;
}

export { LEGAL_CONTENT_ZH, LEGAL_CONTENT_EN };

export default LEGAL_CONTENT_ZH;
