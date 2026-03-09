/**
 * XR Agent Model Export Target
 *
 * Compiles HoloScript compositions to ExecuTorch-compatible inference
 * packages for on-device XR agent execution.
 *
 * Output format:
 * - ExecuTorch .pte model package manifest
 * - Quantization configs (INT8/FP16)
 * - Input/output tensor specifications
 * - Runtime delegate configurations (XNNPACK, Metal, Vulkan)
 *
 * @version 1.0.0
 * @see https://pytorch.org/executorch
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type QuantizationType = 'fp32' | 'fp16' | 'int8' | 'int4';
export type RuntimeDelegate = 'xnnpack' | 'metal' | 'vulkan' | 'qnn' | 'coreml';

export interface XRAgentModelConfig {
  /** Target quantization (default: 'fp16') */
  quantization?: QuantizationType;
  /** Runtime delegates to enable */
  delegates?: RuntimeDelegate[];
  /** Maximum model size in MB */
  maxModelSizeMB?: number;
  /** Target inference latency in ms */
  targetLatencyMs?: number;
  /** Enable speculative decoding */
  enableSpeculativeDecoding?: boolean;
  /** Max tokens per inference */
  maxTokens?: number;
}

export interface TensorSpec {
  name: string;
  dtype: string;
  shape: number[];
  description: string;
}

export interface ExecuTorchManifest {
  /** Format version */
  format: 'executorch-v1';
  /** Model metadata */
  model: {
    name: string;
    version: string;
    description: string;
    sourceComposition: string;
    compiledAt: string;
  };
  /** Quantization configuration */
  quantization: {
    type: QuantizationType;
    calibrationDataset?: string;
  };
  /** Runtime delegates */
  delegates: Array<{
    name: RuntimeDelegate;
    priority: number;
    config: Record<string, unknown>;
  }>;
  /** Input tensor specifications */
  inputs: TensorSpec[];
  /** Output tensor specifications */
  outputs: TensorSpec[];
  /** Memory budget */
  memory: {
    maxModelSizeMB: number;
    maxRuntimeMemoryMB: number;
    kvCacheSizeMB: number;
  };
  /** Performance targets */
  performance: {
    targetLatencyMs: number;
    maxTokens: number;
    enableSpeculativeDecoding: boolean;
  };
  /** HoloScript traits compiled into the model */
  traits: string[];
  /** Agent capabilities derived from the composition */
  capabilities: string[];
}

export interface XRAgentModelResult {
  success: boolean;
  manifest: ExecuTorchManifest;
  json: string;
  warnings: string[];
  errors: string[];
}

// ── Trait-to-Capability Mapping ────────────────────────────────────────────

const TRAIT_CAPABILITY_MAP: Record<string, string> = {
  NPC: 'dialogue-generation',
  Navigation: 'path-planning',
  BehaviorTree: 'decision-making',
  GoalPlanner: 'goal-planning',
  ComputerUse: 'screen-understanding',
  AINPCBrain: 'personality-modeling',
  AgentDiscovery: 'agent-discovery',
  AgentMemory: 'episodic-memory',
  PerceptionSystem: 'scene-understanding',
  Analytics: 'data-analysis',
};

// ── Compiler ───────────────────────────────────────────────────────────────

export class XRAgentModelCompiler {
  private config: Required<XRAgentModelConfig>;

  constructor(config: XRAgentModelConfig = {}) {
    this.config = {
      quantization: config.quantization ?? 'fp16',
      delegates: config.delegates ?? ['xnnpack'],
      maxModelSizeMB: config.maxModelSizeMB ?? 512,
      targetLatencyMs: config.targetLatencyMs ?? 100,
      enableSpeculativeDecoding: config.enableSpeculativeDecoding ?? false,
      maxTokens: config.maxTokens ?? 256,
    };
  }

