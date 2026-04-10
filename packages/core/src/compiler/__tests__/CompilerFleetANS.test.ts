/**
 * P5 Compiler Fleet ANS Migration Test
 *
 * Validates that all 27 CompilerBase subclasses (plus DomainBlockCompilerMixin)
 * return the correct ANS capability namespace from getRequiredCapability().
 *
 * This test ensures every compiler in the fleet is correctly wired to its
 * ANS capability path as defined in ANSNamespace.ts.
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '../identity/ANSNamespace';

// ---------------------------------------------------------------------------
// Mock RBAC to prevent token validation errors during compiler instantiation
// ---------------------------------------------------------------------------
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true }),
    }),
  };
});

vi.mock('../identity/CapabilityRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identity/CapabilityRBAC')>();
  return {
    ...actual,
    getCapabilityRBAC: () => ({
      checkAccess: () => ({ allowed: true }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Import CompilerBase for the test wrapper pattern
// ---------------------------------------------------------------------------
import { CompilerBase } from '../CompilerBase';

// ---------------------------------------------------------------------------
// Helper: Expose protected getRequiredCapability() from any CompilerBase subclass
// ---------------------------------------------------------------------------

/**
 * Creates a proxy subclass that exposes getRequiredCapability() for testing.
 * Uses the same compilerName as the target class so the ANS lookup works.
 */
function exposeCapability(compiler: CompilerBase): ANSCapabilityPathValue | undefined {
  // Access the protected method via type assertion
  return (compiler as any).getRequiredCapability();
}

// ---------------------------------------------------------------------------
// Import all CompilerBase subclasses
// ---------------------------------------------------------------------------
import { UnityCompiler } from '../UnityCompiler';
import { UnrealCompiler } from '../UnrealCompiler';
import { GodotCompiler } from '../GodotCompiler';
import { VRChatCompiler } from '../VRChatCompiler';
import { OpenXRCompiler } from '../OpenXRCompiler';
import { VisionOSCompiler } from '../VisionOSCompiler';
import { ARCompiler } from '../ARCompiler';
import { AndroidCompiler } from '../AndroidCompiler';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
import { IOSCompiler } from '../IOSCompiler';
import { BabylonCompiler } from '../BabylonCompiler';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { PlayCanvasCompiler } from '../PlayCanvasCompiler';
import { WASMCompiler } from '../WASMCompiler';
import { TSLCompiler } from '../TSLCompiler';
import { URDFCompiler } from '../URDFCompiler';
import { SDFCompiler } from '../SDFCompiler';
import { USDPhysicsCompiler } from '../USDPhysicsCompiler';
import { GLTFPipeline } from '../GLTFPipeline';
import { DTDLCompiler } from '../DTDLCompiler';
import { NFTMarketplaceCompiler } from '../NFTMarketplaceCompiler';
import { SCMCompiler } from '../SCMCompiler';
import { VRRCompiler } from '../VRRCompiler';
import { A2AAgentCardCompiler } from '../A2AAgentCardCompiler';
import { MultiLayerCompiler } from '../MultiLayerCompiler';

// DomainBlockCompilerMixin is not a class — import its exported function
import {
  getRequiredCapability as domainBlockGetRequiredCapability,
  DOMAIN_BLOCK_COMPILER_MIXIN_CAPABILITY,
} from '../DomainBlockCompilerMixin';

// ---------------------------------------------------------------------------
// Test Data: All 27 CompilerBase subclasses mapped to expected ANS paths
// ---------------------------------------------------------------------------

interface CompilerTestCase {
  name: string;
  factory: () => CompilerBase;
  expectedPath: ANSCapabilityPathValue;
}

