/**
 * Agent Namespace Schema (ANS) — Compiler Capability Paths
 *
 * Canonical definition of /compile/DOMAIN/TARGET paths used in UCAN
 * capability tokens to scope authorization to specific compilation targets.
 *
 * This is the platform-level source of truth. Core's compiler/identity module
 * has a parallel copy for internal use — both must stay in sync.
 */

export const ANSCapabilityPath = {
  UNITY: '/compile/gamedev/unity',
  UNREAL: '/compile/gamedev/unreal',
  GODOT: '/compile/gamedev/godot',
  VRCHAT: '/compile/social-vr/vrchat',
  OPENXR: '/compile/xr/openxr',
  OPENXR_SPATIAL_ENTITIES: '/compile/xr/openxr-spatial-entities',
  VISIONOS: '/compile/xr/visionos',
  AR: '/compile/xr/ar',
  ANDROID_XR: '/compile/xr/android-xr',
  AI_GLASSES: '/compile/xr/ai-glasses',
  QUILT: '/compile/xr/quilt',
  MV_HEVC: '/compile/xr/mv-hevc',
  ANDROID: '/compile/mobile/android',
  IOS: '/compile/mobile/ios',
  BABYLON: '/compile/web3d/babylon',
  WEBGPU: '/compile/web3d/webgpu',
  R3F: '/compile/web3d/r3f',
  PLAYCANVAS: '/compile/web3d/playcanvas',
  WASM: '/compile/runtime/wasm',
  NODE_SERVICE: '/compile/runtime/node-service',
  TSL: '/compile/shader/tsl',
  URDF: '/compile/robotics/urdf',
  SDF: '/compile/robotics/sdf',
  USD: '/compile/interchange/usd',
  GLTF: '/compile/interchange/gltf',
  DTDL: '/compile/iot/dtdl',
  NFT_MARKETPLACE: '/compile/web3/nft-marketplace',
  SCM: '/compile/ai/scm',
  VRR: '/compile/ai/vrr',
  A2A_AGENT_CARD: '/compile/ai/a2a-agent-card',
  AGENT_INFERENCE: '/compile/ai/agent-inference',
  NIR: '/compile/neuromorphic/nir',
  MULTI_LAYER: '/compile/meta/multi-layer',
  INCREMENTAL: '/compile/meta/incremental',
  STATE: '/compile/meta/state',
  TRAIT_COMPOSITION: '/compile/meta/trait-composition',
  DOMAIN_BLOCK: '/compile/mixin/domain-block',
  PHONE_SLEEVE_VR: '/compile/xr/phone-sleeve-vr',
  NEXT_JS: '/compile/web3d/next-js',
  NATIVE_2D: '/compile/web3d/native-2d',
  SDF_RAY_MARCH: '/compile/shader/sdf-ray-march',
  NIR_TO_WGSL: '/compile/neuromorphic/nir-to-wgsl',
  PIPELINE: '/compile/runtime/pipeline',
  HOLOB: '/compile/interchange/holob',
} as const;

export type ANSCapabilityPathValue = (typeof ANSCapabilityPath)[keyof typeof ANSCapabilityPath];
