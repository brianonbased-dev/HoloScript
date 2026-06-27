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
      name: 'pcg-graph',
      domain: 'gamedev',
      description: 'Compiles procedural blocks to Unreal PCG XML graph assets',
      supportedTraits: [
        'procedural',
        'pcg_graph',
        'density_filter',
        'slope_mask',
        'scatter',
        'snap_to_terrain',
        'gpu',
      ],
      riskTier: 'standard',
      factory: (opts) => {
        const { PCGGraphCompiler } = require('./PCGGraphCompiler');
        return new PCGGraphCompiler(opts);
      },
      outputExtensions: ['.pcg.xml', '.graph.json', '.gpu-plan.md'],
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
      description:
        'Compiles to VRChat SDK3. Current implementation emits legacy UdonSharp C#; Byte/Udon output is gated on the artifact contract.',
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
      name: 'agent-inference',
      domain: 'ai',
      description: 'Compiles agent brain compositions into runnable inference projects',
      supportedTraits: ['agent', 'model', 'inference', 'system_prompt', 'tool', 'persona'],
      riskTier: 'high',
      factory: (opts) => {
        const { AgentInferenceCompiler } = require('./AgentInferenceExportTarget');
        return new AgentInferenceCompiler(opts);
      },
      outputExtensions: ['.ts', '.py', '.json', '.md'],
    },
    {
      name: 'omnigent-agent-yaml',
      domain: 'ai',
      description: 'Exports HoloScript agent compositions as Omnigent agent YAML plus projection receipt',
      supportedTraits: ['agent', 'model', 'system_prompt', 'tool', 'mcp', 'policy', 'runtime'],
      riskTier: 'high',
      factory: (opts) => {
        const { OmnigentAgentYamlCompiler } = require('./OmnigentAgentYamlCompiler');
        return new OmnigentAgentYamlCompiler(opts);
      },
      outputExtensions: ['.yaml', '.json'],
    },
    {
      name: 'daimon-seed',
      domain: 'ai',
      description:
        'Compiles portable DaimonSeed IR recipes with shared JSON-Logic thresholds; never serializes runtime soul state',
      supportedTraits: ['daimon', 'agent', 'emergence', 'identity', 'content_policy'],
      riskTier: 'high',
      factory: (opts) => {
        const { DaimonSeedCompiler } = require('./DaimonSeedCompiler');
        return new DaimonSeedCompiler(opts);
      },
      outputExtensions: ['.json'],
    },
    {
      name: 'mcp-server',
      domain: 'ai',
      description:
        'Compiles a trait/brain composition into an MCP server manifest (P0 skeleton; trait-walk Tool[] emission + handler dispatch land in P1)',
      supportedTraits: ['llm_agent', 'goal_oriented', 'rag_knowledge', 'agent_memory', 'tool'],
      riskTier: 'high',
      factory: (opts) => {
        const { HoloMCPCompiler } = require('./HoloMCPCompiler');
        return new HoloMCPCompiler(opts);
      },
      outputExtensions: ['.mcp-server.json'],
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
