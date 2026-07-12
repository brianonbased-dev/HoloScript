import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SOVEREIGN_MEMORY_ENV_KEYS, buildSovereignMemoryPackageConfig } from './memory-package.mjs';
import {
  HOLOSCRIPT_AGENT_ENV_KEYS,
  buildAgentRuntimeProfiles,
  buildHoloScriptAgentRuntimeProfile,
} from './agent-profiles.mjs';

export * from './memory-package.mjs';
export * from './agent-profiles.mjs';
export * from './sovereign-seed.mjs';
export * from './second-brain-runtime.mjs';
export * from './provider-planner.mjs';

export const AGENT_RUNTIME_CONTRACT_SCHEMA = 'holoscript.agent-runtime.contract.v1';
export const AI_FIRST_RUNTIME_STATUS_SCHEMA = 'holoscript.agent-runtime.ai-first-status.v1';

export const AI_FIRST_RUNTIME_LOOP = [
  'intent',
  'plan',
  'act',
  'verify',
  'remember',
  'coordinate',
  'recover',
  'improve',
  'farm-next-work',
];

export const SHARED_MEMORY_STORE_HOOKS = [
  { id: 'surface-pin', needle: 'sessionstart/surface-pin.mjs' },
  { id: 'memory-ceiling-check', needle: 'sessionstart/memory-ceiling-check.mjs' },
  { id: 'knowledge-sync', needle: 'stop/knowledge-sync.mjs' },
  { id: 'wpg-extract', needle: 'stop/wpg-extract.mjs' },
];

export const SHARED_AGENT_HOOKS = SHARED_MEMORY_STORE_HOOKS;

export const SHARED_CONTEXT_HOOKS = [
  { id: 'mode-injector-fast', needle: 'userpromptsubmit/mode-injector-fast.mjs' },
  { id: 'gold-context-inject', needle: 'posttooluse/gold-context-inject.mjs' },
];

export const CLAUDE_RUNTIME_HOOKS = [...SHARED_MEMORY_STORE_HOOKS, ...SHARED_CONTEXT_HOOKS];

export const CLAUDE_AGENT_HOOKS = CLAUDE_RUNTIME_HOOKS;

export const CODEX_RUNTIME_HOOKS = [
  ...CLAUDE_RUNTIME_HOOKS,
  { id: 'codex-session-start', needle: 'scripts/codex-session-start.mjs' },
];

export const CODEX_AGENT_HOOKS = CODEX_RUNTIME_HOOKS;

export function normalizeCommandText(value) {
  return String(value || '')
    .replace(/\\/gu, '/')
    .toLowerCase();
}

export function readJsonStatus(filePath, { exists = existsSync, readFile = readFileSync } = {}) {
  if (!exists(filePath)) {
    return {
      exists: false,
      parseOk: false,
      json: null,
      error: 'missing',
    };
  }
  try {
    const text = readFile(filePath, 'utf8').replace(/^\uFEFF/u, '');
    return {
      exists: true,
      parseOk: true,
      json: JSON.parse(text),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      parseOk: false,
      json: null,
      error: error.message,
    };
  }
}

export function flattenHookCommands(settingsJson) {
  const hooks =
    settingsJson?.hooks && typeof settingsJson.hooks === 'object' ? settingsJson.hooks : {};
  const commands = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) continue;
      for (const hook of group.hooks) {
        if (!hook?.command) continue;
        commands.push({
          event,
          command: String(hook.command),
          async: hook.async === true,
          timeout: Number.isFinite(Number(hook.timeout)) ? Number(hook.timeout) : null,
        });
      }
    }
  }
  return commands;
}

