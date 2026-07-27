import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');
const scalarAbiPath = join(packageRoot, 'src', 'abi', 'scalar-v1.hs');
const scalarF32AbiPath = join(packageRoot, 'src', 'abi', 'scalar-f32-v1.hs');
const scalarF64AbiPath = join(packageRoot, 'src', 'abi', 'scalar-f64-v1.hs');
const vectorAbiPath = join(packageRoot, 'src', 'abi', 'vector-v1.hs');
const collectionsList3AbiPath = join(packageRoot, 'src', 'abi', 'collections-list3-v1.hs');
const stdMathPath = join(packageRoot, 'dist', 'math.js');
const stdCollectionsPath = join(packageRoot, 'dist', 'collections.js');
const stdUaalAbiPath = join(packageRoot, 'dist', 'uaal-abi.js');
const wasmRoot = join(repoRoot, 'packages', 'compiler-wasm', 'pkg');
const wasmJsPath = join(wasmRoot, 'holoscript_wasm.js');
const wasmBinaryPath = join(wasmRoot, 'holoscript_wasm_bg.wasm');
const wasmReceiptPath = join(wasmRoot, 'rebuild-receipt.json');
const uaalBundlePath = join(repoRoot, 'packages', 'uaal', 'dist', 'index.js');
const nativeManifestPath = join(repoRoot, 'packages', 'compiler-native', 'Cargo.toml');
const borrowedBufferReadExamplePath = join(
  repoRoot,
  'examples',
  'native',
  'owned-buffer-transfer-exit-five.hs'
);
const expectedDigest = 207;

const selfTest = `
struct StdBorrowPacket { code: i32 }

function std_write_borrowed(packet: &mut StdBorrowPacket): i32 {
  store(packet.code, 9)
  return load(packet.code)
}

function std_read_borrowed(packet: &StdBorrowPacket): i32 {
  return load(packet.code)
}

function std_make_owned_buffer(fill: i32): [i32] {
  let values: [i32] = buffer(3, fill)
  return move(values)
}

function std_relay_owned_buffer(values: [i32]): [i32] {
  return move(values)
}

function std_consume_owned_buffer(values: [i32]): i32 {
  return 5
}

function main(): i32 {
  let owned_values: [i32] = std_make_owned_buffer(5)
  let relayed_values: [i32] = std_relay_owned_buffer(move(owned_values))
  let owned_transfer_result: i32 = std_consume_owned_buffer(move(relayed_values))
  slot borrow_packet: StdBorrowPacket = StdBorrowPacket(5)
  let borrow_write: i32 = std_write_borrowed(&mut borrow_packet)
  let borrow_read: i32 = std_read_borrowed(&borrow_packet)
  let below: i32 = std_math_clamp_i32(0 - 7, 0, 9)
  let inside: i32 = std_math_clamp_i32(4, 0, 9)
  let above: i32 = std_math_clamp_i32(12, 0, 9)
  let negative: i32 = std_math_sign_i32(0 - 8)
  let zero: i32 = std_math_sign_i32(0)
  let positive: i32 = std_math_sign_i32(8)
  let before: i32 = std_math_step_i32(5, 4)
  let edge: i32 = std_math_step_i32(5, 5)
  let scalar_digest: i32 = below + inside * 2 + above * 3 + (negative + 1) * 7 + zero * 11 + positive * 5 + before * 13 + edge * 2
  let dot: i32 = std_math_vec3_dot_i32(1, 2, 3, 4, 5, 6)
  let cross_x: i32 = std_math_vec3_cross_x_i32(1, 2, 3, 4, 5, 6)
  let cross_y: i32 = std_math_vec3_cross_y_i32(1, 2, 3, 4, 5, 6)
  let cross_z: i32 = std_math_vec3_cross_z_i32(1, 2, 3, 4, 5, 6)
  let length_sq: i32 = std_math_vec3_length_sq_i32(1, 2, 3)
  slot bounds_min: StdVec3I32 = std_math_vec3_make_i32(1, 2, 3)
  slot bounds_max: StdVec3I32 = std_math_vec3_make_i32(4, 6, 8)
  slot bounds: StdAabb3I32 = std_math_aabb3_make_i32(move(bounds_min), move(bounds_max))
  let bounds_volume: i32 = std_math_aabb3_volume_value_i32(move(bounds))
  slot collection_original: StdList3I32 = std_collections_list3_make_i32(2, 4, 6)
  let collection_original_sum: i32 = std_collections_list3_sum_i32(move(collection_original))
  slot collection_update_source: StdList3I32 = std_collections_list3_make_i32(2, 4, 6)
  slot collection_updated: StdList3I32 = std_collections_list3_replace_second_i32(move(collection_update_source), 9)
  slot collection_reversed: StdList3I32 = std_collections_list3_reverse_i32(move(collection_updated))
  let collection_weighted: i32 = std_collections_list3_weighted_digest_i32(move(collection_reversed))
  let collection_digest: i32 = collection_original_sum + collection_weighted
  let i32_digest: i32 = scalar_digest + dot + (cross_x + 4) * 2 + (cross_y + 1) * 3 + (cross_z + 5) * 4 + length_sq
  let f64_below: f64 = std_math_clamp_f64(0.0 - 1.5, 0.0, 2.0)
  let f64_inside: f64 = std_math_clamp_f64(1.25, 0.0, 2.0)
  let f64_above: f64 = std_math_clamp_f64(3.0, 0.0, 2.0)
  let f64_lerp: f64 = std_math_lerp_f64(2.0, 10.0, 0.25)
  let f64_inverse: f64 = std_math_inverse_lerp_f64(2.0, 10.0, 4.0)
  let f64_remap: f64 = std_math_remap_f64(0.25, 0.0, 1.0, 10.0, 18.0)
  let f32_below: f32 = std_math_clamp_f32(0.0 - 1.5, 0.0, 2.0)
  let f32_inside: f32 = std_math_clamp_f32(1.00000007, 0.0, 2.0)
  let f32_lerp: f32 = std_math_lerp_f32(16777216.0, 16777218.0, 0.5)
  let f32_inverse: f32 = std_math_inverse_lerp_f32(0.0, 10.0, 1.0)
  let f32_remap: f32 = std_math_remap_f32(0.1, 0.0, 1.0, 10.0, 18.0)
  if (owned_transfer_result == 5 && borrow_write == 9 && borrow_read == 9 && bounds_volume == 60 && collection_digest == 42 && f64_below == 0.0 && f64_inside == 1.25 && f64_above == 2.0 && f64_lerp == 4.0 && f64_inverse == 0.25 && f64_remap == 12.0 && f32_below == 0.0 && f32_inside == 1.0000001192092896 && f32_lerp == 16777216.0 && f32_inverse == 0.10000000149011612 && f32_remap == 10.800000190734863) {
    return i32_digest + 46 + collection_digest
  }
  return 1
}
`;

