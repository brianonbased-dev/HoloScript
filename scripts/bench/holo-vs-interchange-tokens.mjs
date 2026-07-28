#!/usr/bin/env node
// =============================================================================
// holo-vs-interchange-tokens.mjs
// =============================================================================
// Reproducible, HONEST benchmark of AUTHORING-representation token cost:
//   .holo source  vs  glTF-JSON document  vs  USDA text.
//
// Goal: substantiate OR kill the claim "HoloScript is more token-compact than
// interchange formats" — specifically the .holo-vs-glTF/USD framing.
//
// What it measures: the number of BPE tokens an agent would emit to AUTHOR a
// scene in each text representation. The agent writes .holo; glTF-JSON / USDA
// are what a "write the interchange format by hand" alternative would cost.
//
// Tokenizer: gpt-tokenizer (cl100k_base) — ONE tokenizer for ALL formats.
//   Install:  (from a scratch dir)  npm install gpt-tokenizer
//   This script auto-discovers it from C:/tmp/holobench/node_modules or the
//   HoloScript node_modules; falls back to a clearly-labeled chars/4 estimate
//   ONLY if no real tokenizer is importable (and says so in output).
//
// Compilers: PRODUCTION endpoints at mcp.holoscript.net (the same compilers the
//   MCP tools dispatch against):
//     - glTF: POST /mcp  (JSON-RPC tools/call compile_to_gltf, format:"gltf")
//             -> returns gltfJson (JSON doc) + bufferBase64 (binary buffer).
//             Tokenize the JSON DOC ONLY; record binary byte size separately.
//     - USDA: POST /api/compile  { target:"usd" }  -> returns `output` (USDA text).
//   Each scene is parsed via POST /mcp parse_holo first; parse failures are
//   reported and the scene is DROPPED (never silently skipped).
//
// Auth: x-mcp-api-key from HoloScript/.env (HOLOSCRIPT_API_KEY).
//
// Output: JSON to stdout (per-scene rows + geometric-mean ratios + verdict).
//   Run:  node scripts/bench/holo-vs-interchange-tokens.mjs
//         node scripts/bench/holo-vs-interchange-tokens.mjs --json results.json
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..'); // scripts/bench -> repo root
const EXAMPLES = join(REPO_ROOT, 'examples');
const BASE_URL = (process.env.HOLO_BENCH_BASE || 'https://mcp.holoscript.net').replace(/\/$/, '');

// --- Scene set ----------------------------------------------------------------
// The originally-suggested 10 scenes were a non-cherry-picked spread, but a
// discovery probe (scripts/bench-tmp/discover) found 7/10 FAIL the production
// parser and the remaining USD outputs were degenerate stubs (parser fails ->
// USD compiler silently emits a bare default-physics-scene with zero geometry,
// while still reporting success:true). Counting those stub tokens would be
// dishonest. So the set below is the VERIFIED-GENUINE subset: every scene here
// parses cleanly AND compiles to NON-STUB glTF (>=1 vertex) AND non-stub USDA
// (>4 prim defs). Selected from a 60-scene size-stratified sample of the 374
// example .holo files (only 11/60 were genuinely compilable). Spans 932B->17.8KB,
// 2->83 nodes, 28->5336 vertices — a real spread, not cherry-picked toward tiny.
const SCENES = [
  'economy/x402-settlement-micro-payment.holo',
  'integration/layered-architecture-demo/main.holo',
  'brian-token.holo',
  'vr-meeting-room.holo',
  'quantum-dashboard.holo',
  'platforms/unreal-scene.holo',
  'plugins/weather-plugin.holo',
  'iot/holotwin-smart-farm.holo',
  'stress-tests/drift-garden-bounce-flowfield-2026-04-28.holo',
  'domain-starters/music/music-starter.refreshed.holo',
  'general/ar-furniture-preview/furniture-catalog.holo',
];

