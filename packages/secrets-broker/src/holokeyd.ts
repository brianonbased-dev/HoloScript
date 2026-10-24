/**
 * `@holoscript/secrets-broker/holokeyd` � opt-in subpath for the holokeyd client
 * (unix-socket + ssh transports). Deliberately NOT re-exported from the package's
 * default entry, so the default bundle carries no execFile / ssh argv from this module.
 * (The default entry still exports the pre-existing `holokeyd-source` ssh bridge from main.)
 *
 * @module secrets-broker/holokeyd
 */
import { createHoloKeydSource, type RemoteSecretSource } from './holokeyd-source';
import {
  createHolokeydClient,
  createHolokeydClientSource,
  HOLOKEYD_SOCKET_ENV,
} from './holokeyd-client';

export * from './holokeyd-client';

/**
 * Build a `RemoteSecretSource` from env for `createServiceSecretResolver({ remoteSource })`:
 * HOLOKEYD_SOCKET set -> the on-device unix-socket client; otherwise the existing
 * `holokeyd-source` ssh bridge. Both are OFF unless configured; never throws.
 */
export function createHolokeydRemoteSourceFromEnv(
  env: Record<string, string | undefined> = process.env
): RemoteSecretSource | null {
  try {
    const client = env[HOLOKEYD_SOCKET_ENV]?.trim() ? createHolokeydClient({ env }) : null;
    return client ? createHolokeydClientSource(client) : createHoloKeydSource({ env });
  } catch {
    return null;
  }
}