export function hookConfigStatus({
  label,
  filePath,
  requiredHooks,
  readJsonStatusImpl = readJsonStatus,
  asyncSupported = true,
}) {
  const status = readJsonStatusImpl(filePath);
  const commands = status.parseOk ? flattenHookCommands(status.json) : [];
  const normalizedCommands = commands.map((item) => normalizeCommandText(item.command));
  const required = requiredHooks.map((hook) => ({
    id: hook.id,
    present: normalizedCommands.some((command) =>
      command.includes(normalizeCommandText(hook.needle))
    ),
  }));
  const missingRequired = required.filter((hook) => !hook.present).map((hook) => hook.id);
  const unsupportedAsyncHooks = asyncSupported
    ? []
    : commands
        .filter((hook) => hook.async)
        .map((hook) => ({
          event: hook.event,
          command: hook.command,
        }));
  return {
    label,
    path: filePath,
    exists: status.exists,
    parseOk: status.parseOk,
    error: status.error,
    ready:
      status.exists &&
      status.parseOk &&
      missingRequired.length === 0 &&
      unsupportedAsyncHooks.length === 0,
    hookEvents: [...new Set(commands.map((item) => item.event))].sort(),
    hookCommandCount: commands.length,
    required,
    missingRequired,
    asyncSupported,
    unsupportedAsyncHooks,
  };
}

export function readAllowedEnvFileValues(
  envPath,
  allowedKeys,
  { exists = existsSync, readFile = readFileSync } = {}
) {
  const values = {};
  if (!exists(envPath)) return values;
  const allowed = new Set(allowedKeys);
  try {
    for (const line of readFile(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      if (!allowed.has(key)) continue;
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) values[key] = value;
    }
  } catch {
    // Advisory runtime checks should not fail only because .env is unreadable.
  }
  return values;
}

function missingIncludes(missingRequired, hooks) {
  return missingRequired.some((id) => hooks.some((hook) => hook.id === id));
}

function defaultProjectMemoryCandidates() {
  return [];
}

function defaultResolveProjectMemoryFile() {
  return null;
}

function defaultEcosystemIntegrationStatus() {
  return {
    room: { ready: false, command: null },
    knowledge: { ready: false, searchCommand: null, publishCommand: null },
    mcp: { ready: false, command: null },
    skills: {
      checkCommand: 'pnpm check:skill-roots',
      syncCommand: 'pnpm sync:skill-roots',
    },
  };
}

function defaultGoldDriveIntakeStatus(env = {}) {
  return {
    ready: false,
    root: env.GOLD_ROOT || null,
    indexPath: null,
    diamondCount: null,
    bronzeCount: null,
    silverCount: null,
  };
}

function runtimeResource(id, ready, evidence, role) {
  return {
    id,
    ready: ready === true,
    evidence,
    role,
  };
}

