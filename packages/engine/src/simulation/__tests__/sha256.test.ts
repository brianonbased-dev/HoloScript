/**
 * sha256.test.ts — validates the contract hash primitive module.
 *
 * Covers:
 *  - RFC 6234 §B.1-2 SHA-256 test vectors (empty, "abc", 56-byte
 *    multi-block input)
 *  - Cross-check against Node's native crypto.createHash('sha256')
 *    on random inputs spanning single-block, block-boundary, and
 *    multi-block sizes
 *  - hashBytes dispatcher produces correctly-shaped output per mode
 *  - hashStringForCAEL dispatcher preserves legacy FNV-1a format
 *    (back-compat) and uses distinct 'cael-sha-' prefix for SHA-256
 *  - hashShapeMatchesMode catches malformed/tampered hashes against
 *    a declared mode (Prereq 3 mid-trace tamper detection)
 *  - fnv1aStringLegacy matches the pre-Option-C CAEL fnv1a output
 *    bit-exactly (ensures existing traces verify under new code)
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  HashMode,
  HASH_MODE_DEFAULT,
  fnv1aBytes,
  fnv1aStringLegacy,
  sha256Bytes,
  hashBytes,
  hashStringForCAEL,
  hashShapeMatchesMode,
} from '../sha256';

// Helper: deterministic pseudorandom bytes for cross-check inputs
function randomBytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let a = seed >>> 0;
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    out[i] = t & 0xff;
  }
  return out;
}

describe('sha256 module — HashMode + dispatchers', () => {
  it('HASH_MODE_DEFAULT is fnv1a (Option C: FNV-1a default, SHA-256 opt-in)', () => {
    const expected: HashMode = 'fnv1a';
    expect(HASH_MODE_DEFAULT).toBe(expected);
  });
});

describe('sha256Bytes — RFC 6234 test vectors', () => {
  const te = new TextEncoder();

  it('SHA-256("") matches NIST empty-input vector', () => {
    expect(sha256Bytes(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('SHA-256("abc") matches RFC 6234 §B.1', () => {
    expect(sha256Bytes(te.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('SHA-256(multi-block input) matches RFC 6234 §B.2', () => {
    const input = te.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    expect(sha256Bytes(input)).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});

describe('sha256Bytes — cross-check vs Node native crypto', () => {
  // Covers single-byte, block-boundary (63/64/65), multi-block-boundary
  // (127/128/129), large (1KB, 16KB). If any bit-pattern triggers a
  // carry-handling bug, these sizes hit it.
  it.each([1, 63, 64, 65, 127, 128, 129, 1024, 16384])(
    'agrees with native at size %i',
    (size) => {
      const input = randomBytes(size, size * 13);
      const pureJS = sha256Bytes(input);
      const native = createHash('sha256').update(input).digest('hex');
      expect(pureJS).toBe(native);
    },
  );
});

describe('fnv1aBytes — byte-domain FNV-1a', () => {
  it('returns 8 hex chars', () => {
    expect(fnv1aBytes(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic', () => {
    const input = randomBytes(100, 42);
    expect(fnv1aBytes(input)).toBe(fnv1aBytes(input));
  });

  it('produces distinct output for distinct input', () => {
    expect(fnv1aBytes(new Uint8Array([1]))).not.toBe(fnv1aBytes(new Uint8Array([2])));
  });

  it('empty input produces FNV offset basis', () => {
    expect(fnv1aBytes(new Uint8Array(0))).toBe('811c9dc5');
  });
});

describe('fnv1aStringLegacy — preserves pre-Option-C CAEL format', () => {
  it("returns 'cael-<8hex>' shape", () => {
    expect(fnv1aStringLegacy('hello')).toMatch(/^cael-[0-9a-f]{8}$/);
  });

  it('matches the pre-Option-C output for a known string (back-compat)', () => {
    // Reference implementation inline (the original CAELTrace.ts:fnv1a)
    const compute = (input: string): string => {
      let h = 2166136261;
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return `cael-${(h >>> 0).toString(16).padStart(8, '0')}`;
    };
    expect(fnv1aStringLegacy('hello')).toBe(compute('hello'));
    expect(fnv1aStringLegacy('{"event":"init"}')).toBe(compute('{"event":"init"}'));
  });
});

describe('hashBytes dispatcher', () => {
  const input = randomBytes(256, 99);

  it('mode=fnv1a returns 8 hex chars', () => {
    const out = hashBytes(input, 'fnv1a');
    expect(out).toMatch(/^[0-9a-f]{8}$/);
    expect(out).toBe(fnv1aBytes(input));
  });

  it('mode=sha256 returns 64 hex chars', () => {
    const out = hashBytes(input, 'sha256');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out).toBe(sha256Bytes(input));
  });

  it('two modes produce different output on the same input', () => {
    expect(hashBytes(input, 'fnv1a')).not.toBe(hashBytes(input, 'sha256'));
  });
});

describe('hashStringForCAEL dispatcher', () => {
  it("mode=fnv1a returns 'cael-<8hex>' legacy format", () => {
    expect(hashStringForCAEL('abc', 'fnv1a')).toMatch(/^cael-[0-9a-f]{8}$/);
    expect(hashStringForCAEL('abc', 'fnv1a')).toBe(fnv1aStringLegacy('abc'));
  });

  it("mode=sha256 returns 'cael-sha-<64hex>' new format", () => {
    expect(hashStringForCAEL('abc', 'sha256')).toMatch(/^cael-sha-[0-9a-f]{64}$/);
  });

  it('modes produce distinctly-prefixed outputs (self-identifying)', () => {
    const fnv = hashStringForCAEL('test', 'fnv1a');
    const sha = hashStringForCAEL('test', 'sha256');
    expect(fnv.startsWith('cael-sha-')).toBe(false);
    expect(sha.startsWith('cael-sha-')).toBe(true);
  });

  it('SHA-256 CAEL output embeds the raw 64-hex SHA-256 of UTF-8 bytes', () => {
    const input = 'abc';
    const bytes = new TextEncoder().encode(input);
    const expected = `cael-sha-${sha256Bytes(bytes)}`;
    expect(hashStringForCAEL(input, 'sha256')).toBe(expected);
  });
});

describe('hashShapeMatchesMode — Prereq 3 tamper detection', () => {
  it('accepts byte-domain FNV-1a output under mode=fnv1a', () => {
    expect(hashShapeMatchesMode('deadbeef', 'fnv1a')).toBe(true);
  });

  it('accepts CAEL FNV-1a chain format under mode=fnv1a', () => {
    expect(hashShapeMatchesMode('cael-deadbeef', 'fnv1a')).toBe(true);
  });

  it('accepts byte-domain SHA-256 output under mode=sha256', () => {
    expect(
      hashShapeMatchesMode('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256'),
    ).toBe(true);
  });

  it('accepts CAEL SHA-256 chain format under mode=sha256', () => {
    expect(
      hashShapeMatchesMode(
        'cael-sha-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'sha256',
      ),
    ).toBe(true);
  });

  it('REJECTS sha256-shaped hash under mode=fnv1a (attack: sha256 hash in fnv1a-declared trace)', () => {
    expect(
      hashShapeMatchesMode('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'fnv1a'),
    ).toBe(false);
  });

  it('REJECTS fnv1a-shaped hash under mode=sha256 (attack: fnv1a hash in sha256-declared trace)', () => {
    expect(hashShapeMatchesMode('deadbeef', 'sha256')).toBe(false);
    expect(hashShapeMatchesMode('cael-deadbeef', 'sha256')).toBe(false);
  });

  it('rejects malformed output (non-hex, wrong length, empty)', () => {
    expect(hashShapeMatchesMode('', 'fnv1a')).toBe(false);
    expect(hashShapeMatchesMode('', 'sha256')).toBe(false);
    expect(hashShapeMatchesMode('NOT-A-HASH', 'fnv1a')).toBe(false);
    expect(hashShapeMatchesMode('12345', 'fnv1a')).toBe(false);
    expect(hashShapeMatchesMode('xyz12345', 'fnv1a')).toBe(false);
  });
});
