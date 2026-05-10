import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import picomatch from 'picomatch';

export type ExistingWorkspaceArtifactCategory =
  | 'knowledge'
  | 'agents'
  | 'ecosystem'
  | 'docs'
  | 'research'
  | 'tasks';

export interface ExistingWorkspaceImportProfile {
  version?: number;
  profile?: string;
  workspaceId?: string;
  include?: string[];
  exclude?: string[];
  categories?: Partial<Record<ExistingWorkspaceArtifactCategory, string[]>>;
  maxFiles?: number;
  maxFileBytes?: number;
}

export interface ExistingWorkspaceImportInput {
  rootPath: string;
  workspaceId?: string;
  manifestPath?: string;
  persist?: boolean;
  cacheRoot?: string;
}

export interface ExistingWorkspaceArtifact {
  path: string;
  category: ExistingWorkspaceArtifactCategory;
  sizeBytes: number;
  sha256: string;
  modifiedAt: string;
}

export interface ExistingWorkspaceImportResult {
  workspaceId: string;
  rootPath: string;
  profile: ExistingWorkspaceImportProfile;
  profilePath: string | null;
  commitSha: string | null;
  dirty: boolean;
  idempotencyKey: string;
  cacheStatus: 'hit' | 'miss' | 'bypass-dirty' | 'bypass-no-git' | 'disabled';
  cachePath: string | null;
  artifacts: ExistingWorkspaceArtifact[];
  counts: Record<ExistingWorkspaceArtifactCategory, number>;
  stats: {
    scannedFiles: number;
    includedFiles: number;
    excludedFiles: number;
    skippedFiles: number;
    skippedLargeFiles: number;
  };
  generatedAt: string;
}

export class ExistingWorkspaceImportError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'ExistingWorkspaceImportError';
  }
}

const DEFAULT_PROFILE_PATHS = [
  '.holoscript/workspace-import.json',
  '.holoscript/workspace-profile.json',
  'workspace-import.json',
  'workspace-profile.json',
];

const DEFAULT_INCLUDE_PATTERNS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'NORTH_STAR.md',
  'README.md',
  'SKILL_MAP.md',
  'board.json',
  'package.json',
  'pnpm-workspace.yaml',
  '.holoscript/workspace-import.json',
  '.holoscript/workspace-profile.json',
  '.agents/**',
  '.claude/skills/**/SKILL.md',
  '.claude/hooks/**/*.{mjs,ts,js,cmd,json}',
  'compositions/**/*.{hs,hsplus,json,md}',
  'docs/**/*.{md,mdx,json}',
  'hooks/**/*.{mjs,ts,js,cmd,json,md}',
  'knowledge/**/*.{md,json,jsonl}',
  'memory/**/*.{md,json}',
  'research/**/*.{md,mdx,json,jsonl}',
  'scripts/**/*.{mjs,ts,js,json,md}',
  'tasks/**/*.{md,json,jsonl}',
];

const DEFAULT_EXCLUDE_PATTERNS = [
  '.env',
  '.env.*',
  '**/.env',
  '**/.env.*',
  '.git',
  '.git/**',
  '**/.git',
  '**/.git/**',
  'node_modules',
  'node_modules/**',
  '**/node_modules',
  '**/node_modules/**',
  '.next',
  '.next/**',
  '**/.next/**',
  'dist',
  'dist/**',
  '**/dist/**',
  'build',
  'build/**',
  '**/build/**',
  'coverage',
  'coverage/**',
  '**/coverage/**',
  '.cache',
  '.cache/**',
  '**/.cache/**',
  '.turbo',
  '.turbo/**',
  '**/.turbo/**',
  'cache',
  'cache/**',
  '**/cache/**',
  'tmp',
  'tmp/**',
  'temp',
  'temp/**',
  '**/tmp/**',
  '**/temp/**',
  'logs',
  'logs/**',
  '**/logs/**',
  '**/*.log',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/auth.json',
  '**/credentials.json',
  '**/secrets/**',
  '**/.secrets/**',
  '**/seats/**',
  '**/.seats/**',
  '**/wallets/**',
  '**/.wallets/**',
  '**/private/**',
  '**/*secret*',
  '**/*token*',
];

const DEFAULT_CATEGORY_PATTERNS: Record<ExistingWorkspaceArtifactCategory, string[]> = {
  knowledge: [
    'knowledge/**',
    '**/knowledge/**/*.md',
    '**/knowledge/**/*.json',
    '**/W.*',
    '**/P.*',
    '**/G.*',
  ],
  agents: [
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'SKILL_MAP.md',
    '.agents/**',
    '.claude/skills/**',
    '.claude/hooks/**',
  ],
  ecosystem: [
    'NORTH_STAR.md',
    'package.json',
    'pnpm-workspace.yaml',
    '.holoscript/workspace-*.json',
    'compositions/**',
    'hooks/**',
    'scripts/**',
  ],
  docs: ['README.md', 'docs/**', '**/*.mdx'],
  research: ['research/**'],
  tasks: ['board.json', 'tasks/**', '**/*task*.json', '**/*board*.json'],
};

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\/+/, '');
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function compileMatcher(patterns: string[]): (relPath: string) => boolean {
  if (patterns.length === 0) return () => false;
  const matcher = picomatch(patterns, { dot: true });
  return (relPath: string) => matcher(normalizeRelativePath(relPath));
}

