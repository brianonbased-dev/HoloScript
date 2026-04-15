/**
 * HoloScript Agent Namespace Schema (ANS)
 *
 * Defines capability namespace constants for all 31 HoloScript compilers.
 * Each compiler maps to an ANS capability path using the pattern:
 *
 *   /compile/DOMAIN/TARGET
 *
 * This module provides:
 * - Type-safe compiler name union type
 * - ANS capability path constants for all compilers
 * - Domain and risk tier classification
 * - Helper functions for namespace lookups and queries
 *
 * Risk tier classification:
 * - STANDARD: General-purpose compilation, no elevated privileges
 * - HIGH: Platform-specific compilation with device/network access
 * - CRITICAL: Financial, identity, or safety-critical compilation
 *
 * @module @holoscript/core/compiler/identity/ANSNamespace
 * @version 1.0.0
 */

// ---------------------------------------------------------------------------
// Domain Definitions
// ---------------------------------------------------------------------------

/**
 * All 13 HoloScript compiler domains plus 2 meta/utility domains.
 */
export const ANSDomain = {
  GAMEDEV: 'gamedev',
  SOCIAL_VR: 'social-vr',
  XR: 'xr',
  MOBILE: 'mobile',
  WEB3D: 'web3d',
  RUNTIME: 'runtime',
  SHADER: 'shader',
  ROBOTICS: 'robotics',
  INTERCHANGE: 'interchange',
  IOT: 'iot',
  WEB3: 'web3',
  AI: 'ai',
  NEUROMORPHIC: 'neuromorphic',
  META: 'meta',
  MIXIN: 'mixin',
} as const;

export type ANSDomainValue = (typeof ANSDomain)[keyof typeof ANSDomain];

// ---------------------------------------------------------------------------
// Risk Tier Classification
// ---------------------------------------------------------------------------

/**
 * Risk tier for each compiler domain.
 *
 * - STANDARD: No elevated privileges needed (gamedev, web3d, shader, meta, mixin)
 * - HIGH: Device/network/platform access (xr, mobile, runtime, robotics, iot, ai)
 * - CRITICAL: Financial or safety-critical (web3, social-vr with identity, interchange with signing)
 */
