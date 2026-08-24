/**
 * @holoscript/snn-webgpu/qec — GPU quantum-error-correction decoding.
 *
 * The [[9,1,3]] rotated surface code, its exact maximum-likelihood reference decoder, a
 * normalized min-sum belief-propagation + OSD-0 CPU decoder, and {@link QECDecoder} — the same
 * BP compiled into a WebGPU compute shader (one thread per decode) for batched throughput on
 * real hardware. Graduated from research/qec-decoder-probe.
 *
 * @module snn-webgpu/qec
 */

export * from './qec-codes.js';
export * from './qec-decoder.js';
export * from './qec-codes-d.js';
export * from './qec-decoder-d.js';
