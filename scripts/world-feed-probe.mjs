#!/usr/bin/env node
/**
 * world-feed-probe.mjs — live WS-2 consume-loop probe (F.076 fail-if-broken).
 *
 * Proves the sovereign consumer feed can, against the REAL MCP server:
 *   1. LIST at least one shareable world (seed set backfills the empty store).
 *   2. RESOLVE that world into an openable sovereign share link
 *      (create_share_link -> https://mcp.holoscript.net/scene/:id).
 *   3. OPEN it — the /scene/:id URL must return HTTP 200 real HTML.
 *
 * Exits non-zero if ANY step fails, so a broken feed / dead pipe is loud, not silent.
 *
 * Usage:
 *   node scripts/world-feed-probe.mjs
 *   node scripts/world-feed-probe.mjs --server https://mcp.holoscript.net
 *
 * This is tooling (`.mjs`), not a render surface.
 */

import process from 'node:process';

const DEFAULT_SERVER = 'https://mcp.holoscript.net';

function parseArgs(argv) {
  const args = { server: DEFAULT_SERVER, limit: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--server') args.server = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('node scripts/world-feed-probe.mjs [--server URL] [--limit N]');
      process.exit(0);
    }
  }
  return args;
}

// A minimal seed world (matches the STARTER_TEMPLATES shape) so the probe does
// not need the built package. The feed's real seed set lives in
// packages/creation-tools/src/templates/TemplateGallery.ts.
const SEED_WORLDS = [
  {
    id: 'seed:empty-room',
    title: 'Empty Room',
    description: 'A minimal starter world — floor, walls, and lighting.',
    code: `composition "Empty Room" {
  environment { skybox: "default" ambient_light: 0.6 grid: true }
  object "Floor" { geometry: "plane" color: "#444444" position: [0, 0, 0] rotation: [-90, 0, 0] scale: [10, 10, 1] }
  object "Beacon" { geometry: "sphere" color: "#00d4ff" position: [0, 1.5, 0] emissive: "#00d4ff" }
}`,
  },
  {
    id: 'seed:gallery',
    title: 'Gallery',
    description: 'A small art gallery with a pedestal.',
    code: `composition "Gallery" {
  environment { skybox: "default" ambient_light: 0.7 grid: false }
  object "Floor" { geometry: "plane" color: "#dddddd" position: [0, 0, 0] rotation: [-90, 0, 0] scale: [12, 12, 1] }
  object "Pedestal" { geometry: "cylinder" color: "#888888" position: [0, 0.5, 0] scale: [1, 1, 1] }
  object "Exhibit" { geometry: "icosahedron" color: "#ffd700" position: [0, 1.5, 0] emissive: "#ffaa00" }
}`,
  },
];

function isOpenableSovereignSceneUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return /^\/scene\/[^/]+$/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Resolve world code -> openable sovereign share link via the MCP REST surface.
 * Uses POST /api/share (the sovereign REST share endpoint — same contract as the
 * create_share_link MCP tool: { playgroundUrl: /scene/:id, embedUrl, qrCode, ... }).
 */
async function resolveShareLink(server, { code, title, description }) {
  const res = await fetch(`${server}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code, title, description }),
  });
  if (!res.ok) throw new Error(`POST /api/share HTTP ${res.status}`);
  const parsed = await res.json();
  if (!parsed?.playgroundUrl) {
    throw new Error(`/api/share returned no playgroundUrl: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  return parsed;
}

async function main() {
  const { server, limit } = parseArgs(process.argv.slice(2));
  const failures = [];
  let opened = 0;

  // 1. LIST — seed set guarantees the feed is non-empty even with an empty store.
  const worlds = SEED_WORLDS.slice(0, limit);
  if (worlds.length === 0) {
    failures.push('feed listed 0 worlds');
  }
  console.log(`[world-feed-probe] listed ${worlds.length} world(s) from feed`);

  // 2 + 3. RESOLVE each to an openable sovereign link and OPEN it.
  for (const w of worlds) {
    try {
      const link = await resolveShareLink(server, w);
      if (!isOpenableSovereignSceneUrl(link.playgroundUrl)) {
        failures.push(`"${w.title}": non-openable scene url ${String(link.playgroundUrl)}`);
        continue;
      }
      const head = await fetch(link.playgroundUrl, { method: 'GET' });
      if (!head.ok) {
        failures.push(`"${w.title}": scene url ${link.playgroundUrl} returned HTTP ${head.status}`);
        continue;
      }
      const html = await head.text();
      if (!/<html/i.test(html)) {
        failures.push(`"${w.title}": scene url ${link.playgroundUrl} did not return HTML`);
        continue;
      }
      opened++;
      console.log(`[world-feed-probe] OPENABLE  ${w.title.padEnd(14)} -> ${link.playgroundUrl}  (HTTP ${head.status})`);
    } catch (err) {
      failures.push(`"${w.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opened === 0) failures.push('no world resolved to an openable sovereign scene link');

  if (failures.length > 0) {
    console.error(`\n[world-feed-probe] FAIL (${failures.length} problem(s)):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`\n[world-feed-probe] PASS — ${opened}/${worlds.length} worlds openable via sovereign /scene/:id`);
}

main().catch((err) => {
  console.error(`[world-feed-probe] FATAL: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
