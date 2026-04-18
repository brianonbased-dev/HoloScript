#!/usr/bin/env node
/**
 * End-to-end integration test for the Quest-3 iPhone-moment pipeline.
 *
 * Simulates the full happy path without a headset:
 *   1. POST /api/voice-to-holo with a canned utterance
 *   2. Validate returned HoloScript against the grammar allow-list
 *   3. POST /api/share with the generated source
 *   4. GET /w/<id> and confirm the HTML contains the scene name
 *
 * Reports per-step latency so we can see whether the p50 budget holds.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node research/quest3-iphone-moment/e2e-voice-to-share.mjs
 *   # defaults to http://localhost:3100; override with BASE_URL
 *
 * Exit codes:
 *   0 — full pipeline passed
 *   1 — one or more stages failed; see log output
 *
 * See:
 *   research/quest3-iphone-moment/README.md
 *   research/quest3-iphone-moment/b-voice-intent-grammar.md
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const UTTERANCE =
  process.argv.slice(2).join(' ') ||
  'Three torus rings of different colors spinning around a gold cube';

const ALLOWED_TRAITS = new Set([
  'grabbable',
  'networked',
  'glowing',
  'spinning',
  'floating',
  'billboard',
  'transparent',
  'collidable',
  'physics',
  'clickable',
  'pulse',
  'proximity',
]);

const log = (label, detail = '') => {
  const now = new Date().toISOString().slice(11, 23);
  process.stdout.write(`[${now}] ${label}${detail ? ' — ' + detail : ''}\n`);
};

const fail = (msg, detail) => {
  log(`FAIL ${msg}`, detail ?? '');
  process.exit(1);
};

async function step(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const dt = Date.now() - t0;
    log(`OK   ${label}`, `${dt}ms`);
    return { result, dt };
  } catch (err) {
    const dt = Date.now() - t0;
    fail(label, `${dt}ms: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function validateHolo(source) {
  const issues = [];
  const cleaned = source.trim();
  if (!/^composition\s+"[^"]+"\s*\{/.test(cleaned)) issues.push('no `composition "<name>" {` header');
  if (!cleaned.endsWith('}')) issues.push('no trailing `}`');
  const objects = [...cleaned.matchAll(/\bobject\s+[a-z_][a-z0-9_]*\s*\{/gi)];
  if (objects.length === 0) issues.push('no object blocks');
  const traits = [...cleaned.matchAll(/@([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  const unknown = traits.filter((t) => !ALLOWED_TRAITS.has(t));
  if (unknown.length > 0) issues.push(`unknown traits: ${[...new Set(unknown)].join(', ')}`);
  return { ok: issues.length === 0, issues, objectCount: objects.length, traitCount: traits.length };
}

async function main() {
  log('=== HoloScript Quest 3 iPhone-moment E2E ===');
  log('BASE_URL', BASE_URL);
  log('utterance', UTTERANCE);
  log('');

  const pipelineT0 = Date.now();

  // 1. Voice -> HoloScript
  const { result: voiceResp } = await step('voice-to-holo', async () => {
    const res = await fetch(`${BASE_URL}/api/voice-to-holo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utterance: UTTERANCE }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      throw new Error(`HTTP ${res.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
    }
    return body;
  });

  log('     model latency', `${voiceResp.modelLatencyMs}ms`);
  log('     retried?', voiceResp.retried ? 'yes' : 'no');
  log('');

  // 2. Validate grammar
  const { result: val } = await step('validate grammar', async () => {
    const v = validateHolo(voiceResp.holoSource);
    if (!v.ok) throw new Error(v.issues.join('; '));
    return v;
  });
  log('     objects', `${val.objectCount}`);
  log('     traits', `${val.traitCount}`);
  log('');

  // 3. Publish
  const { result: share } = await step('publish /api/share', async () => {
    const res = await fetch(`${BASE_URL}/api/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E test scene',
        code: voiceResp.holoSource,
        author: 'e2e-bot',
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.id) {
      throw new Error(`HTTP ${res.status}: ${body.error ?? JSON.stringify(body).slice(0, 200)}`);
    }
    return body;
  });
  log('     share id', share.id);
  log('     share url', share.url ?? `${BASE_URL}/w/${share.id}`);
  log('');

  // 4. Fetch share page (short URL)
  await step('fetch /w/<id>', async () => {
    const res = await fetch(`${BASE_URL}/w/${share.id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Sanity check: page should contain "E2E test scene"
    if (!html.includes('E2E test scene')) {
      throw new Error('share page missing scene name in HTML');
    }
    return { size: html.length };
  });

  const totalDt = Date.now() - pipelineT0;
  log('');
  log('=== PASS ===', `total: ${totalDt}ms`);
  log('Generated scene:');
  log('');
  for (const line of voiceResp.holoSource.split('\n')) process.stdout.write(`  ${line}\n`);
  log('');
  log('Open in Quest browser', `${BASE_URL}/w/${share.id}`);
}

main().catch((err) => {
  log('CRASH', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
