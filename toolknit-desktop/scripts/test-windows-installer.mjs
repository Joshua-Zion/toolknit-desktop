import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src-tauri/windows/installer.nsi', import.meta.url), 'utf8');
const autostart = await readFile(new URL('../src-tauri/src/native_runtime/core/autostart.rs', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('Section WebView2'), source.indexOf('Section Install'));
assert.ok(!section.includes('$UpdateMode'), 'runtime repair must also execute during updates');
assert.equal((section.match(/Call DetectWebView2/g) || []).length, 2, 'detect before installation and after successful execution');
assert.match(section, /ClearErrors\s+StrCpy \$1 -1\s+ExecWait/);
assert.match(section, /\$1 = 3010\s+SetRebootFlag true/);
assert.match(section, /runtime-not-detected/);
assert.match(section, /MB_RETRYCANCEL[\s\S]*\/SD IDCANCEL/);
assert.ok(!section.includes('IDIGNORE'), 'missing dependencies must not be ignored');
assert.match(source, /Function RunMainBinary\s+\$\{If\} \$\{RebootFlag\}\s+Return/);
assert.match(source, /Function \.onInstSuccess\s+\$\{If\} \$\{RebootFlag\}\s+SetErrorLevel 3010/);
assert.match(source, /Function RestorePreviousInstallLocation\s+\$\{If\} \$RequestedInstallDir != ""/);
const startupName = autostart.match(/const VALUE_NAME: &str = "([^"]+)"/)[1];
assert.ok(source.includes(`!define TOOLKNIT_AUTOSTART_VALUE_NAME "${startupName}"`));
assert.match(source, /\$0 == '\$\\"\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe\$\\" --autostart'\s+DeleteRegValue/);
for (const label of ['webview2Recovery', 'webview2Manual', 'webview2Reboot']) {
  for (const language of ['ENGLISH', 'SIMPCHINESE']) {
    assert.ok(source.includes(`LangString ${label} \${LANG_${language}}`));
  }
}
console.log('Windows installer dependency, reboot, path and startup ownership contracts passed.');
