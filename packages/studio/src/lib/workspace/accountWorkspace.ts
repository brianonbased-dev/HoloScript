import { normalizeGitHubRepo } from './repoConsent';
import { buildAgentGenesisPlan, type AgentGenesisPlan } from './agentGenesis';

export type AccountWorkspaceTier = 'starter' | 'founder';

export interface AccountLinkedRepo {
  id: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  role: 'account-workspace' | 'approved-repo';
}

export interface AccountWorkspaceMetadata {
  workspaceId: string;
  githubUsername: string;
  email: string;
  tier: AccountWorkspaceTier;
  template: 'ai-workspace-template';
  templateVersion: string;
  repoUrl: string;
  repoName: string;
  source: 'ai-workspace-template';
  createdAt: string;
  updatedAt: string;
  capabilities: string[];
  structure: {
    profilePath: 'profile.yml';
    configPath: 'config.yml';
    knowledgeDir: 'knowledge';
    agentsDir: 'agents';
    ecosystemDir: 'ecosystem';
    accountManifestPath: 'ecosystem/account-workspace.json';
    linkedReposPath: 'ecosystem/linked-repos.json';
    boardStatePath: 'ecosystem/board-state.json';
    paperUnlocksPath: 'ecosystem/paper-unlocks.json';
    conversionRecommendationsPath: 'ecosystem/conversion-recommendations.json';
    agentGenesisPath: 'ecosystem/agent-genesis.json';
    skillsLobbyPath: 'ecosystem/skills/lobby.yml';
    agentRosterPath: 'agents/roster.yml';
    fleetAutospawnPath: 'ecosystem/fleet/autospawn.yml';
    holohealChecksPath: 'ecosystem/holoheal/checks.yml';
    holodoorPolicyPath: 'ecosystem/holodoor/policy.json';
    secretGrantReceiptPolicyPath: 'ecosystem/holoheal/secret-grant-receipt.yml';
  };
  linkedRepos: AccountLinkedRepo[];
  boardState: {
    authoritativeSource: 'holomesh-hosted-board';
    status: 'empty';
    note: string;
  };
  paperUnlockState: {
    status: 'locked';
    hiddenPaperProgramUnlocked: false;
    reasons: string[];
  };
  repoImport: {
    workspaceId: string;
    linkedReposPath: string;
    conversionRecommendationsPath: string;
  };
  daemon: {
    workspaceId: string;
    accountRepoUrl: string;
    agentConfigPath: string;
    boardStatePath: string;
    agentGenesisPath: string;
    skillsLobbyPath: string;
    fleetAutospawnPath: string;
    holohealChecksPath: string;
    holodoorPolicyPath: string;
  };
}

export interface AccountWorkspaceSeedInput {
  workspaceId: string;
  githubUsername: string;
  email: string;
  repoUrl: string;
  repoName: string;
  approvedRepos: string[];
  intent?: string;
  createdAt?: string;
  orchestratorUrl: string;
}

export interface AccountWorkspaceSeed {
  metadata: AccountWorkspaceMetadata;
  files: Record<string, string>;
}

const TEMPLATE_VERSION = 'ai-workspace-template@2026-05-10';
const HOLOSCRIPT_MCP_URL = 'https://mcp.holoscript.net';
const ABSORB_URL = 'https://absorb.holoscript.net';

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function sanitizeId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || 'workspace'
  );
}

function parseGitHubRepo(value: string): Omit<AccountLinkedRepo, 'role'> | null {
  const repo = normalizeGitHubRepo(value);
  if (!repo) return null;
  return {
    id: `${sanitizeId(repo.owner)}-${sanitizeId(repo.repo)}`,
    owner: repo.owner,
    repo: repo.repo,
    cloneUrl: repo.cloneUrl,
  };
}

