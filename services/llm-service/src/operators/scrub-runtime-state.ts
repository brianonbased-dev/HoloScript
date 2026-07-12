import { promises as fs } from 'fs';
import { createConnection } from 'net';
import { dirname, join, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseServicePort } from '../services/RuntimeConfig.js';
import { acquireRuntimeStateLease } from '../services/RuntimeStateLease.js';

// Commit in fail-secure order. If a later replacement fails, no old bearer
// session remains valid against a cleared user store.
const STATE_CLASSES = [
  {
    className: 'auth_session_store',
    relativePath: join('auth', 'sessions.json'),
    emptyState: { version: 1, sessions: {} },
  },
  {
    className: 'auth_user_store',
    relativePath: join('auth', 'users.json'),
    emptyState: { version: 1, users: {} },
  },
  {
    className: 'rate_limit_store',
    relativePath: join('rate-limits', 'windows.json'),
    emptyState: { version: 1, windows: {} },
  },
] as const;

export interface ScrubRuntimeStateOptions {
  runtimeRoot?: string;
  port?: number;
  dryRun?: boolean;
  now?: () => Date;
  probePort?: (port: number) => Promise<boolean>;
  /** Test seam for proving fail-secure behavior after a mid-commit failure. */
  renameFile?: (source: string, destination: string) => Promise<void>;
  syncCommit?: (targetPath: string) => Promise<void>;
}

export interface ScrubRuntimeStateReceipt {
  schema: 'holoscript.llm-runtime-scrub.v1';
  mode: 'dry-run' | 'scrub';
  stateClassCount: number;
  existingPathCount: number;
  lockPathCount: number;
  stateClasses: string[];
  configuredPort: number;
  serviceListenerDetected: false;
  completedAt: string;
}

export class RuntimeScrubError extends Error {
  constructor(
    public readonly code: string,
    public readonly committedStateClassCount = 0
  ) {
    super(code);
  }
}

export function canonicalRuntimeRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.holoscript-llm');
}

export async function scrubRuntimeState(
  options: ScrubRuntimeStateOptions = {}
): Promise<ScrubRuntimeStateReceipt> {
  const runtimeRoot = resolve(options.runtimeRoot ?? canonicalRuntimeRoot());
  const port = parseServicePort(
    options.port === undefined ? process.env.PORT : String(options.port)
  );
  const probePort = options.probePort ?? isLocalPortOpen;
  const renameFile = options.renameFile ?? fs.rename;
  const syncCommit = options.syncCommit ?? syncCommittedPath;
  const now = options.now ?? (() => new Date());

  await assertRuntimeRoot(runtimeRoot);

  const targets = STATE_CLASSES.map((stateClass) => ({
    ...stateClass,
    targetPath: resolve(runtimeRoot, stateClass.relativePath),
  }));
  for (const target of targets) assertWithinRoot(runtimeRoot, target.targetPath);

  let runtimeLease;
  try {
    runtimeLease = acquireRuntimeStateLease(runtimeRoot, 'operator');
  } catch {
    throw new RuntimeScrubError('runtime_lease_unavailable');
  }

  const stagedPaths = new Set<string>();
  try {
    // Revalidate after acquiring the shared service/operator lease and validate
    // the complete target set before staging or committing any replacement.
    await assertRuntimeRoot(runtimeRoot);
    for (const target of targets) await validateTarget(runtimeRoot, target.targetPath);

    const lockPathCount = await countExisting(targets.map((target) => `${target.targetPath}.lock`));
    if (lockPathCount > 0) throw new RuntimeScrubError('state_store_locked');

    let listenerDetected: boolean;
    try {
      listenerDetected = await probePort(port);
    } catch (error) {
      if (error instanceof RuntimeScrubError) throw error;
      throw new RuntimeScrubError('service_probe_failed');
    }
    if (listenerDetected) throw new RuntimeScrubError('service_listener_detected');

    const existingPathCount = await countExisting(targets.map((target) => target.targetPath));

    if (!options.dryRun) {
      const staged = [];
      for (const target of targets) {
        await validateTarget(runtimeRoot, target.targetPath);
        const stagedPath = await stageReplacementJson(target.targetPath, target.emptyState);
        staged.push({ ...target, stagedPath });
        stagedPaths.add(stagedPath);
      }

      let committedStateClassCount = 0;
      for (const target of staged) {
        try {
          await validateTarget(runtimeRoot, target.targetPath);
          await renameFile(target.stagedPath, target.targetPath);
          stagedPaths.delete(target.stagedPath);
          committedStateClassCount += 1;
          await syncCommit(target.targetPath);
        } catch (error) {
          const code = error instanceof RuntimeScrubError ? error.code : 'state_commit_failed';
          throw new RuntimeScrubError(code, committedStateClassCount);
        }
      }

      try {
        await verifyScrubbedTargets(targets);
      } catch {
        throw new RuntimeScrubError('postcondition_failed', targets.length);
      }
    }

    return {
      schema: 'holoscript.llm-runtime-scrub.v1',
      mode: options.dryRun ? 'dry-run' : 'scrub',
      stateClassCount: targets.length,
      existingPathCount,
      lockPathCount,
      stateClasses: targets.map((target) => target.className),
      configuredPort: port,
      serviceListenerDetected: false,
      completedAt: now().toISOString(),
    };
  } finally {
    await Promise.all([...stagedPaths].map((path) => fs.unlink(path).catch(() => undefined)));
    runtimeLease.release();
  }
}

