#!/usr/bin/env node
/**
 * SEC-T11 CORS allowlist sweep for Studio API routes.
 *
 * Replaces the uniform wildcard OPTIONS handler with a call to the
 * corsHeaders() helper from packages/studio/src/app/api/_lib/cors.ts.
 *
 * Strategy:
 *  - Accept a list of route paths (relative to packages/studio/src/app/api/).
 *  - For each: compute depth to _lib/cors, add the import if absent, and
 *    rewrite the OPTIONS handler block.
 *  - Skip files that already import corsHeaders from _lib/cors (idempotent).
 *  - Dry-run by default; pass --write to mutate.
 *
 * Usage:
 *   node scripts/sec-t11-cors-sweep.mjs <cluster-name> [--write]
 *
 * Clusters are defined inline below.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const API_ROOT = path.join(REPO, 'packages/studio/src/app/api');

// Cluster → relative route paths (under api/). Paths use forward slashes.
const CLUSTERS = {
  git: [
    'git/commit/route.ts',
    'git/diff/route.ts',
    'git/push/route.ts',
    'git/ship/route.ts',
    'git/status/route.ts',
    'git/branch/route.ts',
  ],
  admin_team: [
    'admin/[[...path]]/route.ts',
    'holomesh/team/[id]/route.ts',
    'holomesh/team/[id]/join/route.ts',
    'holomesh/team/[id]/heartbeat/route.ts',
    'holomesh/team/[id]/presence/route.ts',
    'holomesh/team/[id]/board/route.ts',
    'holomesh/team/[id]/board/sync/route.ts',
    'holomesh/team/[id]/board/[taskId]/route.ts',
    'holomesh/team/[id]/mode/route.ts',
    'holomesh/team/[id]/export/route.ts',
    'holomesh/team/[id]/templates/apply/route.ts',
    'holomesh/team/templates/route.ts',
    'holomesh/team/discover/route.ts',
    'holomesh/team/automate/route.ts',
  ],
  money_market: [
    'holomesh/agent/[id]/route.ts',
    'holomesh/agent/[id]/withdraw/route.ts',
    'holomesh/agent/[id]/storefront/route.ts',
    'holomesh/agent/self/contributions/route.ts',
    'holomesh/marketplace/route.ts',
    'holomesh/marketplace/sync/route.ts',
    'holomesh/marketplace/trending/route.ts',
    'holomesh/marketplace/[entryId]/rate/route.ts',
    'holomesh/marketplace/[entryId]/ratings/route.ts',
    'holomesh/transactions/route.ts',
    'holomesh/transactions/sync/route.ts',
    'holomesh/referrals/route.ts',
    'holomesh/delegate/route.ts',
    'holomesh/dashboard/route.ts',
    'holomesh/dashboard/earnings/route.ts',
    'holomesh/contribute/route.ts',
    'holomesh/entry/[id]/route.ts',
    'holomesh/entry/[id]/purchase/route.ts',
    'holomesh/feed/route.ts',
    'holomesh/knowledge/catalog/route.ts',
    'holomesh/teams/leaderboard/route.ts',
  ],
  tokens_oauth: [
    'connectors/connect/route.ts',
    'connectors/disconnect/route.ts',
    'connectors/activity/route.ts',
    'connectors/oauth/github/start/route.ts',
    'connectors/oauth/github/poll/route.ts',
    'github/access/route.ts',
    'github/repos/route.ts',
    'github/tree/route.ts',
    'github/file/route.ts',
    'github/search/route.ts',
    'github/pr/route.ts',
  ],
  daemon_compute: [
    'daemon/jobs/route.ts',
    'daemon/jobs/[id]/route.ts',
    'daemon/absorb/route.ts',
    'daemon/absorb/stream/route.ts',
    'daemon/surface/route.ts',
    'workspace/scaffold/route.ts',
    'workspace/provision/route.ts',
    'workspace/import/route.ts',
    'deploy/route.ts',
    'repl/route.ts',
    'remote/route.ts',
    'remote-session/route.ts',
    'holoclaw/route.ts',
    'holoclaw/activity/route.ts',
    'holodaemon/route.ts',
    'mcp/call/route.ts',
    'proxy/[service]/[...path]/route.ts',
  ],
  user_content: [
    'publish/route.ts',
    'share/route.ts',
    'share/[id]/route.ts',
    'versions/route.ts',
    'versions/[sceneId]/route.ts',
    'snapshots/route.ts',
    'keyframes/route.ts',
    'assets/route.ts',
    'assets/upload/route.ts',
    'assets/process/route.ts',
    'rooms/route.ts',
    'preview/route.ts',
    'export/route.ts',
    'export/v2/route.ts',
    'export/gltf/route.ts',
    'annotations/route.ts',
    'annotations/[sessionId]/route.ts',
    'critique/route.ts',
    'prompts/route.ts',
    'agents/fleet/route.ts',
    'agents/fleet/[id]/route.ts',
    'agent/route.ts',
    'social/feed/route.ts',
    'social/comments/route.ts',
    'social/follows/route.ts',
    'social/crosspost/moltbook/route.ts',
    'users/[id]/route.ts',
    'orgs/route.ts',
    'orgs/[orgId]/members/route.ts',
    'absorb/[...path]/route.ts',
    'absorb/credits/route.ts',
    'absorb/projects/route.ts',
    'absorb/projects/[id]/absorb/route.ts',
    'absorb/projects/[id]/absorb/stream/route.ts',
    'absorb/projects/[id]/knowledge/route.ts',
    'absorb/knowledge/publish/route.ts',
    'absorb/knowledge/earnings/route.ts',
    'materials/route.ts',
    'nodes/route.ts',
    'particles/route.ts',
    'physics/route.ts',
    'lod/route.ts',
    'pipeline/playground/route.ts',
    'hosting/worlds/route.ts',
    'audio/route.ts',
    'audit/route.ts',
    'studio/quickstart/route.ts',
    'studio/mcp-config/route.ts',
    'studio/capabilities/route.ts',
    'studio/oracle-boost/setup/route.ts',
    'studio/oracle-boost/status/route.ts',
    'studio/oracle-boost/telemetry/route.ts',
    'plugins/route.ts',
    'registry/route.ts',
    'registry/[packId]/route.ts',
    'debug/route.ts',
    // reconstruction/session/route.ts is excluded — already uses its own
    // allowlist helper gated on STUDIO_SCAN_SESSION_CORS_ORIGINS.
  ],
};

// Routes that are legitimately public — marked with comment, keep wildcard.
const PUBLIC_ROUTES = new Set([
  'health/route.ts',
  'docs/route.ts',
  'examples/route.ts',
  'trait-registry/route.ts',
  'plugins/node-types/route.ts',
  'shader-presets/route.ts',
  'environment-presets/route.ts',
  'audio-presets/route.ts',
  'asset-packs/route.ts',
  'polyhaven/route.ts',
  'surface/[slug]/route.ts',
  'auth/[...nextauth]/route.ts',
]);

function depthToCorsLib(routeRel) {
  // route.ts file is at api/<segments>/route.ts — segments.length == depth.
  // import is '../../' × depth + '_lib/cors'
  const parts = routeRel.split('/');
  // remove trailing 'route.ts'
  parts.pop();
  const depth = parts.length;
  return '../'.repeat(depth) + '_lib/cors';
}

// The uniform OPTIONS block regex. Matches both zero-arg and one-arg signatures
// just in case, though empirical survey says all are zero-arg.
const WILDCARD_OPTIONS_RE =
  /export function OPTIONS\(\) \{\s*return new Response\(null, \{\s*status: 204,\s*headers: \{\s*'Access-Control-Allow-Origin': '\*',\s*'Access-Control-Allow-Methods': '([^']+)',\s*'Access-Control-Allow-Headers': '([^']+)',\s*\},\s*\}\);\s*\}/;

function processFile(routeRel, { write }) {
  const absPath = path.join(API_ROOT, routeRel);
  if (!fs.existsSync(absPath)) {
    return { file: routeRel, status: 'missing' };
  }

  let src = fs.readFileSync(absPath, 'utf8');

  // Idempotency: if the file already imports corsHeaders, skip.
  if (/from ['"](\.\.\/)+_lib\/cors['"]/.test(src)) {
    return { file: routeRel, status: 'already-uses-helper' };
  }

  const m = WILDCARD_OPTIONS_RE.exec(src);
  if (!m) {
    return { file: routeRel, status: 'no-match' };
  }
  const methods = m[1];
  const allowHeaders = m[2];
  const isStandardHeaders = allowHeaders === 'Content-Type, Authorization, x-mcp-api-key';

  // Build new OPTIONS block.
  const headerOpt = isStandardHeaders
    ? `{ methods: '${methods}' }`
    : `{ methods: '${methods}', headers: '${allowHeaders}' }`;

  const newOptions = `export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, ${headerOpt}),
  });
}`;

  let newSrc = src.replace(WILDCARD_OPTIONS_RE, newOptions);

  // Add import. Insert after the last top-of-file import statement.
  const importLine = `import { corsHeaders } from '${depthToCorsLib(routeRel)}';\n`;
  // Find last `import ... from '...';` in the first ~50 lines.
  const importRe = /^import [^\n]+ from ['"][^'"]+['"];\s*$/gm;
  let lastImportEnd = -1;
  let im;
  while ((im = importRe.exec(newSrc)) !== null) {
    lastImportEnd = im.index + im[0].length;
    if (lastImportEnd > 3000) break; // only scan top of file
  }
  if (lastImportEnd === -1) {
    // No imports — insert after the first "export const maxDuration" line or at top.
    const maxDurRe = /^export const maxDuration[^\n]*\n/m;
    const mm = maxDurRe.exec(newSrc);
    if (mm) {
      newSrc = newSrc.slice(0, mm.index + mm[0].length) + '\n' + importLine + newSrc.slice(mm.index + mm[0].length);
    } else {
      newSrc = importLine + newSrc;
    }
  } else {
    newSrc = newSrc.slice(0, lastImportEnd) + '\n' + importLine.trimEnd() + newSrc.slice(lastImportEnd);
  }

  if (write) {
    fs.writeFileSync(absPath, newSrc, 'utf8');
  }
  return { file: routeRel, status: 'patched', methods };
}

function markPublic(routeRel, { write }) {
  const absPath = path.join(API_ROOT, routeRel);
  if (!fs.existsSync(absPath)) return { file: routeRel, status: 'missing' };
  let src = fs.readFileSync(absPath, 'utf8');
  // Idempotency.
  if (src.includes('PUBLIC-CORS:')) return { file: routeRel, status: 'already-marked' };
  if (!WILDCARD_OPTIONS_RE.test(src)) return { file: routeRel, status: 'no-match' };
  const newSrc = src.replace(
    WILDCARD_OPTIONS_RE,
    (full, methods) => {
      return `// PUBLIC-CORS: documented-public endpoint, intentional wildcard (SEC-T11)\n` + full;
    }
  );
  if (write) fs.writeFileSync(absPath, newSrc, 'utf8');
  return { file: routeRel, status: 'marked-public' };
}

function main() {
  const [, , clusterName, ...flags] = process.argv;
  const write = flags.includes('--write');
  if (!clusterName) {
    console.error('Usage: node sec-t11-cors-sweep.mjs <cluster> [--write]');
    console.error('Clusters:', Object.keys(CLUSTERS).join(', '), 'public');
    process.exit(1);
  }

  if (clusterName === 'public') {
    console.log(`[sec-t11] marking ${PUBLIC_ROUTES.size} public routes (write=${write})`);
    for (const rr of PUBLIC_ROUTES) {
      const res = markPublic(rr, { write });
      console.log(`  ${res.status.padEnd(18)} ${rr}`);
    }
    return;
  }

  const routes = CLUSTERS[clusterName];
  if (!routes) {
    console.error('Unknown cluster:', clusterName);
    process.exit(1);
  }
  console.log(`[sec-t11] cluster=${clusterName} routes=${routes.length} write=${write}`);
  const summary = { patched: 0, 'already-uses-helper': 0, 'no-match': 0, missing: 0 };
  for (const rr of routes) {
    const res = processFile(rr, { write });
    summary[res.status] = (summary[res.status] ?? 0) + 1;
    console.log(`  ${res.status.padEnd(20)} ${rr}${res.methods ? '  [' + res.methods + ']' : ''}`);
  }
  console.log('[sec-t11] summary:', summary);
}

main();
