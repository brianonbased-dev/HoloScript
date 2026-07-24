/**
 * Owned-runtime tensor parity for the N4 residual processor.
 *
 * CPU, WebAssembly, and WebGPU consume the same Float32 feature/weight tensors.
 * The WASM path executes an actual module with linear memory and an exported
 * dot kernel. The WebGPU path requires a caller-supplied live GPUDevice and
 * performs compute dispatch plus mapped-buffer readback.
 */

import type { N4WeightsManifest } from './N4ResidualWorldLoop';

export const N4_RUNTIME_PARITY_TOLERANCE = 1e-5;

export interface N4RuntimeInference {
  readonly runtime: 'cpu' | 'wasm' | 'webgpu';
  readonly output: readonly number[];
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly weightsManifestDigest: string;
  readonly deterministicDigest: string;
}

export interface N4RuntimeParityVerdict {
  readonly valid: boolean;
  readonly maxAbsoluteError: number;
  readonly tolerance: typeof N4_RUNTIME_PARITY_TOLERANCE;
  readonly reason: string;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function tensorChecksum(manifest: N4WeightsManifest): string {
  return fnv1a64(JSON.stringify({
    sourceDigest: manifest.sourceDigest,
    graphDigest: manifest.graphDigest,
    modelDigest: manifest.modelDigest,
    weightTensor: manifest.weightTensor,
    weightShape: manifest.weightShape,
    typeTensor: manifest.typeTensor,
    typeShape: manifest.typeShape,
  }));
}

function validateManifest(manifest: N4WeightsManifest): void {
  const [outputs, features] = manifest.weightShape;
  if (
    outputs <= 0 ||
    features <= 0 ||
    manifest.weightTensor.length !== outputs * features ||
    manifest.featureNames.length !== features ||
    manifest.outputNames.length !== outputs
  ) throw new Error('invalid N4 weight tensor shape');
  if (
    manifest.typeShape[0] <= 0 ||
    manifest.typeShape[1] !== 3 ||
    manifest.typeTensor.length !== manifest.typeShape[0] * manifest.typeShape[1]
  ) throw new Error('invalid N4 type tensor shape');
  if (
    [...manifest.weightTensor, ...manifest.typeTensor].some((value) => !Number.isFinite(value))
  ) throw new Error('N4 manifest contains non-finite tensor value');
  if (tensorChecksum(manifest) !== manifest.tensorChecksum) {
    throw new Error('N4 weights manifest tensor checksum mismatch');
  }
}

function validateFeatures(manifest: N4WeightsManifest, features: readonly number[]): void {
  validateManifest(manifest);
  if (features.length !== manifest.weightShape[1]) {
    throw new Error(
      `N4 feature tensor shape mismatch: expected ${manifest.weightShape[1]}, got ${features.length}`
    );
  }
  if (features.some((value) => !Number.isFinite(value))) {
    throw new Error('N4 features contain non-finite tensor value');
  }
}

function receipt(
  runtime: N4RuntimeInference['runtime'],
  manifest: N4WeightsManifest,
  output: readonly number[]
): N4RuntimeInference {
  const withoutDigest = {
    runtime,
    output: output.map(Math.fround),
    sourceDigest: manifest.sourceDigest,
    graphDigest: manifest.graphDigest,
    modelDigest: manifest.modelDigest,
    weightsManifestDigest: manifest.deterministicDigest,
  };
  return { ...withoutDigest, deterministicDigest: fnv1a64(JSON.stringify(withoutDigest)) };
}

function f32Dot(
  weights: readonly number[],
  offset: number,
  features: readonly number[]
): number {
  let sum = Math.fround(0);
  for (let index = 0; index < features.length; index += 1) {
    sum = Math.fround(
      sum + Math.fround(Math.fround(weights[offset + index]!) * Math.fround(features[index]!))
    );
  }
  return sum;
}

export function inferN4Cpu(
  manifest: N4WeightsManifest,
  features: readonly number[]
): N4RuntimeInference {
  validateFeatures(manifest, features);
  const output = Array.from({ length: manifest.weightShape[0] }, (_, row) =>
    f32Dot(manifest.weightTensor, row * manifest.weightShape[1], features)
  );
  return receipt('cpu', manifest, output);
}

function uleb(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function utf8(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)];
  return [...uleb(bytes.length), ...bytes];
}

function section(id: number, payload: readonly number[]): number[] {
  return [id, ...uleb(payload.length), ...payload];
}

/**
 * Build a minimal open WebAssembly module:
 *   memory 1 page
 *   dot(featuresOffset:i32, weightsOffset:i32, length:i32) -> f32
 */
function buildDotWasmModule(): Uint8Array {
  const type = section(1, [1, 0x60, 3, 0x7f, 0x7f, 0x7f, 1, 0x7d]);
  const functions = section(3, [1, 0]);
  const memory = section(5, [1, 0, 1]);
  const exports = section(7, [
    2,
    ...utf8('memory'),
    2,
    0,
    ...utf8('dot'),
    0,
    0,
  ]);
  const instructions = [
    2, // two local declarations
    1, 0x7f, // local 3: i32 index
    1, 0x7d, // local 4: f32 accumulator
    0x02, 0x40, // block
    0x03, 0x40, // loop
    0x20, 3, // local.get index
    0x20, 2, // local.get length
    0x4f, // i32.ge_u
    0x0d, 1, // br_if block
    0x20, 4, // local.get accumulator
    0x20, 0, // local.get feature offset
    0x20, 3, // local.get index
    0x41, 2, // i32.const 2
    0x74, // i32.shl
    0x6a, // i32.add
    0x2a, 2, 0, // f32.load align=4 offset=0
    0x20, 1, // local.get weight offset
    0x20, 3,
    0x41, 2,
    0x74,
    0x6a,
    0x2a, 2, 0,
    0x94, // f32.mul
    0x92, // f32.add
    0x21, 4, // local.set accumulator
    0x20, 3,
    0x41, 1,
    0x6a,
    0x21, 3, // index += 1
    0x0c, 0, // br loop
    0x0b, // end loop
    0x0b, // end block
    0x20, 4, // local.get accumulator
    0x0b, // end function
  ];
  const body = [...uleb(instructions.length), ...instructions];
  const code = section(10, [1, ...body]);
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...type,
    ...functions,
    ...memory,
    ...exports,
    ...code,
  ]);
}

