/**
 * provider-tokens — thin dynamic re-export from the canonical resolver in
 * ~/.ai-ecosystem/scripts/lib/provider-tokens.mjs.
 *
 * DO NOT duplicate logic here. The canonical module is the single source of
 * truth for external-provider credential resolution (npm / GitHub / Railway /
 * Vast), precedence semantics, conflict-detection, shadow-tagging, .env
 * divergence detection, and the GOLD registry.
 *
 * Why dynamic import and not static `export * from`:
 *   ai-ecosystem lives at C:\Users\<user>\.ai-ecosystem (home directory), not
 *   as a sibling under Documents\GitHub\. There is no fixed-length relative
 *   path from HoloScript\scripts\lib\ to the home directory, so a static
 *   re-export is not possible. Dynamic import with pathToFileURL resolves
 *   correctly on Windows (ERR_UNSUPPORTED_ESM_URL_SCHEME prevention).
 *
 * The fork-drift guard (ai-ecosystem/scripts/__tests__/provider-tokens.test.mjs:
 * "no-duplicate-credential-resolver") runs `git grep "ENV_SHADOW_DENYLIST = new Set"`
 * in the ai-ecosystem repo and asserts exactly one hit. It does NOT cover
 * HoloScript — which is precisely why this file is a wrapper and not a copy.
 */
import { join } from 'path';
import { pathToFileURL } from 'url';
import { homedir } from 'os';

const canonicalPath = join(homedir(), '.ai-ecosystem', 'scripts', 'lib', 'provider-tokens.mjs');

let mod;
try {
  mod = await import(pathToFileURL(canonicalPath).href);
} catch (e) {
  throw new Error(
    `[provider-tokens] Cannot load canonical resolver from ${canonicalPath}. ` +
    `Ensure ~/.ai-ecosystem is checked out. Original error: ${e.message}`
  );
}

// Re-export all named exports from the canonical module.
export const {
  GOLD_REGISTRY,
  REGISTRY_SOURCE,
  PROVIDER_KEYS,
  PROCESS_ENV_WINS,
  envFilePaths,
  diskEnv,
  resolveToken,
  providerCredential,
  classifyKey,
  detectEnvDivergence,
} = mod;