export function buildAiFirstRuntimeStatus({
  memoryReady = false,
  knowledgeReady = false,
  roomReady = false,
  mcpReady = false,
  injectionReady = false,
  goldReady = false,
  sovereignMemoryPackage = null,
} = {}) {
  const resourceState = {
    intent: injectionReady,
    memory: memoryReady,
    knowledge: knowledgeReady,
    tools: mcpReady,
    decisions: roomReady && knowledgeReady,
    telemetry: roomReady || mcpReady,
    receipts: roomReady,
    recovery: memoryReady && knowledgeReady,
    nextActions: roomReady && knowledgeReady,
  };
  const resources = [
    runtimeResource(
      'intent',
      resourceState.intent,
      'context injection or caller-provided intent adapter',
      'keep the live objective explicit'
    ),
    runtimeResource(
      'memory',
      resourceState.memory,
      'project memory or caller-owned memory package adapter',
      'preserve session continuity'
    ),
    runtimeResource(
      'knowledge',
      resourceState.knowledge,
      'knowledge store search/publish adapter',
      'promote durable lessons'
    ),
    runtimeResource(
      'tools',
      resourceState.tools,
      'MCP, CLI, API, or tool registry adapter',
      'act through machine contracts'
    ),
    runtimeResource(
      'decisions',
      resourceState.decisions,
      'room/knowledge decision receipt path',
      'record summarized decision provenance'
    ),
    runtimeResource(
      'telemetry',
      resourceState.telemetry,
      'room, MCP, or caller telemetry adapter',
      'surface runtime health and stale state'
    ),
    runtimeResource(
      'receipts',
      resourceState.receipts,
      'HoloMesh, HoloRepo, or caller receipt sink',
      'prove work and rollback boundaries'
    ),
    runtimeResource(
      'recovery',
      resourceState.recovery,
      'memory/knowledge recovery and handoff path',
      'resume after failures or family handoff'
    ),
    runtimeResource(
      'next-actions',
      resourceState.nextActions,
      'board/task/knowledge farming path',
      'turn outcomes into the next improvement'
    ),
  ];
  const secondBrainReady = memoryReady && knowledgeReady;
  const autonomyReady = Boolean(
    memoryReady && knowledgeReady && roomReady && mcpReady && injectionReady
  );

  return {
    schema: AI_FIRST_RUNTIME_STATUS_SCHEMA,
    ready: resources.every((resource) => resource.ready) && autonomyReady,
    principle:
      'The runtime treats intent, memory, knowledge, tools, decisions, telemetry, receipts, recovery, and next actions as first-class resources.',
    resources,
    secondBrain: {
      ready: secondBrainReady,
      memoryReady: memoryReady === true,
      knowledgeReady: knowledgeReady === true,
      authorityBoundary: {
        ready: goldReady === true,
        goldReady: goldReady === true,
        rule: 'GOLD-compatible authority may be a caller-owned adapter boundary; founder GOLD state is never a package requirement.',
      },
      sovereignMemoryPackage: sovereignMemoryPackage
        ? {
            packageName: sovereignMemoryPackage.packageName,
            directSotConfigured: sovereignMemoryPackage.directSot?.configured === true,
            fallbackMode: sovereignMemoryPackage.fallback?.mode || null,
          }
        : null,
    },
    autonomy: {
      ready: autonomyReady,
      loop: AI_FIRST_RUNTIME_LOOP,
      stopConditions: [
        'missing authority or custody boundary',
        'missing verifier for destructive or paid operation',
        'failed validation or stale telemetry',
        'operator review required by spend, wallet, public-commitment, or governance boundary',
      ],
      recovery: [
        'preserve receipt',
        'write memory or knowledge lesson',
        'surface blocker',
        'queue next safe action',
      ],
    },
    publicConsumptionRule:
      'Outside users and agents bring their own storage, secrets, memory, authority, and telemetry adapters; package output stays redacted and machine-readable.',
  };
}

