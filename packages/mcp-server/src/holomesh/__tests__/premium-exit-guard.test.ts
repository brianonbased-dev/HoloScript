/**
 * GUARD AGAINST THE NEXT EXIT (doors audit 2026-09-15, rework of #299).
 *
 * The behavioural tests (premium-exits.test.ts here, and the premium-exits
 * tests in Studio and the absorb MCP) prove the exits we know about. They
 * cannot see a NEW exit. This test can: it scans the source of the three
 * servers that hand out knowledge rows (HoloMesh in mcp-server, Studio, and
 * the absorb MCP) for every place that reads knowledge rows, and compares
 * what it finds with a reviewed list, file by file and count by count.
 *
 * A new read anywhere (a new queryKnowledge call, a new orchestrator query, a
 * new team-mirror read, a new relay of HoloMesh answers, a new marketplace or
 * cache read) changes a count, and this test goes red naming the file and the
 * lines. To make it green, route the new read through the premium gate, then
 * add or update its row below naming that gate. A row whose gate symbol is not
 * in the file (or in the file it goes through) fails too, so the list cannot
 * claim a gate that is not there. A row marked `noText` is a reviewed claim
 * that the site hands out no entry text (counts, ids, writes, definitions,
 * browser calls to a Studio route that is itself listed).
 *
 * It also checks that the three copies of premium-view.ts, the one teaser
 * rule, are byte-identical.
 *
 * PREMIUM_EXIT_GUARD_ROOT points the scan at another checkout (used to prove
 * the guard goes red on a planted ungated read in a scratch copy).
 *
 * Comments are not counted, and a gate named only in a comment is not a gate
 * (task v7c1): see withoutComments below.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ts from 'typescript';

const ROOT = process.env.PREMIUM_EXIT_GUARD_ROOT
  ? path.resolve(process.env.PREMIUM_EXIT_GUARD_ROOT)
  : path.resolve(__dirname, '../../../../..');

const SERVERS = [
  'packages/mcp-server/src',
  'packages/studio/src',
  'packages/absorb-service/src',
  'services/absorb-service/src',
];
/** Trees that CALL HoloMesh over HTTP (in mcp-server these paths are the routes themselves). */
const CALLERS = ['packages/studio/src', 'packages/absorb-service/src', 'services/absorb-service/src'];