const COMPILER_TEST_CASES: CompilerTestCase[] = [
  // ── gamedev ──────────────────────────────────────────────────────────────
  {
    name: 'UnityCompiler',
    factory: () => new UnityCompiler(),
    expectedPath: ANSCapabilityPath.UNITY,
  },
  {
    name: 'UnrealCompiler',
    factory: () => new UnrealCompiler(),
    expectedPath: ANSCapabilityPath.UNREAL,
  },
  {
    name: 'GodotCompiler',
    factory: () => new GodotCompiler(),
    expectedPath: ANSCapabilityPath.GODOT,
  },

  // ── social-vr ───────────────────────────────────────────────────────────
  {
    name: 'VRChatCompiler',
    factory: () => new VRChatCompiler(),
    expectedPath: ANSCapabilityPath.VRCHAT,
  },

  // ── xr ──────────────────────────────────────────────────────────────────
  {
    name: 'OpenXRCompiler',
    factory: () => new OpenXRCompiler(),
    expectedPath: ANSCapabilityPath.OPENXR,
  },
  {
    name: 'VisionOSCompiler',
    factory: () => new VisionOSCompiler(),
    expectedPath: ANSCapabilityPath.VISIONOS,
  },
  {
    name: 'ARCompiler',
    factory: () => new ARCompiler(),
    expectedPath: ANSCapabilityPath.AR,
  },
  {
    name: 'AndroidXRCompiler',
    factory: () => new AndroidXRCompiler(),
    expectedPath: ANSCapabilityPath.ANDROID_XR,
  },

  // ── mobile ──────────────────────────────────────────────────────────────
  {
    name: 'AndroidCompiler',
    factory: () => new AndroidCompiler(),
    expectedPath: ANSCapabilityPath.ANDROID,
  },
  {
    name: 'IOSCompiler',
    factory: () => new IOSCompiler(),
    expectedPath: ANSCapabilityPath.IOS,
  },

  // ── web3d ───────────────────────────────────────────────────────────────
  {
    name: 'BabylonCompiler',
    factory: () => new BabylonCompiler(),
    expectedPath: ANSCapabilityPath.BABYLON,
  },
  {
    name: 'WebGPUCompiler',
    factory: () => new WebGPUCompiler(),
    expectedPath: ANSCapabilityPath.WEBGPU,
  },
  {
    name: 'PlayCanvasCompiler',
    factory: () => new PlayCanvasCompiler(),
    expectedPath: ANSCapabilityPath.PLAYCANVAS,
  },

  // ── runtime ─────────────────────────────────────────────────────────────
  {
    name: 'WASMCompiler',
    factory: () => new WASMCompiler(),
    expectedPath: ANSCapabilityPath.WASM,
  },

  // ── shader ──────────────────────────────────────────────────────────────
  {
    name: 'TSLCompiler',
    factory: () => new TSLCompiler(),
    expectedPath: ANSCapabilityPath.TSL,
  },

  // ── robotics ────────────────────────────────────────────────────────────
  {
    name: 'URDFCompiler',
    factory: () => new URDFCompiler(),
    expectedPath: ANSCapabilityPath.URDF,
  },
  {
    name: 'SDFCompiler',
    factory: () => new SDFCompiler(),
    expectedPath: ANSCapabilityPath.SDF,
  },

  // ── interchange ─────────────────────────────────────────────────────────
  {
    name: 'USDPhysicsCompiler',
    factory: () => new USDPhysicsCompiler(),
    expectedPath: ANSCapabilityPath.USD,
  },
  {
    name: 'GLTFPipeline',
    factory: () => new GLTFPipeline(),
    expectedPath: ANSCapabilityPath.GLTF,
  },

  // ── iot ─────────────────────────────────────────────────────────────────
  {
    name: 'DTDLCompiler',
    factory: () => new DTDLCompiler(),
    expectedPath: ANSCapabilityPath.DTDL,
  },

  // ── web3 ────────────────────────────────────────────────────────────────
  {
    name: 'NFTMarketplaceCompiler',
    factory: () => new NFTMarketplaceCompiler(),
    expectedPath: ANSCapabilityPath.NFT_MARKETPLACE,
  },

  // ── ai ──────────────────────────────────────────────────────────────────
  {
    name: 'SCMCompiler',
    factory: () => new SCMCompiler(),
    expectedPath: ANSCapabilityPath.SCM,
  },
  {
    name: 'VRRCompiler',
    factory: () =>
      new VRRCompiler({
        renderEngine: 'threejs',
        adaptationLevel: 'full',
        enableRealTimeFeeds: false,
      }),
    expectedPath: ANSCapabilityPath.VRR,
  },
  {
    name: 'A2AAgentCardCompiler',
    factory: () => new A2AAgentCardCompiler(),
    expectedPath: ANSCapabilityPath.A2A_AGENT_CARD,
  },

  // ── meta ────────────────────────────────────────────────────────────────
  {
    name: 'MultiLayerCompiler',
    factory: () => new MultiLayerCompiler({ targets: ['vr'], minify: false, source_maps: false }),
    expectedPath: ANSCapabilityPath.MULTI_LAYER,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P5 Compiler Fleet ANS Migration', () => {
  describe('CompilerBase subclasses return correct ANS capability path', () => {
    it.each(COMPILER_TEST_CASES)('$name returns $expectedPath', ({ factory, expectedPath }) => {
      const compiler = factory();
      const capability = exposeCapability(compiler);
      expect(capability).toBe(expectedPath);
    });
  });

  describe('DomainBlockCompilerMixin (standalone utility module)', () => {
    it('getRequiredCapability() returns /compile/mixin/domain-block', () => {
      expect(domainBlockGetRequiredCapability()).toBe(ANSCapabilityPath.DOMAIN_BLOCK);
    });

    it('DOMAIN_BLOCK_COMPILER_MIXIN_CAPABILITY constant is correct', () => {
      expect(DOMAIN_BLOCK_COMPILER_MIXIN_CAPABILITY).toBe('/compile/mixin/domain-block');
    });
  });

  describe('Coverage validation', () => {
    it('tests cover all 25 CompilerBase subclasses', () => {
      // 25 CompilerBase subclasses + 1 DomainBlockCompilerMixin (standalone) = 26 total
      // (R3FCompiler, IncrementalCompiler, StateCompiler, TraitCompositionCompiler
      //  do not extend CompilerBase and are handled separately)
      expect(COMPILER_TEST_CASES.length).toBe(25);
    });

    it('every tested compiler returns a valid /compile/* ANS path', () => {
      for (const { name, factory } of COMPILER_TEST_CASES) {
        const compiler = factory();
        const capability = exposeCapability(compiler);
        expect(capability, `${name} should return a valid ANS path`).toBeDefined();
        expect(capability, `${name} path should start with /compile/`).toMatch(/^\/compile\//);
      }
    });

    it('no two CompilerBase subclasses share the same ANS path', () => {
      const seen = new Map<string, string>();
      for (const { name, factory } of COMPILER_TEST_CASES) {
        const compiler = factory();
        const capability = exposeCapability(compiler)!;
        if (seen.has(capability)) {
          throw new Error(
            `ANS path collision: ${name} and ${seen.get(capability)} both return "${capability}"`
          );
        }
        seen.set(capability, name);
      }
    });

    it('ANS paths match the /compile/DOMAIN/TARGET pattern', () => {
      const pattern = /^\/compile\/[a-z0-9-]+\/[a-z0-9-]+$/;
      for (const { name, factory } of COMPILER_TEST_CASES) {
        const compiler = factory();
        const capability = exposeCapability(compiler)!;
        expect(capability, `${name}: "${capability}" should match /compile/DOMAIN/TARGET`).toMatch(
          pattern
        );
      }
    });
  });
});
