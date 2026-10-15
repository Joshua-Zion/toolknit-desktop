import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = p => readFile(p, 'utf8');
const canonical = value => value.replace(/\r\n/g, '\n').trimEnd();
const license = canonical(await read('../LICENSE'));
assert.match(license, /^# PolyForm Noncommercial License 1\.0\.0/);
// Official polyformproject.org text, with only line endings / final whitespace normalized.
const expectedHash = '7779a554c40798f0f9c04960b82154d16dc0fa64349d401d24146e5c81f64093';
assert.equal(createHash('sha256').update(license).digest('hex'), expectedHash);
for (const file of ['LICENSE', 'cli/LICENSE']) assert.equal(canonical(await read(file)), license);
const apache = canonical(await read('../LICENSES/Apache-2.0.txt'));
assert.match(apache, /Apache License[\s\S]*Version 2\.0, January 2004/);
for (const file of ['LICENSES/Apache-2.0.txt', 'cli/LICENSES/Apache-2.0.txt']) assert.equal(canonical(await read(file)), apache);
for (const file of ['../NOTICE', 'NOTICE', 'cli/NOTICE']) {
  const text = await read(file);
  assert.match(text, /Required Notice: Copyright 2026 Zihang Dong/);
  assert.match(text, /Previously granted Apache-2\.0 rights are not withdrawn/);
  assert.match(text, /Joshua-Zion PR #67/);
}
for (const file of ['package.json', 'cli/package.json']) {
  assert.equal(JSON.parse(await read(file)).license, 'PolyForm-Noncommercial-1.0.0', file);
}
assert.equal(JSON.parse(await read('package-lock.json')).packages[''].license, 'PolyForm-Noncommercial-1.0.0');
assert.equal(JSON.parse(await read('cli/npm-shrinkwrap.json')).packages[''].license, 'PolyForm-Noncommercial-1.0.0');
const cli = JSON.parse(await read('cli/package.json'));
assert.ok(cli.files.includes('NOTICE'));
assert.ok(cli.files.includes('LICENSES'));
const resources = JSON.parse(await read('src-tauri/tauri.conf.json')).bundle.resources;
for (const file of ['../LICENSE', '../NOTICE', '../LICENSES/Apache-2.0.txt']) assert.ok(resources.includes(file));
assert.match(await read('src/features/color-space-compare/README.md'), /LICENSES\/Apache-2\.0\.txt/);
for (const file of ['../README.md', '../README_EN.md', 'src/legal-data.js']) {
  assert.match(await read(file), /PolyForm Noncommercial 1\.0\.0/);
}
console.log('License contracts passed: official text, metadata, notices, Apache preservation and package inclusion.');