const READS: Record<string, { re: RegExp; trees: string[]; what: string }> = {
  'orchestrator-query': {
    re: /\bqueryKnowledge\s*(<[^>]*>)?\s*\(|\/knowledge\/query\b/g,
    trees: SERVERS,
    what: 'a knowledge query to the orchestrator (queryKnowledge or POST /knowledge/query)',
  },
  'knowledge-mirror': {
    re: /\.knowledge\b(?![\w$])/g,
    trees: SERVERS,
    what: 'a read of a team knowledge mirror (team.knowledge) or a payload knowledge list',
  },
  'marketplace-listing': {
    re: /\b(activeListings|getListing|sellKnowledge)\s*\(/g,
    trees: SERVERS,
    what: 'a marketplace listing read or write (the listing holds the public preview)',
  },
  'entry-lookup': {
    re: /\b(findKnowledgeEntryById|findKnowledgeEntryInTeamMirrors|mergeTeamKnowledgeWithOrchestrator)\s*\(/g,
    trees: SERVERS,
    what: 'a knowledge entry lookup',
  },
  'knowledge-table': {
    re: /\b(holomeshKnowledgeEntries|knowledgeEntries)\b/g,
    trees: SERVERS,
    what: 'a knowledge database table (Studio cache or absorb store)',
  },
  'holomesh-relay': {
    re: /\b(proxyHoloMesh|fetchHoloMeshJson)\s*(<[^>]*>)?\s*\(/g,
    trees: SERVERS,
    what: "a Studio relay of HoloMesh answers under Studio's server key",
  },
  'holomesh-knowledge-http': {
    re: /\/api\/holomesh\/(search|feed|entry\/|marketplace|onboard|quickstart|leaderboard|showcase|knowledge|team\/[^'"`\s]*\/knowledge|agent\/[^'"`\s]*\/(knowledge|storefront|contributions))/g,
    trees: CALLERS,
    what: 'an HTTP call to a HoloMesh path that returns knowledge rows',
  },
  'knowledge-tool': {
    re: /['"`]knowledge_query['"`]/g,
    trees: SERVERS,
    what: 'the knowledge_query tool',
  },
  'entry-provider': {
    re: /\bentryProvider\s*\(/g,
    trees: SERVERS,
    what: 'the HoloMesh search entry provider',
  },
  'mind-memory': {
    re: /\bloadMemory\s*\(/g,
    trees: SERVERS,
    what: 'a portable-mind memory load (team knowledge read with a seat key)',
  },
};

type Gate =
  | { symbol: string; via?: string } // the gate symbol, in this file or in `via`
  | { noText: string }; // reviewed: no entry text leaves through this site

interface Site {
  file: string;
  read: keyof typeof READS;
  count: number;
  gate: Gate;
}

const PROXY = 'packages/studio/src/lib/holomesh-proxy.ts';
const viaProxy: Gate = { symbol: 'hidePremiumRowsDeep', via: PROXY };
const browser: Gate = {
  noText: 'browser code calling a Studio API route; that route is the exit and is listed itself',
};

const M = 'packages/mcp-server/src/';
const S = 'packages/studio/src/';
const A = 'packages/absorb-service/src/';

/** Every reviewed place that reads knowledge rows, and what gates it. */
const SITES: Site[] = [
  // ── HoloMesh (mcp-server) ──
  { file: `${M}absorb-provenance-tools.ts`, read: 'orchestrator-query', count: 1, gate: { noText: 'hashes ids, provenance hashes and dates into a snapshot id; no text leaves' } },
  { file: `${M}audit-tools.ts`, read: 'knowledge-table', count: 1, gate: { noText: 'reads an entry count from a status payload' } },
  { file: `${M}founder-handler.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'hidePremiumTextIfPremium' } },
  { file: `${M}holomesh/agent/holomesh-daemon-actions.ts`, read: 'orchestrator-query', count: 2, gate: { symbol: 'entitledSearchRows' } },
  { file: `${M}holomesh/agent/team-coordinator.ts`, read: 'knowledge-mirror', count: 2, gate: { noText: 'insights the team agents produced this cycle, not store rows' } },
  { file: `${M}holomesh/agent/team-coordinator.ts`, read: 'knowledge-table', count: 4, gate: { noText: 'insights the team agents produced this cycle, not store rows' } },
  { file: `${M}holomesh/board-tools.ts`, read: 'knowledge-mirror', count: 1, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/entry-lookup.ts`, read: 'entry-lookup', count: 4, gate: { symbol: 'entryForViewer' } },
  { file: `${M}holomesh/entry-lookup.ts`, read: 'knowledge-mirror', count: 9, gate: { symbol: 'entryForViewer' } },
  { file: `${M}holomesh/entry-lookup.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'entryForViewer' } },
  { file: `${M}holomesh/holomesh-tools.ts`, read: 'orchestrator-query', count: 4, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/orchestrator-client.ts`, read: 'orchestrator-query', count: 3, gate: { noText: 'the client itself; getAgentReputation only counts rows' } },
  { file: `${M}holomesh/routes/board-routes.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/routes/board-routes.ts`, read: 'knowledge-mirror', count: 2, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/routes/board-routes.ts`, read: 'entry-lookup', count: 1, gate: { symbol: 'entriesForViewer' } },
  // core-routes: /feed and agent profiles (formatEntry -> entryForViewer), /leaderboard,
  // /onboard, /entry/:id; /directory, /space, /domains count only; /knowledge/private
  // drops premium rows the caller is not entitled to (entitledSearchRows);
  // /knowledge/promote is author-only.
  { file: `${M}holomesh/routes/core-routes.ts`, read: 'orchestrator-query', count: 9, gate: { symbol: 'entryForViewer' } },
  { file: `${M}holomesh/routes/core-routes.ts`, read: 'entry-lookup', count: 1, gate: { symbol: 'entryForViewer' } },
  { file: `${M}holomesh/routes/knowledge-routes.ts`, read: 'orchestrator-query', count: 7, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/routes/knowledge-routes.ts`, read: 'marketplace-listing', count: 2, gate: { symbol: 'premiumTeaserText' } },
  { file: `${M}holomesh/routes/knowledge-routes.ts`, read: 'entry-lookup', count: 4, gate: { symbol: 'premiumEntryAccess' } },
  { file: `${M}holomesh/routes/team-routes.ts`, read: 'orchestrator-query', count: 3, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/routes/team-routes.ts`, read: 'knowledge-mirror', count: 1, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/routes/team-routes.ts`, read: 'entry-lookup', count: 1, gate: { symbol: 'entriesForViewer' } },
  { file: `${M}holomesh/search.ts`, read: 'entry-provider', count: 2, gate: { symbol: 'entitledSearchRows' } },
  { file: `${M}holomesh/team-agent-tools.ts`, read: 'knowledge-table', count: 4, gate: { noText: 'counts insights' } },
  { file: `${M}http-server.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'entitledSearchRows', via: `${M}holomesh/search.ts` } },
  { file: `${M}oracle-handler.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'entitledSearchRows' } },
  { file: `${M}oracle-mcp-tools.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'premiumTeaser' } },
  { file: `${M}oracle-mcp-tools.ts`, read: 'knowledge-mirror', count: 1, gate: { symbol: 'premiumTeaser' } },
  { file: `${M}oracle-mcp-tools.ts`, read: 'knowledge-table', count: 9, gate: { symbol: 'premiumTeaser' } },

  // ── Studio ──
  { file: `${S}app/agents/[id]/storefront/page.tsx`, read: 'holomesh-knowledge-http', count: 1, gate: browser },
  { file: `${S}app/agents/me/page.tsx`, read: 'holomesh-knowledge-http', count: 1, gate: browser },
  { file: `${S}app/api/holomesh/agent/[id]/route.ts`, read: 'holomesh-relay', count: 3, gate: viaProxy },
  { file: `${S}app/api/holomesh/agent/[id]/storefront/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/agent/[id]/storefront/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/agent/self/contributions/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/agent/self/contributions/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/agent/self/knowledge/route.ts`, read: 'holomesh-knowledge-http', count: 2, gate: viaProxy },
  { file: `${S}app/api/holomesh/agent/self/knowledge/route.ts`, read: 'holomesh-relay', count: 3, gate: viaProxy },
  { file: `${S}app/api/holomesh/agents/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/contribute/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/dashboard/earnings/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/dashboard/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/domains/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/entry/[id]/purchase/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/entry/[id]/route.ts`, read: 'holomesh-knowledge-http', count: 2, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/entry/[id]/route.ts`, read: 'knowledge-table', count: 3, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/feed/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/feed/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/knowledge/catalog/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/knowledge/catalog/route.ts`, read: 'knowledge-table', count: 7, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/marketplace/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/marketplace/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/marketplace/sync/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { symbol: 'premiumTeaser' } },
  { file: `${S}app/api/holomesh/marketplace/sync/route.ts`, read: 'knowledge-table', count: 3, gate: { symbol: 'premiumTeaser' } },
  { file: `${S}app/api/holomesh/marketplace/trending/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/search/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/search/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/surface/[...path]/route.ts`, read: 'holomesh-relay', count: 3, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/board/[taskId]/route.ts`, read: 'holomesh-relay', count: 2, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/board/route.ts`, read: 'holomesh-relay', count: 2, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/export/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/holomesh/team/[id]/fleet/route.ts`, read: 'holomesh-relay', count: 2, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/join/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/members/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/message/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/messages/[messageId]/mark-read/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/messages/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/mode/route.ts`, read: 'orchestrator-query', count: 1, gate: { noText: 'the path appears in a task description string' } },
  { file: `${S}app/api/holomesh/team/[id]/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/secrets/device-flow/[code]/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/secrets/device-flow/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/secrets/device-flow/verify/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/[id]/trace/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/team/discover/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/teams/leaderboard/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/holomesh/transactions/route.ts`, read: 'holomesh-relay', count: 1, gate: viaProxy },
  { file: `${S}app/api/knowledge/query/route.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}app/api/operations/service-health/route.ts`, read: 'holomesh-relay', count: 2, gate: viaProxy },
  { file: `${S}app/api/portable-mind/[agentId]/route.ts`, read: 'mind-memory', count: 1, gate: { symbol: 'premiumTeaser' } },
  { file: `${S}app/api/workspace/paper-opt-in/route.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { noText: 'writes two entries and reads back only their ids' } },
  { file: `${S}app/holomesh/entry/[id]/page.tsx`, read: 'holomesh-knowledge-http', count: 9, gate: browser },
  { file: `${S}app/holomesh/marketplace/page.tsx`, read: 'holomesh-knowledge-http', count: 1, gate: browser },
  { file: `${S}app/holomesh/page.tsx`, read: 'holomesh-knowledge-http', count: 2, gate: browser },
  { file: `${S}components/holomesh/ProfileFeed.tsx`, read: 'holomesh-knowledge-http', count: 1, gate: browser },
  { file: `${S}components/knowledge/WPGEntryForm.tsx`, read: 'orchestrator-query', count: 1, gate: browser },
  { file: `${S}components/panels/KnowledgePanel.tsx`, read: 'orchestrator-query', count: 2, gate: browser },
  { file: `${S}db/schema.ts`, read: 'knowledge-table', count: 1, gate: { noText: 'table definition' } },
  { file: `${S}lib/api-public-paths.ts`, read: 'orchestrator-query', count: 1, gate: { noText: 'route patterns and why-strings in the public-path config; no call' } },
  { file: `${S}lib/api-public-paths.ts`, read: 'holomesh-knowledge-http', count: 10, gate: { noText: 'route patterns and why-strings in the public-path config; no call' } },
  { file: `${S}lib/brittney/MCPToolExecutor.ts`, read: 'knowledge-tool', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}lib/brittney/MCPToolExecutor.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}lib/brittney/MCPTools.ts`, read: 'knowledge-tool', count: 1, gate: { noText: 'tool declaration' } },
  { file: `${S}lib/brittney/StudioAPIExecutor.ts`, read: 'holomesh-knowledge-http', count: 1, gate: viaProxy },
  { file: `${S}lib/brittney/toolTiers.ts`, read: 'knowledge-tool', count: 1, gate: { noText: 'tool tier list' } },
  { file: PROXY, read: 'holomesh-relay', count: 2, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${S}lib/holomesh/room-templates.ts`, read: 'holomesh-knowledge-http', count: 1, gate: { noText: 'prompt text for an agent room' } },
  { file: `${S}lib/holomesh/room-templates.ts`, read: 'orchestrator-query', count: 1, gate: { noText: 'prompt text for an agent room' } },
  { file: `${S}lib/scenarios/index.ts`, read: 'holomesh-knowledge-http', count: 11, gate: { noText: 're-exports of route modules listed here' } },
  { file: `${S}lib/workspace/founderWorkspaceBackfill.ts`, read: 'knowledge-table', count: 2, gate: { noText: 'builds entries to write' } },
  { file: `${S}lib/workspace/provisionUser.ts`, read: 'knowledge-mirror', count: 2, gate: { noText: 'reads the ids of entries provisioning wrote' } },
  { file: `${S}locales/en.ts`, read: 'knowledge-mirror', count: 3, gate: { noText: 'UI label keys' } },

  // ── absorb MCP ──
  { file: `${A}mcp/codebase-tools.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'premiumTeaser' } },
  { file: `${A}mcp/knowledge-tools.ts`, read: 'knowledge-table', count: 16, gate: { symbol: 'x402_gated' } },
  { file: `${A}mcp/knowledge-tools.ts`, read: 'knowledge-tool', count: 2, gate: { symbol: 'x402_gated' } },
  { file: `${A}mcp/oracle-tools.ts`, read: 'orchestrator-query', count: 1, gate: { symbol: 'hidePremiumRowsDeep' } },
  { file: `${A}schema.ts`, read: 'knowledge-table', count: 1, gate: { noText: 'table definition' } },
];

const SKIP = /(__tests__|\.test\.|\.spec\.|__test_stubs__|node_modules|[\\/]dist[\\/])/;

function sourceFiles(tree: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (SKIP.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name)) out.push(p);
    }
  };
  const abs = path.join(ROOT, tree);
  if (fs.existsSync(abs)) walk(abs);
  return out;
}

/**
 * The file's text with every comment blanked to spaces, line breaks kept so line numbers hold
 * (task v7c1). The census counted TEXT, so a comment quoting a call shape counted as a read. A
 * new comment raised a false alarm, and worse, swapping a quoting comment for a real ungated read
 * left the count unchanged and the census green. A gate named only in a comment also passed
 * "every listed gate is really there". Comments are found by the TypeScript parser, so a string
 * or a regex holding // or /* is never mistaken for one.
 */
function withoutComments(file: string, text: string): string {
  const kind = /\.[jt]sx$/.test(file)
    ? ts.ScriptKind.TSX
    : /\.m?js$/.test(file)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  // JSX text is what a page shows, not code or a comment, so a '//' in it opens nothing. A child
  // list can start where the text starts, so comment ranges beginning inside it are ignored.
  const jsxText: Array<[number, number]> = [];
  const collect = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) jsxText.push([node.getFullStart(), node.getEnd()]);
    node.forEachChild(collect);
  };
  collect(source);
  const chars = text.split('');
  const blank = (range: ts.CommentRange) => {
    if (jsxText.some(([start, end]) => range.pos >= start && range.pos < end)) return;
    for (let i = range.pos; i < range.end; i++) {
      if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    }
  };
  const visit = (node: ts.Node) => {
    // A JSDoc node lies inside a comment already.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
      return;
    }
    const at = node.getFullStart();
    // Same-line comments after the previous token, then those on the lines before this one.
    for (const range of ts.getTrailingCommentRanges(text, at) ?? []) blank(range);
    for (const range of ts.getLeadingCommentRanges(text, at) ?? []) blank(range);
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return chars.join('');
}

const codeCache = new Map<string, string>();
/** A file's code with its comments blanked (withoutComments), read once. */
function codeOf(abs: string): string {
  let code = codeCache.get(abs);
  if (code === undefined) {
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    // Parse only files the reads could match at all: most scanned files never do. A block
    // comment can sit INSIDE a read (`queryKnowledge/* why */(q)`), so the raw text alone would
    // hide it; removing block comments only decides whether to parse, never what counts.
    const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, '');
    code = Object.values(READS).some(({ re }) => text.match(re) || withoutBlocks.match(re))
      ? withoutComments(abs, text)
      : text;
    codeCache.set(abs, code);
  }
  return code;
}

function scan(): Map<string, { count: number; lines: string[] }> {
  const found = new Map<string, { count: number; lines: string[] }>();
  for (const [read, { re, trees }] of Object.entries(READS)) {
    for (const tree of trees) {
      for (const abs of sourceFiles(tree)) {
        const rel = path.relative(ROOT, abs).split(path.sep).join('/');
        const lines = codeOf(abs).split('\n');
        let count = 0;
        const hitLines: string[] = [];
        lines.forEach((line, i) => {
          const n = (line.match(re) || []).length;
          if (n) {
            count += n;
            hitLines.push(`${rel}:${i + 1}  ${line.trim().slice(0, 140)}`);
          }
        });
        if (count) found.set(`${rel} | ${read}`, { count, lines: hitLines });
      }
    }
  }
  return found;
}

/** Is `symbol` named in the code (not a comment) as a whole identifier, not inside a longer one? */
function namesSymbol(abs: string, symbol: string): boolean {
  const code = fs.existsSync(abs) ? withoutComments(abs, fs.readFileSync(abs, 'utf8')) : '';
  return new RegExp(`(?<![\\w$])${symbol.replace(/[$]/g, '\\$')}(?![\\w$])`).test(code);
}

describe('premium exit guard: every knowledge-row read is on the reviewed, gated list', () => {
  const found = scan();
  const listed = new Map(SITES.map((s) => [`${s.file} | ${s.read}`, s]));

  it('scans real source (the scan is not blind)', () => {
    expect(sourceFiles('packages/mcp-server/src').length).toBeGreaterThan(100);
    expect(sourceFiles('packages/studio/src').length).toBeGreaterThan(100);
    expect(sourceFiles('packages/absorb-service/src').length).toBeGreaterThan(20);
    expect(found.size).toBeGreaterThan(50);
  });

  it('finds no read that is missing from the list, and no listed count that changed', () => {
    const problems: string[] = [];
    for (const [key, hit] of found) {
      const site = listed.get(key);
      if (!site) {
        problems.push(
          `NEW knowledge-row read (${READS[key.split(' | ')[1]].what}), not on the reviewed list:\n    ${hit.lines.join('\n    ')}`
        );
      } else if (site.count !== hit.count) {
        problems.push(
          `${key}: the list says ${site.count}, the source has ${hit.count}. A read was added or removed:\n    ${hit.lines.join('\n    ')}`
        );
      }
    }
    for (const key of listed.keys()) {
      if (!found.has(key)) problems.push(`${key}: listed, but no longer in the source. Remove the row.`);
    }
    expect(
      problems,
      `Route every new read through the premium gate (entryForViewer / entriesForViewer on HoloMesh, ` +
        `hidePremiumRowsDeep / premiumTeaser from premium-view.ts elsewhere), then update SITES in this file.\n` +
        problems.join('\n')
    ).toEqual([]);
  });

  it('every listed gate is really there', () => {
    const missing: string[] = [];
    for (const site of SITES) {
      if ('noText' in site.gate) {
        expect(site.gate.noText.length, `${site.file}: say why no text leaves`).toBeGreaterThan(8);
        continue;
      }
      const where = site.gate.via ?? site.file;
      if (!namesSymbol(path.join(ROOT, where), site.gate.symbol)) {
        missing.push(`${site.file} (${site.read}): gate '${site.gate.symbol}' not found in ${where}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("Studio's relay cuts premium text whenever its server key stood in for the visitor", () => {
    const proxyPath = path.join(ROOT, PROXY);
    const proxy = withoutComments(proxyPath, fs.readFileSync(proxyPath, 'utf8'));
    expect(proxy).toMatch(/usesServerKeyFor\(req\)\)\s*data = hidePremiumRowsDeep\(data\)/);
    expect(proxy).toMatch(/if \(usesServerKeyFor\(req\) && contentType\.includes\('json'\)\)/);
  });
});

describe('the census reads code, not comments (task v7c1)', () => {
  const reads = (file: string, text: string) =>
    (withoutComments(file, text).match(READS['orchestrator-query'].re) || []).length;

  it('a comment that quotes a read is not a read', () => {
    const text =
      '// queryKnowledge(q) and POST /knowledge/query\n/* queryKnowledge( */\nconst x = 1;\n';
    expect(reads('a.ts', text)).toBe(0);
  });

  it('a read in code still counts, beside a comment and inside strings that hold //', () => {
    const text =
      "const u = 'https://host/knowledge/query'; // queryKnowledge(\n" +
      'const t = `https://${host}/knowledge/query`;\n' +
      'await queryKnowledge(q);\n';
    expect(reads('a.ts', text)).toBe(3);
  });

  it('a regex holding // and on-screen JSX text stay code', () => {
    // If the // inside the regex opened a comment, the rest of the line would vanish with it.
    expect(reads('a.tsx', 'const r = /\\/\\//; const v = <p>see /knowledge/query</p>;\n')).toBe(1);
    // JSX text that starts with // is what the page shows, not a comment.
    expect(reads('a.tsx', 'const v = <p>// POST /knowledge/query</p>;\n')).toBe(1);
    // A real comment inside JSX braces is still a comment.
    expect(reads('a.tsx', 'const v = <p>{/* queryKnowledge( */}</p>;\n')).toBe(0);
  });

  it('line numbers survive, so a failure still points at the right line', () => {
    const lines = withoutComments(
      'a.ts',
      '/**\n * queryKnowledge(\n */\nqueryKnowledge(q);\n'
    ).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[1].trim()).toBe('');
    expect(lines[3]).toContain('queryKnowledge(q)');
  });

  it('code after a JSDoc tag on the same line still counts', () => {
    // After a {@link}, a JSDoc text node starts just before the `//`. Scanning comment trivia
    // from there would blank the real call after the comment's close (#470 pre-review).
    const text = '/** Uses {@link Y} // note */ const g = () => queryKnowledge(x);\n';
    expect(reads('a.ts', text)).toBe(1);
  });

  it('a block comment inside a read does not hide the read from the parse filter', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'premium-census-'));
    try {
      const file = path.join(dir, 'site.ts');
      fs.writeFileSync(file, 'export const q = async (q: string) => queryKnowledge/* why */(q);\n');
      expect(codeOf(file).match(READS['orchestrator-query'].re) ?? []).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a gate named only in a comment, or inside a longer name, is not named', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'premium-census-'));
    try {
      const file = path.join(dir, 'site.ts');
      fs.writeFileSync(
        file,
        '// every row goes through premiumTeaser\nconst premiumTeaserCache = 1;\n'
      );
      expect(namesSymbol(file, 'premiumTeaser')).toBe(false);
      fs.writeFileSync(file, 'const text = old_premiumTeaser(row.content);\n');
      expect(namesSymbol(file, 'premiumTeaser')).toBe(false);
      fs.writeFileSync(file, 'const text = premiumTeaser(row.content);\n');
      expect(namesSymbol(file, 'premiumTeaser')).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('one teaser rule in three servers', () => {
  it('the three copies of premium-view.ts are byte-identical', () => {
    const copies = [
      'packages/mcp-server/src/holomesh/premium-view.ts',
      'packages/studio/src/lib/premium-view.ts',
      'packages/absorb-service/src/mcp/premium-view.ts',
    ].map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'));
    expect(copies[1]).toBe(copies[0]);
    expect(copies[2]).toBe(copies[0]);
  });
});
