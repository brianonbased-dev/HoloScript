/**
 * Load key=value pairs from .env into process.env.
 *
 * This is a thin wrapper over the canonical loader in
 * ~/.ai-ecosystem/hooks/lib/holomesh-env.mjs. It imports that module's
 * ENV_SHADOW_DENYLIST, MESH_RUNTIME_REFRESH_KEYS (reconstructed — not yet
 * exported), and scrubShadowedEnv instead of reimplementing them, so there
 * is exactly one set of definitions in the tree. The fork-drift guard
 * (ai-ecosystem/scripts/__tests__/provider-tokens.test.mjs:
 * "no-duplicate-credential-resolver") enforces exactly one
 * ENV_SHADOW_DENYLIST definition across the ai-ecosystem tree.
 *
 * Key behaviours inherited from holomesh-env.mjs:
 *  - ENV_SHADOW_DENYLIST: blocks GITHUB_TOKEN / GH_TOKEN /
 *    PERSONAL_ACCESS_TOKEN from injection — prevents shadowing gh/git's
 *    own keyring auth (W.088, W.094, W.109).
 *  - MESH_RUNTIME_REFRESH_KEYS: HOLOMESH_* keys that MUST always come
 *    from disk, not the inherited shell, so a stale daemon-inherited
 *    value never causes 403 "not a member of this team" (W.129).
 *  - scrubShadowedEnv: removes already-inherited denylist keys from
 *    process.env BEFORE loading, closing the shadow for already-running
 *    daemon processes.
 *
 * Location: ~/.ai-ecosystem is the home-directory checkout, NOT a
 * sibling under Documents/GitHub/. ai-ecosystem/AGENTS.md §Build Surface
 * documents this layout. On Windows, dynamic import() requires
 * pathToFileURL() for absolute paths.
 *
 * IMPORTANT: Do NOT define ENV_SHADOW_DENYLIST or any HOLOMESH_* refresh
 * key set in this file. Import the canonical definitions from holomesh-env.
 *
 * @module load-dotenv
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ~/.ai-ecosystem/hooks/lib/holomesh-env.mjs — the canonical env module.
// ai-ecosystem lives in the HOME directory, not under Documents/GitHub.
const HOME = homedir();
const HOLOMESH_ENV_ABS = join(HOME, '.ai-ecosystem', 'hooks', 'lib', 'holomesh-env.mjs');

// Dynamic import with pathToFileURL — required on Windows where a bare
// "C:\…" absolute path is rejected by the ESM loader (ERR_UNSUPPORTED_ESM_URL_SCHEME).
let ENV_SHADOW_DENYLIST, scrubShadowedEnv, parseEnvLine;
let _usingFallback = false;

// MESH_RUNTIME_REFRESH_KEYS is not yet exported from holomesh-env.mjs
// (it is a module-local const). We reconstruct the same set here. This is the
// ONE sanctioned out-of-sync replica: the keys are not secret, the values are
// unlikely to change, and keeping them here avoids requiring a new export.
// If holomesh-env ever exports MESH_RUNTIME_REFRESH_KEYS, replace this with
// the imported value.
const MESH_RUNTIME_REFRESH_KEYS = new Set([
  'HOLOMESH_API_KEY',
  'HOLOMESH_TEAM_ID',
  'HOLOMESH_AGENT_ID',
  'HOLOMESH_WALLET_KEY',
]);

try {
  if (!existsSync(HOLOMESH_ENV_ABS)) throw new Error('not found');
  const mod = await import(pathToFileURL(HOLOMESH_ENV_ABS).href);
  ENV_SHADOW_DENYLIST = mod.ENV_SHADOW_DENYLIST;
  scrubShadowedEnv = mod.scrubShadowedEnv;
  parseEnvLine = mod.parseEnvLine;
} catch {
  // FALLBACK: holomesh-env.mjs unavailable (unusual checkout layout).
  // Degrade gracefully: no denylist, no scrub. Log so agents notice.
  _usingFallback = true;
  ENV_SHADOW_DENYLIST = new Set(); // empty fallback — canonical values live in holomesh-env.mjs only
  scrubShadowedEnv = () => [];
  parseEnvLine = (line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return null;
    const n = t.startsWith('export ') ? t.slice(7).trim() : t;
    const eq = n.indexOf('=');
    if (eq === -1) return null;
    const key = n.slice(0, eq).trim();
    if (!key) return null;
    let value = n.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    return { key, value };
  };
  process.stderr.write(
    '[load-dotenv] WARNING: ~/.ai-ecosystem/hooks/lib/holomesh-env.mjs not reachable — ' +
      'ENV_SHADOW_DENYLIST and scrubShadowedEnv not active. ' +
      'Scripts using GitHub auth may see PERSONAL_ACCESS_TOKEN shadow errors (W.088).\n'
  );
}

/**
 * Load .env files into process.env with denylist + refresh-key semantics.
 *
 * Precedence:
 *   1. HoloScript repo root .env (workspaceRoot or default)
 *   2. ~/.ai-ecosystem/.env (secondary; ai-ecosystem is the SSOT per provider-tokens.mjs)
 *
 * Denylist keys (GITHUB_TOKEN, GH_TOKEN, PERSONAL_ACCESS_TOKEN) are never
 * injected — they stay in .env for explicit reads but do not shadow gh/git keyring.
 * MESH_RUNTIME_REFRESH_KEYS (HOLOMESH_*) are force-overwritten from disk so stale
 * daemon-inherited values never win.
 *
 * @param {{ workspaceRoot?: string }} [options] — defaults to HoloScript repo root
 * @returns {{ loadedFrom: string | null, scrubbed: string[], usingFallback: boolean }}
 */
export function loadDotenv(options = {}) {
  const workspaceRoot = options.workspaceRoot || resolve(__dirname, '..');
  const homeDir = process.env.HOME || process.env.USERPROFILE || HOME || '';
  const paths = [resolve(workspaceRoot, '.env'), join(homeDir, '.ai-ecosystem', '.env')];

  // Scrub already-inherited denylist keys from process.env BEFORE loading.
  // Closes the shadow for already-running daemon processes (W.088/W.094/W.129).
  const scrubbed = scrubShadowedEnv();

  for (const envPath of [...new Set(paths)]) {
    try {
      if (!existsSync(envPath)) continue;
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/u)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        const { key, value } = parsed;
        // Block denylist keys from injection (prevents GITHUB_TOKEN shadow, W.088)
        if (ENV_SHADOW_DENYLIST.has(key)) continue;
        // Force-refresh mesh runtime keys so stale daemon env never wins (W.129)
        if (!process.env[key] || MESH_RUNTIME_REFRESH_KEYS.has(key)) process.env[key] = value;
      }
      return { loadedFrom: envPath, scrubbed, usingFallback: _usingFallback };
    } catch {
      /* try next path */
    }
  }
  return { loadedFrom: null, scrubbed, usingFallback: _usingFallback };
}
