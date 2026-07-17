import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  pairReceipts,
  resolveEvidenceOutputPath,
  validateReceiptPair,
} from '../pair-paper6-quaternion-receipts.mjs';

const hash = (character) => character.repeat(64);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidenceRoot = path.join(repoRoot, '.bench-logs-evidence');
const actualRtxReceipt = path.join(
  evidenceRoot,
  'paper-6-q14-cordic-slerp-h3-win-rtx3060-r3.json'
);
const actualS23Receipt = path.join(
  evidenceRoot,
  'paper-6-q14-cordic-slerp-s23-adreno740-r2.json'
);

function buildReceipt({ vendor, architecture, mode = 'webgpu-browser', identitySeed = vendor }) {
  const oracle = hash('a');
  const negative = hash('b');
  const android = mode === 'webgpu-browser-android-cdp';
  const device = android
    ? {
        serial_sha256: sha256(`${identitySeed}-serial`),
        manufacturer: 'samsung',
        model: 'SM-S918U',
        android_release: '16',
        android_sdk: '36',
        abi: 'arm64-v8a',
        board_platform: 'kalama',
        gles_renderer:
          vendor === 'nvidia'
            ? 'NVIDIA, Tegra Orin'
            : vendor === 'qualcomm'
              ? 'Qualcomm, Adreno (TM) 740'
              : `${vendor}, ${architecture}`,
        build_fingerprint_sha256: sha256(`${identitySeed}-build`),
        chrome_package: 'com.android.chrome',
        chrome_version: '150.0.7871.115',
      }
    : {
        platform: 'win32',
        release: '10.0.26200',
        arch: 'x64',
        hostname_sha256: sha256(`${identitySeed}-host`),
        cpu_model: 'Synthetic CPU',
      };
  const machineComponents = android
    ? [
        device.serial_sha256,
        device.manufacturer,
        device.model,
        device.android_release,
        device.abi,
        device.board_platform,
        device.gles_renderer,
        device.build_fingerprint_sha256,
      ]
    : [device.hostname_sha256, device.arch, device.cpu_model];
  const machine = sha256(machineComponents.join('|'));
  return {
    schema: 'holoscript.paper6.quaternion-conformance.v1',
    run_id: `${vendor}-${machine.slice(0, 8)}`,
    status: 'single-adapter-pass',
    contract: {
      version: 'paper6-q14-cordic-slerp-v1',
      algorithm: 'fixed-point approximate shortest-arc SLERP via integer CORDIC',
      quaternion_encoding: 'signed Q14 i32',
      time_encoding: 'unsigned Q15 u32',
      output_encoding: 'four signed Q14 i32 words per case',
      canonical_hash_encoding: 'little-endian signed i32 words',
    },
    source: {
      base_git_commit: '1'.repeat(40),
      paths: ['contract.ts', 'kernel.ts', 'harness.ts', 'playwright.config.ts'],
      all_paths_tracked: true,
      source_paths_clean_at_capture: true,
      source_unchanged_during_run: true,
      source_status_porcelain: '',
      contract_ts_sha256: hash('1'),
      wgsl_wrapper_ts_sha256: hash('2'),
      kernel_wgsl_sha256: 'bdc510c041dfe13a92f86660bab28775775161934eb35aefee9ae6fd1f12c47e',
      harness_ts_sha256: hash('4'),
      playwright_config_ts_sha256: hash('5'),
    },
    fixture: {
      case_count: 1114,
      row_bytes: 48,
      input_sha256: hash('6'),
      oracle_output_sha256: oracle,
      branch_boundary_dot_q15: [32758, 32760, 32762],
      negative_dot_ordinary_cordic_case: 'negative-dot-x90-t16384',
    },
    execution: {
      mode,
      hardware_label: `${vendor}-${identitySeed}`,
      machine_fingerprint_sha256: machine,
      secure_context: true,
      origin: 'http://127.0.0.1:34567',
      browser_user_agent: android
        ? 'Mozilla/5.0 (Linux; Android 16) Chrome/150.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36',
      launch_contract: android
        ? {
            transport: 'adb-cdp',
            chrome_package: 'com.android.chrome',
            cdp_socket: 'localabstract:chrome_devtools_remote',
          }
        : {
            transport: 'playwright-launch',
            executable_path: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
            webgpu_determinism_native: true,
            headless: false,
          },
      adapter: {
        vendor,
        architecture,
        device: '',
        description: '',
        driver: '',
        isFallbackAdapter: false,
      },
      host: { device },
      repeated_dispatch_output_sha256: [oracle, oracle, oracle],
    },
    negative_control: {
      case_id: 'identity-x180-t0',
      mutation: 'tQ15: 16384 -> 0',
      input_sha256: hash('7'),
      oracle_output_sha256: negative,
      gpu_output_sha256: negative,
      oracle_equal: true,
      changed_digest: true,
    },
    verdict: {
      oracle_equal: true,
      same_session_repeated_dispatches_equal: true,
      negative_control_detected: true,
    },
  };
}

