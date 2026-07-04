import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { TSLCompiler } from '../TSLCompiler';
import { compileNavFieldBlock, navFieldToWGSL } from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

const EXAMPLE = readFileSync(join(__dirname, '../../parser/examples/nav-field.holo'), 'utf8');

function parseFirstNavField(source: string): HoloDomainBlock {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  expect(result.success).toBe(true);
  const block = result.ast!.domainBlocks!.find((b) => b.domain === 'nav_field');
  expect(block).toBeDefined();
  return block!;
}

describe('nav_field — parse to IR', () => {
  it('registers as its own domain with config + a behavior stack', () => {
    const block = parseFirstNavField(EXAMPLE);
    expect(block.domain).toBe('nav_field');
    expect(block.keyword).toBe('nav_field');
    expect(block.name).toBe('market_crowd');
    const props = block.properties as Record<string, unknown>;
    expect(props.agents).toBe(500);
    expect(props.max_speed).toBe(3);
    expect((props.goal as Record<string, unknown>).type).toBe('arrive');
  });

  it('separates config from typed behaviors', () => {
    const field = compileNavFieldBlock(parseFirstNavField(EXAMPLE));
    expect(field.agents).toBe(500);
    expect(field.maxSpeed).toBe(3);
    expect(field.behaviors.map((b) => b.behaviorType)).toEqual(['arrive', 'flow', 'flee']);
  });
});

describe('nav_field — lower to compute WGSL', () => {
  it('emits a compute shader via the TSLCompiler domain-block path', () => {
    const out = new TSLCompiler().compile(new HoloCompositionParser().parse(EXAMPLE).ast!);
    const key = '_domain.nav_field.market_crowd.compute.wgsl';
    expect(out[key]).toBeDefined();
    expect(out[key]).toContain('@compute @workgroup_size(64)');
    expect(out[key]).toContain('fn cs_nav_field_market_crowd(');
  });

  it('accumulates each behavior into steer, in declaration order', () => {
    const { wgsl } = navFieldToWGSL(compileNavFieldBlock(parseFirstNavField(EXAMPLE)));
    const iArrive = wgsl.indexOf('// arrive:goal');
    const iFlow = wgsl.indexOf('// flow:lane');
    const iFlee = wgsl.indexOf('// flee:shy');
    expect(iArrive).toBeGreaterThan(-1);
    expect(iFlow).toBeGreaterThan(iArrive);
    expect(iFlee).toBeGreaterThan(iFlow);
    // arrive uses a slow-radius ramp; flow steers toward a fixed direction
    expect(wgsl).toContain('clamp(dist / 3.0000, 0.0, 1.0)');
    expect(wgsl).toContain('steer += (desired - a.vel) * 0.4000;'); // flow weight
  });

  it('integrates velocity clamped to max_speed', () => {
    const { wgsl } = navFieldToWGSL(compileNavFieldBlock(parseFirstNavField(EXAMPLE)));
    expect(wgsl).toContain('a.vel += steer * dt;');
    expect(wgsl).toContain('if (sp > 3.0000) { a.vel = a.vel / sp * 3.0000; }');
    expect(wgsl).toContain('a.pos += a.vel * dt;');
  });
});

describe('nav_field — robustness', () => {
  it('applies agents/max_speed defaults when omitted', () => {
    const parser = new HoloCompositionParser();
    const r = parser.parse(`composition "X" { nav_field "n" { goal { type: "seek", target_x: 1.0 } } }`);
    const field = compileNavFieldBlock(r.ast!.domainBlocks!.find((b) => b.domain === 'nav_field')!);
    expect(field.agents).toBe(256);
    expect(field.maxSpeed).toBe(2.0);
  });

  it('warns and skips an unknown behavior type', () => {
    const { wgsl } = navFieldToWGSL({
      name: 'x',
      agents: 10,
      maxSpeed: 1,
      behaviors: [{ id: 'weird', behaviorType: 'teleport', params: {} }],
      traits: [],
    });
    expect(wgsl).toContain('WARNING');
    expect(wgsl).toContain('unknown behavior teleport');
  });
});
