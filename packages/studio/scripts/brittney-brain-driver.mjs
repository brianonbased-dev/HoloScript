#!/usr/bin/env node
/**
 * brittney-brain-driver.mjs — embodies Brittney from her NATIVE HoloScript files.
 *
 * Three-format model (F.120) in practice:
 *   - .holo (scene) → examples/playground-brittney.holo : the room + Waypoint_* pads
 *     (her PATH). Parsed with HoloCompositionParser.
 *   - .hsplus (brain) → examples/agents/brittney-playground.hsplus : her IDENTITY +
 *     behavior params (entityId/speed/dwellMs/mood, F.119). Parsed with
 *     HoloScriptPlusParser.
 *   - world-state loop : her params + path drive an entity-generic AgentAvatar
 *     (D.094) via POST /api/world-drive; the ImmersiveViewer renders her orb body.
 *
 * Nothing about her motion is hardcoded here — path comes from the scene, params from
 * her brain. Move a pad / edit her brain and she follows. The body is a placeholder
 * orb today; the AAA avatar (brittney-avatar.holo) swaps into the same slot later.
 *
 * Usage: node packages/studio/scripts/brittney-brain-driver.mjs [--y 1.2]
 *   DRIVE_URL  (POST target, default http://localhost:3101/api/world-drive)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(SCRIPT_DIR, '..', '..', '..', 'examples');
const DRIVE_URL = process.env.DRIVE_URL || 'https://holoscript.studio/api/world-drive';
const WORLD_STATE_TOKEN = process.env.WORLD_STATE_TOKEN || '';
try {
  new URL(DRIVE_URL);
} catch {
  console.error(`[brittney] invalid DRIVE_URL: ${DRIVE_URL}`);
  process.exit(1);
}
function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : dflt;
}
const RIDE_Y = arg('--y', 1.2); // presence (head) height
const STEP_MS = 60;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Find a value for `key` whether stored as a flat prop (node[key]) or a {key,value} node. */
function findValue(node, key, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
  seen.add(node);
  if (node.key === key && 'value' in node && typeof node.value !== 'object') return node.value;
  if (Object.prototype.hasOwnProperty.call(node, key) && typeof node[key] !== 'object') {
    return node[key];
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') {
      const r = findValue(v, key, seen);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function readPosition(obj) {
  const triple = (v) =>
    Array.isArray(v) && v.length >= 3 ? [Number(v[0]), Number(v[1]), Number(v[2])] : null;
  const pp = (obj?.properties || []).find((p) => p?.key === 'position');
  if (pp) {
    const t = triple(pp.value);
    if (t) return t;
  }
  const p = obj?.position;
  if (p && typeof p === 'object' && 'x' in p) return [Number(p.x), Number(p.y), Number(p.z)];
  return triple(p);
}

async function load() {
  const core = await import('@holoscript/core');
  const HoloCompositionParser = core.HoloCompositionParser || core.default?.HoloCompositionParser;
  const HoloScriptPlusParser = core.HoloScriptPlusParser || core.default?.HoloScriptPlusParser;
  if (!HoloCompositionParser)
    throw new Error('HoloCompositionParser not exported by @holoscript/core');

  // PATH from the .holo scene (single source of truth).
  const sceneSrc = readFileSync(join(EXAMPLES, 'playground-brittney.holo'), 'utf8');
  const scene = new HoloCompositionParser().parse(sceneSrc);
  if (!scene?.success || !scene.ast) throw new Error('scene parse failed');
  const waypoints = (scene.ast.objects || [])
    .filter((o) => String(o?.name || '').startsWith('Waypoint_'))
    .map((o) => ({ name: String(o.name), pos: readPosition(o) }))
    .filter((w) => w.pos)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (waypoints.length === 0) throw new Error('no Waypoint_* in scene');

  // PARAMS from her .hsplus brain (identity + behavior).
  const params = {
    entityId: 'brittney',
    speed: 1.1,
    dwellMs: 1600,
    mood: 'friendly',
    model: 'flagship',
  };
  if (HoloScriptPlusParser) {
    try {
      const brainSrc = readFileSync(join(EXAMPLES, 'agents', 'brittney-playground.hsplus'), 'utf8');
      const brain = new HoloScriptPlusParser().parse(brainSrc);
      const ast = brain?.ast;
      const eid = findValue(ast, 'entityId');
      if (typeof eid === 'string') params.entityId = eid;
      const spd = findValue(ast, 'speed');
      if (typeof spd === 'number') params.speed = spd;
      const dw = findValue(ast, 'dwellMs');
      if (typeof dw === 'number') params.dwellMs = dw;
      const md = findValue(ast, 'mood');
      if (typeof md === 'string') params.mood = md;
      const model = findValue(ast, 'model');
      if (typeof model === 'string') params.model = model;
    } catch (e) {
      console.warn(`[brittney] brain parse skipped (${e?.message ?? e}); using defaults`);
    }
  } else {
    console.warn('[brittney] HoloScriptPlusParser unavailable; using default brain params');
  }
  return { waypoints, params };
}

async function place(entityId, x, z) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (WORLD_STATE_TOKEN) headers['x-world-state-token'] = WORLD_STATE_TOKEN;
    const r = await fetch(DRIVE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entityId,
        position: { x: +x.toFixed(3), y: RIDE_Y, z: +z.toFixed(3) },
      }),
    });
    if (!r.ok) console.error(`[brittney] drive HTTP ${r.status}`);
  } catch (e) {
    console.error(`[brittney] drive error: ${e?.message ?? e}`);
  }
}

async function travel(entityId, from, to, speed) {
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const steps = Math.max(1, Math.round(((dist / speed) * 1000) / STEP_MS));
  for (let i = 1; i <= steps; i++) {
    await place(
      entityId,
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[2] + ((to[2] - from[2]) * i) / steps
    );
    await sleep(STEP_MS);
  }
}

async function run() {
  let cfg;
  try {
    cfg = await load();
  } catch (e) {
    console.error(`[brittney] could not load native scene/brain: ${e?.message ?? e}`);
    process.exit(1);
  }
  const { waypoints, params } = cfg;
  console.log(
    `[brittney] embodying '${params.entityId}' (model=${params.model}, mood=${params.mood}, ` +
      `speed=${params.speed}) over ${waypoints.length} scene waypoints -> ${DRIVE_URL}`
  );
  let cur = waypoints[0].pos;
  await place(params.entityId, cur[0], cur[2]);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const wp of waypoints) {
      await travel(params.entityId, cur, wp.pos, params.speed);
      cur = wp.pos;
      await sleep(params.dwellMs);
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n[brittney] stopped.');
  process.exit(0);
});

run();
