/**
 * HOLOMESH_DATA_DIR must sit on a mounted volume, or every key revocation is
 * lost on the next deploy. The check reads /proc/self/mountinfo.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dataDirVolumeCheck, mountPointFor } from '../state';

const ROOT_ONLY = [
  '22 1 0:21 / / rw,relatime - overlay overlay rw,lowerdir=/x',
  '23 22 0:22 / /proc rw,nosuid - proc proc rw',
  '24 22 8:1 /etc/hosts /etc/hosts rw - ext4 /dev/sda1 rw',
].join('\n');
const WITH_VOLUME = `${ROOT_ONLY}\n31 22 8:16 / /data/holomesh rw,relatime - ext4 /dev/sdb rw`;
const ESCAPED = `${ROOT_ONLY}\n32 22 8:17 / /data/holo\\040mesh rw - ext4 /dev/sdc rw`;

const TEMP = mkdtempSync(join(tmpdir(), 'holomesh-mountinfo-'));
afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

function mountinfoFile(text: string): string {
  const p = join(TEMP, `mountinfo-${Math.random().toString(36).slice(2)}`);
  writeFileSync(p, text);
  return p;
}

describe('mountPointFor', () => {
  it('picks the longest mount point holding the dir', () => {
    expect(mountPointFor('/data/holomesh', WITH_VOLUME)).toBe('/data/holomesh');
    expect(mountPointFor('/data/holomesh/sub', WITH_VOLUME)).toBe('/data/holomesh');
    expect(mountPointFor('/app/.holoscript/holomesh', WITH_VOLUME)).toBe('/');
  });

  it('does not treat a sibling with a shared prefix as inside the mount', () => {
    expect(mountPointFor('/data/holomesh-old', WITH_VOLUME)).toBe('/');
  });

  it('decodes octal escapes in mount points', () => {
    expect(mountPointFor('/data/holo mesh', ESCAPED)).toBe('/data/holo mesh');
  });
});

describe('dataDirVolumeCheck', () => {
  it('reports a problem when the dir is on the root filesystem', () => {
    const r = dataDirVolumeCheck('/app/.holoscript/holomesh', mountinfoFile(ROOT_ONLY));
    expect(r.problem).toMatch(/not on a mounted volume/);
    expect(r.mountPoint).toBe('/');
  });

  it('passes when the dir is a mounted volume', () => {
    const r = dataDirVolumeCheck('/data/holomesh', mountinfoFile(WITH_VOLUME));
    expect(r).toEqual({ problem: null, mountPoint: '/data/holomesh' });
  });

  it('reports nothing when mountinfo cannot be read (not Linux)', () => {
    const r = dataDirVolumeCheck('/data/holomesh', join(TEMP, 'does-not-exist'));
    expect(r).toEqual({ problem: null, mountPoint: null });
  });
});
