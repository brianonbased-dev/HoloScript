/**
 * load-env.ts — Local env loader for MCP server dev and self-hosted deployments.
 *
 * Mirrors the essential logic of ai-ecosystem's loadLocalEnv() (holomesh-env.mjs)
 * without a cross-repo ESM/CJS dependency. Imported as a side-effect at the
 * top of http-server.ts and index.ts so process.env is populated before any
 * module-level `const X = process.env.X || ''` constants are evaluated.
 *
 * Load order (first file that exists wins, except for MESH_RUNTIME_REFRESH_KEYS):
 *   1. <mcp-server-root>/.env            (packages/mcp-server/.env)
 *   2. <monorepo-root>/.env              (HoloScript/.env)
 *   3. ~/.ai-ecosystem/.env              (ecosystem fallback — same as loadLocalEnv())
 *
 * Skipped when:
 *   - HOLOMESH_NO_DOTENV=1              (test isolation)
 *   - Running on Railway                (managed env — no local files)
 *
 * Shadow denylist (never auto-inject — let OS keyring / shell auth own these):
 *   GITHUB_TOKEN, GH_TOKEN, PERSONAL_ACCESS_TOKEN
 *
 * Mesh refresh keys (always overwrite from disk — stale inherited values break
 * team membership auth; see W.129 in ai-ecosystem MEMORY.md):
 *   HOLOMESH_API_KEY, HOLOMESH_TEAM_ID, HOLOMESH_AGENT_ID, HOLOMESH_WALLET_KEY
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// ── Constants ─────────────────────────────────────────────────────────────────

const IS_RAILWAY = Boolean(
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_ENVIRONMENT
);

/** Keys that should never be injected from .env — let OS keyring / shell auth own them. */
const ENV_SHADOW_DENYLIST = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'PERSONAL_ACCESS_TOKEN',
]);

/**
 * Keys that must be refreshed from disk even when already set in process.env.
 * A stale HOLOMESH_API_KEY from a prior shell session causes 403 "Not a member
 * of this team" against the wrong team. Disk wins; intentional overrides should
 * set HOLOMESH_NO_DOTENV=1 or export explicitly before starting the server.
 */
const MESH_RUNTIME_REFRESH_KEYS = new Set([
  'HOLOMESH_API_KEY',
  'HOLOMESH_TEAM_ID',
  'HOLOMESH_AGENT_ID',
  'HOLOMESH_WALLET_KEY',
]);

// ── Path resolution ───────────────────────────────────────────────────────────

/**
 * __dirname is:
 *   src/utils/   — when running via `tsx src/http-server.ts` (dev)
 *   dist/utils/  — when running via `node dist/http-server.js` (prod/start)
 *
 * Both are exactly 2 levels below the mcp-server package root and 4 levels
 * below the monorepo root, so the relative path math is stable across both.
 */
const MCP_SERVER_DIR = resolve(__dirname, '..', '..');
const MONOREPO_ROOT  = resolve(__dirname, '..', '..', '..', '..');

const ENV_CANDIDATES: string[] = [
  resolve(MCP_SERVER_DIR, '.env'),
  resolve(MONOREPO_ROOT, '.env'),
  resolve(homedir(), '.ai-ecosystem', '.env'),
];

// ── Parser ────────────────────────────────────────────────────────────────────

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvContent(content: string): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = normalized.indexOf('=');
    if (eq === -1) continue;
    const key = normalized.slice(0, eq).trim();
    const value = stripWrappingQuotes(normalized.slice(eq + 1).trim());
    if (key) pairs.push({ key, value });
  }
  return pairs;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export interface LoadMcpEnvResult {
  /** Absolute path of the .env file that was loaded, or null if none found. */
  loadedFrom: string | null;
  /** Env vars that were set (not already present or refreshed). */
  injected: string[];
  /** Env vars in the file that were skipped (shadow denylist). */
  denied: string[];
  /** Why loading was skipped, if applicable. */
  skipped?: 'HOLOMESH_NO_DOTENV' | 'railway';
}

/**
 * Load local .env into process.env. Called as a module side effect — import
 * this module before any module-level `process.env.*` reads.
 *
 * Safe to call multiple times (idempotent for non-refresh keys; refresh keys
 * always re-read from disk on each call, which is intentional for test
 * isolation when using HOLOMESH_NO_DOTENV=1 between test cases).
 */
export function loadMcpEnv(
  options: { envPaths?: string[]; silent?: boolean } = {}
): LoadMcpEnvResult {
  if (process.env.HOLOMESH_NO_DOTENV === '1') {
    return { loadedFrom: null, injected: [], denied: [], skipped: 'HOLOMESH_NO_DOTENV' };
  }
  if (IS_RAILWAY) {
    return { loadedFrom: null, injected: [], denied: [], skipped: 'railway' };
  }

  const candidates = options.envPaths ?? ENV_CANDIDATES;
  const injected: string[] = [];
  const denied: string[] = [];
  let loadedFrom: string | null = null;

  for (const envPath of candidates) {
    let content: string;
    try {
      content = readFileSync(envPath, 'utf-8');
    } catch {
      continue; // file doesn't exist — try next candidate
    }

    const pairs = parseEnvContent(content);
    for (const { key, value } of pairs) {
      if (ENV_SHADOW_DENYLIST.has(key)) {
        denied.push(key);
        continue;
      }
      if (!process.env[key] || MESH_RUNTIME_REFRESH_KEYS.has(key)) {
        process.env[key] = value;
        injected.push(key);
      }
    }

    loadedFrom = envPath;
    break; // Stop at first file that exists (for non-refresh keys, first wins)
  }

  // Second pass: refresh MESH_RUNTIME_REFRESH_KEYS from remaining candidates
  // when the first file didn't have them (e.g. HOLOMESH_API_KEY in ~/.ai-ecosystem/.env
  // but not in packages/mcp-server/.env).
  if (loadedFrom !== null) {
    const missingRefreshKeys = Array.from(MESH_RUNTIME_REFRESH_KEYS).filter(
      (k) => !process.env[k]
    );
    if (missingRefreshKeys.length > 0) {
      for (const envPath of candidates) {
        if (envPath === loadedFrom) continue;
        let content: string;
        try {
          content = readFileSync(envPath, 'utf-8');
        } catch {
          continue;
        }
        const pairs = parseEnvContent(content);
        for (const { key, value } of pairs) {
          if (!missingRefreshKeys.includes(key)) continue;
          if (!process.env[key] || MESH_RUNTIME_REFRESH_KEYS.has(key)) {
            process.env[key] = value;
            injected.push(key);
          }
        }
      }
    }
  }

  if (!options.silent && loadedFrom) {
    console.debug(`[load-env] loaded from ${loadedFrom} (${injected.length} vars)`);
  }

  return { loadedFrom, injected, denied };
}

// ── Side effect — call at import time ─────────────────────────────────────────
// This ensures process.env is fully populated before any module-level
// `const X = process.env.X || ''` constants are evaluated in the importing module.
loadMcpEnv({ silent: true });