export const RiskTier = {
  STANDARD: 'STANDARD',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskTierValue = (typeof RiskTier)[keyof typeof RiskTier];

/**
 * Risk tier assignment per domain.
 *
 * Rationale:
 * - gamedev: STANDARD — generates game engine scripts, no direct device access
 * - social-vr: HIGH — interacts with identity/avatar systems in live environments
 * - xr: HIGH — accesses device sensors, cameras, spatial tracking
 * - mobile: HIGH — generates platform-native code with device API access
 * - web3d: STANDARD — generates browser-side rendering code
 * - runtime: HIGH — compiles to WASM with potential system-level execution
 * - shader: STANDARD — generates GPU shader code (sandboxed by GPU driver)
 * - robotics: CRITICAL — controls physical actuators, safety-critical
 * - interchange: STANDARD — generates data interchange formats (USD, glTF)
 * - iot: HIGH — interfaces with physical devices and digital twins
 * - web3: CRITICAL — handles financial transactions, NFT minting, smart contracts
 * - ai: HIGH — generates AI agent cards and cognitive models
 * - neuromorphic: HIGH — compiles to neuromorphic hardware (Loihi 2, SpiNNaker 2, SynSense)
 * - meta: STANDARD — meta-compilation (incremental, multi-layer, state, traits)
 * - mixin: STANDARD — shared compilation utilities
 */
export const DOMAIN_RISK_TIERS: Readonly<Record<ANSDomainValue, RiskTierValue>> = {
  [ANSDomain.GAMEDEV]: RiskTier.STANDARD,
  [ANSDomain.SOCIAL_VR]: RiskTier.HIGH,
  [ANSDomain.XR]: RiskTier.HIGH,
  [ANSDomain.MOBILE]: RiskTier.HIGH,
  [ANSDomain.WEB3D]: RiskTier.STANDARD,
  [ANSDomain.RUNTIME]: RiskTier.HIGH,
  [ANSDomain.SHADER]: RiskTier.STANDARD,
  [ANSDomain.ROBOTICS]: RiskTier.CRITICAL,
  [ANSDomain.INTERCHANGE]: RiskTier.STANDARD,
  [ANSDomain.IOT]: RiskTier.HIGH,
  [ANSDomain.WEB3]: RiskTier.CRITICAL,
  [ANSDomain.AI]: RiskTier.HIGH,
  [ANSDomain.NEUROMORPHIC]: RiskTier.HIGH,
  [ANSDomain.META]: RiskTier.STANDARD,
  [ANSDomain.MIXIN]: RiskTier.STANDARD,
} as const;

// ---------------------------------------------------------------------------
// Compiler Name Union Type
// ---------------------------------------------------------------------------

/**
 * Type-safe union of all 31 HoloScript compiler names.
 *
 * Each name corresponds to a specific compiler class in the codebase:
 *
 * gamedev: UnityCompiler, UnrealCompiler, GodotCompiler
 * social-vr: VRChatCompiler
 * xr: OpenXRCompiler, VisionOSCompiler, ARCompiler, AndroidXRCompiler, AIGlassesCompiler
 * mobile: AndroidCompiler, IOSCompiler
 * web3d: BabylonCompiler, WebGPUCompiler, R3FCompiler, PlayCanvasCompiler
 * runtime: WASMCompiler
 * shader: TSLCompiler
 * robotics: URDFCompiler, SDFCompiler
 * interchange: USDPhysicsCompiler, GLTFPipeline
 * iot: DTDLCompiler
 * web3: NFTMarketplaceCompiler
 * ai: SCMCompiler, VRRCompiler, A2AAgentCardCompiler
 * neuromorphic: NIRCompiler
 * meta: MultiLayerCompiler, IncrementalCompiler, StateCompiler, TraitCompositionCompiler
 * mixin: DomainBlockCompilerMixin
 */
export type CompilerName =
  // gamedev
  | 'unity'
  | 'unreal'
  | 'godot'
  // social-vr
  | 'vrchat'
  // xr
  | 'openxr'
  | 'openxr-spatial-entities'
  | 'visionos'
  | 'ar'
  | 'android-xr'
  | 'ai-glasses'
  | 'quilt'
  | 'mv-hevc'
  // mobile
  | 'android'
  | 'ios'
  // web3d
  | 'babylon'
  | 'webgpu'
  | 'r3f'
  | 'playcanvas'
  // runtime
  | 'wasm'
  | 'node-service'
  | 'nextjs-api'
  // shader
  | 'tsl'
  // robotics
  | 'urdf'
  | 'sdf'
  // interchange
  | 'usd'
  | 'gltf'
  // iot
  | 'dtdl'
  // web3
  | 'nft-marketplace'
  // ai
  | 'scm'
  | 'vrr'
  | 'a2a-agent-card'
  | 'agent-inference'
  // neuromorphic
  | 'nir'
  // meta
  | 'multi-layer'
  | 'incremental'
  | 'state'
  | 'trait-composition'
  // mixin
  | 'domain-block';

// ---------------------------------------------------------------------------
// ANS Capability Path Constants
// ---------------------------------------------------------------------------

/**
 * ANS capability path prefix for all compile operations.
 */
export const ANS_PREFIX = '/compile' as const;

/**
 * Complete ANS capability paths for all 31 HoloScript compilers.
 *
 * Pattern: /compile/DOMAIN/TARGET
 *
 * These paths are used in UCAN capability tokens to scope authorization
 * to specific compilation targets.
 */
export const ANSCapabilityPath = {
  // ── gamedev ──────────────────────────────────────────────────────────
  UNITY: '/compile/gamedev/unity',
  UNREAL: '/compile/gamedev/unreal',
  GODOT: '/compile/gamedev/godot',

  // ── social-vr ────────────────────────────────────────────────────────
  VRCHAT: '/compile/social-vr/vrchat',

  // ── xr ───────────────────────────────────────────────────────────────
  OPENXR: '/compile/xr/openxr',
  OPENXR_SPATIAL_ENTITIES: '/compile/xr/openxr-spatial-entities',
  VISIONOS: '/compile/xr/visionos',
  AR: '/compile/xr/ar',
  ANDROID_XR: '/compile/xr/android-xr',
  AI_GLASSES: '/compile/xr/ai-glasses',
  QUILT: '/compile/xr/quilt',
  MV_HEVC: '/compile/xr/mv-hevc',

  // ── mobile ───────────────────────────────────────────────────────────
  ANDROID: '/compile/mobile/android',
  IOS: '/compile/mobile/ios',

  // ── web3d ────────────────────────────────────────────────────────────
  BABYLON: '/compile/web3d/babylon',
  WEBGPU: '/compile/web3d/webgpu',
  R3F: '/compile/web3d/r3f',
  PLAYCANVAS: '/compile/web3d/playcanvas',

  // ── runtime ──────────────────────────────────────────────────────────
  WASM: '/compile/runtime/wasm',
  NODE_SERVICE: '/compile/runtime/node-service',
  NEXTJS_API: '/compile/runtime/nextjs-api',

  // ── shader ───────────────────────────────────────────────────────────
  TSL: '/compile/shader/tsl',

  // ── robotics ─────────────────────────────────────────────────────────
  URDF: '/compile/robotics/urdf',
  SDF: '/compile/robotics/sdf',

  // ── interchange ──────────────────────────────────────────────────────
  USD: '/compile/interchange/usd',
  GLTF: '/compile/interchange/gltf',

  // ── iot ──────────────────────────────────────────────────────────────
  DTDL: '/compile/iot/dtdl',

  // ── web3 ─────────────────────────────────────────────────────────────
  NFT_MARKETPLACE: '/compile/web3/nft-marketplace',

  // ── ai ───────────────────────────────────────────────────────────────
  SCM: '/compile/ai/scm',
  VRR: '/compile/ai/vrr',
  A2A_AGENT_CARD: '/compile/ai/a2a-agent-card',
  AGENT_INFERENCE: '/compile/ai/agent-inference',

  // ── neuromorphic ─────────────────────────────────────────────────────
  NIR: '/compile/neuromorphic/nir',

  // ── meta ─────────────────────────────────────────────────────────────
  MULTI_LAYER: '/compile/meta/multi-layer',
  INCREMENTAL: '/compile/meta/incremental',
  STATE: '/compile/meta/state',
  TRAIT_COMPOSITION: '/compile/meta/trait-composition',

  // ── mixin ────────────────────────────────────────────────────────────
  DOMAIN_BLOCK: '/compile/mixin/domain-block',
} as const;

export type ANSCapabilityPathValue = (typeof ANSCapabilityPath)[keyof typeof ANSCapabilityPath];

// ---------------------------------------------------------------------------
// Compiler-to-Domain Mapping
// ---------------------------------------------------------------------------

/**
 * Maps each compiler name to its domain.
 */
export const COMPILER_DOMAIN_MAP: Readonly<Record<CompilerName, ANSDomainValue>> = {
  // gamedev
  unity: ANSDomain.GAMEDEV,
  unreal: ANSDomain.GAMEDEV,
  godot: ANSDomain.GAMEDEV,
  // social-vr
  vrchat: ANSDomain.SOCIAL_VR,
  // xr
  openxr: ANSDomain.XR,
  'openxr-spatial-entities': ANSDomain.XR,
  visionos: ANSDomain.XR,
  ar: ANSDomain.XR,
  'android-xr': ANSDomain.XR,
  'ai-glasses': ANSDomain.XR,
  quilt: ANSDomain.XR,
  'mv-hevc': ANSDomain.XR,
  // mobile
  android: ANSDomain.MOBILE,
  ios: ANSDomain.MOBILE,
  // web3d
  babylon: ANSDomain.WEB3D,
  webgpu: ANSDomain.WEB3D,
  r3f: ANSDomain.WEB3D,
  playcanvas: ANSDomain.WEB3D,
  // runtime
  wasm: ANSDomain.RUNTIME,
  'node-service': ANSDomain.RUNTIME,
  'nextjs-api': ANSDomain.RUNTIME,
  // shader
  tsl: ANSDomain.SHADER,
  // robotics
  urdf: ANSDomain.ROBOTICS,
  sdf: ANSDomain.ROBOTICS,
  // interchange
  usd: ANSDomain.INTERCHANGE,
  gltf: ANSDomain.INTERCHANGE,
  // iot
  dtdl: ANSDomain.IOT,
  // web3
  'nft-marketplace': ANSDomain.WEB3,
  // ai
  scm: ANSDomain.AI,
  vrr: ANSDomain.AI,
  'a2a-agent-card': ANSDomain.AI,
  'agent-inference': ANSDomain.AI,
  // neuromorphic
  nir: ANSDomain.NEUROMORPHIC,
  // meta
  'multi-layer': ANSDomain.META,
  incremental: ANSDomain.META,
  state: ANSDomain.META,
  'trait-composition': ANSDomain.META,
  // mixin
  'domain-block': ANSDomain.MIXIN,
} as const;

// ---------------------------------------------------------------------------
// Compiler-to-ANS Path Mapping
// ---------------------------------------------------------------------------

/**
 * Maps each compiler name to its ANS capability path.
 */
export const COMPILER_ANS_MAP: Readonly<Record<CompilerName, ANSCapabilityPathValue>> = {
  unity: ANSCapabilityPath.UNITY,
  unreal: ANSCapabilityPath.UNREAL,
  godot: ANSCapabilityPath.GODOT,
  vrchat: ANSCapabilityPath.VRCHAT,
  openxr: ANSCapabilityPath.OPENXR,
  'openxr-spatial-entities': ANSCapabilityPath.OPENXR_SPATIAL_ENTITIES,
  visionos: ANSCapabilityPath.VISIONOS,
  ar: ANSCapabilityPath.AR,
  'android-xr': ANSCapabilityPath.ANDROID_XR,
  'ai-glasses': ANSCapabilityPath.AI_GLASSES,
  quilt: ANSCapabilityPath.QUILT,
  'mv-hevc': ANSCapabilityPath.MV_HEVC,
  android: ANSCapabilityPath.ANDROID,
  ios: ANSCapabilityPath.IOS,
  babylon: ANSCapabilityPath.BABYLON,
  webgpu: ANSCapabilityPath.WEBGPU,
  r3f: ANSCapabilityPath.R3F,
  playcanvas: ANSCapabilityPath.PLAYCANVAS,
  wasm: ANSCapabilityPath.WASM,
  'node-service': ANSCapabilityPath.NODE_SERVICE,
  'nextjs-api': ANSCapabilityPath.NEXTJS_API,
  tsl: ANSCapabilityPath.TSL,
  urdf: ANSCapabilityPath.URDF,
  sdf: ANSCapabilityPath.SDF,
  usd: ANSCapabilityPath.USD,
  gltf: ANSCapabilityPath.GLTF,
  dtdl: ANSCapabilityPath.DTDL,
  'nft-marketplace': ANSCapabilityPath.NFT_MARKETPLACE,
  scm: ANSCapabilityPath.SCM,
  vrr: ANSCapabilityPath.VRR,
  'a2a-agent-card': ANSCapabilityPath.A2A_AGENT_CARD,
  'agent-inference': ANSCapabilityPath.AGENT_INFERENCE,
  nir: ANSCapabilityPath.NIR,
  'multi-layer': ANSCapabilityPath.MULTI_LAYER,
  incremental: ANSCapabilityPath.INCREMENTAL,
  state: ANSCapabilityPath.STATE,
  'trait-composition': ANSCapabilityPath.TRAIT_COMPOSITION,
  'domain-block': ANSCapabilityPath.DOMAIN_BLOCK,
} as const;

// ---------------------------------------------------------------------------
// All Compiler Names (runtime array)
// ---------------------------------------------------------------------------

/**
 * Array of all 31 compiler names, useful for iteration and validation.
 */
export const ALL_COMPILER_NAMES: readonly CompilerName[] = Object.keys(
  COMPILER_DOMAIN_MAP
) as CompilerName[];

/**
 * Array of all domain values, useful for iteration and validation.
 */
export const ALL_DOMAINS: readonly ANSDomainValue[] = Object.values(ANSDomain);

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the ANS capability namespace path for a compiler.
 *
 * @param compiler - Compiler name (type-safe)
 * @returns The ANS path string (e.g., "/compile/gamedev/unity")
 *
 * @example
 * ```ts
 * getNamespaceForCompiler('unity')   // => "/compile/gamedev/unity"
 * getNamespaceForCompiler('urdf')    // => "/compile/robotics/urdf"
 * ```
 */
export function getNamespaceForCompiler(compiler: CompilerName): ANSCapabilityPathValue {
  return COMPILER_ANS_MAP[compiler];
}

/**
 * Get the domain for a compiler.
 *
 * @param compiler - Compiler name (type-safe)
 * @returns The domain string (e.g., "gamedev", "robotics")
 *
 * @example
 * ```ts
 * getDomainForCompiler('unity')   // => "gamedev"
 * getDomainForCompiler('urdf')    // => "robotics"
 * ```
 */
export function getDomainForCompiler(compiler: CompilerName): ANSDomainValue {
  return COMPILER_DOMAIN_MAP[compiler];
}

/**
 * Get the risk tier for a domain.
 *
 * @param domain - Domain value (type-safe)
 * @returns The risk tier ("STANDARD", "HIGH", or "CRITICAL")
 *
 * @example
 * ```ts
 * getRiskTierForDomain('gamedev')    // => "STANDARD"
 * getRiskTierForDomain('robotics')   // => "CRITICAL"
 * getRiskTierForDomain('web3')       // => "CRITICAL"
 * ```
 */
export function getRiskTierForDomain(domain: ANSDomainValue): RiskTierValue {
  return DOMAIN_RISK_TIERS[domain];
}

/**
 * Get the risk tier for a specific compiler (convenience).
 *
 * @param compiler - Compiler name (type-safe)
 * @returns The risk tier ("STANDARD", "HIGH", or "CRITICAL")
 *
 * @example
 * ```ts
 * getRiskTierForCompiler('unity')           // => "STANDARD"
 * getRiskTierForCompiler('nft-marketplace')  // => "CRITICAL"
 * ```
 */
export function getRiskTierForCompiler(compiler: CompilerName): RiskTierValue {
  return DOMAIN_RISK_TIERS[COMPILER_DOMAIN_MAP[compiler]];
}

/**
 * Get all compiler names that belong to a specific domain.
 *
 * @param domain - Domain value (type-safe)
 * @returns Array of compiler names in the domain
 *
 * @example
 * ```ts
 * getAllCompilersInDomain('gamedev')  // => ["unity", "unreal", "godot"]
 * getAllCompilersInDomain('web3')     // => ["nft-marketplace"]
 * ```
 */
export function getAllCompilersInDomain(domain: ANSDomainValue): CompilerName[] {
  return ALL_COMPILER_NAMES.filter((compiler) => COMPILER_DOMAIN_MAP[compiler] === domain);
}

/**
 * Get all compiler names that have a specific risk tier.
 *
 * @param tier - Risk tier value
 * @returns Array of compiler names at the given risk tier
 *
 * @example
 * ```ts
 * getAllCompilersWithRiskTier('CRITICAL')
 * // => ["urdf", "sdf", "nft-marketplace"]
 * ```
 */
export function getAllCompilersWithRiskTier(tier: RiskTierValue): CompilerName[] {
  return ALL_COMPILER_NAMES.filter((compiler) => getRiskTierForCompiler(compiler) === tier);
}

/**
 * Get all domains that have a specific risk tier.
 *
 * @param tier - Risk tier value
 * @returns Array of domain values at the given risk tier
 *
 * @example
 * ```ts
 * getAllDomainsWithRiskTier('CRITICAL')  // => ["robotics", "web3"]
 * ```
 */
export function getAllDomainsWithRiskTier(tier: RiskTierValue): ANSDomainValue[] {
  return ALL_DOMAINS.filter((domain) => DOMAIN_RISK_TIERS[domain] === tier);
}

/**
 * Validate whether a string is a valid compiler name.
 *
 * @param name - String to validate
 * @returns True if the string is a valid CompilerName
 *
 * @example
 * ```ts
 * isValidCompilerName('unity')    // => true
 * isValidCompilerName('invalid')  // => false
 * ```
 */
export function isValidCompilerName(name: string): name is CompilerName {
  return ALL_COMPILER_NAMES.includes(name as CompilerName);
}

/**
 * Validate whether a string is a valid ANS domain.
 *
 * @param domain - String to validate
 * @returns True if the string is a valid ANSDomainValue
 *
 * @example
 * ```ts
 * isValidDomain('gamedev')   // => true
 * isValidDomain('invalid')   // => false
 * ```
 */
export function isValidDomain(domain: string): domain is ANSDomainValue {
  return ALL_DOMAINS.includes(domain as ANSDomainValue);
}

/**
 * Parse an ANS capability path into its domain and target components.
 *
 * @param path - ANS capability path (e.g., "/compile/gamedev/unity")
 * @returns Parsed components or null if the path is invalid
 *
 * @example
 * ```ts
 * parseANSPath('/compile/gamedev/unity')
 * // => { domain: "gamedev", target: "unity", compiler: "unity" }
 *
 * parseANSPath('/invalid/path')
 * // => null
 * ```
 */
export function parseANSPath(
  path: string
): { domain: ANSDomainValue; target: string; compiler: CompilerName } | null {
  const match = path.match(/^\/compile\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  const [, domain, target] = match;
  if (!isValidDomain(domain)) return null;
  if (!isValidCompilerName(target)) return null;

  return { domain: domain as ANSDomainValue, target, compiler: target as CompilerName };
}

/**
 * Build an ANS capability path from domain and target components.
 *
 * @param domain - The domain (e.g., "gamedev")
 * @param target - The compiler target (e.g., "unity")
 * @returns The ANS capability path, or null if inputs are invalid
 *
 * @example
 * ```ts
 * buildANSPath('gamedev', 'unity')  // => "/compile/gamedev/unity"
 * buildANSPath('invalid', 'unity')  // => null
 * ```
 */
export function buildANSPath(domain: string, target: string): string | null {
  if (!isValidDomain(domain)) return null;
  if (!isValidCompilerName(target)) return null;
  if (COMPILER_DOMAIN_MAP[target] !== domain) return null;

  return `${ANS_PREFIX}/${domain}/${target}`;
}

/**
 * Get a summary of the ANS namespace for documentation/debugging.
 *
 * @returns Object with domain counts, compiler counts, risk tier distribution
 */
export function getANSSummary(): {
  totalCompilers: number;
  totalDomains: number;
  compilersByDomain: Record<string, number>;
  compilersByRiskTier: Record<string, number>;
  domainsByRiskTier: Record<string, string[]>;
} {
  const compilersByDomain: Record<string, number> = {};
  const compilersByRiskTier: Record<string, number> = {};
  const domainsByRiskTier: Record<string, string[]> = {};

  for (const domain of ALL_DOMAINS) {
    const count = getAllCompilersInDomain(domain).length;
    compilersByDomain[domain] = count;
  }

  for (const tier of Object.values(RiskTier)) {
    compilersByRiskTier[tier] = getAllCompilersWithRiskTier(tier).length;
    domainsByRiskTier[tier] = getAllDomainsWithRiskTier(tier);
  }

  return {
    totalCompilers: ALL_COMPILER_NAMES.length,
    totalDomains: ALL_DOMAINS.length,
    compilersByDomain,
    compilersByRiskTier,
    domainsByRiskTier,
  };
}
