#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.visual-witness.v0.1.0';
const PLAYABLE_SHARD_WITNESS_SCHEMA = 'hololand.holoshell.playable-shard-witness.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_ROOM = path.join('apps', 'holoshell', 'prototype', 'hardware-reality-room.html');
const DEFAULT_OUTPUT_DIR = path.join('.tmp', 'holoshell', 'visual-witness');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'visual-witness.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'visual-witness.js');
const DEFAULT_PLAYABLE_WITNESS_OUTPUT = path.join('.tmp', 'holoshell', 'playable-shard-witness.json');
const DEFAULT_PLAYABLE_WITNESS_JS = path.join('.tmp', 'holoshell', 'playable-shard-witness.js');
const DEFAULT_PLAYABLE_WITNESS_DIR = path.join('.tmp', 'holoshell', 'playable-shard-witness');
const DEFAULT_EXPECT_TEXT = [
  'HoloShell Hardware Reality',
  'Brittney Queue',
  'Visual Witness',
  'Shell Custody',
  'Run Custody',
];

const BROWSER_CANDIDATES = [
  process.env.HOLOLAND_HARDWARE_BROWSER,
  process.env.HOLOSHELL_VISUAL_BROWSER,
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'chrome',
  'google-chrome',
  'microsoft-edge',
  'msedge',
  'chromium',
].filter(Boolean);

function parseArgs(argv) {
  const args = {
    browser: '',
    room: DEFAULT_ROOM,
    outputDir: DEFAULT_OUTPUT_DIR,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    shardWorkflow: '',
    previewSource: '',
    shardImportReceipt: '',
    playableWitnessOutput: DEFAULT_PLAYABLE_WITNESS_OUTPUT,
    playableWitnessJs: DEFAULT_PLAYABLE_WITNESS_JS,
    playableWitnessDir: DEFAULT_PLAYABLE_WITNESS_DIR,
    width: 1440,
    height: 1000,
    virtualTimeBudget: 7000,
    expectText: [],
    customExpectText: false,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--browser') args.browser = argv[++index] || '';
    else if (arg === '--room') args.room = argv[++index] || args.room;
    else if (arg === '--output-dir') args.outputDir = argv[++index] || args.outputDir;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--shard-workflow') args.shardWorkflow = argv[++index] || '';
    else if (arg === '--preview-source') args.previewSource = argv[++index] || '';
    else if (arg === '--shard-import-receipt') args.shardImportReceipt = argv[++index] || '';
    else if (arg === '--playable-witness-output') args.playableWitnessOutput = argv[++index] || args.playableWitnessOutput;
    else if (arg === '--playable-witness-js') args.playableWitnessJs = argv[++index] || args.playableWitnessJs;
    else if (arg === '--playable-witness-dir') args.playableWitnessDir = argv[++index] || args.playableWitnessDir;
    else if (arg === '--width') args.width = Number(argv[++index]) || args.width;
    else if (arg === '--height') args.height = Number(argv[++index]) || args.height;
    else if (arg === '--virtual-time-budget') args.virtualTimeBudget = Number(argv[++index]) || args.virtualTimeBudget;
    else if (arg === '--expect-text') {
      args.customExpectText = true;
      args.expectText.push(argv[++index] || '');
    }
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.width) || args.width < 320) throw new Error('--width must be at least 320');
  if (!Number.isFinite(args.height) || args.height < 240) throw new Error('--height must be at least 240');
  if (!Number.isFinite(args.virtualTimeBudget) || args.virtualTimeBudget < 1000) {
    throw new Error('--virtual-time-budget must be at least 1000');
  }
  if (args.shardWorkflow && !args.previewSource) {
    throw new Error('--preview-source is required when --shard-workflow is provided');
  }
  if (args.shardImportReceipt && args.shardWorkflow) {
    throw new Error('--shard-import-receipt and --shard-workflow are mutually exclusive');
  }
  args.expectText = (args.customExpectText ? args.expectText : DEFAULT_EXPECT_TEXT)
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return args;
}

