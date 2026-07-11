export const AGENT_RUNTIME_PROFILES_SCHEMA = 'holoscript.agent-runtime.profiles.v1';
export const AGENT_RUNTIME_PROFILE_SCHEMA = 'holoscript.agent-runtime.profile.v1';
export const HOLOSCRIPT_AGENT_PACKAGE_NAME = '@holoscript/holoscript-agent';

export const HOLOSCRIPT_AGENT_ENV_KEYS = [
  'HOLOSCRIPT_AGENT_HANDLE',
  'HOLOSCRIPT_AGENT_BRAIN',
  'HOLOSCRIPT_AGENT_BRAIN_PATH',
  'HOLOSCRIPT_AGENT_PROVIDER',
  'HOLOSCRIPT_AGENT_MODEL',
  'HOLOSCRIPT_AGENT_NODE_PROFILE',
  'HOLOSCRIPT_AGENT_NODE_KIND',
  'HOLOSCRIPT_AGENT_MCP_URL',
  'HOLOSCRIPT_MCP_URL',
  'HOLOSCRIPT_AGENT_READ_ROOTS',
  'HOLOSCRIPT_AGENT_WRITE_ROOTS',
  'HOLOSCRIPT_AGENT_MEMORY_FLOOR_MB',
  'HOLOSCRIPT_AGENT_SUPERVISOR_CONFIG',
  'HOLOSCRIPT_AGENT_WALLET_ENV_KEY',
  'HOLOSCRIPT_AGENT_BEARER_ENV_KEY',
];

function stringOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = stringOrNull(env[key]);
    if (value) return { key, value };
  }
  return { key: keys[0], value: null };
}

