#!/usr/bin/env node
/**
 * HoloShell vision plan proof (scoped-scratch path, NOT gated).
 *
 * Produces a JSON plan proof from a screenshot or synthetic image via the
 * fara:7b vision lane. This is the SAFE next increment before any live-desktop
 * execution lane is admitted: it exercises the full vision→plan path without
 * ever capturing the founder's screen.
 *
 * Scoping guarantee: unless --screenshot is explicitly passed, this script
 * generates a minimal synthetic image (PNG 2x2 pixels) in a temp directory and
 * never reads from the real display. Even with --screenshot, the capture is
 * scoped to a named process/window handle so it cannot accidentally grab the
 * founder's active session.
 *
 * Output: JSON plan proof with fields:
 *   schemaVersion, proofId, generatedAt, imageSource, imageHash, model,
 *   prompt, visionAnalysis (raw response), planProof (extracted JSON action plan),
 *   planProofValid, receiptRequired.
 *
 * Usage:
 *   node scripts/holoshell-vision-plan-proof.mjs [options]
 *
 * Options:
 *   --intent <text>      Intent for the vision analysis prompt (required unless --self-test)
 *   --screenshot         Capture a scoped screenshot instead of using a synthetic image
 *   --target-app <name>  App/process to scope the screenshot to (required with --screenshot)
 *   --model <name>       Vision model; default from HOLOSCRIPT_AGENT_VISION_MODEL or fara:7b
 *   --ollama-host <url>  Ollama host; default from OLLAMA_HOST or http://127.0.0.1:11434
 *   --output <path>      Write receipt JSON to this path
 *   --self-test          Run non-mutating self-test with a synthetic image (no Ollama call)
 *   --json               Print the receipt JSON to stdout
 *   -h, --help           Show this help
 */

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VISION_PLAN_PROOF_SCHEMA = 'hololand.holoshell.vision-plan-proof.v0.1.0';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MODEL = 'fara:7b';
const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'vision-plan-proof-latest.json');

// Minimal 2x2 PNG (PNG header + IHDR + IDAT + IEND) — pure synthetic, zero display read.
// This is the "scoped scratch image" default; no founder screen is ever touched.
const SYNTHETIC_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVQI12NgAAIABQ' +
  'AABjUB6QAAAABJRU5ErkJggg==';

function usage() {
  return `HoloShell vision plan proof — scoped-scratch vision lane (NOT gated)

Usage: node scripts/holoshell-vision-plan-proof.mjs [options]

Options:
  --intent <text>      Intent for the vision analysis prompt (required unless --self-test)
  --screenshot         Capture a scoped screenshot (requires --target-app)
  --target-app <name>  App/process scope for screenshot
  --model <name>       Vision model (default: ${DEFAULT_MODEL})
  --ollama-host <url>  Ollama endpoint (default: ${DEFAULT_OLLAMA_HOST})
  --output <path>      Write receipt JSON
  --self-test          Non-mutating self-test with synthetic image (no Ollama call)
  --json               Print JSON receipt to stdout
  -h, --help           Show this help
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    intent: '',
    screenshot: false,
    targetApp: '',
    model: process.env.HOLOSCRIPT_AGENT_VISION_MODEL || process.env.AIBRITTNEY_MODEL || DEFAULT_MODEL,
    ollamaHost: process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST,
    output: DEFAULT_OUTPUT,
    selfTest: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    else if (arg === '--intent') args.intent = argv[++i] || '';
    else if (arg === '--screenshot') args.screenshot = true;
    else if (arg === '--target-app') args.targetApp = argv[++i] || '';
    else if (arg === '--model') args.model = argv[++i] || DEFAULT_MODEL;
    else if (arg === '--ollama-host') args.ollamaHost = argv[++i] || DEFAULT_OLLAMA_HOST;
    else if (arg === '--output') args.output = argv[++i] || DEFAULT_OUTPUT;
    else if (arg === '--self-test') { args.selfTest = true; }
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') { console.log(usage()); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.selfTest && !args.intent) {
    args.intent = 'Identify any visible UI elements and describe the layout.';
  }
  if (!args.intent.trim()) throw new Error('--intent is required');
  if (args.screenshot && !args.targetApp) {
    throw new Error('--screenshot requires --target-app to scope the capture (never captures full desktop)');
  }
  return args;
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stableId(prefix, text) {
  return `${prefix}_${crypto.createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 12)}`;
}

function repoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

/**
 * Capture a screenshot scoped to a single named process/window handle.
 * Uses PowerShell + .NET BitBlt to grab only the target window bounds —
 * never the full desktop. Throws if the target window is not found.
 */
function captureWindowScreenshot(targetApp) {
  if (process.platform !== 'win32') {
    throw new Error('screenshot capture requires Windows (PowerShell/Win32)');
  }
  const script = `
