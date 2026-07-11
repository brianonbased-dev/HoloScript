import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_RUNTIME_CONTRACT_SCHEMA,
  AI_FIRST_RUNTIME_STATUS_SCHEMA,
  SOVEREIGN_SEED_PROMPT_SCHEMA,
  buildAiFirstRuntimeStatus,
  buildHoloScriptAgentRuntimeProfile,
  buildAgentRuntimeContractStatus,
  buildSovereignSeedPrompt,
  buildSovereignMemoryPackageConfig,
  buildSovereignMemoryPackageRuntimeStatus,
  createSovereignMemoryStore,
  hookConfigStatus,
  readAllowedEnvFileValues,
  readJsonStatus,
  sovereignMemoryStoreConfigFromEnv,
} from '../src/index.mjs';

function write(root, relPath, value, { bom = false } = {}) {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(target, `${bom ? '\uFEFF' : ''}${text}`, 'utf8');
  return target;
}

function hookConfig({
  includeCodexStartup = false,
  includeMode = true,
  includeGold = true,
  includeWpg = true,
} = {}) {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            ...(includeCodexStartup
              ? [{ type: 'command', command: 'node scripts/codex-session-start.mjs --join' }]
              : []),
            { type: 'command', command: 'node hooks/run-hook.mjs sessionstart/surface-pin.mjs' },
            {
              type: 'command',
              command: 'node hooks/run-hook.mjs sessionstart/memory-ceiling-check.mjs',
            },
          ],
        },
      ],
      ...(includeMode
        ? {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'node hooks/run-hook.mjs userpromptsubmit/mode-injector-fast.mjs',
                  },
                ],
              },
            ],
          }
        : {}),
      ...(includeGold
        ? {
            PostToolUse: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'node hooks/run-hook.mjs posttooluse/gold-context-inject.mjs',
                  },
                ],
              },
            ],
          }
        : {}),
      Stop: [
        {
          hooks: [
            { type: 'command', command: 'node hooks/run-hook.mjs stop/knowledge-sync.mjs' },
            ...(includeWpg
              ? [{ type: 'command', command: 'node hooks/run-hook.mjs stop/wpg-extract.mjs' }]
              : []),
          ],
        },
      ],
    },
  };
}

