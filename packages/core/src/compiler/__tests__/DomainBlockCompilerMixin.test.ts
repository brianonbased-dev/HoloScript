/**
 * DomainBlockCompilerMixin Tests
 *
 * Tests material/physics compilation and target-specific code generation
 * (R3F, USD, glTF, URDF) from domain block AST nodes.
 */
import { describe, it, expect } from 'vitest';
import {
  compileMaterialBlock,
  compilePhysicsBlock,
  materialToR3F,
  materialToUSD,
  materialToGLTF,
  physicsToURDF,
  compileSimulationBlock,
  simulationToR3F,
  compileDomainBlocks,
} from '../DomainBlockCompilerMixin';

// Helper: create mock domain block
function mockBlock(overrides: any = {}) {
  return {
    type: 'DomainBlock',
    keyword: 'material',
    name: 'TestMat',
    domain: 'material',
    properties: { baseColor: '#ff0000', roughness: 0.5, metallic: 0.8 },
    traits: ['pbr'],
    children: [],
    ...overrides,
  };
}

describe('compileMaterialBlock', () => {
  it('compiles a PBR material block', () => {
    const mat = compileMaterialBlock(mockBlock());
    expect(mat.name).toBe('TestMat');
    expect(mat.type).toBe('pbr');
    expect(mat.baseColor).toBe('#ff0000');
    expect(mat.roughness).toBe(0.5);
    expect(mat.metallic).toBe(0.8);
    expect(mat.traits).toContain('pbr');
  });

  it('compiles an unlit material', () => {
    const mat = compileMaterialBlock(
      mockBlock({
        keyword: 'unlit_material',
        properties: { emissive_color: '#00ff00' },
      })
    );
    expect(mat.type).toBe('unlit');
    expect(mat.emissiveColor).toBe('#00ff00');
  });

  it('extracts texture maps', () => {
    const mat = compileMaterialBlock(
      mockBlock({
        properties: {
          baseColor: '#fff',
          albedo_map: 'tex/diffuse.png',
          normal_map: 'tex/normal.png',
          roughness: 0.5,
        },
      })
    );
    expect(mat.textureMaps.albedo_map).toBe('tex/diffuse.png');
    expect(mat.textureMaps.normal_map).toBe('tex/normal.png');
    expect(mat.baseColor).toBe('#fff');
  });

  it('handles missing name', () => {
    const mat = compileMaterialBlock(mockBlock({ name: undefined }));
    expect(mat.name).toBe('unnamed');
  });
});

describe('compilePhysicsBlock', () => {
  it('compiles a rigidbody block', () => {
    const p = compilePhysicsBlock(
      mockBlock({
        keyword: 'rigidbody',
        domain: 'physics',
        properties: { mass: 10, use_gravity: true },
      })
    );
    expect(p.keyword).toBe('rigidbody');
    expect(p.properties.mass).toBe(10);
  });

  it('extracts nested joint children', () => {
    const p = compilePhysicsBlock(
      mockBlock({
        keyword: 'articulation',
        domain: 'physics',
        children: [
          { type: 'DomainBlock', keyword: 'hinge', name: 'elbow', properties: { axis: [0, 1, 0] } },
          {
            type: 'DomainBlock',
            keyword: 'slider',
            name: 'piston',
            properties: { limits: [0, 1] },
          },
        ],
      })
    );
    expect(p.joints).toBeDefined();
    expect(p.joints!.length).toBe(2);
    expect(p.joints![0].keyword).toBe('hinge');
    expect(p.joints![1].name).toBe('piston');
  });

  it('no joints when no DomainBlock children', () => {
    const p = compilePhysicsBlock(
      mockBlock({
        keyword: 'collider',
        domain: 'physics',
        children: [{ type: 'other' }],
      })
    );
    expect(p.joints).toBeUndefined();
  });
});

// ── Target outputs ──────────────────────────────────────────────────────

describe('materialToR3F', () => {
  it('generates meshStandardMaterial JSX', () => {
    const mat = compileMaterialBlock(mockBlock());
    const jsx = materialToR3F(mat);
    expect(jsx).toContain('meshStandardMaterial');
    expect(jsx).toContain('color="#ff0000"');
    expect(jsx).toContain('roughness={0.5}');
    expect(jsx).toContain('metalness={0.8}');
  });

  it('generates meshBasicMaterial for unlit', () => {
    const mat = compileMaterialBlock(
      mockBlock({
        keyword: 'unlit_material',
        properties: { emissive_color: '#00ff00', emissive_intensity: 2 },
      })
    );
    const jsx = materialToR3F(mat);
    expect(jsx).toContain('meshBasicMaterial');
    expect(jsx).toContain('emissive="#00ff00"');
  });

  it('promotes to meshPhysicalMaterial when a physical effect is declared', () => {
    const mat = compileMaterialBlock(
      mockBlock({
        properties: {
          baseColor: '#ffc0cb',
          roughness: 0.4,
          clearcoat: 0.8,
          clearcoat_roughness: 0.2,
          transmission: 0.3,
          thickness: 1.5,
          sheen: 0.6,
          sheen_color: '#ffe0e0',
          ior: 1.4,
        },
      })
    );
    const jsx = materialToR3F(mat);
    expect(jsx).toContain('meshPhysicalMaterial');
    expect(jsx).not.toContain('meshStandardMaterial');
    expect(jsx).toContain('clearcoat={0.8}');
    expect(jsx).toContain('clearcoatRoughness={0.2}');
    expect(jsx).toContain('transmission={0.3}');
    expect(jsx).toContain('thickness={1.5}');
    expect(jsx).toContain('sheen={0.6}');
    expect(jsx).toContain('sheenColor="#ffe0e0"');
    expect(jsx).toContain('ior={1.4}'); // ior rides along on physical
    expect(jsx).toContain('color="#ffc0cb"'); // standard props preserved
    expect(jsx).toContain('roughness={0.4}');
  });

  it('does NOT promote for ior alone (StandardMaterial has no ior — dropped harmlessly)', () => {
    const mat = compileMaterialBlock(mockBlock({ properties: { baseColor: '#fff', ior: 1.5 } }));
    const jsx = materialToR3F(mat);
    expect(jsx).toContain('meshStandardMaterial');
    expect(jsx).not.toContain('meshPhysicalMaterial');
    expect(jsx).not.toContain('ior=');
  });

  it('plain PBR (no physical props) stays meshStandardMaterial', () => {
    const jsx = materialToR3F(compileMaterialBlock(mockBlock()));
    expect(jsx).toContain('meshStandardMaterial');
    expect(jsx).not.toContain('meshPhysicalMaterial');
  });
});

