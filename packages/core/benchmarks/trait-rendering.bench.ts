/**
 * Trait & Rendering Benchmarks -- Performance benchmark expansion (TODO-R2)
 *
 * TARGET: packages/benchmark/src/suites/trait-rendering.bench.ts
 *
 * New benchmarks covering:
 * - Trait resolution and composition (trait merging, conflict detection)
 * - Procedural geometry generation (hull, spline, membrane)
 * - Material property computation (PBR pipeline)
 * - GLTF export pipeline throughput
 * - Confabulation validation speed
 * - Contract evaluation performance
 *
 * @version 1.0.0
 */

import { Bench } from 'tinybench';

// =============================================================================
// MOCK DATA GENERATORS (standalone -- no runtime deps needed)
// =============================================================================

/**
 * Generate a mock trait configuration.
 */
function mockTraitConfig(traitName: string, propCount: number): Record<string, unknown> {
  const config: Record<string, unknown> = { __trait: traitName };
  for (let i = 0; i < propCount; i++) {
    config[`prop_${i}`] = Math.random();
  }
  return config;
}

/**
 * Generate a mock object with N traits.
 */
function mockObject(
  name: string,
  traitCount: number
): {
  name: string;
  traits: Record<string, unknown>[];
  properties: Record<string, unknown>;
} {
  const traits: Record<string, unknown>[] = [];
  const traitNames = [
    'physics',
    'grabbable',
    'throwable',
    'collidable',
    'glowing',
    'animated',
    'networked',
    'holdable',
    'hoverable',
    'clickable',
    'draggable',
    'scalable',
    'rotatable',
    'material',
    'shadow',
  ];

  for (let i = 0; i < traitCount; i++) {
    traits.push(mockTraitConfig(traitNames[i % traitNames.length], 5 + i));
  }

  return {
    name,
    traits,
    properties: {
      position: [Math.random() * 100, Math.random() * 50, Math.random() * 100],
      rotation: [0, Math.random() * Math.PI * 2, 0],
      scale: [1 + Math.random(), 1 + Math.random(), 1 + Math.random()],
      color: `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0')}`,
      geometry: ['sphere', 'cube', 'cylinder', 'cone'][Math.floor(Math.random() * 4)],
    },
  };
}

/**
 * Generate a mock composition with N objects.
 */
function mockComposition(
  objectCount: number,
  traitsPerObject: number
): {
  name: string;
  objects: ReturnType<typeof mockObject>[];
} {
  const objects = [];
  for (let i = 0; i < objectCount; i++) {
    objects.push(mockObject(`Object_${i}`, traitsPerObject));
  }
  return { name: 'BenchComposition', objects };
}

// =============================================================================
// TRAIT RESOLUTION SIMULATION
// =============================================================================

/**
 * Simulate trait merging: given an object and its templates,
 * merge trait configs with override semantics.
 */
function resolveTraits(
  objectTraits: Record<string, unknown>[],
  templateTraits: Record<string, unknown>[]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();

  // Template traits as base
  for (const trait of templateTraits) {
    const name = trait.__trait as string;
    merged.set(name, { ...trait });
  }

  // Object traits override template
  for (const trait of objectTraits) {
    const name = trait.__trait as string;
    const existing = merged.get(name);
    if (existing) {
      merged.set(name, { ...existing, ...trait });
    } else {
      merged.set(name, { ...trait });
    }
  }

  return Array.from(merged.values());
}

/**
 * Simulate conflict detection between traits.
 */
function detectConflicts(traits: Record<string, unknown>[]): string[] {
  const conflicts: string[] = [];
  const CONFLICT_PAIRS: [string, string][] = [
    ['static', 'physics'],
    ['kinematic', 'rigid'],
    ['transparent', 'opaque'],
    ['invisible', 'glowing'],
    ['frozen', 'animated'],
  ];

  const traitNames = new Set(traits.map((t) => t.__trait as string));

  for (const [a, b] of CONFLICT_PAIRS) {
    if (traitNames.has(a) && traitNames.has(b)) {
      conflicts.push(`${a} conflicts with ${b}`);
    }
  }

  return conflicts;
}

// =============================================================================
// MARCHING CUBES SIMULATION
// =============================================================================

/**
 * Simulate the core of marching cubes: scalar field evaluation.
 * This is the hottest loop in hull/metaball geometry generation.
 */
