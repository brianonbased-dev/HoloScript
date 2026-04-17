import { CompilerWorkerProxy } from '../worker/CompilerWorkerProxy';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('CompilerWorkerProxy Integrations', () => {
  let proxy: CompilerWorkerProxy;

  beforeAll(async () => {
    proxy = new CompilerWorkerProxy();
    await proxy.initialize();
  });

  afterAll(() => {
    proxy.terminate();
  });

  it('bounces document updates across the boundary', async () => {
    const uri = 'file:///test.holo';
    const content = `orb ball { position: [0, 0, 0] }`;
    
    // Test update (fire and forget pattern from LSP)
    await proxy.updateDocument(uri, content, 1);
    
    // Check diagnostics to ensure the code parsed successfully on the worker thread
    const diagnostics = await proxy.getDiagnostics(uri);
    expect(diagnostics).toBeInstanceOf(Array);
    expect(diagnostics.length).toBe(0); // Assuming valid code
  });

  it('returns valid async completions', async () => {
    const uri = 'file:///test2.holo';
    // Let's test completion at the start of a new line inside the orb
    const content = `orb ball {\n  \n}`;
    await proxy.updateDocument(uri, content, 1);
    
    const completions = await proxy.getCompletions(uri, 1, 2);
    // Builtin completions + generic keywords should respond
    expect(completions).toBeInstanceOf(Array);
    expect(completions.length).toBeGreaterThan(5);
  });
});