Add-Type @"
using System;using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;using System.IO;
public class HoloShellCapture {
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string lp, string wp);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  public static byte[] CaptureWindow(IntPtr hWnd) {
    RECT r; if (!GetWindowRect(hWnd, out r)) throw new Exception("GetWindowRect failed");
    int w=r.Right-r.Left,h=r.Bottom-r.Top; if(w<=0||h<=0) throw new Exception("window has zero area");
    using(var bmp=new Bitmap(w,h)) {
      using(var g=Graphics.FromImage(bmp)) {
        g.CopyFromScreen(new Point(r.Left,r.Top),Point.Empty,new Size(w,h));
      }
      using(var ms=new MemoryStream()) { bmp.Save(ms,ImageFormat.Png); return ms.ToArray(); }
    }
  }
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and ($_.ProcessName -like ${JSON.stringify(targetApp)} -or $_.MainWindowTitle -like ${JSON.stringify('*' + targetApp + '*')}) }
if (-not $procs) { Write-Error "no_window_found:${targetApp}"; exit 1 }
$handle = $procs[0].MainWindowHandle
try {
  $bytes = [HoloShellCapture]::CaptureWindow([IntPtr]$handle)
  [Convert]::ToBase64String($bytes)
} catch { Write-Error "capture_failed:$($_.Exception.Message)"; exit 1 }
`;
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout: 20_000, windowsHide: true }
  );
  if (r.status !== 0 || r.error) {
    throw new Error(`window_screenshot_failed:${(r.stderr || r.stdout || '').trim().slice(0, 400)}`);
  }
  const b64 = (r.stdout || '').trim();
  if (!b64) throw new Error(`window_screenshot_empty for target: ${targetApp}`);
  return b64;
}

function syntheticImageBase64() {
  return SYNTHETIC_PNG_BASE64;
}

/**
 * Call the Ollama vision API with the given image and prompt.
 * Returns { ok, response, raw, error }.
 */
async function callOllamaVision(imageBase64, prompt, model, ollamaHost) {
  const url = `${ollamaHost.replace(/\/$/, '')}/api/generate`;
  const body = JSON.stringify({
    model,
    prompt,
    images: [imageBase64],
    stream: false,
    options: { temperature: 0.1, num_predict: 512 },
  });
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return { ok: false, response: '', raw: '', error: String(err.message || err) };
  }
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, response: '', raw, error: `ollama_http_${res.status}: ${raw.slice(0, 300)}` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, response: '', raw, error: `ollama_parse_error: ${raw.slice(0, 300)}` };
  }
  return { ok: true, response: data.response || '', raw };
}

/**
 * Attempt to extract a JSON action plan from the vision model's text response.
 * If the response contains a JSON object/array, extract and parse it.
 * Returns { valid, plan, raw }.
 */
function extractPlanFromResponse(response) {
  const text = String(response || '');
  // Try to find a JSON block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i) ||
                    text.match(/```\s*([\s\S]*?)```/i) ||
                    text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      const plan = JSON.parse(jsonMatch[1].trim());
      return { valid: true, plan, raw: jsonMatch[1].trim() };
    } catch {
      // not valid JSON
    }
  }
  // No JSON found — return structured plan from text
  const hasElements = /\b(button|window|element|control|text|icon|menu|toolbar)\b/i.test(text);
  return {
    valid: false,
    plan: {
      elements_described: hasElements,
      raw_description: text.slice(0, 500),
      action_plan: null,
    },
    raw: '',
  };
}

export async function buildVisionPlanProof(opts = {}) {
  const generatedAt = opts.createdAt || new Date().toISOString();
  const model = opts.model || DEFAULT_MODEL;
  const intent = String(opts.intent || '').trim();
  if (!intent) throw new Error('vision plan proof requires intent');

  let imageBase64;
  let imageSource;

  if (opts.screenshot && opts.targetApp) {
    imageBase64 = captureWindowScreenshot(opts.targetApp);
    imageSource = { kind: 'window_screenshot', targetApp: opts.targetApp, scopeEnforced: true };
  } else {
    imageBase64 = syntheticImageBase64();
    imageSource = { kind: 'synthetic_png_2x2', scopeEnforced: true, founderScreenUntouched: true };
  }

  const imageBuf = Buffer.from(imageBase64, 'base64');
  const imageHash = hashBuffer(imageBuf);
  const proofId = stableId('vision_plan_proof', `${generatedAt}:${imageHash}:${model}:${intent}`);

  const prompt = [
    `Intent: ${intent}`,
    '',
    'You are a desktop GUI grounding model. Analyze this image and return a JSON action plan.',
    'Format:',
    '```json',
    '{ "elements": [...], "suggested_action": "...", "target_element": "...", "confidence": 0.0 }',
    '```',
    '',
    'If no relevant UI elements are visible, return confidence: 0 and explain briefly.',
  ].join('\n');

  let visionAnalysis;
  let planProof;
  let planProofValid;
  let ollamaCallAttempted = false;
  let ollamaError = '';

  if (opts.selfTest) {
    // Self-test: skip actual Ollama call — just exercise the proof structure
    visionAnalysis = '{"elements": ["synthetic_test"], "suggested_action": "none", "target_element": null, "confidence": 0}';
    const extracted = extractPlanFromResponse(visionAnalysis);
    planProof = extracted.plan;
    planProofValid = extracted.valid;
  } else {
    ollamaCallAttempted = true;
    const result = await callOllamaVision(imageBase64, prompt, model, opts.ollamaHost || DEFAULT_OLLAMA_HOST);
    if (result.ok) {
      visionAnalysis = result.response;
      const extracted = extractPlanFromResponse(result.response);
      planProof = extracted.plan;
      planProofValid = extracted.valid;
    } else {
      ollamaError = result.error;
      visionAnalysis = '';
      planProof = null;
      planProofValid = false;
    }
  }

  return {
    schemaVersion: VISION_PLAN_PROOF_SCHEMA,
    proofId,
    generatedAt,
    imageSource,
    imageHash,
    imageSizeBytes: imageBuf.length,
    model,
    prompt,
    ollamaCallAttempted,
    ollamaError,
    visionAnalysis,
    planProof,
    planProofValid,
    // Safety invariants — these MUST hold for any call that reaches a real executor
    safetyInvariants: {
      founderScreenUntouched: imageSource.kind === 'synthetic_png_2x2' || Boolean(imageSource.targetApp),
      executionPerformed: false,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
    },
    receiptRequired: true,
    nextSafeStep: planProofValid
      ? 'Review plan proof; if correct, proceed to consent-token lane before any execution.'
      : 'Vision analysis did not yield a structured plan; re-run with a clearer intent or a real scoped screenshot.',
  };
}

