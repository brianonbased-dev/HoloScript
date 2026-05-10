import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  importExistingWorkspace,
  type ExistingWorkspaceArtifact,
  type ExistingWorkspaceImportResult,
} from './existingWorkspaceImporter';

export type FounderKnowledgeType = 'wisdom' | 'pattern' | 'gotcha';

export interface FounderKnowledgeEntry {
  id: string;
  originalId: string;
  type: FounderKnowledgeType;
  content: string;
  domain: string;
  tags: string[];
  confidence: number;
  workspace_id: string;
  workspaceId: string;
  metadata: {
    source: 'founder-workspace-backfill';
    path: string;
    commitSha: string | null;
    artifactSha256: string;
    importedAt: string;
    provenance: FounderProvenance;
  };
}

export interface FounderKnowledgeSyncPayload {
  workspace_id: string;
  workspaceId: string;
  entries: FounderKnowledgeEntry[];
}

export interface FounderProvenance {
  workspaceId: string;
  path: string;
  commitSha: string | null;
  artifactSha256: string;
}

export interface FounderBoardState {
  authoritativeSource: 'holomesh-live-board';
  liveEndpoint: string;
  teamId: string;
  snapshotPath: string | null;
  snapshotSha256: string | null;
  snapshotTaskCount: number | null;
  snapshotIsAuthoritative: false;
  note: string;
  provenance: FounderProvenance | null;
}

export interface FounderLinkedRepo {
  id: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  sourcePaths: string[];
  absorbProject: {
    name: string;
    source_type: 'github';
    source_url: string;
    workspace_id: string;
    metadata: {
      source: 'founder-workspace-backfill';
      sourcePaths: string[];
      commitSha: string | null;
    };
  };
}

export interface FounderResearchState {
  id: string;
  title: string;
  path: string;
  founderOnly: true;
  visibility: 'founder-only';
  signals: string[];
  contentPreview: string;
  provenance: FounderProvenance;
}

export interface FounderWorkspaceBackfillResult {
  workspaceId: string;
  rootPath: string;
  commitSha: string | null;
  dirty: boolean;
  generatedAt: string;
  importIdempotencyKey: string;
  importStats: ExistingWorkspaceImportResult['stats'];
  artifactCounts: ExistingWorkspaceImportResult['counts'];
  knowledgeSyncPayload: FounderKnowledgeSyncPayload;
  boardState: FounderBoardState;
  linkedRepos: FounderLinkedRepo[];
  paperResearchState: FounderResearchState[];
}

export interface FounderWorkspaceBackfillInput {
  rootPath: string;
  workspaceId?: string;
  teamId?: string;
  manifestPath?: string;
  cacheRoot?: string;
  importPersist?: boolean;
  importResult?: ExistingWorkspaceImportResult;
  maxKnowledgeEntries?: number;
  maxResearchItems?: number;
  maxContentBytes?: number;
}

export interface PersistFounderBackfillInput {
  workspaceDir: string;
  backfill: FounderWorkspaceBackfillResult;
}

const DEFAULT_WORKSPACE_ID = 'ai-ecosystem';
const DEFAULT_TEAM_ID = 'team_1777834718247_unr35n';
const DEFAULT_MAX_KNOWLEDGE_ENTRIES = 500;
const DEFAULT_MAX_RESEARCH_ITEMS = 100;
const DEFAULT_MAX_CONTENT_BYTES = 80_000;
const KNOWLEDGE_CONTENT_LIMIT = 8_000;
const RESEARCH_PREVIEW_LIMIT = 700;

const KNOWLEDGE_TYPE_BY_PREFIX: Record<string, FounderKnowledgeType> = {
  W: 'wisdom',
  P: 'pattern',
  G: 'gotcha',
};

const SECRET_REDACTIONS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_OPENAI_TOKEN]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '[REDACTED_SLACK_TOKEN]'],
  [
    /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\b\s*[:=]\s*["']?[^"'\s,;}]+/gi,
    '$1=[REDACTED_SECRET]',
  ],
];

