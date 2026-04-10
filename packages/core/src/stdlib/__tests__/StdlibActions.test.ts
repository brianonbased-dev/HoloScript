/**
 * Tests for StdlibActions (G.ARCH.003)
 *
 * Validates all 6 stdlib action handlers with mock HostCapabilities.
 * Covers: permission gating, path sandboxing, into: convention, error paths.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createStdlibActions,
  registerStdlib,
  DEFAULT_STDLIB_POLICY,
  type StdlibPolicy,
  type StdlibOptions,
} from '../StdlibActions';
import type { HostCapabilities } from '../../traits/TraitTypes';

function makeMockCapabilities(files: Record<string, string> = {}): HostCapabilities {
  return {
    fileSystem: {
      readFile: vi.fn((p: string) => files[p] ?? ''),
      writeFile: vi.fn((p: string, c: string) => {
        files[p] = c;
      }),
      deleteFile: vi.fn((p: string) => {
        delete files[p];
      }),
      exists: vi.fn((p: string) => p in files),
    },
    process: {
      exec: vi.fn(() => ({ code: 0, stdout: 'ok', stderr: '' })),
    },
    network: {
      fetch: vi.fn(() => ({ status: 200, ok: true, text: '{"result":"ok"}' })),
    },
  };
}

function makeOptions(
  overrides: Partial<StdlibPolicy> = {},
  files: Record<string, string> = {}
): StdlibOptions {
  const caps = makeMockCapabilities(files);
  return {
    policy: {
      ...DEFAULT_STDLIB_POLICY,
      rootDir: '/repo',
      ...overrides,
    },
    hostCapabilities: caps,
  };
}

describe('fs_read', () => {
  it('reads a file and sets blackboard content', async () => {
    const opts = makeOptions({ allowedPaths: ['src'] }, { 'src/hello.txt': 'world' });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_read({ path: 'src/hello.txt' }, bb, ctx);
    expect(result).toBe(true);
    expect(bb.fs_read_content).toBe('world');
    expect(bb.fs_read_exists).toBe(true);
  });

  it('denies access outside allowed paths', async () => {
    const opts = makeOptions({ allowedPaths: ['src'] }, { 'secret/key.txt': 'secret' });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_read({ path: 'secret/key.txt' }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.fs_read_error).toContain('outside allowed roots');
  });

  it('reports file not found', async () => {
    const opts = makeOptions({ allowedPaths: ['src'] });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_read({ path: 'src/missing.txt' }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.fs_read_error).toContain('file not found');
    expect(bb.fs_read_exists).toBe(false);
  });

  it('rejects files exceeding max size', async () => {
    const bigContent = 'x'.repeat(100);
    const opts = makeOptions(
      { allowedPaths: ['src'], maxFileBytes: 50 },
      { 'src/big.txt': bigContent }
    );
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_read({ path: 'src/big.txt' }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.fs_read_error).toContain('max size');
  });
});

describe('fs_write', () => {
  it('writes content to a file', async () => {
    const files: Record<string, string> = {};
    const opts = makeOptions({ allowedPaths: ['data'] }, files);
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_write({ path: 'data/out.txt', content: 'hello' }, bb, ctx);
    expect(result).toBe(true);
    expect(bb.fs_write_path).toBe('data/out.txt');
    expect(bb.fs_write_bytes).toBe(5);
    expect(files['data/out.txt']).toBe('hello');
  });

  it('blocks path traversal', async () => {
    const opts = makeOptions({ allowedPaths: ['data'] });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_write({ path: '../../etc/passwd', content: 'pwned' }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.fs_write_error).toContain('escapes');
  });
});

describe('fs_exists', () => {
  it('checks file existence', async () => {
    const opts = makeOptions({}, { 'compositions/demo.hsplus': 'content' });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_exists({ path: 'compositions/demo.hsplus' }, bb, ctx);
    expect(result).toBe(true);
    expect(bb.fs_exists_exists).toBe(true);
  });
});

describe('fs_delete', () => {
  it('deletes a file', async () => {
    const files: Record<string, string> = { 'data/temp.txt': 'old' };
    const opts = makeOptions({ allowedPaths: ['data'] }, files);
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.fs_delete({ path: 'data/temp.txt' }, bb, ctx);
    expect(result).toBe(true);
  });
});

describe('process_exec', () => {
  it('executes a command and sets blackboard output', async () => {
    const opts = makeOptions({ allowShell: true, allowedShellCommands: ['echo'] });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.process_exec({ cmd: 'echo', args: ['hello'] }, bb, ctx);
    expect(result).toBe(true);
    expect(bb.process_exec_code).toBe(0);
    expect(bb.process_exec_stdout).toBe('ok');
  });

  it('blocks when shell is disabled', async () => {
    const opts = makeOptions({ allowShell: false });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.process_exec({ cmd: 'rm', args: ['-rf', '/'] }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.process_exec_error).toContain('disabled by policy');
  });

  it('blocks non-allowlisted commands', async () => {
    const opts = makeOptions({ allowShell: true, allowedShellCommands: ['echo'] });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.process_exec({ cmd: 'rm', args: ['-rf', '/'] }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.process_exec_error).toContain('not allowlisted');
  });

  it('enforces timeout from policy', async () => {
    const opts = makeOptions({ allowShell: true, shellTimeoutMs: 5_000 });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    await actions.process_exec({ cmd: 'sleep', timeout: 999_999 }, bb, ctx);
    const execMock = opts.hostCapabilities!.process!.exec as ReturnType<typeof vi.fn>;
    const callArgs = execMock.mock.calls[0];
    expect(callArgs[2].timeoutMs).toBeLessThanOrEqual(5_000);
  });
});

describe('net_fetch', () => {
  it('fetches a URL and sets blackboard', async () => {
    const opts = makeOptions({ allowNetwork: true, allowedHosts: ['api.example.com'] });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.net_fetch({ url: 'https://api.example.com/data' }, bb, ctx);
    expect(result).toBe(true);
    expect(bb.net_fetch_status).toBe(200);
    expect(bb.net_fetch_ok).toBe(true);
  });

  it('blocks non-allowed hosts', async () => {
    const opts = makeOptions({ allowNetwork: true, allowedHosts: ['api.safe.com'] });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    const result = await actions.net_fetch({ url: 'https://evil.com/steal' }, bb, ctx);
    expect(result).toBe(false);
    expect(bb.net_fetch_error).toContain('not allowlisted');
  });
});

describe('into: convention', () => {
  it('uses custom prefix when into param is provided', async () => {
    const opts = makeOptions({ allowedPaths: ['src'] }, { 'src/file.txt': 'data' });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    await actions.fs_read({ path: 'src/file.txt', into: 'mydata' }, bb, ctx);
    expect(bb.mydata_content).toBe('data');
    expect(bb.mydata_exists).toBe(true);
    expect(bb.fs_read_content).toBeUndefined();
  });

  it('uses default prefix when into is not provided', async () => {
    const opts = makeOptions({ allowedPaths: ['src'] }, { 'src/file.txt': 'data' });
    const actions = createStdlibActions(opts);
    const bb: Record<string, unknown> = {};
    const ctx = { emit: vi.fn() };

    await actions.fs_read({ path: 'src/file.txt' }, bb, ctx);
    expect(bb.fs_read_content).toBe('data');
  });
});

describe('registerStdlib', () => {
  it('registers all 6 handlers on a runtime', () => {
    const registered: string[] = [];
    const mockRuntime = {
      registerAction: (name: string) => {
        registered.push(name);
      },
    };

    registerStdlib(mockRuntime, makeOptions());
    expect(registered).toContain('fs_read');
    expect(registered).toContain('fs_write');
    expect(registered).toContain('fs_exists');
    expect(registered).toContain('fs_delete');
    expect(registered).toContain('process_exec');
    expect(registered).toContain('net_fetch');
    expect(registered).toHaveLength(6);
  });
});
