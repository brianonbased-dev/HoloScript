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

  it('exposes plugin-generated USDA from @holoscript/openusd-plugin (Wave B Stream 3)', async () => {
    const r = await runPaper12PluginProbe({ writeResults: false });
    expect(r.openUsdPluginGenerated).toBeDefined();
    expect(r.openUsdPluginGenerated.usdaLines).toBeGreaterThan(3);
    expect(r.openUsdPluginGenerated.primitiveCount).toBe(2);
    expect(r.openUsdPluginGenerated.generateMeanMs).toBeGreaterThanOrEqual(0);
  });
});