const RESEARCH_SIGNAL_PATTERNS: Array<[string, RegExp]> = [
  ['lotus', /\blotus\b/i],
  ['paper-program', /\bpaper(?:\s|-)?program\b/i],
  ['tvcg', /\btvcg\b/i],
  ['uist', /\buist\b/i],
  ['neurips', /\bneurips\b/i],
  ['aamas', /\baamas\b/i],
  ['chi', /\bchi\b/i],
  ['cael', /\bcael\b/i],
  ['simulation-contract', /\bsimulation\s*contract\b/i],
  ['review-state', /\breviewer|review\s*response|held|submission\b/i],
];

function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\/+/, '');
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stableId(parts: string[], length = 16): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, length);
}

function safeReadText(rootPath: string, relPath: string, maxBytes: number): string | null {
  const absolute = path.resolve(rootPath, relPath);
  if (!isInsidePath(rootPath, absolute)) return null;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  const fd = fs.openSync(absolute, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return buffer.toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

function redactSecrets(content: string): string {
  return SECRET_REDACTIONS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    content
  );
}

function truncateContent(content: string, limit: number): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n\n[truncated by founder workspace backfill]`;
}

function provenanceFor(
  workspaceId: string,
  artifact: ExistingWorkspaceArtifact,
  commitSha: string | null
): FounderProvenance {
  return {
    workspaceId,
    path: normalizeRelPath(artifact.path),
    commitSha,
    artifactSha256: artifact.sha256,
  };
}

function inferKnowledgeId(relPath: string, content: string): string | null {
  const frontmatterId = content.match(/^id:\s*["']?([A-Za-z0-9_.-]+)["']?\s*$/m)?.[1];
  if (frontmatterId && /^[WPG][._-]/i.test(frontmatterId)) return frontmatterId;

  const normalized = normalizeRelPath(relPath);
  const basename = path.posix.basename(normalized).replace(/\.(md|mdx|json|jsonl)$/i, '');
  if (/^[WPG][._-]/i.test(basename)) return basename.replace(/^([WPG])_/i, '$1.');

  const pathMatch = normalized.match(/(^|\/)([WPG][._-][A-Za-z0-9_.-]+)/i)?.[2];
  return pathMatch ? pathMatch.replace(/^([WPG])_/i, '$1.') : null;
}

function inferKnowledgeType(id: string): FounderKnowledgeType | null {
  const prefix = id.trim().charAt(0).toUpperCase();
  return KNOWLEDGE_TYPE_BY_PREFIX[prefix] ?? null;
}

function buildKnowledgeEntries(
  imported: ExistingWorkspaceImportResult,
  generatedAt: string,
  maxEntries: number,
  maxContentBytes: number
): FounderKnowledgeEntry[] {
  const entries: FounderKnowledgeEntry[] = [];
  const usedIds = new Set<string>();

  for (const artifact of imported.artifacts) {
    if (entries.length >= maxEntries) break;
    if (artifact.category !== 'knowledge') continue;

    const raw = safeReadText(imported.rootPath, artifact.path, maxContentBytes);
    if (!raw) continue;

    const originalId = inferKnowledgeId(artifact.path, raw);
    if (!originalId) continue;
    const type = inferKnowledgeType(originalId);
    if (!type) continue;

    let id = originalId;
    if (usedIds.has(id)) id = `${originalId}-${stableId([artifact.path, artifact.sha256], 8)}`;
    usedIds.add(id);

    const relPath = normalizeRelPath(artifact.path);
    const redacted = truncateContent(redactSecrets(raw), KNOWLEDGE_CONTENT_LIMIT);
    const provenance = provenanceFor(imported.workspaceId, artifact, imported.commitSha);

    entries.push({
      id,
      originalId,
      type,
      content: redacted,
      domain: imported.workspaceId,
      tags: [
        'founder-backfill',
        `workspace:${imported.workspaceId}`,
        `path:${relPath}`,
        `commit:${imported.commitSha ?? 'uncommitted'}`,
      ],
      confidence: 0.82,
      workspace_id: imported.workspaceId,
      workspaceId: imported.workspaceId,
      metadata: {
        source: 'founder-workspace-backfill',
        path: relPath,
        commitSha: imported.commitSha,
        artifactSha256: artifact.sha256,
        importedAt: generatedAt,
        provenance,
      },
    });
  }

  return entries;
}

function parseTaskCount(content: string | null): number | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const tasks = parsed['tasks'];
    const board = parsed['board'];
    if (Array.isArray(tasks)) return tasks.length;
    if (typeof board === 'object' && board !== null) {
      const boardRecord = board as Record<string, unknown>;
      const open = Array.isArray(boardRecord['open']) ? boardRecord['open'].length : 0;
      const claimed = Array.isArray(boardRecord['claimed']) ? boardRecord['claimed'].length : 0;
      const done = Array.isArray(boardRecord['done']) ? boardRecord['done'].length : 0;
      return open + claimed + done;
    }
  } catch {
    return null;
  }
  return null;
}

function buildBoardState(
  imported: ExistingWorkspaceImportResult,
  teamId: string,
  maxContentBytes: number
): FounderBoardState {
  const boardArtifact =
    imported.artifacts.find((artifact) => normalizeRelPath(artifact.path) === 'board.json') ??
    imported.artifacts.find((artifact) =>
      /(^|\/)board\.json$/i.test(normalizeRelPath(artifact.path))
    );
  const content = boardArtifact
    ? safeReadText(imported.rootPath, boardArtifact.path, maxContentBytes)
    : null;

  return {
    authoritativeSource: 'holomesh-live-board',
    liveEndpoint: `/api/holomesh/team/${teamId}/board`,
    teamId,
    snapshotPath: boardArtifact ? normalizeRelPath(boardArtifact.path) : null,
    snapshotSha256: boardArtifact?.sha256 ?? null,
    snapshotTaskCount: parseTaskCount(content),
    snapshotIsAuthoritative: false,
    note: 'board.json is preserved as a founder workspace snapshot; live HoloMesh board state is authoritative.',
    provenance: boardArtifact
      ? provenanceFor(imported.workspaceId, boardArtifact, imported.commitSha)
      : null,
  };
}

function normalizeGitHubRepo(owner: string, repo: string): { owner: string; repo: string } | null {
  const normalizedOwner = owner.trim();
  const normalizedRepo = repo
    .trim()
    .replace(/\.git$/i, '')
    .replace(/[),.;:'"]+$/g, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(normalizedOwner)) {
    return null;
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(normalizedRepo)) return null;
  if (normalizedRepo === '.' || normalizedRepo === '..') return null;
  return { owner: normalizedOwner, repo: normalizedRepo };
}

function collectGitHubReposFromText(content: string): Array<{ owner: string; repo: string }> {
  const repos: Array<{ owner: string; repo: string }> = [];
  const httpsPattern =
    /https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:\.git)?(?:[/?#][^\s)\]}>"']*)?/g;
  const sshPattern =
    /git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?=[\s)\]}>"']|$)/g;

  for (const pattern of [httpsPattern, sshPattern]) {
    let match = pattern.exec(content);
    while (match) {
      const normalized = normalizeGitHubRepo(match[1], match[2]);
      if (normalized) repos.push(normalized);
      match = pattern.exec(content);
    }
  }

  return repos;
}

function readGitRemote(rootPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', rootPath, 'config', '--get', 'remote.origin.url'],
      { timeout: 10_000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const value = String(stdout ?? '').trim();
        resolve(value || null);
      }
    );
  });
}

async function buildLinkedRepos(
  imported: ExistingWorkspaceImportResult,
  maxContentBytes: number
): Promise<FounderLinkedRepo[]> {
  const byCloneUrl = new Map<string, { owner: string; repo: string; sourcePaths: Set<string> }>();

  function addRepo(owner: string, repo: string, sourcePath: string): void {
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    const existing = byCloneUrl.get(cloneUrl);
    if (existing) {
      existing.sourcePaths.add(sourcePath);
      return;
    }
    byCloneUrl.set(cloneUrl, { owner, repo, sourcePaths: new Set([sourcePath]) });
  }

  const remote = await readGitRemote(imported.rootPath);
  if (remote) {
    for (const repoRef of collectGitHubReposFromText(remote)) {
      addRepo(repoRef.owner, repoRef.repo, 'git:remote.origin.url');
    }
  }

  for (const artifact of imported.artifacts) {
    if (!['agents', 'docs', 'ecosystem', 'research', 'tasks'].includes(artifact.category)) continue;
    const raw = safeReadText(imported.rootPath, artifact.path, maxContentBytes);
    if (!raw) continue;
    for (const repoRef of collectGitHubReposFromText(raw)) {
      addRepo(repoRef.owner, repoRef.repo, normalizeRelPath(artifact.path));
    }
  }

  return Array.from(byCloneUrl.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cloneUrl, repoRef]) => {
      const sourcePaths = Array.from(repoRef.sourcePaths).sort();
      return {
        id: stableId([cloneUrl, imported.workspaceId], 12),
        owner: repoRef.owner,
        repo: repoRef.repo,
        cloneUrl,
        sourcePaths,
        absorbProject: {
          name: `${repoRef.owner}/${repoRef.repo}`,
          source_type: 'github',
          source_url: cloneUrl,
          workspace_id: imported.workspaceId,
          metadata: {
            source: 'founder-workspace-backfill',
            sourcePaths,
            commitSha: imported.commitSha,
          },
        },
      };
    });
}

function titleFromResearch(relPath: string, content: string): string {
  const heading = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 160);
  return path.posix
    .basename(normalizeRelPath(relPath))
    .replace(/\.(md|mdx|json|jsonl)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 160);
}

function findResearchSignals(relPath: string, content: string): string[] {
  const haystack = `${relPath}\n${content}`;
  return RESEARCH_SIGNAL_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(
    ([signal]) => signal
  );
}

function buildPaperResearchState(
  imported: ExistingWorkspaceImportResult,
  maxItems: number,
  maxContentBytes: number
): FounderResearchState[] {
  const states: FounderResearchState[] = [];

  for (const artifact of imported.artifacts) {
    if (states.length >= maxItems) break;
    if (artifact.category !== 'research') continue;
    const raw = safeReadText(imported.rootPath, artifact.path, maxContentBytes);
    if (!raw) continue;

    const relPath = normalizeRelPath(artifact.path);
    const signals = findResearchSignals(relPath, raw);
    if (signals.length === 0) continue;

    const redacted = redactSecrets(raw).replace(/\s+/g, ' ').trim();
    states.push({
      id: stableId([relPath, artifact.sha256, imported.workspaceId], 12),
      title: titleFromResearch(relPath, raw),
      path: relPath,
      founderOnly: true,
      visibility: 'founder-only',
      signals,
      contentPreview: truncateContent(redacted, RESEARCH_PREVIEW_LIMIT),
      provenance: provenanceFor(imported.workspaceId, artifact, imported.commitSha),
    });
  }

  return states;
}

export async function buildFounderWorkspaceBackfill(
  input: FounderWorkspaceBackfillInput
): Promise<FounderWorkspaceBackfillResult> {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const imported =
    input.importResult ??
    (await importExistingWorkspace({
      rootPath: input.rootPath,
      workspaceId,
      manifestPath: input.manifestPath,
      cacheRoot: input.cacheRoot,
      persist: input.importPersist,
    }));

  const generatedAt = new Date().toISOString();
  const maxContentBytes = input.maxContentBytes ?? DEFAULT_MAX_CONTENT_BYTES;
  const knowledgeEntries = buildKnowledgeEntries(
    imported,
    generatedAt,
    input.maxKnowledgeEntries ?? DEFAULT_MAX_KNOWLEDGE_ENTRIES,
    maxContentBytes
  );

  return {
    workspaceId: imported.workspaceId,
    rootPath: imported.rootPath,
    commitSha: imported.commitSha,
    dirty: imported.dirty,
    generatedAt,
    importIdempotencyKey: imported.idempotencyKey,
    importStats: imported.stats,
    artifactCounts: imported.counts,
    knowledgeSyncPayload: {
      workspace_id: imported.workspaceId,
      workspaceId: imported.workspaceId,
      entries: knowledgeEntries,
    },
    boardState: buildBoardState(
      imported,
      input.teamId ?? process.env.HOLOMESH_TEAM_ID ?? DEFAULT_TEAM_ID,
      maxContentBytes
    ),
    linkedRepos: await buildLinkedRepos(imported, maxContentBytes),
    paperResearchState: buildPaperResearchState(
      imported,
      input.maxResearchItems ?? DEFAULT_MAX_RESEARCH_ITEMS,
      maxContentBytes
    ),
  };
}

export function persistFounderWorkspaceBackfill(input: PersistFounderBackfillInput): string {
  const manifestPath = path.join(input.workspaceDir, 'founder-backfill.json');
  fs.mkdirSync(input.workspaceDir, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        backfill: input.backfill,
      },
      null,
      2
    ),
    'utf-8'
  );
  return manifestPath;
}
