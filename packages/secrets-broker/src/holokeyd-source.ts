/**
 * holokeyd source — the bridge to the OTHER vault.
 *
 * There are two HoloKey vaults in this ecosystem and until now they could not see
 * each other:
 *
 *   - This package's vault (`createHoloKeyVault`) — a ciphertext store (Postgres or
 *     file) that a locally-configured KEK decrypts. Every HoloScript service resolves
 *     through it.
 *   - `holokeyd` on the Jetson — TPM-device-bound, holding the operational secrets.
 *     Its key material never leaves the device, so there is no KEK a laptop could be
 *     handed. The device decrypts on request; callers ask over SSH.
 *
 * Because the second one cannot be modelled as a `SecretStoreBackend` (it returns
 * plaintext, not ciphertext this KEK could open) it is wired one layer up, as a
 * last-resort source on {@link createServiceSecretResolver}. Resolution order becomes
 * vault → `process.env` → holokeyd, which makes this change PURELY ADDITIVE: while a
 * secret is still in `.env` nothing observable changes, and the moment the plaintext
 * is deleted holokeyd answers instead. That ordering is deliberate — putting holokeyd
 * ahead of env would silently change which value wins for every already-configured
 * secret, and the two are not verified equal for all of them.
 *
 * OFF unless `HOLOKEYD_HOST` is set, so a cloud deploy (Railway, where no Jetson is
 * reachable) behaves exactly as before.
 *
 * Fail-safe by construction. Every failure path returns `undefined`:
 *   - unreachable host, auth failure, timeout, non-zero exit, empty output
 *   - a name that is not a plain secret name (never interpolated into a shell; the
 *     name travels on stdin and the remote command is fixed)
 * A host that fails to connect is marked unreachable for the rest of the process, so
 * a dead Jetson costs ONE timeout rather than one per secret. Without that a boot
 * hydrating twelve names behind a downed host would stall for minutes.
 *
 * Values are cached in memory per process and NEVER logged.
 *
 * @module secrets-broker/holokeyd-source
 */

import { execFile, execFileSync } from 'node:child_process';

type Env = Record<string, string | undefined>;

/** Env var naming the holokeyd host. Absent → this source is OFF. */
export const HOLOKEYD_HOST_ENV = 'HOLOKEYD_HOST';

/** A plaintext-returning secret source consulted after the vault and `process.env`. */
export interface RemoteSecretSource {
  /** Stable id for affirmation logging. Carries no secret material. */
  readonly id: string;
  /** Plaintext value for `name`, or `undefined` for any failure. Never throws. */
  resolve(name: string): Promise<string | undefined>;
  /** False once the host has proven unreachable in this process. */
  reachable(): boolean;
}

// Same shape holokeyctl accepts. Anything else is rejected before we spawn.
const SECRET_NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;
// A bare hostname / user@host / IP. Keeps a hostile env var out of the argv.
const HOST_RE = /^(?:[A-Za-z0-9_.-]+@)?[A-Za-z0-9_.:-]+$/u;

export interface CreateHoloKeydSourceOpts {
  /** Environment to read `HOLOKEYD_*` config from. Defaults to `process.env`. */
  env?: Env;
  /** Override the spawn, for tests. Resolves to stdout. */
  run?: (args: readonly string[], input: string, timeoutMs: number) => Promise<string>;
}

function defaultRun(args: readonly string[], input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'ssh',
      args as string[],
      { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
    // stdin carries the secret NAME only. Closing it is what makes `resolve-stdin`
    // return rather than block forever.
    child.stdin?.end(input);
  });
}

/**
 * Build the holokeyd source, or `null` when `HOLOKEYD_HOST` is unset or malformed
 * (the flag-gate that keeps this OFF everywhere it does not apply).
 */
export function createHoloKeydSource(
  opts: CreateHoloKeydSourceOpts = {}
): RemoteSecretSource | null {
  const env = opts.env ?? process.env;
  const host = env[HOLOKEYD_HOST_ENV]?.trim();
  if (!host || !HOST_RE.test(host)) return null;

  const client = env.HOLOKEYD_CLIENT?.trim() || '/usr/local/bin/holokeyctl';
  const identity = env.HOLOKEYD_SSH_KEY?.trim();
  const connectTimeoutS = Number(env.HOLOKEYD_CONNECT_TIMEOUT_S ?? 5);
  const callTimeoutMs = Number(env.HOLOKEYD_TIMEOUT_MS ?? 20000);
  const run = opts.run ?? defaultRun;

  const cache = new Map<string, string>();
  let unreachable = false;

  const args = [
    '-o', 'BatchMode=yes',
    '-o', `ConnectTimeout=${Number.isFinite(connectTimeoutS) ? connectTimeoutS : 5}`,
    ...(identity ? ['-i', identity] : []),
    host,
    client,
    'resolve-stdin',
  ];

  return {
    id: `holokeyd://${host}`,
    reachable: () => !unreachable,
    async resolve(name: string): Promise<string | undefined> {
      if (unreachable) return undefined;
      if (!SECRET_NAME_RE.test(name)) return undefined;
      const hit = cache.get(name);
      if (hit !== undefined) return hit;
      try {
        const out = await run(args, `${name}\n`, Number.isFinite(callTimeoutMs) ? callTimeoutMs : 20000);
        const value = (out || '').trim();
        if (!value) return undefined; // reachable, simply does not hold this name
        cache.set(name, value);
        return value;
      } catch (e) {
        // Distinguish "host is down" from "this one name failed". Only the former
        // should disable the source; a per-name failure must not hide the rest.
        const code = (e as { code?: unknown })?.code;
        const killed = (e as { killed?: boolean })?.killed;
        if (killed || code === 'ENOENT' || code === 'ETIMEDOUT' || code === 255) {
          unreachable = true;
        }
        return undefined;
      }
    },
  };
}

