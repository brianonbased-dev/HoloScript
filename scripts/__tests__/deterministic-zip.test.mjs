import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createDeterministicZip,
  crc32,
  readDeterministicZip,
} from '../holo-ci/lib/deterministic-zip.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('deterministic ZIP bytes ignore input order', () => {
  const forward = createDeterministicZip([
    { name: 'release-manifest.json', data: Buffer.from('{"version":"0.1.0"}\n') },
    { name: 'holoscriptc.exe', data: Buffer.from([0x4d, 0x5a, 0x01, 0x02]) },
  ]);
  const reverse = createDeterministicZip([
    { name: 'holoscriptc.exe', data: Buffer.from([0x4d, 0x5a, 0x01, 0x02]) },
    { name: 'release-manifest.json', data: Buffer.from('{"version":"0.1.0"}\n') },
  ]);

  assert.equal(sha256(forward), sha256(reverse));
  assert.deepEqual(
    [...readDeterministicZip(forward)],
    [
      ['holoscriptc.exe', Buffer.from([0x4d, 0x5a, 0x01, 0x02])],
      ['release-manifest.json', Buffer.from('{"version":"0.1.0"}\n')],
    ]
  );
});

test('CRC32 matches the standard check vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('unsafe and duplicate names fail closed', () => {
  assert.throws(() => createDeterministicZip([{ name: '../escape', data: 'x' }]), /unsafe/u);
  assert.throws(
    () =>
      createDeterministicZip([
        { name: 'same', data: 'x' },
        { name: 'same', data: 'y' },
      ]),
    /duplicate/u
  );
});