function createHashHex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeWorkspaceId(value: string | undefined, rootPath: string): string {
  const raw = value?.trim() || path.basename(rootPath) || 'workspace';
  return raw.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64) || 'workspace';
}

function getCacheRoot(input: ExistingWorkspaceImportInput): string {
  return (
    input.cacheRoot ??
    process.env.HOLOSCRIPT_EXISTING_IMPORT_CACHE_DIR ??
    path.join(os.homedir(), '.holoscript', 'workspaces', 'existing-imports')
  );
}

function readJsonFile<T>(filePath: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExistingWorkspaceImportError(`Invalid workspace import manifest: ${msg}`, 400);
  }
}

function findProfile(
  rootPath: string,
  manifestPath: string | undefined
): { profile: ExistingWorkspaceImportProfile; profilePath: string | null } {
  if (manifestPath) {
    const absolute = path.resolve(rootPath, manifestPath);
    if (!isInsidePath(rootPath, absolute)) {
      throw new ExistingWorkspaceImportError(
        'manifestPath must stay inside the workspace root',
        400
      );
    }
    if (!fs.existsSync(absolute)) {
      throw new ExistingWorkspaceImportError('manifestPath does not exist', 404);
    }
    return {
      profile: readJsonFile<ExistingWorkspaceImportProfile>(absolute),
      profilePath: absolute,
    };
  }

  for (const relPath of DEFAULT_PROFILE_PATHS) {
    const absolute = path.join(rootPath, relPath);
    if (fs.existsSync(absolute)) {
      return {
        profile: readJsonFile<ExistingWorkspaceImportProfile>(absolute),
        profilePath: absolute,
      };
    }
  }

  return { profile: {}, profilePath: null };
}

function mergeProfile(profile: ExistingWorkspaceImportProfile): ExistingWorkspaceImportProfile {
  return {
    version: profile.version ?? 1,
    profile: profile.profile ?? 'ai-ecosystem',
    workspaceId: profile.workspaceId,
    include: [...DEFAULT_INCLUDE_PATTERNS, ...(profile.include ?? [])],
    exclude: [...DEFAULT_EXCLUDE_PATTERNS, ...(profile.exclude ?? [])],
    categories: profile.categories ?? {},
    maxFiles: profile.maxFiles ?? 5000,
    maxFileBytes: profile.maxFileBytes ?? 2_000_000,
  };
}

function classifyArtifact(
  relPath: string,
  profile: ExistingWorkspaceImportProfile
): ExistingWorkspaceArtifactCategory | null {
  const normalized = normalizeRelativePath(relPath);
  const categoryPatterns = Object.fromEntries(
    Object.entries(DEFAULT_CATEGORY_PATTERNS).map(([category, patterns]) => [
      category,
      [...patterns, ...(profile.categories?.[category as ExistingWorkspaceArtifactCategory] ?? [])],
    ])
  ) as Record<ExistingWorkspaceArtifactCategory, string[]>;

  for (const category of [
    'tasks',
    'knowledge',
    'agents',
    'research',
    'ecosystem',
    'docs',
  ] as const) {
    if (compileMatcher(categoryPatterns[category])(normalized)) return category;
  }

  return null;
}

function emptyCounts(): Record<ExistingWorkspaceArtifactCategory, number> {
  return {
    knowledge: 0,
    agents: 0,
    ecosystem: 0,
    docs: 0,
    research: 0,
    tasks: 0,
  };
}

function execGit(rootPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', rootPath, ...args], { timeout: 10_000 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(String(stdout ?? '').trim());
    });
  });
}

async function readGitState(
  rootPath: string
): Promise<{ commitSha: string | null; dirty: boolean }> {
  try {
    const commitSha = await execGit(rootPath, ['rev-parse', 'HEAD']);
    const status = await execGit(rootPath, ['status', '--porcelain']);
    return { commitSha: commitSha || null, dirty: status.length > 0 };
  } catch {
    return { commitSha: null, dirty: true };
  }
}

function resolveCachePath(
  input: ExistingWorkspaceImportInput,
  workspaceId: string,
  commitSha: string | null
): string | null {
  if (!commitSha) return null;
  const cacheRoot = path.resolve(getCacheRoot(input));
  return path.join(cacheRoot, workspaceId, `${commitSha}.json`);
}

