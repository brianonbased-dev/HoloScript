import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runPaper12PluginProbe } from '../paper12PluginProbe';

describe('paper-12 plugin probe', () => {
  beforeEach(() => {
    process.env.PAPER12_QUICK = '1';
  });
  afterEach(() => {
    delete process.env.PAPER12_QUICK;
  });

  it('returns structured Paper12PluginProbeResult (no disk write)', async () => {
    const r = await runPaper12PluginProbe({ writeResults: false });
    expect(r.paperId).toBe('paper-12');
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.holo.sourceLines).toBeGreaterThan(0);
    expect(r.holo.coldParseMeanMs).toBeGreaterThan(0);
    expect(r.holo.warmParseMeanMs).toBeGreaterThan(0);
    expect(r.openUsdEquivalent.schemaAndPayloadLines).toBeGreaterThan(3);
    expect(r.openUsdEquivalent.pluginInitProxyMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(r.notes)).toBe(true);
  });
});
