import { readGlobalStyles } from './lib/global-styles.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, windowRuntime, styles, navigation, native] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8').then(async main => `${main}\n${await readFile(new URL('../src/application-runtime.js', import.meta.url), 'utf8')}`),
  readFile(new URL('../src/app/window-runtime.js', import.meta.url), 'utf8'),
  readGlobalStyles(import.meta.url),
  readFile(new URL('../src/tool-nav-unified.css', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
]);

assert.match(windowRuntime, /classList\.toggle\('use-css-window-radius', radius > 0\)/);
assert.match(main, /createWindowRuntime\(/);
assert.match(windowRuntime, /: 'large', custom: WINDOW_RADIUS_CUSTOM_DEFAULT/);
assert.match(windowRuntime, /setting\?\.mode\) \? setting\.mode : 'large'/);
assert.doesNotMatch(main, /classList\.toggle\('use-native-window-radius'/);
assert.match(styles, /body\.use-css-window-radius:not\(\.window-is-maximized\)[\s\S]*clip-path:\s*inset\(0 round var\(--toolknit-window-radius\)\)/);
assert.match(styles, /body\.use-css-window-radius:not\(\.window-is-maximized\)\s*\{[^}]*background:\s*transparent\s*!important/, 'the rounded document must not paint an opaque canvas background outside its clipping layer');
assert.match(styles, /html\.window-is-maximized body\s*\{[^}]*background:\s*var\(--tk-window-bg, #060607\)\s*!important/, 'maximized windows keep their opaque background');
assert.match(styles, /html\s*\{[\s\S]*background:\s*transparent\s*!important/);
assert.doesNotMatch(native, /CreateRoundRectRgn/);
assert.doesNotMatch(styles, /\.has-custom-background \.category-chip:not\(\.is-active\)[\s\S]{0,220}border-width:\s*1\.5px/);
assert.doesNotMatch(styles, /\.app\.is-v2-home \.category-chip\s*\{[\s\S]{0,500}(?:-webkit-)?mask-image:/);
assert.match(styles, /\.app\.is-v2-home \.category-chip::before\s*\{[\s\S]{0,320}inset:\s*0\.5px;[\s\S]{0,220}filter:\s*blur\(0\.25px\)/);
assert.doesNotMatch(navigation, /:is\(\.settings-v2-back, \.pdf-merge-v2-back, \.tool-page-v2-back, \.ppt-draft-editor-back\)\s*\{[\s\S]{0,500}(?:-webkit-)?mask-image:/);
assert.match(navigation, /\.tk-tool-nav \.tk-nav-back\s*\{[^}]*width:\s*36px;[^}]*border-radius:\s*999px;/);
assert.match(navigation, /\.tk-tool-nav \.tk-nav-back:hover\s*\{[^}]*width:\s*64px;/);
assert.doesNotMatch(navigation, /--tool-back-outline-progress|conic-gradient/);
assert.match(styles, /\.home-v2-support-top\s*\{[^}]*border-radius:\s*999px/);
assert.match(navigation, /\.tk-nav-button::after\s*\{\s*content:\s*none;/);

console.log('window radius rendering contract passed');
