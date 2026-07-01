import { describe, expect, it, vi } from 'vitest';
import { DTDLCompiler } from '../../../../core/src/compiler/DTDLCompiler';
import type { HoloComposition } from '../../../../core/src/parser/HoloCompositionTypes';
import { verifyCAELHashChain } from '../CAELTrace';
import {
  TwinGraphService,
  runIndustrialLineTwinGraphDemo,
  type TwinDtdlInterface,
} from '../TwinGraphService';

vi.mock('../../../../core/src/compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../core/src/compiler/identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, reason: 'unit-test compiler access' }),
    }),
  };
});

function deterministicClock(): () => number {
  let tick = Date.parse('2026-07-01T15:00:00.000Z');
  return () => {
    tick += 1000;
    return tick;
  };
}

function industrialLineComposition(): HoloComposition {
  return {
    name: 'IndustrialLineTwin',
    objects: [
      {
        name: 'PressCell',
        properties: [
          { key: 'position', value: [1, 0, 0] },
          { key: 'temperature', value: 68.5 },
          { key: 'vibrationRms', value: 0.09 },
          { key: 'status', value: 'nominal' },
        ],
        traits: ['sensor', 'observable', 'networked'],
      },
      {
        name: 'ConveyorA',
        properties: [
          { key: 'position', value: [2, 0, 0] },
          { key: 'speedMps', value: 1.8 },
          { key: 'status', value: 'nominal' },
        ],
        traits: ['sensor', 'networked'],
      },
    ],
    state: {
      properties: [
        { key: 'throughputTarget', value: 120 },
        { key: 'site', value: 'mesa-lab' },
      ],
    },
  } as HoloComposition;
}

function compileIndustrialLineDtdl(): TwinDtdlInterface[] {
  const compiler = new DTDLCompiler({
    namespace: 'dtmi:holoscript:industrial',
    dtdlVersion: 3,
    modelVersion: 1,
  });
  return JSON.parse(
    compiler.compile(industrialLineComposition(), 'test-token')
  ) as TwinDtdlInterface[];
}

describe('TwinGraphService CG-008 posture', () => {
  it('runs DTDL v3 -> twin graph -> telemetry -> query -> CAEL replay as one proof', () => {
    const dtdlInterfaces = compileIndustrialLineDtdl();
    expect(dtdlInterfaces.every((iface) => iface['@context'] === 'dtmi:dtdl:context;3')).toBe(true);
    expect(dtdlInterfaces.some((iface) => iface.displayName === 'PressCell')).toBe(true);

    const demo = runIndustrialLineTwinGraphDemo({
      dtdlInterfaces,
      clock: deterministicClock(),
      holokey: 'openai-codex-cg008-test-holokey',
    });

    expect(demo.queryResult.twins.map((twin) => twin.id)).toEqual(['press-1']);
    expect(demo.queryResult.twins[0].properties.temperature).toBe(82.4);

    const operations = demo.receipts.map((receipt) => receipt.operation);
    expect(operations).toContain('register-models');
    expect(operations).toContain('relationship-upsert');
    expect(operations).toContain('property-update');
    expect(operations).toContain('telemetry-ingress');
    expect(operations).toContain('query');

    expect(demo.verification).toMatchObject({
      success: true,
      hashChainValid: true,
      replayValid: true,
    });
    expect(demo.verification.replayGraphHash).toBe(demo.service.getGraphHash());
    expect(demo.service.toReplayJSONL()).toContain('"action":"telemetry-ingress"');

    const telemetryReceipt = demo.receipts.find(
      (receipt) => receipt.operation === 'telemetry-ingress'
    );
    expect(telemetryReceipt?.triad.semanticReceiptId).toMatch(/^twin-semantic-/);
    expect(telemetryReceipt?.triad.provenanceReceiptId).toMatch(/^twin-provenance-/);
    expect(telemetryReceipt?.triad.replayReceiptId).toMatch(/^twin-replay-sha-/);
    expect(telemetryReceipt?.custody.holokey).toBe('openai-codex-cg008-test-holokey');
    expect(telemetryReceipt?.custody.docsUmbrella).toBe('HoloGate');
    expect(telemetryReceipt?.custody.docsUmbrellaRole).toBe(
      'umbrella term in docs, not an executable tool'
    );
    expect(telemetryReceipt?.custody.concreteTools).toContain('HoloKey');
    expect(telemetryReceipt?.custody.concreteTools).toContain('UmbrellaRoute');
    expect(telemetryReceipt?.custody.concreteTools).not.toContain('HoloGate');
  });

  it('rejects a tampered CAEL history entry before replay trust is granted', () => {
    const dtdlInterfaces = compileIndustrialLineDtdl();
    const service = new TwinGraphService({
      runId: 'cael:twin-graph:tamper-test',
      clock: deterministicClock(),
    });
    service.registerDtdlInterfaces(dtdlInterfaces, {
      compiler: 'DTDLCompiler',
      sourceComposition: 'IndustrialLineTwin',
      dtdlVersion: 'v3',
    });

    const trace = service.getTrace();
    trace[1] = {
      ...trace[1],
      payload: {
        ...trace[1].payload,
        graphHash: 'twin-graph-sha-' + '0'.repeat(64),
      },
    };

    const tampered = verifyCAELHashChain(trace, 'sha256');
    expect(tampered.valid).toBe(false);
    expect(tampered.brokenAt).toBe(1);
  });
});
