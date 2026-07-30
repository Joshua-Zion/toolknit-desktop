/**
 * Subset NotoSansSC OTF fonts to common Chinese characters + ASCII.
 * Uses opentype.js to read OTF and write subsetted TTF.
 * Result: ~2-3MB TTF files that can be fully embedded without CID subsetting issues.
 */
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

// Common Chinese characters + ASCII + punctuation
const commonChars = ` !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_\`abcdefghijklmnopqrstuvwxyz{|}~　、。，．·：；？！…‥『』「」〝〟′″〃〈〉《》【】〔〕→←↑↓↔⇒⇔
的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感明问力理尔点机几文外次相入重内定合答特外子化任调单切打比许各步线件数期总基然化代达持特该场府本现立识少共通观合记受必身证才即至群市利程治层太系指话活期统区层放组持界计受部验认拉千难准况据求热效办空设容非连般断却准确布铁往引严低音类树复七万述查参商苏氏将两支达个为以可到要你时会自也就要好自己这那他她它们着了在有人大上中下小多少新旧高低长短深浅远近前后左右内外上下东西南北中好坏美丑强弱冷热快慢轻重
合同租赁甲方乙方租金期限房屋地址面积月年日签字盖章身份证电话邮箱日期条款违约责任义务权利约定生效终止争议解决法院仲裁调解赔偿损失费用总计金额支付方式现金转账银行账户利率利息税前税后产品介绍功能特点优势服务客户支持技术架构前端后端数据库服务器客户端浏览器下载安装版本更新升级部署文档说明手册指南教程步骤操作界面用户注册登录密码账户个人信息隐私安全加密解密保护风险感谢支持信任陪伴未来承诺免费开源本地处理离线运行工具集合图片视频音频文本格式转换压缩裁剪合并拆分旋转加密水印增强生成导出预览编辑拖拽调整位置大小字体粗体斜体颜色背景边框圆角阴影工具箱全能本地隐私零泄露浏览器桌面应用安装包体积内存占用高性能通信文件操作架构层面杜绝风险方案对比传统方案优势明显安装包仅约内存降低以上致亲爱的用户您好感谢一路相伴上线正式那天只有寥寥几个工具和一个简单的信念好不该需要注册上传文件花钱把每行代码里全完全免费浏览器集合涵盖计算器时间效率创意自检测试分类每款沙盒环境使用技术从不离开设备收到世界各地反馈留言说帮省付费软件提发现边界默默每天处理工作然后离开每一次都是份深知这一点上线天内增长新增世界节假日日历覆盖国家公共文化宗教支持年查询做了审计优化速度上线检测器圆形截图新更新记录页面对透明承诺选择了最难路用跑解析重组逐像素比搭收难得多这是唯一能让真正成立方式继续增加新坚守底线正在探索更多辅助可能性同时确保或端侧运行不让数据成为训练语料路方向从未改变凌晨三点发邮件报告陌生人投票同事群分享链不是存在理由迭代界面更新件事不会变永远属于每打开`;

// Build unique character set
const charSet = new Set();
for (const ch of commonChars) {
  charSet.add(ch);
}
for (let i = 32; i < 127; i++) {
  charSet.add(String.fromCharCode(i));
}

console.log(`[subset] Total unique characters: ${charSet.size}`);

function subsetFont(inputPath, outputPath) {
  const inputBuf = fs.readFileSync(inputPath);
  
  // Parse the OTF font
  const font = opentype.parse(inputBuf.buffer.slice(inputBuf.byteOffset, inputBuf.byteOffset + inputBuf.byteLength));
  
  // Get glyph indices for our character set
  const glyphIds = new Set();
  const glyphsToKeep = [];
  
  // Always keep .notdef (glyph 0)
  glyphIds.add(0);
  glyphsToKeep.push(font.glyphs.get(0));
  
  for (const ch of charSet) {
    const glyphId = font.charToGlyphIndex(ch);
    if (glyphId >= 0 && !glyphIds.has(glyphId)) {
      glyphIds.add(glyphId);
      glyphsToKeep.push(font.glyphs.get(glyphId));
    }
  }
  
  console.log(`[subset] ${path.basename(inputPath)}: keeping ${glyphIds.size} glyphs out of ${font.glyphs.length}`);
  
  // Create a new font with only the subset glyphs
  // opentype.js doesn't have a built-in subset function, so we need to use a different approach
  // We'll use font.toBuffer or create a new font
  
  // Actually, opentype.js doesn't support subsetting directly.
  // Let's use a different approach: create a new font with only the needed glyphs.
  
  const subsetFont = new opentype.Font({
    familyName: font.names.fontFamily.en || 'NotoSansSC',
    styleName: font.names.fontSubfamily.en || 'Regular',
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
  });
  
  // Add glyphs to the new font
  const charToGlyphMap = {};
  for (const ch of charSet) {
    const origGlyphId = font.charToGlyphIndex(ch);
    if (origGlyphId >= 0) {
      const glyph = font.glyphs.get(origGlyphId);
      charToGlyphMap[ch] = glyph;
    }
  }
  
  // Add each character with its glyph
  for (const [ch, glyph] of Object.entries(charToGlyphMap)) {
    const code = ch.codePointAt(0);
    subsetFont.charToGlyphIndex = subsetFont.charToGlyphIndex || {};
    // We need to add the glyph to the new font
    const newGlyphId = subsetFont.glyphs.length;
    subsetFont.glyphs.push(glyph);
    subsetFont.encoding[code] = newGlyphId;
  }
  
  // This approach is getting too complex. Let me try a simpler method.
  // Actually, let me just write the font using opentype.js's built-in methods.
  
  // The simplest approach: use the font's own arrayBuffer method after modifying glyph set
  // But opentype.js doesn't really support this well.
  
  throw new Error('opentype.js subsetting not straightforward, trying alternative approach');
}

