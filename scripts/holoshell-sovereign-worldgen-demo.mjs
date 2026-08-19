#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA = 'hololand.holoshell.sovereign-worldgen-demo.v0.1.0';
const COMPILE_SCHEMA = 'hololand.holoshell.sovereign-worldgen-compile-receipt.v0.1.0';
const DEFAULT_INPUT = path.join('examples', 'demos', 'hl-013-sovereign-worldgen', 'coastal-ruin-input.json');
const DEFAULT_OUTPUT_DIR = path.join('.tmp', 'holoshell', 'demos', 'hl-013-sovereign-worldgen');
const DEFAULT_COMPILE_ENDPOINT = process.env.HOLOSCRIPT_WEBGPU_PREVIEW_URL || 'https://mcp.holoscript.net/api/compile/webgpu-preview';
const DEFAULT_TIMEOUT_MS = 120_000;
const THIRD_PARTY_ENGINE_IMPORT_RE = /(?:from\s+['"](?:three|@react-three\/fiber|babylonjs|@babylonjs\/core)['"]|import\(\s*['"](?:three|@react-three\/fiber|babylonjs|@babylonjs\/core)['"]\s*\)|<script[^>]+(?:three|babylon|react-three))/i;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    compileEndpoint: DEFAULT_COMPILE_ENDPOINT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    receipt: '',
    compileReceipt: '',
    compiledHtml: '',
    founderNote: '',
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === '--input') args.input = next();
    else if (arg === '--output-dir') args.outputDir = next();
    else if (arg === '--compile-endpoint') args.compileEndpoint = next();
    else if (arg === '--timeout-ms') args.timeoutMs = Number(next());
    else if (arg === '--receipt') args.receipt = next();
    else if (arg === '--compile-receipt') args.compileReceipt = next();
    else if (arg === '--compiled-html') args.compiledHtml = next();
    else if (arg === '--founder-note') args.founderNote = next();
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  args.input = resolveRepoPath(args.input);
  args.outputDir = resolveRepoPath(args.outputDir);
  args.receipt = args.receipt ? resolveRepoPath(args.receipt) : path.join(args.outputDir, 'receipt.json');
  args.compileReceipt = args.compileReceipt ? resolveRepoPath(args.compileReceipt) : path.join(args.outputDir, 'compile-receipt.json');
  args.compiledHtml = args.compiledHtml ? resolveRepoPath(args.compiledHtml) : path.join(args.outputDir, 'webgpu-preview.html');
  args.founderNote = args.founderNote ? resolveRepoPath(args.founderNote) : path.join(args.outputDir, 'founder-demo-note.md');
  return args;
}

