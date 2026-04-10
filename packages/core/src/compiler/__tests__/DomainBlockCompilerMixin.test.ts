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
