import assert from 'node:assert/strict';

export function isPrivateSkillFile(file) {
  return /(?:^|\/)(?:SKILL\.md|skills(?:\/|$)|\.codex(?:\/|$))/i.test(file.replaceAll('\\', '/'));
}

export function assertReleaseFilePolicy(files) {
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    assert.ok(!isPrivateSkillFile(normalized), `Private Skill must not ship: ${file}`);
    assert.ok(!/(?:^|\/)(?:\.codex-backups|\.windsurf|\.mimosa|_research|tmp|scripts)(?:\/|$)/i.test(normalized),
      `Internal maintenance file must not ship: ${file}`);
    assert.ok(!/(?:^|\/)(?:AGENTS\.md|V3_[^/]+\.md|changelog-internal\.md|tauri\.(?:dev|test)\.conf\.json)$/i.test(normalized),
      `Internal maintenance document must not ship: ${file}`);
    assert.ok(!/\.(?:map|pdb|log|zip|tgz)$/i.test(normalized), `Debug and test output must not ship: ${file}`);
  }
}