const nonFiniteFailureProbes = [
  {
    id: 'f64-zero-divisor',
    source: `
function finite_probe(left: f64, right: f64): f64 {
  return left / right
}
function main(): i32 {
  let value: f64 = finite_probe(1.0, 0.0)
  if (value == 0.0) { return 0 }
  return 0
}
`,
  },
  {
    id: 'f64-overflow',
    source: `
function finite_probe(left: f64, right: f64): f64 {
  return left * right
}
function main(): i32 {
  let value: f64 = finite_probe(1.0e308, 1.0e308)
  if (value == 0.0) { return 0 }
  return 0
}
`,
  },
  {
    id: 'f32-zero-divisor',
    source: `
function finite_probe(left: f32, right: f32): f32 {
  return left / right
}
function main(): i32 {
  let value: f32 = finite_probe(1.0, 0.0)
  if (value == 0.0) { return 0 }
  return 0
}
`,
  },
  {
    id: 'f32-overflow',
    source: `
function finite_probe(left: f32, right: f32): f32 {
  return left * right
}
function main(): i32 {
  let value: f32 = finite_probe(3.4e38, 2.0)
  if (value == 0.0) { return 0 }
  return 0
}
`,
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function captureExpectedFailure(id, action, expectedMessage) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`${id} failed with an unexpected diagnostic: ${message}`);
    }
    return { id, rejected: true, diagnostic: message };
  }
  throw new Error(`${id} did not fail closed`);
}

function requireFile(path, purpose) {
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`${purpose} is missing or empty: ${path}`);
  }
}

function cargoCommand() {
  const executableNames =
    process.platform === 'win32' ? ['cargo.exe', 'cargo.cmd', 'cargo.bat'] : ['cargo'];
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((entry) => executableNames.map((name) => resolve(entry, name)));
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const homeFallback = userHome
    ? [
        resolve(
          userHome,
          process.platform === 'win32' ? '.cargo/bin/cargo.exe' : '.cargo/bin/cargo'
        ),
      ]
    : [];
  return (
    [process.env.CARGO, ...fromPath, ...homeFallback]
      .filter(Boolean)
      .find((candidate) => existsSync(candidate)) ?? 'cargo'
  );
}

function browserCandidates() {
  if (process.env.HOLOSCRIPT_ABI_BROWSER) {
    return [process.env.HOLOSCRIPT_ABI_BROWSER];
  }
  if (process.platform === 'win32') {
    return [
      join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(
        process.env['PROGRAMFILES(X86)'] ?? '',
        'Microsoft',
        'Edge',
        'Application',
        'msedge.exe'
      ),
      join(process.env.PROGRAMFILES ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'google-chrome',
      'chromium',
    ];
  }
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
}

function browserCommand() {
  for (const candidate of browserCandidates()) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error(
    'No Chrome/Chromium/Edge executable found. Set HOLOSCRIPT_ABI_BROWSER to run browser-WASM conformance.'
  );
}

function runBrowser(command, url, profilePath) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      command,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox',
        `--user-data-dir=${profilePath}`,
        '--virtual-time-budget=15000',
        '--dump-dom',
        url,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      rejectRun(new Error('browser conformance exceeded 30 seconds'));
    }, 30_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.on('close', (status, signal) => {
      clearTimeout(timeout);
      if (status !== 0) {
        rejectRun(
          new Error(
            `browser conformance failed with status ${String(status)} signal ${String(signal)}: ${stderr.trim()}`
          )
        );
        return;
      }
      resolveRun(stdout);
    });
  });
}