// Alternative: use @pdf-lib/fontkit directly to subset
async function subsetWithFontkit(inputPath, outputPath) {
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const inputBuf = fs.readFileSync(inputPath);
  
  const font = fontkit.create(inputBuf);
  
  // Collect unique glyph IDs for our characters
  const glyphIds = new Set([0]); // .notdef
  const charToGid = {};
  
  for (const ch of charSet) {
    const gid = font.cmap.lookup(ch.codePointAt(0));
    if (gid !== undefined && gid !== null) {
      glyphIds.add(gid);
      charToGid[ch] = gid;
    }
  }
  
  console.log(`[subset] ${path.basename(inputPath)}: ${glyphIds.size} glyphs from ${font.numGlyphs} total`);
  
  // fontkit doesn't have a built-in subset+write either...
  // Let me try yet another approach
  throw new Error('fontkit subsetting not supported, trying another approach');
}

// Final approach: manually create a minimal TTF using the glyph data
// Actually, the simplest working approach is to use the 'subset-font' npm package
async function main() {
  try {
    // Try subset-font package
    const subsetFont = (await import('subset-font')).default;
    
    const publicDir = path.join(__dirname, '..', 'public');
    const regOtf = path.join(publicDir, 'NotoSansSC-Regular-full.otf');
    const boldOtf = path.join(publicDir, 'NotoSansSC-Bold-full.otf');
    const regTtf = path.join(publicDir, 'NotoSansSC-Regular.ttf');
    const boldTtf = path.join(publicDir, 'NotoSansSC-Bold.ttf');
    
    const chars = Array.from(charSet).join('');
    
    for (const [input, output] of [[regOtf, regTtf], [boldOtf, boldTtf]]) {
      console.log(`[subset] Processing ${path.basename(input)}...`);
      const inputBuf = fs.readFileSync(input);
      const result = await subsetFont(inputBuf, chars, { targetFormat: 'truetype' });
      fs.writeFileSync(output, result);
      console.log(`[subset] ${path.basename(input)}: ${(inputBuf.length/1024/1024).toFixed(1)}MB -> ${(result.length/1024/1024).toFixed(1)}MB`);
    }
    
    console.log('[subset] Done!');
  } catch (err) {
    console.error('[subset] Error:', err.message);
    
    // Fallback: try fonteditor-core with ttf output
    console.log('[subset] Trying fonteditor-core fallback...');
    const { Font } = await import('fonteditor-core');
    
    const publicDir = path.join(__dirname, '..', 'public');
    
    for (const [name, inputName, outputName] of [['Regular', 'NotoSansSC-Regular-full.otf', 'NotoSansSC-Regular.ttf'], ['Bold', 'NotoSansSC-Bold-full.otf', 'NotoSansSC-Bold.ttf']]) {
      const inputPath = path.join(publicDir, inputName);
      const outputPath = path.join(publicDir, outputName);
      const inputBuf = fs.readFileSync(inputPath);
      
      // Read OTF and convert to TTF (no subsetting, just format conversion)
      const font = Font.create(inputBuf, { type: 'otf' });
      const ttfBuf = font.write({ type: 'ttf' });
      
      // Now read the TTF and subset it
      const ttfFont = Font.create(Buffer.from(ttfBuf), { 
        type: 'ttf',
        subset: Array.from(charSet) 
      });
      const subsetBuf = ttfFont.write({ type: 'ttf' });
      
      fs.writeFileSync(outputPath, Buffer.from(subsetBuf));
      console.log(`[subset] ${name}: ${(inputBuf.length/1024/1024).toFixed(1)}MB -> ${(Buffer.from(subsetBuf).length/1024/1024).toFixed(1)}MB`);
    }
    console.log('[subset] Done with fallback!');
  }
}

main().catch(err => {
  console.error('[subset] Fatal:', err);
  process.exit(1);
});