const nvidia = () =>
  buildReceipt({ vendor: 'nvidia', architecture: 'ampere', identitySeed: 'rtx3060' });
const qualcomm = () =>
  buildReceipt({
    vendor: 'qualcomm',
    architecture: 'adreno-7xx',
    mode: 'webgpu-browser-android-cdp',
    identitySeed: 's23',
  });

test('accepts matching experiment evidence on distinct machines and vendors', () => {
  assert.deepEqual(validateReceiptPair(nvidia(), qualcomm()), {
    leftVendor: 'nvidia',
    rightVendor: 'qualcomm',
  });
});

test('rejects two receipts from the same normalized vendor', () => {
  const right = buildReceipt({
    vendor: 'NVIDIA Corporation',
    architecture: 'tegra',
    mode: 'webgpu-browser-android-cdp',
    identitySeed: 'jetson',
  });
  assert.throws(() => validateReceiptPair(nvidia(), right), /vendors are not distinct/u);
});

test('rejects two receipts from the same machine fingerprint', () => {
  const left = nvidia();
  const right = buildReceipt({
    vendor: 'qualcomm',
    architecture: 'adreno-7xx',
    identitySeed: 'rtx3060',
  });
  assert.throws(() => validateReceiptPair(left, right), /machine fingerprints are not distinct/u);
});

test('rejects unknown or conflicting vendor identities', () => {
  const unknown = buildReceipt({ vendor: 'vendor-alpha', architecture: 'gpu-a' });
  assert.throws(() => validateReceiptPair(unknown, qualcomm()), /unrecognized GPU vendor/u);

  const conflicting = nvidia();
  conflicting.execution.adapter.description = 'Qualcomm Adreno 740';
  assert.throws(() => validateReceiptPair(conflicting, qualcomm()), /conflicting GPU vendor/u);
});

test('rejects a non-WebGPU execution mode', () => {
  const right = qualcomm();
  right.execution.mode = 'cpu-simulator';
  assert.throws(() => validateReceiptPair(nvidia(), right), /unsupported execution mode/u);
});

test('rejects mismatched experiment source', () => {
  const right = qualcomm();
  right.source.harness_ts_sha256 = hash('c');
  assert.throws(() => validateReceiptPair(nvidia(), right), /source\.harness_ts_sha256/u);
});

test('rejects two receipts that identically relabel the pinned algorithm', () => {
  const left = nvidia();
  const right = qualcomm();
  left.contract.algorithm = 'MinimaxSLERP';
  right.contract.algorithm = 'MinimaxSLERP';
  assert.throws(() => validateReceiptPair(left, right), /contract\.algorithm does not match/u);
});