function printHelp() {
  console.log(`HoloShell visual witness

Usage:
  node scripts/holoshell-visual-witness.mjs [options]
  pnpm run holoshell:visual-witness -- [options]

Options:
  --browser <path>              Chrome/Edge/Chromium executable. Falls back to hardware browser candidates.
  --room <path>                 HTML room to render. Default: ${DEFAULT_ROOM}.
  --output-dir <path>           Screenshot/DOM witness directory. Default: ${DEFAULT_OUTPUT_DIR}.
  --output <path>               Receipt JSON. Default: ${DEFAULT_OUTPUT}.
  --js-output <path>            Browser bootstrap JS. Default: ${DEFAULT_JS_OUTPUT}.
  --shard-workflow <path>       Asset shard workflow receipt to render as a playable preview witness.
  --preview-source <path>       Generated shard .holo source paired with --shard-workflow.
  --shard-import-receipt <path> Imported shard receipt to render as a playable shard witness.
  --playable-witness-output <path> PlayableShardWitnessReceipt JSON. Default: ${DEFAULT_PLAYABLE_WITNESS_OUTPUT}.
  --playable-witness-js <path>  Playable witness browser bootstrap JS. Default: ${DEFAULT_PLAYABLE_WITNESS_JS}.
  --playable-witness-dir <path> Playable witness screenshot/DOM dir. Default: ${DEFAULT_PLAYABLE_WITNESS_DIR}.
  --width <px>                  Viewport width. Default: 1440.
  --height <px>                 Viewport height. Default: 1000.
  --virtual-time-budget <ms>    Headless browser script/render budget. Default: 7000.
  --expect-text <text>          Visible text that must appear in rendered DOM. Repeatable; overrides room defaults when provided.
  --json                        Print receipt JSON.
  --self-test                   Render a synthetic room fixture first.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_VISUAL_WITNESS = ${payload};\n`, 'utf8');
  return resolved;
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  return result.status === 0 || Boolean(result.stdout || result.stderr);
}

