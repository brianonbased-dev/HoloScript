/**
 * Runtime-resolved service version.
 *
 * Read from package.json ONCE at module load so the /health endpoint and
 * /.well-known/mcp discovery doc always report the actually-deployed version
 * without needing a code edit on every bump.
 *
 * Why not hardcode: version strings have drifted multiple times (prod reported
 * 6.0.0 while source was 7.0.0 because three separate callsites held the
 * string literal). Session-start rule: "No hardcoded stats — any count in a
 * file becomes stale on the next deploy."
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

/** Engine package the host depends on. Version is read from whatever copy Node resolves. */
const ENGINE_PACKAGE_NAME = '@holoscript/absorb-service';

function resolveVersion(): string {
  try {
    // dist/version.js → services/absorb-service/dist/ → parent is services/absorb-service/
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolvePath(here, '..', 'package.json'), // running from dist/
      resolvePath(here, '..', '..', 'package.json'), // running from src/ via tsx
    ];
    for (const candidate of candidates) {
      try {
        const raw = readFileSync(candidate, 'utf8');
        const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
        if (parsed && typeof parsed.version === 'string' && parsed.name === '@holoscript/absorb-service-host') {
          return parsed.version;
        }
      } catch {
        // Try next candidate
      }
    }
  } catch {
    // Fall through to env / fallback
  }

  const envVersion = process.env.npm_package_version;
  if (typeof envVersion === 'string' && envVersion.length > 0) {
    return envVersion;
  }

  // Last resort: return a sentinel so operators can tell something went wrong
  // rather than a stale-looking-but-misleading number.
  return '0.0.0-unknown';
}

export const SERVICE_VERSION: string = resolveVersion();

export interface EngineVersionFields {
  /** Version string from the resolved engine package.json, or null if it could not be read. */
  engineVersion: string | null;
  /** Present when resolution succeeded. Name is the resolved package name. */
  engine?: { name: string; version: string };
  /** Present when engineVersion is null. /health must stay up if the engine cannot be resolved. */
  engineVersionReason?: string;
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * package.json for the engine copy Node actually loaded.
 *
 * `exports` on @holoscript/absorb-service did not expose ./package.json, so
 * that subpath is now exported and resolved first. If a deployed copy still
 * blocks it, resolve the package entry and walk up to the package.json that
 * owns that file. Never a relative workspace path.
 */
function resolveEnginePackageJsonPath(require: NodeRequire): string {
  try {
    return require.resolve(`${ENGINE_PACKAGE_NAME}/package.json`);
  } catch (subpathErr) {
    let entry: string;
    try {
      entry = require.resolve(ENGINE_PACKAGE_NAME);
    } catch (entryErr) {
      throw new Error(
        `${reasonOf(subpathErr)}; entry fallback: ${reasonOf(entryErr)}`,
      );
    }
    let dir = dirname(entry);
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, 'package.json');
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: unknown };
        if (parsed.name === ENGINE_PACKAGE_NAME) return candidate;
      } catch {
        // Keep walking. A directory without this package's manifest is expected.
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error(
      `${reasonOf(subpathErr)}; no ${ENGINE_PACKAGE_NAME} package.json above ${entry}`,
    );
  }
}

function resolveEngineVersionFields(): EngineVersionFields {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = resolveEnginePackageJsonPath(require);
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
    if (parsed.name !== ENGINE_PACKAGE_NAME || typeof parsed.version !== 'string' || parsed.version.length === 0) {
      return {
        engineVersion: null,
        engineVersionReason: `package.json at ${pkgPath} is not ${ENGINE_PACKAGE_NAME} with a version string`,
      };
    }
    return {
      engineVersion: parsed.version,
      engine: { name: ENGINE_PACKAGE_NAME, version: parsed.version },
    };
  } catch (err) {
    return {
      engineVersion: null,
      engineVersionReason: reasonOf(err),
    };
  }
}

export const ENGINE_VERSION_FIELDS: EngineVersionFields = resolveEngineVersionFields();
