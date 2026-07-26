import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');
const abiPath = join(packageRoot, 'src', 'abi', 'scalar-v1.hs');
const stdMathPath = join(packageRoot, 'dist', 'math.js');
const wasmRoot = join(repoRoot, 'packages', 'compiler-wasm', 'pkg');
const wasmJsPath = join(wasmRoot, 'holoscript_wasm.js');
const wasmBinaryPath = join(wasmRoot, 'holoscript_wasm_bg.wasm');
const wasmReceiptPath = join(wasmRoot, 'rebuild-receipt.json');
const uaalBundlePath = join(repoRoot, 'packages', 'uaal', 'dist', 'index.js');
const nativeManifestPath = join(repoRoot, 'packages', 'compiler-native', 'Cargo.toml');
const expectedDigest = 42;

const selfTest = `
function main(): i32 {
  let below: i32 = std_math_clamp_i32(0 - 7, 0, 9)
  let inside: i32 = std_math_clamp_i32(4, 0, 9)
  let above: i32 = std_math_clamp_i32(12, 0, 9)
  let negative: i32 = std_math_sign_i32(0 - 8)
  let zero: i32 = std_math_sign_i32(0)
  let positive: i32 = std_math_sign_i32(8)
  let before: i32 = std_math_step_i32(5, 4)
  let edge: i32 = std_math_step_i32(5, 5)
  return below + inside * 2 + above * 3 + (negative + 1) * 7 + zero * 11 + positive * 5 + before * 13 + edge * 2
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
    <script type="importmap">
      {"imports":{"crypto":"/browser/node-crypto.js","node:crypto":"/browser/node-crypto.js"}}
    </script>
  </head>
  <body>
    <img src="/browser/hold" alt="" hidden>
    <pre id="result">pending</pre>
    <script type="module">
      const source = ${JSON.stringify(source)};
      const output = document.querySelector('#result');

      function registerHsI32BinaryHandler(vm, execOpcode) {
        vm.registerHandler(execOpcode, (proxy, operands) => {
          const [abi, operator] = operands;
          if (abi !== 'hs.i32.binary.v1' || typeof operator !== 'string') {
            throw new Error('unsupported HoloScript EXEC ABI: ' + String(abi));
          }
          const right = proxy.pop();
          const left = proxy.pop();
          if (typeof left !== 'number' || typeof right !== 'number') {
            throw new Error('hs.i32.binary.v1 requires numeric operands');
          }
          switch (operator) {
            case '+': proxy.push((left + right) | 0); break;
            case '-': proxy.push((left - right) | 0); break;
            case '*': proxy.push(Math.imul(left, right)); break;
            case '==': proxy.push(left === right); break;
            case '!=': proxy.push(left !== right); break;
            case '<': proxy.push(left < right); break;
            case '<=': proxy.push(left <= right); break;
            case '>': proxy.push(left > right); break;
            case '>=': proxy.push(left >= right); break;
            default: throw new Error('unsupported hs.i32.binary.v1 operator: ' + operator);
          }
        });
      }

      try {
        const { default: initWasm, compile_to_uaal } = await import('/wasm/holoscript_wasm.js');
        const { UAALOpCode, UAALVirtualMachine } = await import('/uaal/index.js');
        await initWasm('/wasm/holoscript_wasm_bg.wasm');
        const compiled = JSON.parse(compile_to_uaal(source));
        if (compiled.error) throw new Error(compiled.error);
        const vm = new UAALVirtualMachine();
        registerHsI32BinaryHandler(vm, UAALOpCode.EXEC);
        const result = await vm.execute(compiled);
        output.textContent = JSON.stringify({
          status: result.taskStatus,
          value: result.stackTop,
          instructionCount: compiled.instructions.length,
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
      '/browser/node-crypto.js',
      {
        body: "export function createHash() { throw new Error('node:crypto is unavailable in browser ABI conformance'); }\n",
        contentType: 'application/javascript; charset=utf-8',
      },
    ],
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
  ]);
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
    if (result.status !== 'HALTED' || result.value !== expectedDigest || result.wasm !== true) {
      throw new Error(`browser-WASM result mismatch: ${JSON.stringify(result)}`);
    }
    return {
      browserExecutable: basename(command),
      browserUserAgent: result.userAgent,
      compiler: '@holoscript/wasm web artifact',
      execution: '@holoscript/uaal browser ESM',
      instructionCount: result.instructionCount,
      result: result.value,
    };
  } finally {
    releaseHold();
    await new Promise((resolveClose) => server.close(resolveClose));
    rmSync(profilePath, { recursive: true, force: true });
  }
}

async function executeNode() {
  const { clamp, sign, step } = await import(pathToFileURL(stdMathPath).href);
  const below = clamp(-7, 0, 9);
  const inside = clamp(4, 0, 9);
  const above = clamp(12, 0, 9);
  const negative = sign(-8);
  const zero = sign(0);
  const positive = sign(8);
  const before = step(5, 4);
  const edge = step(5, 5);
  const result =
    below +
    inside * 2 +
    above * 3 +
    (negative + 1) * 7 +
    zero * 11 +
    positive * 5 +
    before * 13 +
    edge * 2;
  if (result !== expectedDigest) {
    throw new Error(`Node std result mismatch: expected ${expectedDigest}, received ${result}`);
  }
  return {
    runtime: process.version,
    implementation: '@holoscript/std/dist/math.js',
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

requireFile(abiPath, 'scalar ABI source');
requireFile(stdMathPath, 'built Node std math implementation');
requireFile(wasmJsPath, 'browser WASM JavaScript bridge');
requireFile(wasmBinaryPath, 'browser WASM compiler');
requireFile(wasmReceiptPath, 'browser WASM rebuild receipt');
requireFile(uaalBundlePath, 'built UAAL browser execution bundle');
requireFile(nativeManifestPath, 'owned-metal compiler manifest');

const abiSource = readFileSync(abiPath, 'utf8');
const executableSource = `${abiSource.trim()}\n${selfTest.trim()}\n`;
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
      schema: 'holoscript.std.scalar-abi-conformance.v1',
      status: 'pass',
      abi: 'hs.std.scalar.i32.v1',
      source: 'packages/std/src/abi/scalar-v1.hs',
      sourceSha256: sha256(abiSource),
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
        provesBrowserWasmCompilerAndUaalExecution: true,
        provesOwnedMetalNativeExecutable: true,
        provesFloatingPointMath: false,
        provesVectorOrQuaternionMath: false,
        provesCollections: false,
        provesOsAirGap: false,
      },
    },
    null,
    2
  )
);