function findBrowser(explicitBrowser) {
  const candidates = explicitBrowser ? [explicitBrowser] : BROWSER_CANDIDATES;
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && commandExists(candidate)) return candidate;
  }
  return null;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeHtml(text) {
  return String(text)
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function visibleTextFromDom(dom) {
  return decodeHtml(String(dom)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function createBrowserArgs({ args, profileDir, targetUrl, screenshotPath, dumpDom }) {
  const browserArgs = [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--allow-file-access-from-files',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw',
    `--virtual-time-budget=${Math.floor(args.virtualTimeBudget)}`,
    `--window-size=${Math.floor(args.width)},${Math.floor(args.height)}`,
    `--user-data-dir=${profileDir}`,
  ];

  if (dumpDom) browserArgs.push('--dump-dom');
  if (screenshotPath) browserArgs.push(`--screenshot=${screenshotPath}`);
  browserArgs.push(targetUrl);
  return browserArgs;
}

function runBrowser(browserPath, browserArgs, timeout = 30000) {
  const result = spawnSync(browserPath, browserArgs, {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  };
}

function prepareSelfTest(args) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-visual-witness-self-test-'));
  const room = path.join(tempRoot, 'room.html');
  writeFileSync(room, `<!doctype html>
<html>
<head><meta charset="utf-8"><title>HoloShell Visual Witness Self Test</title></head>
<body>
  <main>
    <h1>HoloShell Visual Witness Self Test</h1>
    <section id="gates">
      <p>Brittney Queue</p>
      <p>Visual Witness</p>
      <p>Shell Custody</p>
      <p>Run Custody</p>
    </section>
  </main>
</body>
</html>`, 'utf8');

  return {
    tempRoot,
    args: {
      ...args,
      room,
      outputDir: path.join(tempRoot, 'witness'),
      output: path.join(tempRoot, 'visual-witness.json'),
      jsOutput: path.join(tempRoot, 'visual-witness.js'),
      expectText: ['HoloShell Visual Witness Self Test', 'Brittney Queue', 'Visual Witness', 'Shell Custody', 'Run Custody'],
      selfTest: false,
    },
  };
}

function prepareShardWitness(args) {
  const workflow = readJson(args.shardWorkflow);
  const previewSource = readFileSync(resolveRepoPath(args.previewSource), 'utf8');
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-shard-witness-'));
  const room = path.join(tempRoot, 'asset-shard-witness.html');
  const assets = workflow.shardPlan?.assets || [];
  const expectedText = [
    'HoloShell Asset Shard Witness',
    'Playable Shard Preview',
    `Shard ID: ${workflow.shardPlan?.shardId || 'unknown'}`,
    `Assets: ${workflow.summary?.assetCount ?? 0}`,
    'Source assets mutated: false',
  ];
  const assetList = assets
    .slice(0, 24)
    .map((asset) => `<li><strong>${escapeHtml(asset.kind)}</strong> ${escapeHtml(asset.name)} <span>${escapeHtml(asset.relativePath)}</span></li>`)
    .join('\n');
  writeFileSync(room, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>HoloShell Asset Shard Witness</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      color: #f7fbff;
      background: #101820;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 32px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 34px;
      font-weight: 700;
    }
    h2 {
      margin: 0 0 28px;
      color: #76f7d7;
      font-size: 22px;
      font-weight: 600;
    }
    .surface {
      border: 1px solid rgba(118, 247, 215, 0.32);
      border-radius: 8px;
      padding: 22px;
      background: #16242c;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0;
    }
    .stat {
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 12px;
      background: #20323a;
    }
    .label {
      display: block;
      color: #a9bdc8;
      font-size: 12px;
      text-transform: uppercase;
    }
    .value {
      display: block;
      margin-top: 6px;
      font-size: 20px;
      font-weight: 700;
    }
    ul {
      columns: 2;
      padding-left: 18px;
    }
    li {
      break-inside: avoid;
      margin: 8px 0;
    }
    li span {
      color: #a9bdc8;
    }
    pre {
      overflow: hidden;
      max-height: 190px;
      border-radius: 8px;
      padding: 14px;
      color: #dce8ef;
      background: #0b1115;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main>
    <h1>HoloShell Asset Shard Witness</h1>
    <h2>Playable Shard Preview</h2>
    <section class="surface">
      <p>Shard ID: ${escapeHtml(workflow.shardPlan?.shardId || 'unknown')}</p>
      <p>World: ${escapeHtml(workflow.shardPlan?.worldName || 'Local Assets Shard')}</p>
      <p>Source assets mutated: false</p>
      <div class="stats" aria-label="Asset shard stats">
        <div class="stat"><span class="label">Assets</span><span class="value">${workflow.summary?.assetCount ?? 0}</span></div>
        <div class="stat"><span class="label">Models</span><span class="value">${workflow.summary?.modelCount ?? 0}</span></div>
        <div class="stat"><span class="label">Images</span><span class="value">${workflow.summary?.imageCount ?? 0}</span></div>
        <div class="stat"><span class="label">Audio</span><span class="value">${workflow.summary?.audioCount ?? 0}</span></div>
      </div>
      <p>Assets: ${workflow.summary?.assetCount ?? 0}</p>
      <ul>${assetList || '<li>No assets staged</li>'}</ul>
      <pre>${escapeHtml(previewSource.slice(0, 4000))}</pre>
    </section>
  </main>
</body>
</html>`, 'utf8');
  return {
    tempRoot,
    shardWitness: {
      enabled: true,
      workflowReceipt: publicPath(args.shardWorkflow),
      previewSource: publicPath(args.previewSource),
      shardId: workflow.shardPlan?.shardId || '',
      previewHash: sha256Text(previewSource),
      assetCount: workflow.summary?.assetCount ?? assets.length,
      sourceAssetsMutated: false,
    },
    args: {
      ...args,
      room,
      expectText: args.customExpectText ? args.expectText : expectedText,
    },
  };
}

function prepareImportedShardWitness(args) {
  const importReceipt = readJson(args.shardImportReceipt);
  if (!importReceipt) throw new Error(`Shard import receipt not found: ${args.shardImportReceipt}`);
  const manifestPath = importReceipt.output?.manifestPath;
  const shardSourcePath = importReceipt.output?.shardSourcePath;
  if (!manifestPath) throw new Error('Import receipt is missing output.manifestPath.');
  if (!shardSourcePath) throw new Error('Import receipt is missing output.shardSourcePath.');
  const manifest = readJson(manifestPath);
  const shardSource = readFileSync(resolveRepoPath(shardSourcePath), 'utf8');
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-imported-shard-witness-'));
  const room = path.join(tempRoot, 'imported-shard-witness.html');
  const assets = (manifest.assets || importReceipt.summary?.assetCount || 0);
  const shardId = manifest.shardId || importReceipt.summary?.shardId || 'unknown';
  const worldName = manifest.worldName || 'Imported Shard';
  const assetCount = Number(importReceipt.summary?.assetCount ?? (manifest.assets || []).length);
  const modelCount = Number(importReceipt.summary?.modelCount ?? (manifest.assets || []).filter((a) => a.kind === 'model').length);
  const imageCount = Number(importReceipt.summary?.imageCount ?? (manifest.assets || []).filter((a) => a.kind === 'image').length);
  const audioCount = Number(importReceipt.summary?.audioCount ?? (manifest.assets || []).filter((a) => a.kind === 'audio').length);
  const expectedText = [
    'HoloShell Imported Shard Witness',
    'Playable Shard Preview',
    `Shard ID: ${shardId}`,
    `Assets: ${assetCount}`,
    'Source assets mutated: false',
    'Import status: completed',
  ];
  const assetList = (manifest.assets || [])
    .slice(0, 24)
    .map((asset) => `<li><strong>${escapeHtml(asset.kind)}</strong> ${escapeHtml(asset.name)} <span>${escapeHtml(asset.relativePath)}</span></li>`)
    .join('\n');
  writeFileSync(room, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>HoloShell Imported Shard Witness</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      color: #f7fbff;
      background: #101820;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 32px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 34px;
      font-weight: 700;
    }
    h2 {
      margin: 0 0 28px;
      color: #76f7d7;
      font-size: 22px;
      font-weight: 600;
    }
    .surface {
      border: 1px solid rgba(118, 247, 215, 0.32);
      border-radius: 8px;
      padding: 22px;
      background: #16242c;
    }
    .badge {
      display: inline-block;
      background: #0abed9;
      color: #101820;
      font-weight: 700;
      font-size: 13px;
      padding: 3px 10px;
      border-radius: 4px;
      margin-left: 12px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0;
    }
    .stat {
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 12px;
      background: #20323a;
    }
    .label {
      display: block;
      color: #a9bdc8;
      font-size: 12px;
      text-transform: uppercase;
    }
    .value {
      display: block;
      margin-top: 6px;
      font-size: 20px;
      font-weight: 700;
    }
    ul {
      columns: 2;
      padding-left: 18px;
    }
    li {
      break-inside: avoid;
      margin: 8px 0;
    }
    li span {
      color: #a9bdc8;
    }
    pre {
      overflow: hidden;
      max-height: 190px;
      border-radius: 8px;
      padding: 14px;
      color: #dce8ef;
      background: #0b1115;
      white-space: pre-wrap;
    }
    .witness-check {
      margin-top: 18px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(118, 247, 215, 0.08);
      border: 1px solid rgba(118, 247, 215, 0.2);
    }
    .witness-check dt {
      font-weight: 700;
      color: #76f7d7;
    }
    .witness-check dd {
      margin: 4px 0 12px;
      color: #dce8ef;
    }
  </style>
</head>
<body>
  <main>
    <h1>HoloShell Imported Shard Witness<span class="badge">COMPLETED</span></h1>
    <h2>Playable Shard Preview</h2>
    <section class="surface">
      <p>Shard ID: ${escapeHtml(shardId)}</p>
      <p>World: ${escapeHtml(worldName)}</p>
      <p>Source assets mutated: false</p>
      <p>Import status: completed</p>
      <div class="stats" aria-label="Imported shard stats">
        <div class="stat"><span class="label">Assets</span><span class="value">${assetCount}</span></div>
        <div class="stat"><span class="label">Models</span><span class="value">${modelCount}</span></div>
        <div class="stat"><span class="label">Images</span><span class="value">${imageCount}</span></div>
        <div class="stat"><span class="label">Audio</span><span class="value">${audioCount}</span></div>
      </div>
      <p>Assets: ${assetCount}</p>
      <ul>${assetList || '<li>No imported assets</li>'}</ul>
      <pre>${escapeHtml(shardSource.slice(0, 4000))}</pre>
      <dl class="witness-check">
        <dt>Import receipt</dt>
        <dd>${escapeHtml(publicPath(args.shardImportReceipt))}</dd>
        <dt>Manifest</dt>
        <dd>${escapeHtml(manifestPath)}</dd>
        <dt>Shard source</dt>
        <dd>${escapeHtml(shardSourcePath)}</dd>
        <dt>Runtime mutation</dt>
        <dd>${importReceipt.summary?.runtimeMutationExecuted ? 'true (import executed)' : 'false'}</dd>
        <dt>Source assets mutated</dt>
        <dd>false</dd>
      </dl>
    </section>
  </main>
</body>
</html>`, 'utf8');
  return {
    tempRoot,
    shardWitness: {
      enabled: true,
      workflowReceipt: importReceipt.approval?.workflowHash
        ? publicPath(args.shardImportReceipt)
        : '',
      previewSource: publicPath(shardSourcePath),
      shardId,
      previewHash: sha256Text(shardSource),
      assetCount,
      sourceAssetsMutated: false,
    },
    importReceipt,
    manifest,
    args: {
      ...args,
      room,
      expectText: args.customExpectText ? args.expectText : expectedText,
    },
  };
}

function createReceipt(args) {
  const roomPath = resolveRepoPath(args.room);
  if (!existsSync(roomPath)) throw new Error(`Room file not found: ${roomPath}`);

  const browserPath = findBrowser(args.browser);
  const generatedAt = new Date().toISOString();
  // When rendering an imported shard witness, use the dedicated playable-witness-dir
  // for screenshots and DOM dumps so they are colocated with the PlayableShardWitnessReceipt.
  const effectiveOutputDir = args.shardImportReceipt
    ? resolveRepoPath(args.playableWitnessDir)
    : resolveRepoPath(args.outputDir);
  mkdirSync(effectiveOutputDir, { recursive: true });

  const slug = path.basename(roomPath).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const screenshotPath = path.join(effectiveOutputDir, `${slug}-${stamp}.png`);
  const domPath = path.join(effectiveOutputDir, `${slug}-${stamp}.dom.html`);
  const targetUrl = pathToFileURL(roomPath).href;

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    status: 'fail',
    room: {
      path: path.relative(REPO_ROOT, roomPath).replace(/\\/g, '/'),
      url: targetUrl,
    },
    browser: {
      path: browserPath,
      detected: Boolean(browserPath),
    },
    viewport: {
      width: Math.floor(args.width),
      height: Math.floor(args.height),
    },
    screenshot: null,
    domWitness: null,
    shardWitness: args.shardWitness || undefined,
    checks: [],
    gapClosed: {
      gap: 'HoloScript MCP browser screenshot can be unavailable when its bundled Playwright browser is missing.',
      fix: 'Use local Chrome/Edge/Chromium headless rendering to produce screenshot and DOM receipts.',
    },
    safety: {
      destructiveActionsTaken: false,
      terminationPerformed: false,
      mutationPerformed: false,
      rawCommandsIncluded: false,
    },
  };

  const addCheck = (id, status, target, evidence = {}, notes = []) => {
    receipt.checks.push({ id, status, target, evidence, notes });
  };

  addCheck(
    'browser-detected',
    browserPath ? 'pass' : 'fail',
    'Local Chromium-family browser executable',
    { browserPath, explicitBrowser: args.browser || null },
  );

  if (!browserPath) {
    return receipt;
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'holoshell-visual-witness-'));
  const profileDir = path.join(tempRoot, 'profile');
  mkdirSync(profileDir, { recursive: true });

  try {
    const screenshotResult = runBrowser(
      browserPath,
      createBrowserArgs({ args, profileDir, targetUrl, screenshotPath, dumpDom: false }),
    );
    const screenshotExists = existsSync(screenshotPath);
    const screenshotSize = screenshotExists ? statSync(screenshotPath).size : 0;
    const screenshotOk = screenshotResult.ok && screenshotExists && screenshotSize > 1024;
    receipt.screenshot = {
      path: path.relative(REPO_ROOT, screenshotPath).replace(/\\/g, '/'),
      sizeBytes: screenshotSize,
      sha256: screenshotExists ? sha256File(screenshotPath) : null,
      result: {
        status: screenshotResult.status,
        error: screenshotResult.error,
        stderrPreview: screenshotResult.stderr.trim().slice(0, 2000),
      },
    };
    addCheck(
      'screenshot-written',
      screenshotOk ? 'pass' : 'fail',
      'Headless screenshot witness',
      receipt.screenshot,
      screenshotOk ? ['Screenshot file exists and is non-empty.'] : ['Screenshot was not produced by the local browser.'],
    );

    const domResult = runBrowser(
      browserPath,
      createBrowserArgs({ args, profileDir, targetUrl, screenshotPath: null, dumpDom: true }),
    );
    const dom = domResult.stdout || '';
    const visibleText = visibleTextFromDom(dom);
    const missingText = args.expectText.filter((expected) => !visibleText.includes(expected));
    writeFileSync(domPath, dom, 'utf8');
    receipt.domWitness = {
      path: path.relative(REPO_ROOT, domPath).replace(/\\/g, '/'),
      sizeBytes: Buffer.byteLength(dom, 'utf8'),
      sha256: sha256Text(dom),
      visibleTextPreview: visibleText.slice(0, 1000),
      expectedText: args.expectText,
      missingText,
      result: {
        status: domResult.status,
        error: domResult.error,
        stderrPreview: domResult.stderr.trim().slice(0, 2000),
      },
    };
    addCheck(
      'dom-rendered',
      domResult.ok && dom.length > 0 ? 'pass' : 'fail',
      'Rendered DOM witness',
      {
        status: domResult.status,
        sizeBytes: receipt.domWitness.sizeBytes,
        domHash: receipt.domWitness.sha256,
      },
    );
    addCheck(
      'expected-visible-text',
      missingText.length === 0 ? 'pass' : 'fail',
      'Expected room text visible after render',
      {
        expectedText: args.expectText,
        missingText,
      },
    );

    receipt.status = receipt.checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
    return receipt;
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schema version mismatch');
  if (receipt.status !== 'pass') failures.push('expected pass status');
  if (!receipt.screenshot?.sha256) failures.push('expected screenshot hash');
  if (!receipt.domWitness?.sha256) failures.push('expected DOM hash');
  if (receipt.domWitness?.missingText?.length) failures.push('expected all fixture text to be visible');
  if (receipt.safety?.destructiveActionsTaken !== false) failures.push('destructive actions must be false');
  if (receipt.safety?.rawCommandsIncluded !== false) failures.push('raw commands must be hidden');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

function main() {
  let args = parseArgs(process.argv.slice(2));
  let selfTestRoot = null;
  let shardWitnessRoot = null;
  let importedShardWitnessRoot = null;

  if (args.selfTest) {
    const prepared = prepareSelfTest(args);
    args = prepared.args;
    selfTestRoot = prepared.tempRoot;
  }

  if (args.shardWorkflow) {
    const prepared = prepareShardWitness(args);
    args = {
      ...prepared.args,
      shardWitness: prepared.shardWitness,
    };
    shardWitnessRoot = prepared.tempRoot;
  }

  if (args.shardImportReceipt) {
    const prepared = prepareImportedShardWitness(args);
    args = {
      ...prepared.args,
      shardWitness: prepared.shardWitness,
    };
    importedShardWitnessRoot = prepared.tempRoot;
  }

  try {
    const receipt = createReceipt(args);
    if (args.selfTest === false && selfTestRoot) assertSelfTest(receipt);

    const output = writeJson(args.output, receipt);
    const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);

    if (args.shardImportReceipt && receipt.status === 'pass') {
      const playableWitness = {
        schemaVersion: PLAYABLE_SHARD_WITNESS_SCHEMA,
        generatedAt: receipt.generatedAt,
        status: receipt.status,
        shardWitness: receipt.shardWitness,
        screenshot: receipt.screenshot ? {
          path: receipt.screenshot.path,
          sizeBytes: receipt.screenshot.sizeBytes,
          sha256: receipt.screenshot.sha256,
        } : null,
        domWitness: receipt.domWitness ? {
          path: receipt.domWitness.path,
          sha256: receipt.domWitness.sha256,
          missingText: receipt.domWitness.missingText || [],
        } : null,
      };
      const playableOutput = writeJson(args.playableWitnessOutput, playableWitness);
      const playableJsOutput = writeBrowserBootstrap(args.playableWitnessJs, 'HOLOSHELL_PLAYABLE_SHARD_WITNESS', playableWitness);
      console.log(`Playable shard witness: ${playableOutput}`);
      console.log(`Playable shard witness bootstrap: ${playableJsOutput}`);
    }

    if (args.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(`HoloShell visual witness: ${output}`);
      console.log(`HoloShell visual witness browser bootstrap: ${jsOutput}`);
      console.log(`Status: ${receipt.status}`);
      console.log(`Browser: ${receipt.browser.path || 'none'}`);
      console.log(`Screenshot: ${receipt.screenshot?.path || 'none'}`);
      console.log(`DOM witness: ${receipt.domWitness?.path || 'none'}`);
      console.log(`Missing text: ${receipt.domWitness?.missingText?.join(', ') || 'none'}`);
      console.log(`Destructive actions: ${receipt.safety.destructiveActionsTaken}`);
    }
  } finally {
    if (selfTestRoot) rmSync(selfTestRoot, { recursive: true, force: true });
    if (shardWitnessRoot) rmSync(shardWitnessRoot, { recursive: true, force: true });
    if (importedShardWitnessRoot) rmSync(importedShardWitnessRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`holoshell-visual-witness failed: ${error.message}`);
  process.exit(1);
}
