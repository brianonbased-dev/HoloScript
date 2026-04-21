/**
 * FileSystemHologramStore — Node-only filesystem implementation of
 * HologramStore. Used by the studio service (mounted on `/data/hologram`
 * via Railway volume `studio-data`) and by the hologram-worker service.
 *
 * NOT EXPORTED from `@holoscript/engine` or `@holoscript/engine/hologram`
 * barrels — this file imports `node:fs` and `node:path` at the top level
 * and would break browser bundles. Consumers that need the fs impl
 * import it by direct path:
 *
 *   import { FileSystemHologramStore } from
 *     '@holoscript/engine/hologram/FileSystemHologramStore';
 *
 * SECURITY (Sprint 0b.1, team mode SECURITY):
 *   - Paths are NEVER built from raw input. All hash/asset inputs pass
 *     through assertValidHash / assertValidAssetName before touching fs.
 *   - Writes are atomic: write to `.tmp.<pid>.<rand>`, then `rename`.
 *     A crash mid-write never leaves a readable partial bundle.
 *   - MaxBundleBytes guards total-bundle size at write time so a
 *     runaway depth map can't fill the volume.
 *   - The store does NOT fall back to any "close-enough" hash match;
 *     a bundle's path is a PURE function of its recomputed hash.
 */

import { createHash as nodeCreateHash } from 'node:crypto';
import { promises as fs, constants as fsConstants } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import type { HologramBundle, HologramMeta } from './HologramBundle';
import {
  assertValidAssetName,
  assertValidHash,
  bundleAssetRelPath,
  bundleRelDir,
  canonicalizeBundleForPut,
  HologramStoreError,
  type AssetName,
  type HologramStore,
  type HologramStorePutResult,
} from './HologramStore';

// ── Configuration ────────────────────────────────────────────────────────────

export interface FileSystemHologramStoreOptions {
  /**
   * Absolute filesystem root. All bundle dirs live under this path.
   * In production: `/data/hologram` (on the `studio-data` Railway
   * volume mounted at `/data`). In dev/test: a tmp dir.
   */
  rootDir: string;
  /**
   * Upper bound on total bundle size in bytes (sum of depth+normal+
   * rendered outputs + meta). Default: 256 MB. A well-formed 1080p
   * single-frame bundle is ~20 MB; a 30-frame 1080p GIF is ~150 MB.
   */
  maxBundleBytes?: number;
}

const DEFAULT_MAX_BUNDLE_BYTES = 256 * 1024 * 1024;

// ── Implementation ───────────────────────────────────────────────────────────

export class FileSystemHologramStore implements HologramStore {
  private readonly rootDir: string;
  private readonly maxBundleBytes: number;

  constructor(opts: FileSystemHologramStoreOptions) {
    if (typeof opts.rootDir !== 'string' || opts.rootDir.length === 0) {
      throw new HologramStoreError(
        'io_error',
        'FileSystemHologramStore: rootDir must be a non-empty absolute path'
      );
    }
    // Normalize to an absolute path so path-traversal asserts below have
    // a stable base to compare against.
    this.rootDir = resolve(opts.rootDir);
    this.maxBundleBytes = opts.maxBundleBytes ?? DEFAULT_MAX_BUNDLE_BYTES;
  }

  /**
   * Resolve a relative path against rootDir and assert it stays under it.
   * This is defense-in-depth: even though callers ONLY build relative
   * paths from validated hashes via bundleRelDir / bundleAssetRelPath,
   * re-verifying post-join catches any future refactor that mistakenly
   * allows a `..` segment to slip through.
   */
  private resolveUnderRoot(relPath: string): string {
    const abs = resolve(this.rootDir, relPath);
    // Root-prefix check is OS-path-separator-aware via resolve().
    // Append the separator so /data/hologram-evil doesn't match /data/hologram.
    const rootWithSep = this.rootDir.endsWith(sep) ? this.rootDir : this.rootDir + sep;
    if (abs !== this.rootDir && !abs.startsWith(rootWithSep)) {
      throw new HologramStoreError(
        'invalid_hash',
        `path traversal blocked: resolved path ${abs} is outside store root ${this.rootDir}`
      );
    }
    return abs;
  }