  compile(composition: {
    name: string;
    description?: string;
    objects?: Array<{
      name: string;
      traits?: string[];
      properties?: Record<string, unknown>;
    }>;
  }): XRAgentModelResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!composition.name) {
      errors.push('Composition name is required');
    }

    // Collect all traits
    const allTraits = new Set<string>();
    for (const obj of composition.objects ?? []) {
      for (const trait of obj.traits ?? []) {
        allTraits.add(trait);
      }
    }

    // Map traits to capabilities
    const capabilities: string[] = [];
    for (const trait of allTraits) {
      const cap = TRAIT_CAPABILITY_MAP[trait];
      if (cap) {
        capabilities.push(cap);
      }
    }

    // Determine input/output tensors based on capabilities
    const inputs: TensorSpec[] = [
      {
        name: 'input_ids',
        dtype: 'int32',
        shape: [1, this.config.maxTokens],
        description: 'Token IDs',
      },
      {
        name: 'attention_mask',
        dtype: 'int32',
        shape: [1, this.config.maxTokens],
        description: 'Attention mask',
      },
    ];

    const outputs: TensorSpec[] = [
      {
        name: 'logits',
        dtype: this.config.quantization === 'fp16' ? 'float16' : 'float32',
        shape: [1, this.config.maxTokens, -1],
        description: 'Output logits',
      },
    ];

    if (capabilities.includes('scene-understanding')) {
      inputs.push({
        name: 'scene_features',
        dtype: 'float16',
        shape: [1, 256, 768],
        description: 'Scene feature embeddings',
      });
    }

    if (capabilities.includes('path-planning')) {
      inputs.push({
        name: 'navmesh_features',
        dtype: 'float16',
        shape: [1, 64, 3],
        description: 'Navigation mesh waypoints',
      });
      outputs.push({
        name: 'path_waypoints',
        dtype: 'float32',
        shape: [1, 32, 3],
        description: 'Planned path waypoints',
      });
    }

    // Build delegate configs
    const delegates = this.config.delegates.map((name, i) => ({
      name,
      priority: i,
      config: this.getDelegateConfig(name),
    }));

    // Memory estimation
    const modelSizeMB = this.estimateModelSize(allTraits.size, capabilities.length);
    if (modelSizeMB > this.config.maxModelSizeMB) {
      warnings.push(
        `Estimated model size (${modelSizeMB}MB) exceeds budget (${this.config.maxModelSizeMB}MB). ` +
          `Consider using INT8 quantization or reducing trait count.`
      );
    }

    const manifest: ExecuTorchManifest = {
      format: 'executorch-v1',
      model: {
        name: `${composition.name}-xr-agent`,
        version: '1.0.0',
        description:
          composition.description ?? `XR Agent model compiled from '${composition.name}'`,
        sourceComposition: composition.name,
        compiledAt: new Date().toISOString(),
      },
      quantization: {
        type: this.config.quantization,
      },
      delegates,
      inputs,
      outputs,
      memory: {
        maxModelSizeMB: this.config.maxModelSizeMB,
        maxRuntimeMemoryMB: Math.ceil(this.config.maxModelSizeMB * 1.5),
        kvCacheSizeMB: Math.ceil(this.config.maxTokens * 0.5),
      },
      performance: {
        targetLatencyMs: this.config.targetLatencyMs,
        maxTokens: this.config.maxTokens,
        enableSpeculativeDecoding: this.config.enableSpeculativeDecoding,
      },
      traits: [...allTraits],
      capabilities,
    };

    return {
      success: errors.length === 0,
      manifest,
      json: JSON.stringify(manifest, null, 2),
      warnings,
      errors,
    };
  }

  private getDelegateConfig(name: RuntimeDelegate): Record<string, unknown> {
    switch (name) {
      case 'xnnpack':
        return { numThreads: 4, enableFp16: this.config.quantization === 'fp16' };
      case 'metal':
        return { enableFloat16: true, useSharedMemory: true };
      case 'vulkan':
        return { enableFloat16: true, preferredDevice: 'discrete' };
      case 'qnn':
        return { htpPerformanceMode: 'burst', enableHtp: true };
      case 'coreml':
        return { computeUnits: 'cpuAndNeuralEngine' };
      default:
        return {};
    }
  }

  private estimateModelSize(traitCount: number, capabilityCount: number): number {
    // Base 7B model sizes by quantization
    const baseSizes: Record<QuantizationType, number> = {
      fp32: 28000,
      fp16: 14000,
      int8: 7000,
      int4: 3500,
    };
    const base = baseSizes[this.config.quantization];
    // Each capability adds ~2% overhead
    return Math.ceil(base * (1 + capabilityCount * 0.02));
  }
}