test('rejects two receipts that identically substitute the pinned kernel digest', () => {
  const left = nvidia();
  const right = qualcomm();
  left.source.kernel_wgsl_sha256 = hash('e');
  right.source.kernel_wgsl_sha256 = hash('e');
  assert.throws(() => validateReceiptPair(left, right), /kernel_wgsl_sha256 does not match/u);
});

test('rejects a GPU dispatch that differs from the oracle', () => {
  const right = qualcomm();
  right.execution.repeated_dispatch_output_sha256[1] = hash('d');
  assert.throws(() => validateReceiptPair(nvidia(), right), /GPU dispatch differs from oracle/u);
});

test('rejects a receipt captured from dirty source', () => {
  const right = qualcomm();
  right.source.source_paths_clean_at_capture = false;
  assert.throws(() => validateReceiptPair(nvidia(), right), /source paths were not clean/u);
});

test('rejects unsafe aggregate output paths before writing', () => {
  const left = path.join(evidenceRoot, 'left.json');
  const right = path.join(evidenceRoot, 'right.json');
  assert.throws(
    () => resolveEvidenceOutputPath(left, left, right),
    /must not collide with an input receipt/u
  );
  assert.throws(
    () => resolveEvidenceOutputPath(path.join(repoRoot, 'outside.json'), left, right),
    /must be a new file directly inside/u
  );
});

test('pairs the committed-source RTX 3060 and S23 receipts through the production gate', () => {
  const output = path.join(evidenceRoot, `paper-6-q14-pair-integration-${process.pid}.json`);
  rmSync(output, { force: true });
  try {
    const aggregate = pairReceipts(actualRtxReceipt, actualS23Receipt, output);
    assert.equal(aggregate.status, 'two-machine-two-vendor-pass');
    assert.deepEqual(aggregate.comparison.normalized_vendors, ['nvidia', 'qualcomm']);
    assert.equal(aggregate.verdict.integer_contract_cross_vendor_byte_agreement, true);
    assert.equal(aggregate.verdict.independent_lab_replication, false);
    assert.equal(
      aggregate.contract.algorithm,
      'fixed-point approximate shortest-arc SLERP via integer CORDIC'
    );
    assert.equal(
      aggregate.source.hashes.kernel_wgsl_sha256,
      'bdc510c041dfe13a92f86660bab28775775161934eb35aefee9ae6fd1f12c47e'
    );
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).schema, aggregate.schema);
  } finally {
    rmSync(output, { force: true });
  }
});

test('never overwrites an existing aggregate path', () => {
  const output = path.join(evidenceRoot, `paper-6-q14-pair-existing-${process.pid}.json`);
  rmSync(output, { force: true });
  writeFileSync(output, 'sentinel', { encoding: 'utf8', flag: 'wx' });
  try {
    assert.throws(
      () => pairReceipts(actualRtxReceipt, actualS23Receipt, output),
      /output already exists/u
    );
    assert.equal(readFileSync(output, 'utf8'), 'sentinel');
  } finally {
    rmSync(output, { force: true });
  }
});

test('rejects matching but fabricated source hashes against the experiment commit', () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'paper6-pair-test-'));
  const leftPath = path.join(temporaryDirectory, 'left.json');
  const rightPath = path.join(temporaryDirectory, 'right.json');
  const output = path.join(evidenceRoot, `paper-6-q14-pair-tampered-${process.pid}.json`);
  const left = JSON.parse(readFileSync(actualRtxReceipt, 'utf8'));
  const right = JSON.parse(readFileSync(actualS23Receipt, 'utf8'));
  left.source.contract_ts_sha256 = hash('f');
  right.source.contract_ts_sha256 = hash('f');
  writeFileSync(leftPath, JSON.stringify(left), 'utf8');
  writeFileSync(rightPath, JSON.stringify(right), 'utf8');
  rmSync(output, { force: true });
  try {
    assert.throws(
      () => pairReceipts(leftPath, rightPath, output),
      /contract_ts_sha256 does not match/u
    );
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(output, { force: true });
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
