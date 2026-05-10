import { normalizeGitHubRepo } from './repoConsent';
import { buildAgentGenesisPlan } from './agentGenesis';

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
    'It stores identity, knowledge, agent configuration, linked repos, board state, conversion recommendations, and paper unlock state in Git.',
    '',
    '```text',
    'knowledge/        -> W/P/G entries your agents discover',
    'agents/           -> Agent configs',
    'ecosystem/        -> MCP servers, hooks, linked repos, board state',
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
    },
  };

  return {
    metadata,
    files: buildFiles(input, metadata),
  };
}
