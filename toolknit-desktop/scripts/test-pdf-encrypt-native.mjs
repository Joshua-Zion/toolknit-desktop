import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qpdfPath = join(projectRoot, 'src-tauri', 'resources', 'qpdf', 'qpdf.exe');
const auditDir = await mkdtemp(join(tmpdir(), 'toolknit-pdf-encrypt-'));

function runQpdf(args, { stdin = null, captureStdout = true } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(qpdfPath, args, {
      stdio: [stdin === null ? 'ignore' : 'pipe', captureStdout ? 'pipe' : 'ignore', 'pipe'],
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', rejectRun);
    child.once('close', code => {
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        spawnargs: child.spawnargs
      };
      if (code === 0) resolveRun(result);
      else rejectRun(Object.assign(new Error(result.stderr || result.stdout || `qpdf failed with exit code ${code}`), { result }));
    });
    if (stdin !== null) child.stdin.end(stdin);
  });
}

const sourcePath = join(auditDir, 'source.pdf');
const encryptedPath = join(auditDir, 'encrypted.pdf');
const decryptedPath = join(auditDir, 'decrypted.pdf');
const password = `中文密码安全测试-😀-${'long-password-'.repeat(4)}`;
const ownerPassword = 'owner-0123456789abcdef0123456789abcdef0123456789abcdef';

try {
  assert.ok(Buffer.byteLength(password, 'utf8') > 32);
  assert.ok(Buffer.byteLength(password, 'utf8') <= 127);

  const sourceDocument = await PDFDocument.create();
  sourceDocument.setTitle('ToolKnit encrypted structure regression');
  const font = await sourceDocument.embedFont(StandardFonts.Helvetica);
  const firstPage = sourceDocument.addPage([612, 792]);
  firstPage.drawText('ToolKnit AES-256 regression', { x: 48, y: 740, size: 18, font });
  sourceDocument.addPage([420, 595]);
  const field = sourceDocument.getForm().createTextField('customer.name');
  field.setText('ToolKnit');
  field.addToPage(firstPage, { x: 48, y: 680, width: 220, height: 28, font });
  await writeFile(sourcePath, await sourceDocument.save({ useObjectStreams: false }));

  const argumentLines = [
    '--warning-exit-0',
    '--password-mode=unicode',
    '--encrypt',
    `--user-password=${password}`,
    `--owner-password=${ownerPassword}`,
    '--bits=256',
    '--print=low',
    '--extract=n',
    '--modify-other=n',
    '--annotate=y',
    '--form=y',
    '--accessibility=y',
    '--assemble=n',
    '--',
    sourcePath,
    encryptedPath
  ];
  const argumentPayload = Buffer.from(`${argumentLines.join('\n')}\n`, 'utf8');
  const encryptResult = await runQpdf(['@-'], { stdin: argumentPayload, captureStdout: false });
  argumentPayload.fill(0);
  assert.deepEqual(encryptResult.spawnargs.slice(1), ['@-']);
  assert.ok(!encryptResult.spawnargs.join(' ').includes(password));
  assert.ok((await stat(encryptedPath)).size > 0);

  const encryptionInfo = await runQpdf(['--show-encryption', encryptedPath]);
  assert.match(encryptionInfo.stdout, /R = 6/);
  assert.match(encryptionInfo.stdout, /stream encryption method: AESv3/);
  assert.match(encryptionInfo.stdout, /extract for any purpose: not allowed/);
  assert.match(encryptionInfo.stdout, /print high resolution: not allowed/);
  assert.ok(!encryptionInfo.stdout.includes(password));

  await runQpdf(
    ['--password-mode=unicode', '--password-file=-', '--check', encryptedPath],
    { stdin: Buffer.from(`${password}\n`, 'utf8'), captureStdout: false }
  );
  await assert.rejects(() => runQpdf(
    ['--password-mode=unicode', '--password-file=-', '--check', encryptedPath],
    { stdin: Buffer.from('wrong-password\n', 'utf8'), captureStdout: false }
  ));
  const decryptResult = await runQpdf(
    ['--password-mode=unicode', '--password-file=-', '--decrypt', encryptedPath, decryptedPath],
    { stdin: Buffer.from(`${password}\n`, 'utf8'), captureStdout: false }
  );
  assert.ok(!decryptResult.spawnargs.join(' ').includes(password));
  await runQpdf(['--check', decryptedPath], { captureStdout: false });

  const decryptedDocument = await PDFDocument.load(await readFile(decryptedPath));
  assert.equal(decryptedDocument.getPageCount(), 2);
  assert.equal(decryptedDocument.getTitle(), 'ToolKnit encrypted structure regression');
  assert.deepEqual(decryptedDocument.getForm().getFields().map(fieldItem => fieldItem.getName()), ['customer.name']);
} finally {
  await rm(auditDir, { recursive: true, force: true });
}

console.log('PDF native AES-256 Unicode encryption regression checks passed');
