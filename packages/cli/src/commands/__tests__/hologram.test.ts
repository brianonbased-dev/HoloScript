/**
 * hologram.test.ts — CLI round-trip test for the hologram subcommand.
 *
 * Strategy:
 *  - Use injectable `_providers` to bypass real ML inference.
 *  - Write to a mkdtemp scratch directory; clean up after each test.
 *  - Run without render targets (targets: '') to avoid needing quilt /
 *    mvhevc / parallax providers; the orchestrator still builds depth +
 *    normal + meta + hash (full bundle plumbing is exercised).
 *  - Assert: exit = no throw, output dir exists, meta.json readable,
 *    hash in dir name matches hash in meta.json.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Minimal 1×1 PNG fixture ───────────────────────────────────────────────
// A valid single-pixel white PNG (68 bytes). Built from the canonical
// PNG spec so we don't need an image library in tests.
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d,                           // IHDR length
  0x49, 0x48, 0x44, 0x52,                           // "IHDR"
  0x00, 0x00, 0x00, 0x01,                           // width = 1
  0x00, 0x00, 0x00, 0x01,                           // height = 1
  0x08, 0x02,                                       // 8-bit RGB
  0x00, 0x00, 0x00,                                 // no interlace
  0x90, 0x77, 0x53, 0xde,                           // IHDR CRC
  0x00, 0x00, 0x00, 0x0c,                           // IDAT length
  0x49, 0x44, 0x41, 0x54,                           // "IDAT"
  0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f, 0x00,  // deflate stream
  0x05, 0xfe, 0x02, 0xfe,                           // IDAT CRC
  0xdc, 0xcc, 0x59, 0xe7,
  0x00, 0x00, 0x00, 0x00,                           // IEND length
  0x49, 0x45, 0x4e, 0x44,                           // "IEND"
  0xae, 0x42, 0x60, 0x82,                           // IEND CRC
]);

// ── Stub providers ─────────────────────────────────────────────────────────

const DEPTH_RESULT = {
  depthMap: new Float32Array([0.5]),  // 1-pixel depth
  width: 1,
  height: 1,
  frames: 1,
  backend: 'cpu' as const,
  modelId: 'test-stub',
};

function makeProviders() {
  return {
    depth: {
      infer: vi.fn().mockResolvedValue(DEPTH_RESULT),
    },
    // No quilt / mvhevc / parallax — we'll pass targets='' (empty list)
    // so the orchestrator skips all render paths but still builds the
    // depth + normal + meta bundle.
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('hologramCommand', () => {
  let tmpDir: string;
  let inputFile: string;
  let outDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'holo-test-'));
    inputFile = join(tmpDir, 'fixture.png');
    outDir = join(tmpDir, 'out');
    writeFileSync(inputFile, TINY_PNG);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a bundle with depth+normal without render targets', async () => {
    const { hologramCommand } = await import('../hologram');
    const providers = makeProviders();

    await hologramCommand(inputFile, {
      out: outDir,
      targets: '',        // empty string → parsed as [] → no render targets
      _providers: providers as never,
    });

    // Output dir must exist
    expect(existsSync(outDir)).toBe(true);

    // Store writes to rootDir/<hash[0:2]>/<hash>/
    const entries = readdirSync(outDir);
    expect(entries.length).toBeGreaterThan(0);

    // Walk to find meta.json
    let metaContent: string | undefined;
    let foundHash = '';
    for (const prefix of entries) {
      const hashDirs = readdirSync(join(outDir, prefix));
      for (const h of hashDirs) {
        const meta = join(outDir, prefix, h, 'meta.json');
        if (existsSync(meta)) {
          metaContent = readFileSync(meta, 'utf-8');
          foundHash = h;
        }
      }
    }

    expect(metaContent).toBeDefined();
    const meta = JSON.parse(metaContent!);
    expect(meta.hash).toBe(foundHash);
    expect(meta.sourceKind).toBe('image');
    expect(providers.depth.infer).toHaveBeenCalledOnce();
  });

  it('uses default output directory named hologram-<hash> when --out omitted', async () => {
    const { hologramCommand } = await import('../hologram');
    const providers = makeProviders();

    // Change cwd to tmpDir so the default dir lands there
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await hologramCommand(inputFile, {
        targets: '',
        _providers: providers as never,
      });
    } finally {
      process.chdir(origCwd);
    }

    // Should have created a "hologram-<hash>" dir in tmpDir
    const dirs = readdirSync(tmpDir).filter((d) => d.startsWith('hologram-'));
    expect(dirs.length).toBe(1);

    const hash = dirs[0].replace('hologram-', '');
    // Walk into store to find meta.json and verify hash consistency
    const storePath = join(tmpDir, dirs[0], hash.slice(0, 2), hash);
    const meta = JSON.parse(readFileSync(join(storePath, 'meta.json'), 'utf-8'));
    expect(meta.hash).toBe(hash);
  });

  it('rejects unknown targets with a helpful error', async () => {
    const { hologramCommand } = await import('../hologram');
    const providers = makeProviders();

    await expect(
      hologramCommand(inputFile, {
        out: outDir,
        targets: 'quilt,bogus',
        _providers: providers as never,
      })
    ).rejects.toThrow(/Unknown target 'bogus'/);
  });

  it('rejects missing input file with a clear error', async () => {
    const { hologramCommand } = await import('../hologram');
    const providers = makeProviders();

    await expect(
      hologramCommand(join(tmpDir, 'nonexistent.png'), {
        out: outDir,
        targets: '',
        _providers: providers as never,
      })
    ).rejects.toThrow(/Cannot read input file/);
  });
});
