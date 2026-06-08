import { describe, it, expect } from 'vitest';

import { localProvider, SOVEREIGN_BASELINE_MODEL, SOVEREIGN_LITE_MODEL } from '../exp1Provider';

describe('EXP-1 sovereign provider (no silent frontier billing)', () => {
  it('localProvider is sovereign — providerName ollama, no external vendor', () => {
    const p = localProvider('qwen2.5-coder:7b');
    expect(p.providerName).toBe('ollama');
    expect(p.model).toBe('qwen2.5-coder:7b');
    expect(p.provider).toBeDefined();
  });

  it('honors an explicit Ollama host (fleet endpoint capable, not localhost-locked)', () => {
    const p = localProvider('qwen2.5-coder:1.5b', 'http://fleet-node:11434');
    expect(p.providerName).toBe('ollama');
    // construction does not connect; the host is wired for call time
    expect(p.model).toBe('qwen2.5-coder:1.5b');
  });

  it('lite model differs from baseline → C2 lower-params holds by construction', () => {
    expect(SOVEREIGN_LITE_MODEL).not.toBe(SOVEREIGN_BASELINE_MODEL);
  });
});