function browserHtml(source, finiteFailureProbes, borrowedBufferReadSource) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <img src="/browser/hold" alt="" hidden>
    <pre id="result">pending</pre>
    <script type="module">
      const source = ${JSON.stringify(source)};
      const finiteFailureProbes = ${JSON.stringify(finiteFailureProbes)};
      const borrowedBufferReadSource = ${JSON.stringify(borrowedBufferReadSource)};
      const output = document.querySelector('#result');

      try {
        const { default: initWasm, compile_to_uaal } = await import('/wasm/holoscript_wasm.js');
        const {
          UAALOpCode,
          UAALVirtualMachine,
          computeUAALBytecodeSha256,
          replayUAALLog,
        } = await import('/uaal/index.js');
        const {
          registerHoloScriptStdUaalExecHandler,
          registerHoloScriptStdUaalAggregateReferenceHandlers,
          registerHoloScriptStdUaalOwnedBufferHandlers,
        } = await import('/std/uaal-abi.js');
        await initWasm('/wasm/holoscript_wasm_bg.wasm');
        const compiled = JSON.parse(compile_to_uaal(source));
        if (compiled.error) throw new Error(compiled.error);
        const flatAggregateInstructionCount = compiled.instructions.filter(
          (instruction) =>
            instruction.opCode === UAALOpCode.EXEC &&
            instruction.operands?.[0] === 'hs.aggregate.value.v1'
        ).length;
        const nestedAggregateInstructionCount = compiled.instructions.filter(
          (instruction) =>
            instruction.opCode === UAALOpCode.EXEC &&
            instruction.operands?.[0] === 'hs.aggregate.value.v2'
        ).length;
        const aggregateInstructionCount =
          flatAggregateInstructionCount + nestedAggregateInstructionCount;
        const ownedBufferInstructionCounts = {
          allocate: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_ALLOC
          ).length,
          move: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_MOVE
          ).length,
          load: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_LOAD
          ).length,
          drop: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_DROP
          ).length,
        };
        const aggregateReferenceInstructionCounts = {
          borrow: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_AGGREGATE_BORROW
          ).length,
          load: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_AGGREGATE_LOAD
          ).length,
          store: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_AGGREGATE_STORE
          ).length,
        };
        const vm = new UAALVirtualMachine({ recordLog: true });
        registerHoloScriptStdUaalExecHandler(vm, UAALOpCode.EXEC);
        registerHoloScriptStdUaalOwnedBufferHandlers(vm, {
          allocate: UAALOpCode.OP_HS_BUFFER_ALLOC,
          move: UAALOpCode.OP_HS_BUFFER_MOVE,
          load: UAALOpCode.OP_HS_BUFFER_LOAD,
          store: UAALOpCode.OP_HS_BUFFER_STORE,
          drop: UAALOpCode.OP_HS_BUFFER_DROP,
          length: UAALOpCode.OP_HS_BUFFER_LENGTH,
        });
        registerHoloScriptStdUaalAggregateReferenceHandlers(vm, {
          borrow: UAALOpCode.OP_HS_AGGREGATE_BORROW,
          load: UAALOpCode.OP_HS_AGGREGATE_LOAD,
          store: UAALOpCode.OP_HS_AGGREGATE_STORE,
        });
        const result = await vm.execute(compiled);
        const log = vm.exportLog();
        const bytecodeSha256 = computeUAALBytecodeSha256(compiled);
        const replay = await replayUAALLog(compiled, log);
        const borrowedBufferCompiled = JSON.parse(compile_to_uaal(borrowedBufferReadSource));
        if (borrowedBufferCompiled.error) throw new Error(borrowedBufferCompiled.error);
        const borrowedBufferInstructionCounts = {
          allocate: borrowedBufferCompiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_ALLOC
          ).length,
          move: borrowedBufferCompiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_MOVE
          ).length,
          load: borrowedBufferCompiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_LOAD
          ).length,
          drop: borrowedBufferCompiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_DROP
          ).length,
        };
        const borrowedBufferVm = new UAALVirtualMachine({ recordLog: true });
        registerHoloScriptStdUaalOwnedBufferHandlers(borrowedBufferVm, {
          allocate: UAALOpCode.OP_HS_BUFFER_ALLOC,
          move: UAALOpCode.OP_HS_BUFFER_MOVE,
          load: UAALOpCode.OP_HS_BUFFER_LOAD,
          store: UAALOpCode.OP_HS_BUFFER_STORE,
          drop: UAALOpCode.OP_HS_BUFFER_DROP,
          length: UAALOpCode.OP_HS_BUFFER_LENGTH,
        });
        const borrowedBufferResult = await borrowedBufferVm.execute(borrowedBufferCompiled);
        const borrowedBufferLog = borrowedBufferVm.exportLog();
        const borrowedBufferBytecodeSha256 = computeUAALBytecodeSha256(borrowedBufferCompiled);
        const borrowedBufferReplay = await replayUAALLog(
          borrowedBufferCompiled,
          borrowedBufferLog
        );
        const borrowedBufferReadProbe = {
          status: borrowedBufferResult.taskStatus,
          value: borrowedBufferResult.stackTop,
          instructionCounts: borrowedBufferInstructionCounts,
          bytecodeSha256: borrowedBufferBytecodeSha256,
          receiptHashMatches:
            borrowedBufferBytecodeSha256 === borrowedBufferLog.bytecodeSha256,
          replayValid: borrowedBufferReplay.valid,
        };
        const nonFiniteFailureProbes = [];
        for (const probe of finiteFailureProbes) {
          const probeCompiled = JSON.parse(compile_to_uaal(probe.source));
          if (probeCompiled.error) throw new Error(probeCompiled.error);
          const probeVm = new UAALVirtualMachine({ recordLog: true });
          registerHoloScriptStdUaalExecHandler(probeVm, UAALOpCode.EXEC);
          const probeResult = await probeVm.execute(probeCompiled);
          const probeLog = probeVm.exportLog();
          const probeReplay = await replayUAALLog(probeCompiled, probeLog);
          nonFiniteFailureProbes.push({
            id: probe.id,
            status: probeResult.taskStatus,
            replayValid: probeReplay.valid,
            instructionCount: probeCompiled.instructions.length,
          });
        }
        output.textContent = JSON.stringify({
          status: result.taskStatus,
          value: result.stackTop,
          instructionCount: compiled.instructions.length,
          aggregateInstructionCount,
          flatAggregateInstructionCount,
          nestedAggregateInstructionCount,
          ownedBufferInstructionCounts,
          aggregateReferenceInstructionCounts,
          bytecodeSha256,
          receiptHashMatches: bytecodeSha256 === log.bytecodeSha256,
          replayValid: replay.valid,
          borrowedBufferReadProbe,
          nonFiniteFailureProbes,
          lastSteps: result.taskStatus === 'ERROR' ? log.steps.slice(-8) : undefined,
          wasm: typeof WebAssembly === 'object',
          userAgent: navigator.userAgent,
        });
      } catch (error) {
        output.textContent = JSON.stringify({
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await fetch('/browser/release', { cache: 'no-store' });
      }
    </script>
  </body>
</html>`;
}

async function executeBrowserWasm(source) {
  const command = browserCommand();
  const profilePath = mkdtempSync(join(tmpdir(), 'holoscript-std-abi-browser-'));
  const html = browserHtml(
    source,
    nonFiniteFailureProbes,
    readFileSync(borrowedBufferReadExamplePath, 'utf8')
  );
  const routeMap = new Map([
    ['/index.html', { body: html, contentType: 'text/html; charset=utf-8' }],
    [
      '/wasm/holoscript_wasm.js',
      { body: readFileSync(wasmJsPath), contentType: 'application/javascript; charset=utf-8' },
    ],
    [
      '/wasm/holoscript_wasm_bg.wasm',
      { body: readFileSync(wasmBinaryPath), contentType: 'application/wasm' },
    ],
    [
      '/uaal/index.js',
      { body: readFileSync(uaalBundlePath), contentType: 'application/javascript; charset=utf-8' },
    ],
    [
      '/std/uaal-abi.js',
      { body: readFileSync(stdUaalAbiPath), contentType: 'application/javascript; charset=utf-8' },
    ],
  ]);
  for (const file of readdirSync(join(packageRoot, 'dist'))) {
    if (!file.endsWith('.js')) continue;
    routeMap.set(`/std/${file}`, {
      body: readFileSync(join(packageRoot, 'dist', file)),
      contentType: 'application/javascript; charset=utf-8',
    });
  }
  let holdResponse;
  let releaseRequested = false;
  const releaseHold = () => {
    if (!holdResponse) {
      releaseRequested = true;
      return;
    }
    holdResponse.writeHead(204, { 'cache-control': 'no-store' });
    holdResponse.end();
    holdResponse = undefined;
  };
  const server = createServer((request, response) => {
    if (request.url === '/browser/hold') {
      holdResponse = response;
      if (releaseRequested) releaseHold();
      return;
    }
    if (request.url === '/browser/release') {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
      releaseHold();
      return;
    }
    const route = routeMap.get(request.url ?? '');
    if (!route) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': route.contentType,
    });
    response.end(route.body);
  });

  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('browser conformance server did not expose a TCP address');
    }
    const dom = await runBrowser(
      command,
      `http://127.0.0.1:${address.port}/index.html`,
      profilePath
    );
    const match = dom.match(/<pre id="result">([^<]+)<\/pre>/);
    if (!match) {
      throw new Error(`browser conformance result marker missing from DOM: ${dom.slice(0, 500)}`);
    }
    const result = JSON.parse(
      match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#39;', "'")
    );
    if (
      result.status !== 'HALTED' ||
      result.value !== expectedDigest ||
      result.wasm !== true ||
      result.receiptHashMatches !== true ||
      result.replayValid !== true ||
      result.aggregateInstructionCount < 1 ||
      result.nestedAggregateInstructionCount < 1 ||
      result.ownedBufferInstructionCounts?.allocate < 1 ||
      result.ownedBufferInstructionCounts?.move < 1 ||
      result.ownedBufferInstructionCounts?.drop < 1 ||
      result.borrowedBufferReadProbe?.status !== 'HALTED' ||
      result.borrowedBufferReadProbe?.value !== 5 ||
      result.borrowedBufferReadProbe?.instructionCounts?.allocate !== 1 ||
      result.borrowedBufferReadProbe?.instructionCounts?.move !== 3 ||
      result.borrowedBufferReadProbe?.instructionCounts?.load !== 1 ||
      result.borrowedBufferReadProbe?.instructionCounts?.drop !== 1 ||
      result.borrowedBufferReadProbe?.receiptHashMatches !== true ||
      result.borrowedBufferReadProbe?.replayValid !== true ||
      !/^[0-9a-f]{64}$/.test(result.borrowedBufferReadProbe?.bytecodeSha256 ?? '') ||
      result.aggregateReferenceInstructionCounts?.borrow < 4 ||
      result.aggregateReferenceInstructionCounts?.load < 2 ||
      result.aggregateReferenceInstructionCounts?.store < 1 ||
      result.nonFiniteFailureProbes?.length !== nonFiniteFailureProbes.length ||
      result.nonFiniteFailureProbes.some(
        (probe) => probe.status !== 'ERROR' || probe.replayValid !== true
      ) ||
      !/^[0-9a-f]{64}$/.test(result.bytecodeSha256)
    ) {
      throw new Error(`browser-WASM result mismatch: ${JSON.stringify(result)}`);
    }
    return {
      browserExecutable: basename(command),
      browserUserAgent: result.userAgent,
      compiler: '@holoscript/wasm web artifact',
      execution: '@holoscript/uaal browser ESM',
      instructionCount: result.instructionCount,
      aggregateInstructionCount: result.aggregateInstructionCount,
      flatAggregateInstructionCount: result.flatAggregateInstructionCount,
      nestedAggregateInstructionCount: result.nestedAggregateInstructionCount,
      ownedBufferInstructionCounts: result.ownedBufferInstructionCounts,
      aggregateReferenceInstructionCounts: result.aggregateReferenceInstructionCounts,
      bytecodeSha256: result.bytecodeSha256,
      receiptHashMatches: result.receiptHashMatches,
      replayValid: result.replayValid,
      borrowedBufferReadProbe: result.borrowedBufferReadProbe,
      nonFiniteFailureProbes: result.nonFiniteFailureProbes,
      result: result.value,
    };
  } finally {
    releaseHold();
    await new Promise((resolveClose) => server.close(resolveClose));
    rmSync(profilePath, { recursive: true, force: true });
  }
}

