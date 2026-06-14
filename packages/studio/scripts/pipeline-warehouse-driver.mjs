#!/usr/bin/env node
/**
 * pipeline-warehouse-driver.mjs — flows an ASSET down the manufacturing line.
 *
 * Drives an asset entity station-to-station along the /playground/pipeline
 * warehouse conveyor by POSTing positions to the studio world-state authority
 * (/api/world-drive). The ImmersiveViewer renders the asset as a body (?agent=)
 * tracking that state — so the asset visibly travels Generate -> Publish like a
 * product on a factory line. Loops continuously.
 *
 * This is the pipeline made spatial: each station = a pipeline stage, the moving
 * asset = a unit of work flowing through production.
 *
 * Usage:
 *   node scripts/pipeline-warehouse-driver.mjs [assetId] [--dwell 1800] [--speed 1.4]
 *   DRIVE_URL=http://localhost:3101/api/world-drive  (override target)
 */

const DRIVE_URL = process.env.DRIVE_URL || 'http://localhost:3101/api/world-drive';

try {
  new URL(DRIVE_URL);
} catch {
  console.error(`[pipeline] invalid DRIVE_URL: ${DRIVE_URL}`);
  process.exit(1);
}

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : dflt;
}

const ASSET = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'pipeline-asset-1';
const DWELL_MS = arg('--dwell', 1800); // pause at each station
const SPEED = arg('--speed', 1.4); // metres / second along the conveyor
const STEP_MS = 60; // travel update interval

// Station x-positions on the conveyor (match WAREHOUSE_SCENE), y on the belt, z fixed.
const STATIONS = [
  { name: 'Generate', x: -5 },
  { name: 'Ingest', x: -3 },
  { name: 'Optimize', x: -1 },
  { name: 'Validate', x: 1 },
  { name: 'Provenance', x: 3 },
  { name: 'Publish', x: 5 },
];
const BELT_Y = 0.5;
const BELT_Z = -4;

async function place(x) {
  try {
    const r = await fetch(DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: ASSET, position: { x: +x.toFixed(3), y: BELT_Y, z: BELT_Z } }),
    });
    if (!r.ok) console.error(`[pipeline] drive HTTP ${r.status}`);
  } catch (e) {
    console.error(`[pipeline] drive error: ${e?.message ?? e}`);
  }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function travel(fromX, toX) {
  const dist = Math.abs(toX - fromX);
  const durMs = (dist / SPEED) * 1000;
  const steps = Math.max(1, Math.round(durMs / STEP_MS));
  for (let i = 1; i <= steps; i++) {
    await place(fromX + ((toX - fromX) * i) / steps);
    await sleep(STEP_MS);
  }
}

async function run() {
  console.log(`[pipeline] flowing asset '${ASSET}' down the line -> ${DRIVE_URL}`);
  let x = STATIONS[0].x;
  await place(x);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const station of STATIONS) {
      await travel(x, station.x);
      x = station.x;
      console.log(`[pipeline] asset at ${station.name} (x=${x})`);
      await sleep(DWELL_MS);
    }
    // Finished a unit; snap back to Generate to start the next one.
    await sleep(DWELL_MS);
    await travel(x, STATIONS[0].x);
    x = STATIONS[0].x;
    console.log('[pipeline] new unit entering at Generate');
  }
}

process.on('SIGINT', () => {
  console.log('\n[pipeline] stopped.');
  process.exit(0);
});

run();
