import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { TSLCompiler } from '../TSLCompiler';
import { compileLightFieldBlock, lightFieldToWGSL } from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

const EXAMPLE = readFileSync(join(__dirname, '../../parser/examples/light-field.holo'), 'utf8');

function parseFirstLightField(source: string): HoloDomainBlock {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  expect(result.success).toBe(true);
  const block = result.ast!.domainBlocks!.find((b) => b.domain === 'light_field');
  expect(block).toBeDefined();
  return block!;
}

describe('light_field — parse to IR', () => {
  it('registers as its own domain with GI scalars + a light stack', () => {
    const block = parseFirstLightField(EXAMPLE);
    expect(block.domain).toBe('light_field');
    expect(block.keyword).toBe('light_field');
    expect(block.name).toBe('interior');
    const props = block.properties as Record<string, unknown>;
    expect(props.ambient).toBe('#202028');
    expect(props.bounces).toBe(2);
    expect((props.sun as Record<string, unknown>).type).toBe('directional');
  });

  it('separates GI config from typed lights', () => {
    const field = compileLightFieldBlock(parseFirstLightField(EXAMPLE));
    expect(field.ambient).toBe('#202028');
    expect(field.bounces).toBe(2);
    expect(field.lights).toHaveLength(3);
    expect(field.lights.map((l) => l.lightType)).toEqual(['directional', 'point', 'ambient']);
    const fill = field.lights.find((l) => l.id === 'fill');
    expect(fill?.params.range).toBe(12);
  });
});

describe('light_field — lower to WGSL', () => {
  it('emits a lighting function via the TSLCompiler domain-block path', () => {
    const out = new TSLCompiler().compile(new HoloCompositionParser().parse(EXAMPLE).ast!);
    const key = '_domain.light_field.interior.wgsl';
    expect(out[key]).toBeDefined();
    expect(out[key]).toContain(
      'fn evalLightField_interior(worldPos: vec3<f32>, N: vec3<f32>, V: vec3<f32>, albedo: vec3<f32>'
    );
  });

  it('accumulates every light plus a bounce-scaled GI ambient base', () => {
    const { wgsl } = lightFieldToWGSL(compileLightFieldBlock(parseFirstLightField(EXAMPLE)));
    // GI base: ambient #202028 → vec3, scaled by intensity*(1 + bounces*0.5) = 1*(1+2*0.5)=2
    expect(wgsl).toContain(
      'radiance += albedo * vec3<f32>(0.1255, 0.1255, 0.1569) * (1.0000 * (1.0 + f32(2) * 0.5));'
    );
    // directional sun uses a normalized negated direction + NdotL
    expect(wgsl).toContain('// directional:sun');
    expect(wgsl).toContain('let NdotL = max(dot(N, L), 0.0);');
    // point fill uses distance attenuation
    expect(wgsl).toContain('// point:fill');
    expect(wgsl).toContain('let atten = 1.0 / (1.0 + (dist * dist)');
    // ambient sky is a flat albedo*color term
    expect(wgsl).toContain('// ambient:sky');
  });

  it('orders light contributions as declared', () => {
    const { wgsl } = lightFieldToWGSL(compileLightFieldBlock(parseFirstLightField(EXAMPLE)));
    const iSun = wgsl.indexOf('// directional:sun');
    const iFill = wgsl.indexOf('// point:fill');
    const iSky = wgsl.indexOf('// ambient:sky');
    expect(iFill).toBeGreaterThan(iSun);
    expect(iSky).toBeGreaterThan(iFill);
  });
});

describe('light_field — robustness', () => {
  it('applies GI defaults and a directional default direction', () => {
    const parser = new HoloCompositionParser();
    const r = parser.parse(
      `composition "X" { light_field "l" { key { type: "directional", color: "#ffffff" } } }`
    );
    const field = compileLightFieldBlock(
      r.ast!.domainBlocks!.find((b) => b.domain === 'light_field')!
    );
    expect(field.ambient).toBe('#000000');
    expect(field.bounces).toBe(1);
    const { wgsl } = lightFieldToWGSL(field);
    expect(wgsl).toContain('normalize(-vec3<f32>(0.0000, -1.0000, 0.0000))'); // default downward sun
  });

  it('warns and skips an unknown light type', () => {
    const { wgsl } = lightFieldToWGSL({
      name: 'x',
      ambient: '#000000',
      bounces: 1,
      intensity: 1,
      lights: [{ id: 'weird', lightType: 'black_hole', params: {} }],
      traits: [],
    });
    expect(wgsl).toContain('WARNING');
    expect(wgsl).toContain('unknown light black_hole');
  });
});
