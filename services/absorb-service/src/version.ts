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
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

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