// --- Auth --------------------------------------------------------------------
function loadApiKey() {
  if (process.env.HOLOSCRIPT_API_KEY) return process.env.HOLOSCRIPT_API_KEY;
  const envPath = join(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    const txt = readFileSync(envPath, 'utf8');
    const m = txt.match(/^\s*HOLOSCRIPT_API_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('HOLOSCRIPT_API_KEY not found in env or HoloScript/.env');
}
const API_KEY = loadApiKey();

// --- Tokenizer (one BPE tokenizer for ALL formats) ---------------------------
function loadTokenizer() {
  const candidates = [
    'C:/tmp/holobench/node_modules/gpt-tokenizer/cjs/main.js',
    join(REPO_ROOT, 'node_modules/gpt-tokenizer/cjs/main.js'),
  ];
  for (const base of [join('C:/tmp/holobench', 'package.json'), join(REPO_ROOT, 'package.json')]) {
    try {
      const req = createRequire(pathToFileURL(base));
      const mod = req('gpt-tokenizer');
      if (mod && typeof mod.encode === 'function') {
        return {
          name: 'gpt-tokenizer (cl100k_base / o200k? -> cl100k)',
          encode: (s) => mod.encode(s).length,
          real: true,
        };
      }
    } catch {
      /* try next */
    }
  }
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const req = createRequire(pathToFileURL(c));
        const mod = req(c);
        if (mod && typeof mod.encode === 'function') {
          return {
            name: 'gpt-tokenizer (cl100k_base)',
            encode: (s) => mod.encode(s).length,
            real: true,
          };
        }
      } catch {
        /* try next */
      }
    }
  }
  // Clearly-labeled fallback — only if no real tokenizer importable.
  return {
    name: 'FALLBACK chars/4 ESTIMATE (no real tokenizer found — NOT a true BPE count)',
    encode: (s) => Math.ceil(s.length / 4),
    real: false,
  };
}
const TOK = loadTokenizer();
const countTokens = (s) => TOK.encode(s);

// --- HTTP helpers ------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries on 401/429 — the /mcp route rate-limits bursts (verified: the same
// valid key 200s after a short backoff). Throttle between every call too.
async function postJson(path, body, tries = 5) {
  let last = { status: 0, text: '' };
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'x-mcp-api-key': API_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    last = { status: res.status, text };
    if (res.status === 200) return last;
    // The /mcp route burst-rate-limits with a 401 "Valid token required" (same
    // valid key 200s after cooldown). Back off generously: 6s, 12s, 18s, 24s, 30s.
    if (res.status === 401 || res.status === 429) {
      await sleep(6000 * (i + 1));
      continue;
    }
    return last;
  }
  return last;
}