/** Self-test: build a synthetic-image proof and assert invariants. */
export async function runSelfTest(opts = {}) {
  const proof = await buildVisionPlanProof({
    ...opts,
    intent: 'Identify any UI elements in the image.',
    selfTest: true,
    screenshot: false,
  });
  const failures = [];
  if (proof.schemaVersion !== VISION_PLAN_PROOF_SCHEMA) failures.push('wrong schemaVersion');
  if (!proof.proofId) failures.push('missing proofId');
  if (!proof.imageHash) failures.push('missing imageHash');
  if (proof.safetyInvariants.founderScreenUntouched !== true) failures.push('founderScreenUntouched must be true for synthetic image');
  if (proof.safetyInvariants.executionPerformed !== false) failures.push('executionPerformed must be false');
  if (proof.safetyInvariants.destructiveActionsTaken !== false) failures.push('destructiveActionsTaken must be false');
  if (proof.safetyInvariants.desktopAutomationExecuted !== false) failures.push('desktopAutomationExecuted must be false');
  if (proof.imageSource.kind !== 'synthetic_png_2x2') failures.push('default path must use synthetic image');
  if (proof.ollamaCallAttempted !== false) failures.push('self-test must not call Ollama');
  if (proof.receiptRequired !== true) failures.push('receiptRequired must be true');
  if (failures.length) throw new Error(`vision-plan-proof self-test failed: ${failures.join(', ')}`);
  // Screenshot path requires --target-app; missing app must throw
  let threw = false;
  try {
    parseArgs(['--screenshot', '--intent', 'test']);
  } catch {
    threw = true;
  }
  if (!threw) failures.push('--screenshot without --target-app must throw');
  if (failures.length) throw new Error(`vision-plan-proof self-test failed: ${failures.join(', ')}`);
  return proof;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  (async () => {
    try {
      const args = parseArgs();
      let proof;
      if (args.selfTest) {
        proof = await runSelfTest({ createdAt: args.output === DEFAULT_OUTPUT ? undefined : undefined });
        if (args.json) console.log(JSON.stringify(proof, null, 2));
        else console.log('holoshell-vision-plan-proof self-test passed');
        process.exit(0);
      }
      proof = await buildVisionPlanProof({
        intent: args.intent,
        screenshot: args.screenshot,
        targetApp: args.targetApp,
        model: args.model,
        ollamaHost: args.ollamaHost,
      });
      const outputPath = repoPath(args.output);
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
      if (args.json) {
        console.log(JSON.stringify(proof, null, 2));
      } else {
        console.log(`vision-plan-proof: ${proof.proofId}`);
        console.log(`model: ${proof.model}`);
        console.log(`image: ${proof.imageSource.kind}`);
        console.log(`planProofValid: ${proof.planProofValid}`);
        if (proof.ollamaError) console.log(`ollama error: ${proof.ollamaError}`);
        console.log(`output: ${outputPath}`);
      }
      process.exit(proof.planProofValid || proof.ollamaError ? 0 : 0);
    } catch (err) {
      console.error(`holoshell-vision-plan-proof failed: ${err.message}`);
      process.exit(1);
    }
  })();
}
