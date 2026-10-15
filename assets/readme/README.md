# README visual assets

The 3.1 README uses eight monochrome comic banners and exactly two actual
homepage captures. Chinese and English READMEs share the same artwork;
English descriptions and surrounding text explain the Chinese comic scenes.

## Current 3.1 assets

| File | Purpose | Dimensions | Bytes |
| --- | --- | --- | ---: |
| `v3.1/01-hero.webp` | Opening: the boy developer and his head-perched spider | 2048 x 1152 | 492356 |
| `v3.1/02-record.webp` | One-click recording, copying and screenshot history | 2048 x 1152 | 502114 |
| `v3.1/03-screenshot.webp` | Capture, annotate, extract, translate and pin | 2048 x 1152 | 609990 |
| `v3.1/04-clipboard.webp` | Find copied text and pictures | 2048 x 1152 | 571882 |
| `v3.1/05-files.webp` | PDF, PPT and duplicate-file cleanup | 2048 x 1152 | 551152 |
| `v3.1/06-media.webp` | Image and audio/video workflows | 2048 x 1152 | 543908 |
| `v3.1/07-agent.webp` | Desktop, CLI and MCP workflows | 2048 x 1152 | 535738 |
| `v3.1/08-start.webp` | Getting started and independent development | 2048 x 1152 | 532642 |
| `v3.1/desktop-home.webp` | Actual repository 3.1 homepage, browser-rendered, window radius disabled | 1280 x 720 | 92690 |
| `v3.1/web-home.webp` | Actual Chinese ToolKnit.com homepage | 1280 x 720 | 122104 |
| `v3.1/avatar-zihang.png` | ZihangDong public GitHub avatar, original colors | 128 x 128 | 24572 |
| `v3.1/avatar-joshua.png` | Joshua-Zion public GitHub avatar, original colors | 128 x 128 | 34255 |
| `v3.1/avatar-hqyx.png` | hqyx2025 public GitHub avatar, original colors | 128 x 128 | 26830 |
| `v3.1/spider-wave.svg` | Original blinking, waving spider expression | 88 x 88 | 1171 |
| `v3.1/link-download-zh.svg` | Chinese Windows download action | 168 x 40 | 462 |
| `v3.1/link-web-zh.svg` | Chinese web app action | 144 x 40 | 453 |
| `v3.1/link-english.svg` | English README action | 104 x 40 | 429 |
| `v3.1/link-download-en.svg` | English Windows download action | 192 x 40 | 468 |
| `v3.1/link-web-en.svg` | English web app action | 176 x 40 | 456 |
| `v3.1/link-chinese.svg` | Chinese README action | 104 x 40 | 444 |

Total: 4644116 bytes (approximately 4.43 MiB). Comics and screenshots are lossless
grayscale WebP, with equal RGB channels verified after decoding. Contributor
avatars retain their original colors in PNG. Comic exports are 2K;
screenshots retain their actual capture resolution rather than being upscaled.

## Creation and references

- Created on 2026-10-15 with the user-selected `gpt-image-2.5` model.
- Style reference: [handraw-style / FH-023, Deadpan Doodle](https://github.com/yang0/handraw-style/blob/master/images/individual/FH/FH-023.webp).
  The reference supplies sparse pen linework and deadpan expressions; the
  characters, dialogue, actions and scenes are newly composed for ToolKnit.
- The approved opening image supplies the boy and spider identities for the
  remaining chapters. Two local image edits remove accidentally duplicated
  spiders in the recording and file-work scenes.
- Composition: white background, black ink, generous whitespace, readable
  speech bubbles and few props. No colored badges, gradients or generated
  product screenshots. Chapter themes and exact Chinese dialogue are listed
  in [the illustration brief](v3.1/ILLUSTRATION_BRIEF.md).
- Both screenshots were captured on 2026-10-15. The desktop capture uses the
  current repository interface rendered through Vite in a browser, not a
  demonstration of native Windows functions. The web capture is the live
  public homepage switched to Chinese. The desktop's existing Settings / Window
  appearance / No rounded corners option was used before capture; production
  styles were not changed. Only grayscale conversion and WebP encoding were
  applied to the captured pixels.
- Contributor avatars were retrieved from public GitHub profile image URLs on
  2026-10-15, resized to 128 x 128, kept in their original colors and masked into circles
  with transparent corners. They identify the credited contributors only.
- The expression SVG is original project artwork. Declarative SVG animation
  makes the spider blink and wave; its static appearance still works if a viewer
  disables animation. It contains no scripts or external references.
- The six action SVGs use black capsules with bold, underlined white labels.
  Contributor names use plain bold text; only the colored avatars link to profiles.
  This avoids custom README CSS, which GitHub strips. Body and contents links retain
  the viewer's native link colors. The action SVGs contain no scripts or external references.
- The bottom Star History image reuses the previous public service chart URL,
  checked successfully (HTTP 200). It updates through the service rather than
  using the illustrative local `star-growth.svg`; third-party availability varies.
- Raw generation output, third-party reference copies, API configuration,
  credentials, local logs and private maintenance Skills are not published.

## Preserved legacy assets

These files remain available for historical documentation or direct links.
They are not extra product screenshots embedded in the current README.

| File | Original purpose |
| --- | --- |
| `hero-v2.webp` | Previous opening visual |
| `desktop-v21.png` | Desktop 2.1 product preview |
| `web-version.png` | Previous web preview |
| `donation-support.webp` | Donation QR codes, still linked from the README |
| `supporters-thanks.webp` | Supporter thanks, still linked from the README |
| `categories/` | Historical tool gallery; see [its notes](categories/README.md) |
| `star-growth.svg` | Previous decorative Star chart |

Before refreshing assets, inspect references in both READMEs and other docs.
Keep versioned directories coherent, update this manifest with the exports,
and preserve still-used donation, supporter and historical assets. Do not
commit raw recordings, private files or unoptimized generation output.
