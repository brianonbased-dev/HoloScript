export const MEMORY_NPM_PACKAGE_NAME = '@holoscript/memory';

export const SOVEREIGN_MEMORY_ENV_KEYS = [
  'MEMORY_PGHOST',
  'MEMORY_PGPORT',
  'MEMORY_PGDATABASE',
  'MEMORY_PGUSER',
  'MEMORY_PGPASSWORD',
  'MEMORY_WORKSPACE',
  'HOLO_MEMORY_SOT_HOST',
  'HOLO_MEMORY_SOT_PORT',
  'HOLO_MEMORY_SOT_DB',
  'HOLO_MEMORY_SOT_USER',
  'HOLO_MEMORY_WORKSPACE',
  'MEMORY_SVC_PASSWORD',
];

function stringOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function positiveIntOrDefault(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = stringOrNull(env[key]);
    if (value) return { key, value };
  }
  return { key: keys[0], value: null };
}

export function buildSovereignMemoryPackageConfig({
  env = process.env,
  packageName = MEMORY_NPM_PACKAGE_NAME,
} = {}) {
  const hostEnv = firstEnvValue(env, ['MEMORY_PGHOST', 'HOLO_MEMORY_SOT_HOST']);
  const portEnv = firstEnvValue(env, ['MEMORY_PGPORT', 'HOLO_MEMORY_SOT_PORT']);
  const databaseEnv = firstEnvValue(env, ['MEMORY_PGDATABASE', 'HOLO_MEMORY_SOT_DB']);
  const userEnv = firstEnvValue(env, ['MEMORY_PGUSER', 'HOLO_MEMORY_SOT_USER']);
  const workspaceEnv = firstEnvValue(env, ['MEMORY_WORKSPACE', 'HOLO_MEMORY_WORKSPACE']);
  const passwordEnv = firstEnvValue(env, ['MEMORY_PGPASSWORD', 'MEMORY_SVC_PASSWORD']);
  const host = hostEnv.value;
  const passwordPresent = Boolean(passwordEnv.value);
  const directSotRequested = Boolean(host);
  const directSotConfigured = directSotRequested && passwordPresent;

  return {
    packageName,
    expectedExport: 'SovereignMemoryStore',
    directSot: {
      requested: directSotRequested,
      configured: directSotConfigured,
      host,
      port: positiveIntOrDefault(portEnv.value, 5432),
      database: databaseEnv.value || 'knowledge',
      user: userEnv.value || 'memory_svc',
      workspaceId: workspaceEnv.value || 'default',
      envKeys: {
        host: hostEnv.key,
        port: portEnv.key,
        database: databaseEnv.key,
        user: userEnv.key,
        workspace: workspaceEnv.key,
        password: passwordEnv.key,
      },
      passwordKey: passwordEnv.key,
      passwordPresent,
      rule: 'Pass an operator-owned Postgres host and scoped credential through env/vault injection; never emit the password value.',
    },
    fallback: {
      mode: directSotConfigured ? 'sot-direct' : 'mcp-orchestrator-fallback',
      available: !directSotRequested,
      rule: 'When direct Postgres is not configured, consumers should fall back to their MCP/orchestrator memory path.',
    },
    ready: directSotConfigured || !directSotRequested,
    warnings:
      directSotRequested && !passwordPresent
        ? [
            {
              kind: 'memory-sot-credential-missing',
              message:
                'A memory Postgres host is set but no memory password env is present; direct @holoscript/memory use will fall back or fail.',
            },
          ]
        : [],
  };
}

export function sovereignMemoryStoreConfigFromEnv({
  env = process.env,
  configOverrides = {},
} = {}) {
  const status = buildSovereignMemoryPackageConfig({ env });
  if (!status.directSot.configured) {
    throw new Error(
      'Direct sovereign memory is not configured; set HOLO_MEMORY_SOT_HOST and inject MEMORY_SVC_PASSWORD.'
    );
  }

  return {
    host: status.directSot.host,
    port: status.directSot.port,
    database: status.directSot.database,
    user: status.directSot.user,
    password: firstEnvValue(env, ['MEMORY_PGPASSWORD', 'MEMORY_SVC_PASSWORD']).value,
    workspaceId: status.directSot.workspaceId,
    connectionTimeoutMillis: positiveIntOrDefault(env.HOLO_MEMORY_CONNECT_TIMEOUT_MS, 3000),
    ...configOverrides,
  };
}

export async function loadMemoryPackage({
  packageName = MEMORY_NPM_PACKAGE_NAME,
  importer = (specifier) => import(specifier),
} = {}) {
  try {
    const module = await importer(packageName);
    return {
      ok: Boolean(module?.SovereignMemoryStore),
      packageName,
      module,
      error: module?.SovereignMemoryStore ? null : 'missing SovereignMemoryStore export',
      exports: Object.keys(module || {}).sort(),
    };
  } catch (error) {
    return {
      ok: false,
      packageName,
      module: null,
      error: error.message,
      exports: [],
    };
  }
}

export async function buildSovereignMemoryPackageRuntimeStatus({
  env = process.env,
  packageName = MEMORY_NPM_PACKAGE_NAME,
  importer,
} = {}) {
  const config = buildSovereignMemoryPackageConfig({ env, packageName });
  const loaded = await loadMemoryPackage({ packageName, importer });
  return {
    packageName,
    available: loaded.ok,
    error: loaded.error,
    exports: loaded.exports,
    config,
    ready: loaded.ok && config.ready,
  };
}

export function createSovereignMemoryStore({
  memoryModule,
  env = process.env,
  configOverrides = {},
} = {}) {
  if (!memoryModule?.SovereignMemoryStore) {
    throw new Error('memoryModule must provide SovereignMemoryStore');
  }
  return new memoryModule.SovereignMemoryStore(
    sovereignMemoryStoreConfigFromEnv({ env, configOverrides })
  );
}
