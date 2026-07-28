import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { TSLCompiler } from '../TSLCompiler';
import { compileParticleFieldBlock, particleFieldToWGSL } from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

const EXAMPLE = readFileSync(join(__dirname, '../../parser/examples/particle-field.holo'), 'utf8');

function parseFirstParticleField(source: string): HoloDomainBlock {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  expect(result.success).toBe(true);
  const block = result.ast!.domainBlocks!.find((b) => b.domain === 'particle_field');
  expect(block).toBeDefined();
  return block!;
}

describe('particle_field — parse to IR', () => {
  it('registers as its own domain with scalars + a force stack', () => {
    const block = parseFirstParticleField(EXAMPLE);
    expect(block.domain).toBe('particle_field');
    expect(block.keyword).toBe('particle_field');
    expect(block.name).toBe('embers');
    const props = block.properties as Record<string, unknown>;
    expect(props.count).toBe(20000);
    expect(props.lifetime).toBe(3);
    expect((props.grav as Record<string, unknown>).type).toBe('gravity');
  });

  it('separates scalar config from typed forces', () => {
    const field = compileParticleFieldBlock(parseFirstParticleField(EXAMPLE));
    expect(field.count).toBe(20000);
    expect(field.lifetime).toBe(3);
    expect(field.forces).toHaveLength(4);
    const types = field.forces.map((f) => f.forceType);
    expect(types).toEqual(['gravity', 'vortex', 'curl_noise', 'drag']);
    const drag = field.forces.find((f) => f.forceType === 'drag');
    expect(drag?.params.coefficient).toBe(0.1);
  });
});

describe('particle_field — lower to compute WGSL', () => {
  it('emits a compute shader via the TSLCompiler domain-block path', () => {
    const result = new HoloCompositionParser().parse(EXAMPLE);
    const out = new TSLCompiler().compile(result.ast!);
    const key = '_domain.particle_field.embers.compute.wgsl';
    expect(out[key]).toBeDefined();
    const wgsl = out[key];
    expect(wgsl).toContain('@compute @workgroup_size(64)');
    expect(wgsl).toContain('fn cs_particle_field_embers(');
  });

  it('composes every declared force into acceleration, in order', () => {
    const { wgsl } = particleFieldToWGSL(
      compileParticleFieldBlock(parseFirstParticleField(EXAMPLE))
    );
    const iGravity = wgsl.indexOf('// gravity:grav');
    const iVortex = wgsl.indexOf('// vortex:swirl');
    const iCurl = wgsl.indexOf('// curl_noise:wind');
    const iDrag = wgsl.indexOf('// drag:air');
    expect(iGravity).toBeGreaterThan(-1);
    expect(iVortex).toBeGreaterThan(iGravity);
    expect(iCurl).toBeGreaterThan(iVortex);
    expect(iDrag).toBeGreaterThan(iCurl);
    // each force actually accumulates into accel (not a decorative comment)
    expect(wgsl).toContain('accel += vec3<f32>(0.0, -2.0000, 0.0);'); // gravity
    expect(wgsl).toContain('accel -= p.vel * 0.1000;'); // drag
    expect(wgsl).toContain('accel += pfCurl(p.pos * 0.5000) * 1.5000;'); // curl
  });

  it('integrates velocity/position and respawns at end of life', () => {
    const { wgsl } = particleFieldToWGSL(
      compileParticleFieldBlock(parseFirstParticleField(EXAMPLE))
    );
    expect(wgsl).toContain('p.vel += accel * dt;');
    expect(wgsl).toContain('p.pos += p.vel * dt;');
    expect(wgsl).toContain('p.life -= dt;');
    expect(wgsl).toContain('p.life = 3.0000;'); // respawn to authored lifetime
  });
});

describe('particle_field — robustness', () => {
  it('applies count/lifetime defaults when omitted', () => {
    const parser = new HoloCompositionParser();
    const r = parser.parse(`composition "X" { particle_field "p" { grav { type: "gravity" } } }`);
    const block = r.ast!.domainBlocks!.find((b) => b.domain === 'particle_field')!;
    const field = compileParticleFieldBlock(block);
    expect(field.count).toBe(1000);
    expect(field.lifetime).toBe(2.0);
    // gravity with no strength → default -9.81
    const { wgsl } = particleFieldToWGSL(field);
    expect(wgsl).toContain('accel += vec3<f32>(0.0, -9.8100, 0.0);');
  });

  it('warns and skips an unknown force type', () => {
    const { wgsl } = particleFieldToWGSL({
      name: 'x',
      count: 100,
      lifetime: 1,
      forces: [{ id: 'weird', forceType: 'antigravity_ray', params: {} }],
      traits: [],
    });
    expect(wgsl).toContain('WARNING');
    expect(wgsl).toContain('unknown force antigravity_ray');
  });
});
