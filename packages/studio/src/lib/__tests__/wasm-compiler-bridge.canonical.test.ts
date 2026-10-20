import { describe, it, expect } from 'vitest';
import { CompilerBridge } from '../wasm-compiler-bridge';

// No mock of @holoscript/core here: this checks the fallback validate against the
// real canonical validator, so a renamed export or a changed request shape fails.
// Without init() the bridge has no worker and always takes the fallback path.
describe('CompilerBridge fallback validate, real @holoscript/core', { timeout: 60_000 }, () => {
  const bridge = new CompilerBridge();

  it('accepts a valid composition', async () => {
    const result = await bridge.validate(
      'composition "Room" {\n  object "Cube" {\n    position: [0, 1, 0]\n  }\n}\n'
    );
    expect(result).toEqual({ valid: true, diagnostics: [] });
  });

  it('refuses source that is not HoloScript', async () => {
    const result = await bridge.validate('SELECT * FROM users;');
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('does not flag a blank editor buffer', async () => {
    expect(await bridge.validate('')).toEqual({ valid: true, diagnostics: [] });
  });
});