async function executeNode() {
  const { List } = await import(pathToFileURL(stdCollectionsPath).href);
  const {
    aabbMath,
    clamp,
    clampFiniteF32,
    clampFiniteF64,
    inverseLerpFiniteF32,
    inverseLerpFiniteF64,
    lerpFiniteF32,
    lerpFiniteF64,
    remapFiniteF32,
    remapFiniteF64,
    sign,
    step,
    vec3Math,
  } = await import(pathToFileURL(stdMathPath).href);
  const below = clamp(-7, 0, 9);
  const inside = clamp(4, 0, 9);
  const above = clamp(12, 0, 9);
  const negative = sign(-8);
  const zero = sign(0);
  const positive = sign(8);
  const before = step(5, 4);
  const edge = step(5, 5);
  const scalarDigest =
    below +
    inside * 2 +
    above * 3 +
    (negative + 1) * 7 +
    zero * 11 +
    positive * 5 +
    before * 13 +
    edge * 2;
  const vectorA = { x: 1, y: 2, z: 3 };
  const vectorB = { x: 4, y: 5, z: 6 };
  const dot = vec3Math.dot(vectorA, vectorB);
  const cross = vec3Math.cross(vectorA, vectorB);
  const lengthSq = vec3Math.lengthSq(vectorA);
  const boundsSize = aabbMath.size({
    min: { x: 1, y: 2, z: 3 },
    max: { x: 4, y: 6, z: 8 },
  });
  const boundsVolume = boundsSize.x * boundsSize.y * boundsSize.z;
  const collectionOriginal = List.of(2, 4, 6);
  const collectionOriginalSum = collectionOriginal.sum();
  const collectionUpdated = collectionOriginal.update(1, 9);
  const collectionReversed = collectionUpdated.reverse();
  const collectionWeighted =
    collectionReversed.get(0) +
    collectionReversed.get(1) * 2 +
    collectionReversed.get(2) * 3;
  const collectionDigest = collectionOriginalSum + collectionWeighted;
  const collectionOriginalPreserved =
    collectionOriginal.get(0) === 2 &&
    collectionOriginal.get(1) === 4 &&
    collectionOriginal.get(2) === 6;
  const i32Digest =
    scalarDigest + dot + (cross.x + 4) * 2 + (cross.y + 1) * 3 + (cross.z + 5) * 4 + lengthSq;
  const floatingPointResults = {
    below: clampFiniteF64(-1.5, 0, 2),
    inside: clampFiniteF64(1.25, 0, 2),
    above: clampFiniteF64(3, 0, 2),
    lerp: lerpFiniteF64(2, 10, 0.25),
    inverseLerp: inverseLerpFiniteF64(2, 10, 4),
    remap: remapFiniteF64(0.25, 0, 1, 10, 18),
  };
  const floatingPointMatches =
    floatingPointResults.below === 0 &&
    floatingPointResults.inside === 1.25 &&
    floatingPointResults.above === 2 &&
    floatingPointResults.lerp === 4 &&
    floatingPointResults.inverseLerp === 0.25 &&
    floatingPointResults.remap === 12;
  const binary32Results = {
    below: clampFiniteF32(-1.5, 0, 2),
    inside: clampFiniteF32(1.00000007, 0, 2),
    lerp: lerpFiniteF32(16_777_216, 16_777_218, 0.5),
    inverseLerp: inverseLerpFiniteF32(0, 10, 1),
    remap: remapFiniteF32(0.1, 0, 1, 10, 18),
  };
  const binary32Matches =
    binary32Results.below === 0 &&
    binary32Results.inside === 1.0000001192092896 &&
    binary32Results.lerp === 16_777_216 &&
    binary32Results.inverseLerp === 0.10000000149011612 &&
    binary32Results.remap === 10.800000190734863;
  const nonFiniteFailureProbes = [
    captureExpectedFailure(
      'f64-zero-divisor',
      () => inverseLerpFiniteF64(1, 1, 1),
      'rejects division by zero'
    ),
    captureExpectedFailure(
      'f64-overflow',
      () => lerpFiniteF64(Number.MAX_VALUE, -Number.MAX_VALUE, 2),
      'produced a non-finite f64 result'
    ),
    captureExpectedFailure(
      'f32-zero-divisor',
      () => inverseLerpFiniteF32(1, 1, 1),
      'rejects division by zero'
    ),
    captureExpectedFailure(
      'f32-overflow',
      () => lerpFiniteF32(3.4e38, -3.4e38, 2),
      'produced a non-finite rounded f32 result'
    ),
  ];
  const result =
    boundsVolume === 60 &&
    collectionDigest === 42 &&
    collectionOriginalPreserved &&
    floatingPointMatches &&
    binary32Matches
      ? i32Digest + 46 + collectionDigest
      : 1;
  if (result !== expectedDigest) {
    throw new Error(`Node std result mismatch: expected ${expectedDigest}, received ${result}`);
  }
  return {
    runtime: process.version,
    implementation: ['@holoscript/std/dist/math.js', '@holoscript/std/dist/collections.js'],
    aggregateRepresentation: 'Vec3 object values',
    nestedAggregateRepresentation: 'AABB object containing Vec3 values',
    nestedAggregateVolume: boundsVolume,
    immutableCollectionProjection: {
      layout: 'StdList3I32{first:i32,second:i32,third:i32}',
      original: collectionOriginal.toArray(),
      updated: collectionUpdated.toArray(),
      reversed: collectionReversed.toArray(),
      originalPreserved: collectionOriginalPreserved,
      digest: collectionDigest,
    },
    floatingPointResults,
    binary32Results,
    nonFiniteFailureProbes,
    result,
  };
}

