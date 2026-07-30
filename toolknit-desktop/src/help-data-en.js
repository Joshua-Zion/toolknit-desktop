export const HELP_CONTENT_EN = {
  'overview': {
    title: 'Overview',
    html: `<div class="help-doc">
      <h2>ToolKnit Overview</h2>
      <p>ToolKnit is a <strong>fully local</strong> multi-functional toolbox desktop app, covering eight tool categories: PDF, Image, Audio, Video, Text, Calculator, Creative, and AI. All file processing is done locally — no uploads to servers.</p>

      <h3>Tool Categories</h3>
      <div class="help-tool-grid">
        <div class="help-tool-card"><div class="help-tool-card-name">PDF Tools</div><div class="help-tool-card-desc">Merge, split, rotate, encrypt, decrypt, compress, text enhance</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">Image Tools</div><div class="help-tool-card-desc">Format conversion, image compression, icon generator</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">Audio Tools</div><div class="help-tool-card-desc">Format conversion, BPM detection, clip, trim, merge, extract</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">Video Tools</div><div class="help-tool-card-desc">Format conversion, compress, trim, GIF, merge</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">Text Tools</div><div class="help-tool-card-desc">Text diff, character counter, formatter, encoder</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">Calculator</div><div class="help-tool-card-desc">Scientific calc, unit converter, currency converter, loan calculator</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">Creative Tools</div><div class="help-tool-card-desc">Color extractor, palette generator, password generator, typing test</div></div>
        <div class="help-tool-card"><div class="help-tool-card-name">AI Tools</div><div class="help-tool-card-desc">AI polish, AI translate, AI doc, AI chat</div></div>
      </div>

      <h3>Key Features</h3>
      <ul>
        <li><strong>100% Local Processing</strong>: All file operations are done on your device — no files uploaded to any server</li>
        <li><strong>Batch Processing</strong>: Support for batch file processing to boost productivity</li>
        <li><strong>Drag & Drop</strong>: Drag files directly onto tool pages for instant processing</li>
        <li><strong>Bilingual Interface</strong>: Supports Chinese and English switching</li>
        <li><strong>Auto Update</strong>: Check for and download new versions online</li>
        <li><strong>FFmpeg Extension</strong>: Audio/video tools automatically download the FFmpeg extension</li>
      </ul>

      <div class="help-note">
        <p>Some tools (such as audio conversion, video conversion) require the FFmpeg extension. You'll be prompted to download it on first use, after which it works offline.</p>
      </div>
    </div>`
  },

  'install': {
    title: 'Install & Launch',
    html: `<div class="help-doc">
      <h2>Install & Launch</h2>

      <h3>System Requirements</h3>
      <ul>
        <li>OS: Windows 10/11 (64-bit)</li>
        <li>RAM: 4GB or more recommended</li>
        <li>Disk Space: At least 200MB (≈300MB with FFmpeg extension)</li>
      </ul>

      <h3>Installation Steps</h3>
      <ol class="help-steps">
        <li>Download the ToolKnit installer (<code>.exe</code> setup program)</li>
        <li>Double-click the installer and choose the installation path</li>
        <li>Wait for installation to complete — a ToolKnit shortcut will appear on your desktop</li>
        <li>Double-click the shortcut to launch the app</li>
      </ol>

      <h3>First Launch</h3>
      <p>On first launch, the app automatically detects your system environment. If you use audio/video tools, you'll be prompted to download the FFmpeg extension (~80-100MB depending on network).</p>

      <div class="help-note">
        <p>The installer automatically selects a download source based on your system language (Chinese users use the domestic source, English users use the international source) for optimal download speed.</p>
      </div>
    </div>`
  },

  'settings': {
    title: 'Settings & Preferences',
    html: `<div class="help-doc">
      <h2>Settings & Preferences</h2>
      <p>Click the <strong>settings icon</strong> at the bottom of the sidebar to open the settings page. Available options:</p>

      <h3>Language Switching</h3>
      <p>Supports <strong>Chinese</strong> and <strong>English</strong>. The interface updates instantly upon switching.</p>

      <h3>Version & Updates</h3>
      <p>Displays the current version number. Click "Check for Updates" to manually detect new versions. If available, the changelog is shown with a download prompt.</p>

      <h3>Default Storage Location</h3>
      <p>Shows the default file save path (usually the ToolKnit folder in your Documents). Click "Open Folder" to quickly access it.</p>

      <h3>Help & Feedback</h3>
      <p>Click "Help Center" to open this help page; click "Feedback" to submit bug reports or suggestions.</p>
    </div>`
  },

  'update': {
    title: 'Version Updates',
    html: `<div class="help-doc">
      <h2>Version Updates</h2>

      <h3>Automatic Update Check</h3>
      <p>ToolKnit automatically checks for new versions on startup. If a new version is found, an update prompt appears showing the new version number and changelog.</p>

      <h3>Manual Update Check</h3>
      <ol class="help-steps">
        <li>Click the <strong>settings icon</strong> at the bottom of the sidebar</li>
        <li>In the "Version & Updates" section, click "Check for Updates"</li>
        <li>If a new version is available, click "Update Now" to start downloading</li>
        <li>After download completes, the app automatically installs and restarts</li>
      </ol>

      <h3>Forced Updates</h3>
      <p>Certain critical versions trigger a forced update — users must update to the latest version to continue using the app, ensuring security and stability.</p>

      <div class="help-note">
        <p>Update downloads use a dual-source strategy: Chinese users download from the domestic source first, English users from the international source, ensuring optimal speed.</p>
      </div>
    </div>`
  },

  'pdf-merge': {
    title: 'PDF Merge',
    html: `<div class="help-doc">
      <h2>PDF Merge</h2>
      <p>Merge multiple PDF files into one, in the order you specify.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Click "PDF Merge" in the PDF tools category</li>
        <li>Click "Upload PDF Files" or drag files onto the page</li>
        <li>Drag files to reorder the merge sequence</li>
        <li>Click the "Start Merge" button</li>
        <li>Wait for processing to complete — a success prompt appears and you can open the save folder</li>
      </ol>

      <h3>Notes</h3>
      <ul>
        <li>All files must be in PDF format</li>
        <li>Merge order follows the list arrangement</li>
        <li>After processing, files are saved to the default storage location</li>
      </ul>
    </div>`
  },

  'pdf-split': {
    title: 'PDF Split',
    html: `<div class="help-doc">
      <h2>PDF Split</h2>
      <p>Split a PDF by page ranges into multiple files, or extract specific pages.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload the PDF file you want to split</li>
        <li>Enter the page ranges to extract (e.g., <code>1-3,5,7-10</code>)</li>
        <li>Click "Start Split"</li>
        <li>After processing, view the split files in the save directory</li>
      </ol>

      <div class="help-note">
        <p>Page format supports: single page (<code>5</code>), range (<code>1-10</code>), comma-separated (<code>1-3,5,7-10</code>).</p>
      </div>
    </div>`
  },

  'pdf-rotate': {
    title: 'PDF Rotate',
    html: `<div class="help-doc">
      <h2>PDF Rotate</h2>
      <p>Rotate page orientation in a PDF. Supports single-page and bulk rotation.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload a PDF file</li>
        <li>Choose rotation angle: 90°, 180°, 270°</li>
        <li>Choose rotation scope: all pages or specific pages</li>
        <li>Click "Start Rotate", then download the result after completion</li>
      </ol>
    </div>`
  },

  'pdf-encrypt': {
    title: 'PDF Encrypt',
    html: `<div class="help-doc">
      <h2>PDF Encrypt</h2>
      <p>Add password protection and permission controls to a PDF file.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload the PDF file you want to encrypt</li>
        <li>Set the open password (user password)</li>
        <li>Optional: Set a permissions password (owner password)</li>
        <li>Choose permissions: allow printing, copying, modifying</li>
        <li>Click "Start Encrypt", then download the encrypted PDF</li>
      </ol>

      <div class="help-note">
        <p>Please keep your password safe. PDF content cannot be recovered if the password is lost.</p>
      </div>
    </div>`
  },

  'pdf-decrypt': {
    title: 'PDF Decrypt',
    html: `<div class="help-doc">
      <h2>PDF Decrypt</h2>
      <p>Remove password protection and usage restrictions from a PDF file.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload the encrypted PDF file</li>
        <li>Enter the correct password</li>
        <li>Click "Start Decrypt"</li>
        <li>Download the decrypted PDF after completion</li>
      </ol>

      <div class="help-note">
        <p>Decryption requires the original password. PDFs with unknown passwords cannot be cracked.</p>
      </div>
    </div>`
  },

  'pdf-compress': {
    title: 'PDF Compress',
    html: `<div class="help-doc">
      <h2>PDF Compress</h2>
      <p>Reduce PDF file size with three compression levels.</p>

      <h3>Compression Levels</h3>
      <ul>
        <li><strong>Low</strong>: Light compression, minimal quality loss</li>
        <li><strong>Medium</strong>: Balanced compression, recommended for most scenarios</li>
        <li><strong>High</strong>: Maximum compression, smallest size with some quality loss</li>
      </ul>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload one or more PDF files</li>
        <li>Select the compression level</li>
        <li>Click "Start Compress"</li>
        <li>View compression results after processing, with option to open the folder</li>
      </ol>
    </div>`
  },

  'pdf-enhance': {
    title: 'PDF Text Enhance',
    html: `<div class="help-doc">
      <h2>PDF Text Enhance</h2>
      <p>Improve the clarity of blurry text in PDFs through denoising and sharpening to enhance readability.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload the PDF file you want to enhance</li>
        <li>Click "Start Enhancing"</li>
        <li>Wait for processing to complete, then download the enhanced PDF</li>
      </ol>

      <div class="help-note">
        <p>Enhancement results depend on the original scan quality. Extremely blurry documents may see limited improvement.</p>
      </div>
    </div>`
  },

  'img-convert': {
    title: 'Image Format Convert',
    html: `<div class="help-doc">
      <h2>Image Format Convert</h2>
      <p>Supports conversion between JPG, PNG, WebP, BMP, and GIF — five popular image formats, with batch processing.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Click "Image Format Convert" in the Image tools category</li>
        <li>Upload one or more image files</li>
        <li>Select the target format (JPG / PNG / WebP / BMP / GIF)</li>
        <li>Click "Start Convert"</li>
        <li>A success prompt appears after processing — you can open the save folder</li>
      </ol>

      <div class="help-note">
        <p>Conversion preserves the original resolution — image dimensions are not changed.</p>
      </div>
    </div>`
  },

  'img-compress': {
    title: 'Image Compress',
    html: `<div class="help-doc">
      <h2>Image Compress</h2>
      <p>Reduce image file size with three quality levels and batch processing.</p>

      <h3>Compression Levels</h3>
      <ul>
        <li><strong>Low</strong>: High quality, larger file size</li>
        <li><strong>Medium</strong>: Balanced quality and size (recommended)</li>
        <li><strong>High</strong>: Maximum compression, smallest size</li>
      </ul>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload one or more image files</li>
        <li>Select the compression level</li>
        <li>Click "Start Compress"</li>
        <li>View compression results after processing, and open the folder to check</li>
      </ol>

      <p>Supported formats: JPG / PNG / WebP / BMP / GIF</p>
    </div>`
  },

  'icon-gen': {
    title: 'Icon Generator',
    html: `<div class="help-doc">
      <h2>Icon Generator</h2>
      <p>Upload an image and generate a complete icon set (multi-size PNG + ICO + SVG), packaged as a ZIP download.</p>

      <h3>Generated Content</h3>
      <ul>
        <li><strong>PNG Icons</strong>: 16/24/32/48/64/96/128/144/152/167/180/192/256/384/512/1024px — 16 sizes total</li>
        <li><strong>ICO File</strong>: Multi-size ICO (16~256px), suitable for Windows application icons</li>
        <li><strong>favicon.ico</strong>: Classic website favicon (16/32/48px)</li>
        <li><strong>SVG File</strong>: Vector icon, lossless at any size</li>
      </ul>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload an image (JPG or PNG)</li>
        <li>Click "Start Generate"</li>
        <li>Wait for the progress overlay to show generation progress</li>
        <li>The <code>icons.zip</code> downloads automatically when complete</li>
        <li>Click "Open Folder" in the success dialog to view the files</li>
      </ol>

      <div class="help-note">
        <p>Images are automatically cropped to a square (center crop). Square or near-square images produce the best results.</p>
      </div>
    </div>`
  },

  'audio-convert': {
    title: 'Audio Convert',
    html: `<div class="help-doc">
      <h2>Audio Format Convert</h2>
      <p>Supports conversion between MP3, AAC, WAV, FLAC, ALAC, OGG, WMA and more, with batch processing.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Click "Audio Format Convert" in the Audio tools category</li>
        <li>Upload one or more audio files</li>
        <li>Select the target format</li>
        <li>Click "Start Convert"</li>
        <li>A success prompt appears after processing</li>
      </ol>

      <div class="help-note">
        <p>First-time use of audio conversion requires downloading the FFmpeg extension (~80-100MB). After download, it works offline.</p>
      </div>

      <h3>Format Guide</h3>
      <ul>
        <li><strong>MP3</strong>: Most universal lossy format, best compatibility</li>
        <li><strong>AAC</strong>: High compression ratio lossy format</li>
        <li><strong>WAV</strong>: Lossless uncompressed format</li>
        <li><strong>FLAC</strong>: Lossless compressed format</li>
        <li><strong>OGG</strong>: Open-source lossy format</li>
      </ul>
    </div>`
  },

  'bpm-detect': {
    title: 'BPM Detector',
    html: `<div class="help-doc">
      <h2>BPM Detector</h2>
      <p>Upload an audio file to automatically detect the BPM (beats per minute).</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload an audio file</li>
        <li>Click "Start Detection"</li>
        <li>Wait for analysis to complete — the BPM result is displayed</li>
      </ol>

      <div class="help-note">
        <p>BPM detection works best with pure music/electronic music. Vocal-heavy songs may produce less accurate results.</p>
      </div>
    </div>`
  },

  'audio-clip': {
    title: 'Audio Clip',
    html: `<div class="help-doc">
      <h2>Audio Clip</h2>
      <p>Waveform-based visual clipping with region selection, playback preview, and precise trimming.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload an audio file</li>
        <li>Drag on the waveform to select the region to keep</li>
        <li>Click play to preview the selected segment</li>
        <li>After confirming, click the "Trim" button</li>
        <li>Export the clipped audio file</li>
      </ol>
    </div>`
  },

  'audio-trim': {
    title: 'Audio Trim',
    html: `<div class="help-doc">
      <h2>Audio Trim</h2>
      <p>Quickly extract a segment of audio with fade-in/fade-out effects, precise to the millisecond.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload an audio file</li>
        <li>Set the start and end times</li>
        <li>Optional: Enable fade-in/fade-out effects</li>
        <li>Click "Start Trim"</li>
        <li>Export the trimmed audio</li>
      </ol>
    </div>`
  },

  'audio-merge': {
    title: 'Audio Merge',
    html: `<div class="help-doc">
      <h2>Audio Merge</h2>
      <p>Seamlessly concatenate multiple audio files into one.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload multiple audio files</li>
        <li>Drag to reorder the merge sequence</li>
        <li>Click "Start Merge"</li>
        <li>Export the merged audio file</li>
      </ol>
    </div>`
  },

  'audio-extract': {
    title: 'Audio Extract',
    html: `<div class="help-doc">
      <h2>Audio Extract</h2>
      <p>Extract the audio track from a video file and save it as a standalone audio file.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload a video file (supports MP4 / MOV / MKV, etc.)</li>
        <li>Select the output audio format</li>
        <li>Click "Start Extract"</li>
        <li>Export the extracted audio file</li>
      </ol>
    </div>`
  },

  'video-convert': {
    title: 'Video Convert',
    html: `<div class="help-doc">
      <h2>Video Format Convert</h2>
      <p>Supports conversion between MP4, AVI, MKV, MOV, WebM, FLV, WMV, TS — eight formats, with batch processing.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Click "Video Format Convert" in the Video tools category</li>
        <li>Upload one or more video files</li>
        <li>Select the target format</li>
        <li>Click "Start Convert"</li>
        <li>A success prompt appears after processing</li>
      </ol>

      <div class="help-note">
        <p>Video conversion requires the FFmpeg extension. You'll be prompted to download it on first use.</p>
      </div>
    </div>`
  },

  'video-compress': {
    title: 'Video Compress',
    html: `<div class="help-doc">
      <h2>Video Compress</h2>
      <p>Reduce video file size with multiple compression levels.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload a video file</li>
        <li>Select the compression level</li>
        <li>Click "Start Compress"</li>
        <li>Download the compressed video after completion</li>
      </ol>
    </div>`
  },

  'video-trim': {
    title: 'Video Trim',
    html: `<div class="help-doc">
      <h2>Video Trim</h2>
      <p>Extract a specific segment from a video.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload a video file</li>
        <li>Set the start and end times</li>
        <li>Click "Start Trim"</li>
        <li>Export the trimmed video</li>
      </ol>
    </div>`
  },

  'video-gif': {
    title: 'Video to GIF',
    html: `<div class="help-doc">
      <h2>Video to GIF</h2>
      <p>Convert a video segment into a GIF animation — perfect for making memes.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload a video file</li>
        <li>Select the time range to convert</li>
        <li>Set the GIF dimensions and frame rate</li>
        <li>Click "Start Convert"</li>
        <li>Export the GIF file</li>
      </ol>
    </div>`
  },

  'video-merge': {
    title: 'Video Merge',
    html: `<div class="help-doc">
      <h2>Video Merge</h2>
      <p>Concatenate multiple video files into one.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload multiple video files</li>
        <li>Drag to reorder the merge sequence</li>
        <li>Click "Start Merge"</li>
        <li>Export the merged video</li>
      </ol>

      <div class="help-note">
        <p>For best results, merge videos with the same resolution and frame rate.</p>
      </div>
    </div>`
  },

  'text-diff': {
    title: 'Text Diff',
    html: `<div class="help-doc">
      <h2>Text Diff</h2>
      <p>Compare two text passages and highlight the differences.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Paste the original text in the left input box</li>
        <li>Paste the modified text in the right input box</li>
        <li>Click the "Compare" button</li>
        <li>View the diff results — additions/deletions/modifications are highlighted</li>
      </ol>
    </div>`
  },

  'text-counter': {
    title: 'Character Counter',
    html: `<div class="help-doc">
      <h2>Character Counter</h2>
      <p>Real-time statistics for character count, word count, line count, and paragraph count.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Type or paste text into the input box</li>
        <li>Statistics update in real time</li>
      </ol>
    </div>`
  },

  'text-formatter': {
    title: 'Formatter',
    html: `<div class="help-doc">
      <h2>Code Formatter</h2>
      <p>Supports JSON, XML, and SQL code formatting and beautification.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Select the format type (JSON / XML / SQL)</li>
        <li>Paste the code you want to format</li>
        <li>Click the "Format" button</li>
        <li>View the formatted result and copy with one click</li>
      </ol>
    </div>`
  },

  'text-encoder': {
    title: 'Encoder',
    html: `<div class="help-doc">
      <h2>Encoder</h2>
      <p>Supports Base64, URL, and Hex encoding/decoding.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Select the encoding type (Base64 / URL / Hex)</li>
        <li>Enter the content to encode or decode</li>
        <li>Click the "Encode" or "Decode" button</li>
        <li>View the result and copy</li>
      </ol>
    </div>`
  },

  'calc-scientific': {
    title: 'Scientific Calc',
    html: `<div class="help-doc">
      <h2>Scientific Calculator</h2>
      <p>Supports trigonometric functions, logarithms, exponentiation, and other advanced math operations.</p>

      <h3>Supported Features</h3>
      <ul>
        <li>Basic operations: addition, subtraction, multiplication, division</li>
        <li>Trigonometric: sin, cos, tan (degree/radian mode)</li>
        <li>Logarithms: log, ln</li>
        <li>Exponentiation: x², xʸ, √x</li>
        <li>Constants: π, e</li>
      </ul>
    </div>`
  },

  'calc-unit': {
    title: 'Unit Convert',
    html: `<div class="help-doc">
      <h2>Unit Converter</h2>
      <p>Supports length, weight, temperature, and other common unit conversions.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Select the conversion type (length/weight/temperature)</li>
        <li>Enter the value</li>
        <li>Select the source and target units</li>
        <li>The conversion result is displayed automatically</li>
      </ol>
    </div>`
  },

  'calc-currency': {
    title: 'Currency',
    html: `<div class="help-doc">
      <h2>Currency Converter</h2>
      <p>Real-time exchange rate calculation, supporting conversions between major currencies.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Select the source and target currencies</li>
        <li>Enter the amount</li>
        <li>The conversion result is displayed automatically</li>
      </ol>

      <div class="help-note">
        <p>Exchange rates are for reference only. For actual transactions, please refer to bank or financial institution rates.</p>
      </div>
    </div>`
  },

  'calc-loan': {
    title: 'Loan Calc',
    html: `<div class="help-doc">
      <h2>Loan Calculator</h2>
      <p>Calculate monthly payments, total interest, and repayment schedules. Supports equal installment and equal principal methods.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Enter the loan amount</li>
        <li>Enter the annual interest rate</li>
        <li>Enter the loan term (years/months)</li>
        <li>Select the repayment method (equal installment/equal principal)</li>
        <li>View monthly payment, total interest, and repayment details</li>
      </ol>
    </div>`
  },

  'creative-color': {
    title: 'Color Extractor',
    html: `<div class="help-doc">
      <h2>Color Extractor</h2>
      <p>Upload an image to automatically extract dominant colors and generate a color palette.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Upload an image file</li>
        <li>Dominant colors are automatically analyzed and extracted</li>
        <li>View the layered color palette display</li>
        <li>Click a color to copy its HEX value</li>
      </ol>
    </div>`
  },

  'creative-palette': {
    title: 'Palette Generator',
    html: `<div class="help-doc">
      <h2>Palette Generator</h2>
      <p>Generate harmonious color schemes with multiple color rules.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Select a base color</li>
        <li>Choose a color rule (complementary/analogous/triadic, etc.)</li>
        <li>A color scheme is generated automatically</li>
        <li>Click a color to copy its HEX value</li>
      </ol>
    </div>`
  },

  'creative-password': {
    title: 'Password Generator',
    html: `<div class="help-doc">
      <h2>Password Generator</h2>
      <p>Generate secure random passwords with three strength levels: Simple, Medium, and Ultimate.</p>

      <h3>Strength Levels</h3>
      <ul>
        <li><strong>Simple</strong>: 8 characters, letters and numbers only</li>
        <li><strong>Medium</strong>: 12 characters, letters + numbers + special characters</li>
        <li><strong>Ultimate</strong>: 20 characters, full character set, maximum security</li>
      </ul>
    </div>`
  },

  'creative-typing': {
    title: 'Typing Test',
    html: `<div class="help-doc">
      <h2>Typing Test</h2>
      <p>Bilingual word lists (Chinese/English), multiple difficulty levels, real-time typing speed test.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Select language (Chinese/English)</li>
        <li>Select difficulty level</li>
        <li>Click "Start Test"</li>
        <li>Type the prompted text</li>
        <li>View your WPM and accuracy after the test ends</li>
      </ol>
    </div>`
  },

  'ai-polish': {
    title: 'AI Polish',
    html: `<div class="help-doc">
      <h2>AI Text Polish</h2>
      <p>Intelligently analyze and optimize text expression with multiple polish directions.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Enter the text you want to polish</li>
        <li>Select a polish direction (formal/concise/academic/conversational, etc.)</li>
        <li>Click "Start Polish"</li>
        <li>Compare the original and polished text</li>
        <li>Copy the satisfactory result</li>
      </ol>
    </div>`
  },

  'ai-translate': {
    title: 'AI Translate',
    html: `<div class="help-doc">
      <h2>AI Translate</h2>
      <p>Sentence-by-sentence translation with highlighted correspondences.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Enter the text you want to translate</li>
        <li>Select the source and target languages</li>
        <li>Click "Start Translate"</li>
        <li>View the sentence-by-sentence translation results</li>
      </ol>
    </div>`
  },

  'ai-doc': {
    title: 'AI Doc Generator',
    html: `<div class="help-doc">
      <h2>AI Document Generator</h2>
      <p>Generate professional PDF documents through conversational interaction with automatic formatting.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Enter the document topic and requirements</li>
        <li>AI automatically generates document content</li>
        <li>Preview the generated result</li>
        <li>Export as a PDF file</li>
      </ol>
    </div>`
  },

  'ai-chat': {
    title: 'AI Chat',
    html: `<div class="help-doc">
      <h2>AI Chat</h2>
      <p>Intelligent Q&A assistant with multi-turn conversation support.</p>

      <h3>How to Use</h3>
      <ol class="help-steps">
        <li>Type your question in the input box</li>
        <li>AI automatically generates a response</li>
        <li>Continue asking follow-up questions for multi-turn conversation</li>
      </ol>
    </div>`
  },

  'faq-general': {
    title: 'General',
    html: `<div class="help-doc">
      <h2>FAQ - General</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Is ToolKnit free?</div>
        <div class="help-faq-a">A: Yes, ToolKnit is completely free to use, with no ads or in-app purchases.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Are my files uploaded to a server?</div>
        <div class="help-faq-a">A: No. All file processing is done locally. Files are never uploaded to any server. AI tools only send text content to the AI API for processing.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Which operating systems are supported?</div>
        <div class="help-faq-a">A: Currently supports Windows 10/11 (64-bit). macOS and Linux versions are being planned.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: How do I switch languages?</div>
        <div class="help-faq-a">A: Click the settings icon at the bottom of the sidebar, then select Chinese or English in the "Language" section.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Where are my files saved?</div>
        <div class="help-faq-a">A: By default, files are saved in the ToolKnit folder under your Documents. You can view and open the storage location from the settings page.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Is batch processing supported?</div>
        <div class="help-faq-a">A: Yes. Most tools (PDF merge, image conversion, audio conversion, etc.) support batch file processing.</div>
      </div>
    </div>`
  },

  'faq-ffmpeg': {
    title: 'FFmpeg',
    html: `<div class="help-doc">
      <h2>FAQ - FFmpeg</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: What is the FFmpeg extension?</div>
        <div class="help-faq-a">A: FFmpeg is an open-source multimedia processing library. ToolKnit's audio conversion, video conversion, and other features depend on it. You'll be automatically prompted to download it on first use.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: How much space does FFmpeg need?</div>
        <div class="help-faq-a">A: The FFmpeg extension is about 80-100MB. It's saved in the app directory after download and can then be used offline.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: What if the FFmpeg download fails?</div>
        <div class="help-faq-a">A: Check your network connection and try disabling your firewall/antivirus before retrying. The app will automatically try multiple backup download sources.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Can I install FFmpeg manually?</div>
        <div class="help-faq-a">A: The FFmpeg extension is managed automatically by the app — no manual installation needed. If you encounter issues, try re-downloading.</div>
      </div>
    </div>`
  },

  'faq-privacy': {
    title: 'Privacy & Security',
    html: `<div class="help-doc">
      <h2>FAQ - Privacy & Security</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Are my files safe?</div>
        <div class="help-faq-a">A: Yes. All file processing (PDF, image, audio, video, etc.) is done locally and never uploaded to any server.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Do AI tools save my data?</div>
        <div class="help-faq-a">A: AI tools (polish, translate, chat, etc.) send text content to the AI API for processing, but do not save your input locally.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Is PDF encryption secure?</div>
        <div class="help-faq-a">A: PDF encryption uses industry-standard encryption algorithms. Security depends on password strength. We recommend using passwords of 8+ characters with letters, numbers, and special characters.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Does the app collect usage data?</div>
        <div class="help-faq-a">A: ToolKnit does not collect any user privacy data and contains no tracking code or analytics tools.</div>
      </div>
    </div>`
  },

  'faq-update': {
    title: 'Updates',
    html: `<div class="help-doc">
      <h2>FAQ - Updates</h2>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: How do I check for updates?</div>
        <div class="help-faq-a">A: Go to the settings page and click "Check for Updates" in the "Version & Updates" section. The app also checks automatically on startup.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: What if the update download is slow?</div>
        <div class="help-faq-a">A: The app automatically selects the optimal download source based on your system language. If it's still slow, check your network connection or try a different network.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Can I skip a forced update?</div>
        <div class="help-faq-a">A: No. Forced updates typically contain important security fixes or feature improvements — you must update to continue using the app.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: What if the update fails?</div>
        <div class="help-faq-a">A: Check your network connection, disable your firewall/antivirus, and try again. If the problem persists, you can manually download the latest installer and install it over the existing version.</div>
      </div>

      <div class="help-faq-item">
        <div class="help-faq-q">Q: Will updating erase my settings?</div>
        <div class="help-faq-a">A: No. Updates only replace application files — user settings and data are not affected.</div>
      </div>
    </div>`
  }
};

export default HELP_CONTENT_EN;
