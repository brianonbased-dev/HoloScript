import { describe, it, expect } from 'vitest';
import { HoloScriptLanguageServer } from '../server.js';

describe('CLI LSP server: blank .holo buffers', () => {
  const diagnosticsFor = async (content: string) => {
    const server = new HoloScriptLanguageServer();
    server.updateDocument('file:///scene.holo', content, 1);
    return await server.getDiagnostics('file:///scene.holo');
  };
  it.each(['', '   ', '\n\t\n'])('blank buffer %j gives 0 diagnostics', async (content) => {
    expect(await diagnosticsFor(content)).toHaveLength(0);
  });
  it("'{{{@@@' still gives at least 1 diagnostic", async () => {
    expect((await diagnosticsFor('{{{@@@')).length).toBeGreaterThanOrEqual(1);
  });
});