function executeOwnedMetal(source) {
  const scratchPath = mkdtempSync(join(tmpdir(), 'holoscript-std-abi-native-'));
  const sourcePath = join(scratchPath, 'main.hs');
  const executablePath = join(
    scratchPath,
    process.platform === 'win32' ? 'std-abi-v1.exe' : 'std-abi-v1'
  );
  try {
    writeFileSync(sourcePath, source, 'utf8');
    const stdout = execFileSync(
      cargoCommand(),
      [
        'run',
        '--quiet',
        '--manifest-path',
        nativeManifestPath,
        '--bin',
        'holoscriptc',
        '--',
        sourcePath,
        '-o',
        executablePath,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }
    );
    const compileReceipt = JSON.parse(stdout);
    const execution = spawnSync(executablePath, [], {
      cwd: scratchPath,
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    });
    if (execution.error) throw execution.error;
    if (execution.signal || execution.status === null) {
      throw new Error(
        `owned-metal executable did not return an exit status; signal=${String(execution.signal)}`
      );
    }
    if (execution.status !== expectedDigest) {
      throw new Error(
        `owned-metal result mismatch: expected ${expectedDigest}, received ${execution.status}`
      );
    }
    return {
      compiler: 'holoscriptc',
      machineContract: compileReceipt.machine_contract ?? compileReceipt.machineContract,
      objectBytes: compileReceipt.object_bytes,
      objectSha256: compileReceipt.object_sha256,
      result: execution.status,
    };
  } finally {
    rmSync(scratchPath, { recursive: true, force: true });
  }
}