async function mcpCall(name, args) {
  const { status, text } = await postJson('/mcp', {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  if (status !== 200) throw new Error(`MCP ${name} HTTP ${status}: ${text.slice(0, 200)}`);
  // Endpoint may return raw JSON or SSE-wrapped JSON; handle both.
  let payload = text.trim();
  if (payload.startsWith('event:') || payload.startsWith('data:')) {
    const dataLine = payload.split('\n').find((l) => l.startsWith('data:'));
    payload = dataLine ? dataLine.slice(5).trim() : payload;
  }
  const rpc = JSON.parse(payload);
  if (rpc.error)
    throw new Error(`MCP ${name} rpc error: ${JSON.stringify(rpc.error).slice(0, 200)}`);
  const txt = rpc.result?.content?.[0]?.text;
  return txt ? JSON.parse(txt) : rpc.result;
}

// --- Per-format extraction ---------------------------------------------------
async function parseHolo(code) {
  const r = await mcpCall('parse_holo', { code });
  const errs = r?.errors || r?.composition?.errors || [];
  const ok = r?.success === true && (!errs || errs.length === 0);
  return { ok, errors: errs };
}

async function compileGltf(code) {
  const r = await mcpCall('compile_to_gltf', { code, format: 'gltf' });
  if (!r?.success || !r?.gltfJson) throw new Error('gltf compile returned no gltfJson');
  const verts = r.stats?.totalVertices ?? 0;
  if (verts <= 0) throw new Error('gltf compile produced a STUB (0 vertices) — not counted');
  const jsonText = JSON.stringify(r.gltfJson, null, 2); // pretty == what an author would read/write
  const binBytes = r.bufferBase64 ? Buffer.from(r.bufferBase64, 'base64').length : 0;
  return { jsonText, binBytes, stats: r.stats || null };
}

async function compileUsd(code) {
  // USDA goes through the REST exporter at /api/compile (target: usd).
  const { status, text } = await postJson('/api/compile', { code, target: 'usd' });
  if (status !== 200) throw new Error(`usd compile HTTP ${status}: ${text.slice(0, 200)}`);
  const r = JSON.parse(text);
  const usda = r.output || r.result || r.usda;
  if (!usda || typeof usda !== 'string') throw new Error('usd compile returned no USDA text');
  // Non-stub guard: when parse fails, the USD compiler still returns success:true
  // but emits only a bare default-physics scene (<=4 prim defs, no geometry).
  const defs = (usda.match(/\bdef /g) || []).length;
  if (defs <= 4) throw new Error(`usd compile produced a STUB (${defs} prim defs) — not counted`);
  return { usda };
}

// --- Geometric mean ----------------------------------------------------------
function geomean(arr) {
  const vals = arr.filter((x) => Number.isFinite(x) && x > 0);
  if (!vals.length) return null;
  const logSum = vals.reduce((a, x) => a + Math.log(x), 0);
  return Math.exp(logSum / vals.length);
}

// --- Main --------------------------------------------------------------------
async function main() {
  const rows = [];
  const dropped = [];

  for (const rel of SCENES) {
    const abs = join(EXAMPLES, rel);
    if (!existsSync(abs)) {
      dropped.push({ scene: rel, reason: 'file not found' });
      continue;
    }
    const code = readFileSync(abs, 'utf8');
    const holo_tokens = countTokens(code);

    // 1. Parse gate (drop on failure — never silent skip).
    let parse;
    await sleep(2500);
    try {
      parse = await parseHolo(code);
    } catch (e) {
      dropped.push({ scene: rel, reason: `parse_holo threw: ${e.message}` });
      continue;
    }
    if (!parse.ok) {
      dropped.push({
        scene: rel,
        reason: 'parse FAILED',
        holo_tokens,
        errors: (parse.errors || []).slice(0, 3).map((e) => e.message || JSON.stringify(e)),
      });
      continue;
    }

    // 2. Compile to both targets. The /mcp route (parse + gltf) burst-limits
    // hard, so glTF gets generous spacing; USD is on a separate /api/compile
    // limit and tolerates tighter pacing.
    let gltf, usd;
    const errs = {};
    await sleep(8000);
    try {
      gltf = await compileGltf(code);
    } catch (e) {
      errs.gltf = e.message;
    }
    await sleep(2500);
    try {
      usd = await compileUsd(code);
    } catch (e) {
      errs.usd = e.message;
    }
    await sleep(2500);

    if (!gltf && !usd) {
      dropped.push({ scene: rel, reason: 'both compiles failed', holo_tokens, errors: errs });
      continue;
    }

    const gltf_json_tokens = gltf ? countTokens(gltf.jsonText) : null;
    const gltf_bin_bytes = gltf ? gltf.binBytes : null;
    const usda_tokens = usd ? countTokens(usd.usda) : null;

    rows.push({
      scene: rel,
      holo_bytes: Buffer.byteLength(code, 'utf8'),
      holo_tokens,
      gltf_json_tokens,
      gltf_bin_bytes,
      usda_tokens,
      ratio_gltf: gltf_json_tokens ? +(gltf_json_tokens / holo_tokens).toFixed(3) : null,
      ratio_usda: usda_tokens ? +(usda_tokens / holo_tokens).toFixed(3) : null,
      partial_errors: Object.keys(errs).length ? errs : undefined,
    });
  }

  const gmGltf = geomean(rows.map((r) => r.ratio_gltf));
  const gmUsda = geomean(rows.map((r) => r.ratio_usda));

  // Kill criterion: .holo must be >= 2x more compact than glTF-JSON (gmean) to
  // SUBSTANTIATE the glTF-compactness claim. ratio_gltf = gltf/holo, so
  // "2x more compact" means gmean(ratio_gltf) >= 2.0.
  const KILL_THRESHOLD = 2.0;
  let verdict;
  if (gmGltf == null) verdict = 'INDETERMINATE — no glTF data';
  else if (gmGltf >= KILL_THRESHOLD)
    verdict = `glTF-compactness claim SUBSTANTIATED (gmean ratio_gltf ${gmGltf.toFixed(2)}x >= ${KILL_THRESHOLD}x)`;
  else
    verdict = `glTF-compactness claim KILLED (gmean ratio_gltf ${gmGltf.toFixed(2)}x < ${KILL_THRESHOLD}x)`;

  const result = {
    meta: {
      generatedAt: new Date().toISOString(),
      tokenizer: TOK.name,
      tokenizer_is_real_bpe: TOK.real,
      base_url: BASE_URL,
      kill_threshold_gltf: KILL_THRESHOLD,
      measures:
        'AUTHORING-representation token cost (tokens an agent emits to author a scene as text)',
      framing_note:
        'glTF-JSON UNDERSTATES all-as-text size (geometry hidden in binary buffer); USDA inlines geometry as text and is the fairer everything-as-text comparator.',
    },
    rows,
    dropped,
    geomean: {
      ratio_gltf: gmGltf != null ? +gmGltf.toFixed(3) : null,
      ratio_usda: gmUsda != null ? +gmUsda.toFixed(3) : null,
      n_scenes: rows.length,
    },
    verdict,
  };

  const outFlag = process.argv.indexOf('--json');
  console.log(JSON.stringify(result, null, 2));
  if (outFlag !== -1 && process.argv[outFlag + 1]) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.argv[outFlag + 1], JSON.stringify(result, null, 2));
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
