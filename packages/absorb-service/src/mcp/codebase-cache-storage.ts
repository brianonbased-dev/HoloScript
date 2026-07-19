import { createHash } from 'crypto';
import * as os from 'os';
import * as path from 'path';

export type CodebaseCacheLayout = 'workspace-v1' | 'flat';

export interface CodebaseCachePaths {
  layout: CodebaseCacheLayout;
  baseDir: string;
  workspaceRoot: string;
  workspaceId: string;
  directory: string;
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

function normalizeWorkspaceRoot(rootDir: string): string {
  const normalized = path.normalize(path.resolve(rootDir)).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
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
    graphFile: path.join(directory, 'graph-cache.json'),
    embeddingsFile: path.join(directory, 'embeddings-cache.bin'),
    legacyGraphFile: path.join(baseDir, 'graph-cache.json'),
    legacyEmbeddingsFile: path.join(baseDir, 'embeddings-cache.bin'),
  };
}