  async put(bundle: HologramBundle): Promise<HologramStorePutResult> {
    // 1. Canonical hash — the ONLY hash we trust.
    const authoritativeHash = await canonicalizeBundleForPut(bundle);

    // 2. Size check (sum of identity + rendered outputs).
    const renderedBytes =
      (bundle.quiltPng?.byteLength ?? 0) +
      (bundle.mvhevcMp4?.byteLength ?? 0) +
      (bundle.parallaxWebm?.byteLength ?? 0);
    const totalBytes =
      bundle.depthBin.byteLength + bundle.normalBin.byteLength + renderedBytes;
    if (totalBytes > this.maxBundleBytes) {
      throw new HologramStoreError(
        'size_limit_exceeded',
        `bundle is ${totalBytes} bytes, max is ${this.maxBundleBytes}`
      );
    }

    // 3. Idempotency: if meta.json already exists, short-circuit.
    const metaAbs = this.resolveUnderRoot(bundleAssetRelPath(authoritativeHash, 'meta.json'));
    if (await pathExists(metaAbs)) {
      return { hash: authoritativeHash, written: false };
    }

    // 4. Prepare dir.
    const dirAbs = this.resolveUnderRoot(bundleRelDir(authoritativeHash));
    await fs.mkdir(dirAbs, { recursive: true, mode: 0o755 });

    // 5. Write assets atomically (temp + rename for each).
    const metaJson = serializeMeta(bundle.meta, authoritativeHash);
    const writes: Array<Promise<void>> = [
      this.writeAtomic(metaAbs, Buffer.from(metaJson, 'utf8')),
      this.writeAtomic(
        this.resolveUnderRoot(bundleAssetRelPath(authoritativeHash, 'depth.bin')),
        Buffer.from(bundle.depthBin)
      ),
      this.writeAtomic(
        this.resolveUnderRoot(bundleAssetRelPath(authoritativeHash, 'normal.bin')),
        Buffer.from(bundle.normalBin)
      ),
    ];
    if (bundle.quiltPng) {
      writes.push(
        this.writeAtomic(
          this.resolveUnderRoot(bundleAssetRelPath(authoritativeHash, 'quilt.png')),
          Buffer.from(bundle.quiltPng)
        )
      );
    }
    if (bundle.mvhevcMp4) {
      writes.push(
        this.writeAtomic(
          this.resolveUnderRoot(bundleAssetRelPath(authoritativeHash, 'mvhevc.mp4')),
          Buffer.from(bundle.mvhevcMp4)
        )
      );
    }
    if (bundle.parallaxWebm) {
      writes.push(
        this.writeAtomic(
          this.resolveUnderRoot(bundleAssetRelPath(authoritativeHash, 'parallax.webm')),
          Buffer.from(bundle.parallaxWebm)
        )
      );
    }

    try {
      await Promise.all(writes);
    } catch (err) {
      throw new HologramStoreError(
        'io_error',
        `failed to write bundle ${authoritativeHash}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err
      );
    }

    return { hash: authoritativeHash, written: true };
  }

  async has(hash: string): Promise<boolean> {
    assertValidHash(hash);
    const metaAbs = this.resolveUnderRoot(bundleAssetRelPath(hash, 'meta.json'));
    return pathExists(metaAbs);
  }

  async getAsset(hash: string, asset: AssetName): Promise<Uint8Array | null> {
    assertValidHash(hash);
    assertValidAssetName(asset);
    const abs = this.resolveUnderRoot(bundleAssetRelPath(hash, asset));
    try {
      const buf = await fs.readFile(abs);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if (isEnoent(err)) return null;
      throw new HologramStoreError(
        'io_error',
        `failed to read ${asset} for ${hash}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err
      );
    }
  }

  async getMeta(hash: string): Promise<HologramMeta | null> {
    const bytes = await this.getAsset(hash, 'meta.json');
    if (!bytes) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch (err) {
      throw new HologramStoreError(
        'io_error',
        `corrupt meta.json for ${hash}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
    // Light shape check — full schema validation belongs to callers that
    // know the expected schemaVersion.
    if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed)) {
      throw new HologramStoreError(
        'io_error',
        `meta.json for ${hash} is missing schemaVersion`
      );
    }
    return parsed as HologramMeta;
  }

  /**
   * Write bytes atomically. Creates a sibling `.tmp.<pid>.<rand>` file,
   * flushes to disk, then renames over the final path. On Unix rename
   * is atomic within a filesystem; on Windows it's effectively atomic
   * for the observable reader contract.
   */
  private async writeAtomic(absPath: string, bytes: Buffer): Promise<void> {
    // Idempotent parent-dir create (needed for fresh shards).
    await fs.mkdir(dirname(absPath), { recursive: true, mode: 0o755 });
    const tmp = `${absPath}.tmp.${process.pid}.${nodeCreateHash('sha256')
      .update(bytes)
      .digest('hex')
      .slice(0, 8)}`;
    const fh = await fs.open(tmp, 'w', 0o644);
    try {
      await fh.writeFile(bytes);
      await fh.sync(); // fsync so the bytes are durable before rename
    } finally {
      await fh.close();
    }
    try {
      await fs.rename(tmp, absPath);
    } catch (err) {
      // Best-effort cleanup of the temp; ignore failures.
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  /** Expose root for tests and diagnostics. Never used to build paths. */
  getRootDir(): string {
    return this.rootDir;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeMeta(meta: HologramMeta, hash: string): string {
  // Stable-ish key order for readability + diff-friendliness. NOT used
  // for hashing (see canonicalMetaJson in HologramBundle.ts).
  // hash is included first so meta.json is self-verifying.
  return (
    JSON.stringify(
      {
        hash,
        schemaVersion: meta.schemaVersion,
        sourceKind: meta.sourceKind,
        width: meta.width,
        height: meta.height,
        frames: meta.frames,
        modelId: meta.modelId,
        backend: meta.backend,
        inferenceMs: meta.inferenceMs,
        createdAt: meta.createdAt,
      },
      null,
      2
    ) + '\n'
  );
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}
