import { describe, it, expect } from 'vitest';
// @ts-expect-error -- plain JS module (typed by server.d.ts for the proxy build)
import { HoloScriptLanguageServer } from '../server.js';

describe('CLI LSP server: blank .holo buffers', () => {
  const diagnosticsFor = (content: string) => {
    const server = new HoloScriptLanguageServer();
    server.updateDocument('file:///scene.holo', content, 1);
    return server.getDiagnostics('file:///scene.holo');
  };
  it.each(['', '   ', '\n\t\n'])('blank buffer %j gives 0 diagnostics', (content) => {
    expect(diagnosticsFor(content)).toHaveLength(0);
  });
  it("'{{{@@@' still gives at least 1 diagnostic", () => {
    expect(diagnosticsFor('{{{@@@').length).toBeGreaterThanOrEqual(1);
  });
});
