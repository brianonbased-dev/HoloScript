/**
 * Tests for ANS (Agent Namespace Schema) capability namespace constants
 */

import { describe, it, expect } from 'vitest';
import {
  // Constants
  ANSDomain,
  RiskTier,
  ANS_PREFIX,
  ANSCapabilityPath,
  DOMAIN_RISK_TIERS,
  COMPILER_DOMAIN_MAP,
  COMPILER_ANS_MAP,
  ALL_COMPILER_NAMES,
  ALL_DOMAINS,

  // Helper functions
  getNamespaceForCompiler,
  getDomainForCompiler,
  getRiskTierForDomain,
  getRiskTierForCompiler,
  getAllCompilersInDomain,
  getAllCompilersWithRiskTier,
  getAllDomainsWithRiskTier,
  isValidCompilerName,
  isValidDomain,
  parseANSPath,
  buildANSPath,
  getANSSummary,
} from '../ANSNamespace';
import type {
  CompilerName,
  ANSDomainValue,
  RiskTierValue,
  ANSCapabilityPathValue,
} from '../ANSNamespace';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('ANSNamespace', () => {
  describe('ANSDomain constants', () => {
    it('should define all 15 domains', () => {
      expect(Object.keys(ANSDomain)).toHaveLength(15);
    });

    it('should have correct domain string values', () => {
      expect(ANSDomain.GAMEDEV).toBe('gamedev');
      expect(ANSDomain.SOCIAL_VR).toBe('social-vr');
      expect(ANSDomain.XR).toBe('xr');
      expect(ANSDomain.MOBILE).toBe('mobile');
      expect(ANSDomain.WEB3D).toBe('web3d');
      expect(ANSDomain.RUNTIME).toBe('runtime');
      expect(ANSDomain.SHADER).toBe('shader');
      expect(ANSDomain.ROBOTICS).toBe('robotics');
      expect(ANSDomain.INTERCHANGE).toBe('interchange');
      expect(ANSDomain.IOT).toBe('iot');
      expect(ANSDomain.WEB3).toBe('web3');
      expect(ANSDomain.AI).toBe('ai');
      expect(ANSDomain.META).toBe('meta');
      expect(ANSDomain.MIXIN).toBe('mixin');
    });
  });

  describe('RiskTier constants', () => {
    it('should define all 3 risk tiers', () => {
      expect(Object.keys(RiskTier)).toHaveLength(3);
    });

    it('should have correct tier values', () => {
      expect(RiskTier.STANDARD).toBe('STANDARD');
      expect(RiskTier.HIGH).toBe('HIGH');
      expect(RiskTier.CRITICAL).toBe('CRITICAL');
    });
  });

  describe('ANS_PREFIX', () => {
    it('should be /compile', () => {
      expect(ANS_PREFIX).toBe('/compile');
    });
  });

  describe('ANSCapabilityPath constants', () => {
    it('should define exactly 33 capability paths', () => {
      expect(Object.keys(ANSCapabilityPath)).toHaveLength(33);
    });

    it('should follow /compile/DOMAIN/TARGET pattern', () => {
      for (const pathValue of Object.values(ANSCapabilityPath)) {
        expect(pathValue).toMatch(/^\/compile\/[a-z0-9-]+\/[a-z0-9-]+$/);
      }
    });

    it('should have correct gamedev paths', () => {
      expect(ANSCapabilityPath.UNITY).toBe('/compile/gamedev/unity');
      expect(ANSCapabilityPath.UNREAL).toBe('/compile/gamedev/unreal');
      expect(ANSCapabilityPath.GODOT).toBe('/compile/gamedev/godot');
    });

    it('should have correct social-vr paths', () => {
      expect(ANSCapabilityPath.VRCHAT).toBe('/compile/social-vr/vrchat');
    });

    it('should have correct xr paths', () => {
      expect(ANSCapabilityPath.OPENXR).toBe('/compile/xr/openxr');
      expect(ANSCapabilityPath.VISIONOS).toBe('/compile/xr/visionos');
      expect(ANSCapabilityPath.AR).toBe('/compile/xr/ar');
      expect(ANSCapabilityPath.ANDROID_XR).toBe('/compile/xr/android-xr');
      expect(ANSCapabilityPath.AI_GLASSES).toBe('/compile/xr/ai-glasses');
    });

    it('should have correct mobile paths', () => {
      expect(ANSCapabilityPath.ANDROID).toBe('/compile/mobile/android');
      expect(ANSCapabilityPath.IOS).toBe('/compile/mobile/ios');
    });

    it('should have correct web3d paths', () => {
      expect(ANSCapabilityPath.BABYLON).toBe('/compile/web3d/babylon');
      expect(ANSCapabilityPath.WEBGPU).toBe('/compile/web3d/webgpu');
      expect(ANSCapabilityPath.R3F).toBe('/compile/web3d/r3f');
      expect(ANSCapabilityPath.PLAYCANVAS).toBe('/compile/web3d/playcanvas');
    });

    it('should have correct runtime paths', () => {
      expect(ANSCapabilityPath.WASM).toBe('/compile/runtime/wasm');
    });

    it('should have correct shader paths', () => {
      expect(ANSCapabilityPath.TSL).toBe('/compile/shader/tsl');
    });

    it('should have correct robotics paths', () => {
      expect(ANSCapabilityPath.URDF).toBe('/compile/robotics/urdf');
      expect(ANSCapabilityPath.SDF).toBe('/compile/robotics/sdf');
    });

    it('should have correct interchange paths', () => {
      expect(ANSCapabilityPath.USD).toBe('/compile/interchange/usd');
      expect(ANSCapabilityPath.GLTF).toBe('/compile/interchange/gltf');
    });

    it('should have correct iot paths', () => {
      expect(ANSCapabilityPath.DTDL).toBe('/compile/iot/dtdl');
    });

    it('should have correct web3 paths', () => {
      expect(ANSCapabilityPath.NFT_MARKETPLACE).toBe('/compile/web3/nft-marketplace');
    });

    it('should have correct ai paths', () => {
      expect(ANSCapabilityPath.SCM).toBe('/compile/ai/scm');
      expect(ANSCapabilityPath.VRR).toBe('/compile/ai/vrr');
      expect(ANSCapabilityPath.A2A_AGENT_CARD).toBe('/compile/ai/a2a-agent-card');
    });

    it('should have correct neuromorphic paths', () => {
      expect(ANSCapabilityPath.NIR).toBe('/compile/neuromorphic/nir');
    });

    it('should have correct meta paths', () => {
      expect(ANSCapabilityPath.MULTI_LAYER).toBe('/compile/meta/multi-layer');
      expect(ANSCapabilityPath.INCREMENTAL).toBe('/compile/meta/incremental');
      expect(ANSCapabilityPath.STATE).toBe('/compile/meta/state');
      expect(ANSCapabilityPath.TRAIT_COMPOSITION).toBe('/compile/meta/trait-composition');
    });

    it('should have correct mixin paths', () => {
      expect(ANSCapabilityPath.DOMAIN_BLOCK).toBe('/compile/mixin/domain-block');
    });
  });

  // -----------------------------------------------------------------------
  // Risk Tier Assignments
  // -----------------------------------------------------------------------

  describe('DOMAIN_RISK_TIERS', () => {
    it('should assign a risk tier to every domain', () => {
      for (const domain of ALL_DOMAINS) {
        expect(DOMAIN_RISK_TIERS[domain]).toBeDefined();
        expect(['STANDARD', 'HIGH', 'CRITICAL']).toContain(DOMAIN_RISK_TIERS[domain]);
      }
    });

    it('should classify gamedev as STANDARD', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.GAMEDEV]).toBe(RiskTier.STANDARD);
    });

    it('should classify social-vr as HIGH', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.SOCIAL_VR]).toBe(RiskTier.HIGH);
    });

    it('should classify xr as HIGH', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.XR]).toBe(RiskTier.HIGH);
    });

    it('should classify mobile as HIGH', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.MOBILE]).toBe(RiskTier.HIGH);
    });

    it('should classify web3d as STANDARD', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.WEB3D]).toBe(RiskTier.STANDARD);
    });

    it('should classify runtime as HIGH', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.RUNTIME]).toBe(RiskTier.HIGH);
    });

    it('should classify shader as STANDARD', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.SHADER]).toBe(RiskTier.STANDARD);
    });

    it('should classify robotics as CRITICAL', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.ROBOTICS]).toBe(RiskTier.CRITICAL);
    });

    it('should classify interchange as STANDARD', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.INTERCHANGE]).toBe(RiskTier.STANDARD);
    });

    it('should classify iot as HIGH', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.IOT]).toBe(RiskTier.HIGH);
    });

    it('should classify web3 as CRITICAL', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.WEB3]).toBe(RiskTier.CRITICAL);
    });

    it('should classify ai as HIGH', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.AI]).toBe(RiskTier.HIGH);
    });

    it('should classify meta as STANDARD', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.META]).toBe(RiskTier.STANDARD);
    });

    it('should classify mixin as STANDARD', () => {
      expect(DOMAIN_RISK_TIERS[ANSDomain.MIXIN]).toBe(RiskTier.STANDARD);
    });
  });

  // -----------------------------------------------------------------------
  // Compiler Mappings
  // -----------------------------------------------------------------------

  describe('COMPILER_DOMAIN_MAP', () => {
    it('should map exactly 33 compilers', () => {
      expect(Object.keys(COMPILER_DOMAIN_MAP)).toHaveLength(33);
    });

    it('should map every compiler to a valid domain', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        expect(ALL_DOMAINS).toContain(COMPILER_DOMAIN_MAP[compiler]);
      }
    });
  });

  describe('COMPILER_ANS_MAP', () => {
    it('should map exactly 33 compilers to paths', () => {
      expect(Object.keys(COMPILER_ANS_MAP)).toHaveLength(33);
    });

    it('should be consistent with COMPILER_DOMAIN_MAP', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        const path = COMPILER_ANS_MAP[compiler];
        const domain = COMPILER_DOMAIN_MAP[compiler];
        expect(path).toBe(`/compile/${domain}/${compiler}`);
      }
    });
  });

  describe('ALL_COMPILER_NAMES', () => {
    it('should contain exactly 33 names', () => {
      expect(ALL_COMPILER_NAMES).toHaveLength(33);
    });

    it('should contain all expected compiler names', () => {
      const expectedNames: CompilerName[] = [
        'unity',
        'unreal',
        'godot',
        'vrchat',
        'openxr',
        'visionos',
        'ar',
        'android-xr',
        'ai-glasses',
        'android',
        'ios',
        'babylon',
        'webgpu',
        'r3f',
        'playcanvas',
        'wasm',
        'tsl',
        'urdf',
        'sdf',
        'usd',
        'gltf',
        'dtdl',
        'nft-marketplace',
        'scm',
        'vrr',
        'a2a-agent-card',
        'nir',
        'multi-layer',
        'incremental',
        'state',
        'trait-composition',
        'domain-block',
      ];
      for (const name of expectedNames) {
        expect(ALL_COMPILER_NAMES).toContain(name);
      }
    });

    it('should have no duplicates', () => {
      const unique = new Set(ALL_COMPILER_NAMES);
      expect(unique.size).toBe(ALL_COMPILER_NAMES.length);
    });
  });

  describe('ALL_DOMAINS', () => {
    it('should contain exactly 15 domains', () => {
      expect(ALL_DOMAINS).toHaveLength(15);
    });

    it('should have no duplicates', () => {
      const unique = new Set(ALL_DOMAINS);
      expect(unique.size).toBe(ALL_DOMAINS.length);
    });
  });

  // -----------------------------------------------------------------------
  // Helper Functions
  // -----------------------------------------------------------------------

  describe('getNamespaceForCompiler()', () => {
    it('should return correct path for gamedev compilers', () => {
      expect(getNamespaceForCompiler('unity')).toBe('/compile/gamedev/unity');
      expect(getNamespaceForCompiler('unreal')).toBe('/compile/gamedev/unreal');
      expect(getNamespaceForCompiler('godot')).toBe('/compile/gamedev/godot');
    });

    it('should return correct path for xr compilers', () => {
      expect(getNamespaceForCompiler('openxr')).toBe('/compile/xr/openxr');
      expect(getNamespaceForCompiler('visionos')).toBe('/compile/xr/visionos');
      expect(getNamespaceForCompiler('ar')).toBe('/compile/xr/ar');
      expect(getNamespaceForCompiler('android-xr')).toBe('/compile/xr/android-xr');
      expect(getNamespaceForCompiler('ai-glasses')).toBe('/compile/xr/ai-glasses');
    });

    it('should return correct path for robotics compilers', () => {
      expect(getNamespaceForCompiler('urdf')).toBe('/compile/robotics/urdf');
      expect(getNamespaceForCompiler('sdf')).toBe('/compile/robotics/sdf');
    });

    it('should return correct path for ai compilers', () => {
      expect(getNamespaceForCompiler('scm')).toBe('/compile/ai/scm');
      expect(getNamespaceForCompiler('vrr')).toBe('/compile/ai/vrr');
      expect(getNamespaceForCompiler('a2a-agent-card')).toBe('/compile/ai/a2a-agent-card');
    });

    it('should return correct path for meta compilers', () => {
      expect(getNamespaceForCompiler('multi-layer')).toBe('/compile/meta/multi-layer');
      expect(getNamespaceForCompiler('incremental')).toBe('/compile/meta/incremental');
      expect(getNamespaceForCompiler('state')).toBe('/compile/meta/state');
      expect(getNamespaceForCompiler('trait-composition')).toBe('/compile/meta/trait-composition');
    });

    it('should return correct path for every compiler', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        const path = getNamespaceForCompiler(compiler);
        expect(path).toMatch(/^\/compile\/[a-z0-9-]+\/[a-z0-9-]+$/);
      }
    });
  });

  describe('getDomainForCompiler()', () => {
    it('should return gamedev for game engine compilers', () => {
      expect(getDomainForCompiler('unity')).toBe('gamedev');
      expect(getDomainForCompiler('unreal')).toBe('gamedev');
      expect(getDomainForCompiler('godot')).toBe('gamedev');
    });

    it('should return social-vr for VRChat', () => {
      expect(getDomainForCompiler('vrchat')).toBe('social-vr');
    });

    it('should return xr for XR compilers', () => {
      expect(getDomainForCompiler('openxr')).toBe('xr');
      expect(getDomainForCompiler('visionos')).toBe('xr');
      expect(getDomainForCompiler('ar')).toBe('xr');
      expect(getDomainForCompiler('android-xr')).toBe('xr');
      expect(getDomainForCompiler('ai-glasses')).toBe('xr');
    });

    it('should return mobile for mobile compilers', () => {
      expect(getDomainForCompiler('android')).toBe('mobile');
      expect(getDomainForCompiler('ios')).toBe('mobile');
    });

    it('should return web3d for web 3D compilers', () => {
      expect(getDomainForCompiler('babylon')).toBe('web3d');
      expect(getDomainForCompiler('webgpu')).toBe('web3d');
      expect(getDomainForCompiler('r3f')).toBe('web3d');
      expect(getDomainForCompiler('playcanvas')).toBe('web3d');
    });

    it('should return correct domain for every compiler', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        const domain = getDomainForCompiler(compiler);
        expect(ALL_DOMAINS).toContain(domain);
      }
    });
  });

  describe('getRiskTierForDomain()', () => {
    it('should return STANDARD for standard domains', () => {
      expect(getRiskTierForDomain('gamedev')).toBe('STANDARD');
      expect(getRiskTierForDomain('web3d')).toBe('STANDARD');
      expect(getRiskTierForDomain('shader')).toBe('STANDARD');
      expect(getRiskTierForDomain('interchange')).toBe('STANDARD');
      expect(getRiskTierForDomain('meta')).toBe('STANDARD');
      expect(getRiskTierForDomain('mixin')).toBe('STANDARD');
    });

    it('should return HIGH for elevated domains', () => {
      expect(getRiskTierForDomain('social-vr')).toBe('HIGH');
      expect(getRiskTierForDomain('xr')).toBe('HIGH');
      expect(getRiskTierForDomain('mobile')).toBe('HIGH');
      expect(getRiskTierForDomain('runtime')).toBe('HIGH');
      expect(getRiskTierForDomain('iot')).toBe('HIGH');
      expect(getRiskTierForDomain('ai')).toBe('HIGH');
    });

    it('should return CRITICAL for safety-critical domains', () => {
      expect(getRiskTierForDomain('robotics')).toBe('CRITICAL');
      expect(getRiskTierForDomain('web3')).toBe('CRITICAL');
    });
  });

  describe('getRiskTierForCompiler()', () => {
    it('should return STANDARD for gamedev compilers', () => {
      expect(getRiskTierForCompiler('unity')).toBe('STANDARD');
      expect(getRiskTierForCompiler('unreal')).toBe('STANDARD');
      expect(getRiskTierForCompiler('godot')).toBe('STANDARD');
    });

    it('should return CRITICAL for robotics compilers', () => {
      expect(getRiskTierForCompiler('urdf')).toBe('CRITICAL');
      expect(getRiskTierForCompiler('sdf')).toBe('CRITICAL');
    });

    it('should return CRITICAL for web3 compilers', () => {
      expect(getRiskTierForCompiler('nft-marketplace')).toBe('CRITICAL');
    });

    it('should return HIGH for XR compilers', () => {
      expect(getRiskTierForCompiler('openxr')).toBe('HIGH');
      expect(getRiskTierForCompiler('visionos')).toBe('HIGH');
    });
  });

  describe('getAllCompilersInDomain()', () => {
    it('should return 3 compilers for gamedev', () => {
      const compilers = getAllCompilersInDomain('gamedev');
      expect(compilers).toHaveLength(3);
      expect(compilers).toContain('unity');
      expect(compilers).toContain('unreal');
      expect(compilers).toContain('godot');
    });

    it('should return 1 compiler for social-vr', () => {
      const compilers = getAllCompilersInDomain('social-vr');
      expect(compilers).toHaveLength(1);
      expect(compilers).toContain('vrchat');
    });

    it('should return 6 compilers for xr', () => {
      const compilers = getAllCompilersInDomain('xr');
      expect(compilers).toHaveLength(6);
      expect(compilers).toContain('openxr');
      expect(compilers).toContain('openxr-spatial-entities');
      expect(compilers).toContain('visionos');
      expect(compilers).toContain('ar');
      expect(compilers).toContain('android-xr');
      expect(compilers).toContain('ai-glasses');
    });

    it('should return 2 compilers for mobile', () => {
      const compilers = getAllCompilersInDomain('mobile');
      expect(compilers).toHaveLength(2);
      expect(compilers).toContain('android');
      expect(compilers).toContain('ios');
    });

    it('should return 4 compilers for web3d', () => {
      const compilers = getAllCompilersInDomain('web3d');
      expect(compilers).toHaveLength(4);
      expect(compilers).toContain('babylon');
      expect(compilers).toContain('webgpu');
      expect(compilers).toContain('r3f');
      expect(compilers).toContain('playcanvas');
    });

    it('should return 1 compiler for runtime', () => {
      expect(getAllCompilersInDomain('runtime')).toEqual(['wasm']);
    });

    it('should return 1 compiler for shader', () => {
      expect(getAllCompilersInDomain('shader')).toEqual(['tsl']);
    });

    it('should return 2 compilers for robotics', () => {
      const compilers = getAllCompilersInDomain('robotics');
      expect(compilers).toHaveLength(2);
      expect(compilers).toContain('urdf');
      expect(compilers).toContain('sdf');
    });

    it('should return 2 compilers for interchange', () => {
      const compilers = getAllCompilersInDomain('interchange');
      expect(compilers).toHaveLength(2);
      expect(compilers).toContain('usd');
      expect(compilers).toContain('gltf');
    });

    it('should return 1 compiler for iot', () => {
      expect(getAllCompilersInDomain('iot')).toEqual(['dtdl']);
    });

    it('should return 1 compiler for web3', () => {
      expect(getAllCompilersInDomain('web3')).toEqual(['nft-marketplace']);
    });

    it('should return 3 compilers for ai', () => {
      const compilers = getAllCompilersInDomain('ai');
      expect(compilers).toHaveLength(3);
      expect(compilers).toContain('scm');
      expect(compilers).toContain('vrr');
      expect(compilers).toContain('a2a-agent-card');
    });

    it('should return 4 compilers for meta', () => {
      const compilers = getAllCompilersInDomain('meta');
      expect(compilers).toHaveLength(4);
      expect(compilers).toContain('multi-layer');
      expect(compilers).toContain('incremental');
      expect(compilers).toContain('state');
      expect(compilers).toContain('trait-composition');
    });

    it('should return 1 compiler for neuromorphic', () => {
      expect(getAllCompilersInDomain('neuromorphic')).toEqual(['nir']);
    });

    it('should return 1 compiler for mixin', () => {
      expect(getAllCompilersInDomain('mixin')).toEqual(['domain-block']);
    });

    it('total across all domains should equal 33', () => {
      let total = 0;
      for (const domain of ALL_DOMAINS) {
        total += getAllCompilersInDomain(domain).length;
      }
      expect(total).toBe(33);
    });
  });

  describe('getAllCompilersWithRiskTier()', () => {
    it('should return compilers for STANDARD tier', () => {
      const compilers = getAllCompilersWithRiskTier('STANDARD');
      // gamedev(3) + web3d(4) + shader(1) + interchange(2) + meta(4) + mixin(1) = 15
      expect(compilers).toHaveLength(15);
      expect(compilers).toContain('unity');
      expect(compilers).toContain('babylon');
      expect(compilers).toContain('tsl');
      expect(compilers).toContain('gltf');
      expect(compilers).toContain('multi-layer');
      expect(compilers).toContain('domain-block');
    });

    it('should return compilers for HIGH tier', () => {
      const compilers = getAllCompilersWithRiskTier('HIGH');
      // social-vr(1) + xr(6) + mobile(2) + runtime(1) + iot(1) + ai(3) + neuromorphic(1) = 15
      expect(compilers).toHaveLength(15);
      expect(compilers).toContain('vrchat');
      expect(compilers).toContain('openxr');
      expect(compilers).toContain('android');
      expect(compilers).toContain('wasm');
      expect(compilers).toContain('dtdl');
      expect(compilers).toContain('scm');
    });

    it('should return compilers for CRITICAL tier', () => {
      const compilers = getAllCompilersWithRiskTier('CRITICAL');
      // robotics(2) + web3(1) = 3
      expect(compilers).toHaveLength(3);
      expect(compilers).toContain('urdf');
      expect(compilers).toContain('sdf');
      expect(compilers).toContain('nft-marketplace');
    });

    it('total across all tiers should equal 33', () => {
      const standard = getAllCompilersWithRiskTier('STANDARD').length;
      const high = getAllCompilersWithRiskTier('HIGH').length;
      const critical = getAllCompilersWithRiskTier('CRITICAL').length;
      expect(standard + high + critical).toBe(33);
    });
  });

  describe('getAllDomainsWithRiskTier()', () => {
    it('should return STANDARD domains', () => {
      const domains = getAllDomainsWithRiskTier('STANDARD');
      expect(domains).toContain('gamedev');
      expect(domains).toContain('web3d');
      expect(domains).toContain('shader');
      expect(domains).toContain('interchange');
      expect(domains).toContain('meta');
      expect(domains).toContain('mixin');
      expect(domains).toHaveLength(6);
    });

    it('should return HIGH domains', () => {
      const domains = getAllDomainsWithRiskTier('HIGH');
      expect(domains).toContain('social-vr');
      expect(domains).toContain('xr');
      expect(domains).toContain('mobile');
      expect(domains).toContain('runtime');
      expect(domains).toContain('iot');
      expect(domains).toContain('ai');
      expect(domains).toContain('neuromorphic');
      expect(domains).toHaveLength(7);
    });

    it('should return CRITICAL domains', () => {
      const domains = getAllDomainsWithRiskTier('CRITICAL');
      expect(domains).toContain('robotics');
      expect(domains).toContain('web3');
      expect(domains).toHaveLength(2);
    });

    it('total across all tiers should equal 14', () => {
      const standard = getAllDomainsWithRiskTier('STANDARD').length;
      const high = getAllDomainsWithRiskTier('HIGH').length;
      const critical = getAllDomainsWithRiskTier('CRITICAL').length;
      expect(standard + high + critical).toBe(15);
    });
  });

  describe('isValidCompilerName()', () => {
    it('should return true for valid compiler names', () => {
      expect(isValidCompilerName('unity')).toBe(true);
      expect(isValidCompilerName('urdf')).toBe(true);
      expect(isValidCompilerName('nft-marketplace')).toBe(true);
      expect(isValidCompilerName('a2a-agent-card')).toBe(true);
      expect(isValidCompilerName('trait-composition')).toBe(true);
      expect(isValidCompilerName('domain-block')).toBe(true);
    });

    it('should return false for invalid compiler names', () => {
      expect(isValidCompilerName('invalid')).toBe(false);
      expect(isValidCompilerName('')).toBe(false);
      expect(isValidCompilerName('Unity')).toBe(false); // case-sensitive
      expect(isValidCompilerName('unity-compiler')).toBe(false);
      expect(isValidCompilerName('gamedev')).toBe(false); // domain, not compiler
    });

    it('should work as a type guard', () => {
      const name: string = 'unity';
      if (isValidCompilerName(name)) {
        // TypeScript should narrow `name` to CompilerName
        const _path: ANSCapabilityPathValue = getNamespaceForCompiler(name);
        expect(_path).toBeDefined();
      }
    });
  });

  describe('isValidDomain()', () => {
    it('should return true for valid domains', () => {
      expect(isValidDomain('gamedev')).toBe(true);
      expect(isValidDomain('social-vr')).toBe(true);
      expect(isValidDomain('web3')).toBe(true);
      expect(isValidDomain('mixin')).toBe(true);
    });

    it('should return false for invalid domains', () => {
      expect(isValidDomain('invalid')).toBe(false);
      expect(isValidDomain('')).toBe(false);
      expect(isValidDomain('GAMEDEV')).toBe(false); // case-sensitive
      expect(isValidDomain('unity')).toBe(false); // compiler, not domain
    });
  });

  describe('parseANSPath()', () => {
    it('should parse valid ANS paths', () => {
      const result = parseANSPath('/compile/gamedev/unity');
      expect(result).not.toBeNull();
      expect(result!.domain).toBe('gamedev');
      expect(result!.target).toBe('unity');
      expect(result!.compiler).toBe('unity');
    });

    it('should parse paths with hyphens', () => {
      const result = parseANSPath('/compile/social-vr/vrchat');
      expect(result).not.toBeNull();
      expect(result!.domain).toBe('social-vr');
      expect(result!.compiler).toBe('vrchat');

      const result2 = parseANSPath('/compile/xr/android-xr');
      expect(result2).not.toBeNull();
      expect(result2!.domain).toBe('xr');
      expect(result2!.compiler).toBe('android-xr');
    });

    it('should parse all 32 capability paths', () => {
      for (const pathValue of Object.values(ANSCapabilityPath)) {
        const result = parseANSPath(pathValue);
        expect(result).not.toBeNull();
        expect(result!.domain).toBeDefined();
        expect(result!.compiler).toBeDefined();
      }
    });

    it('should return null for invalid paths', () => {
      expect(parseANSPath('/invalid/path')).toBeNull();
      expect(parseANSPath('/compile')).toBeNull();
      expect(parseANSPath('/compile/gamedev')).toBeNull();
      expect(parseANSPath('/compile/invalid/unity')).toBeNull();
      expect(parseANSPath('/compile/gamedev/invalid')).toBeNull();
      expect(parseANSPath('')).toBeNull();
      expect(parseANSPath('compile/gamedev/unity')).toBeNull(); // missing leading /
      expect(parseANSPath('/compile/gamedev/unity/extra')).toBeNull(); // too many segments
    });
  });

  describe('buildANSPath()', () => {
    it('should build valid paths', () => {
      expect(buildANSPath('gamedev', 'unity')).toBe('/compile/gamedev/unity');
      expect(buildANSPath('robotics', 'urdf')).toBe('/compile/robotics/urdf');
      expect(buildANSPath('web3', 'nft-marketplace')).toBe('/compile/web3/nft-marketplace');
    });

    it('should return null for invalid domain', () => {
      expect(buildANSPath('invalid', 'unity')).toBeNull();
    });

    it('should return null for invalid compiler', () => {
      expect(buildANSPath('gamedev', 'invalid')).toBeNull();
    });

    it('should return null for mismatched domain-compiler pair', () => {
      // unity is in gamedev, not robotics
      expect(buildANSPath('robotics', 'unity')).toBeNull();
    });

    it('should produce paths that roundtrip through parseANSPath', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        const domain = getDomainForCompiler(compiler);
        const path = buildANSPath(domain, compiler);
        expect(path).not.toBeNull();

        const parsed = parseANSPath(path!);
        expect(parsed).not.toBeNull();
        expect(parsed!.compiler).toBe(compiler);
        expect(parsed!.domain).toBe(domain);
      }
    });
  });

  describe('getANSSummary()', () => {
    it('should return correct total counts', () => {
      const summary = getANSSummary();
      expect(summary.totalCompilers).toBe(33);
      expect(summary.totalDomains).toBe(15);
    });

    it('should have all domains in compilersByDomain', () => {
      const summary = getANSSummary();
      expect(Object.keys(summary.compilersByDomain)).toHaveLength(15);
    });

    it('should have correct domain counts', () => {
      const summary = getANSSummary();
      expect(summary.compilersByDomain['gamedev']).toBe(3);
      expect(summary.compilersByDomain['xr']).toBe(6);
      expect(summary.compilersByDomain['web3d']).toBe(4);
      expect(summary.compilersByDomain['meta']).toBe(4);
      expect(summary.compilersByDomain['neuromorphic']).toBe(1);
    });

    it('should sum domain compiler counts to 33', () => {
      const summary = getANSSummary();
      const total = Object.values(summary.compilersByDomain).reduce((a, b) => a + b, 0);
      expect(total).toBe(33);
    });

    it('should have all 3 risk tiers in compilersByRiskTier', () => {
      const summary = getANSSummary();
      expect(Object.keys(summary.compilersByRiskTier)).toHaveLength(3);
      expect(summary.compilersByRiskTier['STANDARD']).toBe(15);
      expect(summary.compilersByRiskTier['HIGH']).toBe(15);
      expect(summary.compilersByRiskTier['CRITICAL']).toBe(3);
    });

    it('should have correct domainsByRiskTier', () => {
      const summary = getANSSummary();
      expect(summary.domainsByRiskTier['CRITICAL']).toContain('robotics');
      expect(summary.domainsByRiskTier['CRITICAL']).toContain('web3');
    });
  });

  // -----------------------------------------------------------------------
  // Consistency / Invariant Tests
  // -----------------------------------------------------------------------

  describe('Cross-mapping consistency', () => {
    it('every compiler in COMPILER_ANS_MAP should also be in COMPILER_DOMAIN_MAP', () => {
      for (const compiler of Object.keys(COMPILER_ANS_MAP) as CompilerName[]) {
        expect(COMPILER_DOMAIN_MAP[compiler]).toBeDefined();
      }
    });

    it('every compiler in COMPILER_DOMAIN_MAP should also be in COMPILER_ANS_MAP', () => {
      for (const compiler of Object.keys(COMPILER_DOMAIN_MAP) as CompilerName[]) {
        expect(COMPILER_ANS_MAP[compiler]).toBeDefined();
      }
    });

    it('every ANS path should contain its compiler domain', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        const domain = COMPILER_DOMAIN_MAP[compiler];
        const path = COMPILER_ANS_MAP[compiler];
        expect(path).toContain(`/${domain}/`);
      }
    });

    it('every ANS path should start with /compile/', () => {
      for (const compiler of ALL_COMPILER_NAMES) {
        expect(COMPILER_ANS_MAP[compiler]).toMatch(/^\/compile\//);
      }
    });

    it('all capability paths should be unique', () => {
      const paths = Object.values(ANSCapabilityPath);
      const unique = new Set(paths);
      expect(unique.size).toBe(paths.length);
    });

    it('all ANS paths in COMPILER_ANS_MAP should also exist in ANSCapabilityPath', () => {
      const allCapabilityPaths = new Set(Object.values(ANSCapabilityPath));
      for (const path of Object.values(COMPILER_ANS_MAP)) {
        expect(allCapabilityPaths.has(path)).toBe(true);
      }
    });

    it('all ANS paths in ANSCapabilityPath should also exist in COMPILER_ANS_MAP', () => {
      const allMappedPaths = new Set(Object.values(COMPILER_ANS_MAP));
      for (const path of Object.values(ANSCapabilityPath)) {
        expect(allMappedPaths.has(path)).toBe(true);
      }
    });
  });
});
