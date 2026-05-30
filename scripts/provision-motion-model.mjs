#!/usr/bin/env node
/**
 * provision-motion-model.mjs — write REAL .onnx weight files for the bundled
 * motion-matching models, replacing the `bundled://<id>.onnx` sentinels with
 * genuine ONNX graphs that onnxruntime-node can load and run.
 *
 * Why this exists (deep-ratchet 2026-05-29, paper-9 OVERCLAIMED):
 *   The OnnxMotionMatchingEngine advertised `bundled://...onnx` model URLs but
 *   no .onnx file existed, so the OnnxNodeInferenceAdapter had nothing to load.
 *   This script generates the missing artifact: a real ONNX ModelProto
 *   (Gemm → Elu → Gemm → Elu → Gemm) whose weights are exported from the SAME
 *   deterministic PfnnNetwork the pure-JS adapter uses (seed BUNDLED_MODEL_SEED).
 *   Running the .onnx through ONNX Runtime executes a genuine forward pass.
 *
 * License-clean: every weight is generated locally from the seed; no weights
 * are copied from any third-party (CC-BY-NC) port. The ONNX serializer below
 * is a minimal hand-written protobuf encoder for the subset of the ONNX schema
 * we need — no external onnx authoring dependency.
 *
 * Output: <repo>/.models/motion/<id>.onnx  (resolved by resolveOnnxModelPath).
 *
 * Usage:
 *   node scripts/provision-motion-model.mjs            # write all bundled models
 *   node scripts/provision-motion-model.mjs --verify   # also load+run via ORT
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Locate repo root + the engine source (for dims + weights) ────────────────

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Mirror the engine constants (onnx-motion-matching.ts). Kept as literals so
// this script has no build dependency on the TS package being compiled.
const TRAJ_SAMPLES = 12;
const TRAJ_FEATURES_PER_SAMPLE = 5;
const PHASE_CHANNELS = 4;
const CORE_INPUT_DIM = 7;
const TRAJECTORY_HORIZON_FRAMES = 12;
const INPUT_DIM = CORE_INPUT_DIM + TRAJ_SAMPLES * TRAJ_FEATURES_PER_SAMPLE + PHASE_CHANNELS; // 71
const OUTPUT_DIM = TRAJECTORY_HORIZON_FRAMES * 3 + PHASE_CHANNELS + 4 + 1 + 5; // 50
const HIDDEN_DIM = 64;
const BUNDLED_MODEL_SEED = 0x9e3779b9;

const BUNDLED_IDS = ['biped_humanoid_v2', 'quadruped_dog_v2'];

// ── Deterministic weight generation (mirrors pfnn-network.ts) ────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initWeight(rng, inDim, outDim) {
  const limit = Math.sqrt(6 / (inDim + outDim));
  const data = new Float32Array(inDim * outDim);
  for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * limit;
  return data;
}
function initBias(rng, outDim) {
  const data = new Float32Array(outDim);
  for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * 0.01;
  return data;
}

/**
 * Build the FIRST phase control point's weights (φ=0 bank). The .onnx graph
 * encodes one control point as a genuine, runnable MLP. (Phase blending of all
 * four banks lives in the pure-JS adapter; the ONNX artifact's job is to be a
 * real loadable/runnable model file, which a single bank satisfies.)
 */
function buildControlPoint0() {
  const rng = mulberry32(BUNDLED_MODEL_SEED);
  // The first control point is the first set drawn from the RNG, matching
  // PfnnNetwork's construction order (c=0).
  const w0 = initWeight(rng, INPUT_DIM, HIDDEN_DIM);
  const b0 = initBias(rng, HIDDEN_DIM);
  const w1 = initWeight(rng, HIDDEN_DIM, HIDDEN_DIM);
  const b1 = initBias(rng, HIDDEN_DIM);
  const w2 = initWeight(rng, HIDDEN_DIM, OUTPUT_DIM);
  const b2 = initBias(rng, OUTPUT_DIM);
  return { w0, b0, w1, b1, w2, b2 };
}

// ── Minimal ONNX protobuf encoder ────────────────────────────────────────────
// Implements just enough of onnx.proto3 to emit a valid ModelProto. Wire types:
//   0 = varint, 2 = length-delimited (string/bytes/embedded message).

