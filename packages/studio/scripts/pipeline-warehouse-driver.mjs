#!/usr/bin/env node
/**
 * pipeline-warehouse-driver.mjs — flows an ASSET down the manufacturing line.
 *
 * The station layout is NOT hardcoded here — it is read from the NATIVE HoloScript
 * scene (examples/asset-pipeline-warehouse.holo) via @holoscript/core's parser, so
 * the .holo scene is the SINGLE SOURCE OF TRUTH. The driver fetches the scene from
 * the studio's /api/examples endpoint, parses it with HoloCompositionParser,
 * extracts every Station_* object's position, sorts them along the conveyor, and
 * flows the asset entity through them (POSTing to /api/world-drive). Move a station
 * in the .holo and the driver follows automatically — no duplicated coordinates.
 *
 * The ImmersiveViewer renders the asset as a body (?agent=) tracking world-state,
 * so it visibly travels Generate -> Publish like a product on a factory line.
 *
 * Usage:
 *   node scripts/pipeline-warehouse-driver.mjs [assetId] [--dwell 1800] [--speed 1.4] [--y 0.5]
 *   DRIVE_URL  (POST target, default http://localhost:3101/api/world-drive)
 *   SCENE_URL  (scene source, default http://localhost:3101/api/examples/asset-pipeline-warehouse)
 */

const DRIVE_URL = process.env.DRIVE_URL || 'http://localhost:3101/api/world-drive';
const SCENE_URL =
  process.env.SCENE_URL || 'http://localhost:3101/api/examples/asset-pipeline-warehouse';

for (const [label, url] of [
  ['DRIVE_URL', DRIVE_URL],
  ['SCENE_URL', SCENE_URL],
]) {
  try {
    new URL(url);
  } catch {
    console.error(`[pipeline] invalid ${label}: ${url}`);
    process.exit(1);
  }
}

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : dflt;
}

const ASSET =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'pipeline-asset-1';
const DWELL_MS = arg('--dwell', 1800); // pause at each station
const SPEED = arg('--speed', 1.4); // metres / second along the conveyor
const RIDE_Y = arg('--y', 0.5); // asset height riding on top of the conveyor belt
const STEP_MS = 60; // travel update interval

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Read an object's [x,y,z] from the parsed .holo AST (typed field or properties array). */
function readPosition(obj) {
  const asTriple = (v) =>
    Array.isArray(v) && v.length >= 3 ? [Number(v[0]), Number(v[1]), Number(v[2])] : null;
  const props = obj?.properties || [];
  const posProp = props.find((p) => p?.key === 'position');
  if (posProp) {
    const t = asTriple(posProp.value);
    if (t) return t;
  }
  const p = obj?.position;
  if (p && typeof p === 'object' && 'x' in p) return [Number(p.x), Number(p.y), Number(p.z)];
  return asTriple(p);
}

/** Fetch + parse the native scene; derive the ordered station list from it. */
async function loadStationsFromScene() {
  const core = await import('@holoscript/core');
  const HoloCompositionParser = core.HoloCompositionParser || core.default?.HoloCompositionParser;
  if (!HoloCompositionParser) throw new Error('HoloCompositionParser not exported by @holoscript/core');

  const res = await fetch(SCENE_URL);
  if (!res.ok) throw new Error(`scene HTTP ${res.status} from ${SCENE_URL}`);
  const src = await res.text();
  const parsed = new HoloCompositionParser().parse(src);
  if (!parsed?.success || !parsed.ast) {
    throw new Error(`scene parse failed: ${parsed?.errors?.[0]?.message ?? 'unknown'}`);
  }

  const stations = (parsed.ast.objects || [])
    .filter((o) => String(o?.name || '').startsWith('Station_'))
    .map((o) => ({ name: String(o.name).replace(/^Station_/, ''), pos: readPosition(o) }))
    .filter((s) => s.pos)
    .sort((a, b) => a.pos[0] - b.pos[0]);
  if (stations.length === 0) throw new Error('no Station_* objects found in scene');
  return stations;
}

async function place(x, z) {
  try {
    const r = await fetch(DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: ASSET, position: { x: +x.toFixed(3), y: RIDE_Y, z } }),
    });
    if (!r.ok) console.error(`[pipeline] drive HTTP ${r.status}`);
  } catch (e) {
    console.error(`[pipeline] drive error: ${e?.message ?? e}`);
  }
}

async function travel(fromX, toX, z) {
  const dist = Math.abs(toX - fromX);
  const durMs = (dist / SPEED) * 1000;
  const steps = Math.max(1, Math.round(durMs / STEP_MS));
  for (let i = 1; i <= steps; i++) {
    await place(fromX + ((toX - fromX) * i) / steps, z);
    await sleep(STEP_MS);
  }
}

async function run() {
  let stations;
  try {
    stations = await loadStationsFromScene();
  } catch (e) {
    console.error(`[pipeline] could not derive stations from scene: ${e?.message ?? e}`);
    process.exit(1);
  }
  const beltZ = stations[0].pos[2]; // conveyor depth, taken from the scene
  console.log(
    `[pipeline] flowing '${ASSET}' through ${stations.length} scene-derived stations ` +
      `[${stations.map((s) => s.name).join(' -> ')}] -> ${DRIVE_URL}`
  );

  let x = stations[0].pos[0];
  await place(x, beltZ);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const station of stations) {
      await travel(x, station.pos[0], beltZ);
      x = station.pos[0];
      console.log(`[pipeline] asset at ${station.name} (x=${x})`);
      await sleep(DWELL_MS);
    }
    await sleep(DWELL_MS);
    await travel(x, stations[0].pos[0], beltZ);
    x = stations[0].pos[0];
    console.log('[pipeline] new unit entering at ' + stations[0].name);
  }
}

process.on('SIGINT', () => {
  console.log('\n[pipeline] stopped.');
  process.exit(0);
});

run();