function fixtureRuntimeRoot({ includeCodexStartup = true, includeCodexMode = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agent-runtime-'));
  const memoryDir = join(root, 'memory');
  mkdirSync(memoryDir, { recursive: true });
  write(root, '.claude/settings.json', hookConfig());
  write(
    root,
    '.codex/hooks.json',
    hookConfig({
      includeCodexStartup,
      includeMode: includeCodexMode,
    }),
    { bom: true }
  );
  write(
    root,
    '.env',
    [
      'CODEX_PROJECT_MEMORY_DIR=ignored-secret-path',
      'HOLOMESH_API_KEY=secret',
      'IGNORED_KEY=should-not-read',
      'GOLD_ROOT="D:/GOLD"',
    ].join('\n')
  );
  return { root, memoryDir };
}

function buildFixtureStatus({ root, memoryDir, includeGoldReady = true }) {
  return buildAgentRuntimeContractStatus({
    repoRoot: root,
    env: { CODEX_PROJECT_MEMORY_DIR: memoryDir },
    skillMirrorStatus: { ok: true },
    projectMemoryFileEnvKeys: ['CODEX_PROJECT_MEMORY_DIR', 'CLAUDE_PROJECT_MEMORY_DIR'],
    projectMemoryEnvKeys: ['CODEX_PROJECT_MEMORY'],
    projectMemoryFileCandidates: ({ workspaceRoot }) => [
      join(workspaceRoot, 'memory', 'MEMORY.md'),
      join(workspaceRoot, 'other', 'MEMORY.md'),
    ],
    resolveProjectMemoryFile: ({ env }) => join(env.CODEX_PROJECT_MEMORY_DIR, 'MEMORY.md'),
    readEcosystemIntegrationStatus: () => ({
      room: { ready: true, command: 'node scripts/codex-team-daemon.mjs join' },
      knowledge: {
        ready: true,
        searchCommand: 'node scripts/room-knowledge-search.mjs "<query>"',
        publishCommand: 'node scripts/room-knowledge.mjs wisdom "-"',
      },
      mcp: { ready: true, command: 'pnpm check:codex-mcp' },
      skills: {
        ready: true,
        checkCommand: 'pnpm check:skill-roots',
        syncCommand: 'pnpm sync:skill-roots',
      },
    }),
    goldDriveIntakeStatus: (env) => ({
      ready: includeGoldReady,
      root: env.GOLD_ROOT || null,
      indexPath: env.GOLD_ROOT ? `${env.GOLD_ROOT}/INDEX.md` : null,
      diamondCount: includeGoldReady ? 2 : null,
      bronzeCount: includeGoldReady ? 1 : null,
      silverCount: includeGoldReady ? 1 : null,
    }),
  });
}

test('readJsonStatus accepts Codex BOM JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-runtime-json-'));
  try {
    const path = write(root, '.codex/hooks.json', { hooks: {} }, { bom: true });
    assert.deepEqual(readJsonStatus(path), {
      exists: true,
      parseOk: true,
      json: { hooks: {} },
      error: null,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hookConfigStatus audits shared runtime hook commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-runtime-hooks-'));
  try {
    const path = write(root, '.claude/settings.json', hookConfig());
    const status = hookConfigStatus({
      label: 'claude',
      filePath: path,
      requiredHooks: [
        { id: 'surface-pin', needle: 'sessionstart/surface-pin.mjs' },
        { id: 'mode-injector-fast', needle: 'userpromptsubmit/mode-injector-fast.mjs' },
      ],
    });
    assert.equal(status.ready, true);
    assert.equal(status.hookCommandCount, 6);
    assert.deepEqual(status.missingRequired, []);
    assert.deepEqual(status.hookEvents, [
      'PostToolUse',
      'SessionStart',
      'Stop',
      'UserPromptSubmit',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hookConfigStatus blocks async hooks when a surface does not support them', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-runtime-unsupported-async-'));
  try {
    const config = hookConfig({ includeCodexStartup: true });
    config.hooks.Stop[0].hooks[0].async = true;
    const path = write(root, '.codex/hooks.json', config);
    const status = hookConfigStatus({
      label: 'codex',
      filePath: path,
      requiredHooks: [{ id: 'knowledge-sync', needle: 'stop/knowledge-sync.mjs' }],
      asyncSupported: false,
    });

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingRequired, []);
    assert.equal(status.unsupportedAsyncHooks.length, 1);
    assert.equal(status.unsupportedAsyncHooks[0].event, 'Stop');
    assert.match(status.unsupportedAsyncHooks[0].command, /knowledge-sync/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readAllowedEnvFileValues only returns allow-listed values', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-runtime-env-'));
  try {
    const path = write(
      root,
      '.env',
      [
        'CODEX_PROJECT_MEMORY_DIR="C:/memory"',
        'SECRET_TOKEN=do-not-return',
        'GOLD_ROOT=D:/GOLD',
      ].join('\n')
    );
    assert.deepEqual(readAllowedEnvFileValues(path, ['CODEX_PROJECT_MEMORY_DIR']), {
      CODEX_PROJECT_MEMORY_DIR: 'C:/memory',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildAgentRuntimeContractStatus folds Claude, Codex, memory, stores, injection, and GOLD', () => {
  const { root, memoryDir } = fixtureRuntimeRoot();
  try {
    const status = buildFixtureStatus({ root, memoryDir });
    assert.equal(status.schema, AGENT_RUNTIME_CONTRACT_SCHEMA);
    assert.equal(status.ready, true);
    assert.equal(status.configs.claude.ready, true);
    assert.equal(status.configs.codex.ready, true);
    assert.equal(status.runtimeProfiles.schema, 'holoscript.agent-runtime.profiles.v1');
    assert.equal(status.runtimeProfiles.claude.family, 'anthropic');
    assert.equal(status.runtimeProfiles.codex.family, 'openai');
    assert.equal(status.runtimeProfiles.holoscript.family, 'holoscript');
    assert.equal(status.runtimeProfiles.holoscript.requested, false);
    assert.equal(status.runtimeProfiles.holoscript.ready, true);
    assert.equal(status.memory.ready, true);
    assert.equal(status.memory.pinned, true);
    assert.deepEqual(status.memory.pinKeys, ['CODEX_PROJECT_MEMORY_DIR']);
    assert.equal(status.memory.sovereignPackage.packageName, '@holoscript/memory');
    assert.equal(status.memory.sovereignPackage.directSot.configured, false);
    assert.equal(status.store.sovereignMemory.fallbackMode, 'mcp-orchestrator-fallback');
    assert.equal(status.store.ready, true);
    assert.equal(status.injection.ready, true);
    assert.equal(status.aiFirstRuntime.schema, AI_FIRST_RUNTIME_STATUS_SCHEMA);
    assert.equal(status.aiFirstRuntime.ready, true);
    assert.equal(status.aiFirstRuntime.secondBrain.ready, true);
    assert.equal(status.aiFirstRuntime.autonomy.ready, true);
    assert.deepEqual(
      status.aiFirstRuntime.resources.map((resource) => resource.id),
      [
        'intent',
        'memory',
        'knowledge',
        'tools',
        'decisions',
        'telemetry',
        'receipts',
        'recovery',
        'next-actions',
      ]
    );
    assert.deepEqual(status.injection.sharedHookIds, ['mode-injector-fast', 'gold-context-inject']);
    assert.equal(status.gold.ready, true);
    assert.equal(status.gold.diamondCount, 2);
    assert.equal(JSON.stringify(status).includes('ignored-secret-path'), false);
    assert.equal(JSON.stringify(status).includes('HOLOMESH_API_KEY'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildAgentRuntimeContractStatus blocks Codex async hook wiring', () => {
  const { root, memoryDir } = fixtureRuntimeRoot();
  try {
    const config = hookConfig({ includeCodexStartup: true });
    config.hooks.Stop[0].hooks[0].async = true;
    write(root, '.codex/hooks.json', config, { bom: true });

    const status = buildFixtureStatus({ root, memoryDir });
    assert.equal(status.ready, false);
    assert.equal(status.configs.codex.ready, false);
    assert.equal(status.configs.codex.unsupportedAsyncHooks.length, 1);
    assert.equal(
      status.blockers.find((blocker) => blocker.kind === 'codex-config')?.unsupportedAsyncHooks
        .length,
      1
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildAiFirstRuntimeStatus models second brain and bounded autonomy without secrets', () => {
  const status = buildAiFirstRuntimeStatus({
    memoryReady: true,
    knowledgeReady: true,
    roomReady: true,
    mcpReady: true,
    injectionReady: true,
    goldReady: false,
    sovereignMemoryPackage: buildSovereignMemoryPackageConfig({
      env: {
        MEMORY_PGHOST: 'db.example.test',
        MEMORY_PGPASSWORD: 'do-not-leak',
        MEMORY_WORKSPACE: 'external-agent',
      },
    }),
  });

  assert.equal(status.schema, AI_FIRST_RUNTIME_STATUS_SCHEMA);
  assert.equal(status.ready, true);
  assert.equal(status.secondBrain.ready, true);
  assert.equal(status.secondBrain.authorityBoundary.ready, false);
  assert.equal(
    status.secondBrain.authorityBoundary.rule.includes(
      'founder GOLD state is never a package requirement'
    ),
    true
  );
  assert.equal(status.autonomy.ready, true);
  assert(status.autonomy.loop.includes('farm-next-work'));
  assert.equal(JSON.stringify(status).includes('do-not-leak'), false);
});

test('buildAgentRuntimeContractStatus warns when direct memory SoT lacks credential', () => {
  const { root, memoryDir } = fixtureRuntimeRoot();
  try {
    const status = buildFixtureStatus({ root, memoryDir });
    const withDirectRequest = buildAgentRuntimeContractStatus({
      repoRoot: root,
      env: { CODEX_PROJECT_MEMORY_DIR: memoryDir, HOLO_MEMORY_SOT_HOST: '127.0.0.1' },
      skillMirrorStatus: { ok: true },
      projectMemoryFileEnvKeys: ['CODEX_PROJECT_MEMORY_DIR'],
      projectMemoryFileCandidates: () => [],
      resolveProjectMemoryFile: ({ env }) => join(env.CODEX_PROJECT_MEMORY_DIR, 'MEMORY.md'),
      readEcosystemIntegrationStatus: () => ({
        room: { ready: true },
        knowledge: { ready: true },
        mcp: { ready: true },
        skills: { checkCommand: 'pnpm check:skill-roots' },
      }),
      goldDriveIntakeStatus: () => ({
        ready: true,
        root: 'D:/GOLD',
        indexPath: 'D:/GOLD/INDEX.md',
      }),
    });

    assert.equal(status.ready, true);
    assert.equal(withDirectRequest.ready, true);
    assert.equal(withDirectRequest.memory.sovereignPackage.directSot.requested, true);
    assert.equal(withDirectRequest.memory.sovereignPackage.directSot.configured, false);
    assert(
      withDirectRequest.warnings.some((item) => item.kind === 'memory-sot-credential-missing')
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildHoloScriptAgentRuntimeProfile models edge agents without making Jetson default', () => {
  const profile = buildHoloScriptAgentRuntimeProfile({
    env: {
      HOLOSCRIPT_AGENT_HANDLE: 'edge-builder',
      HOLOSCRIPT_AGENT_BRAIN_PATH: '/operator/brains/edge-agent.hsplus',
      HOLOSCRIPT_AGENT_PROVIDER: 'ollama',
      HOLOSCRIPT_AGENT_MODEL: 'qwen3',
      HOLOSCRIPT_AGENT_NODE_PROFILE: 'jetson-reference',
      HOLOSCRIPT_AGENT_MCP_URL: 'http://edge-node.example.test:7411/mcp',
      HOLOSCRIPT_AGENT_READ_ROOTS: '/workspace;/repo',
      HOLOSCRIPT_AGENT_WRITE_ROOTS: '/workspace/out',
      HOLOSCRIPT_AGENT_WALLET_ENV_KEY: 'EDGE_AGENT_WALLET',
      HOLOSCRIPT_AGENT_BEARER_ENV_KEY: 'EDGE_AGENT_BEARER',
    },
    memoryConfig: buildSovereignMemoryPackageConfig({
      env: {
        MEMORY_PGHOST: 'db.example.test',
        MEMORY_PGPASSWORD: 'secret-value-1234',
        MEMORY_WORKSPACE: 'edge-fleet',
      },
    }),
  });

  assert.equal(profile.runtimePackage, '@holoscript/holoscript-agent');
  assert.equal(profile.requested, true);
  assert.equal(profile.configured, true);
  assert.equal(profile.ready, true);
  assert.equal(profile.identity.handle, 'edge-builder');
  assert.equal(profile.identity.walletEnvKey, 'EDGE_AGENT_WALLET');
  assert.equal(profile.node.jetsonReferenceProfile, true);
  assert.match(profile.node.rule, /never the public package default/u);
  assert.deepEqual(profile.node.readRoots, ['/workspace', '/repo']);
  assert.equal(profile.memory.workspaceId, 'edge-fleet');
  assert.equal(JSON.stringify(profile).includes('secret-value-1234'), false);
});

test('buildHoloScriptAgentRuntimeProfile accepts supervisor config as the agent source', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-runtime-hs-'));
  try {
    const configPath = write(root, 'agents.json', {
      agents: [
        { handle: 'builder', brainPath: './brains/builder.hsplus', enabled: true },
        { handle: 'reviewer', brainPath: './brains/reviewer.hsplus', enabled: false },
      ],
    });
    const profile = buildHoloScriptAgentRuntimeProfile({
      configPath,
      readJsonStatusImpl: readJsonStatus,
    });

    assert.equal(profile.requested, true);
    assert.equal(profile.configured, true);
    assert.equal(profile.supervisor.agentCount, 2);
    assert.equal(profile.supervisor.enabledCount, 1);
    assert.deepEqual(profile.supervisor.handles, ['builder', 'reviewer']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildSovereignMemoryPackageConfig redacts the scoped memory credential', () => {
  const config = buildSovereignMemoryPackageConfig({
    env: {
      MEMORY_PGHOST: '127.0.0.1',
      MEMORY_PGPORT: '5432',
      MEMORY_PGDATABASE: 'knowledge',
      MEMORY_PGUSER: 'memory_svc',
      MEMORY_WORKSPACE: 'external-agent',
      MEMORY_PGPASSWORD: 'super-secret',
    },
  });

  assert.equal(config.ready, true);
  assert.equal(config.directSot.configured, true);
  assert.equal(config.directSot.passwordPresent, true);
  assert.equal(config.directSot.envKeys.host, 'MEMORY_PGHOST');
  assert.equal(config.directSot.workspaceId, 'external-agent');
  assert.equal(JSON.stringify(config).includes('super-secret'), false);
});

test('buildSovereignMemoryPackageConfig keeps HoloScript env aliases as adapters', () => {
  const config = buildSovereignMemoryPackageConfig({
    env: {
      HOLO_MEMORY_SOT_HOST: '127.0.0.1',
      HOLO_MEMORY_SOT_PORT: '5434',
      HOLO_MEMORY_WORKSPACE: 'ai-ecosystem',
      MEMORY_SVC_PASSWORD: 'secret',
    },
  });

  assert.equal(config.directSot.configured, true);
  assert.equal(config.directSot.port, 5434);
  assert.equal(config.directSot.workspaceId, 'ai-ecosystem');
  assert.equal(config.directSot.envKeys.host, 'HOLO_MEMORY_SOT_HOST');
  assert.equal(config.directSot.passwordKey, 'MEMORY_SVC_PASSWORD');
});

test('sovereignMemoryStoreConfigFromEnv produces pg config only when direct SoT is configured', () => {
  assert.throws(
    () => sovereignMemoryStoreConfigFromEnv({ env: { MEMORY_PGHOST: '127.0.0.1' } }),
    /Direct sovereign memory is not configured/u
  );

  const config = sovereignMemoryStoreConfigFromEnv({
    env: {
      MEMORY_PGHOST: '127.0.0.1',
      MEMORY_PGPASSWORD: 'secret',
    },
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'knowledge');
  assert.equal(config.user, 'memory_svc');
  assert.equal(config.password, 'secret');
});

test('buildSovereignMemoryPackageRuntimeStatus supports injected optional package loading', async () => {
  const status = await buildSovereignMemoryPackageRuntimeStatus({
    env: {},
    importer: async () => ({ SovereignMemoryStore: class FakeMemoryStore {} }),
  });

  assert.equal(status.available, true);
  assert.equal(status.ready, true);
  assert.deepEqual(status.exports, ['SovereignMemoryStore']);
});

test('createSovereignMemoryStore constructs the optional memory package client', () => {
  class FakeMemoryStore {
    constructor(config) {
      this.config = config;
    }
  }

  const store = createSovereignMemoryStore({
    memoryModule: { SovereignMemoryStore: FakeMemoryStore },
    env: {
      MEMORY_PGHOST: '127.0.0.1',
      MEMORY_PGPASSWORD: 'secret',
    },
  });

  assert(store instanceof FakeMemoryStore);
  assert.equal(store.config.password, 'secret');
});

test('buildAgentRuntimeContractStatus blocks when Codex misses shared context injection', () => {
  const { root, memoryDir } = fixtureRuntimeRoot({ includeCodexMode: false });
  try {
    const status = buildFixtureStatus({ root, memoryDir });
    assert.equal(status.ready, false);
    assert.equal(status.injection.ready, false);
    assert(status.configs.codex.missingRequired.includes('mode-injector-fast'));
    assert(status.blockers.some((item) => item.kind === 'codex-config'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildSovereignSeedPrompt plants public HoloRepo DB KS GOLD questions without founder-local state', () => {
  const seed = buildSovereignSeedPrompt({
    productName: 'external agent framework',
    masterCanonLabel: 'operator-provided canon capsule',
  });

  assert.equal(seed.schema, SOVEREIGN_SEED_PROMPT_SCHEMA);
  assert.equal(seed.goldPackage.releaseLane, 'unreleased');
  assert(seed.packages.some((pkg) => pkg.name === '@holoscript/holorepo'));
  assert(seed.packages.some((pkg) => pkg.name === 'holoscript-holorepo'));
  assert(seed.packages.some((pkg) => pkg.name === '@holoscript/agent-runtime'));
  assert(seed.questions.some((question) => question.id === 'sovereign-novelty'));
  assert(seed.questions.some((question) => question.id === 'db-ks-gold'));
  assert(seed.questions.some((question) => question.id === 'ai-first-runtime'));
  assert(seed.questions.some((question) => question.id === 'second-brain-continuity'));
  assert(seed.questions.some((question) => question.id === 'autonomous-loop-control'));
  assert(seed.questions.some((question) => question.id === 'self-improvement-farming'));
  assert.match(seed.prompt, /DB, KS, and GOLD-compatible/u);
  assert.match(seed.prompt, /AI-first runtime/u);
  assert.match(seed.prompt, /second brain/u);
  assert.match(seed.prompt, /bounded autonomous improvement/u);
  assert.match(seed.prompt, /Return machine-readable JSON first/u);
  assert.equal(JSON.stringify(seed).includes('C:/Users/josep'), false);
  assert.equal(JSON.stringify(seed).includes('D:/GOLD'), false);
  assert.equal(JSON.stringify(seed).includes('192.168.'), false);
});
