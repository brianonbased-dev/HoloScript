import { describe, it, expect } from 'vitest';
import { canonicalSourceDiagnostics } from '../canonicalDiagnostics';

describe('LSP server canonical diagnostics: blank buffers', () => {
  it.each(['', '   ', '\n\t\n'])('blank .holo buffer %j gives 0 diagnostics', (text) => {
    expect(canonicalSourceDiagnostics(text, 'holo').diagnostics).toHaveLength(0);
  });
  it("'{{{@@@' still gives at least 1 diagnostic", () => {
    expect(canonicalSourceDiagnostics('{{{@@@', 'holo').diagnostics.length).toBeGreaterThanOrEqual(1);
  });
});
