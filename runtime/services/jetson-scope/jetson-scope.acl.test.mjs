// On win32 a freshly written token must carry an owner-only ACL (current user, nothing else).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { writeOwnerOnlyToken } from './jetson-scope.mjs';

const skip = process.platform !== 'win32' && 'icacls ACLs are win32-only; POSIX uses mode 0600';

test('writeOwnerOnlyToken leaves only the current owner on the ACL', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'jscope-acl-'));
  try {
    const file = join(dir, 'join-token.txt');
    writeOwnerOnlyToken(file, 'test-token');
    assert.ok(existsSync(file));
    const out = execFileSync('icacls', [file], { encoding: 'utf8', windowsHide: true });
    console.log(out);
    const aces = out
      .split(/\r?\n/)
      .map((l) => l.replace(file, '').trim())
      .filter((l) => /:\(/.test(l));
    assert.equal(aces.length, 1, 'exactly one ACE: ' + JSON.stringify(aces));
    const me = userInfo().username.toLowerCase();
    assert.ok(
      aces[0].toLowerCase().includes('\\' + me + ':') || aces[0].toLowerCase().startsWith(me + ':'),
      aces[0]
    );
    assert.match(aces[0], /\(F\)$/);
    assert.doesNotMatch(
      aces.join('\n'),
      /SYSTEM|Administrators|Everyone|Users|S-1-15-|AppContainer/i
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeOwnerOnlyToken refuses to overwrite an existing token', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jscope-acl-'));
  try {
    const file = join(dir, 't.txt');
    writeOwnerOnlyToken(file, 'a');
    assert.throws(() => writeOwnerOnlyToken(file, 'b'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