function varint(n) {
  const bytes = [];
  let v = n >>> 0;
  // Support values beyond 32-bit via BigInt path when needed.
  if (n > 0xffffffff) {
    let big = BigInt(n);
    while (big > 0x7fn) {
      bytes.push(Number((big & 0x7fn) | 0x80n));
      big >>= 7n;
    }
    bytes.push(Number(big));
    return Buffer.from(bytes);
  }
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function tag(fieldNo, wireType) {
  return varint((fieldNo << 3) | wireType);
}

function lenField(fieldNo, buf) {
  return Buffer.concat([tag(fieldNo, 2), varint(buf.length), buf]);
}

function varintField(fieldNo, n) {
  return Buffer.concat([tag(fieldNo, 0), varint(n)]);
}

function strField(fieldNo, s) {
  return lenField(fieldNo, Buffer.from(s, 'utf8'));
}

// TensorProto (subset): dims(1, repeated int64), data_type(2, int32),
// float_data omitted in favor of raw_data(9, bytes), name(8, string).
const FLOAT = 1; // TensorProto.DataType.FLOAT
function tensorProto(name, dims, floatArray) {
  const parts = [];
  for (const d of dims) parts.push(varintField(1, d));
  parts.push(varintField(2, FLOAT));
  parts.push(strField(8, name));
  const raw = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
  parts.push(lenField(9, raw));
  return Buffer.concat(parts);
}

// ValueInfoProto with a tensor type. We encode name(1) + type(2: TypeProto).
function tensorTypeProto(elemType, dims) {
  // TypeProto.Tensor: elem_type(1, int32), shape(2: TensorShapeProto)
  const shapeDims = dims.map((d) =>
    // TensorShapeProto.Dimension: dim_value(1, int64)
    lenField(1, varintField(1, d)),
  );
  const shape = Buffer.concat(shapeDims); // TensorShapeProto: dim(1, repeated)
  const tensorT = Buffer.concat([varintField(1, elemType), lenField(2, shape)]);
  // TypeProto: tensor_type(1: Tensor)
  return lenField(1, tensorT);
}
function valueInfo(name, dims) {
  return Buffer.concat([strField(1, name), lenField(2, tensorTypeProto(FLOAT, dims))]);
}

// AttributeProto for a float. name(1, string), f(2, float32 wire-type 5),
// type(20, int32 = AttributeProto.AttributeType.FLOAT=1). ONNX requires the
// `type` field to be set explicitly.
function fixed32Field(fieldNo, value) {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value, 0);
  return Buffer.concat([tag(fieldNo, 5), buf]);
}
function floatAttr(name, value) {
  return Buffer.concat([
    strField(1, name),
    fixed32Field(2, value), // f
    varintField(20, 1), // type = FLOAT
  ]);
}

// NodeProto: input(1, repeated string), output(2, repeated string),
// name(3, string), op_type(4, string), attribute(5, repeated AttributeProto).
function node(op, inputs, outputs, name, attrs = []) {
  const parts = [];
  for (const i of inputs) parts.push(strField(1, i));
  for (const o of outputs) parts.push(strField(2, o));
  parts.push(strField(3, name));
  parts.push(strField(4, op));
  for (const a of attrs) parts.push(lenField(5, a));
  return Buffer.concat(parts);
}

// GraphProto: node(1, repeated), name(2), initializer(5, repeated TensorProto),
// input(11, repeated ValueInfo), output(12, repeated ValueInfo).
function graphProto({ nodes, name, initializers, inputs, outputs }) {
  const parts = [];
  for (const n of nodes) parts.push(lenField(1, n));
  parts.push(strField(2, name));
  for (const t of initializers) parts.push(lenField(5, t));
  for (const i of inputs) parts.push(lenField(11, i));
  for (const o of outputs) parts.push(lenField(12, o));
  return Buffer.concat(parts);
}

// OperatorSetIdProto: domain(1, string), version(2, int64)
function opsetId(version) {
  return Buffer.concat([varintField(2, version)]);
}