function splitList(value) {
  return String(value || '')
    .split(/[,\n;]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function supervisorConfigSummary(configStatus) {
  if (!configStatus) {
    return {
      path: null,
      exists: false,
      parseOk: false,
      agentCount: 0,
      enabledCount: 0,
      handles: [],
      error: null,
    };
  }
  const agents = Array.isArray(configStatus.json?.agents) ? configStatus.json.agents : [];
  return {
    path: configStatus.path,
    exists: configStatus.exists,
    parseOk: configStatus.parseOk,
    agentCount: agents.length,
    enabledCount: agents.filter((agent) => agent?.enabled !== false).length,
    handles: agents
      .map((agent) => String(agent?.handle || ''))
      .filter(Boolean)
      .sort(),
    error: configStatus.error,
  };
}

export function buildClaudeRuntimeProfile({ ready, hookIds = [] } = {}) {
  return {
    schema: AGENT_RUNTIME_PROFILE_SCHEMA,
    family: 'anthropic',
    surface: 'claude',
    runtimePackage: null,
    ready: ready === true,
    hookIds,
    boundary: 'Claude-specific hooks are adapters over the shared memory/store/context contract.',
  };
}

export function buildCodexRuntimeProfile({ ready, hookIds = [] } = {}) {
  return {
    schema: AGENT_RUNTIME_PROFILE_SCHEMA,
    family: 'openai',
    surface: 'codex',
    runtimePackage: null,
    ready: ready === true,
    hookIds,
    boundary: 'Codex startup is an adapter over the shared memory/store/context contract.',
  };
}

export function buildHoloScriptAgentRuntimeProfile({
  env = process.env,
  configPath = null,
  readJsonStatusImpl,
  memoryConfig = null,
  packageName = HOLOSCRIPT_AGENT_PACKAGE_NAME,
} = {}) {
  const handle = firstEnvValue(env, ['HOLOSCRIPT_AGENT_HANDLE']);
  const brain = firstEnvValue(env, ['HOLOSCRIPT_AGENT_BRAIN', 'HOLOSCRIPT_AGENT_BRAIN_PATH']);
  const provider = firstEnvValue(env, ['HOLOSCRIPT_AGENT_PROVIDER']);
  const model = firstEnvValue(env, ['HOLOSCRIPT_AGENT_MODEL']);
  const nodeProfile = firstEnvValue(env, [
    'HOLOSCRIPT_AGENT_NODE_PROFILE',
    'HOLOSCRIPT_AGENT_NODE_KIND',
  ]);
  const mcpUrl = firstEnvValue(env, ['HOLOSCRIPT_AGENT_MCP_URL', 'HOLOSCRIPT_MCP_URL']);
  const supervisorPath =
    stringOrNull(configPath) || stringOrNull(env.HOLOSCRIPT_AGENT_SUPERVISOR_CONFIG);
  const configStatus =
    supervisorPath && readJsonStatusImpl
      ? { path: supervisorPath, ...readJsonStatusImpl(supervisorPath) }
      : null;
  const supervisor = supervisorConfigSummary(configStatus);
  const envRequested = Boolean(
    handle.value ||
    brain.value ||
    provider.value ||
    model.value ||
    nodeProfile.value ||
    mcpUrl.value ||
    env.HOLOSCRIPT_AGENT_READ_ROOTS ||
    env.HOLOSCRIPT_AGENT_WRITE_ROOTS ||
    supervisorPath
  );
  const supervisorConfigured = supervisor.exists && supervisor.parseOk && supervisor.agentCount > 0;
  const singleAgentConfigured = Boolean(handle.value && brain.value);
  const configured = supervisorConfigured || singleAgentConfigured;
  const profileText = `${nodeProfile.value || ''} ${mcpUrl.value || ''}`.toLowerCase();
  const jetsonReferenceProfile = /jetson/u.test(profileText);

  return {
    schema: AGENT_RUNTIME_PROFILE_SCHEMA,
    family: 'holoscript',
    surface: 'edge-agent',
    runtimePackage: packageName,
    requested: envRequested,
    configured,
    ready: !envRequested || configured,
    envKeys: {
      handle: handle.key,
      brain: brain.key,
      provider: provider.key,
      model: model.key,
      nodeProfile: nodeProfile.key,
      mcpUrl: mcpUrl.key,
      supervisorConfig: 'HOLOSCRIPT_AGENT_SUPERVISOR_CONFIG',
      readRoots: 'HOLOSCRIPT_AGENT_READ_ROOTS',
      writeRoots: 'HOLOSCRIPT_AGENT_WRITE_ROOTS',
      walletEnvKey: 'HOLOSCRIPT_AGENT_WALLET_ENV_KEY',
      bearerEnvKey: 'HOLOSCRIPT_AGENT_BEARER_ENV_KEY',
    },
    identity: {
      handle: handle.value,
      provider: provider.value,
      model: model.value,
      walletEnvKey: stringOrNull(env.HOLOSCRIPT_AGENT_WALLET_ENV_KEY),
      bearerEnvKey: stringOrNull(env.HOLOSCRIPT_AGENT_BEARER_ENV_KEY),
    },
    brain: {
      path: brain.value,
      suppliedBy: brain.value ? brain.key : null,
    },
    node: {
      profile: nodeProfile.value || 'operator-supplied',
      mcpUrl: mcpUrl.value,
      readRoots: splitList(env.HOLOSCRIPT_AGENT_READ_ROOTS),
      writeRoots: splitList(env.HOLOSCRIPT_AGENT_WRITE_ROOTS),
      memoryFloorMb: stringOrNull(env.HOLOSCRIPT_AGENT_MEMORY_FLOOR_MB),
      jetsonReferenceProfile,
      rule: 'Jetson is an explicit owned-metal profile/example; it is never the public package default.',
    },
    supervisor,
    memory: memoryConfig
      ? {
          packageName: memoryConfig.packageName,
          workspaceId: memoryConfig.directSot?.workspaceId || null,
          directSotConfigured: memoryConfig.directSot?.configured === true,
          fallbackMode: memoryConfig.fallback?.mode || null,
        }
      : null,
    boundary:
      'HoloScript agents consume the same memory/runtime contract through caller-supplied brain, identity, storage, MCP, and secret adapters.',
    warnings:
      envRequested && !configured
        ? [
            {
              kind: 'holoscript-agent-profile-incomplete',
              message:
                'HoloScript agent env/config was detected, but no complete single-agent handle+brain pair or supervisor agents config was supplied.',
            },
          ]
        : [],
  };
}

export function buildAgentRuntimeProfiles({
  claude,
  codex,
  sharedHookIds = [],
  holoscriptAgent,
} = {}) {
  return {
    schema: AGENT_RUNTIME_PROFILES_SCHEMA,
    rule: 'Agent family lineage is profile metadata; memory, storage, MCP, identity, and secrets are caller-supplied adapters.',
    claude: buildClaudeRuntimeProfile({ ready: claude?.ready, hookIds: sharedHookIds }),
    codex: buildCodexRuntimeProfile({ ready: codex?.ready, hookIds: sharedHookIds }),
    holoscript: holoscriptAgent,
  };
}
