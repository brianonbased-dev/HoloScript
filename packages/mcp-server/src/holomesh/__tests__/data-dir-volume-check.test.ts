/**
 * HOLOMESH_DATA_DIR must sit on a durable mounted volume, or every key
 * revocation is lost on the next deploy. The check reads /proc/self/mountinfo.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dataDirVolumeCheck, mountFor, mountPointFor, resolveDataDirPath } from '../state';

const ROOT_ONLY = [
  '22 1 0:21 / / rw,relatime - overlay overlay rw,lowerdir=/x',
  '23 22 0:22 / /proc rw,nosuid - proc proc rw',
  '24 22 8:1 /etc/hosts /etc/hosts rw - ext4 /dev/sda1 rw',
].join('\n');
const WITH_VOLUME = `${ROOT_ONLY}\n31 22 8:16 / /data/holomesh rw,relatime - ext4 /dev/sdb rw`;
const WITH_PARENT_VOLUME = `${ROOT_ONLY}\n33 22 8:18 / /app/.holoscript rw,relatime shared:5 - ext4 /dev/sdd rw`;
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

  it('reads the filesystem type after the separator, past optional fields', () => {
    expect(mountFor('/app/.holoscript/holomesh', WITH_PARENT_VOLUME)).toEqual({
      mountPoint: '/app/.holoscript',
      fsType: 'ext4',
    });
  });
});

describe('dataDirVolumeCheck', () => {
  it('reports a problem when the dir is on the root filesystem', () => {
    const r = dataDirVolumeCheck('/app/.holoscript/holomesh', mountinfoFile(ROOT_ONLY), false);
    expect(r.problem).toMatch(/not on a mounted volume/);
    expect(r.mountPoint).toBe('/');
  });

  it('passes when the dir is a mounted volume', () => {
    const r = dataDirVolumeCheck('/data/holomesh', mountinfoFile(WITH_VOLUME), true);
    expect(r).toEqual({
      problem: null,
      mountPoint: '/data/holomesh',
      fsType: 'ext4',
      checked: true,
    });
  });

  it('passes when a volume is mounted above the dir', () => {
    const r = dataDirVolumeCheck(
      '/app/.holoscript/holomesh',
      mountinfoFile(WITH_PARENT_VOLUME),
      true
    );
    expect(r.problem).toBeNull();
    expect(r.mountPoint).toBe('/app/.holoscript');
  });

  it.each(['tmpfs', 'ramfs', 'overlay'])('treats a %s mount as not durable', (fsType) => {
    const text = `${ROOT_ONLY}\n40 22 0:50 / /data/holomesh rw - ${fsType} ${fsType} rw`;
    const r = dataDirVolumeCheck('/data/holomesh', mountinfoFile(text), true);
    expect(r.problem).toMatch(new RegExp(`on a ${fsType} mount`));
    expect(r.mountPoint).toBe('/data/holomesh');
  });

  it('fails closed in production when mountinfo cannot be read', () => {
    const r = dataDirVolumeCheck('/data/holomesh', join(TEMP, 'does-not-exist'), true);
    expect(r.problem).toMatch(/could not be verified/);
    expect(r.checked).toBe(false);
  });

  it('reports nothing outside production when mountinfo cannot be read (not Linux)', () => {
    const r = dataDirVolumeCheck('/data/holomesh', join(TEMP, 'does-not-exist'), false);
    expect(r).toEqual({ problem: null, mountPoint: null, fsType: null, checked: false });
  });

  it('resolves a dir that does not exist yet through its nearest existing ancestor', () => {
    const real = join(TEMP, 'real-volume');
    mkdirSync(real);
    const link = join(TEMP, 'link-to-volume');
    symlinkSync(real, link);
    const realPath = realpathSync(real);
    expect(resolveDataDirPath(join(link, 'not', 'yet'))).toBe(join(realPath, 'not', 'yet'));

    const text = `${ROOT_ONLY}\n41 22 8:19 / ${realPath} rw - ext4 /dev/sde rw`;
    const r = dataDirVolumeCheck(join(link, 'not', 'yet'), mountinfoFile(text), true);
    expect(r).toMatchObject({ problem: null, mountPoint: realPath });
  });
});