function uniqueLinkedRepos(repos: AccountLinkedRepo[]): AccountLinkedRepo[] {
  const byCloneUrl = new Map<string, AccountLinkedRepo>();
  for (const repo of repos) {
    const key = repo.cloneUrl.toLowerCase();
    if (!byCloneUrl.has(key)) byCloneUrl.set(key, repo);
  }
  return Array.from(byCloneUrl.values());
}

function buildLinkedRepos(input: AccountWorkspaceSeedInput): AccountLinkedRepo[] {
  const accountRepo = parseGitHubRepo(input.repoUrl);
  const linked: AccountLinkedRepo[] = accountRepo
    ? [{ ...accountRepo, role: 'account-workspace' }]
    : [];

  for (const approved of input.approvedRepos) {
    const parsed = parseGitHubRepo(approved);
    if (parsed) linked.push({ ...parsed, role: 'approved-repo' });
  }

  return uniqueLinkedRepos(linked);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readme(input: AccountWorkspaceSeedInput): string {
  return [
    '# AI Workspace',
    '',
    'This repo is your HoloScript Studio account workspace.',
    '',
    'It stores identity, knowledge, agent configuration, linked repos, board state, conversion recommendations, Agent Genesis policy, HoloDoor policy, and HoloHeal receipts in Git.',
    '',
    '```text',
    'knowledge/        -> W/P/G entries your agents discover',
    'agents/           -> Resident agent roster and configs',
    'ecosystem/        -> MCP servers, hooks, linked repos, board state, skills lobby, HoloDoor, Fleet, HoloHeal',
    'profile.yml       -> Studio identity and tier',
    'config.yml        -> Workspace settings',
    '```',
    '',
    `Workspace id: \`${input.workspaceId}\``,
    '',
  ].join('\n');
}

function profile(input: AccountWorkspaceSeedInput, createdAt: string): string {
  return [
    '# AI Workspace Profile',
    'username: ' + quoteYaml(input.githubUsername),
    'display_name: ' + quoteYaml(input.githubUsername),
    'email: ' + quoteYaml(input.email),
    'tier: "starter"',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'template: "ai-workspace-template"',
    'template_version: ' + quoteYaml(TEMPLATE_VERSION),
    '',
    'preferences:',
    '  default_agent: "claude"',
    '  knowledge_auto_sync: true',
    '  compress_on_session_end: true',
    '  max_entries_per_sync: 50',
    '',
    'created_at: ' + quoteYaml(createdAt),
    '',
  ].join('\n');
}

function config(input: AccountWorkspaceSeedInput): string {
  return [
    '# Workspace Configuration',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'account_repo: ' + quoteYaml(input.repoUrl),
    '',
    'orchestrator:',
    '  url: ' + quoteYaml(input.orchestratorUrl),
    '  api_key_secret: "HOLOSCRIPT_API_KEY"',
    '',
    'mcp_servers:',
    '  holoscript:',
    '    url: ' + quoteYaml(HOLOSCRIPT_MCP_URL),
    '    description: "Universal semantic platform"',
    '  absorb:',
    '    url: ' + quoteYaml(ABSORB_URL),
    '    description: "Codebase intelligence and knowledge extraction"',
    '',
    'knowledge:',
    '  sync_on_push: true',
    '  batch_size: 20',
    '  valid_types:',
    '    - wisdom',
    '    - pattern',
    '    - gotcha',
    '',
  ].join('\n');
}

function knowledgeReadme(type: string): string {
  return [
    `# ${type}`,
    '',
    'Add Markdown files with YAML frontmatter. They sync into the scoped knowledge store for this workspace.',
    '',
  ].join('\n');
}

function yamlList(items: readonly string[], indent = '    '): string[] {
  if (items.length === 0) return [`${indent}- "none"`];
  return items.map((item) => `${indent}- ${quoteYaml(item)}`);
}

function skillsLobby(input: AccountWorkspaceSeedInput): string {
  return [
    '# Skills Lobby',
    'schema_version: "0.1.0"',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'rule: "skills-first"',
    'purpose: "Make the skill route the first thing every resident agent sees."',
    '',
    'first_screen:',
    '  title: "Choose a skill before raw tools"',
    '  show_before:',
    '    - "shell"',
    '    - "browser"',
    '    - "mcp raw calls"',
    '    - "secret broker grants"',
    '  default_route: "holoheal"',
    '',
    'routes:',
    '  codebase_question:',
    '    first_skills:',
    ...yamlList(['codebase', 'holoscript-absorb']),
    '  frontend_or_studio:',
    '    first_skills:',
    ...yamlList(['frontend', 'holofrontend']),
    '  research_or_unknown:',
    '    first_skills:',
    ...yamlList(['ai-workspace', 'holomesh-oracle', 'documenter']),
    '  xr_3d_or_simulation:',
    '    first_skills:',
    ...yamlList(['hololand', 'compile', 'holoscript']),
    '  launch_or_public_surface:',
    '    first_skills:',
    ...yamlList(['holomarketer', 'documenter', 'holomesh']),
    '  secret_token_or_oauth:',
    '    first_skills:',
    ...yamlList(['holoheal', 'critic']),
    '    rule: "check HoloDoor policy, request broker grant receipt, never read plaintext from Git"',
    '  failing_check_or_hook:',
    '    first_skills:',
    ...yamlList(['codebase', 'critic']),
    '    handoff: "HoloDoor gates the action; HoloHeal opens incident; HoloClaw repairs; HoloMesh stores receipt; Fleet updates trust."',
    '',
  ].join('\n');
}

function agentRoster(input: AccountWorkspaceSeedInput, plan: AgentGenesisPlan): string {
  const lines = [
    '# Resident Agent Roster',
    'schema_version: "0.1.0"',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'source: "ecosystem/agent-genesis.json"',
    '',
    'agents:',
  ];

  for (const agent of plan.agents) {
    lines.push(
      `  - id: ${quoteYaml(agent.id)}`,
      `    name: ${quoteYaml(agent.name)}`,
      `    mission_profile: ${quoteYaml(agent.missionProfile)}`,
      `    autospawn: ${agent.autospawn ? 'true' : 'false'}`,
      `    priority: ${agent.priority}`,
      '    first_skills:',
      ...yamlList(agent.skillsFirst.primarySkills, '      '),
      '    receipts:',
      ...yamlList(agent.receiptTargets, '      '),
      '    raw_secret_access: false'
    );
  }

  lines.push(
    '',
    'guardrails:',
    '  holodoor:',
    '    policy_path: "ecosystem/holodoor/policy.json"',
    '    telemetry_target: "HoloMesh"',
    '    gates:',
    ...yamlList(['tool-use', 'mcp-config', 'secret-grant'], '      '),
    ''
  );
  return lines.join('\n');
}

function fleetAutospawn(input: AccountWorkspaceSeedInput, plan: AgentGenesisPlan): string {
  return [
    '# Fleet Autospawn',
    'schema_version: "0.1.0"',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'agent_genesis: "ecosystem/agent-genesis.json"',
    'resident_roster: "agents/roster.yml"',
    'skills_lobby: "ecosystem/skills/lobby.yml"',
    'policy_gate: "HoloDoor"',
    '',
    'intents:',
    '  "secret, token, API key, or OAuth grant":',
    '    owner: "secret-custodian"',
    '    spawn:',
    ...yamlList(['secret-custodian', 'holoheal'], '      '),
    '    first_route: "secret_token_or_oauth"',
    '    policy_gate: "HoloDoor"',
    '    receipt: "secret.granted"',
    '  "failing check or broken hook":',
    '    owner: "holoheal"',
    '    spawn:',
    ...yamlList(['holoheal', 'fleet-auditor'], '      '),
    '    incident_target: "HoloClaw"',
    '    policy_gate: "HoloDoor"',
    '    receipt: "repair.verified"',
    '  "codebase implementation":',
    '    owner: "builder"',
    '    spawn:',
    ...yamlList(['builder', 'holoheal'], '      '),
    '    first_route: "codebase_question"',
    '    receipt: "fleet.assignment"',
    '  "research, RAG, or unknown domain":',
    '    owner: "research-oracle"',
    '    spawn:',
    ...yamlList(['research-oracle', 'fleet-auditor'], '      '),
    '    first_route: "research_or_unknown"',
    '    receipt: "knowledge.compressed"',
    '  "XR, 3D, HoloLand, or simulation":',
    '    owner: "spatial-worldbuilder"',
    '    spawn:',
    ...yamlList(['spatial-worldbuilder', 'holoheal'], '      '),
    '    first_route: "xr_3d_or_simulation"',
    '    receipt: "compile.verified"',
    '',
    'limits:',
    '  max_parallel_agents_default: 4',
    '  require_receipts: true',
    '  prefer_resident_owner_first: true',
    '',
    'autospawn_defaults:',
    ...yamlList(
      plan.agents.filter((agent) => agent.autospawn).map((agent) => agent.missionProfile),
      '  '
    ),
    '',
  ].join('\n');
}

function holohealChecks(input: AccountWorkspaceSeedInput): string {
  const escapedWorkspace = input.workspaceId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return [
    '# HoloHeal Checks',
    'schema_version: "0.1.0"',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'receipt_policy:',
    '  policy_gate: "HoloDoor"',
    '  target: "HoloMesh"',
    '  p0_p1_incident_target: "HoloClaw"',
    '  trust_target: "Fleet"',
    '',
    'checks:',
    '  skills_lobby_present:',
    '    severity: "P1"',
    '    command: \'node -e "require(\\"fs\\").accessSync(\\"ecosystem/skills/lobby.yml\\")"\'',
    '    repair_agent: "holoheal"',
    '  agent_genesis_present:',
    '    severity: "P1"',
    '    command: \'node -e "require(\\"fs\\").accessSync(\\"ecosystem/agent-genesis.json\\")"\'',
    '    repair_agent: "holoheal"',
    '  secret_manifest_handles_only:',
    '    severity: "P1"',
    `    command: 'node -e "const fs=require(\\"fs\\"); const s=fs.readFileSync(\\"ecosystem/secrets.manifest.yml\\",\\"utf8\\"); if(!s.includes(\\"secret://workspace/${escapedWorkspace}/\\")) process.exit(1); if(/gho_|sk-[A-Za-z0-9]/.test(s)) process.exit(1)"'`,
    '    repair_agent: "secret-custodian"',
    '  fleet_autospawn_present:',
    '    severity: "P2"',
    '    command: \'node -e "require(\\"fs\\").accessSync(\\"ecosystem/fleet/autospawn.yml\\")"\'',
    '    repair_agent: "fleet-auditor"',
    '  holodoor_policy_present:',
    '    severity: "P1"',
    '    command: \'node -e "const p=require(\\"./ecosystem/holodoor/policy.json\\"); if(p.schemaVersion!==\\"1.0.0\\") process.exit(1); if(p.telemetry?.redact!==\\"strict\\") process.exit(1)"\'',
    '    repair_agent: "holoheal"',
    '',
  ].join('\n');
}

function holodoorPolicy(): string {
  return json({
    schemaVersion: '1.0.0',
    mcpServers: {
      allowlist: [],
      blocklist: [],
      matchBy: 'id',
    },
    tools: {
      allowlist: [],
      blocklist: [],
      blockedCommandPatterns: [],
    },
    guardrails: [
      'Gate tool use, MCP configuration, and secret grants through HoloDoor policy before execution.',
      'Keep telemetry redacted; HoloMesh stores policy decisions and receipt references, not secret values.',
    ],
    repoRules: {
      pathGlobs: ['**/*'],
    },
    telemetry: {
      mode: 'local',
      redact: 'strict',
    },
    enforcement: {
      onViolation: 'warn',
      postSessionAlertOnBlock: false,
    },
  });
}

function secretGrantReceiptPolicy(input: AccountWorkspaceSeedInput): string {
  return [
    '# Secret Grant Receipt Policy',
    'schema_version: "0.1.0"',
    'workspace_id: ' + quoteYaml(input.workspaceId),
    'event: "secret.granted"',
    'required_fields:',
    ...yamlList(['grantId', 'agentId', 'secretRef', 'capabilityRef', 'issuedAt', 'expiresAt', 'plaintextReturned'], '  '),
    'forbidden_fields:',
    ...yamlList(['value', 'secret', 'token', 'apiKey', 'api_key', 'plaintext'], '  '),
    'rules:',
    '  plaintextReturned: false',
    '  secretRef_prefix: ' + quoteYaml(`secret://workspace/${input.workspaceId}/`),
    '  capabilityRef_prefix: "cap://daemon/secrets/"',
    '  stored_secret_values: "Studio server or GitHub Actions secrets only; never Git."',
    '',
  ].join('\n');
}

function buildFiles(
  input: AccountWorkspaceSeedInput,
  metadata: AccountWorkspaceMetadata
): Record<string, string> {
  const linkedRepos = { workspaceId: input.workspaceId, repos: metadata.linkedRepos };
  const boardState = {
    workspaceId: input.workspaceId,
    ...metadata.boardState,
    tasks: [],
  };
  const paperUnlocks = {
    workspaceId: input.workspaceId,
    ...metadata.paperUnlockState,
    checklist: [],
  };
  const conversionRecommendations = {
    workspaceId: input.workspaceId,
    recommendations: [],
    note: 'Repo import and Absorb will populate this file with path-backed conversion opportunities.',
  };
  const agentGenesis = buildAgentGenesisPlan({
    workspaceId: input.workspaceId,
    repoUrl: input.repoUrl,
    repoName: input.repoName,
    intent: input.intent,
    approvedRepos: input.approvedRepos,
  });

  return {
    '.gitignore': ['.env', '.env.*', '!.env.example', 'node_modules/', '.DS_Store', ''].join('\n'),
    'README.md': readme(input),
    'profile.yml': profile(input, metadata.createdAt),
    'config.yml': config(input),
    'agents/claude.yml': [
      'model: "claude-opus-4-7"',
      'knowledge:',
      '  re_intake: true',
      '  compress: true',
      '  auto_sync: true',
      'mcp_servers:',
      '  - "holoscript"',
      '  - "absorb"',
      '',
    ].join('\n'),
    'agents/gemini.yml': [
      'model: "gemini-2.5-pro"',
      'knowledge:',
      '  re_intake: true',
      '  compress: true',
      'mcp_servers:',
      '  - "holoscript"',
      '  - "absorb"',
      '',
    ].join('\n'),
    'ecosystem/mcp-servers.yml': [
      'servers:',
      '  holoscript:',
      `    url: "${HOLOSCRIPT_MCP_URL}"`,
      '    transport: "sse"',
      '  absorb:',
      `    url: "${ABSORB_URL}"`,
      '    transport: "sse"',
      '  orchestrator:',
      `    url: "${input.orchestratorUrl}"`,
      '    transport: "http"',
      '',
    ].join('\n'),
    'ecosystem/account-workspace.json': json(metadata),
    'ecosystem/linked-repos.json': json(linkedRepos),
    'ecosystem/board-state.json': json(boardState),
    'ecosystem/paper-unlocks.json': json(paperUnlocks),
    'ecosystem/conversion-recommendations.json': json(conversionRecommendations),
    'ecosystem/agent-genesis.json': json(agentGenesis),
    'ecosystem/skills/lobby.yml': skillsLobby(input),
    'agents/roster.yml': agentRoster(input, agentGenesis),
    'ecosystem/fleet/autospawn.yml': fleetAutospawn(input, agentGenesis),
    'ecosystem/holoheal/checks.yml': holohealChecks(input),
    'ecosystem/holodoor/policy.json': holodoorPolicy(),
    'ecosystem/holoheal/secret-grant-receipt.yml': secretGrantReceiptPolicy(input),
    'ecosystem/hooks/README.md': '# Hooks\n\nWorkspace-local automation hooks live here.\n',
    'ecosystem/skills/README.md': '# Skills\n\nWorkspace-local agent skills live here.\n',
    'knowledge/wisdom/README.md': knowledgeReadme('Wisdom'),
    'knowledge/patterns/README.md': knowledgeReadme('Patterns'),
    'knowledge/gotchas/README.md': knowledgeReadme('Gotchas'),
  };
}

export function buildAccountWorkspaceSeed(input: AccountWorkspaceSeedInput): AccountWorkspaceSeed {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const linkedRepos = buildLinkedRepos(input);
  const metadata: AccountWorkspaceMetadata = {
    workspaceId: input.workspaceId,
    githubUsername: input.githubUsername,
    email: input.email,
    tier: 'starter',
    template: 'ai-workspace-template',
    templateVersion: TEMPLATE_VERSION,
    repoUrl: input.repoUrl,
    repoName: input.repoName,
    source: 'ai-workspace-template',
    createdAt,
    updatedAt: createdAt,
    capabilities: [
      'knowledge-sync',
      'agent-config',
      'linked-repos',
      'repo-import',
      'daemon-workflows',
      'conversion-recommendations',
      'paper-unlock-state',
      'skills-lobby',
      'agent-genesis',
      'fleet-autospawn',
      'holodoor-policy',
      'holoheal-receipts',
    ],
    structure: {
      profilePath: 'profile.yml',
      configPath: 'config.yml',
      knowledgeDir: 'knowledge',
      agentsDir: 'agents',
      ecosystemDir: 'ecosystem',
      accountManifestPath: 'ecosystem/account-workspace.json',
      linkedReposPath: 'ecosystem/linked-repos.json',
      boardStatePath: 'ecosystem/board-state.json',
      paperUnlocksPath: 'ecosystem/paper-unlocks.json',
      conversionRecommendationsPath: 'ecosystem/conversion-recommendations.json',
      agentGenesisPath: 'ecosystem/agent-genesis.json',
      skillsLobbyPath: 'ecosystem/skills/lobby.yml',
      agentRosterPath: 'agents/roster.yml',
      fleetAutospawnPath: 'ecosystem/fleet/autospawn.yml',
      holohealChecksPath: 'ecosystem/holoheal/checks.yml',
      holodoorPolicyPath: 'ecosystem/holodoor/policy.json',
      secretGrantReceiptPolicyPath: 'ecosystem/holoheal/secret-grant-receipt.yml',
    },
    linkedRepos,
    boardState: {
      authoritativeSource: 'holomesh-hosted-board',
      status: 'empty',
      note: 'Hosted HoloMesh board state is authoritative; this file is a workspace-local handoff surface.',
    },
    paperUnlockState: {
      status: 'locked',
      hiddenPaperProgramUnlocked: false,
      reasons: ['No imported repo evidence has been evaluated yet.'],
    },
    repoImport: {
      workspaceId: input.workspaceId,
      linkedReposPath: 'ecosystem/linked-repos.json',
      conversionRecommendationsPath: 'ecosystem/conversion-recommendations.json',
    },
    daemon: {
      workspaceId: input.workspaceId,
      accountRepoUrl: input.repoUrl,
      agentConfigPath: 'agents/claude.yml',
      boardStatePath: 'ecosystem/board-state.json',
      agentGenesisPath: 'ecosystem/agent-genesis.json',
      skillsLobbyPath: 'ecosystem/skills/lobby.yml',
      fleetAutospawnPath: 'ecosystem/fleet/autospawn.yml',
      holohealChecksPath: 'ecosystem/holoheal/checks.yml',
      holodoorPolicyPath: 'ecosystem/holodoor/policy.json',
    },
  };

  return {
    metadata,
    files: buildFiles(input, metadata),
  };
}
