import { describe, it, expect, beforeEach } from 'vitest';
import { USDZPipeline, generateUSDA, getUSDZConversionCommand } from '../USDZPipeline';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('USDZPipeline', () => {
  let pipeline: USDZPipeline;

  beforeEach(() => {
    pipeline = new USDZPipeline();
  });

  // =========== Constructor ===========

  it('instantiates with default options', () => {
    expect(pipeline).toBeDefined();
  });

  // =========== USDA output ===========

  it('generates USDA string', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('#usda');
    expect(usda).toContain('TestScene');
  });

  it('includes upAxis metadata', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('upAxis');
  });

  it('includes metersPerUnit', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('metersPerUnit');
  });

  // =========== Options ===========

  it('respects Y upAxis (default)', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('"Y"');
  });

  it('respects Z upAxis', () => {
    const p = new USDZPipeline({ upAxis: 'Z' });
    const usda = p.generateUSDA(makeComposition());
    expect(usda).toContain('"Z"');
  });

  // =========== Objects → prims ===========

  it('compiles objects to USD Xform prims', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Xform');
    expect(usda).toContain('cube');
  });

  // =========== Sphere geometry ===========

  it('compiles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'type', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Sphere');
  });

  // =========== Materials ===========

  it('generates materials for objects with color', () => {
    const comp = makeComposition({
      objects: [
        { name: 'redcube', properties: [{ key: 'geometry', value: 'box' }, { key: 'color', value: '#ff0000' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Material');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('obj_a');
    expect(usda).toContain('obj_b');
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'grp',
          objects: [{ name: 'child', properties: [{ key: 'geometry', value: 'box' }], traits: [] }],
          properties: [],
        },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('grp');
  });

  // =========== Convenience functions ===========

  it('exports generateUSDA convenience function', () => {
    expect(generateUSDA).toBeTypeOf('function');
    const usda = generateUSDA(makeComposition());
    expect(usda).toContain('#usda');
  });

  it('exports getUSDZConversionCommand', () => {
    const cmd = getUSDZConversionCommand('input.usda', 'output.usdz');
    expect(cmd).toContain('input.usda');
    expect(cmd).toContain('output.usdz');
  });
});
