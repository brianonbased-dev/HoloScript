import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { TSLCompiler } from '../TSLCompiler';
import { compilePhysicsContractBlock, physicsContractToWGSL } from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

const EXAMPLE = readFileSync(join(__dirname, '../../parser/examples/physics-contract.holo'), 'utf8');

function parseFirstPhysicsContract(source: string): HoloDomainBlock {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  expect(result.success).toBe(true);
  const block = result.ast!.domainBlocks!.find((b) => b.domain === 'physics_contract');
  expect(block).toBeDefined();
  return block!;
}

describe('physics_contract — parse to IR', () => {
  it('registers as its own domain with scalars + unique-id body/constraint sub-blocks', () => {
    const block = parseFirstPhysicsContract(EXAMPLE);
    expect(block.domain).toBe('physics_contract');
    expect(block.keyword).toBe('physics_contract');
    expect(block.name).toBe('stack');
    const props = block.properties as Record<string, unknown>;
    expect(props.gravity_y).toBe(-9.81);
    expect(props.substeps).toBe(2);
    // unique-id sub-block form (NOT `body "x" {}`) → no collision, all keys survive
    expect((props.ground as Record<string, unknown>).kind).toBe('body');
    expect((props.crate as Record<string, unknown>).kind).toBe('body');
    expect((props.ball as Record<string, unknown>).kind).toBe('body');
    expect((props.tether as Record<string, unknown>).type).toBe('distance');
  });

  it('splits scalars from typed bodies and constraints, preserving declaration order', () => {
    const field = compilePhysicsContractBlock(parseFirstPhysicsContract(EXAMPLE));
    expect(field.gravity[1]).toBe(-9.81);
    expect(field.substeps).toBe(2);
    expect(field.bodies.map((b) => b.id)).toEqual(['ground', 'crate', 'ball']);
    expect(field.constraints.map((c) => c.constraintType)).toEqual(['distance', 'hinge', 'fixed']);
    // static/anchor body carries mass 0
    expect(field.bodies.find((b) => b.id === 'ground')?.mass).toBe(0);
    expect(field.bodies.find((b) => b.id === 'crate')?.pos).toEqual([0, 4, 0]);
    const tether = field.constraints.find((c) => c.id === 'tether');
    expect(tether?.bodyA).toBe('crate');
    expect(tether?.bodyB).toBe('ball');
    expect(tether?.params.rest).toBe(2);
  });
});

describe('physics_contract — lower to compute WGSL', () => {
  it('emits a compute shader via the TSLCompiler domain-block path', () => {
    const result = new HoloCompositionParser().parse(EXAMPLE);
    const out = new TSLCompiler().compile(result.ast!);
    const key = '_domain.physics_contract.stack.compute.wgsl';
    expect(out[key]).toBeDefined();
    const wgsl = out[key];
    expect(wgsl).toContain('@compute @workgroup_size(64)');
    expect(wgsl).toContain('fn cs_physics_contract_stack(');
  });

  it('integrates under gravity with a static-body guard, substepped', () => {
    const { wgsl } = physicsContractToWGSL(compilePhysicsContractBlock(parseFirstPhysicsContract(EXAMPLE)));
    // static bodies (invMass 0) skip integration
    expect(wgsl).toContain('if (p.invMass > 0.0) {');
    // semi-implicit Euler under authored gravity
    expect(wgsl).toContain('p.vel += vec3<f32>(0.0000, -9.8100, 0.0000) * subDt;');
    expect(wgsl).toContain('p.pos += p.vel * subDt;');
    // substeps drive the loop and the sub-timestep
    expect(wgsl).toContain('let subDt = physDt_stack / 2.0;');
    expect(wgsl).toContain('for (var s = 0u; s < 2u; s = s + 1u) {');
  });

  it('projects every declared constraint in declaration order, with real corrections', () => {
    const { wgsl } = physicsContractToWGSL(compilePhysicsContractBlock(parseFirstPhysicsContract(EXAMPLE)));
    const iDistance = wgsl.indexOf('// distance:tether');
    const iHinge = wgsl.indexOf('// hinge:pin');
    const iFixed = wgsl.indexOf('// fixed:weld');
    expect(iDistance).toBeGreaterThan(-1);
    expect(iHinge).toBeGreaterThan(iDistance);
    expect(iFixed).toBeGreaterThan(iHinge);
    // the distance constraint emits a real positional correction using its authored rest
    expect(wgsl).toContain('let C = dist - 2.0000;');
    expect(wgsl).toContain('p.pos -= n * (C * (p.invMass / w) * 1.0000);');
    // hinge documents its deferred angular limit; fixed documents its deferred rotational lock
    expect(wgsl).toContain('angular limit deferred');
    expect(wgsl).toContain('3-DoF weld (rotational lock deferred)');
  });
});

describe('physics_contract — robustness', () => {
  it('applies gravity/substep defaults when omitted', () => {
    const parser = new HoloCompositionParser();
    const r = parser.parse(`composition "X" { physics_contract "p" { a { kind: "body", mass: 1.0 } } }`);
    const block = r.ast!.domainBlocks!.find((b) => b.domain === 'physics_contract')!;
    const field = compilePhysicsContractBlock(block);
    expect(field.gravity).toEqual([0, -9.81, 0]);
    expect(field.substeps).toBe(1);
    const { wgsl } = physicsContractToWGSL(field);
    expect(wgsl).toContain('for (var s = 0u; s < 1u; s = s + 1u) {');
  });

  it('warns and skips an unknown constraint type', () => {
    const { wgsl } = physicsContractToWGSL({
      name: 'x',
      gravity: [0, -9.81, 0],
      substeps: 1,
      bodies: [
        { id: 'a', mass: 1, shape: 'box', pos: [0, 0, 0] },
        { id: 'b', mass: 1, shape: 'box', pos: [0, 1, 0] },
      ],
      constraints: [{ id: 'weird', constraintType: 'ragdoll', bodyA: 'a', bodyB: 'b', params: {} }],
      traits: [],
    });
    expect(wgsl).toContain('WARNING');
    expect(wgsl).toContain('unknown constraint ragdoll');
  });

  it('warns and skips a constraint that references an unknown body', () => {
    const { wgsl } = physicsContractToWGSL({
      name: 'x',
      gravity: [0, -9.81, 0],
      substeps: 1,
      bodies: [{ id: 'a', mass: 1, shape: 'box', pos: [0, 0, 0] }],
      constraints: [{ id: 'dangling', constraintType: 'distance', bodyA: 'a', bodyB: 'ghost', params: {} }],
      traits: [],
    });
    expect(wgsl).toContain('WARNING');
    expect(wgsl).toContain('references unknown body');
  });
});
