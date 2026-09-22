import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldQrUrl } from './worldQrUrl';

// The census half of the done-when: "a test fails if one draws /w/". Every screen
// that draws a QR (imports QRCodeImage) and knows a /w/ link must go through the
// helper. PR #308 fixed one screen and left the other, and nothing objected.
describe('every QR screen that knows a /w/ link goes through worldQrUrl', () => {
  it('finds no QRCodeImage caller that mentions /w/ without the helper', () => {
    const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== 'node_modules') walk(full);
        } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          files.push(full);
        }
      }
    };
    walk(srcRoot);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('@/components/QRCodeImage') && source.includes('/w/') && !source.includes('worldQrUrl');
    });
    expect(offenders).toEqual([]);
    // The census saw the two screens it exists for.
    expect(files.some((file) => file.endsWith('PublishModal.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('SharePanel.tsx'))).toBe(true);
  });
});

// The property, not its silhouette: what address a world QR encodes. Anchoring
// matters because the first transform (SharePanel, PR #308) was an unanchored
// regex that rewrote `?next=/w/abc` and `/shared/w/abc` too (review 2026-09-21).
describe('worldQrUrl: the address a world QR must encode', () => {
  it('rewrites the /w/ short link to the /shared/ viewer the headset admits', () => {
    expect(worldQrUrl('https://holoscript.studio/w/abc123')).toBe('https://holoscript.studio/shared/abc123');
    expect(worldQrUrl('https://holoscript.studio/w/abc123/')).toBe('https://holoscript.studio/shared/abc123');
    expect(worldQrUrl('https://holoscript.studio/w/abc123?v=2#top')).toBe('https://holoscript.studio/shared/abc123?v=2#top');
    expect(worldQrUrl('/w/abc123')).toBe('/shared/abc123');
  });

  it('leaves a /shared/ link, a custom domain root, and an empty string alone', () => {
    expect(worldQrUrl('https://holoscript.studio/shared/abc123')).toBe('https://holoscript.studio/shared/abc123');
    expect(worldQrUrl('https://worlds.example/')).toBe('https://worlds.example/');
    expect(worldQrUrl('')).toBe('');
  });

  it('is anchored to the pathname: /w/ inside a query or under another path is not a short link', () => {
    expect(worldQrUrl('https://holoscript.studio/login?next=/w/abc123')).toBe('https://holoscript.studio/login?next=/w/abc123');
    expect(worldQrUrl('https://holoscript.studio/shared/w/abc123')).toBe('https://holoscript.studio/shared/w/abc123');
    expect(worldQrUrl('https://holoscript.studio/w/abc123/extra')).toBe('https://holoscript.studio/w/abc123/extra');
  });

  it('returns an unparseable string as given rather than throwing in a render', () => {
    expect(worldQrUrl('not a url at all ://')).toBe('not a url at all ://');
  });
});
