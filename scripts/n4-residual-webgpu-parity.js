"use strict";
(() => {
  // <define:__N4_FEATURES__>
  var define_N4_FEATURES_default = [1, 0.005225926637649536, 0.0034576591569930315, 0, 0, 0.1133863553404808, -0.04676457494497299, 0.582502007484436, 0.3854040801525116, 0, 0];

  // <define:__N4_MANIFEST__>
  var define_N4_MANIFEST_default = { sourceDigest: "sha256:c8288f5fa70ec024afbe6362f0518a837880d753fb2bfc92a7f8b0dd20b6f9c3", irDigest: "sha256:ac880d88cb7d5c2d5cce6da44070f3c6ddb9a6747c956f58c585845979ddd77f", graphDigest: "sha256:2ad3ada13db0c4204a5038fe2e457942b76062722c1607298f86a453556aedcb", modelDigest: "sha256:5271e071aabcbe65e1ef0ffd04f6bc075add4b5f35eb0f01e168e2a6ec84f11f", featureSchemaDigest: "sha256:5c49345896c20396d16498fe98435b9c0ceed6bd1cfcba3483a6c0ef12b48903", featureNames: ["bias", "drag-vx-orb", "drag-vy-orb", "drag-vx-crate", "drag-vy-crate", "gust-x-per-mass", "gust-y-per-mass", "contact-vx-orb", "contact-vy-orb", "contact-vx-crate", "contact-vy-crate"], outputNames: ["residual-vx", "residual-vy"], weightTensor: [8262209303211421e-20, -0.8391917943954468, -0.20582643151283264, -1.2799557447433472, -0.006731370929628611, 0.33981814980506897, 6659167120233178e-19, -0.3210013210773468, 0.0022216930519789457, 0, 0, -37961124326102436e-20, -0.06084280461072922, -0.913568377494812, -0.0049233753234148026, -1.2568258047103882, 0.001030904590152204, 0.34002485871315, 7875708397477865e-19, -0.32125845551490784, 0, 0], weightShape: [2, 11], typeTensor: [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], typeShape: [22, 3], tensorChecksum: "fnv1a64:15ca17f418a7f79d", deterministicDigest: "sha256:b351593e48fa675aac922893d71d7e0cb7007d6cf74cb59cad4768e83747e418" };

  // ../core/src/world-model/N4ResidualRuntimeParity.ts
  var N4_RUNTIME_PARITY_TOLERANCE = 1e-5;
  function fnv1a64(value) {
    let hash = 0xcbf29ce484222325n;
    const bytes = new TextEncoder().encode(value);
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
  }
  function tensorChecksum(manifest) {
    return fnv1a64(JSON.stringify({
      sourceDigest: manifest.sourceDigest,
      irDigest: manifest.irDigest,
      graphDigest: manifest.graphDigest,
      modelDigest: manifest.modelDigest,
      featureSchemaDigest: manifest.featureSchemaDigest,
      featureNames: manifest.featureNames,
      outputNames: manifest.outputNames,
      weightTensor: manifest.weightTensor,
      weightShape: manifest.weightShape,
      typeTensor: manifest.typeTensor,
      typeShape: manifest.typeShape
    }));
  }
  function validateManifest(manifest) {
    const [outputs, features] = manifest.weightShape;
    if (outputs <= 0 || features <= 0 || manifest.weightTensor.length !== outputs * features || manifest.featureNames.length !== features || manifest.outputNames.length !== outputs) throw new Error("invalid N4 weight tensor shape");
    if (manifest.typeShape[0] <= 0 || manifest.typeShape[1] !== 3 || manifest.typeTensor.length !== manifest.typeShape[0] * manifest.typeShape[1]) throw new Error("invalid N4 type tensor shape");
    if ([...manifest.weightTensor, ...manifest.typeTensor].some((value) => !Number.isFinite(value))) throw new Error("N4 manifest contains non-finite tensor value");
    if (tensorChecksum(manifest) !== manifest.tensorChecksum) {
      throw new Error("N4 weights manifest tensor checksum mismatch");
    }
  }
  function validateFeatures(manifest, features) {
    validateManifest(manifest);
    if (features.length !== manifest.weightShape[1]) {
      throw new Error(
        `N4 feature tensor shape mismatch: expected ${manifest.weightShape[1]}, got ${features.length}`
      );
    }
    if (features.some((value) => !Number.isFinite(value))) {
      throw new Error("N4 features contain non-finite tensor value");
    }
  }
  function receipt(runtime, manifest, output) {
    const withoutDigest = {
      runtime,
      output: output.map(Math.fround),
      sourceDigest: manifest.sourceDigest,
      graphDigest: manifest.graphDigest,
      modelDigest: manifest.modelDigest,
      weightsManifestDigest: manifest.deterministicDigest
    };
    return { ...withoutDigest, deterministicDigest: fnv1a64(JSON.stringify(withoutDigest)) };
  }
  function f32Dot(weights, offset, features) {
    let sum = Math.fround(0);
    for (let index = 0; index < features.length; index += 1) {
      sum = Math.fround(
        sum + Math.fround(Math.fround(weights[offset + index]) * Math.fround(features[index]))
      );
    }
    return sum;
  }
  function inferN4Cpu(manifest, features) {
    validateFeatures(manifest, features);
    const output = Array.from(
      { length: manifest.weightShape[0] },
      (_, row) => f32Dot(manifest.weightTensor, row * manifest.weightShape[1], features)
    );
    return receipt("cpu", manifest, output);
  }
  async function inferN4WebGPU(device, manifest, features) {
    validateFeatures(manifest, features);
    const featureCount = manifest.weightShape[1];
    const outputCount = manifest.weightShape[0];
    const featureBytes = new Float32Array(features.map(Math.fround));
    const weightBytes = new Float32Array(manifest.weightTensor.map(Math.fround));
    const outputByteLength = outputCount * Float32Array.BYTES_PER_ELEMENT;
    const usage = globalThis.GPUBufferUsage;
    const mapMode = globalThis.GPUMapMode;
    if (!usage || !mapMode) throw new Error("WebGPU buffer constants unavailable");
    const featureBuffer = device.createBuffer({
      size: featureBytes.byteLength,
      usage: usage.STORAGE | usage.COPY_DST
    });
    const weightBuffer = device.createBuffer({
      size: weightBytes.byteLength,
      usage: usage.STORAGE | usage.COPY_DST
    });
    const outputBuffer = device.createBuffer({
      size: outputByteLength,
      usage: usage.STORAGE | usage.COPY_SRC
    });
    const readback = device.createBuffer({
      size: outputByteLength,
      usage: usage.COPY_DST | usage.MAP_READ
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
    `
    });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shader, entryPoint: "main" }
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: featureBuffer } },
        { binding: 1, resource: { buffer: weightBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } }
      ]
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
    return receipt("webgpu", manifest, output);
  }
  function verifyN4RuntimeParity(reference, candidate) {
    if (reference.sourceDigest !== candidate.sourceDigest || reference.graphDigest !== candidate.graphDigest || reference.modelDigest !== candidate.modelDigest || reference.weightsManifestDigest !== candidate.weightsManifestDigest) {
      return {
        valid: false,
        maxAbsoluteError: Number.POSITIVE_INFINITY,
        tolerance: N4_RUNTIME_PARITY_TOLERANCE,
        reason: "tensor custody digest mismatch"
      };
    }
    if (reference.output.length !== candidate.output.length) {
      return {
        valid: false,
        maxAbsoluteError: Number.POSITIVE_INFINITY,
        tolerance: N4_RUNTIME_PARITY_TOLERANCE,
        reason: "output shape mismatch"
      };
    }
    const maxAbsoluteError = Math.max(
      0,
      ...reference.output.map((value, index) => Math.abs(value - candidate.output[index]))
    );
    return {
      valid: maxAbsoluteError <= N4_RUNTIME_PARITY_TOLERANCE,
      maxAbsoluteError,
      tolerance: N4_RUNTIME_PARITY_TOLERANCE,
      reason: maxAbsoluteError <= N4_RUNTIME_PARITY_TOLERANCE ? "runtime outputs match" : "runtime output drift exceeds tolerance"
    };
  }

  // src/vm-bridge/n4-webgpu-parity.entry.ts
  async function adapterInfo(adapter) {
    const withLegacy = adapter;
    let info = adapter.info ?? {};
    if (Object.keys(info).length === 0 && withLegacy.requestAdapterInfo) {
      info = await withLegacy.requestAdapterInfo();
    }
    return Object.fromEntries(
      Object.entries(info).filter(([, value]) => value !== void 0).map(([key, value]) => [key, String(value)])
    );
  }
  async function runN4BrowserWebGPUParity() {
    if (!navigator.gpu) throw new Error("navigator.gpu is unavailable");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("navigator.gpu.requestAdapter() returned null");
    const device = await adapter.requestDevice();
    if (!device) throw new Error("GPUAdapter.requestDevice() returned no device");
    const cpu = inferN4Cpu(define_N4_MANIFEST_default, define_N4_FEATURES_default);
    const webgpu = await inferN4WebGPU(device, define_N4_MANIFEST_default, define_N4_FEATURES_default);
    const parity = verifyN4RuntimeParity(cpu, webgpu);
    if (!parity.valid) throw new Error(`WebGPU parity failed: ${parity.reason}`);
    await device.queue.onSubmittedWorkDone();
    return {
      protocol: "holoscript.n4-runtime-parity.v0.1.0",
      executionMode: "webgpu",
      navigatorGpu: true,
      adapterAcquired: true,
      deviceAcquired: true,
      dispatchCompleted: true,
      readbackCompleted: true,
      adapter: await adapterInfo(adapter),
      userAgent: navigator.userAgent,
      cpu,
      webgpu,
      parity,
      tensorChecksum: define_N4_MANIFEST_default.tensorChecksum
    };
  }
  void runN4BrowserWebGPUParity().then((artifact) => {
    window.__N4_WEBGPU_PARITY_ARTIFACT__ = artifact;
  }).catch((error) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    window.__N4_WEBGPU_PARITY_ERROR__ = {
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack
    };
  });
})();