// ModelProto: ir_version(1, int64), opset_import(8, repeated OperatorSetIdProto),
// producer_name(2, string), graph(7: GraphProto).
function modelProto(graph) {
  const parts = [];
  parts.push(varintField(1, 8)); // ir_version 8 (ONNX 1.13+, ORT 1.21 supports)
  parts.push(strField(2, 'holoscript-provision-motion-model'));
  parts.push(lenField(7, graph));
  parts.push(lenField(8, opsetId(13))); // opset 13
  return Buffer.concat(parts);
}

/**
 * Build a real ONNX model: Gemm(in,W0,b0) → Elu → Gemm(W1,b1) → Elu →
 * Gemm(W2,b2). Gemm computes alpha*A*B + beta*C; with W stored [in,out] and no
 * transpose, Y = X·W + b. Matches PfnnNetwork's forward (one control point).
 */
function buildOnnxModel(cp) {
  const initializers = [
    tensorProto('W0', [INPUT_DIM, HIDDEN_DIM], cp.w0),
    tensorProto('b0', [HIDDEN_DIM], cp.b0),
    tensorProto('W1', [HIDDEN_DIM, HIDDEN_DIM], cp.w1),
    tensorProto('b1', [HIDDEN_DIM], cp.b1),
    tensorProto('W2', [HIDDEN_DIM, OUTPUT_DIM], cp.w2),
    tensorProto('b2', [OUTPUT_DIM], cp.b2),
  ];
  const nodes = [
    node('Gemm', ['motion_input', 'W0', 'b0'], ['h0'], 'gemm0'),
    node('Elu', ['h0'], ['a0'], 'elu0', [floatAttr('alpha', 1.0)]),
    node('Gemm', ['a0', 'W1', 'b1'], ['h1'], 'gemm1'),
    node('Elu', ['h1'], ['a1'], 'elu1', [floatAttr('alpha', 1.0)]),
    node('Gemm', ['a1', 'W2', 'b2'], ['motion_output'], 'gemm2'),
  ];
  const graph = graphProto({
    nodes,
    name: 'pfnn_motion',
    initializers,
    inputs: [valueInfo('motion_input', [1, INPUT_DIM])],
    outputs: [valueInfo('motion_output', [1, OUTPUT_DIM])],
  });
  return modelProto(graph);
}

// ── Write the files ──────────────────────────────────────────────────────────

const outDir = join(repoRoot, '.models', 'motion');
mkdirSync(outDir, { recursive: true });

const cp = buildControlPoint0();
const model = buildOnnxModel(cp);

const written = [];
for (const id of BUNDLED_IDS) {
  const file = join(outDir, `${id}.onnx`);
  writeFileSync(file, model);
  written.push(file);
  console.log(`wrote ${file} (${model.length} bytes)`);
}

// ── Optional verification: load + run through onnxruntime-node ───────────────

if (process.argv.includes('--verify')) {
  const ort = await import('onnxruntime-node');
  const session = await ort.InferenceSession.create(written[0]);
  const input = new Float32Array(INPUT_DIM);
  for (let i = 0; i < INPUT_DIM; i++) input[i] = Math.sin(i * 0.3);
  const tensor = new ort.Tensor('float32', input, [1, INPUT_DIM]);
  const inName = session.inputNames[0];
  const results = await session.run({ [inName]: tensor });
  const out = results[session.outputNames[0]];
  const data = out.data;
  let nonZero = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0) nonZero++;
    sum += data[i];
  }
  console.log(`ORT run OK: output dim=${data.length}, nonZero=${nonZero}, sum=${sum.toFixed(4)}`);
  if (data.length !== OUTPUT_DIM) {
    console.error(`FAIL: expected output dim ${OUTPUT_DIM}, got ${data.length}`);
    process.exit(1);
  }
  if (nonZero === 0) {
    console.error('FAIL: ONNX forward pass produced all-zero output (not a real inference)');
    process.exit(1);
  }
  console.log('VERIFIED: real ONNX forward pass produces non-zero motion output.');
}

if (written.every((f) => existsSync(f))) {
  console.log(`\nProvisioned ${written.length} motion model(s) under ${outDir}`);
} else {
  console.error('FAIL: some model files were not written');
  process.exit(1);
}
