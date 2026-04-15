/**
 * Boot-time registration of all compiler backends as MLIR-style dialects.
 *
 * Bridges the ExportManager's switch-based dispatch with the DialectRegistry's
 * plugin-based discovery. Called once on import to populate the registry.
 *
 * @see DialectRegistry for the registration API
 * @see ExportManager for the legacy switch-based dispatch
 */

import { DialectRegistry } from './DialectRegistry';
import type { DialectDescriptor } from './DialectRegistry';

// Lazy imports to avoid circular dependencies — each compiler is loaded on-demand
// via factory functions, not at module evaluation time.

let _registered = false;

/**
 * Register all built-in compiler backends as dialects.
 * Idempotent: calling multiple times is safe.
 */
export function registerBuiltinDialects(): void {
  if (_registered) return;
  _registered = true;

  const descriptors: DialectDescriptor[] = [
    // ── Game Engines ──────────────────────────────────────────────────────
    {
      name: 'unity',
      domain: 'gamedev',
      description: 'Compiles to Unity C# MonoBehaviours',
      supportedTraits: [
        'physics',
        'collidable',
        'grabbable',
        'throwable',
        'audio',
        'spatial_audio',
        'animation',
        'particles',
        'material',
        'ui',
        'networked',
        'behavior_tree',
        'navmesh',
        'lod',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { UnityCompiler } = require('./UnityCompiler');
        return new UnityCompiler(opts);
      },
      outputExtensions: ['.cs'],
    },
    {
      name: 'unreal',
      domain: 'gamedev',
      description: 'Compiles to Unreal Engine C++ actors',
      supportedTraits: [
        'physics',
        'collidable',
        'grabbable',
        'audio',
        'animation',
        'particles',
        'material',
        'niagara',
        'landscape',
        'behavior_tree',
        'navmesh',
        'lod',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { UnrealCompiler } = require('./UnrealCompiler');
        return new UnrealCompiler(opts);
      },
      outputExtensions: ['.cpp', '.h'],
    },
    {
      name: 'godot',
      domain: 'gamedev',
      description: 'Compiles to Godot GDScript nodes',
      supportedTraits: [
        'physics',
        'collidable',
        'grabbable',
        'audio',
        'animation',
        'particles',
        'material',
        'behavior_tree',
        'navmesh',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { GodotCompiler } = require('./GodotCompiler');
        return new GodotCompiler(opts);
      },
      outputExtensions: ['.gd', '.tscn'],
    },

    // ── Web 3D ────────────────────────────────────────────────────────────
    {
      name: 'r3f',
      domain: 'web3d',
      description: 'Compiles to React Three Fiber JSX components',
      supportedTraits: [
        'physics',
        'collidable',
        'grabbable',
        'audio',
        'spatial_audio',
        'animation',
        'particles',
        'material',
        'ui',
        'behavior_tree',
        'lod',
        'vr_only',
        'ar_only',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { R3FCompiler } = require('./R3FCompiler');
        return new R3FCompiler(opts);
      },
      outputExtensions: ['.tsx', '.jsx'],
    },
    {
      name: 'babylon',
      domain: 'web3d',
      description: 'Compiles to Babylon.js scene code',
      supportedTraits: [
        'physics',
        'collidable',
        'audio',
        'animation',
        'particles',
        'material',
        'behavior_tree',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { BabylonCompiler } = require('./BabylonCompiler');
        return new BabylonCompiler(opts);
      },
      outputExtensions: ['.ts', '.js'],
    },
    {
      name: 'playcanvas',
      domain: 'web3d',
      description: 'Compiles to PlayCanvas engine scripts',
      supportedTraits: ['physics', 'collidable', 'audio', 'animation', 'material'],
      riskTier: 'standard',
      factory: (opts) => {
        const { PlayCanvasCompiler } = require('./PlayCanvasCompiler');
        return new PlayCanvasCompiler(opts);
      },
      outputExtensions: ['.js'],
    },

    // ── VR/XR ─────────────────────────────────────────────────────────────
    {
      name: 'openxr',
      domain: 'xr',
      description: 'Compiles to OpenXR C++ application layer',
      supportedTraits: [
        'physics',
        'hand_tracking',
        'spatial_anchor',
        'input',
        'collidable',
        'grabbable',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { OpenXRCompiler } = require('./OpenXRCompiler');
        return new OpenXRCompiler(opts);
      },
      outputExtensions: ['.cpp', '.h'],
    },
    {
      name: 'vrchat',
      domain: 'social-vr',
      description: 'Compiles to VRChat UdonSharp scripts',
      supportedTraits: [
        'physics',
        'collidable',
        'grabbable',
        'audio',
        'animation',
        'networked',
        'ui',
        'interaction',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { VRChatCompiler } = require('./VRChatCompiler');
        return new VRChatCompiler(opts);
      },
      outputExtensions: ['.cs'],
    },
    {
      name: 'visionos',
      domain: 'xr',
      description: 'Compiles to visionOS RealityKit Swift',
      supportedTraits: [
        'physics',
        'hand_tracking',
        'spatial_anchor',
        'animation',
        'material',
        'collidable',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { VisionOSCompiler } = require('./VisionOSCompiler');
        return new VisionOSCompiler(opts);
      },
      outputExtensions: ['.swift'],
    },
    {
      name: 'android-xr',
      domain: 'xr',
      description: 'Compiles to Android XR OpenXR Kotlin',
      supportedTraits: ['physics', 'hand_tracking', 'spatial_anchor', 'input', 'collidable'],
      riskTier: 'standard',
      factory: (opts) => {
        const { AndroidXRCompiler } = require('./AndroidXRCompiler');
        return new AndroidXRCompiler(opts);
      },
      outputExtensions: ['.kt'],
    },

    // ── Mobile ────────────────────────────────────────────────────────────
    {
      name: 'ios',
      domain: 'mobile',
      description: 'Compiles to iOS ARKit Swift',
      supportedTraits: ['physics', 'ar_anchor', 'animation', 'material', 'collidable'],
      riskTier: 'standard',
      factory: (opts) => {
        const { IOSCompiler } = require('./IOSCompiler');
        return new IOSCompiler(opts);
      },
      outputExtensions: ['.swift'],
    },
    {
      name: 'android',
      domain: 'mobile',
      description: 'Compiles to Android ARCore Kotlin',
      supportedTraits: ['physics', 'ar_anchor', 'animation', 'material', 'collidable'],
      riskTier: 'standard',
      factory: (opts) => {
        const { AndroidCompiler } = require('./AndroidCompiler');
        return new AndroidCompiler(opts);
      },
      outputExtensions: ['.kt'],
    },
    {
      name: 'ar',
      domain: 'mobile',
      description: 'Compiles to generic AR platform code',
      supportedTraits: ['physics', 'ar_anchor', 'spatial_anchor', 'collidable', 'material'],
      riskTier: 'standard',
      factory: (opts) => {
        const { ARCompiler } = require('./ARCompiler');
        return new ARCompiler(opts);
      },
      outputExtensions: ['.ts'],
    },

    // ── Low-level ─────────────────────────────────────────────────────────
    {
      name: 'wasm',
      domain: 'runtime',
      description: 'Compiles to WebAssembly modules',
      supportedTraits: ['physics', 'animation', 'audio'],
      riskTier: 'high',
      factory: (opts) => {
        const { WASMCompiler } = require('./WASMCompiler');
        return new WASMCompiler(opts);
      },
      outputExtensions: ['.wasm', '.js'],
    },
    {
      name: 'webgpu',
      domain: 'shader',
      description: 'Compiles to WebGPU compute shaders (WGSL)',
      supportedTraits: ['physics', 'particles', 'fluid', 'material', 'compute'],
      riskTier: 'standard',
      factory: (opts) => {
        const { WebGPUCompiler } = require('./WebGPUCompiler');
        return new WebGPUCompiler(opts);
      },
      outputExtensions: ['.wgsl', '.ts'],
    },

    // ── Robotics & IoT ───────────────────────────────────────────────────
    {
      name: 'urdf',
      domain: 'robotics',
      description: 'Compiles to URDF robot descriptions',
      supportedTraits: ['joint', 'actuator', 'sensor', 'collider', 'end_effector'],
      riskTier: 'standard',
      factory: (opts) => {
        const { URDFCompiler } = require('./URDFCompiler');
        return new URDFCompiler(opts);
      },
      outputExtensions: ['.urdf'],
    },
    {
      name: 'sdf',
      domain: 'robotics',
      description: 'Compiles to SDF simulation descriptions (Gazebo)',
      supportedTraits: ['joint', 'actuator', 'sensor', 'collider', 'physics', 'environment'],
      riskTier: 'standard',
      factory: (opts) => {
        const { SDFCompiler } = require('./SDFCompiler');
        return new SDFCompiler(opts);
      },
      outputExtensions: ['.sdf'],
    },
    {
      name: 'dtdl',
      domain: 'iot',
      description: 'Compiles to DTDL digital twin definitions',
      supportedTraits: ['sensor', 'telemetry', 'property', 'command', 'relationship'],
      riskTier: 'standard',
      factory: (opts) => {
        const { DTDLCompiler } = require('./DTDLCompiler');
        return new DTDLCompiler(opts);
      },
      outputExtensions: ['.json'],
    },

    // ── Specialized ───────────────────────────────────────────────────────
    {
      name: 'state',
      domain: 'meta',
      description: 'Extracts reactive state descriptors from compositions',
      supportedTraits: ['state', 'bind', 'reactive'],
      riskTier: 'standard',
      factory: (opts) => {
        const { StateCompiler } = require('./StateCompiler');
        return new StateCompiler(opts);
      },
      outputExtensions: ['.json'],
    },
    {
      name: 'a2a-agent-card',
      domain: 'ai',
      description: 'Generates A2A Agent Card from composition metadata',
      supportedTraits: ['agent', 'skill', 'capability'],
      riskTier: 'standard',
      factory: (opts) => {
        const { A2AAgentCardCompiler } = require('./A2AAgentCardCompiler');
        return new A2AAgentCardCompiler(opts);
      },
      outputExtensions: ['.json'],
    },
    {
      name: 'nir',
      domain: 'neuromorphic',
      description: 'Compiles to Neuromorphic Intermediate Representation',
      supportedTraits: ['snn', 'neuron', 'synapse', 'spike_train'],
      riskTier: 'high',
      factory: (opts) => {
        const { NIRCompiler } = require('./NIRCompiler');
        return new NIRCompiler(opts);
      },
      outputExtensions: ['.json'],
    },
    {
      name: 'vrr',
      domain: 'xr',
      description: 'Compiles with Variable Rate Rendering optimizations',
      supportedTraits: ['physics', 'material', 'lod', 'rendering'],
      riskTier: 'standard',
      factory: (opts) => {
        const { VRRCompiler } = require('./VRRCompiler');
        return new VRRCompiler(opts);
      },
      outputExtensions: ['.ts'],
    },
    {
      name: 'native-2d',
      domain: 'web3d',
      description: 'Compiles to native 2D HTML/CSS/Canvas applications',
      supportedTraits: ['layout', 'style', 'animation', 'interaction'],
      riskTier: 'standard',
      factory: (opts) => {
        const { Native2DCompiler } = require('./Native2DCompiler');
        return new Native2DCompiler(opts);
      },
      outputExtensions: ['.tsx', '.html'],
    },

    // ── Next.js API Routes ────────────────────────────────────────────────
    {
      name: 'nextjs-api',
      domain: 'web',
      description: 'Compiles @http traits to Next.js App Router API route handlers (route.ts)',
      supportedTraits: ['http', 'handler', 'middleware', 'auth', 'rate_limit', 'cors'],
      riskTier: 'standard',
      factory: (opts) => {
        const { NextJSAPICompiler } = require('./NextJSAPICompiler');
        return new NextJSAPICompiler(opts);
      },
      outputExtensions: ['.ts'],
      experimental: true,
    },

    // ── v6 Universal Service ──────────────────────────────────────────────
    {
      name: 'node-service',
      domain: 'service',
      description: 'Compiles @service traits to Express/Fastify applications',
      supportedTraits: [
        'service',
        'endpoint',
        'route',
        'handler',
        'middleware',
        'cors_policy',
        'rate_limiter',
        'health_endpoint',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { NodeServiceCompiler } = require('./NodeServiceCompiler');
        return new NodeServiceCompiler(opts);
      },
      outputExtensions: ['.ts', '.js'],
      experimental: true,
    },
  ];

  for (const desc of descriptors) {
    if (!DialectRegistry.has(desc.name)) {
      DialectRegistry.register(desc);
    }
  }
}
