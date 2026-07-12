import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { resolve } from 'node:path';

export type McpServiceKind = 'http' | 'stdio';

export interface McpServiceEntrypoints {
  packageRoot: string;
  http: string;
  stdio: string;
}

export interface StartMcpServiceOptions {
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  inheritEnv?: boolean;
  stdio?: SpawnOptions['stdio'];
  windowsHide?: boolean;
}

/**
 * Resolve the packaged executable entrypoints without importing either server.
 * The optional directory keeps the resolver deterministic in tests and embedders.
 */
export function resolveMcpServiceEntrypoints(moduleDir = __dirname): McpServiceEntrypoints {
  const packageRoot = resolve(moduleDir, '..');
  return {
    packageRoot,
    http: resolve(packageRoot, 'bin', 'holoscript-mcp-http.cjs'),
    stdio: resolve(packageRoot, 'bin', 'holoscript-mcp.cjs'),
  };
}

/**
 * Start a packaged MCP executable only when the caller explicitly requests it.
 * Importing this module performs no service, socket, timer, or child-process work.
 */
export function startMcpService(
  kind: McpServiceKind,
  options: StartMcpServiceOptions = {}
): ChildProcess {
  const entrypoints = resolveMcpServiceEntrypoints();
  const entrypoint = kind === 'http' ? entrypoints.http : entrypoints.stdio;
  const env = options.inheritEnv === false
    ? { ...options.env }
    : { ...process.env, ...options.env };

  return spawn(options.execPath ?? process.execPath, [entrypoint, ...(options.args ?? [])], {
    cwd: options.cwd ?? entrypoints.packageRoot,
    env,
    stdio: options.stdio ?? 'pipe',
    windowsHide: options.windowsHide ?? true,
  });
}

export function startMcpHttpService(options: StartMcpServiceOptions = {}): ChildProcess {
  return startMcpService('http', options);
}

export function startMcpStdioService(options: StartMcpServiceOptions = {}): ChildProcess {
  return startMcpService('stdio', options);
}
