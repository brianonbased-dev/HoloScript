/**
 * Agent-facing shape of codebase-brain answers: short, meaning intact, and
 * always one call away from the full detail.
 *
 * Why (2026-10-05): measured over 117 Claude sessions, agents asked the
 * codebase brain ~70 times while running ~38,000 plain searches and reads. A
 * single holo_graph_status answer was ~6,000 words; a grep answers in a few
 * lines. The founder asked for short answers that do not lose their meaning,
 * with follow-ups an agent can ask to make the answer concrete.
 *
 * Rules, applied at the MCP boundary only (handlers and their tests are
 * unchanged; `detail: "full"` returns the original object):
 *   1. Never drop anything that decides an action: errors, reasons, readiness
 *      and freshness flags, counts, job ids, next steps (KEEP below).
 *   2. Lists become short lines; the full count is always stated.
 *   3. Everything else is named in `omitted`, never silently removed.
 *   4. `followUps` are exact calls: the full answer, plus the natural next
 *      question for the top results.
 */

export const AGENT_BRIEF_TOOLS: ReadonlySet<string> = new Set([
  'holo_graph_status',
  'holo_query_codebase',
  'holo_impact_analysis',
  'holo_absorb_repo',
  'holo_semantic_search',
  'holo_ask_codebase',
  'holo_get_absorb_status',
]);

const LIST_LIMIT = 20;
const OMITTED_NAMES = 6;

/** The workspace this server serves, so follow-ups can leave rootDir out for it. */
function servedWorkspaceRoot(): string {
  const pinned = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
  return (pinned && pinned.trim() ? pinned : process.cwd()).replace(/[\\/]+$/, '');
}

