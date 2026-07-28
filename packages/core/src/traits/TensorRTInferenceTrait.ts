/**
 * @TensorRTInference — NVIDIA TensorRT quantized inference trait
 *
 * Jetson-specific extension. Declares a TensorRT optimised model engine for
 * accelerated inference on Jetson's GPU. Triggers EdgeCompiler to emit a
 * tensorrt_loader.py with engine load/build helpers and precision config.
 *
 * TensorRT engines are device-specific — a FP16 engine built on Orin Nano
 * will not run on Xavier NX. Build per device using trtexec:
 *   trtexec --onnx=model.onnx --saveEngine=model.fp16.trt --fp16
 *
 * Usage:
 *   traits ["tensorrt_inference"]   // in .hsplus compositions
 *   @TensorRTInference              // in .holo/.hs objects
 */

export type TRTPrecision = 'fp32' | 'fp16' | 'int8';

export interface TensorRTConfig {
  /** Path to the built TensorRT engine file on the device */
  enginePath?: string;
  /** Inference precision (default: fp16 — best perf/accuracy on Orin) */
  precision?: TRTPrecision;
  /** Source ONNX model path for engine build if engine not found */
  onnxPath?: string;
  /** Max batch size for engine optimisation (default: 1) */
  maxBatchSize?: number;
  /** Max workspace size in MB for engine build (default: 4096) */
  workspaceMB?: number;
  /** Whether to cache the engine after build (default: true) */
  cacheEngine?: boolean;
}

export interface TensorRTState {
  engineLoaded: boolean;
  precision: TRTPrecision;
  enginePath: string | null;
  buildDurationMs: number | null;
  lastInferenceMs: number | null;
  totalInferences: number;
}

export const TENSOR_RT_DEFAULTS: Required<TensorRTConfig> = {
  enginePath: '/opt/holoscript/engines/model.fp16.trt',
  precision: 'fp16',
  onnxPath: '/opt/holoscript/models/model.onnx',
  maxBatchSize: 1,
  workspaceMB: 4096,
  cacheEngine: true,
};

export function resolveTensorRTConfig(params?: Partial<TensorRTConfig>): Required<TensorRTConfig> {
  return { ...TENSOR_RT_DEFAULTS, ...params };
}

/** trtexec command to build an engine from ONNX */
export function buildTrtexecCommand(config: Required<TensorRTConfig>): string {
  const precisionFlag = config.precision === 'fp32' ? '' : `--${config.precision}`;
  return [
    'trtexec',
    `--onnx=${config.onnxPath}`,
    `--saveEngine=${config.enginePath}`,
    precisionFlag,
    `--maxBatch=${config.maxBatchSize}`,
    `--workspace=${config.workspaceMB}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Expected latency targets for Orin Nano Super (measured, W.733):
 * These are rough guides — actual latency depends on model architecture and input size.
 */
export const ORIN_NANO_LATENCY_TARGETS: Record<TRTPrecision, { target_ms: number; note: string }> =
  {
    fp32: { target_ms: 50, note: 'full precision, slowest' },
    fp16: { target_ms: 20, note: 'half precision, recommended for Orin' },
    int8: { target_ms: 10, note: 'INT8 requires calibration dataset' },
  };
