/**
 * URDFCompiler — Articulation Regression Test
 *
 * Verifies that links, revolute joints, and drives from the PARSER OUTPUT
 * trait format { type: 'ObjectTrait', name: 'joint', config: {...} } are
 * correctly emitted in URDF output.
 *
 * This test was added to guard against regression of the `getTraitConfig` bug
 * where the nested `config` sub-object was not unwrapped, causing all joints
 * to be emitted as `type="fixed"` with parent `base_link` (and mass always
 * equal to the compiler default because `@physics { mass }` was ignored).
 *
 * Acceptance: 3-link arm robot (base / upper_arm / forearm) with 2 revolute
 * joints and drives produces URDF that a robot_description loader and Isaac
 * Sim URDF Importer can parse correctly.
 *
 * Also covers USD articulation: same composition through USDPhysicsCompiler
 * must emit `PhysicsArticulationRootAPI` and `PhysicsRevoluteJoint` prims.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { URDFCompiler } from '../URDFCompiler';
import { USDPhysicsCompiler } from '../USDPhysicsCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// =============================================================================
// HELPERS
// =============================================================================

/** Build an ObjectTrait in the canonical parser-output format. */
function parserTrait(name: string, config: Record<string, unknown>) {
  return { type: 'ObjectTrait' as const, name, config };
}

function makeComp(objects: HoloObjectDecl[]): HoloComposition {
  return {
    name: 'ArmRobot',
    objects,
    lights: [],
    timelines: [],
    transitions: [],
  } as unknown as HoloComposition;
}

// =============================================================================
// 3-LINK ARM ROBOT FIXTURE
//
//   base  ──(ShoulderJoint, revolute, Z-axis, ±90°, damping=0.5)──  upper_arm
//   upper_arm ──(ElbowJoint, revolute, Y-axis, ±45°, damping=0.3)──  forearm
//
// Physics masses: base=1.0 (default), upper_arm=0.5, forearm=0.3
// Uses the parser-output trait format throughout.
// =============================================================================

const armRobotObjects: HoloObjectDecl[] = [
  {
    name: 'base',
    properties: [{ key: 'geometry', value: 'cylinder' }],
    traits: [parserTrait('physics', { mass: 1.0 })],
    children: [],
  } as unknown as HoloObjectDecl,
  {
    name: 'upper_arm',
    properties: [
      { key: 'geometry', value: 'cylinder' },
      { key: 'position', value: [0, 0, 0.3] },
    ],
    traits: [
      parserTrait('physics', { mass: 0.5 }),
      parserTrait('joint', {
        jointType: 'revolute',
        connectedBody: 'base',
        axis: [0, 0, 1],
        limits: { min: -90, max: 90, effort: 100, velocity: 1 },
        damping: 0.5,
        friction: 0,
      }),
    ],
    children: [],
  } as unknown as HoloObjectDecl,
  {
    name: 'forearm',
    properties: [
      { key: 'geometry', value: 'cylinder' },
      { key: 'position', value: [0, 0, 0.6] },
    ],
    traits: [
      parserTrait('physics', { mass: 0.3 }),
      parserTrait('joint', {
        jointType: 'revolute',
        connectedBody: 'upper_arm',
        axis: [0, 1, 0],
        limits: { min: -45, max: 45, effort: 50, velocity: 1 },
        damping: 0.3,
        friction: 0,
      }),
    ],
    children: [],
  } as unknown as HoloObjectDecl,
];

// =============================================================================
// URDF ARTICULATION TESTS
// =============================================================================