function executeOwnedMetalFailureProbe(probe) {
  const scratchPath = mkdtempSync(join(tmpdir(), `holoscript-std-${probe.id}-`));
  const sourcePath = join(scratchPath, 'main.hs');
  const executablePath = join(
    scratchPath,
    process.platform === 'win32' ? `${probe.id}.exe` : probe.id
  );
  try {
    writeFileSync(sourcePath, probe.source, 'utf8');
    const stdout = execFileSync(
      cargoCommand(),
      [
        'run',
        '--quiet',
        '--manifest-path',
        nativeManifestPath,
        '--bin',
        'holoscriptc',
        '--',
        sourcePath,
        '-o',
        executablePath,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }
    );
    const compileReceipt = JSON.parse(stdout);
    const execution = spawnSync(executablePath, [], {
      cwd: scratchPath,
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    });
    if (execution.error) throw execution.error;
    if (!execution.signal && execution.status === 0) {
      throw new Error(`${probe.id} returned success instead of trapping`);
    }
    return {
      id: probe.id,
      rejected: true,
      exitStatus: execution.status,
      signal: execution.signal,
      machineContract: compileReceipt.machine_contract ?? compileReceipt.machineContract,
      objectSha256: compileReceipt.object_sha256,
    };
  } finally {
    rmSync(scratchPath, { recursive: true, force: true });
  }
}