function usage() {
  return `Usage: node scripts/holoshell-sovereign-worldgen-demo.mjs [options]

Run the HL-013 sovereign worldgen demo: build the typed world artifact, compile
it to a sovereign WebGPU preview, and write a founder-facing note with the
editable-vs-inferred boundary and remaining blockers.

Options:
  --input <file>             Demo input manifest JSON
  --output-dir <dir>         Artifact output directory
  --compile-endpoint <url>   WebGPU preview compile endpoint
  --timeout-ms <number>      HTTP timeout for compile request
  --receipt <file>           Base pipeline receipt path
  --compile-receipt <file>   Live compile receipt path
  --compiled-html <file>     Sovereign WebGPU preview HTML path
  --founder-note <file>      Founder-facing markdown note path
  --json                     Print JSON summary
  -h, --help                 Show this help
`;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(REPO_ROOT, filePath);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadInput(filePath) {
  const parsed = readJson(filePath);
  const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
  if (!String(parsed.prompt || '').trim()) throw new Error(`Demo input is missing prompt: ${relativeToRepo(filePath)}`);
  if (!facts.length) throw new Error(`Demo input is missing observed facts: ${relativeToRepo(filePath)}`);
  return parsed;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function requestText(urlString, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;
  const payload = Buffer.from(body, 'utf8');

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(payload.length),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          text,
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function buildFounderNote({ input, pipelineReceipt, compileReceipt, paths }) {
  const observedLabels = pipelineReceipt.provenance.observedFacts.map((fact) => `- ${fact.label} (${fact.confidence.toFixed(2)})`).join('\n');
  const inferredLines = pipelineReceipt.provenance.inferredDecisions
    .map((decision) => `- ${decision.selectedTrait}: ${decision.rationale}`)
    .join('\n');
  const typedNodes = [
    'SpawnAnchor',
    'WalkableRidgePath',
    'ArchedRuinGate',
    'PortalCheckpoint',
    'CollisionGuardrailLeft',
    'CollisionGuardrailRight',
  ].map((node) => `- ${node}`).join('\n');

  return `# HL-013 Sovereign Worldgen Founder Demo

## Demo Artifacts
- Input manifest: ${paths.input}
- Generated world source: ${pipelineReceipt.generatedWorld.path}
- Typed asset graph: ${pipelineReceipt.assetGraph.path}
- Pipeline receipt: ${pipelineReceipt.receipt.output}
- Sovereign WebGPU preview: ${paths.compiledHtml}
- Compile receipt: ${paths.compileReceipt}

## Typed And Editable
- The source of truth is the generated \`.holo\` world at ${pipelineReceipt.generatedWorld.path}.
- The typed asset graph is explicit and editable: navigation, collision, portal, and provenance objects are concrete nodes rather than opaque splat state.
- Editable world nodes in this slice:
${typedNodes}

## Observed Input Facts
- Prompt: ${input.prompt}
${observedLabels}

## Inferred World Decisions
${inferredLines}

## Remaining Blockers
- Observed image decomposition is still driven by a synthetic/source-owned observed-fact fixture, not a live vision extraction model.
- This receipt proves sovereign browser compile to WebGPU HTML, but not a Quest hardware witness or headset framerate capture yet.
- Public founder-demo distribution still needs a stable share/access layer in front of the generated preview, not just local artifact paths.

## Receipt Notes
- WebGPU compile endpoint: ${compileReceipt.endpoint}
- Compile status: ${compileReceipt.status}
- HTML output hash: ${compileReceipt.output.sha256}
`;
}

async function runDemo(args) {
  mkdirSync(args.outputDir, { recursive: true });
  const input = loadInput(args.input);
  const worldPath = path.join(args.outputDir, 'generated-world.holo');
  const assetGraphPath = path.join(args.outputDir, 'asset-graph.json');
  const htmlPath = path.join(args.outputDir, 'world-preview.html');
  const registryPath = path.join(args.outputDir, 'hololand-worldgen-registry.json');
  const learningPath = path.join(args.outputDir, 'learning-signal.jsonl');

  runCommand(process.execPath, [
    'scripts/holoshell-sovereign-worldgen-pipeline.mjs',
    '--prompt',
    String(input.prompt),
    '--observed',
    args.input,
    '--output-dir',
    args.outputDir,
    '--receipt',
    args.receipt,
    '--world',
    worldPath,
    '--asset-graph',
    assetGraphPath,
    '--html',
    htmlPath,
    '--registry',
    registryPath,
    '--learning',
    learningPath,
    '--json',
  ], { cwd: REPO_ROOT, timeout: args.timeoutMs });

  const pipelineReceipt = readJson(args.receipt);
  const worldSource = readFileSync(worldPath, 'utf8');
  const response = await requestText(
    args.compileEndpoint,
    JSON.stringify({ code: worldSource, options: { enableCompute: true, msaa: 4 } }),
    args.timeoutMs,
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Compile endpoint ${args.compileEndpoint} returned ${response.statusCode}\n${response.text}`);
  }

  writeText(args.compiledHtml, response.text);
  const compileReceipt = {
    schema: COMPILE_SCHEMA,
    status: 'pass',
    generatedAt: new Date().toISOString(),
    demoId: 'hl-013-sovereign-worldgen',
    matrixGap: 'HL-013',
    endpoint: args.compileEndpoint,
    sourceWorld: {
      path: relativeToRepo(worldPath),
      sha256: pipelineReceipt.generatedWorld.sha256,
      sourceLayer: 'HoloScript',
    },
    response: {
      statusCode: response.statusCode,
      contentType: String(response.headers['content-type'] || ''),
      compileMs: Number(response.headers['x-holoscript-compile-ms'] || 0) || null,
      renderer: String(response.headers['x-holoscript-renderer'] || ''),
    },
    output: {
      html: relativeToRepo(args.compiledHtml),
      sha256: sha256(response.text),
      bytes: Buffer.byteLength(response.text, 'utf8'),
    },
    validation: {
      titlePresent: response.text.includes('Sovereign Generated Navigable World'),
      webgpuMarkerPresent: /WebGPU/i.test(response.text),
      noThreeJsMarkerPresent: !THIRD_PARTY_ENGINE_IMPORT_RE.test(response.text),
    },
  };
  compileReceipt.status = Object.values(compileReceipt.validation).every(Boolean) ? 'pass' : 'fail';
  writeJson(args.compileReceipt, compileReceipt);
  if (compileReceipt.status !== 'pass') {
    throw new Error(`Compile receipt validation failed for ${relativeToRepo(args.compileReceipt)}`);
  }

  const founderNote = buildFounderNote({
    input,
    pipelineReceipt,
    compileReceipt,
    paths: {
      input: relativeToRepo(args.input),
      compiledHtml: relativeToRepo(args.compiledHtml),
      compileReceipt: relativeToRepo(args.compileReceipt),
    },
  });
  writeText(args.founderNote, founderNote);

  return {
    schema: SCHEMA,
    status: pipelineReceipt.status === 'pass' && compileReceipt.status === 'pass' ? 'pass' : 'fail',
    generatedAt: new Date().toISOString(),
    matrixGap: 'HL-013',
    pipelineReceipt: relativeToRepo(args.receipt),
    compileReceipt: relativeToRepo(args.compileReceipt),
    founderNote: relativeToRepo(args.founderNote),
    compiledHtml: relativeToRepo(args.compiledHtml),
  };
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      console.log(usage());
      return;
    }
    const summary = await runDemo(args);
    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`HoloShellSovereignWorldgenDemo: ${summary.status}`);
      console.log(`pipeline receipt: ${summary.pipelineReceipt}`);
      console.log(`compile receipt: ${summary.compileReceipt}`);
      console.log(`founder note: ${summary.founderNote}`);
      console.log(`compiled preview: ${summary.compiledHtml}`);
    }
    process.exit(summary.status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error(`[holoshell-sovereign-worldgen-demo] ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
