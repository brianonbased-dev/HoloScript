/**
 * Studio service-secret resolver (server-only).
 *
 * Operational Studio routes use this instead of reading OPENAI/ANTHROPIC keys
 * directly from process.env. It resolves through HoloKey for this service
 * identity, then falls back to env during migration.
 */

import {
  createServiceSecretResolver,
  SECRET_STORE_DDL,
  type HoloKeyVault,
  type ServiceSecretResolver,
} from '@holoscript/secrets-broker';
import { getPool } from '@/db/client';

type Env = Record<string, string | undefined>;
type QueryRows = Array<Record<string, unknown>>;
type QueryFn = (sql: string, params: readonly unknown[]) => Promise<{ rows: QueryRows }>;

interface StudioServiceSecretRuntime {
  resolver: ServiceSecretResolver;
  ddlReady: Promise<void> | null;
}

export function createStudioServiceSecretResolver(
  deps: {
    env?: Env;
    query?: QueryFn;
    vault?: HoloKeyVault | null;
    log?: (msg: string) => void;
  } = {}
): ServiceSecretResolver {
  return createServiceSecretResolver({
    env: deps.env ?? process.env,
    query: deps.query,
    vault: deps.vault,
    log: deps.log,
  });
}

let runtime: StudioServiceSecretRuntime | null = null;

function buildRuntime(): StudioServiceSecretRuntime {
  let query: QueryFn | undefined;
  let ddlReady: Promise<void> | null = null;

  try {
    const pool = getPool();
    if (pool) {
      ddlReady = pool
        .query(SECRET_STORE_DDL)
        .then(() => undefined)
        .catch((err: unknown) => {
          console.warn(
            `[studio-holokey] SECRET_STORE_DDL apply failed (service secrets fall back to env): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        });

      query = (sql, params) =>
        pool.query(sql, params as unknown[]).then((res) => ({
          rows: res.rows as QueryRows,
        }));
    }
  } catch (err) {
    console.warn(
      `[studio-holokey] pg pool init failed (service secrets fall back to env): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return {
    resolver: createStudioServiceSecretResolver({ env: process.env, query }),
    ddlReady,
  };
}

function getRuntime(): StudioServiceSecretRuntime {
  runtime ??= buildRuntime();
  return runtime;
}

export async function resolveStudioServiceSecret(nameOrRef: string): Promise<string | undefined> {
  const current = getRuntime();
  if (current.ddlReady) await current.ddlReady;
  return current.resolver.resolve(nameOrRef);
}

export function __resetStudioServiceSecretsForTests(): void {
  runtime = null;
}