function sameRoot(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const norm = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** Absorb arguments that name `root` only when it is not the served workspace. */
function absorbArgs(root: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  return sameRoot(root, servedWorkspaceRoot()) || typeof root !== 'string'
    ? { ...extra }
    : { rootDir: root, ...extra };
}

/** Fields copied verbatim whenever present: they decide what the agent does next. */
const KEEP = [
  'error',
  'message',
  'hint',
  'reason',
  'status',
  'accepted',
  'coalesced',
  'jobId',
  'rootDir',
  'progress',
  'phase',
  'warmJobId',
  'autoRefresh',
  'warm',
  'answeredFrom',
  'query',
  'count',
  'answer',
  'changedSymbol',
  'affectedCount',
  'totalAffectedCount',
  'affectedCountIsLowerBound',
  'blastRadius',
  'complete',
  'truncated',
  'truncationReasons',
  'stale',
  'graphAuthoritative',
  'freshForCurrentRepo',
  'semanticIndexReady',
  'authorityCaveats',
  'warning',
  'embeddingSkipped',
  'embeddingSkipReason',
  'incremental',
  'filesChanged',
  'durationMs',
] as const;

export interface FollowUp {
  tool: string;
  args: Record<string, unknown>;
  why: string;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** One short line for a result item: where, what, and how it scored. */
export function resultLine(item: unknown): string {
  if (!isObj(item)) return String(item);
  const sym = isObj(item.symbol) ? item.symbol : item;
  const file = (sym.filePath ?? sym.file ?? item.filePath ?? item.file) as string | undefined;
  const line = (sym.line ?? item.line) as number | undefined;
  const owner = sym.owner ? `${String(sym.owner)}.` : '';
  const name = (sym.name ?? item.callerId ?? item.calleeName ?? item.name) as string | undefined;
  const kind = (sym.type ?? item.type) as string | undefined;
  const score = typeof item.score === 'number' ? ` score ${item.score}` : '';
  const where = file ? `${file}${line !== undefined ? `:${line}` : ''}` : '';
  return [where, name ? `${owner}${name}` : '', kind ? `(${kind})` : '', score.trim()]
    .filter(Boolean)
    .join(' ');
}

function topName(item: unknown): string | undefined {
  if (!isObj(item)) return undefined;
  const sym = isObj(item.symbol) ? item.symbol : item;
  const name = sym.name ?? item.calleeName ?? item.name;
  return typeof name === 'string' ? name : undefined;
}

const TEST_PATH = /(^|[\\/])(__tests__|tests?|bench(marks?)?|fixtures?)[\\/]|\.(test|spec|bench)\.[cm]?[jt]sx?$/i;

function itemPath(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!isObj(item)) return '';
  const sym = isObj(item.symbol) ? item.symbol : item;
  return String(sym.filePath ?? sym.file ?? item.filePath ?? item.file ?? '');
}

function isTestItem(item: unknown): boolean {
  return TEST_PATH.test(itemPath(item));
}

function productionFirst(items: unknown[]): unknown[] {
  return [...items.filter((v) => !isTestItem(v)), ...items.filter(isTestItem)];
}

function compactLists(result: Obj, out: Obj, omitted: string[]): boolean {
  let cut = false;
  for (const [key, value] of Object.entries(result)) {
    if (!Array.isArray(value) || (KEEP as readonly string[]).includes(key)) continue;
    if (value.length === 0) {
      out[key] = [];
      continue;
    }
    // An unranked list (callers, affected files) shows code before tests and
    // benches: 262 callers whose first 20 were all tests hid every real one.
    // A ranked list (items carry a score) keeps its order.
    const ranked = value.some((v) => isObj(v) && typeof v.score === 'number');
    const ordered = ranked ? value : productionFirst(value);
    if (ordered.every((v) => typeof v === 'string')) {
      out[key] = ordered.slice(0, LIST_LIMIT);
    } else {
      out[key] = ordered.slice(0, LIST_LIMIT).map(resultLine);
    }
    const tests = ordered.filter(isTestItem).length;
    if (!ranked && tests > 0) out[`${key}TestOrBench`] = tests;
    out[`${key}Total`] = value.length;
    if (value.length > LIST_LIMIT) {
      cut = true;
      omitted.push(
        `${key} beyond the first ${LIST_LIMIT} of ${value.length}` +
          (!ranked && tests > 0
            ? ` (real code is listed first; ${tests} of the ${value.length} are tests or benches)`
            : '')
      );
    }
  }
  return cut;
}

function graphStatusAnswer(result: Obj): { answer: string; followUps: FollowUp[] } {
  const disk = isObj(result.diskCache) ? result.diskCache : {};
  const stats = isObj(disk.stats) ? disk.stats : {};
  const warm = isObj(result.cacheWarm) ? result.cacheWarm : {};
  const root = (result.rootDir ?? disk.rootDir ?? result.currentCwd ?? 'this workspace') as string;
  const current = result.graphAuthoritative === true || disk.authoritative === true;
  const semantic = result.semanticIndexReady === true;
  const building = warm.inProgress === true;
  const parts = [
    `Codebase map for ${root} is ${current ? 'current' : 'NOT current'}` +
      (stats.totalFiles !== undefined
        ? ` (${stats.totalFiles} files, ${stats.totalSymbols} symbols${disk.ageHuman ? `, built ${disk.ageHuman}` : ''})`
        : '') +
      '.',
    `Semantic search: ${semantic ? 'ready' : building ? `index building (${String(warm.phase ?? '')})` : 'not ready'}.`,
  ];
  if (typeof disk.hint === 'string') parts.push(disk.hint);
  const followUps: FollowUp[] = [];
  if (!current || (!semantic && !building)) {
    followUps.push({
      tool: 'holo_absorb_repo',
      args: absorbArgs(root, { force: false, outputFormat: 'graph' }),
      why: current ? 'build the semantic index' : 'bring the map up to date (patches only what changed)',
    });
  }
  return { answer: parts.join(' '), followUps };
}

/**
 * The agent-facing answer for `tool`, or `result` unchanged when the tool is
 * not covered, the caller asked for `detail: "full"`, or the result is not an
 * object.
 */
export function briefForAgent(tool: string, args: Obj, result: unknown): unknown {
  if (!AGENT_BRIEF_TOOLS.has(tool) || args?.detail === 'full' || !isObj(result)) return result;

  const out: Obj = { detail: 'brief' };
  const omitted: string[] = [];
  let followUps: FollowUp[] = [];

  if (tool === 'holo_graph_status') {
    const status = graphStatusAnswer(result);
    out.answer = status.answer;
    followUps = status.followUps;
  }

  for (const key of KEEP) {
    if (key in result && result[key] !== undefined && !(key === 'answer' && 'answer' in out)) {
      out[key] = result[key];
    }
  }
  if (isObj(result.graphUnavailableReceipt)) {
    const receipt = result.graphUnavailableReceipt;
    out.unavailable = {
      reason: receipt.reason,
      requestedPath: receipt.requestedPath,
      ...(receipt.cacheAgeHuman ? { cacheAge: receipt.cacheAgeHuman } : {}),
    };
  }
  if (isObj(result.stats)) {
    out.stats = { totalFiles: result.stats.totalFiles, totalSymbols: result.stats.totalSymbols };
  }
  if (isObj(result.cancellation)) {
    out.cancellation = { reason: result.cancellation.reason, message: result.cancellation.message };
  }
  if (tool === 'holo_get_absorb_status' && result.status === 'cancelled') {
    followUps.push({
      tool: 'holo_absorb_repo',
      args: absorbArgs(result.rootDir, { force: false, outputFormat: 'graph' }),
      why: 'retry; completed scan batches and computed embeddings are reused',
    });
  }

  const cut = compactLists(result, out, omitted);

  for (const key of Object.keys(result)) {
    if (!(key in out) && !(key === 'stats' || key === 'graphUnavailableReceipt' || key === 'cancellation')) {
      omitted.push(key);
    }
  }
  if (isObj(result.stats)) omitted.push('stats breakdown by language and kind');
  if (isObj(result.graphUnavailableReceipt)) omitted.push('graphUnavailableReceipt (adapter, thresholds)');

  const firstList = Object.values(result).find(Array.isArray) as unknown[] | undefined;
  const top = firstList?.length ? topName(firstList[0]) : undefined;
  if (top && (tool === 'holo_query_codebase' || tool === 'holo_semantic_search' || tool === 'holo_ask_codebase')) {
    followUps.push(
      { tool: 'holo_query_codebase', args: { query: 'callers', symbolName: top }, why: `who calls ${top}` },
      { tool: 'holo_impact_analysis', args: { changedSymbol: top }, why: `what breaks if ${top} changes` }
    );
  }
  if (omitted.length > 0 || cut) {
    followUps.push({
      tool,
      args: { ...args, detail: 'full' },
      why: `the complete answer${cut ? ' including every list item' : ''}`,
    });
  }

  out.omitted =
    omitted.length > OMITTED_NAMES
      ? [...omitted.slice(0, OMITTED_NAMES), `+${omitted.length - OMITTED_NAMES} more (all in the detail:"full" answer)`]
      : omitted;
  out.followUps = followUps;
  return out;
}
