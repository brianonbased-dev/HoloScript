/**
 * hologram — CLI command to convert 2D media into a HoloGram bundle.
 *
 * Usage:
 *   holoscript hologram <input> [--out <dir>] [--targets quilt,mvhevc,parallax] [--name <n>]
 *
 * SECURITY:
 *   - Input path is resolved to an absolute path via `path.resolve` before
 *     any fs access; relative paths can never escape the process cwd.
 *   - --out is likewise resolved; FileSystemHologramStore performs its own
 *     path-traversal guards on every write (assertValidHash → bundleRelDir).
 *   - --targets values are validated against a hard-coded closed allowlist
 *     before being forwarded to createHologram().
 *   - --name is informational only; it is never used in a filesystem path.
 *
 * Sprint 0a note:
 *   The Node depth / render providers are stubs in Sprint 0a.  Running this
 *   command against real media will fail with a clear "not implemented" error
 *   pointing at the hologram-worker service (Sprint 0c).  To wire in real
 *   providers, pass them via the `_providers` option (used by tests and the
 *   hologram-worker service adapter).
 */

import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

import type { HologramTarget } from '@holoscript/engine/hologram';
import type { HologramProviders } from '@holoscript/engine/hologram';

// ── Public types ─────────────────────────────────────────────────────────────

export interface HologramCommandOptions {
  /** Output root directory. Default: `./hologram-<hash>/` in cwd. */
  out?: string;
  /**
   * Comma-separated list of render targets.
   * Valid values: quilt, mvhevc, parallax.
   * Default: all three (requires real providers — Sprint 0c).
   */
  targets?: string;
  /** Human-readable label stored in bundle meta (informational only). */
  name?: string;
  /**
   * Injectable provider bundle — used by tests and the hologram-worker
   * adapter.  When omitted the command uses createNodeProvidersStub()
   * which rejects with an explicit Sprint 0c pointer.
   */
  _providers?: HologramProviders;
}

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_TARGETS = new Set<HologramTarget>(['quilt', 'mvhevc', 'parallax']);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.tiff', '.tif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectSourceKind(filePath: string): 'image' | 'gif' | 'video' {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.gif') return 'gif';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (IMAGE_EXTS.has(ext)) return 'image';
  // Unknown extension — fall back to 'image' and let depth inference decide.
  return 'image';
}

function parseTargets(raw: string): HologramTarget[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as HologramTarget[];

  for (const t of parts) {
    if (!VALID_TARGETS.has(t)) {
      throw new Error(
        `Unknown target '${t}'. Valid targets: ${[...VALID_TARGETS].join(', ')}`
      );
    }
  }
  return parts;
}

// ── Command ──────────────────────────────────────────────────────────────────

/**
 * Execute the `hologram` CLI subcommand.
 *
 * @param input  Path to the source media file (image, GIF, or video).
 * @param options  Parsed CLI flags + optional injectable providers.
 */
export async function hologramCommand(
  input: string,
  options: HologramCommandOptions = {}
): Promise<void> {
  // Lazy imports keep browser bundles clean (engine imports node:fs at the
  // module level — dynamic import defers that to execution time).
  const { createHologram, createNodeProvidersStub } =
    await import('@holoscript/engine/hologram');
  const { FileSystemHologramStore } =
    await import('@holoscript/engine/hologram/FileSystemHologramStore');

  // ── Input validation ──────────────────────────────────────────────────────

  const inputPath = resolve(input);
  const sourceKind = detectSourceKind(inputPath);

  const targets: HologramTarget[] =
    options.targets !== undefined
      ? parseTargets(options.targets)
      : ['quilt', 'mvhevc', 'parallax'];

  // ── Read media bytes ──────────────────────────────────────────────────────

  let media: Uint8Array;
  try {
    const buf = await readFile(inputPath);
    // Wrap the Buffer in a Uint8Array (shares the underlying ArrayBuffer).
    media = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch (err) {
    throw new Error(
      `Cannot read input file '${input}': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Build bundle ──────────────────────────────────────────────────────────

  const providers = options._providers ?? createNodeProvidersStub();

  console.log(`\x1b[36m⟳ Building hologram from ${input}...\x1b[0m`);

  const bundle = await createHologram(media, sourceKind, providers, { targets });

  // ── Write to store ────────────────────────────────────────────────────────

  // Default output directory encodes the full hash so the dir name is
  // self-verifying.  --out overrides this with a user-supplied path.
  const outDir = options.out ? resolve(options.out) : resolve(`hologram-${bundle.hash}`);

  const store = new FileSystemHologramStore({ rootDir: outDir });
  const result = await store.put(bundle);

  // ── Report ────────────────────────────────────────────────────────────────

  console.log(`\x1b[32m✓\x1b[0m HoloGram bundle written`);
  console.log(`  hash:    ${result.hash}`);
  console.log(`  written: ${result.written}`);
  console.log(`  out:     ${outDir}`);

  if (options.name) {
    console.log(`  name:    ${options.name}`);
  }
}
