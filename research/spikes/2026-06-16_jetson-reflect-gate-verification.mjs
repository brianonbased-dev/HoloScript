#!/usr/bin/env node
/**
 * Live verification of the Phase 2.1 reflect cognitive gate (HS 4d92152d6) on REAL
 * hardware: does qwen3:4b-instruct on the Jetson actually self-evaluate an artifact
 * and emit a parseable VERDICT? The runner's reflect LOGIC is unit-tested (166/0);
 * this proves the MODEL behavior the gate depends on — the only unproven piece.
 *
 * Uses the EXACT prompt shape + verdict regex from packages/holoscript-agent/src/runner.ts.
 * OMITs the think param (W.740/W.741 — think:false breaks the format mask; instruct
 * variant needs neither). A working gate must PASS a valid .holo and FAIL a non-artifact.
 *
 * Run:  node research/spikes/2026-06-16_jetson-reflect-gate-verification.mjs
 */

const ENDPOINT = (process.env.JETSON_OLLAMA_URL || 'http://holojetson.local:11434').replace(/\/$/, '');
const MODEL = process.env.JETSON_MODEL || 'qwen3:4b-instruct';
const CRITERIA = 'correctness, completeness, and valid HoloScript syntax'; // jetson brain's reflect criteria

const VALID_HOLO = `#version 6.0.0
scene "ReflectSmoke" {
  light "Sun" { type: "directional" intensity: 1.0 direction: [0, -1, 0] }
  mesh "Ground" { geometry: "plane" scale: [10, 1, 10] position: [0, 0, 0] }
  mesh "Box"    { geometry: "box"   scale: [1, 1, 1]   position: [0, 0.5, 0] }
}`;

const BROKEN_ARTIFACT = `I think the scene needs a light and a couple of boxes, but I'm not certain
of the exact HoloScript syntax. TODO: write the actual .holo file later once I look it up.`;

// Mirror runner.ts reflect prompt exactly.
function reflectMessages(artifact) {
  return [
    { role: 'system', content: 'You are a strict reviewer. Evaluate the work against the criteria; do not rewrite it.' },
    {
      role: 'user',
      content:
        `Reflect on the artifact produced for this task. Evaluate it for: ${CRITERIA}.\n\n` +
        `--- artifact / final response ---\n${artifact.slice(0, 4000)}\n--- end ---\n\n` +
        `Give a one-line reason, then end with exactly "VERDICT: PASS" or "VERDICT: FAIL".`,
    },
  ];
}

async function reflect(label, artifact, expected) {
  const t0 = Date.now();
  const r = await fetch(`${ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // NOTE: no `think` param (W.740/W.741). num_ctx default; low temp for a stable verdict.
    body: JSON.stringify({ model: MODEL, stream: false, messages: reflectMessages(artifact), options: { temperature: 0.1, num_predict: 512 } }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const content = j.message?.content ?? '';
  const m = /VERDICT:\s*(PASS|FAIL)/i.exec(content);
  const verdict = m ? m[1].toUpperCase() : 'UNPARSEABLE(=PASS)';
  const reason = content.replace(/VERDICT:\s*(PASS|FAIL)/i, '').trim().replace(/\s+/g, ' ').slice(0, 160);
  const ok = verdict.startsWith(expected);
  console.log(`\n[${label}] expected=${expected}  →  verdict=${verdict}  ${ok ? '✅' : '❌ MISMATCH'}  (${((Date.now() - t0) / 1000).toFixed(1)}s, ${j.eval_count ?? '?'} tok)`);
  console.log(`  reason: ${reason}`);
  return { label, verdict, expected, ok };
}

(async () => {
  console.log(`reflect-gate verification — ${MODEL} @ ${ENDPOINT}\ncriteria: "${CRITERIA}"`);
  const results = [];
  results.push(await reflect('valid .holo', VALID_HOLO, 'PASS'));
  results.push(await reflect('broken/non-artifact', BROKEN_ARTIFACT, 'FAIL'));
  const discriminates = results[0].verdict === 'PASS' && results[1].verdict === 'FAIL';
  console.log(`\n=== ${discriminates ? '✅ GATE DISCRIMINATES' : '⚠ gate did NOT cleanly discriminate'} — valid→${results[0].verdict}, broken→${results[1].verdict} ===`);
  process.exit(discriminates ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