describe('compileMaterialBlock — physical props', () => {
  it('parses clearcoat/transmission/sheen/ior (snake_case)', () => {
    const mat = compileMaterialBlock(
      mockBlock({
        properties: {
          clearcoat: 0.9,
          clearcoat_roughness: 0.1,
          transmission: 0.5,
          sheen_color: '#abcdef',
          attenuation_distance: 2.0,
        },
      })
    );
    expect(mat.clearcoat).toBe(0.9);
    expect(mat.clearcoatRoughness).toBe(0.1);
    expect(mat.transmission).toBe(0.5);
    expect(mat.sheenColor).toBe('#abcdef');
    expect(mat.attenuationDistance).toBe(2.0);
  });
});

describe('materialToUSD', () => {
  it('generates USD material prim', () => {
    const mat = compileMaterialBlock(mockBlock());
    const usd = materialToUSD(mat);
    expect(usd).toContain('def Material "TestMat"');
    expect(usd).toContain('UsdPreviewSurface');
    expect(usd).toContain('inputs:roughness = 0.5');
    expect(usd).toContain('inputs:metallic = 0.8');
  });
});

describe('materialToGLTF', () => {
  it('generates glTF material object', () => {
    const mat = compileMaterialBlock(mockBlock());
    const gltf = materialToGLTF(mat) as any;
    expect(gltf.name).toBe('TestMat');
    expect(gltf.pbrMetallicRoughness).toBeDefined();
    expect(gltf.pbrMetallicRoughness.metallicFactor).toBe(0.8);
    expect(gltf.pbrMetallicRoughness.roughnessFactor).toBe(0.5);
  });

  it('includes emissive factor', () => {
    const mat = compileMaterialBlock(
      mockBlock({
        properties: { baseColor: '#fff', emissive_color: '#ff0000' },
      })
    );
    const gltf = materialToGLTF(mat) as any;
    expect(gltf.emissiveFactor).toBeDefined();
  });
});

describe('physicsToURDF', () => {
  it('generates URDF articulation joints', () => {
    const p = compilePhysicsBlock(
      mockBlock({
        keyword: 'articulation',
        domain: 'physics',
        children: [
          {
            type: 'DomainBlock',
            keyword: 'hinge',
            name: 'elbow',
            properties: { axis: [0, 1, 0], damping: 0.5 },
          },
        ],
      })
    );
    const urdf = physicsToURDF(p);
    expect(urdf).toContain('<joint name="elbow" type="revolute">');
    expect(urdf).toContain('xyz="0 1 0"');
    expect(urdf).toContain('damping="0.5"');
  });

  it('generates comment for non-articulation', () => {
    const p = compilePhysicsBlock(mockBlock({ keyword: 'collider', domain: 'physics' }));
    const urdf = physicsToURDF(p);
    expect(urdf).toContain('<!-- collider');
  });
});

// ── Domain block router ─────────────────────────────────────────────────

describe('compileSimulationBlock perceptual color overlays', () => {
  it('attaches perceptual color metadata to scalar field overlays', () => {
    const sim = compileSimulationBlock(
      mockBlock({
        keyword: 'simulation',
        domain: 'simulation',
        traits: ['thermal_simulation'],
        children: [
          {
            type: 'DomainBlock',
            keyword: 'scalar_field_overlay',
            traits: ['scalar_field_overlay'],
            properties: {
              colormap: 'cividis',
              steps: 4,
              source: 'temperature',
            },
          },
        ],
      })
    );

    expect(sim.overlays[0].perceptualColorPass?.mapName).toBe('cividis');
    expect(sim.overlays[0].perceptualColorPass?.colors).toHaveLength(4);
    expect(simulationToR3F(sim)).toContain('PerceptualColorPass');
  });
});

describe('compileDomainBlocks', () => {
  it('routes blocks to handler', () => {
    const blocks = [
      mockBlock({ domain: 'material' }),
      mockBlock({ keyword: 'rigidbody', domain: 'physics' }),
    ];
    const results = compileDomainBlocks(blocks, {
      material: () => 'MAT_OUTPUT',
      physics: () => 'PHYSICS_OUTPUT',
    } as any);
    expect(results).toEqual(['MAT_OUTPUT', 'PHYSICS_OUTPUT']);
  });

  it('uses fallback for unhandled domains', () => {
    const blocks = [mockBlock({ domain: 'weather' as any })];
    const results = compileDomainBlocks(blocks, {}, () => 'FALLBACK');
    expect(results).toEqual(['FALLBACK']);
  });

  it('generates comment for unhandled without fallback', () => {
    const blocks = [mockBlock({ keyword: 'weather', domain: 'weather' as any, name: 'Rain' })];
    const results = compileDomainBlocks(blocks, {});
    expect(results[0]).toContain('Unhandled domain block');
  });
});
