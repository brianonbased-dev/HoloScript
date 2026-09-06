#!/usr/bin/env node
/**
 * Execute or score the sealed Paper 5 visual-v4 request set.
 *
 * Provider-specific credentials and clients stay outside HoloAbsorb. Each model
 * family may declare a shell-free stdin/stdout adapter in the execution plan,
 * or a family-native agent may consume requests.jsonl and return the portable
 * response schema. HoloAbsorb owns deterministic request construction, actual
 * image-byte custody, response admission, scoring, and claim gates.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPaper5VisualV4RequestManifest,
  capturePaper5VisualV4Response,
  materializePaper5VisualV4Request,
  scorePaper5VisualV4Responses,
} from './lib/paper-5-visual-v4.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultProtocol = resolve(packageRoot, 'benchmarks/paper-5-visual-agent-study-v4.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv) {
  const options = {
    protocol: defaultProtocol,
    packets: '',
    executionPlan: '',
    responses: '',
    outDir: '.scratch/paper-5-visual-v4-execution',
    execute: false,
    requireConfirmation: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) continue;
    const [flag, inline] = raw.slice(2).split('=', 2);
    const next = inline ?? argv[index + 1];
    if (inline === undefined && next && !next.startsWith('--')) index += 1;
    if (flag === 'protocol') options.protocol = resolve(next || defaultProtocol);
    if (flag === 'packets') options.packets = resolve(next || '');
    if (flag === 'execution-plan') options.executionPlan = resolve(next || '');
    if (flag === 'responses') options.responses = resolve(next || '');
    if (flag === 'out-dir') options.outDir = next || options.outDir;
    if (flag === 'execute') options.execute = true;
    if (flag === 'require-confirmation') options.requireConfirmation = true;
    if (flag === 'help') options.help = true;
  }
  return options;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/execute-paper-5-visual-v4.mjs [options]',
    '',
    'Required:',
    '  --packets=PATH           Sealed packets.json from the v4 prepare command',
    '  --execution-plan=PATH     Three-family model/version receipt plan',
    '',
    'Modes:',
    '  (default)                Emit provider-neutral requests.jsonl without model calls',
    '  --execute                Run each family adapter from the execution plan',
    '  --responses=PATH          Score portable response JSON or JSONL captured elsewhere',
    '',
    'Other:',
    '  --protocol=PATH           Frozen v4 protocol',
    '  --out-dir=PATH            Request, response, and result output directory',
    '  --require-confirmation    Exit non-zero unless every confirmatory gate passes',
    '  --help                    Show this message',
    '',
    'Adapter contract:',
    '  modelFamilies[].adapter = { "command": "...", "args": ["..."], "timeoutMs": 60000 }',
    '  The command receives one materialized request JSON on stdin and returns one JSON object.',
  ].join('\n');
}

function writeJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function writeJsonl(path, values) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(
    temporary,
    `${values.map((value) => JSON.stringify(value)).join('\n')}\n`,
    'utf8'
  );
  renameSync(temporary, path);
}

function parseResponses(path) {
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.responses)) return parsed.responses;
    } catch {
      // Fall through to JSONL parsing.
    }
  }
  return raw
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid response JSONL at line ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });
}

function resolveImagePath(packetRoot, imagePath) {
  if (isAbsolute(imagePath)) throw new Error('Packet image paths must be relative');
  const absolute = resolve(packetRoot, imagePath);
  const fromRoot = relative(packetRoot, absolute);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`Packet image path escapes packet root: ${imagePath}`);
  }
  return absolute;
}

function adapterFor(executionPlan, family) {
  const entry = executionPlan.modelFamilies.find((item) => item.family === family);
  const adapter = entry?.adapter;
  if (
    !adapter ||
    typeof adapter.command !== 'string' ||
    adapter.command.trim().length === 0 ||
    (adapter.args !== undefined &&
      (!Array.isArray(adapter.args) || adapter.args.some((value) => typeof value !== 'string')))
  ) {
    throw new Error(`Execution adapter missing or invalid for family ${family}`);
  }
  return {
    command: adapter.command,
    args: adapter.args ?? [],
    timeoutMs: Math.min(600_000, Math.max(1_000, Number(adapter.timeoutMs ?? 60_000))),
  };
}

function runAdapter(adapter, payload, cwd) {
  return new Promise((resolvePromise) => {
    const started = performance.now();
    const child = spawn(adapter.command, adapter.args, {
      cwd,
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const outputLimit = 4 * 1024 * 1024;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        ...value,
        latencyMs: Math.round((performance.now() - started) * 1_000) / 1_000,
      });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        error: `adapter-timeout-${adapter.timeoutMs}ms`,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    }, adapter.timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= outputLimit) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= outputLimit) stderr.push(chunk);
      else child.kill();
    });
    child.on('error', (error) => {
      finish({
        ok: false,
        error: `adapter-spawn:${error.message}`,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.on('close', (code, signal) => {
      const stdoutText = Buffer.concat(stdout).toString('utf8').trim();
      const stderrText = Buffer.concat(stderr).toString('utf8').trim();
      if (stdoutBytes > outputLimit || stderrBytes > outputLimit) {
        finish({
          ok: false,
          error: 'adapter-output-limit-exceeded',
          stdout: stdoutText,
          stderr: stderrText,
        });
        return;
      }
      if (code !== 0) {
        finish({
          ok: false,
          error: `adapter-exit:${code ?? 'null'}:${signal ?? 'none'}`,
          stdout: stdoutText,
          stderr: stderrText,
        });
        return;
      }
      try {
        finish({
          ok: true,
          output: JSON.parse(stdoutText),
          stdoutSha256: sha256(stdoutText),
          stderrSha256: sha256(stderrText),
        });
      } catch (error) {
        finish({
          ok: false,
          error: `adapter-json:${error instanceof Error ? error.message : String(error)}`,
          stdout: stdoutText,
          stderr: stderrText,
        });
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function executeRequests({
  requests,
  executionPlan,
  packetRoot,
  responsePath,
  initialResponses = [],
}) {
  const responses = [...initialResponses];
  const completedRequestIds = new Set(responses.map((response) => response?.requestId));
  for (const [index, request] of requests.entries()) {
    if (completedRequestIds.has(request.requestId)) {
      console.error(
        `[paper5-visual-v4] resume ${index + 1}/${requests.length} ` +
          `family=${request.family} arm=${request.arm}`
      );
      continue;
    }
    const imagePath = request.input.literalImage
      ? resolveImagePath(packetRoot, request.input.literalImage.path)
      : null;
    const png = imagePath ? readFileSync(imagePath) : undefined;
    const materialized = materializePaper5VisualV4Request(request, png);
    const adapter = adapterFor(executionPlan, request.family);
    const adapterResult = await runAdapter(adapter, materialized.payload, packetRoot);
    const adapterOutput = adapterResult.ok
      ? adapterResult.output
      : { output: null, adapterError: adapterResult.error };
    const response = capturePaper5VisualV4Response({
      request,
      adapterOutput,
      materializationReceipt: materialized.receipt,
      latencyMs: adapterResult.latencyMs,
    });
    responses.push({
      ...response,
      adapterReceipt: {
        ok: adapterResult.ok,
        error: adapterResult.error ?? null,
        stdoutSha256: adapterResult.stdoutSha256 ?? null,
        stderrSha256: adapterResult.stderrSha256 ?? null,
      },
    });
    completedRequestIds.add(request.requestId);
    writeJsonl(responsePath, responses);
    console.error(
      `[paper5-visual-v4] response ${index + 1}/${requests.length} ` +
        `family=${request.family} arm=${request.arm} valid=${response.valid}`
    );
  }
  return responses;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.packets) throw new Error('--packets is required');
  if (!options.executionPlan) throw new Error('--execution-plan is required');
  if (options.execute && options.responses) {
    throw new Error('--execute and --responses are mutually exclusive');
  }
  const protocolRaw = readFileSync(options.protocol, 'utf8');
  const packetRaw = readFileSync(options.packets, 'utf8');
  const executionPlanRaw = readFileSync(options.executionPlan, 'utf8');
  const protocol = JSON.parse(protocolRaw);
  const packetManifest = JSON.parse(packetRaw);
  const executionPlan = JSON.parse(executionPlanRaw);
  const requestManifest = buildPaper5VisualV4RequestManifest({
    protocol,
    protocolRaw,
    packetManifest,
    executionPlan,
  });
  const outDir = resolve(repoRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });
  const requestManifestPath = resolve(outDir, 'request-manifest.json');
  const requestPath = resolve(outDir, 'requests.jsonl');
  const responsePath = resolve(outDir, 'responses.jsonl');
  if (existsSync(requestManifestPath)) {
    const previousRequestManifest = JSON.parse(readFileSync(requestManifestPath, 'utf8'));
    if (
      previousRequestManifest?.requestManifestSha256 !== requestManifest.requestManifestSha256
    ) {
      throw new Error(
        'Output directory contains a different request manifest; choose a new --out-dir'
      );
    }
  }
  writeJson(requestManifestPath, requestManifest);
  writeJsonl(requestPath, requestManifest.requests);

  if (!options.execute && !options.responses) {
    const readiness = {
      schemaVersion: 'holoscript.paper5.visual-v4-execution-readiness.v1',
      status: 'requests-ready',
      requestManifestSha256: requestManifest.requestManifestSha256,
      counts: requestManifest.counts,
      requestPath: relative(repoRoot, requestPath).replace(/\\/gu, '/'),
      claimBoundary:
        'Requests are admitted and scheduled, but no model responses were captured or scored.',
    };
    writeJson(resolve(outDir, 'readiness.json'), readiness);
    console.log(JSON.stringify(readiness, null, 2));
    return 0;
  }

  const packetRoot = dirname(options.packets);
  const existingResponses =
    options.execute && existsSync(responsePath) ? parseResponses(responsePath) : [];
  const responses = options.execute
    ? await executeRequests({
        requests: requestManifest.requests,
        executionPlan,
        packetRoot,
        responsePath,
        initialResponses: existingResponses,
      })
    : parseResponses(options.responses);
  if (!options.execute) writeJsonl(responsePath, responses);
  const result = scorePaper5VisualV4Responses({
    protocol,
    packetManifest,
    executionPlan,
    requestManifest,
    responses,
  });
  const resultWithReceipt = {
    ...result,
    generatedAt: new Date().toISOString(),
    protocolSha256: requestManifest.protocolSha256,
    packetSha256: requestManifest.packetSha256,
    requestManifestSha256: requestManifest.requestManifestSha256,
    responseSetSha256: sha256(JSON.stringify(responses)),
    hardwareAndProviderProvenance: executionPlan.hardwareAndProviderProvenance ?? null,
  };
  const resultPath = resolve(outDir, 'result.json');
  writeJson(resultPath, resultWithReceipt);
  console.log(
    JSON.stringify(
      {
        status: result.status,
        confirmation: result.confirmation.status,
        counts: result.counts,
        resultPath: relative(repoRoot, resultPath).replace(/\\/gu, '/'),
      },
      null,
      2
    )
  );
  if (result.status !== 'pass') return 1;
  if (options.requireConfirmation && result.confirmation.status !== 'supported') return 2;
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        `[execute-paper-5-visual-v4] ${error instanceof Error ? error.stack : String(error)}`
      );
      process.exitCode = 1;
    });
}
