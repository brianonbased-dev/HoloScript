import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type CodebaseCacheLayout = 'workspace-v1' | 'flat';

export interface CodebaseCachePaths {
  layout: CodebaseCacheLayout;
  baseDir: string;
  workspaceRoot: string;
  workspaceId: string;
  directory: string;
  generationsDirectory: string;
  generationManifestFile: string;
  writerLeaseFile: string;
  writerReceiptsDirectory: string;
  graphFile: string;
  embeddingsFile: string;
  legacyGraphFile: string;
  legacyEmbeddingsFile: string;
}

export interface ResolveCodebaseCachePathsOptions {
  baseDir?: string;
  layout?: CodebaseCacheLayout;
  env?: NodeJS.ProcessEnv;
}

/**
 * One physical tree must have exactly one workspace identity.
 *
 * `path.resolve` collapses `..` and relative segments but does NOT follow
 * symlinks or Windows junctions, so the same directory reached by two spellings
 * used to hash to two different workspace ids. That is not theoretical: on this
 * machine `C:\Users\josep\.ai-ecosystem` is a symlink to `C:\holo-dev\ai-ecosystem`,
 * and absorbing via one spelling wrote a graph the query side -- resolving the
 * other -- could not see. The absorb reported success and the query answered
 * "no codebase graph loaded" or served a month-old cache, which is the single
 * reason HoloAbsorb reads as broken rather than merely stale.
 *
 * realpath is therefore load-bearing, not tidiness. It is best-effort: a path
 * that does not exist yet (planned roots, fixtures, tests) keeps its lexical
 * form so callers still get a stable, derivable id instead of a throw.
 */
function normalizeWorkspaceRoot(rootDir: string): string {
  const resolved = path.normalize(path.resolve(rootDir)).replace(/[\\/]+$/, '');
  let canonical = resolved;
  try {
    // realpathSync.native resolves junctions as well as symlinks on Windows.
    canonical = path.normalize(fs.realpathSync.native(resolved)).replace(/[\\/]+$/, '');
  } catch {
    // Unreadable or not yet created: keep the lexical form rather than failing
    // to produce an id at all.
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function normalizeRootSet(rootDirs: string[]): string[] {
  return Array.from(
    new Set(rootDirs.filter(Boolean).map((rootDir) => normalizeWorkspaceRoot(rootDir)))
  ).sort((left, right) => left.localeCompare(right));
}

export function codebaseRootSetId(rootDirs: string[]): string {
  return createHash('sha256').update(normalizeRootSet(rootDirs).join('\n')).digest('hex');
}

function workspaceSlug(rootDir: string): string {
  const basename = path.basename(rootDir).toLowerCase();
  const slug = basename.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (slug || 'workspace').slice(0, 48);
}

function resolveLayout(env: NodeJS.ProcessEnv): CodebaseCacheLayout {
  return env.HOLOSCRIPT_CACHE_LAYOUT?.trim().toLowerCase() === 'flat' ? 'flat' : 'workspace-v1';
}

/**
 * Resolve the owned cache lane for one physical workspace.
 *
 * The workspace root is deliberately part of the cache identity: sibling Git
 * worktrees may have different dirty state and must never replace each other's
 * graph or embedding index. Fleet-portable immutable snapshots can be layered
 * above this local `latest` lane without reintroducing a shared mutable file.
 */
export function resolveCodebaseCachePaths(
  rootDir: string,
  options: ResolveCodebaseCachePathsOptions = {}
): CodebaseCachePaths {
  const env = options.env ?? process.env;
  const baseDir = path.resolve(
    options.baseDir ?? env.HOLOSCRIPT_CACHE_DIR ?? path.join(os.homedir(), '.holoscript')
  );
  const workspaceRoot = normalizeWorkspaceRoot(rootDir);
  const layout = options.layout ?? resolveLayout(env);
  const workspaceHash = createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
  const workspaceId = `${workspaceSlug(workspaceRoot)}-${workspaceHash}`;
  const directory = layout === 'flat' ? baseDir : path.join(baseDir, 'workspaces', workspaceId);

  return {
    layout,
    baseDir,
    workspaceRoot,
    workspaceId,
    directory,
    generationsDirectory: path.join(directory, 'generations'),
    generationManifestFile: path.join(directory, 'cache-generation.json'),
    writerLeaseFile: path.join(directory, 'absorb-writer.lease.json'),
    writerReceiptsDirectory: path.join(directory, 'writer-receipts'),
    graphFile: path.join(directory, 'graph-cache.json'),
    embeddingsFile: path.join(directory, 'embeddings-cache.bin'),
    legacyGraphFile: path.join(baseDir, 'graph-cache.json'),
    legacyEmbeddingsFile: path.join(baseDir, 'embeddings-cache.bin'),
  };
}

/**
 * Resolve a cache namespace for one exact normalized workspace root set.
 * Single-root callers keep the legacy layout. Multi-root callers always use a
 * workspace namespace—even when legacy flat layout is configured—so A+B and
 * A+C cannot overwrite one another through their shared primary root A.
 */
export function resolveCodebaseCachePathsForRoots(
  rootDirs: string[],
  options: ResolveCodebaseCachePathsOptions = {}
): CodebaseCachePaths {
  const normalizedRoots = normalizeRootSet(rootDirs);
  if (normalizedRoots.length === 0) {
    throw new Error('resolveCodebaseCachePathsForRoots requires at least one root');
  }
  if (normalizedRoots.length === 1) {
    return resolveCodebaseCachePaths(normalizedRoots[0], options);
  }
  const syntheticRoot = path.join(
    normalizedRoots[0],
    `.holoscript-root-set-${codebaseRootSetId(normalizedRoots).slice(0, 16)}`
  );
  return resolveCodebaseCachePaths(syntheticRoot, {
    ...options,
    layout: 'workspace-v1',
  });
}