function evaluateScalarField(
  gridSize: number,
  blobs: Array<{ center: number[]; radius: number }>
): Float32Array {
  const total = gridSize * gridSize * gridSize;
  const field = new Float32Array(total);

  for (let z = 0; z < gridSize; z++) {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        let value = 0;
        const px = (x / gridSize) * 4 - 2;
        const py = (y / gridSize) * 4 - 2;
        const pz = (z / gridSize) * 4 - 2;

        for (const blob of blobs) {
          const dx = px - blob.center[0];
          const dy = py - blob.center[1];
          const dz = pz - blob.center[2];
          const distSq = dx * dx + dy * dy + dz * dz;
          value += (blob.radius * blob.radius) / (distSq + 0.001);
        }

        field[z * gridSize * gridSize + y * gridSize + x] = value;
      }
    }
  }

  return field;
}

/**
 * Simulate spline curve evaluation (Catmull-Rom).
 */
function evaluateSpline(points: number[][], segments: number): number[][] {
  const result: number[][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      const z =
        0.5 *
        (2 * p1[2] +
          (-p0[2] + p2[2]) * t +
          (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
          (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3);

      result.push([x, y, z]);
    }
  }

  return result;
}

// =============================================================================
// PBR MATERIAL COMPUTATION SIMULATION
// =============================================================================

/**
 * Simulate PBR material property computation from trait configs.
 */
function computePBRMaterial(props: Record<string, unknown>): Record<string, unknown> {
  const color = (props.color as string) || '#ffffff';
  const metallic = Math.max(0, Math.min(1, (props.metallic as number) || 0));
  const roughness = Math.max(0, Math.min(1, (props.roughness as number) || 0.5));
  const opacity = Math.max(0, Math.min(1, (props.opacity as number) || 1));
  const emissive = (props.emissive as string) || '#000000';
  const emissiveIntensity = Math.max(0, (props.emissiveIntensity as number) || 0);

  // Parse color to RGB
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;

  // Compute derived properties
  const ior = 1.5; // Index of refraction
  const transmission = opacity < 1 ? 1 - opacity : 0;
  const clearcoat = metallic > 0.8 ? 0.5 : 0;
  const clearcoatRoughness = roughness * 0.3;
  const reflectivity = ((ior - 1) / (ior + 1)) ** 2;
  const sheenRoughness = roughness > 0.7 ? roughness * 0.5 : 0;

  return {
    color: [r, g, b],
    metalness: metallic,
    roughness,
    opacity,
    transparent: opacity < 1,
    emissive,
    emissiveIntensity,
    ior,
    transmission,
    clearcoat,
    clearcoatRoughness,
    reflectivity,
    sheenRoughness,
    side: opacity < 1 ? 2 : 0, // DoubleSide for transparent
  };
}

// =============================================================================
// CONFABULATION VALIDATION SIMULATION
// =============================================================================

/**
 * Simulate confabulation validation for an agent-generated trait config.
 */
function validateTraitConfig(
  traitName: string,
  config: Record<string, unknown>,
  schema: Record<string, { type: string; min?: number; max?: number; values?: string[] }>
): { valid: boolean; errors: string[]; riskScore: number } {
  const errors: string[] = [];
  let riskScore = 0;

  for (const [prop, rule] of Object.entries(schema)) {
    const value = config[prop];

    if (value === undefined) continue;

    switch (rule.type) {
      case 'number':
        if (typeof value !== 'number') {
          errors.push(`${traitName}.${prop}: expected number, got ${typeof value}`);
          riskScore += 0.3;
        } else {
          if (rule.min !== undefined && value < rule.min) {
            errors.push(`${traitName}.${prop}: ${value} < min ${rule.min}`);
            riskScore += 0.2;
          }
          if (rule.max !== undefined && value > rule.max) {
            errors.push(`${traitName}.${prop}: ${value} > max ${rule.max}`);
            riskScore += 0.2;
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${traitName}.${prop}: expected boolean, got ${typeof value}`);
          riskScore += 0.1;
        }
        break;

      case 'enum':
        if (rule.values && !rule.values.includes(value as string)) {
          errors.push(
            `${traitName}.${prop}: invalid value '${value}', expected one of: ${rule.values.join(', ')}`
          );
          riskScore += 0.4;
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${traitName}.${prop}: expected string, got ${typeof value}`);
          riskScore += 0.1;
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    riskScore: Math.min(1, riskScore),
  };
}

// =============================================================================
// CONTRACT EVALUATION SIMULATION
// =============================================================================

interface MockCondition {
  evaluate: (props: Record<string, unknown>) => boolean;
}

function evaluateContracts(
  conditions: MockCondition[],
  props: Record<string, unknown>
): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  for (const cond of conditions) {
    try {
      if (cond.evaluate(props)) {
        passed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { passed, failed };
}

// =============================================================================
// GLTF EXPORT SIMULATION
// =============================================================================

/**
 * Simulate GLTF buffer serialization for geometry data.
 */
function serializeGeometryToBuffer(
  vertices: Float32Array,
  normals: Float32Array,
  indices: Uint32Array
): ArrayBuffer {
  const totalBytes = vertices.byteLength + normals.byteLength + indices.byteLength;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buffer);

  let offset = 0;
  view.set(new Uint8Array(vertices.buffer), offset);
  offset += vertices.byteLength;
  view.set(new Uint8Array(normals.buffer), offset);
  offset += normals.byteLength;
  view.set(new Uint8Array(indices.buffer), offset);

  return buffer;
}

// =============================================================================
// BENCHMARK SUITE
// =============================================================================

export async function runTraitRenderingBench(): Promise<Bench> {
  const bench = new Bench({ time: 1000 });

  // ---- Trait Resolution Benchmarks ----

  const smallObj = mockObject('Small', 3);
  const medObj = mockObject('Medium', 8);
  const largeObj = mockObject('Large', 15);
  const templateTraits = mockObject('Template', 5).traits;

  bench.add('trait-resolve-3-traits', () => {
    resolveTraits(smallObj.traits, templateTraits);
  });

  bench.add('trait-resolve-8-traits', () => {
    resolveTraits(medObj.traits, templateTraits);
  });

  bench.add('trait-resolve-15-traits', () => {
    resolveTraits(largeObj.traits, templateTraits);
  });

  // ---- Conflict Detection Benchmarks ----

  bench.add('conflict-detect-3-traits', () => {
    detectConflicts(smallObj.traits);
  });

  bench.add('conflict-detect-15-traits', () => {
    detectConflicts(largeObj.traits);
  });

  // ---- Composition Merging Benchmarks ----

  const smallComp = mockComposition(10, 3);
  const medComp = mockComposition(50, 5);
  const largeComp = mockComposition(200, 8);

  bench.add('composition-merge-10-objects', () => {
    for (const obj of smallComp.objects) {
      resolveTraits(obj.traits, templateTraits);
    }
  });

  bench.add('composition-merge-50-objects', () => {
    for (const obj of medComp.objects) {
      resolveTraits(obj.traits, templateTraits);
    }
  });

  bench.add('composition-merge-200-objects', () => {
    for (const obj of largeComp.objects) {
      resolveTraits(obj.traits, templateTraits);
    }
  });

  // ---- Scalar Field (Marching Cubes) Benchmarks ----

  const blob1 = [{ center: [0, 0, 0], radius: 1.0 }];
  const blob3 = [
    { center: [0, 0, 0], radius: 1.0 },
    { center: [1, 0, 0], radius: 0.8 },
    { center: [0, 1, 0], radius: 0.6 },
  ];
  const blob8 = Array.from({ length: 8 }, (_, i) => ({
    center: [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4), 0],
    radius: 0.5 + Math.random() * 0.5,
  }));

  bench.add('scalar-field-16x16x16-1-blob', () => {
    evaluateScalarField(16, blob1);
  });

  bench.add('scalar-field-16x16x16-3-blobs', () => {
    evaluateScalarField(16, blob3);
  });

  bench.add('scalar-field-32x32x32-3-blobs', () => {
    evaluateScalarField(32, blob3);
  });

  bench.add('scalar-field-32x32x32-8-blobs', () => {
    evaluateScalarField(32, blob8);
  });

  // ---- Spline Evaluation Benchmarks ----

  const splinePoints4 = [
    [0, 0, 0],
    [1, 2, 0],
    [3, 1, 0],
    [5, 3, 0],
  ];
  const splinePoints10 = Array.from({ length: 10 }, (_, i) => [
    i * 0.5,
    Math.sin(i * 0.5) * 2,
    Math.cos(i * 0.3),
  ]);

  bench.add('spline-4-points-20-segments', () => {
    evaluateSpline(splinePoints4, 20);
  });

  bench.add('spline-10-points-20-segments', () => {
    evaluateSpline(splinePoints10, 20);
  });

  bench.add('spline-10-points-50-segments', () => {
    evaluateSpline(splinePoints10, 50);
  });

  // ---- PBR Material Computation Benchmarks ----

  const simpleMat = { color: '#ff0000', metallic: 0, roughness: 0.5 };
  const complexMat = {
    color: '#88ccff',
    metallic: 0.9,
    roughness: 0.2,
    opacity: 0.7,
    emissive: '#001133',
    emissiveIntensity: 0.5,
    transmission: 0.3,
    ior: 1.52,
  };

  bench.add('pbr-material-simple', () => {
    computePBRMaterial(simpleMat);
  });

  bench.add('pbr-material-complex', () => {
    computePBRMaterial(complexMat);
  });

  bench.add('pbr-material-batch-100', () => {
    for (let i = 0; i < 100; i++) {
      computePBRMaterial({
        color: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, '0')}`,
        metallic: Math.random(),
        roughness: Math.random(),
        opacity: 0.5 + Math.random() * 0.5,
      });
    }
  });

  // ---- Confabulation Validation Benchmarks ----

  const physicsSchema = {
    mass: { type: 'number', min: 0, max: 10000 },
    restitution: { type: 'number', min: 0, max: 1 },
    friction: { type: 'number', min: 0, max: 1 },
    isStatic: { type: 'boolean' },
    linearDamping: { type: 'number', min: 0, max: 1 },
    angularDamping: { type: 'number', min: 0, max: 1 },
  };

  const validConfig = { mass: 5, restitution: 0.5, friction: 0.3, isStatic: false };
  const invalidConfig = {
    mass: -1,
    restitution: 2.0,
    friction: 'high' as unknown as number,
    isStatic: 42,
  };

  bench.add('confab-validate-valid-config', () => {
    validateTraitConfig('physics', validConfig, physicsSchema);
  });

  bench.add('confab-validate-invalid-config', () => {
    validateTraitConfig('physics', invalidConfig, physicsSchema);
  });

  bench.add('confab-validate-batch-50-configs', () => {
    for (let i = 0; i < 50; i++) {
      validateTraitConfig(
        'physics',
        {
          mass: Math.random() * 200 - 50,
          restitution: Math.random() * 2 - 0.5,
          friction: Math.random(),
          isStatic: Math.random() > 0.5,
        },
        physicsSchema
      );
    }
  });

  // ---- Contract Evaluation Benchmarks ----

  const physicsConditions: MockCondition[] = [
    { evaluate: (p) => ((p.mass as number) ?? 1) >= 0 },
    {
      evaluate: (p) => {
        const r = (p.restitution as number) ?? 0.5;
        return r >= 0 && r <= 1;
      },
    },
    {
      evaluate: (p) => {
        const f = (p.friction as number) ?? 0.5;
        return f >= 0 && f <= 1;
      },
    },
    { evaluate: (p) => typeof p.isStatic === 'boolean' },
  ];

  const manyConditions: MockCondition[] = Array.from({ length: 20 }, (_, i) => ({
    evaluate: (p: Record<string, unknown>) => {
      const val = (p[`prop_${i}`] as number) ?? 0;
      return val >= -100 && val <= 100;
    },
  }));

  bench.add('contract-eval-4-conditions', () => {
    evaluateContracts(physicsConditions, validConfig);
  });

  bench.add('contract-eval-20-conditions', () => {
    evaluateContracts(manyConditions, mockTraitConfig('test', 20));
  });

  bench.add('contract-eval-batch-100-objects', () => {
    for (let i = 0; i < 100; i++) {
      evaluateContracts(physicsConditions, {
        mass: Math.random() * 20 - 5,
        restitution: Math.random() * 1.5 - 0.25,
        friction: Math.random(),
        isStatic: Math.random() > 0.5,
      });
    }
  });

  // ---- GLTF Buffer Serialization Benchmarks ----

  const smallGeo = {
    vertices: new Float32Array(300), // 100 vertices * 3
    normals: new Float32Array(300),
    indices: new Uint32Array(600), // 200 triangles * 3
  };
  const medGeo = {
    vertices: new Float32Array(3000),
    normals: new Float32Array(3000),
    indices: new Uint32Array(6000),
  };
  const largeGeo = {
    vertices: new Float32Array(30000),
    normals: new Float32Array(30000),
    indices: new Uint32Array(60000),
  };

  // Fill with random data
  for (let i = 0; i < smallGeo.vertices.length; i++) smallGeo.vertices[i] = Math.random() * 10;
  for (let i = 0; i < medGeo.vertices.length; i++) medGeo.vertices[i] = Math.random() * 10;
  for (let i = 0; i < largeGeo.vertices.length; i++) largeGeo.vertices[i] = Math.random() * 10;

  bench.add('gltf-buffer-100-vertices', () => {
    serializeGeometryToBuffer(smallGeo.vertices, smallGeo.normals, smallGeo.indices);
  });

  bench.add('gltf-buffer-1000-vertices', () => {
    serializeGeometryToBuffer(medGeo.vertices, medGeo.normals, medGeo.indices);
  });

  bench.add('gltf-buffer-10000-vertices', () => {
    serializeGeometryToBuffer(largeGeo.vertices, largeGeo.normals, largeGeo.indices);
  });

  await bench.run();
  return bench;
}
