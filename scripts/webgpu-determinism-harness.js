"use strict";
var WebGPUDeterminismHarnessBrowser = (() => {
  // src/testing/WebGPUDeterminismHarness.ts
  var HARNESS_WORKGROUP_SIZE = 64;
  var HARNESS_KERNEL_NAME = "cael-trace-fold-v1";
  var HARNESS_WGSL = (
    /* wgsl */
    `
struct TraceRow {
  a: u32,
  b: u32,
  c: u32,
  d: u32,
};

struct Params {
  traceLength: u32,
  scenarioSalt: u32,
  replication: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> traceRows: array<TraceRow>;
@group(0) @binding(1) var<storage, read_write> finalState: array<atomic<u32>, 8>;
@group(0) @binding(2) var<uniform> params: Params;

fn mix32(input: u32) -> u32 {
  var x = input;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

@compute @workgroup_size(${HARNESS_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.traceLength) {
    return;
  }

  let row = traceRows[i];
  var v = mix32(row.a ^ params.scenarioSalt);
  v = mix32(v + row.b + (i * 0x85ebca6bu));
  v = mix32(v ^ row.c);
  v = mix32(v + row.d);

  atomicXor(&finalState[i % 8u], v);
  atomicAdd(&finalState[(i + 3u) % 8u], mix32(v ^ 0xc2b2ae35u));
}
`
  );
  function isHarnessMockMode() {
    try {
      if (typeof process !== "undefined" && process.env?.WEBGPU_HARNESS_MOCK === "1") {
        return true;
      }
    } catch {
    }
    return typeof globalThis !== "undefined" && globalThis.__WEBGPU_HARNESS_MOCK__ === true;
  }
  function toUint8Array(input) {
    if (input instanceof Uint8Array) {
      return input;
    }
    return new TextEncoder().encode(input);
  }
  function fnv1a64Hex(bytes) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (let i = 0; i < bytes.length; i++) {
      hash = (hash ^ BigInt(bytes[i])) & mask;
      hash = hash * prime & mask;
    }
    return hash.toString(16).padStart(16, "0");
  }
  async function hashBytes(input, algo = "sha256") {
    const bytes = toUint8Array(input);
    if (algo === "sha256") {
      const subtle = globalThis.crypto?.subtle;
      if (subtle && typeof subtle.digest === "function") {
        try {
          const digestInput = new Uint8Array(bytes.byteLength);
          digestInput.set(bytes);
          const digest = await subtle.digest("SHA-256", digestInput.buffer);
          const view = new Uint8Array(digest);
          let hex = "";
          for (let i = 0; i < view.length; i++) {
            hex += view[i].toString(16).padStart(2, "0");
          }
          return `sha256:${hex}`;
        } catch {
        }
      }
    }
    return `fnv1a-64:${fnv1a64Hex(bytes)}`;
  }
  function fnv1a32(input) {
    const bytes = new TextEncoder().encode(input);
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }
  function mix32(input) {
    let x = input >>> 0;
    x = (x ^ x >>> 16) >>> 0;
    x = Math.imul(x, 2146121005) >>> 0;
    x = (x ^ x >>> 15) >>> 0;
    x = Math.imul(x, 2221713035) >>> 0;
    x = (x ^ x >>> 16) >>> 0;
    return x >>> 0;
  }
  function numberToU32(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true);
    return (view.getUint32(0, true) ^ view.getUint32(4, true)) >>> 0;
  }
  function stableStringify(value) {
    if (value === null) return "null";
    if (value === void 0) return "undefined";
    if (typeof value === "number") {
      if (Number.isNaN(value)) return "number:NaN";
      if (Object.is(value, -0)) return "number:-0";
      return `number:${value}`;
    }
    if (typeof value === "string") return `string:${JSON.stringify(value)}`;
    if (typeof value === "boolean") return `boolean:${value ? "1" : "0"}`;
    if (typeof value === "bigint") return `bigint:${value.toString()}`;
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (ArrayBuffer.isView(value)) {
      const view = value;
      return `${view.constructor.name}:${Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).join(",")}`;
    }
    if (typeof value === "object") {
      const obj = value;
      const keys = Object.keys(obj).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
    }
    return `${typeof value}:${String(value)}`;
  }
  function traceRowsForScenario(scenarioName, trace) {
    if (trace.length === 0) {
      throw new Error(`scenario "${scenarioName}" has an empty CAEL trace`);
    }
    const rows = new Uint32Array(trace.length * 4);
    const scenarioSalt = fnv1a32(`scenario:${scenarioName}`);
    for (let i = 0; i < trace.length; i++) {
      const entry = trace[i];
      const offset = i * 4;
      rows[offset] = mix32(fnv1a32(entry.event) ^ entry.index ^ scenarioSalt);
      rows[offset + 1] = mix32(numberToU32(entry.timestamp) ^ numberToU32(entry.simTime));
      rows[offset + 2] = mix32(fnv1a32(`${entry.prevHash}|${entry.hash}`));
      rows[offset + 3] = mix32(fnv1a32(stableStringify(entry.payload)));
    }
    return rows;
  }
  function kernelMetadata() {
    return {
      name: HARNESS_KERNEL_NAME,
      workgroupSize: HARNESS_WORKGROUP_SIZE,
      wgslBytes: new TextEncoder().encode(HARNESS_WGSL).byteLength
    };
  }
  async function mockFinalDigestForScenario(scenarioName, trace) {
    const payload = JSON.stringify({
      k: "webgpu-determinism-mock-v1",
      scenario: scenarioName,
      traceLen: trace.length,
      tailHash: trace[trace.length - 1]?.hash ?? "",
      head: trace[0]?.hash ?? ""
    });
    return hashBytes(payload, "sha256");
  }
  async function buildMockHarnessArtifact(config) {
    const g = globalThis;
    const browser = typeof g.navigator !== "undefined" && g.navigator?.userAgent ? g.navigator.userAgent : `node-${typeof process !== "undefined" ? process.version : "unknown"}`;
    const adapter = {
      tag: config.adapterTag,
      vendor: `mock-vendor-${config.adapterTag}`,
      device: "mock-device",
      driver: "mock-driver",
      userAgent: browser
    };
    const scenarios = {};
    for (const [scenarioName, trace] of Object.entries(config.traces)) {
      const digest = await mockFinalDigestForScenario(scenarioName, trace);
      const replications = [];
      for (let i = 0; i < config.replications; i++) {
        replications.push({
          finalStateDigest: digest,
          wallMs: 0.42 + i * 1e-6,
          wgslCompileMs: 0.08,
          finalStateFields: config.captureFields ? { mock_field: [1, 2, 3, scenarioName.length] } : void 0
        });
      }
      scenarios[scenarioName] = {
        scenario: scenarioName,
        traceLength: trace.length,
        replications
      };
    }
    return {
      protocol: "2026-04-20_webgpu-determinism-protocol",
      protocolCommit: config.protocolCommit,
      executionMode: "mock",
      browser,
      host: config.host,
      adapter,
      kernel: kernelMetadata(),
      scenarios,
      collectedAtMs: Date.now()
    };
  }
  async function readAdapterIdentity(adapter, adapterTag) {
    const nav = globalThis.navigator;
    const adapterWithInfo = adapter;
    let info = adapterWithInfo.info ?? {};
    if (Object.keys(info).length === 0 && typeof adapterWithInfo.requestAdapterInfo === "function") {
      try {
        info = await adapterWithInfo.requestAdapterInfo();
      } catch {
        info = {};
      }
    }
    const description = [
      info.vendor,
      info.architecture,
      info.device,
      info.description
    ].filter(Boolean).join(" ");
    return {
      tag: adapterTag,
      vendor: info.vendor ?? "",
      device: info.device ?? description,
      driver: info.driver ?? "",
      userAgent: nav?.userAgent ?? ""
    };
  }
  async function acquireWebGPU(config) {
    const nav = globalThis.navigator;
    if (!nav?.gpu) {
      throw new WebGPUUnavailableError("navigator.gpu is unavailable; run in Chrome/Edge with WebGPU enabled");
    }
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      throw new WebGPUUnavailableError("navigator.gpu.requestAdapter() returned null");
    }
    const device = await adapter.requestDevice();
    const identity = await readAdapterIdentity(adapter, config.adapterTag);
    return {
      device,
      identity,
      browser: nav.userAgent ?? ""
    };
  }
  function makeOutputSeed() {
    return new Uint32Array([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
  }
  async function runScenarioReplication(device, scenarioName, trace, replication, captureFields) {
    const rows = traceRowsForScenario(scenarioName, trace);
    const scenarioSalt = fnv1a32(`scenario:${scenarioName}`);
    const compileStart = performance.now();
    const shaderModule = device.createShaderModule({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}`,
      code: HARNESS_WGSL
    });
    const pipeline = await device.createComputePipelineAsync({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}`,
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "main"
      }
    });
    const wgslCompileMs = performance.now() - compileStart;
    const inputBuffer = device.createBuffer({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:trace`,
      size: rows.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(inputBuffer, 0, rows.buffer, rows.byteOffset, rows.byteLength);
    const outputSeed = makeOutputSeed();
    const outputBuffer = device.createBuffer({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:state`,
      size: outputSeed.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(
      outputBuffer,
      0,
      outputSeed.buffer,
      outputSeed.byteOffset,
      outputSeed.byteLength
    );
    const params = new Uint32Array([trace.length, scenarioSalt, replication, 0]);
    const paramsBuffer = device.createBuffer({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:params`,
      size: params.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(paramsBuffer, 0, params.buffer, params.byteOffset, params.byteLength);
    const readbackBuffer = device.createBuffer({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:readback`,
      size: outputSeed.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    const bindGroup = device.createBindGroup({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:bind-group`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } }
      ]
    });
    const dispatchStart = performance.now();
    const encoder = device.createCommandEncoder({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:encoder`
    });
    const pass = encoder.beginComputePass({
      label: `${HARNESS_KERNEL_NAME}:${scenarioName}:pass`
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(trace.length / HARNESS_WORKGROUP_SIZE));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputSeed.byteLength);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const wallMs = performance.now() - dispatchStart;
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const mapped = readbackBuffer.getMappedRange();
    const canonicalBytes = new Uint8Array(mapped).slice();
    const words = Array.from(new Uint32Array(canonicalBytes.buffer));
    readbackBuffer.unmap();
    inputBuffer.destroy();
    outputBuffer.destroy();
    paramsBuffer.destroy();
    readbackBuffer.destroy();
    return {
      finalStateDigest: await hashBytes(canonicalBytes, "sha256"),
      wallMs,
      wgslCompileMs,
      finalStateFields: captureFields ? { u32_state: words } : void 0
    };
  }
  async function buildWebGPUHarnessArtifact(config) {
    const { device, identity, browser } = await acquireWebGPU(config);
    const scenarios = {};
    try {
      for (const [scenarioName, trace] of Object.entries(config.traces)) {
        const replications = [];
        for (let i = 0; i < config.replications; i++) {
          replications.push(
            await runScenarioReplication(device, scenarioName, trace, i, config.captureFields)
          );
        }
        scenarios[scenarioName] = {
          scenario: scenarioName,
          traceLength: trace.length,
          replications
        };
      }
    } finally {
      device.destroy();
    }
    return {
      protocol: "2026-04-20_webgpu-determinism-protocol",
      protocolCommit: config.protocolCommit,
      executionMode: "webgpu",
      browser,
      host: config.host,
      adapter: identity,
      kernel: kernelMetadata(),
      scenarios,
      collectedAtMs: Date.now()
    };
  }
  async function runDeterminismHarness(config) {
    if (isHarnessMockMode()) {
      if (config.productionEvidence) {
        throw new WebGPUProductionEvidenceMockError(
          "WEBGPU_HARNESS_MOCK cannot be used when productionEvidence=true"
        );
      }
      return buildMockHarnessArtifact(config);
    }
    return buildWebGPUHarnessArtifact(config);
  }
  var WebGPUUnavailableError = class extends Error {
    constructor(message = "WebGPU not available on this adapter / browser") {
      super(message);
      this.name = "WebGPUUnavailableError";
    }
  };
  var WebGPUProductionEvidenceMockError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "WebGPUProductionEvidenceMockError";
    }
  };

  // src/testing/webgpu-determinism.entry.ts
  var ADAPTER_TAGS = /* @__PURE__ */ new Set([
    "intel-uhd",
    "nvidia-rtx3060",
    "apple-m",
    "amd-rdna",
    "qualcomm-adreno",
    "swiftshader"
  ]);
  var smokeTrace = [
    {
      version: "cael.v1",
      runId: "webgpu-determinism-smoke",
      index: 0,
      event: "init",
      timestamp: 0,
      simTime: 0,
      prevHash: "cael.genesis",
      hash: "init-smoke-hash",
      payload: {
        scenario: "crdt-spatial-dispute",
        seed: 1337,
        bodies: 3
      }
    },
    {
      version: "cael.v1",
      runId: "webgpu-determinism-smoke",
      index: 1,
      event: "interaction",
      timestamp: 16,
      simTime: 0.016,
      prevHash: "init-smoke-hash",
      hash: "agent-a-edit-hash",
      payload: {
        agent: "agent-a",
        op: "set-position",
        objectId: "shared-anchor",
        position: [1.25, 0.5, -0.75]
      }
    },
    {
      version: "cael.v1",
      runId: "webgpu-determinism-smoke",
      index: 2,
      event: "interaction",
      timestamp: 17,
      simTime: 0.017,
      prevHash: "agent-a-edit-hash",
      hash: "agent-b-edit-hash",
      payload: {
        agent: "agent-b",
        op: "set-position",
        objectId: "shared-anchor",
        position: [1.25, 0.5, -0.75]
      }
    },
    {
      version: "cael.v1",
      runId: "webgpu-determinism-smoke",
      index: 3,
      event: "solve",
      timestamp: 32,
      simTime: 0.032,
      prevHash: "agent-b-edit-hash",
      hash: "resolve-dispute-hash",
      payload: {
        resolver: "lww-register",
        winner: "agent-b",
        vectorClock: { "agent-a": 1, "agent-b": 2 }
      }
    },
    {
      version: "cael.v1",
      runId: "webgpu-determinism-smoke",
      index: 4,
      event: "final",
      timestamp: 48,
      simTime: 0.048,
      prevHash: "resolve-dispute-hash",
      hash: "final-state-hash",
      payload: {
        sharedAnchor: [1.25, 0.5, -0.75],
        converged: true
      }
    }
  ];
  function boolParam(query, name, defaultValue = false) {
    const raw = query.get(name);
    if (raw == null) return defaultValue;
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
  }
  function intParam(query, name, defaultValue) {
    const raw = query.get(name);
    if (raw == null) return defaultValue;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }
  function adapterTagParam(query) {
    const raw = query.get("adapterTag") ?? "swiftshader";
    return ADAPTER_TAGS.has(raw) ? raw : "swiftshader";
  }
  async function main() {
    const query = new URLSearchParams(window.location.search);
    if (boolParam(query, "mock")) {
      window.__WEBGPU_HARNESS_MOCK__ = true;
    }
    window.__WEBGPU_DETERMINISM_ARTIFACT__ = await runDeterminismHarness({
      traces: {
        "cael-crdt-smoke": smokeTrace
      },
      replications: intParam(query, "replications", 2),
      adapterTag: adapterTagParam(query),
      host: query.get("host") ?? window.location.hostname ?? "browser-file",
      captureFields: boolParam(query, "captureFields", true),
      protocolCommit: query.get("protocolCommit") ?? "local",
      productionEvidence: boolParam(query, "productionEvidence")
    });
  }
  main().catch((error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    window.__WEBGPU_DETERMINISM_ERROR__ = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
    console.error("[webgpu-determinism] failed", err);
  });
})();
