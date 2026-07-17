#!/usr/bin/env node

/**
 * Fail-closed aggregate gate for two Paper 6 integer-quaternion WebGPU receipts.
 *
 * Individual receipts deliberately make no cross-vendor claim. This gate promotes a
 * pair only when experiment source/config, fixtures, oracle outputs, and negative
 * controls agree while machine fingerprints and normalized hardware vendors differ.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const EVIDENCE_ROOT = path.resolve(REPO_ROOT, '.bench-logs-evidence');
const SCRIPT_RELATIVE_PATH = 'packages/engine/scripts/pair-paper6-quaternion-receipts.mjs';

const RECEIPT_SCHEMA = 'holoscript.paper6.quaternion-conformance.v1';
const PAIR_SCHEMA = 'holoscript.paper6.quaternion-cross-vendor-pair.v1';
const REQUIRED_SOURCE_HASHES = [
  'contract_ts_sha256',
  'wgsl_wrapper_ts_sha256',
  'kernel_wgsl_sha256',
  'harness_ts_sha256',
  'playwright_config_ts_sha256',
];
const REQUIRED_FIXTURE_FIELDS = [
  'case_count',
  'row_bytes',
  'input_sha256',
  'oracle_output_sha256',
  'negative_dot_ordinary_cordic_case',
];

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readReceipt(filePath) {
  const absolutePath = path.resolve(filePath);
  assert(existsSync(absolutePath), `receipt does not exist: ${absolutePath}`);
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`receipt is not valid JSON: ${absolutePath}: ${error.message}`);
  }
  return { absolutePath, sha256: sha256File(absolutePath), receipt };
}

function normalizedVendor(receipt, label = 'receipt') {
  const text = [
    receipt?.execution?.adapter?.vendor,
    receipt?.execution?.adapter?.architecture,
    receipt?.execution?.adapter?.device,
    receipt?.execution?.adapter?.description,
    receipt?.execution?.host?.device?.gles_renderer,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const matches = [
    ['nvidia', /nvidia|geforce|tegra|0x10de/u],
    ['qualcomm', /qualcomm|adreno|0x5143/u],
    ['intel', /intel|iris|\barc\b|\buhd\b|0x8086/u],
    ['amd', /\bamd\b|radeon|advanced micro devices|0x1002/u],
    ['apple', /\bapple\b|apple gpu|0x106b/u],
  ].filter(([, pattern]) => pattern.test(text));
  assert(matches.length > 0, `${label}: unrecognized GPU vendor identity`);
  assert(
    matches.length === 1,
    `${label}: conflicting GPU vendor identities: ${matches.map(([vendor]) => vendor).join(', ')}`
  );
  return matches[0][0];
}

function recomputeMachineFingerprint(label, receipt) {
  const mode = receipt.execution.mode;
  const device = receipt.execution.host?.device ?? {};
  let components;
  if (mode === 'webgpu-browser-android-cdp') {
    for (const field of [
      'serial_sha256',
      'manufacturer',
      'model',
      'android_release',
      'abi',
      'board_platform',
      'gles_renderer',
      'build_fingerprint_sha256',
    ]) {
      assert(String(device[field] ?? '').trim().length > 0, `${label}: Android device.${field} missing`);
    }
    assert(/^[0-9a-f]{64}$/u.test(device.serial_sha256), `${label}: invalid hashed Android serial`);
    assert(
      /^[0-9a-f]{64}$/u.test(device.build_fingerprint_sha256),
      `${label}: invalid hashed Android build fingerprint`
    );
    components = [
      device.serial_sha256,
      device.manufacturer,
      device.model,
      device.android_release,
      device.abi,
      device.board_platform,
      device.gles_renderer,
      device.build_fingerprint_sha256,
    ];
  } else {
    for (const field of ['platform', 'release', 'arch', 'hostname_sha256', 'cpu_model']) {
      assert(String(device[field] ?? '').trim().length > 0, `${label}: local device.${field} missing`);
    }
    assert(/^[0-9a-f]{64}$/u.test(device.hostname_sha256), `${label}: invalid hashed hostname`);
    components = [device.hostname_sha256, device.arch, device.cpu_model];
  }
  const recomputed = sha256Bytes(components.join('|'));
  assert(
    recomputed === receipt.execution.machine_fingerprint_sha256,
    `${label}: machine fingerprint does not match recorded device fields`
  );
  return recomputed;
}

function validateSingle(label, receipt) {
  assert(receipt?.schema === RECEIPT_SCHEMA, `${label}: schema must be ${RECEIPT_SCHEMA}`);
  assert(receipt?.status === 'single-adapter-pass', `${label}: status must be single-adapter-pass`);
  assert(
    receipt?.contract?.version === 'paper6-q14-cordic-slerp-v1',
    `${label}: unexpected contract version`
  );
  assert(receipt?.source?.all_paths_tracked === true, `${label}: source paths must all be tracked`);
  assert(
    receipt?.source?.source_paths_clean_at_capture === true,
    `${label}: source paths were not clean at capture`
  );
  assert(
    receipt?.source?.source_unchanged_during_run === true,
    `${label}: source changed during capture`
  );
  assert(receipt?.source?.source_status_porcelain === '', `${label}: source status is not empty`);
  assert(
    /^[0-9a-f]{40}$/u.test(receipt?.source?.base_git_commit ?? ''),
    `${label}: base source commit is missing or malformed`
  );
  for (const field of REQUIRED_SOURCE_HASHES) {
    assert(/^[0-9a-f]{64}$/u.test(receipt?.source?.[field] ?? ''), `${label}: invalid ${field}`);
  }

  const adapter = receipt?.execution?.adapter ?? {};
  const adapterText = Object.values(adapter).join(' ');
  assert(adapter.isFallbackAdapter === false, `${label}: adapter must explicitly be nonfallback`);
  assert(
    !/swiftshader|llvmpipe|software raster|microsoft basic/u.test(adapterText.toLowerCase()),
    `${label}: software adapter detected`
  );
  const vendor = normalizedVendor(receipt, label);
  assert(
    /^[0-9a-f]{64}$/u.test(receipt?.execution?.machine_fingerprint_sha256 ?? ''),
    `${label}: machine fingerprint is missing or malformed`
  );
  assert(receipt?.execution?.secure_context === true, `${label}: browser context was not secure`);
  assert(
    /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(receipt?.execution?.origin ?? ''),
    `${label}: origin is not a localhost evidence origin`
  );
  assert(
    typeof receipt?.execution?.hardware_label === 'string' &&
      receipt.execution.hardware_label.trim().length > 0,
    `${label}: hardware label is missing`
  );
  assert(
    typeof receipt?.execution?.browser_user_agent === 'string' &&
      /Chrome\/\d+/u.test(receipt.execution.browser_user_agent),
    `${label}: Chromium browser identity is missing`
  );
  const mode = receipt?.execution?.mode;
  const launch = receipt?.execution?.launch_contract ?? {};
  assert(
    mode === 'webgpu-browser' || mode === 'webgpu-browser-android-cdp',
    `${label}: unsupported execution mode ${String(mode)}`
  );
  if (mode === 'webgpu-browser-android-cdp') {
    assert(launch.transport === 'adb-cdp', `${label}: Android mode requires adb-cdp transport`);
    assert(
      receipt.execution.browser_user_agent.includes('Android'),
      `${label}: Android mode requires an Android user agent`
    );
    assert(
      receipt.execution.host?.device?.chrome_package === launch.chrome_package &&
        /^com\.[a-z0-9_.]+$/u.test(launch.chrome_package ?? ''),
      `${label}: Android Chrome package identity is inconsistent`
    );
    assert(
      receipt.execution.host?.device?.chrome_version &&
        receipt.execution.host.device.chrome_version !== 'unknown',
      `${label}: Android Chrome version is missing`
    );
    assert(
      normalizedVendor(
        {
          execution: {
            adapter: { vendor: receipt.execution.host.device.gles_renderer },
            host: { device: {} },
          },
        },
        `${label} GLES renderer`
      ) === vendor,
      `${label}: WebGPU adapter and GLES renderer vendors conflict`
    );
  } else {
    assert(launch.transport === 'playwright-launch', `${label}: browser mode requires Playwright transport`);
    assert(
      launch.webgpu_determinism_native === true,
      `${label}: browser mode must use the native WebGPU launch policy`
    );
    assert(
      typeof launch.executable_path === 'string' &&
        launch.executable_path.trim().length > 0 &&
        launch.executable_path !== 'playwright-config-default',
      `${label}: native browser executable is not pinned`
    );
  }
  recomputeMachineFingerprint(label, receipt);

  const oracleHash = receipt?.fixture?.oracle_output_sha256;
  const dispatchHashes = receipt?.execution?.repeated_dispatch_output_sha256;
  for (const [field, value] of [
    ['fixture.input_sha256', receipt?.fixture?.input_sha256],
    ['fixture.oracle_output_sha256', oracleHash],
    ['negative_control.input_sha256', receipt?.negative_control?.input_sha256],
    ['negative_control.oracle_output_sha256', receipt?.negative_control?.oracle_output_sha256],
    ['negative_control.gpu_output_sha256', receipt?.negative_control?.gpu_output_sha256],
  ]) {
    assert(/^[0-9a-f]{64}$/u.test(value ?? ''), `${label}: invalid ${field}`);
  }
  assert(Array.isArray(dispatchHashes) && dispatchHashes.length === 3, `${label}: need 3 dispatches`);
  assert(
    dispatchHashes.every((hash) => /^[0-9a-f]{64}$/u.test(hash)),
    `${label}: malformed GPU dispatch hash`
  );
  assert(dispatchHashes.every((hash) => hash === oracleHash), `${label}: GPU dispatch differs from oracle`);
  assert(receipt?.verdict?.oracle_equal === true, `${label}: oracle verdict is false`);
  assert(
    receipt?.verdict?.same_session_repeated_dispatches_equal === true,
    `${label}: repeated-dispatch verdict is false`
  );
  assert(
    receipt?.verdict?.negative_control_detected === true,
    `${label}: negative control was not detected`
  );
  assert(
    receipt?.negative_control?.oracle_equal === true &&
      receipt?.negative_control?.gpu_output_sha256 === receipt?.negative_control?.oracle_output_sha256,
    `${label}: negative-control GPU output differs from its oracle`
  );
  assert(receipt?.negative_control?.changed_digest === true, `${label}: negative digest did not change`);
  assert(
    receipt?.negative_control?.oracle_output_sha256 !== oracleHash,
    `${label}: negative-control digest equals the canonical digest`
  );
}

function assertEqualField(left, right, pathLabel, getter) {
  const leftValue = getter(left);
  const rightValue = getter(right);
  assert(
    JSON.stringify(leftValue) === JSON.stringify(rightValue),
    `receipt pair differs at ${pathLabel}`
  );
}

function repoRelativeOrAbsolute(filePath) {
  const relative = path.relative(REPO_ROOT, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll('\\', '/');
}

export function resolveEvidenceOutputPath(outputPath, leftPath, rightPath) {
  const absoluteOutput = path.resolve(outputPath);
  const left = path.resolve(leftPath);
  const right = path.resolve(rightPath);
  assert(
    path.dirname(absoluteOutput).toLowerCase() === EVIDENCE_ROOT.toLowerCase(),
    `output must be a new file directly inside ${EVIDENCE_ROOT}`
  );
  const comparableOutput = absoluteOutput.toLowerCase();
  assert(
    comparableOutput !== left.toLowerCase() && comparableOutput !== right.toLowerCase(),
    'output path must not collide with an input receipt'
  );
  assert(!existsSync(absoluteOutput), `output already exists: ${absoluteOutput}`);
  return absoluteOutput;
}

function verifyExperimentBlobsAtCommit(receipt) {
  const fieldByPath = new Map([
    [
      'packages/engine/src/animation/paper/QuaternionInterpolationContract.ts',
      'contract_ts_sha256',
    ],
    [
      'packages/engine/src/animation/paper/QuaternionInterpolationWGSL.ts',
      'wgsl_wrapper_ts_sha256',
    ],
    ['packages/engine/tests/quaternion-interpolation-webgpu.spec.ts', 'harness_ts_sha256'],
    ['packages/engine/playwright.config.ts', 'playwright_config_ts_sha256'],
  ]);
  const commit = receipt.source.base_git_commit;
  for (const [sourcePath, hashField] of fieldByPath) {
    assert(receipt.source.paths.includes(sourcePath), `source.paths omits ${sourcePath}`);
    let blob;
    try {
      blob = execFileSync('git', ['show', `${commit}:${sourcePath}`], {
        cwd: REPO_ROOT,
        encoding: null,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(`cannot read ${sourcePath} at experiment commit ${commit}: ${error.message}`);
    }
    assert(
      sha256Bytes(blob) === receipt.source[hashField],
      `${hashField} does not match ${sourcePath} at ${commit}`
    );
  }
}

export function validateReceiptPair(left, right) {
  validateSingle('left', left);
  validateSingle('right', right);

  assertEqualField(left, right, 'contract', (receipt) => receipt.contract);
  assertEqualField(left, right, 'source.paths', (receipt) => receipt.source.paths);
  assertEqualField(left, right, 'source.base_git_commit', (receipt) => receipt.source.base_git_commit);
  for (const field of REQUIRED_SOURCE_HASHES) {
    assertEqualField(left, right, `source.${field}`, (receipt) => receipt.source[field]);
  }
  for (const field of REQUIRED_FIXTURE_FIELDS) {
    assertEqualField(left, right, `fixture.${field}`, (receipt) => receipt.fixture[field]);
  }
  assertEqualField(left, right, 'fixture.branch_boundary_dot_q15', (receipt) =>
    receipt.fixture.branch_boundary_dot_q15
  );
  assertEqualField(left, right, 'negative_control.case_id', (receipt) =>
    receipt.negative_control.case_id
  );
  assertEqualField(left, right, 'negative_control.mutation', (receipt) =>
    receipt.negative_control.mutation
  );
  assertEqualField(left, right, 'negative_control.input_sha256', (receipt) =>
    receipt.negative_control.input_sha256
  );
  assertEqualField(left, right, 'negative_control.oracle_output_sha256', (receipt) =>
    receipt.negative_control.oracle_output_sha256
  );

  const leftVendor = normalizedVendor(left, 'left');
  const rightVendor = normalizedVendor(right, 'right');
  assert(leftVendor !== rightVendor, `vendors are not distinct: ${leftVendor}`);
  assert(
    left.execution.machine_fingerprint_sha256 !== right.execution.machine_fingerprint_sha256,
    'machine fingerprints are not distinct'
  );
  assert(
    left.execution.hardware_label.trim().toLowerCase() !==
      right.execution.hardware_label.trim().toLowerCase(),
    'hardware labels are not distinct'
  );
  assert(
    typeof left.run_id === 'string' &&
      typeof right.run_id === 'string' &&
      left.run_id.length > 0 &&
      right.run_id.length > 0 &&
      left.run_id !== right.run_id,
    'receipt run IDs must be present and distinct'
  );
  return { leftVendor, rightVendor };
}

export function pairReceipts(leftPath, rightPath, outputPath) {
  assert(leftPath && rightPath && outputPath, 'left receipt, right receipt, and output path are required');
  const absoluteOutput = resolveEvidenceOutputPath(outputPath, leftPath, rightPath);

  const leftRecord = readReceipt(leftPath);
  const rightRecord = readReceipt(rightPath);
  const left = leftRecord.receipt;
  const right = rightRecord.receipt;
  const { leftVendor, rightVendor } = validateReceiptPair(left, right);
  verifyExperimentBlobsAtCommit(left);

  const validatorCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  const validatorStatus = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--', SCRIPT_RELATIVE_PATH],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();
  const validatorTracked = execFileSync('git', ['ls-files', '--', SCRIPT_RELATIVE_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert(validatorTracked === SCRIPT_RELATIVE_PATH, 'pair validator must be tracked');
  assert(validatorStatus === '', 'pair validator must be clean before aggregate capture');

  const aggregate = {
    schema: PAIR_SCHEMA,
    captured_at: new Date().toISOString(),
    status: 'two-machine-two-vendor-pass',
    claim_scope:
      'Exact integer WGSL/BigInt-oracle byte agreement on two named machines and two GPU vendors under one controller.',
    nonclaims: [
      'Not the shipped AnimationClip nlerp policy.',
      'Not MinimaxSLERP and not a minimax transcendental library.',
      'Not a universal claim about ordinary WGSL f32 arithmetic.',
      'Not an independent-laboratory replication; both devices were driven by one controller.',
      'Not an interpolation accuracy or performance result.',
    ],
    contract: left.contract,
    source: {
      experiment_base_git_commit: left.source.base_git_commit,
      paths: left.source.paths,
      hashes: Object.fromEntries(
        REQUIRED_SOURCE_HASHES.map((field) => [field, left.source[field]])
      ),
      validator_git_commit: validatorCommit,
      validator_path: SCRIPT_RELATIVE_PATH,
      validator_sha256: sha256File(SCRIPT_PATH),
    },
    fixture: {
      case_count: left.fixture.case_count,
      row_bytes: left.fixture.row_bytes,
      input_sha256: left.fixture.input_sha256,
      oracle_output_sha256: left.fixture.oracle_output_sha256,
      negative_control_input_sha256: left.negative_control.input_sha256,
      negative_control_oracle_output_sha256: left.negative_control.oracle_output_sha256,
    },
    receipts: [
      { label: 'left', vendor: leftVendor, record: leftRecord, receipt: left },
      { label: 'right', vendor: rightVendor, record: rightRecord, receipt: right },
    ].map(({ label, vendor, record, receipt }) => ({
      label,
      path: repoRelativeOrAbsolute(record.absolutePath),
      sha256: record.sha256,
      run_id: receipt.run_id,
      captured_at: receipt.captured_at,
      normalized_vendor: vendor,
      machine_fingerprint_sha256: receipt.execution.machine_fingerprint_sha256,
      mode: receipt.execution.mode,
      hardware_label: receipt.execution.hardware_label,
      adapter: receipt.execution.adapter,
      browser_user_agent: receipt.execution.browser_user_agent,
      host_device: receipt.execution.host.device,
      repeated_dispatch_output_sha256: receipt.execution.repeated_dispatch_output_sha256,
      negative_control_gpu_output_sha256: receipt.negative_control.gpu_output_sha256,
    })),
    comparison: {
      source_and_config_identity_equal: true,
      fixture_identity_equal: true,
      oracle_output_equal: true,
      repeated_gpu_outputs_equal_to_oracle: true,
      negative_control_outputs_equal_to_oracle: true,
      machine_fingerprints_distinct: true,
      normalized_vendors_distinct: true,
      normalized_vendors: [leftVendor, rightVendor],
    },
    verdict: {
      two_machine_receipts_distinct: true,
      two_gpu_vendors_distinct: true,
      integer_contract_cross_vendor_byte_agreement: true,
      independent_lab_replication: false,
    },
  };

  mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  const temporaryPath = `${absoluteOutput}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(aggregate, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    // Exclusive publication: hard-link creation fails if another process won the output name.
    linkSync(temporaryPath, absoluteOutput);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return aggregate;
}

function parseArgs(argv) {
  const positional = [];
  let output;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      output = argv[index + 1];
      index += 1;
    } else {
      positional.push(argv[index]);
    }
  }
  return { left: positional[0], right: positional[1], output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.left || !args.right || !args.output) {
    console.error(
      'Usage: node packages/engine/scripts/pair-paper6-quaternion-receipts.mjs <left.json> <right.json> --out <pair.json>'
    );
    process.exit(2);
  }
  try {
    const aggregate = pairReceipts(args.left, args.right, args.output);
    console.log(
      `[paper6-q14-pair] ${aggregate.status} -> ${path.resolve(args.output)} ` +
        `(${aggregate.comparison.normalized_vendors.join(' + ')})`
    );
  } catch (error) {
    console.error(`[paper6-q14-pair] ${error.message}`);
    process.exit(1);
  }
}
