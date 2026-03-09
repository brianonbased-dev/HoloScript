import { describe, it, expect, beforeEach } from 'vitest';
import { RenderPass, type RenderPassConfig } from '../RenderPass';

function pass(
  id: string,
  order: number,
  deps: string[] = [],
  inputs: string[] = [],
  attachments: any[] = []
): RenderPassConfig {
  return { id, name: id, order, enabled: true, dependencies: deps, attachments, inputs };
}

describe('RenderPass', () => {
  let rp: RenderPass;

  beforeEach(() => {
    rp = new RenderPass();
  });

  // CRUD
  it('addPass and getPass', () => {
    rp.addPass(pass('geo', 0));
    expect(rp.getPass('geo')).toBeDefined();
    expect(rp.getPassCount()).toBe(1);
  });

  it('removePass deletes pass', () => {
    rp.addPass(pass('geo', 0));
    rp.removePass('geo');
    expect(rp.getPassCount()).toBe(0);
  });

  it('enablePass toggles', () => {
    rp.addPass(pass('geo', 0));
    rp.enablePass('geo', false);
    expect(rp.getPass('geo')!.enabled).toBe(false);
  });

  // Execution order
  it('getExecutionOrder sorts by order', () => {
    rp.addPass(pass('b', 2));
    rp.addPass(pass('a', 1));
    const order = rp.getExecutionOrder();
    expect(order[0].id).toBe('a');
    expect(order[1].id).toBe('b');
  });

  it('getExecutionOrder respects dependencies', () => {
    rp.addPass(pass('lighting', 1, ['geo']));
    rp.addPass(pass('geo', 0));
    const order = rp.getExecutionOrder();
    const geoIdx = order.findIndex((p) => p.id === 'geo');
    const lightIdx = order.findIndex((p) => p.id === 'lighting');
    expect(geoIdx).toBeLessThan(lightIdx);
  });

  it('getExecutionOrder skips disabled passes', () => {
    rp.addPass(pass('a', 0));
    rp.addPass(pass('b', 1));
    rp.enablePass('b', false);
    expect(rp.getExecutionOrder().length).toBe(1);
  });

  // Validation
  it('validate reports missing dependency', () => {
    rp.addPass(pass('a', 0, ['nonexistent']));
    const errors = rp.validate();
    expect(errors.some((e) => e.includes('unknown pass'))).toBe(true);
  });

  it('validate reports missing input attachment', () => {
    rp.addPass(pass('a', 0));
    rp.addPass(pass('b', 1, ['a'], ['colorBuffer']));
    const errors = rp.validate();
    expect(errors.some((e) => e.includes('input'))).toBe(true);
  });

  it('validate clean for valid graph', () => {
    rp.addPass({
      ...pass('geo', 0),
      attachments: [
        { name: 'color', format: 'rgba8', width: 1920, height: 1080, clearOp: 'clear' },
      ],
    });
    rp.addPass(pass('post', 1, ['geo'], ['color']));
    const errors = rp.validate();
    expect(errors.length).toBe(0);
  });

  // Cycle detection
  it('validate detects cycles', () => {
    rp.addPass(pass('a', 0, ['b']));
    rp.addPass(pass('b', 1, ['a']));
    const errors = rp.validate();
    expect(errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  // getAllPasses
  it('getAllPasses returns all', () => {
    rp.addPass(pass('a', 0));
    rp.addPass(pass('b', 1));
    expect(rp.getAllPasses().length).toBe(2);
  });
});