requireFile(scalarAbiPath, 'scalar ABI source');
requireFile(scalarF32AbiPath, 'scalar f32 ABI source');
requireFile(scalarF64AbiPath, 'scalar f64 ABI source');
requireFile(vectorAbiPath, 'vector ABI source');
requireFile(collectionsList3AbiPath, 'immutable List3 ABI source');
requireFile(stdMathPath, 'built Node std math implementation');
requireFile(stdCollectionsPath, 'built Node std collections implementation');
requireFile(stdUaalAbiPath, 'built std UAAL ABI host adapter');
requireFile(wasmJsPath, 'browser WASM JavaScript bridge');
requireFile(wasmBinaryPath, 'browser WASM compiler');
requireFile(wasmReceiptPath, 'browser WASM rebuild receipt');
requireFile(uaalBundlePath, 'built UAAL browser execution bundle');
requireFile(nativeManifestPath, 'owned-metal compiler manifest');
requireFile(borrowedBufferReadExamplePath, 'owned-buffer borrowed-read example');

const scalarAbiSource = readFileSync(scalarAbiPath, 'utf8');
const scalarF32AbiSource = readFileSync(scalarF32AbiPath, 'utf8');
const scalarF64AbiSource = readFileSync(scalarF64AbiPath, 'utf8');
const vectorAbiSource = readFileSync(vectorAbiPath, 'utf8');
const collectionsList3AbiSource = readFileSync(collectionsList3AbiPath, 'utf8');
const executableSource = `${scalarAbiSource.trim()}\n${scalarF32AbiSource.trim()}\n${scalarF64AbiSource.trim()}\n${vectorAbiSource.trim()}\n${collectionsList3AbiSource.trim()}\n${selfTest.trim()}\n`;
const wasmReceipt = JSON.parse(readFileSync(wasmReceiptPath, 'utf8'));
const node = await executeNode();
const browserWasm = await executeBrowserWasm(executableSource);
const ownedMetal = {
  ...executeOwnedMetal(executableSource),
  nonFiniteFailureProbes: nonFiniteFailureProbes.map(executeOwnedMetalFailureProbe),
};
const results = [node.result, browserWasm.result, ownedMetal.result];
if (!results.every((value) => value === expectedDigest)) {
  throw new Error(`cross-target ABI mismatch: ${JSON.stringify(results)}`);
}

