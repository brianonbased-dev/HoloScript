import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveMcpServiceEntrypoints,
  startMcpHttpService,
  startMcpStdioService,
} from '../service';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ pid: 1234 })),
}));

describe('import-safe MCP service surface', () => {
  it('resolves executable paths without loading either executable', () => {
    const moduleDir = resolve('consumer', 'node_modules', '@holoscript', 'mcp-server', 'dist');
    const entrypoints = resolveMcpServiceEntrypoints(moduleDir);

    expect(entrypoints.packageRoot).toBe(resolve(moduleDir, '..'));
    expect(entrypoints.http).toBe(
      resolve(moduleDir, '..', 'bin', 'holoscript-mcp-http.cjs')
    );
    expect(entrypoints.stdio).toBe(resolve(moduleDir, '..', 'bin', 'holoscript-mcp.cjs'));
  });

  it('does not start a process until an explicit start function is called', async () => {
    const { spawn } = await import('node:child_process');
    expect(spawn).not.toHaveBeenCalled();

    startMcpHttpService({ args: ['--size', 'tiny'], inheritEnv: false });
    startMcpStdioService({ inheritEnv: false });

    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