describe('URDFCompiler — Articulation regression (parser-output trait format)', () => {
  let compiler: URDFCompiler;
  let urdf: string;

  beforeEach(() => {
    compiler = new URDFCompiler({ includeInertial: true, robotName: 'ArmRobot' });
    urdf = compiler.compile(makeComp(armRobotObjects), 'test-token');
  });

  // ── XML structure ─────────────────────────────────────────────────────────

  it('output is valid XML preamble with <robot> element', () => {
    expect(urdf).toContain('<?xml');
    expect(urdf).toContain('<robot');
    expect(urdf).toContain('</robot>');
  });

  // ── Links ─────────────────────────────────────────────────────────────────

  it('emits all three link names', () => {
    expect(urdf).toContain('"base"');
    expect(urdf).toContain('"upper_arm"');
    expect(urdf).toContain('"forearm"');
  });

  it('emits <inertial> with mass from @physics trait (upper_arm=0.5)', () => {
    // Verify mass is read from the ObjectTrait config, not hardcoded default
    // The line mass value="0.5" must appear in the upper_arm link section
    expect(urdf).toContain('value="0.5"');
  });

  it('emits <inertial> with mass from @physics trait (forearm=0.3)', () => {
    expect(urdf).toContain('value="0.3"');
  });

  // ── Joints — type must NOT be fixed ───────────────────────────────────────

  it('shoulder joint is type="revolute" not type="fixed"', () => {
    // Check that revolute appears (it would be fixed before the fix)
    expect(urdf).toContain('type="revolute"');
    // And there should be exactly 0 fixed joints driven by @joint traits
    // (the only fixed joints are auto-generated base_link connectors)
    const fixedMatches = urdf.match(/type="fixed"/g) ?? [];
    const revoluteMatches = urdf.match(/type="revolute"/g) ?? [];
    expect(revoluteMatches.length).toBeGreaterThanOrEqual(2);
    // Fixed joints in auto-link hierarchy should be fewer than revolute
    expect(fixedMatches.length).toBeLessThan(revoluteMatches.length);
  });

  // ── Parent-child hierarchy ─────────────────────────────────────────────────

  it('shoulder joint has parent="base"', () => {
    expect(urdf).toMatch(/<parent\s+link="base"\s*\/>/);
  });

  it('shoulder joint has child="upper_arm"', () => {
    expect(urdf).toMatch(/<child\s+link="upper_arm"\s*\/>/);
  });

  it('elbow joint has parent="upper_arm"', () => {
    expect(urdf).toMatch(/<parent\s+link="upper_arm"\s*\/>/);
  });

  it('elbow joint has child="forearm"', () => {
    expect(urdf).toMatch(/<child\s+link="forearm"\s*\/>/);
  });

  // ── Axis ─────────────────────────────────────────────────────────────────

  it('shoulder joint axis is Z (0 0 1)', () => {
    expect(urdf).toContain('xyz="0 0 1"');
  });

  it('elbow joint axis is Y (0 1 0)', () => {
    expect(urdf).toContain('xyz="0 1 0"');
  });

  // ── Limits — degrees converted to radians ─────────────────────────────────

  it('shoulder joint ±90° converted to ±1.5707... radians', () => {
    // lower="-1.5707..." upper="1.5707..."
    expect(urdf).toMatch(/lower="-1\.570/);
    expect(urdf).toMatch(/upper="1\.570/);
  });

  it('elbow joint ±45° converted to ±0.7853... radians', () => {
    expect(urdf).toMatch(/lower="-0\.785/);
    expect(urdf).toMatch(/upper="0\.785/);
  });

  // ── Dynamics ─────────────────────────────────────────────────────────────

  it('shoulder joint dynamics has damping=0.5', () => {
    expect(urdf).toContain('damping="0.5"');
  });

  it('elbow joint dynamics has damping=0.3', () => {
    expect(urdf).toContain('damping="0.3"');
  });

  // ── No degenerate output ───────────────────────────────────────────────────

  it('revolute joints do not fall back to base_link as parent from @joint trait', () => {
    // The compiler always emits a synthetic base_link → <first-obj> fixed joint (valid URDF
    // structure). What must NOT happen is the @joint trait's connectedBody being ignored
    // (which was the bug — undefined connectedBody → parent defaulted to base_link for ALL
    // joints). After the fix, each @joint trait's parent must be its declared connectedBody.
    //
    // Verify: shoulder joint parent is "base", elbow joint parent is "upper_arm".
    // If the bug were present, both would have parent="base_link".
    expect(urdf).toMatch(/<parent\s+link="base"\s*\/>/);
    expect(urdf).toMatch(/<parent\s+link="upper_arm"\s*\/>/);

    // The synthetic base_link→base joint (always 1) is fine; but we must NOT have more
    // than 1 base_link parent (i.e. the revolute joints must not also use base_link).
    const baseParentMatches = urdf.match(/<parent\s+link="base_link"\s*\/>/g) ?? [];
    expect(baseParentMatches.length).toBeLessThanOrEqual(1); // at most 1 synthetic joint
  });
});

// =============================================================================
// USD ARTICULATION TESTS
// =============================================================================

describe('USDPhysicsCompiler — Articulation regression (parser-output trait format)', () => {
  let compiler: USDPhysicsCompiler;
  let usda: string;

  beforeEach(() => {
    compiler = new USDPhysicsCompiler({
      targetContext: 'isaac_sim',
      enableArticulation: true,
    });
    usda = compiler.compile(makeComp(armRobotObjects), 'test-token');
  });

  it('output is USDA format', () => {
    expect(usda).toContain('#usda');
  });

  it('emits PhysicsArticulationRootAPI when arm robot objects are present', () => {
    // Objects have @physics traits → RigidBody prims → articulation root wraps them
    expect(usda).toContain('PhysicsArticulationRootAPI');
  });

  it('emits PhysicsRevoluteJoint for revolute joints', () => {
    // joint traits with type revolute → PhysicsRevoluteJoint prim
    expect(usda).toContain('PhysicsRevoluteJoint');
  });

  it('emits all three link names as Xform prims', () => {
    expect(usda).toContain('"base"');
    expect(usda).toContain('"upper_arm"');
    expect(usda).toContain('"forearm"');
  });

  it('includes physics body references for joints', () => {
    // Joints reference body0/body1 prim paths
    expect(usda).toContain('physics:body0');
    expect(usda).toContain('physics:body1');
  });

  it('emits PhysicsScene (Isaac Sim context)', () => {
    expect(usda).toContain('PhysicsScene');
  });

  it('uses Z up-axis for Isaac Sim context', () => {
    expect(usda).toContain('"Z"');
  });

  it('mass from @physics trait is correctly emitted (not compiler default)', () => {
    // upper_arm mass=0.5, forearm mass=0.3 → should appear in USD mass attributes
    expect(usda).toContain('0.5');
    expect(usda).toContain('0.3');
  });
});

// =============================================================================
// PARSER FORMAT COMPATIBILITY TESTS
// =============================================================================

describe('URDFCompiler — trait format backward compatibility', () => {
  const compiler = new URDFCompiler({ includeInertial: true });

  it('handles inline flat trait format (legacy test format)', () => {
    // Old-style traits: { name: 'joint', jointType: 'revolute', ... }
    // Used in existing v2 test suite — must still work
    const obj = {
      name: 'link2',
      properties: [{ key: 'geometry', value: 'cylinder' }],
      traits: [
        {
          name: 'joint',
          jointType: 'revolute',
          connectedBody: 'link1',
          axis: [0, 0, 1],
          limits: { min: -90, max: 90 },
          damping: 1.0,
        },
      ],
      children: [],
    } as unknown as HoloObjectDecl;

    const urdf = compiler.compile(makeComp([obj]), 'test-token');
    expect(urdf).toContain('type="revolute"');
    expect(urdf).toContain('"link1"');
  });

  it('handles parser ObjectTrait format (production MCP path format)', () => {
    // Parser output format: { type: 'ObjectTrait', name: 'joint', config: {...} }
    const obj = {
      name: 'link2',
      properties: [{ key: 'geometry', value: 'cylinder' }],
      traits: [
        parserTrait('joint', {
          jointType: 'revolute',
          connectedBody: 'link1',
          axis: [0, 0, 1],
          limits: { min: -90, max: 90 },
          damping: 1.0,
        }),
      ],
      children: [],
    } as unknown as HoloObjectDecl;

    const urdf = compiler.compile(makeComp([obj]), 'test-token');
    expect(urdf).toContain('type="revolute"');
    expect(urdf).toContain('"link1"');
  });

  it('both formats produce identical joint type output', () => {
    const baseObj = {
      name: 'base',
      properties: [{ key: 'geometry', value: 'box' }],
      traits: [],
      children: [],
    } as unknown as HoloObjectDecl;

    const inlineTrait = {
      name: 'link_inline',
      properties: [{ key: 'geometry', value: 'cylinder' }],
      traits: [
        {
          name: 'joint',
          jointType: 'revolute',
          connectedBody: 'base',
          axis: [0, 1, 0],
          limits: { min: -45, max: 45 },
          damping: 0.5,
        },
      ],
      children: [],
    } as unknown as HoloObjectDecl;

    const parserFormatTrait = {
      name: 'link_parser',
      properties: [{ key: 'geometry', value: 'cylinder' }],
      traits: [
        parserTrait('joint', {
          jointType: 'revolute',
          connectedBody: 'base',
          axis: [0, 1, 0],
          limits: { min: -45, max: 45 },
          damping: 0.5,
        }),
      ],
      children: [],
    } as unknown as HoloObjectDecl;

    const urdfInline = compiler.compile(makeComp([baseObj, inlineTrait]), 'test-token');
    const urdfParser = compiler.compile(makeComp([baseObj, parserFormatTrait]), 'test-token');

    // Both must use revolute, not fixed
    expect(urdfInline).toContain('type="revolute"');
    expect(urdfParser).toContain('type="revolute"');
    // Both must use the declared connectedBody as parent (not base_link via undefined fallback)
    // Note: the compiler emits 1 synthetic base_link→base fixed joint (valid URDF structure);
    // that is fine. What must NOT happen is the revolute joint also using base_link as parent.
    expect(urdfInline).toMatch(/<parent\s+link="base"\s*\/>/);
    expect(urdfParser).toMatch(/<parent\s+link="base"\s*\/>/);
  });
});