/**
 * SYNCHRONOUS boot hydration. Needed because the consumers this exists for read
 * `process.env` in module-level constants (`const KEY = process.env.KEY || ''`),
 * which are evaluated at import time — an async fill would land after they have
 * already read `undefined`. So this blocks, deliberately, at boot only.
 *
 * Costs NOTHING until it is actually needed: names already present are skipped
 * without contacting the device, so while the plaintext still exists this makes
 * zero SSH calls and adds zero boot latency. The first call after a plaintext
 * deletion is what pays for the round trip.
 *
 * Returns names only, never values. Never throws.
 */
export function hydrateFromHoloKeydSync(
  names: readonly string[],
  opts: { env?: Env; target?: Env; runSync?: (args: readonly string[], input: string, timeoutMs: number) => string } = {}
): { enabled: boolean; hydrated: string[]; missing: string[] } {
  const env = opts.env ?? (process.env as Env);
  const target = opts.target ?? (process.env as Env);

  // Skip the flag-gate work entirely when nothing is missing — the common case.
  const wanted = names.filter((n) => !target[n]);
  if (wanted.length === 0) return { enabled: true, hydrated: [], missing: [] };

  const host = env[HOLOKEYD_HOST_ENV]?.trim();
  if (!host || !HOST_RE.test(host)) return { enabled: false, hydrated: [], missing: [...wanted] };

  const client = env.HOLOKEYD_CLIENT?.trim() || '/usr/local/bin/holokeyctl';
  const identity = env.HOLOKEYD_SSH_KEY?.trim();
  const connectTimeoutS = Number(env.HOLOKEYD_CONNECT_TIMEOUT_S ?? 5);
  const timeoutMs = Number(env.HOLOKEYD_TIMEOUT_MS ?? 20000);
  const args = [
    '-o', 'BatchMode=yes',
    '-o', `ConnectTimeout=${Number.isFinite(connectTimeoutS) ? connectTimeoutS : 5}`,
    ...(identity ? ['-i', identity] : []),
    host,
    client,
    'resolve-stdin',
  ];
  const runSync =
    opts.runSync ??
    ((a: readonly string[], input: string, t: number) =>
      execFileSync('ssh', a as string[], {
        input,
        encoding: 'utf8',
        timeout: t,
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: 1024 * 1024,
      }));

  const hydrated: string[] = [];
  const missing: string[] = [];
  for (const name of wanted) {
    if (!SECRET_NAME_RE.test(name)) {
      missing.push(name);
      continue;
    }
    try {
      const value = (runSync(args, `${name}\n`, Number.isFinite(timeoutMs) ? timeoutMs : 20000) || '').trim();
      if (value) {
        target[name] = value;
        hydrated.push(name);
      } else {
        missing.push(name);
      }
    } catch (e) {
      missing.push(name);
      // A down host must cost ONE timeout at boot, not one per name.
      const code = (e as { code?: unknown })?.code;
      if (code === 'ENOENT' || code === 'ETIMEDOUT' || code === 255) {
        for (const rest of wanted.slice(wanted.indexOf(name) + 1)) missing.push(rest);
        break;
      }
    }
  }
  return { enabled: true, hydrated, missing };
}

/**
 * Copy named secrets from holokeyd into `target` (default `process.env`) for consumers
 * that read `process.env` directly and cannot be made async — notably
 * `@holoscript/llm-provider`, which is browser-safe and must never import child_process.
 *
 * Only fills names that are MISSING or empty; an existing value always wins, so this
 * cannot change the behavior of an already-configured process. Returns the names it
 * filled, never a value. Never throws.
 */
export async function hydrateFromHoloKeyd(
  names: readonly string[],
  opts: CreateHoloKeydSourceOpts & { target?: Env } = {}
): Promise<{ enabled: boolean; hydrated: string[]; missing: string[] }> {
  const target = opts.target ?? (process.env as Env);
  const source = createHoloKeydSource(opts);
  if (!source) return { enabled: false, hydrated: [], missing: [...names] };

  const hydrated: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    if (target[name]) continue; // already set — never override
    try {
      const value = await source.resolve(name);
      if (value) {
        target[name] = value;
        hydrated.push(name);
      } else {
        missing.push(name);
      }
    } catch {
      missing.push(name);
    }
  }
  return { enabled: true, hydrated, missing };
}