function readCache(cachePath: string, profileDigest: string): ExistingWorkspaceImportResult | null {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(
      fs.readFileSync(cachePath, 'utf-8')
    ) as ExistingWorkspaceImportResult & {
      profileDigest?: string;
    };
    if (cached.profileDigest !== profileDigest) return null;
    const { profileDigest: _profileDigest, ...result } = cached;
    return { ...result, cacheStatus: 'hit' };
  } catch {
    return null;
  }
}

function writeCache(
  cachePath: string,
  result: ExistingWorkspaceImportResult,
  profileDigest: string
): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ ...result, profileDigest }, null, 2), 'utf-8');
}

function scanArtifacts(rootPath: string, profile: ExistingWorkspaceImportProfile) {
  const include = compileMatcher(profile.include ?? []);
  const exclude = compileMatcher(profile.exclude ?? []);
  const artifacts: ExistingWorkspaceArtifact[] = [];
  const counts = emptyCounts();
  const maxFiles = profile.maxFiles ?? 5000;
  let limitReached = false;
  const stats = {
    scannedFiles: 0,
    includedFiles: 0,
    excludedFiles: 0,
    skippedFiles: 0,
    skippedLargeFiles: 0,
  };

  function excluded(relPath: string): boolean {
    const normalized = normalizeRelativePath(relPath);
    return exclude(normalized) || exclude(`${normalized}/`);
  }

  function walk(absDir: string, relDir: string): void {
    if (limitReached) return;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (limitReached) return;
      const relPath = normalizeRelativePath(path.join(relDir, entry.name));
      const absPath = path.join(absDir, entry.name);

      if (excluded(relPath)) {
        stats.excludedFiles += 1;
        continue;
      }

      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }

      if (!entry.isFile()) continue;
      stats.scannedFiles += 1;

      if (!include(relPath)) {
        stats.skippedFiles += 1;
        continue;
      }

      const category = classifyArtifact(relPath, profile);
      if (!category) {
        stats.skippedFiles += 1;
        continue;
      }

      const stat = fs.statSync(absPath);
      if (stat.size > (profile.maxFileBytes ?? 2_000_000)) {
        stats.skippedLargeFiles += 1;
        continue;
      }

      const content = fs.readFileSync(absPath);
      artifacts.push({
        path: relPath,
        category,
        sizeBytes: stat.size,
        sha256: createHashHex(content),
        modifiedAt: stat.mtime.toISOString(),
      });
      counts[category] += 1;
      stats.includedFiles += 1;

      if (artifacts.length >= maxFiles) {
        limitReached = true;
        return;
      }
    }
  }

  walk(rootPath, '');
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  return { artifacts, counts, stats };
}

export async function importExistingWorkspace(
  input: ExistingWorkspaceImportInput
): Promise<ExistingWorkspaceImportResult> {
  const rootPath = path.resolve(input.rootPath);
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new ExistingWorkspaceImportError('rootPath must be an existing directory', 400);
  }

  const { profile: rawProfile, profilePath } = findProfile(rootPath, input.manifestPath);
  const profile = mergeProfile(rawProfile);
  const workspaceId = safeWorkspaceId(input.workspaceId ?? profile.workspaceId, rootPath);
  const profileDigest = createHashHex(JSON.stringify(profile));
  const { commitSha, dirty } = await readGitState(rootPath);
  const idempotencyKey = createHashHex(
    `${workspaceId}:${commitSha ?? 'no-git'}:${profileDigest}`
  ).slice(0, 16);
  const cachePath = resolveCachePath(input, workspaceId, commitSha);
  const persist = input.persist !== false;

  if (!persist) {
    const scanned = scanArtifacts(rootPath, profile);
    return {
      workspaceId,
      rootPath,
      profile,
      profilePath,
      commitSha,
      dirty,
      idempotencyKey,
      cacheStatus: 'disabled',
      cachePath: null,
      ...scanned,
      generatedAt: new Date().toISOString(),
    };
  }

  if (!commitSha || !cachePath) {
    const scanned = scanArtifacts(rootPath, profile);
    return {
      workspaceId,
      rootPath,
      profile,
      profilePath,
      commitSha,
      dirty,
      idempotencyKey,
      cacheStatus: 'bypass-no-git',
      cachePath: null,
      ...scanned,
      generatedAt: new Date().toISOString(),
    };
  }

  if (!dirty) {
    const cached = readCache(cachePath, profileDigest);
    if (cached) return cached;
  }

  const scanned = scanArtifacts(rootPath, profile);
  const result: ExistingWorkspaceImportResult = {
    workspaceId,
    rootPath,
    profile,
    profilePath,
    commitSha,
    dirty,
    idempotencyKey,
    cacheStatus: dirty ? 'bypass-dirty' : 'miss',
    cachePath,
    ...scanned,
    generatedAt: new Date().toISOString(),
  };

  if (!dirty) writeCache(cachePath, result, profileDigest);
  return result;
}
