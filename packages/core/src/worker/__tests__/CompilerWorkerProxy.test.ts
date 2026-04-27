import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWorkerInstance = {
  on: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn(),
};

vi.mock('worker_threads', () => ({
  // Must use function keyword so `new Worker()` works
  Worker: vi.fn(function MockWorker() { return mockWorkerInstance; }),
}));

vi.mock('path', () => ({
  default: { join: (...args: string[]) => args.join('/') },
  join: (...args: string[]) => args.join('/'),
}));

import { CompilerWorkerProxy } from '../CompilerWorkerProxy.js';
import { Worker } from 'worker_threads';

describe('CompilerWorkerProxy', () => {
  let messageHandler: (msg: { id: string; payload?: unknown; error?: string }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore constructor mock after clearAllMocks wipes it
    vi.mocked(Worker).mockImplementation(function MockWorker() {
      return mockWorkerInstance;
    } as unknown as new (path: string) => typeof mockWorkerInstance);
    messageHandler = () => {};

    mockWorkerInstance.on.mockImplementation((event: string, handler: unknown) => {
      if (event === 'message') {
        messageHandler = handler as typeof messageHandler;
      }
    });

    // Default: echo back success with null payload
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: null }), 0);
    });
  });

  it('creates a Worker on construction', () => {
    new CompilerWorkerProxy();
    expect(Worker).toHaveBeenCalledTimes(1);
  });

  it('registers message and error handlers', () => {
    new CompilerWorkerProxy();
    expect(mockWorkerInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockWorkerInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('initialize sends INIT command', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.initialize();
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'INIT' })
    );
  });

  it('updateDocument sends UPDATE_DOCUMENT with correct payload', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.updateDocument('file:///test.hs', 'content here', 1);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'UPDATE_DOCUMENT',
        payload: { uri: 'file:///test.hs', content: 'content here', version: 1 },
      })
    );
  });

  it('getDiagnostics sends GET_DIAGNOSTICS with uri', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: [] }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    const result = await proxy.getDiagnostics('file:///test.hs');
    expect(result).toEqual([]);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'GET_DIAGNOSTICS' })
    );
  });

  it('getDiagnostics passes the uri as payload', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: [] }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    await proxy.getDiagnostics('file:///my.hs');
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ payload: 'file:///my.hs' })
    );
  });

  it('getCompletions sends GET_COMPLETIONS with position', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: [] }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    await proxy.getCompletions('file:///test.hs', 5, 10);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'GET_COMPLETIONS',
        payload: { uri: 'file:///test.hs', position: { line: 5, character: 10 } },
      })
    );
  });

  it('getHover sends GET_HOVER with position', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.getHover('file:///test.hs', 1, 2);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'GET_HOVER',
        payload: { uri: 'file:///test.hs', position: { line: 1, character: 2 } },
      })
    );
  });

  it('getDefinition sends GET_DEFINITION with position', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.getDefinition('file:///test.hs', 3, 4);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'GET_DEFINITION',
        payload: { uri: 'file:///test.hs', position: { line: 3, character: 4 } },
      })
    );
  });

  it('compileScene sends COMPILE_SCENE with isIncremental=true by default', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.compileScene('file:///test.hs', 'scene content');
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'COMPILE_SCENE',
        payload: { uri: 'file:///test.hs', content: 'scene content', isIncremental: true },
      })
    );
  });

  it('compileScene passes isIncremental=false when specified', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.compileScene('file:///test.hs', 'content', false);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ isIncremental: false }),
      })
    );
  });

  it('rejects when worker responds with error field', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, error: 'worker failed' }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    await expect(proxy.initialize()).rejects.toThrow('worker failed');
  });

  it('terminate calls worker.terminate()', () => {
    const proxy = new CompilerWorkerProxy();
    proxy.terminate();
    expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
  });

  it('each request gets a unique id', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: [] }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    await proxy.getDiagnostics('u1');
    await proxy.getDiagnostics('u2');
    await proxy.getDiagnostics('u3');
    const calls = mockWorkerInstance.postMessage.mock.calls as Array<[{ id: string }]>;
    const ids = calls.map((c) => c[0].id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves the payload returned by the worker', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: { items: ['a', 'b'] } }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    const result = await proxy.getCompletions('f', 0, 0);
    expect(result).toEqual({ items: ['a', 'b'] });
  });

  it('pending requests map is cleaned up after resolution', async () => {
    const proxy = new CompilerWorkerProxy();
    await proxy.initialize();
    // Access private map via cast
    const pending = (proxy as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests;
    expect(pending.size).toBe(0);
  });

  it('multiple concurrent requests are all resolved', async () => {
    mockWorkerInstance.postMessage.mockImplementation((req: { id: string }) => {
      setTimeout(() => messageHandler({ id: req.id, payload: `result-${req.id}` }), 0);
    });
    const proxy = new CompilerWorkerProxy();
    const [r1, r2, r3] = await Promise.all([
      proxy.getDiagnostics('file1'),
      proxy.getDiagnostics('file2'),
      proxy.getDiagnostics('file3'),
    ]);
    expect(r1).toMatch(/result-/);
    expect(r2).toMatch(/result-/);
    expect(r3).toMatch(/result-/);
  });
});
