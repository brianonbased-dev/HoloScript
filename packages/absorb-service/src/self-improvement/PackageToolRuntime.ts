/**
 * PackageToolRuntime
 *
 * Runs Absorb-owned Node package binaries without consulting an ambient shell,
 * PATH, npm, or npx. Keeping this logic shared prevents the daemon GRPO and
 * fleet self-improvement paths from acquiring different production behavior.
 *
 * @module self-improvement
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const requireFromModule = createRequire(import.meta.url);
const packageBinaryCache = new Map<string, string>();

const NODE_PACKAGE_SYMLINK_ARGS = [
  '--preserve-symlinks',
  '--preserve-symlinks-main',
] as const;

interface PackageManifest {
  bin?: string | Record<string, string>;
  main?: string;
  module?: string;
  exports?: unknown;
}

export interface PackageProcessFailure {
  message?: string;
  stdout?: string;
  stderr?: string;
}

export interface PackageToolExecutionOptions {
  packageName: string;
  binaryName: string;
  args: string[];
  cwd: string;
  timeout: number;
  maxBuffer?: number;
  /**
   * Preserve the package manager's logical symlink path while Node loads the
   * binary. Vitest needs this on deep Windows pnpm deployments so its private
   * `#imports` remain in the correct package scope.
   */
  preserveSymlinks?: boolean;
}

export interface PackageToolExecutionResult {
  stdout: string;
  stderr: string;
}

function resolvePackageManifest(packageName: string): string {
  for (const nodeModulesDir of requireFromModule.resolve.paths(packageName) ?? []) {
    const candidate = path.join(nodeModulesDir, packageName, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
  }

  return requireFromModule.resolve(`${packageName}/package.json`);
}

function resolveExportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;

  const conditions = value as Record<string, unknown>;
  return (
    resolveExportTarget(conditions.import) ??
    resolveExportTarget(conditions.default) ??
    resolveExportTarget(conditions.require)
  );
}

export function resolvePackageBinary(packageName: string, binaryName: string): string {
  const cacheKey = `${packageName}:${binaryName}`;
  const cached = packageBinaryCache.get(cacheKey);
  if (cached) return cached;

  // Keep the logical node_modules path. require.resolve() canonicalizes pnpm's
  // peer-suffixed virtual-store path, which can cross Node's package-scope
  // lookup limit on deep Windows deployments.
  const manifestPath = resolvePackageManifest(packageName);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest;
  const relativeBinary =
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binaryName];

  if (!relativeBinary) {
    throw new Error(`Package "${packageName}" does not expose binary "${binaryName}"`);
  }

  const resolved = path.resolve(path.dirname(manifestPath), relativeBinary);
  packageBinaryCache.set(cacheKey, resolved);
  return resolved;
}

export function resolvePackageEntry(packageName: string): string {
  const manifestPath = resolvePackageManifest(packageName);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest;
  const packageExport =
    manifest.exports && typeof manifest.exports === 'object'
      ? (manifest.exports as Record<string, unknown>)['.']
      : manifest.exports;
  const relativeEntry = resolveExportTarget(packageExport) ?? manifest.module ?? manifest.main;

  return relativeEntry
    ? path.resolve(path.dirname(manifestPath), relativeEntry)
    : requireFromModule.resolve(packageName);
}

export async function runPackageTool(
  options: PackageToolExecutionOptions
): Promise<PackageToolExecutionResult> {
  const nodeArgs = options.preserveSymlinks ? NODE_PACKAGE_SYMLINK_ARGS : [];
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      ...nodeArgs,
      resolvePackageBinary(options.packageName, options.binaryName),
      ...options.args,
    ],
    {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: options.maxBuffer ?? 5 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf-8',
    }
  );

  return { stdout, stderr };
}

export function packageProcessFailureOutput(error: unknown): string {
  const failure = error as PackageProcessFailure;
  const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  return output || failure.message || String(error);
}