async function syncCommittedPath(targetPath: string): Promise<void> {
  const fileHandle = await fs.open(targetPath, 'r+');
  try {
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }

  // POSIX requires the containing directory to be synced for rename
  // durability. On Windows, FlushFileBuffers on the renamed file is the
  // portable Node surface available for the same persistence boundary.
  if (process.platform !== 'win32') {
    const directoryHandle = await fs.open(dirname(targetPath), 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  }
}

async function verifyScrubbedTargets(
  targets: ReadonlyArray<{ targetPath: string; emptyState: object }>
): Promise<void> {
  for (const target of targets) {
    const state = JSON.parse(await fs.readFile(target.targetPath, 'utf8')) as object;
    if (JSON.stringify(state) !== JSON.stringify(target.emptyState)) {
      throw new RuntimeScrubError('postcondition_failed');
    }
  }
}

async function stageReplacementJson(targetPath: string, value: object): Promise<string> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.scrub.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const metadata = await readTargetMetadata(targetPath);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let staged = false;

  try {
    handle = await fs.open(tempPath, 'wx', metadata?.mode ?? 0o600);
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (metadata) {
      await fs.chmod(tempPath, metadata.mode);
      if (process.platform !== 'win32') await fs.chown(tempPath, metadata.uid, metadata.gid);
    }
    staged = true;
    return tempPath;
  } finally {
    await handle?.close().catch(() => undefined);
    if (!staged) await fs.unlink(tempPath).catch(() => undefined);
  }
}

async function readTargetMetadata(
  targetPath: string
): Promise<{ mode: number; uid: number; gid: number } | undefined> {
  try {
    const stat = await fs.lstat(targetPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new RuntimeScrubError('state_path_invalid');
    return { mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function countExisting(paths: string[]): Promise<number> {
  let count = 0;
  for (const path of paths) {
    try {
      await fs.lstat(path);
      count += 1;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return count;
}

async function assertRuntimeRoot(path: string): Promise<void> {
  try {
    const stat = await fs.lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new RuntimeScrubError('runtime_root_invalid');
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') throw new RuntimeScrubError('runtime_root_missing');
    throw error;
  }
}

async function validateTarget(runtimeRoot: string, targetPath: string): Promise<void> {
  await assertParentChain(runtimeRoot, dirname(targetPath));
  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new RuntimeScrubError('state_path_invalid');
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function assertParentChain(runtimeRoot: string, parentPath: string): Promise<void> {
  const relative = parentPath.slice(runtimeRoot.length).split(sep).filter(Boolean);
  let current = runtimeRoot;
  for (const part of relative) {
    current = join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new RuntimeScrubError('state_path_invalid');
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') throw new RuntimeScrubError('state_path_invalid');
      throw error;
    }
  }
}

function assertWithinRoot(runtimeRoot: string, targetPath: string): void {
  const prefix = runtimeRoot.endsWith(sep) ? runtimeRoot : `${runtimeRoot}${sep}`;
  if (!targetPath.startsWith(prefix)) throw new RuntimeScrubError('state_path_invalid');
}

async function isLocalPortOpen(port: number): Promise<boolean> {
  const results = await Promise.all([probeAddress('127.0.0.1', port), probeAddress('::1', port)]);
  return results.some(Boolean);
}

function probeAddress(host: string, port: number): Promise<boolean> {
  return new Promise((resolveProbe, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (error: Error | undefined, value = false) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolveProbe(value);
    };
    socket.setTimeout(750);
    socket.once('connect', () => finish(undefined, true));
    socket.once('timeout', () => finish(new RuntimeScrubError('service_probe_failed')));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (
        ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL'].includes(error.code ?? '')
      ) {
        finish(undefined, false);
      } else {
        finish(new RuntimeScrubError('service_probe_failed'));
      }
    });
  });
}

function parseCli(argv: string[]): { dryRun: boolean; port?: number } {
  let dryRun = false;
  let port: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--port') {
      const value = argv[index + 1];
      if (!value) throw new RuntimeScrubError('invalid_arguments');
      try {
        port = parseServicePort(value);
      } catch {
        throw new RuntimeScrubError('invalid_arguments');
      }
      index += 1;
      continue;
    }
    throw new RuntimeScrubError('invalid_arguments');
  }
  return { dryRun, port };
}

export function formatScrubFailure(error: unknown, now = new Date()): string {
  const scrubError = error instanceof RuntimeScrubError ? error : undefined;
  return JSON.stringify({
    schema: 'holoscript.llm-runtime-scrub.v1',
    outcome: 'failure',
    errorCode: scrubError?.code ?? 'scrub_failed',
    committedStateClassCount: scrubError?.committedStateClassCount ?? 0,
    completedAt: now.toISOString(),
  });
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  const receipt = await scrubRuntimeState(args);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${formatScrubFailure(error)}\n`, () => process.exit(1));
  });
}
