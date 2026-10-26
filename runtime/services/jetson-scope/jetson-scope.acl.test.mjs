// Token files must be owner-only. win32 checks use icacls; POSIX checks use mode bits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeOwnerOnlyToken,
  readOwnerOnlyToken,
  aclEntries,
  isOwnerOnly,
  _setIcaclsRunner,
} from './jetson-scope.mjs';

const win = process.platform === 'win32';
const winOnly = !win && 'icacls ACLs are win32-only; POSIX uses mode 0600';
const posixOnly = win && 'mode bits are POSIX-only; win32 uses icacls';
const ICACLS = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe');
const show = (file) => {
  const out = execFileSync(ICACLS, [file], { encoding: 'utf8', windowsHide: true });
  console.log(out);
  return out;
};
const withDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'jscope-acl-'));
  try {
    return fn(dir);
  } finally {
    _setIcaclsRunner(null);
    rmSync(dir, { recursive: true, force: true });
  }
};
const assertOwnerOnly = (file) => {
  const aces = aclEntries(file);
  assert.equal(aces.length, 1, 'exactly one ACE: ' + JSON.stringify(aces));
  assert.match(aces[0], /:\(F\)$/);
  assert.doesNotMatch(
    aces.join('\n'),
    /SYSTEM|Administrators|Everyone|Users|S-1-15-|AppContainer/i
  );
  assert.ok(isOwnerOnly(file));
};

test(
  'new token: ACL is owner-only on the EMPTY file, before the token is written',
  { skip: winOnly },
  () =>
    withDir((dir) => {
      const file = join(dir, 'join-token.txt');
      let checked = false;
      writeOwnerOnlyToken(file, 'test-token', {
        afterAcl(f) {
          assert.equal(statSync(f).size, 0, 'still empty when the ACL is checked');
          show(f);
          assertOwnerOnly(f);
          checked = true;
        },
      });
      assert.ok(checked);
      assert.equal(readFileSync(file, 'utf8'), 'test-token\n');
      assertOwnerOnly(file);
    })
);

test('new token: refuses to overwrite an existing file', () =>
  withDir((dir) => {
    const file = join(dir, 't.txt');
    writeOwnerOnlyToken(file, 'a');
    assert.throws(() => writeOwnerOnlyToken(file, 'b'));
    assert.equal(readFileSync(file, 'utf8'), 'a\n');
  }));

test(
  'new token: an ACL failure removes the empty file and returns no token',
  { skip: winOnly },
  () =>
    withDir((dir) => {
      const file = join(dir, 'join-token.txt');
      _setIcaclsRunner(() => {
        throw new Error('injected icacls failure');
      });
      assert.throws(() => writeOwnerOnlyToken(file, 'never'), /owner-only ACL/);
      assert.equal(existsSync(file), false);
    })
);

test(
  'legacy token with inherited ACEs is fixed to owner-only on read, content unchanged',
  { skip: winOnly },
  () =>
    withDir((dir) => {
      const file = join(dir, 'join-token.txt');
      writeFileSync(file, 'legacy-token\n'); // inherits the temp dir's ACEs
      console.log('before read:');
      show(file);
      assert.equal(isOwnerOnly(file), false, 'starts with inherited ACEs');
      assert.equal(readOwnerOnlyToken(file), 'legacy-token');
      console.log('after read:');
      show(file);
      assertOwnerOnly(file);
      assert.equal(readFileSync(file, 'utf8'), 'legacy-token\n');
    })
);

test('read refuses when the reapply fails; the file is kept unchanged', { skip: winOnly }, () =>
  withDir((dir) => {
    const file = join(dir, 'view-token.txt');
    writeFileSync(file, 'keep-me\n');
    _setIcaclsRunner((args) => {
      if (args.length > 1) throw new Error('injected reapply failure');
      return `${file} BUILTIN\\Users:(I)(RX)\n\nSuccessfully processed 1 files; Failed processing 0 files\n`;
    });
    assert.throws(() => readOwnerOnlyToken(file), /refusing token file/);
    assert.ok(existsSync(file));
    assert.equal(readFileSync(file, 'utf8'), 'keep-me\n');
  })
);

test('read refuses when the ACL is still not owner-only after reapply', { skip: winOnly }, () =>
  withDir((dir) => {
    const file = join(dir, 'view-token.txt');
    writeFileSync(file, 'keep-me\n');
    _setIcaclsRunner(() => `${file} Everyone:(R)\n\nSuccessfully processed 1 files\n`);
    assert.throws(() => readOwnerOnlyToken(file), /still not owner-only/);
    assert.equal(readFileSync(file, 'utf8'), 'keep-me\n');
  })
);

test('POSIX: a token wider than 0600 is chmodded to 0600 on read', { skip: posixOnly }, () =>
  withDir((dir) => {
    const file = join(dir, 'join-token.txt');
    writeFileSync(file, 'p\n', { mode: 0o644 });
    assert.equal(readOwnerOnlyToken(file), 'p');
    assert.equal(statSync(file).mode & 0o777, 0o600);
  })
);

test('new token: a failed token write leaves no file and returns no token', () =>
  withDir((dir) => {
    const file = join(dir, 'join-token.txt');
    let got;
    assert.throws(() => {
      got = writeOwnerOnlyToken(file, 'never', {
        writeToken() {
          throw new Error('injected write failure');
        },
      });
    }, /could not write token file/);
    assert.equal(got, undefined);
    assert.equal(existsSync(file), false);
  }));

test('read refuses an empty or whitespace-only token file and keeps it', () =>
  withDir((dir) => {
    for (const [name, body] of [
      ['empty.txt', null],
      ['blank.txt', ' \n\t\r\n'],
    ]) {
      const file = join(dir, name);
      if (body === null)
        writeOwnerOnlyToken(file, 'x', { writeToken() {} }); // owner-only, empty
      else
        writeOwnerOnlyToken(file, 'x', {
          writeToken: (p) => writeFileSync(p, body, { flag: 'r+' }),
        });
      assert.throws(() => readOwnerOnlyToken(file), /refusing empty token file/);
      assert.ok(existsSync(file));
      assert.equal(readFileSync(file, 'utf8'), body ?? '');
    }
  }));