console.log(
  JSON.stringify(
    {
      schema: 'holoscript.std.math-abi-conformance.v11',
      status: 'pass',
      abis: [
        {
          id: 'hs.std.scalar.i32.v1',
          source: 'packages/std/src/abi/scalar-v1.hs',
          sourceSha256: sha256(scalarAbiSource),
        },
        {
          id: 'hs.std.vector.i32.v1',
          source: 'packages/std/src/abi/vector-v1.hs',
          sourceSha256: sha256(vectorAbiSource),
        },
        {
          id: 'hs.std.vector.aggregate.i32.v1',
          source: 'packages/std/src/abi/vector-v1.hs',
          sourceSha256: sha256(vectorAbiSource),
          valueAbi: 'hs.aggregate.value.v1',
          layout: 'StdVec3I32{x:i32,y:i32,z:i32}',
        },
        {
          id: 'hs.std.aabb3.aggregate.i32.v1',
          source: 'packages/std/src/abi/vector-v1.hs',
          sourceSha256: sha256(vectorAbiSource),
          valueAbi: 'hs.aggregate.value.v2',
          layout:
            'StdAabb3I32{min:StdVec3I32{x:i32,y:i32,z:i32},max:StdVec3I32{x:i32,y:i32,z:i32}}',
        },
        {
          id: 'hs.std.collections.list3.i32.v1',
          source: 'packages/std/src/abi/collections-list3-v1.hs',
          sourceSha256: sha256(collectionsList3AbiSource),
          valueAbi: 'hs.aggregate.value.v1',
          layout: 'StdList3I32{first:i32,second:i32,third:i32}',
        },
        {
          id: 'hs.std.scalar.f32.v1',
          source: 'packages/std/src/abi/scalar-f32-v1.hs',
          sourceSha256: sha256(scalarF32AbiSource),
          failureContract: 'finite-input-and-result-or-fail-closed',
        },
        {
          id: 'hs.std.scalar.f64.v1',
          source: 'packages/std/src/abi/scalar-f64-v1.hs',
          sourceSha256: sha256(scalarF64AbiSource),
          failureContract: 'finite-input-and-result-or-fail-closed',
        },
      ],
      expectedDigest,
      targets: {
        node,
        browserWasm: {
          ...browserWasm,
          wasmBytes: statSync(wasmBinaryPath).size,
          wasmSha256: sha256(readFileSync(wasmBinaryPath)),
          rebuildReceiptSchema: wasmReceipt.schema,
        },
        ownedMetal,
      },
      boundaries: {
        provesScalarI32Math: ['clamp', 'sign', 'step'],
        provesVectorI32Math: ['vec3.dot', 'vec3.cross', 'vec3.lengthSquared'],
        provesFiniteScalarF32Math: ['clamp', 'lerp', 'inverseLerp', 'remap'],
        provesOperationByOperationF32Rounding: true,
        provesFiniteScalarF64Math: ['clamp', 'lerp', 'inverseLerp', 'remap'],
        provesBrowserWasmCompilerAndUaalExecution: true,
        provesBrowserNativeReceiptHashing: true,
        provesBrowserReceiptReplay: true,
        provesOwnedMetalNativeExecutable: true,
        provesLocalOwnedBufferAllocationMoveAndDrop: true,
        provesOwnedBufferParameterAndReturnTransfer: true,
        provesImmutableOwnedBufferBorrowedElementRead: {
          target: 'browser-wasm/uaal',
          source: 'examples/native/owned-buffer-transfer-exit-five.hs',
          receipt: browserWasm.borrowedBufferReadProbe,
        },
        provesCallScopedSharedOwnedBufferSliceParameters: true,
        ownedBufferValueAbi: 'hs.buffer.owned.v1',
        borrowedBufferAbi: 'uaal.buffer.borrow.v1',
        provesCallScopedSharedAndMutableAggregateReferences: true,
        aggregateReferenceAbi: 'hs.aggregate.ref.v1',
        provesNonFiniteFloatingPointEdgeSemantics: {
          contract: 'finite-input-and-result-or-fail-closed',
          widths: ['f32', 'f64'],
          rejected: ['non-finite input', 'division by zero', 'overflow result'],
          browserWasmUaalFailureReceipts: browserWasm.nonFiniteFailureProbes,
          ownedMetalFailureReceipts: ownedMetal.nonFiniteFailureProbes,
          signedZeroPreservation: false,
        },
        provesAggregateVectorCallingConvention: true,
        provesAggregateValueAbi: 'hs.aggregate.value.v1',
        provesAggregateLayout: 'StdVec3I32{x:i32,y:i32,z:i32}',
        provesNestedAggregateValueAbi: 'hs.aggregate.value.v2',
        provesNestedAggregateLayout:
          'StdAabb3I32{min:StdVec3I32{x:i32,y:i32,z:i32},max:StdVec3I32{x:i32,y:i32,z:i32}}',
        provesImmutableFixedSizeList3I32: true,
        collectionValueAbi: 'hs.aggregate.value.v1',
        collectionLayout: 'StdList3I32{first:i32,second:i32,third:i32}',
        collectionOperations: ['construct', 'sum', 'persistent replace second', 'reverse', 'digest'],
        collectionLimits: [
          'fixed size of three i32 values',
          'no dynamic indexing',
          'no variable-length allocation',
          'no iteration ABI',
          'no general List, Map, or Set parity',
        ],
        aggregateValueLimits: [
          'recursive immutable POD records',
          'explicit scalar or declared aggregate fields only',
          'affine whole-value moves',
          'owned buffers support allocation, whole-owner moves across parameters and returns, explicit drop, and automatic local or parameter cleanup',
          'immutable local and call-scoped borrowed slices support bounds-checked scalar element reads without owner transfer',
          'no owned-buffer aggregate fields, mutable slices, subranges, borrowed returns, stored or escaping aliases, or buffer element stores',
          'call-scoped shared and mutable aggregate parameters support layout-checked scalar field load/store',
          'no borrowed aggregate returns, stored reference locals, or escaping leases',
        ],
        provesQuaternionMath: false,
        provesCollections: ['immutable fixed-size List3<i32> projection'],
        provesOsAirGap: false,
      },
    },
    null,
    2
  )
);