export function buildAgentRuntimeContractStatus({
  repoRoot,
  env = process.env,
  skillMirrorStatus = null,
  projectMemoryEnvKeys = [],
  projectMemoryFileEnvKeys = [],
  projectMemoryFileCandidates = defaultProjectMemoryCandidates,
  resolveProjectMemoryFile = defaultResolveProjectMemoryFile,
  readEcosystemIntegrationStatus = defaultEcosystemIntegrationStatus,
  goldDriveIntakeStatus = defaultGoldDriveIntakeStatus,
  holoscriptAgentConfigPath = null,
  readHoloScriptAgentProfileStatus = buildHoloScriptAgentRuntimeProfile,
} = {}) {
  if (!repoRoot) throw new Error('repoRoot is required to build the agent runtime contract');

  const memoryEnvKeys = [...new Set([...projectMemoryFileEnvKeys, ...projectMemoryEnvKeys])];
  const memoryEnv = {
    ...readAllowedEnvFileValues(join(repoRoot, '.env'), memoryEnvKeys),
    ...env,
  };
  const goldEnv = {
    ...readAllowedEnvFileValues(join(repoRoot, '.env'), ['GOLD_ROOT']),
    ...env,
  };
  const sovereignMemoryEnv = {
    ...readAllowedEnvFileValues(join(repoRoot, '.env'), [
      ...SOVEREIGN_MEMORY_ENV_KEYS,
      ...HOLOSCRIPT_AGENT_ENV_KEYS,
    ]),
    ...env,
  };
  const sharedRequiredHooks = CLAUDE_RUNTIME_HOOKS;
  const claude = hookConfigStatus({
    label: 'claude',
    filePath: join(repoRoot, '.claude', 'settings.json'),
    requiredHooks: sharedRequiredHooks,
  });
  const codex = hookConfigStatus({
    label: 'codex',
    filePath: join(repoRoot, '.codex', 'hooks.json'),
    requiredHooks: CODEX_RUNTIME_HOOKS,
    asyncSupported: false,
  });
  const memoryPath = resolveProjectMemoryFile({ env: memoryEnv, workspaceRoot: repoRoot });
  const memoryCandidates = projectMemoryFileCandidates({ env: memoryEnv, workspaceRoot: repoRoot });
  const pinKeys = memoryEnvKeys.filter((key) => Boolean(memoryEnv[key]));
  const integration = readEcosystemIntegrationStatus({ repoRoot, env, skillMirrorStatus });
  const gold = goldDriveIntakeStatus(goldEnv);
  const sovereignMemoryPackage = buildSovereignMemoryPackageConfig({ env: sovereignMemoryEnv });
  const holoscriptAgent = readHoloScriptAgentProfileStatus({
    env: sovereignMemoryEnv,
    configPath: holoscriptAgentConfigPath,
    readJsonStatusImpl: readJsonStatus,
    memoryConfig: sovereignMemoryPackage,
  });
  const storeReady = Boolean(
    integration.room?.ready && integration.knowledge?.ready && integration.mcp?.ready
  );
  const injectionReady =
    !missingIncludes(claude.missingRequired, SHARED_CONTEXT_HOOKS) &&
    !missingIncludes(codex.missingRequired, SHARED_CONTEXT_HOOKS);

  const blockers = [];
  const warnings = [];
  if (!claude.ready) {
    blockers.push({
      kind: 'claude-config',
      message:
        'Claude settings are missing, unparsable, or do not include the shared memory/store/context hooks.',
      missingRequired: claude.missingRequired,
      error: claude.error,
    });
  }
  if (!codex.ready) {
    blockers.push({
      kind: 'codex-config',
      message:
        'Codex hooks are missing, unparsable, unsupported by Codex, or do not include the shared memory/store/context hooks plus Codex startup.',
      missingRequired: codex.missingRequired,
      unsupportedAsyncHooks: codex.unsupportedAsyncHooks,
      error: codex.error,
    });
  }
  if (!memoryPath) {
    blockers.push({
      kind: 'project-memory',
      message: 'Shared project memory could not be resolved for this seat.',
      fix: 'Set CODEX_PROJECT_MEMORY_DIR or CLAUDE_PROJECT_MEMORY_DIR to the project memory directory.',
    });
  } else if (pinKeys.length === 0) {
    warnings.push({
      kind: 'memory-env-pin',
      message:
        'Project memory resolved by Claude project heuristics; set CODEX_PROJECT_MEMORY_DIR or CLAUDE_PROJECT_MEMORY_DIR to remove cwd/slug drift.',
    });
  }
  if (!storeReady) {
    blockers.push({
      kind: 'store-credentials',
      message: 'Room, knowledge, or HoloScript MCP store credentials are not all present.',
      roomReady: integration.room?.ready === true,
      knowledgeReady: integration.knowledge?.ready === true,
      mcpReady: integration.mcp?.ready === true,
    });
  }
  if (skillMirrorStatus?.ok === false) {
    warnings.push({
      kind: 'skill-mirror-drift',
      message: 'Direct-reader skill mirror is stale; Codex may miss workflows that Claude sees.',
      fix: integration.skills?.syncCommand,
    });
  }
  if (!gold.ready) {
    warnings.push({
      kind: 'gold-intake-offline',
      message:
        'GOLD-compatible authority is not fully readable from this seat; configure the caller-owned authority root or adapter before making authority claims.',
      root: gold.root,
      indexPath: gold.indexPath,
    });
  }
  for (const warning of sovereignMemoryPackage.warnings) warnings.push(warning);
  for (const warning of holoscriptAgent.warnings || []) warnings.push(warning);

  return {
    schema: AGENT_RUNTIME_CONTRACT_SCHEMA,
    legacySchema: 'codex.agent-config-store-memory-context.v1',
    ready: blockers.length === 0,
    blockers,
    warnings,
    configs: {
      claude,
      codex,
      sharedRequiredHookIds: sharedRequiredHooks.map((hook) => hook.id),
      sharedMemoryStoreHookIds: SHARED_MEMORY_STORE_HOOKS.map((hook) => hook.id),
      sharedContextHookIds: SHARED_CONTEXT_HOOKS.map((hook) => hook.id),
      rule: 'Claude and Codex do not need identical hook lattices, but both must carry the shared memory/store/context hooks.',
    },
    runtimeProfiles: buildAgentRuntimeProfiles({
      claude,
      codex,
      sharedHookIds: sharedRequiredHooks.map((hook) => hook.id),
      holoscriptAgent,
    }),
    memory: {
      ready: Boolean(memoryPath),
      memoryPath,
      memoryDir: memoryPath ? dirname(memoryPath) : null,
      pinned: pinKeys.length > 0,
      pinKeys,
      candidateCount: memoryCandidates.length,
      firstCandidates: memoryCandidates.slice(0, 5),
      checkCommand: 'node hooks/run-hook.mjs sessionstart/memory-ceiling-check.mjs',
      sovereignPackage: sovereignMemoryPackage,
    },
    store: {
      ready: storeReady,
      room: {
        ready: integration.room?.ready === true,
        command: integration.room?.command || null,
      },
      knowledge: {
        ready: integration.knowledge?.ready === true,
        searchCommand: integration.knowledge?.searchCommand || null,
        publishCommand: integration.knowledge?.publishCommand || null,
      },
      mcp: {
        ready: integration.mcp?.ready === true,
        command: integration.mcp?.command || null,
      },
      gold: {
        ready: gold.ready === true,
        root: gold.root,
        indexPath: gold.indexPath,
      },
      commands: {
        ops: 'pnpm run holorepo:ops -- --json',
        storageVerify: 'pnpm run holorepo:storage-verify -- --check',
      },
      sovereignMemory: {
        packageName: sovereignMemoryPackage.packageName,
        directSotConfigured: sovereignMemoryPackage.directSot.configured,
        directSotRequested: sovereignMemoryPackage.directSot.requested,
        fallbackMode: sovereignMemoryPackage.fallback.mode,
      },
    },
    injection: {
      ready: injectionReady,
      sharedHookIds: SHARED_CONTEXT_HOOKS.map((hook) => hook.id),
      userPromptSubmit: {
        hook: 'userpromptsubmit/mode-injector-fast.mjs',
        purpose: 'cache-only team mode/objective/inbox context per prompt',
      },
      postToolUse: {
        hook: 'posttooluse/gold-context-inject.mjs',
        purpose: 'domain-triggered GOLD nudge after file/command/search tools',
      },
      rule: 'Context injection is shared substrate; Codex should consume mode and GOLD nudges without copying Claude-only hook policy wholesale.',
    },
    aiFirstRuntime: buildAiFirstRuntimeStatus({
      memoryReady: Boolean(memoryPath),
      knowledgeReady: integration.knowledge?.ready === true,
      roomReady: integration.room?.ready === true,
      mcpReady: integration.mcp?.ready === true,
      injectionReady,
      goldReady: gold.ready === true,
      sovereignMemoryPackage,
    }),
    gold,
    commands: {
      codexStartup: 'pnpm run codex:session-start -- --json',
      holorepoBootstrap: 'pnpm run codex:holorepo-bootstrap -- --json',
      skillMirror: integration.skills?.checkCommand || 'pnpm check:skill-roots',
      codexMcp: integration.mcp?.command || 'pnpm check:codex-mcp',
      memoryIndex: 'pnpm run check:memory-index',
      memoryPackage: `node -e "import('${sovereignMemoryPackage.packageName}').then(m=>console.log(Object.keys(m)))"`,
    },
  };
}
