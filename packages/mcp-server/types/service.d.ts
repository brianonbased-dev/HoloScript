import type { ChildProcess, SpawnOptions } from 'node:child_process';

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

export declare function resolveMcpServiceEntrypoints(
  moduleDir?: string
): McpServiceEntrypoints;
export declare function startMcpService(
  kind: McpServiceKind,
  options?: StartMcpServiceOptions
): ChildProcess;
export declare function startMcpHttpService(options?: StartMcpServiceOptions): ChildProcess;
export declare function startMcpStdioService(options?: StartMcpServiceOptions): ChildProcess;
