import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldQrUrl } from './worldQrUrl';

// A coarse tripwire, not proof: a file that draws a QR (imports QRCodeImage) and
// mentions /w/ without the helper is flagged. claude3's review of #315 planted six
// defects and this caught one (a helper imported but never applied, the qrcode
// library used directly, a URL from an API response, a relative import and a path
// built at runtime all pass it), and it reads only 2 of the 7 QRCodeImage importers.
// The proof is behavioural, one test per screen that reads back what its QR encodes:
// PublishModal.test.tsx, SharePanel.test.tsx and publish/PublishPanel.test.tsx.
describe('coarse tripwire: a QRCodeImage caller that mentions /w/ without the helper', () => {
  // It reads every source file (about 1,700); under load that passed vitest's 5 s default.
  it('finds none', () => {
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
      return (
        source.includes('@/components/QRCodeImage') &&
        source.includes('/w/') &&
        !source.includes('worldQrUrl')
      );
    });
    expect(offenders).toEqual([]);
    expect(files.some((file) => file.endsWith('PublishModal.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('SharePanel.tsx'))).toBe(true);
  }, 60_000);
});

// The property, not its silhouette: what address a world QR encodes. Anchoring
// matters because the first transform (SharePanel, PR #308) was an unanchored
// regex that rewrote `?next=/w/abc` and `/shared/w/abc` too (review 2026-09-21).
describe('worldQrUrl: the address a world QR must encode', () => {
  it('rewrites the /w/ short link to the /shared/ viewer the headset admits', () => {
    expect(worldQrUrl('https://holoscript.studio/w/abc123')).toBe(
      'https://holoscript.studio/shared/abc123'
    );
    expect(worldQrUrl('https://holoscript.studio/w/abc123/')).toBe(
      'https://holoscript.studio/shared/abc123'
    );
    expect(worldQrUrl('https://holoscript.studio/w/abc123?v=2#top')).toBe(
      'https://holoscript.studio/shared/abc123?v=2#top'
    );
    expect(worldQrUrl('/w/abc123')).toBe('/shared/abc123');
  });

  it('leaves a /shared/ link, a custom domain root, and an empty string alone', () => {
    expect(worldQrUrl('https://holoscript.studio/shared/abc123')).toBe(
      'https://holoscript.studio/shared/abc123'
    );
    expect(worldQrUrl('https://worlds.example/')).toBe('https://worlds.example/');
    expect(worldQrUrl('')).toBe('');
  });

  it('is anchored to the pathname: /w/ inside a query or under another path is not a short link', () => {
    expect(worldQrUrl('https://holoscript.studio/login?next=/w/abc123')).toBe(
      'https://holoscript.studio/login?next=/w/abc123'
    );
    expect(worldQrUrl('https://holoscript.studio/shared/w/abc123')).toBe(
      'https://holoscript.studio/shared/w/abc123'
    );
    expect(worldQrUrl('https://holoscript.studio/w/abc123/extra')).toBe(
      'https://holoscript.studio/w/abc123/extra'
    );
  });

  // claude3's review of #315: these edges contradicted the docblock.
  it('ignores case, as the headset scanner does', () => {
    expect(worldQrUrl('/W/abc123')).toBe('/shared/abc123');
    expect(worldQrUrl('HTTPS://HOLOSCRIPT.STUDIO/W/abc123')).toBe(
      'https://holoscript.studio/shared/abc123'
    );
  });

  it('decides relative by the scheme: a protocol-relative link keeps its host, whitespace is trimmed', () => {
    expect(worldQrUrl('//holoscript.studio/w/abc123')).toBe('//holoscript.studio/shared/abc123');
    expect(worldQrUrl('  /w/abc123')).toBe('/shared/abc123');
  });

  it('returns a string the URL parser rejects as given rather than throwing in a render', () => {
    // Both of these make `new URL` throw ERR_INVALID_URL.
    expect(worldQrUrl('http://')).toBe('http://');
    expect(worldQrUrl('https://[::1/w/abc')).toBe('https://[::1/w/abc');
  });
});
