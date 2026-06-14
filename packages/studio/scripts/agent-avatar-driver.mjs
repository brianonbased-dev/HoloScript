#!/usr/bin/env node
/**
 * agent-avatar-driver.mjs — an AGENT operating an avatar body.
 *
 * A standalone agent loop that decides a path and drives an embodied entity's
 * position by POSTing moves to the studio's in-process world authority
 * (/api/world-drive). The Quest viewer (ImmersiveViewer, ?agent=<entityId>)
 * reads that same state (/api/world-state) and renders a sphere that traces the
 * path — so the agent's decision becomes a moving body in the headset.
 *
 * Local by default (no prod-MCP dependency / no 500s). The simplest agent
 * "brain" is a parametric circle; swap the position function for an LLM/policy
 * and the same pipe drives any behavior.
 *
 * Usage:
 *   node scripts/agent-avatar-driver.mjs [entityId] [--radius 0.9] [--y 1.3] [--cz -1.5] [--period 1200] [--step 0.3]
 *   DRIVE_URL=http://localhost:3101/api/world-drive  (override target)
 */

const DRIVE_URL = process.env.DRIVE_URL || 'http://localhost:3101/api/world-drive';

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : dflt;
}

const ENTITY =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'agent-avatar-demo-jk1';
const RADIUS = arg('--radius', 0.9);
const CENTER_Z = arg('--cz', -1.5);
const Y = arg('--y', 1.3);
const PERIOD_MS = arg('--period', 1200);
const STEP = arg('--step', 0.3);

async function move(position) {
  try {
    const r = await fetch(DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: ENTITY, position }),
    });
    if (!r.ok) console.error(`[driver] move HTTP ${r.status}`);
  } catch (e) {
    console.error(`[driver] move error: ${e?.message ?? e}`);
  }
}

let t = 0;
console.log(
  `[driver] agent walking '${ENTITY}' in a circle (r=${RADIUS}, y=${Y}, cz=${CENTER_Z}, every ${PERIOD_MS}ms) -> ${DRIVE_URL}`
);
const timer = setInterval(async () => {
  const position = {
    x: +(RADIUS * Math.cos(t)).toFixed(3),
    y: Y,
    z: +(CENTER_Z + RADIUS * Math.sin(t)).toFixed(3),
  };
  await move(position);
  if (Math.round(t / STEP) % 8 === 0) console.log(`[driver] @ ${JSON.stringify(position)}`);
  t += STEP;
}, PERIOD_MS);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\n[driver] stopped.');
  process.exit(0);
});
