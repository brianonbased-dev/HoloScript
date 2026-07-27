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
const stdMathPath = join(packageRoot, 'dist', 'math.js');
const stdUaalAbiPath = join(packageRoot, 'dist', 'uaal-abi.js');
const wasmRoot = join(repoRoot, 'packages', 'compiler-wasm', 'pkg');
const wasmJsPath = join(wasmRoot, 'holoscript_wasm.js');
const wasmBinaryPath = join(wasmRoot, 'holoscript_wasm_bg.wasm');
const wasmReceiptPath = join(wasmRoot, 'rebuild-receipt.json');
const uaalBundlePath = join(repoRoot, 'packages', 'uaal', 'dist', 'index.js');
const nativeManifestPath = join(repoRoot, 'packages', 'compiler-native', 'Cargo.toml');
const expectedDigest = 165;

const selfTest = `
function main(): i32 {
  let owned_values: [i32] = buffer(3, 5)
  let moved_values: [i32] = move(owned_values)
  drop(moved_values)
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
  if (bounds_volume == 60 && f64_below == 0.0 && f64_inside == 1.25 && f64_above == 2.0 && f64_lerp == 4.0 && f64_inverse == 0.25 && f64_remap == 12.0 && f32_below == 0.0 && f32_inside == 1.0000001192092896 && f32_lerp == 16777216.0 && f32_inverse == 0.10000000149011612 && f32_remap == 10.800000190734863) {
    return i32_digest + 46
  }
  return 1
}
`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function browserHtml(source) {
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
          drop: compiled.instructions.filter(
            (instruction) => instruction.opCode === UAALOpCode.OP_HS_BUFFER_DROP
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
        const result = await vm.execute(compiled);
        const log = vm.exportLog();
        const bytecodeSha256 = computeUAALBytecodeSha256(compiled);
        const replay = await replayUAALLog(compiled, log);
        output.textContent = JSON.stringify({
          status: result.taskStatus,
          value: result.stackTop,
          instructionCount: compiled.instructions.length,
          aggregateInstructionCount,
          flatAggregateInstructionCount,
          nestedAggregateInstructionCount,
          ownedBufferInstructionCounts,
          bytecodeSha256,
          receiptHashMatches: bytecodeSha256 === log.bytecodeSha256,
          replayValid: replay.valid,
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
  const html = browserHtml(source);
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
      bytecodeSha256: result.bytecodeSha256,
      receiptHashMatches: result.receiptHashMatches,
      replayValid: result.replayValid,
      result: result.value,
    };
  } finally {
    releaseHold();
    await new Promise((resolveClose) => server.close(resolveClose));
    rmSync(profilePath, { recursive: true, force: true });
  }
}

async function executeNode() {
  const {
    aabbMath,
    clamp,
    clampF32,
    inverseLerp,
    inverseLerpF32,
    lerp,
    lerpF32,
    remap,
    remapF32,
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
  const i32Digest =
    scalarDigest + dot + (cross.x + 4) * 2 + (cross.y + 1) * 3 + (cross.z + 5) * 4 + lengthSq;
  const floatingPointResults = {
    below: clamp(-1.5, 0, 2),
    inside: clamp(1.25, 0, 2),
    above: clamp(3, 0, 2),
    lerp: lerp(2, 10, 0.25),
    inverseLerp: inverseLerp(2, 10, 4),
    remap: remap(0.25, 0, 1, 10, 18),
  };
  const floatingPointMatches =
    floatingPointResults.below === 0 &&
    floatingPointResults.inside === 1.25 &&
    floatingPointResults.above === 2 &&
    floatingPointResults.lerp === 4 &&
    floatingPointResults.inverseLerp === 0.25 &&
    floatingPointResults.remap === 12;
  const binary32Results = {
    below: clampF32(-1.5, 0, 2),
    inside: clampF32(1.00000007, 0, 2),
    lerp: lerpF32(16_777_216, 16_777_218, 0.5),
    inverseLerp: inverseLerpF32(0, 10, 1),
    remap: remapF32(0.1, 0, 1, 10, 18),
  };
  const binary32Matches =
    binary32Results.below === 0 &&
    binary32Results.inside === 1.0000001192092896 &&
    binary32Results.lerp === 16_777_216 &&
    binary32Results.inverseLerp === 0.10000000149011612 &&
    binary32Results.remap === 10.800000190734863;
  const result =
    boundsVolume === 60 && floatingPointMatches && binary32Matches ? i32Digest + 46 : 1;
  if (result !== expectedDigest) {
    throw new Error(`Node std result mismatch: expected ${expectedDigest}, received ${result}`);
  }
  return {
    runtime: process.version,
    implementation: '@holoscript/std/dist/math.js',
    aggregateRepresentation: 'Vec3 object values',
    nestedAggregateRepresentation: 'AABB object containing Vec3 values',
    nestedAggregateVolume: boundsVolume,
    floatingPointResults,
    binary32Results,
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

requireFile(scalarAbiPath, 'scalar ABI source');
requireFile(scalarF32AbiPath, 'scalar f32 ABI source');
requireFile(scalarF64AbiPath, 'scalar f64 ABI source');
requireFile(vectorAbiPath, 'vector ABI source');
requireFile(stdMathPath, 'built Node std math implementation');
requireFile(stdUaalAbiPath, 'built std UAAL ABI host adapter');
requireFile(wasmJsPath, 'browser WASM JavaScript bridge');
requireFile(wasmBinaryPath, 'browser WASM compiler');
requireFile(wasmReceiptPath, 'browser WASM rebuild receipt');
requireFile(uaalBundlePath, 'built UAAL browser execution bundle');
requireFile(nativeManifestPath, 'owned-metal compiler manifest');

const scalarAbiSource = readFileSync(scalarAbiPath, 'utf8');
const scalarF32AbiSource = readFileSync(scalarF32AbiPath, 'utf8');
const scalarF64AbiSource = readFileSync(scalarF64AbiPath, 'utf8');
const vectorAbiSource = readFileSync(vectorAbiPath, 'utf8');
const executableSource = `${scalarAbiSource.trim()}\n${scalarF32AbiSource.trim()}\n${scalarF64AbiSource.trim()}\n${vectorAbiSource.trim()}\n${selfTest.trim()}\n`;
const wasmReceipt = JSON.parse(readFileSync(wasmReceiptPath, 'utf8'));
const node = await executeNode();
const browserWasm = await executeBrowserWasm(executableSource);
const ownedMetal = executeOwnedMetal(executableSource);
const results = [node.result, browserWasm.result, ownedMetal.result];
if (!results.every((value) => value === expectedDigest)) {
  throw new Error(`cross-target ABI mismatch: ${JSON.stringify(results)}`);
}

console.log(
  JSON.stringify(
    {
      schema: 'holoscript.std.math-abi-conformance.v7',
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
          id: 'hs.std.scalar.f32.v1',
          source: 'packages/std/src/abi/scalar-f32-v1.hs',
          sourceSha256: sha256(scalarF32AbiSource),
        },
        {
          id: 'hs.std.scalar.f64.v1',
          source: 'packages/std/src/abi/scalar-f64-v1.hs',
          sourceSha256: sha256(scalarF64AbiSource),
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
        ownedBufferValueAbi: 'hs.buffer.owned.v1',
        provesNonFiniteFloatingPointEdgeSemantics: false,
        provesAggregateVectorCallingConvention: true,
        provesAggregateValueAbi: 'hs.aggregate.value.v1',
        provesAggregateLayout: 'StdVec3I32{x:i32,y:i32,z:i32}',
        provesNestedAggregateValueAbi: 'hs.aggregate.value.v2',
        provesNestedAggregateLayout:
          'StdAabb3I32{min:StdVec3I32{x:i32,y:i32,z:i32},max:StdVec3I32{x:i32,y:i32,z:i32}}',
        aggregateValueLimits: [
          'recursive immutable POD records',
          'explicit scalar or declared aggregate fields only',
          'affine whole-value moves',
          'local owned buffers support allocation, whole-owner move, explicit drop, and automatic return cleanup',
          'no owned-buffer parameters, returns, aggregate fields, or borrowed element access',
          'no mutable or borrowed aggregate transfer',
        ],
        provesQuaternionMath: false,
        provesCollections: false,
        provesOsAirGap: false,
      },
    },
    null,
    2
  )
);
