/**
 * Vault-first / env-fallback secret resolution for the agent runner — sovereign HoloKey vault
 * consumer side (I.022, phase 2).
 *
 * The agent reads its operational secrets (mesh bearer, founder API key) from env today. On a
 * sovereign node those secrets also live encrypted in the local HoloKey vault. This module lets
 * the agent prefer the vault while staying ABSOLUTELY safe: it shells out to the already-deployed
 * vault operator (`scripts/jetson/holokey-vault.cjs`, named by `HOLOKEY_VAULT_BIN`) and, on ANY
 * miss / error / timeout, returns the env value unchanged.
 *
 * Why shell-out, not in-process: it keeps the published cross-platform agent free of a Postgres
 * dependency and treats the vault as a SERVICE (the operator) rather than coupling the agent to a
 * specific DB. On any surface without `HOLOKEY_VAULT_BIN` set, this is a no-op — exact prior
 * behavior, zero new code paths exercised. (The Railway services use the in-process resolver
 * `mcp-server/holokey-resolver.ts` instead; same vault-first/env-fallback contract.)
 *
 * Fail-safe by construction: `withVaultSecrets` returns the SAME env object when the vault is off,
 * never throws, and overlays a vault value only when one is actually returned. A broken/missing
 * vault degrades to today's env behavior — it can never make the agent worse off.
 *
 * Secret hygiene: a resolved value is overlaid onto an env copy and handed to `loadIdentity`; it is
 * never logged here (identity logging already redacts the bearer — see identityForLog).
 *
 * @module holoscript-agent/vault-secrets
 */
import { spawnSync } from 'node:child_process';

/** A secret the agent can source from the vault, with the owner scope it was stored under. */
export interface VaultSecretSpec {
  name: string;
  owner: string;
}

export interface VaultResolveDeps {
  /**
   * Injectable fetcher (tests). Returns the resolved value, or `undefined` for a miss.
   * Default shells out to `HOLOKEY_VAULT_BIN` via `spawnSync`.
   */
  fetch?: (bin: string, spec: VaultSecretSpec, env: NodeJS.ProcessEnv) => string | undefined;
}

/** Default fetcher: `node <bin> resolve <NAME>` with HOLOKEY_OWNER scoping. Value → stdout. */
function defaultFetch(
  bin: string,
  spec: VaultSecretSpec,
  env: NodeJS.ProcessEnv
): string | undefined {
  const r = spawnSync(process.execPath, [bin, 'resolve', spec.name], {
    env: { ...env, HOLOKEY_OWNER: spec.owner },
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1 << 20,
  });
  if (r.status === 0 && typeof r.stdout === 'string' && r.stdout.length > 0) {
    return r.stdout; // operator writes the raw value (no trailing newline) to stdout
  }
  return undefined;
}

/**
 * Resolve one secret vault-first, env-fallback. Vault-OFF (no `HOLOKEY_VAULT_BIN`) returns
 * `env[spec.name]` directly. Never throws — any failure falls back to env.
 */
export function resolveVaultSecret(
  spec: VaultSecretSpec,
  env: NodeJS.ProcessEnv = process.env,
  deps: VaultResolveDeps = {}
): string | undefined {
  const bin = env.HOLOKEY_VAULT_BIN;
  const fallback = env[spec.name];
  if (!bin) return fallback;
  try {
    const v = (deps.fetch ?? defaultFetch)(bin, spec, env);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * The agent's vault-sourced secrets and their owner scopes. The per-seat bearer is owned by the
 * agent's HANDLE (matching how it was migrated in); the shared founder API key is owned by
 * `infra` (overridable via `HOLOKEY_INFRA_OWNER`).
 */
export function agentSecretSpecs(env: NodeJS.ProcessEnv): VaultSecretSpec[] {
  const specs: VaultSecretSpec[] = [];
  const handle = env.HOLOSCRIPT_AGENT_HANDLE;
  if (handle) specs.push({ name: 'HOLOSCRIPT_AGENT_X402_BEARER', owner: handle });
  specs.push({ name: 'HOLOMESH_API_KEY', owner: env.HOLOKEY_INFRA_OWNER ?? 'infra' });
  return specs;
}

/**
 * Return an env object with the agent's known secrets overlaid from the vault (vault-first,
 * env-fallback). When the vault is off, returns the SAME env reference unchanged. Never throws.
 */
export function withVaultSecrets(
  env: NodeJS.ProcessEnv = process.env,
  deps: VaultResolveDeps = {}
): NodeJS.ProcessEnv {
  if (!env.HOLOKEY_VAULT_BIN) return env;
  const out: NodeJS.ProcessEnv = { ...env };
  for (const spec of agentSecretSpecs(env)) {
    const v = resolveVaultSecret(spec, env, deps);
    if (v) out[spec.name] = v;
  }
  return out;
}
