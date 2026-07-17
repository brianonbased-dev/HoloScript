/**
 * Publication-evidence driver for the Paper 6 integer quaternion contract.
 *
 * This is a real WebGPU test. It fails on missing/fallback adapters, compares three
 * same-session GPU dispatches byte-for-byte with the independent BigInt oracle, and
 * requires an observed GPU negative control to change the digest. A second-machine/vendor
 * receipt is intentionally outside this local test's claim scope.
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  PAPER6_Q14_SLERP_CASES,
  QUATERNION_Q14_ONE,
  QUATERNION_INTERPOLATION_CONTRACT_VERSION,
  encodeQuaternionInterpolationCases,
  encodeQuaternionInterpolationOracleResults,
  type QuaternionInterpolationCase,
} from '../src/animation/paper/QuaternionInterpolationContract';
import {
  QUATERNION_INTERPOLATION_CONTRACT_VERSION as WGSL_CONTRACT_VERSION,
  QUATERNION_INTERPOLATION_KERNEL_NAME,
  QUATERNION_INTERPOLATION_WGSL,
  QUATERNION_INTERPOLATION_WORKGROUP_SIZE,
} from '../src/animation/paper/QuaternionInterpolationWGSL';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const nodeRequire = createRequire(import.meta.url);
const contractPath = path.join(
  packageRoot,
  'src/animation/paper/QuaternionInterpolationContract.ts'
);
const wgslPath = path.join(packageRoot, 'src/animation/paper/QuaternionInterpolationWGSL.ts');
const harnessPath = fileURLToPath(import.meta.url);
const sourcePaths = [
  'packages/engine/src/animation/paper/QuaternionInterpolationContract.ts',
  'packages/engine/src/animation/paper/QuaternionInterpolationWGSL.ts',
  'packages/engine/tests/quaternion-interpolation-webgpu.spec.ts',
] as const;

interface SourceSnapshot {
  readonly head: string;
  readonly status: string;
  readonly trackedPaths: readonly string[];
  readonly contractSource: string;
  readonly wgslSource: string;
  readonly harnessSource: string;
}

async function captureSourceSnapshot(): Promise<SourceSnapshot> {
  const [contractSource, wgslSource, harnessSource] = await Promise.all([
    fs.readFile(contractPath, 'utf8'),
    fs.readFile(wgslPath, 'utf8'),
    fs.readFile(harnessPath, 'utf8'),
  ]);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const status = execFileSync('git', ['status', '--porcelain=v1', '--', ...sourcePaths], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const trackedPaths = execFileSync('git', ['ls-files', '--', ...sourcePaths], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .sort();
  return { head, status, trackedPaths, contractSource, wgslSource, harnessSource };
}

function integerSqrtNumber(value: number): number {
  if (value < 0 || !Number.isSafeInteger(value)) {
    throw new RangeError('integerSqrtNumber requires a non-negative safe integer');
  }
  if (value < 2) return value;
  let estimate = value;
  let next = Math.floor((estimate + 1) / 2);
  while (next < estimate) {
    estimate = next;
    next = Math.floor((estimate + Math.floor(value / estimate)) / 2);
  }
  return estimate;
}

function buildCordicScheduleSweep(): QuaternionInterpolationCase[] {
  const times = [0, 1, 4096, 8192, 16_384, 24_576, 32_767, 32_768] as const;
  const cases: QuaternionInterpolationCase[] = [];
  for (let dotQ14 = 0; dotQ14 <= QUATERNION_Q14_ONE; dotQ14 += 128) {
    const sineQ14 = integerSqrtNumber(QUATERNION_Q14_ONE * QUATERNION_Q14_ONE - dotQ14 * dotQ14);
    for (const tQ15 of times) {
      cases.push({
        id: `cordic-sweep-dot${dotQ14}-t${tQ15}`,
        from: [0, 0, 0, QUATERNION_Q14_ONE],
        to: [sineQ14, 0, 0, dotQ14],
        tQ15,
      });
    }
  }
  return cases;
}

function buildBranchBoundaryCases(): QuaternionInterpolationCase[] {
  const times = [1, 16_384, 32_767] as const;
  const cases: QuaternionInterpolationCase[] = [];
  for (const scalarQ14 of [16_379, 16_380, 16_381] as const) {
    const sineQ14 = integerSqrtNumber(
      QUATERNION_Q14_ONE * QUATERNION_Q14_ONE - scalarQ14 * scalarQ14
    );
    for (const tQ15 of times) {
      cases.push({
        id: `branch-boundary-w${scalarQ14}-t${tQ15}`,
        from: [0, 0, 0, QUATERNION_Q14_ONE],
        to: [sineQ14, 0, 0, scalarQ14],
        tQ15,
      });
    }
  }
  return cases;
}

const NEGATIVE_DOT_ORDINARY_CORDIC_CASE: QuaternionInterpolationCase = {
  id: 'negative-dot-x90-t16384',
  from: [0, 0, 0, QUATERNION_Q14_ONE],
  to: [-11_585, 0, 0, -11_585],
  tQ15: 16_384,
};

const GPU_CASES: readonly QuaternionInterpolationCase[] = [
  ...PAPER6_Q14_SLERP_CASES,
  ...buildCordicScheduleSweep(),
  ...buildBranchBoundaryCases(),
  NEGATIVE_DOT_ORDINARY_CORDIC_CASE,
];

function canonicalI32LittleEndianBytes(words: ArrayLike<number>): Buffer {
  const bytes = Buffer.alloc(words.length * 4);
  for (let index = 0; index < words.length; index += 1) {
    bytes.writeInt32LE(words[index], index * 4);
  }
  return bytes;
}

function sha256I32LittleEndian(words: ArrayLike<number>): string {
  return createHash('sha256').update(canonicalI32LittleEndianBytes(words)).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createHarnessServer(): http.Server {
  return http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>Paper 6 Q14 WebGPU</title>');
  });
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to bind Paper 6 harness server'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

interface GpuRunResult {
  readonly adapter: {
    readonly vendor: string;
    readonly architecture: string;
    readonly device: string;
    readonly description: string;
    readonly driver: string;
    readonly isFallbackAdapter: boolean;
  };
  readonly browserLittleEndian: boolean;
  readonly userAgent: string;
  readonly compileMs: number;
  readonly compilationMessages: readonly string[];
  readonly repeatedDispatches: ReadonlyArray<{
    readonly output: readonly number[];
    readonly dispatchMs: number;
  }>;
  readonly negativeControl: {
    readonly output: readonly number[];
    readonly dispatchMs: number;
  };
}

async function runGpuContract(
  page: Page,
  canonicalInput: Int32Array,
  negativeInput: Int32Array,
  caseCount: number,
  powerPreference: 'low-power' | 'high-performance'
): Promise<GpuRunResult> {
  return page.evaluate(
    async ({
      canonicalWords,
      negativeWords,
      count,
      kernel,
      entryPoint,
      workgroupSize,
      requestedPowerPreference,
    }) => {
      if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
      const browserLittleEndian = new Uint8Array(new Int32Array([0x01020304]).buffer)[0] === 0x04;
      if (!browserLittleEndian) {
        throw new Error('the current GPU upload path requires a little-endian browser host');
      }
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: requestedPowerPreference,
      });
      if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');

      const adapterWithInfo = adapter as GPUAdapter & {
        info?: Partial<GPUAdapterInfo> & { driver?: string; isFallbackAdapter?: boolean };
        requestAdapterInfo?: () => Promise<
          Partial<GPUAdapterInfo> & { driver?: string; isFallbackAdapter?: boolean }
        >;
      };
      let info = adapterWithInfo.info ?? {};
      if (Object.keys(info).length === 0 && adapterWithInfo.requestAdapterInfo) {
        info = await adapterWithInfo.requestAdapterInfo();
      }
      if (info.isFallbackAdapter !== false) {
        throw new Error(
          `GPUAdapterInfo.isFallbackAdapter must be present and false; received ${String(
            info.isFallbackAdapter
          )}`
        );
      }
      const identity = {
        vendor: info.vendor ?? '',
        architecture: info.architecture ?? '',
        device: info.device ?? '',
        description: info.description ?? '',
        driver: info.driver ?? '',
        isFallbackAdapter: info.isFallbackAdapter,
      };

      const device = await adapter.requestDevice();
      device.pushErrorScope('validation');
      const compileStart = performance.now();
      const shader = device.createShaderModule({ label: entryPoint, code: kernel });
      const compilationInfo = await shader.getCompilationInfo();
      const compilationMessages = compilationInfo.messages.map(
        (message) => `${message.type}:${message.lineNum}:${message.linePos}:${message.message}`
      );
      const compilationErrors = compilationInfo.messages.filter(
        (message) => message.type === 'error'
      );
      if (compilationErrors.length > 0) throw new Error(compilationMessages.join('\n'));

      const pipeline = await device.createComputePipelineAsync({
        label: entryPoint,
        layout: 'auto',
        compute: { module: shader, entryPoint },
      });
      const compileMs = performance.now() - compileStart;
      const validationError = await device.popErrorScope();
      if (validationError) throw validationError;

      const input = new Int32Array(canonicalWords);
      const negative = new Int32Array(negativeWords);
      const outputSeed = new Int32Array(count * 4).fill(0x5a5a5a5a);
      const inputBuffer = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const outputBuffer = device.createBuffer({
        size: outputSeed.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      const readback = device.createBuffer({
        size: outputSeed.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } },
        ],
      });

      async function dispatch(
        words: Int32Array
      ): Promise<{ output: number[]; dispatchMs: number }> {
        device.queue.writeBuffer(inputBuffer, 0, words);
        device.queue.writeBuffer(outputBuffer, 0, outputSeed);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(count / workgroupSize));
        pass.end();
        encoder.copyBufferToBuffer(outputBuffer, 0, readback, 0, outputSeed.byteLength);
        const started = performance.now();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        const dispatchMs = performance.now() - started;
        await readback.mapAsync(GPUMapMode.READ);
        const copy = new Int32Array(readback.getMappedRange().slice(0));
        readback.unmap();
        return { output: Array.from(copy), dispatchMs };
      }

      try {
        const repeatedDispatches = [];
        for (let index = 0; index < 3; index += 1) {
          repeatedDispatches.push(await dispatch(input));
        }
        const negativeControl = await dispatch(negative);
        return {
          adapter: identity,
          browserLittleEndian,
          userAgent: navigator.userAgent,
          compileMs,
          compilationMessages,
          repeatedDispatches,
          negativeControl,
        };
      } finally {
        inputBuffer.destroy();
        outputBuffer.destroy();
        readback.destroy();
        device.destroy();
      }
    },
    {
      canonicalWords: Array.from(canonicalInput),
      negativeWords: Array.from(negativeInput),
      count: caseCount,
      kernel: QUATERNION_INTERPOLATION_WGSL,
      entryPoint: QUATERNION_INTERPOLATION_KERNEL_NAME,
      workgroupSize: QUATERNION_INTERPOLATION_WORKGROUP_SIZE,
      requestedPowerPreference: powerPreference,
    }
  );
}

test.describe('Paper 6 Q14 integer CORDIC quaternion conformance', () => {
  test('matches the independent oracle on real WebGPU and emits a fail-closed receipt', async ({
    page,
    browser,
  }, testInfo) => {
    const receiptPath = process.env.PAPER6_Q14_RECEIPT_PATH
      ? path.resolve(process.env.PAPER6_Q14_RECEIPT_PATH)
      : path.join(repoRoot, '.bench-logs', 'paper6-q14-cordic-slerp-local.json');
    await fs.rm(receiptPath, { force: true });
    const runId = randomUUID();
    test.setTimeout(120_000);

    const sourceBefore = await captureSourceSnapshot();
    const allSourcePathsTracked = sourcePaths.every((sourcePath) =>
      sourceBefore.trackedPaths.includes(sourcePath)
    );
    const publicationSourceEligible = sourceBefore.status.length === 0 && allSourcePathsTracked;
    const allowDirtyDiagnostic = process.env.PAPER6_ALLOW_DIRTY_SOURCE_DIAGNOSTIC === '1';
    if (!publicationSourceEligible && !allowDirtyDiagnostic) {
      throw new Error(
        'receipt source paths must be tracked and clean; set ' +
          'PAPER6_ALLOW_DIRTY_SOURCE_DIAGNOSTIC=1 only for a non-publication local diagnostic'
      );
    }
    const receiptStatus = publicationSourceEligible
      ? 'single-adapter-pass'
      : 'local-diagnostic-uncommitted-source';

    expect(WGSL_CONTRACT_VERSION).toBe(QUATERNION_INTERPOLATION_CONTRACT_VERSION);

    const negativeCases: QuaternionInterpolationCase[] = GPU_CASES.map((testCase) => ({
      ...testCase,
    }));
    const controlIndex = negativeCases.findIndex(
      (testCase) => testCase.id === 'identity-x180-t16384'
    );
    expect(controlIndex).toBeGreaterThanOrEqual(0);
    negativeCases[controlIndex] = { ...negativeCases[controlIndex], tQ15: 0 };

    const canonicalInput = encodeQuaternionInterpolationCases(GPU_CASES);
    const canonicalOracle = encodeQuaternionInterpolationOracleResults(GPU_CASES);
    const negativeInput = encodeQuaternionInterpolationCases(negativeCases);
    const negativeOracle = encodeQuaternionInterpolationOracleResults(negativeCases);
    const requestedPowerPreference: 'low-power' | 'high-performance' =
      process.env.PAPER6_WEBGPU_POWER_PREFERENCE === 'low-power' ? 'low-power' : 'high-performance';
    const nodeLittleEndian = new Uint8Array(new Int32Array([0x01020304]).buffer)[0] === 0x04;
    expect(nodeLittleEndian, 'the current GPU upload path requires a little-endian Node host').toBe(
      true
    );
    const boundaryDotsQ15 = [...new Set(buildBranchBoundaryCases().map((item) => item.to[3] * 2))];
    expect(boundaryDotsQ15).toEqual([32_758, 32_760, 32_762]);
    expect(GPU_CASES.some((item) => item.id === NEGATIVE_DOT_ORDINARY_CORDIC_CASE.id)).toBe(true);

    const server = createHarnessServer();
    const port = await listen(server);
    let gpu: GpuRunResult;
    try {
      await page.goto(`http://127.0.0.1:${port}/paper6-q14-cordic-slerp`);
      gpu = await runGpuContract(
        page,
        canonicalInput,
        negativeInput,
        GPU_CASES.length,
        requestedPowerPreference
      );
    } finally {
      await close(server);
    }

    const adapterText = [
      gpu.adapter.vendor,
      gpu.adapter.architecture,
      gpu.adapter.device,
      gpu.adapter.description,
      gpu.adapter.driver,
    ]
      .join(' ')
      .trim();
    expect(adapterText.length, 'adapter identity must not be empty').toBeGreaterThan(0);
    expect(gpu.adapter.isFallbackAdapter).toBe(false);
    expect(gpu.browserLittleEndian).toBe(true);
    expect(adapterText).not.toMatch(/swiftshader|llvmpipe|software raster|microsoft basic/i);
    const expectedVendor = process.env.PAPER6_EXPECTED_GPU_VENDOR;
    if (expectedVendor) expect(adapterText.toLowerCase()).toContain(expectedVendor.toLowerCase());

    const expectedWords = Array.from(canonicalOracle);
    for (const dispatch of gpu.repeatedDispatches) expect(dispatch.output).toEqual(expectedWords);
    expect(gpu.negativeControl.output).toEqual(Array.from(negativeOracle));

    const outputHash = sha256I32LittleEndian(canonicalOracle);
    const repeatedDispatchHashes = gpu.repeatedDispatches.map((dispatch) =>
      sha256I32LittleEndian(dispatch.output)
    );
    const negativeOracleHash = sha256I32LittleEndian(negativeOracle);
    const negativeGpuHash = sha256I32LittleEndian(gpu.negativeControl.output);
    const negativeControlDetected = negativeGpuHash !== outputHash;
    expect(new Set(repeatedDispatchHashes)).toEqual(new Set([outputHash]));
    expect(negativeGpuHash).toBe(negativeOracleHash);
    expect(negativeControlDetected).toBe(true);

    const sourceAfter = await captureSourceSnapshot();
    expect(sourceAfter, 'source, HEAD, and cleanliness must not change during capture').toEqual(
      sourceBefore
    );
    const packageManagerUserAgent = process.env.npm_config_user_agent ?? '';
    const pnpmVersion = /(?:^|\s)pnpm\/([^\s]+)/.exec(packageManagerUserAgent)?.[1] ?? 'unknown';
    const gitVersion = execFileSync('git', ['--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    const playwrightPackagePath = nodeRequire.resolve('@playwright/test/package.json');
    const playwrightPackage = JSON.parse(await fs.readFile(playwrightPackagePath, 'utf8')) as {
      version?: string;
    };
    const playwrightVersion = playwrightPackage.version ?? 'unknown';
    const playwrightProject = testInfo.project.name;
    const browserVersion = browser.version();
    if (publicationSourceEligible) {
      expect(pnpmVersion).not.toBe('unknown');
      expect(playwrightVersion).not.toBe('unknown');
      expect(playwrightProject.trim().length).toBeGreaterThan(0);
      expect(browserVersion.trim().length).toBeGreaterThan(0);
    }
    const machineFingerprint = sha256Text(
      `${os.hostname()}|${os.arch()}|${os.cpus()[0]?.model ?? 'unknown'}`
    );

    const receipt = {
      schema: 'holoscript.paper6.quaternion-conformance.v1',
      run_id: runId,
      captured_at: new Date().toISOString(),
      status: receiptStatus,
      contract: {
        version: QUATERNION_INTERPOLATION_CONTRACT_VERSION,
        algorithm: 'fixed-point approximate shortest-arc SLERP via integer CORDIC',
        quaternion_encoding: 'signed Q14 i32',
        time_encoding: 'unsigned Q15 u32',
        output_encoding: 'four signed Q14 i32 words per case',
        canonical_hash_encoding: 'little-endian signed i32 words',
      },
      claim_scope:
        'Exact WGSL/TypeScript-oracle byte agreement and three same-session dispatches on the named adapter.',
      nonclaims: [
        'Not the shipped AnimationClip nlerp policy.',
        'Not MinimaxSLERP and not a minimax transcendental library.',
        'Not a cross-machine or cross-vendor result.',
        'Not a universal claim about ordinary WGSL f32 arithmetic.',
      ],
      code_as_experimental_variable: {
        oracle: 'independently scheduled TypeScript BigInt',
        gpu: 'separately authored WGSL i32/u32',
        compiler_backend: 'browser WebGPU',
        hardware_vendor: gpu.adapter.vendor,
      },
      source: {
        base_git_commit: sourceBefore.head,
        paths: sourcePaths,
        all_paths_tracked: allSourcePathsTracked,
        source_paths_clean_at_capture: sourceBefore.status.length === 0,
        source_unchanged_during_run: true,
        source_status_porcelain: sourceBefore.status,
        contract_ts_sha256: sha256Text(sourceBefore.contractSource),
        wgsl_wrapper_ts_sha256: sha256Text(sourceBefore.wgslSource),
        kernel_wgsl_sha256: sha256Text(QUATERNION_INTERPOLATION_WGSL),
        harness_ts_sha256: sha256Text(sourceBefore.harnessSource),
      },
      fixture: {
        case_count: GPU_CASES.length,
        construction:
          '72 named adversarial cases, a 129-dot by 8-time integer sweep, nine near-branch cases, and one negative-dot ordinary-CORDIC case',
        row_bytes: 48,
        input_sha256: sha256I32LittleEndian(canonicalInput),
        oracle_output_sha256: outputHash,
        branch_boundary_dot_q15: boundaryDotsQ15,
        negative_dot_ordinary_cordic_case: NEGATIVE_DOT_ORDINARY_CORDIC_CASE.id,
      },
      execution: {
        mode: 'webgpu-browser',
        requested_power_preference: requestedPowerPreference,
        hardware_label: process.env.PAPER6_HARDWARE_LABEL ?? 'unlabeled-local',
        machine_fingerprint_sha256: machineFingerprint,
        browser_user_agent: gpu.userAgent,
        adapter: gpu.adapter,
        toolchain: {
          node: process.version,
          pnpm: pnpmVersion,
          git: gitVersion,
          package_manager_user_agent: packageManagerUserAgent,
          playwright: playwrightVersion,
          playwright_project: playwrightProject,
          browser_version: browserVersion,
        },
        host: {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          node_little_endian: nodeLittleEndian,
          browser_little_endian: gpu.browserLittleEndian,
        },
        compile_ms: gpu.compileMs,
        compilation_messages: gpu.compilationMessages,
        repeated_dispatch_ms: gpu.repeatedDispatches.map((dispatch) => dispatch.dispatchMs),
        repeated_dispatch_output_sha256: repeatedDispatchHashes,
      },
      negative_control: {
        case_id: negativeCases[controlIndex].id,
        mutation: 'tQ15: 16384 -> 0',
        input_sha256: sha256I32LittleEndian(negativeInput),
        oracle_output_sha256: negativeOracleHash,
        gpu_output_sha256: negativeGpuHash,
        oracle_equal: negativeGpuHash === negativeOracleHash,
        changed_digest: negativeControlDetected,
        dispatch_ms: gpu.negativeControl.dispatchMs,
      },
      verdict: {
        oracle_equal: true,
        same_session_repeated_dispatches_equal: new Set(repeatedDispatchHashes).size === 1,
        negative_control_detected: negativeControlDetected,
        cross_vendor: 'inconclusive-missing-independent-second-machine-vendor',
      },
    };

    const temporaryReceiptPath = `${receiptPath}.${runId}.tmp`;
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(temporaryReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryReceiptPath, receiptPath);
    console.log(`[paper6-q14] receipt -> ${receiptPath}`);
  });
});