export async function inferN4Wasm(
  manifest: N4WeightsManifest,
  features: readonly number[]
): Promise<N4RuntimeInference> {
  validateFeatures(manifest, features);
  const wasmBytes = buildDotWasmModule();
  const wasmBuffer = new ArrayBuffer(wasmBytes.byteLength);
  new Uint8Array(wasmBuffer).set(wasmBytes);
  const module = await WebAssembly.compile(wasmBuffer);
  const instance = await WebAssembly.instantiate(module);
  const exports = instance.exports as {
    memory: WebAssembly.Memory;
    dot: (featuresOffset: number, weightsOffset: number, length: number) => number;
  };
  if (!(exports.memory instanceof WebAssembly.Memory) || typeof exports.dot !== 'function') {
    throw new Error('N4 WASM module exports are invalid');
  }
  const featureCount = manifest.weightShape[1];
  const floats = new Float32Array(exports.memory.buffer);
  floats.set(features.map(Math.fround), 0);
  floats.set(manifest.weightTensor.map(Math.fround), featureCount);
  const output = Array.from({ length: manifest.weightShape[0] }, (_, row) =>
    Math.fround(
      exports.dot(
        0,
        (featureCount + row * featureCount) * Float32Array.BYTES_PER_ELEMENT,
        featureCount
      )
    )
  );
  return receipt('wasm', manifest, output);
}

export async function inferN4WebGPU(
  device: GPUDevice,
  manifest: N4WeightsManifest,
  features: readonly number[]
): Promise<N4RuntimeInference> {
  validateFeatures(manifest, features);
  const featureCount = manifest.weightShape[1];
  const outputCount = manifest.weightShape[0];
  const featureBytes = new Float32Array(features.map(Math.fround));
  const weightBytes = new Float32Array(manifest.weightTensor.map(Math.fround));
  const outputByteLength = outputCount * Float32Array.BYTES_PER_ELEMENT;
  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) throw new Error('WebGPU buffer constants unavailable');

  const featureBuffer = device.createBuffer({
    size: featureBytes.byteLength,
    usage: usage.STORAGE | usage.COPY_DST,
  });
  const weightBuffer = device.createBuffer({
    size: weightBytes.byteLength,
    usage: usage.STORAGE | usage.COPY_DST,
  });
  const outputBuffer = device.createBuffer({
    size: outputByteLength,
    usage: usage.STORAGE | usage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: outputByteLength,
    usage: usage.COPY_DST | usage.MAP_READ,
  });
  device.queue.writeBuffer(featureBuffer, 0, featureBytes);
  device.queue.writeBuffer(weightBuffer, 0, weightBytes);

  const shader = device.createShaderModule({
    code: `
      @group(0) @binding(0) var<storage, read> features: array<f32>;
      @group(0) @binding(1) var<storage, read> weights: array<f32>;
      @group(0) @binding(2) var<storage, read_write> output: array<f32>;
      @compute @workgroup_size(1)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let row = gid.x;
        if (row >= ${outputCount}u) { return; }
        var sum = 0.0;
        for (var column = 0u; column < ${featureCount}u; column = column + 1u) {
          sum = sum + weights[row * ${featureCount}u + column] * features[column];
        }
        output[row] = sum;
      }
    `,
  });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: featureBuffer } },
      { binding: 1, resource: { buffer: weightBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(outputCount);
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readback, 0, outputByteLength);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(mapMode.READ);
  const output = [...new Float32Array(readback.getMappedRange().slice(0))];
  readback.unmap();
  featureBuffer.destroy();
  weightBuffer.destroy();
  outputBuffer.destroy();
  readback.destroy();
  return receipt('webgpu', manifest, output);
}

export function verifyN4RuntimeParity(
  reference: N4RuntimeInference,
  candidate: N4RuntimeInference
): N4RuntimeParityVerdict {
  if (
    reference.sourceDigest !== candidate.sourceDigest ||
    reference.graphDigest !== candidate.graphDigest ||
    reference.modelDigest !== candidate.modelDigest ||
    reference.weightsManifestDigest !== candidate.weightsManifestDigest
  ) {
    return {
      valid: false,
      maxAbsoluteError: Number.POSITIVE_INFINITY,
      tolerance: N4_RUNTIME_PARITY_TOLERANCE,
      reason: 'tensor custody digest mismatch',
    };
  }
  if (reference.output.length !== candidate.output.length) {
    return {
      valid: false,
      maxAbsoluteError: Number.POSITIVE_INFINITY,
      tolerance: N4_RUNTIME_PARITY_TOLERANCE,
      reason: 'output shape mismatch',
    };
  }
  const maxAbsoluteError = Math.max(
    0,
    ...reference.output.map((value, index) => Math.abs(value - candidate.output[index]!))
  );
  return {
    valid: maxAbsoluteError <= N4_RUNTIME_PARITY_TOLERANCE,
    maxAbsoluteError,
    tolerance: N4_RUNTIME_PARITY_TOLERANCE,
    reason:
      maxAbsoluteError <= N4_RUNTIME_PARITY_TOLERANCE
        ? 'runtime outputs match'
        : 'runtime output drift exceeds tolerance',
  };
}
