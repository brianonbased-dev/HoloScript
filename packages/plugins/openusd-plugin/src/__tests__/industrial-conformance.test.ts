import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildIndustrialDigitalTwinFixture,
  exportToUsda,
  runOpenUsdConformanceRoundTrip,
  summarizeUsdaRoundTrip,
} from '../index';

describe('OpenUSD industrial conformance baseline', () => {
  it('emits an Omniverse-oriented industrial twin with semantic receipts', () => {
    const fixture = buildIndustrialDigitalTwinFixture();
    const out = exportToUsda(fixture);

    expect(out.usda).toContain('defaultPrim = "FactoryCell"');
    expect(out.usda).toContain('upAxis = "Z"');
    expect(out.usda).toContain('custom string holo:targetRuntime = "omniverse_openusd"');
    expect(out.usda).toContain('custom string holo:role = "conveyor"');
    expect(out.usda).toContain('custom string holo:dtId = "dt:motor:lineA:m001"');
    expect(out.semantic_receipt_count).toBe(fixture.primitives?.length);
    expect(out.semantic_hash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it('round-trips primitive names, source paths, semantic roles, and semantic hash', () => {
    const report = runOpenUsdConformanceRoundTrip(buildIndustrialDigitalTwinFixture());

    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => [check.id, check.passed])).toEqual(
      expect.arrayContaining([
        ['magic-header', true],
        ['primitive-roundtrip', true],
        ['semantic-source-paths', true],
        ['semantic-receipts', true],
        ['semantic-hash', true],
      ])
    );
    expect(report.roundTrip.primitiveNames).toContain('FactoryCell_LineA_Conveyor');
    expect(report.roundTrip.semanticSourcePaths).toContain('/FactoryCell/LineA/Conveyor');
    expect(report.roundTrip.semanticRoles).toEqual(
      expect.arrayContaining(['factory_cell', 'conveyor', 'motor', 'sensor', 'robot_actor'])
    );
  });

  it('anchors semantic receipts to the industrial .holo demo source', () => {
    const source = readFileSync(
      new URL('../../../../../examples/openusd/industrial-factory-cell.holo', import.meta.url),
      'utf8'
    );
    const fixture = buildIndustrialDigitalTwinFixture();
    const demoObjectNames =
      fixture.primitives
        ?.map((primitive) => primitive.semantic?.sourcePath)
        .filter((sourcePath): sourcePath is string => sourcePath?.startsWith('object:') ?? false)
        .map((sourcePath) => sourcePath.slice('object:'.length)) ?? [];

    for (const objectName of demoObjectNames) {
      expect(source).toContain(`object "${objectName}"`);
    }
    expect(source).toContain('dtId: "dt:motor:lineA:m001"');
    expect(source).toContain(
      'simulationContract: "fixed_dt_60hz;z_up;semantic_receipts_required"'
    );
  });

  it('keeps semantic hashes deterministic for repeated exports', () => {
    const fixture = buildIndustrialDigitalTwinFixture();
    const first = exportToUsda(fixture);
    const second = exportToUsda(fixture);

    expect(second.semantic_hash).toBe(first.semantic_hash);
    expect(summarizeUsdaRoundTrip(first.usda).semanticHash).toBe(first.semantic_hash);
  });
});
