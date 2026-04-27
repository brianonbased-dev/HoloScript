import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Three-touch API integration coverage test (W.098).
 *
 * Failure mode this prevents: silent gap between server, client, and runner.
 *
 * The 2026-04-25 empty-CAEL-audit incident: the server had `POST
 * /agent/:handle/audit` LIVE, the agent had a local AuditLog write LIVE,
 * but no client method existed and no runner integration called the
 * server route. 31-agent fleet wrote to local JSONL only; zero records
 * server-side for 24+ hours, undetected because no test asserted the
 * three layers were wired together.
 *
 * Fix shape (this file):
 *   1. Parse `holomesh-client.ts` for declared public methods + their
 *      `this.req(METHOD, PATH, ...)` calls.
 *   2. Parse `runner.ts` for `mesh.<methodName>(` invocations.
 *   3. Parse the server route files for `pathname === '...'` /
 *      `pathname.match(/.../)` registrations.
 *   4. Cross-check via curated runtime-critical-routes list:
 *      every route in the list MUST have a matching client method
 *      that's actually called from runner.
 *
 * If a future agent adds a runtime-critical server route, they MUST
 * either (a) add the corresponding client method + runner call, or
 * (b) explicitly add the route to OPT_OUT_NOT_RUNTIME below with a
 * comment explaining why no runner integration is needed.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_SRC = resolve(__dirname, '..');
const REPO_ROOT = resolve(AGENT_SRC, '..', '..', '..');
const ROUTES_DIR = resolve(REPO_ROOT, 'packages', 'mcp-server', 'src', 'holomesh', 'routes');

// ─── Curated lists ───────────────────────────────────────────────────────

/**
 * Server routes that EVERY agent runtime instance MUST be able to hit.
 * Adding here forces a matching client method + runner integration to
 * exist — the test fails loudly if either is missing.
 *
 * Format: `<METHOD> <pathname-template>` where `:param` is a placeholder
 * for a path segment. Match the actual server registration pathname,
 * but normalize regex `[^/]+` → `:param`.
 */
const CRITICAL_RUNTIME_ROUTES: ReadonlyArray<string> = [
  'POST /api/holomesh/team/:teamId/presence',         // heartbeat — alive signal
  'GET /api/holomesh/team/:teamId/board',             // task discovery
  'PATCH /api/holomesh/team/:teamId/board/:taskId',   // claim + markDone
  'POST /api/holomesh/team/:teamId/join',             // self-rejoin on 403
  'POST /api/holomesh/team/:teamId/message',          // task response posting
  'POST /api/holomesh/agent/:handle/audit',           // CAEL records (W.098)
];

/**
 * Public client methods that are intentionally not called from runner.ts.
 * Any other public method on HolomeshClient must be invoked from runner.
 *
 * The opt-out is the SAFE path: requires an explicit comment explaining
 * why no runner integration is needed. If you find yourself adding to
 * this list without a clear reason, the runner probably has a real wiring
 * gap (the same shape as W.098 empty-CAEL-audit).
 */
const OPT_OUT_NOT_RUNTIME = new Set<string>([
  'whoAmI',   // called from provision.ts + identity flows, not runner tick loop
]);

// ─── Parsers ─────────────────────────────────────────────────────────────

interface ClientMethod {
  name: string;
  isPublic: boolean;
  reqCalls: Array<{ method: string; path: string }>;
}

function parseClientFile(): ClientMethod[] {
  const src = readFileSync(resolve(AGENT_SRC, 'holomesh-client.ts'), 'utf-8');
  const lines = src.split('\n');

  // Locate the HolomeshClient class body.
  const classStart = lines.findIndex((l) => /^export class HolomeshClient\b/.test(l));
  if (classStart < 0) throw new Error('HolomeshClient class not found in holomesh-client.ts');

  // Method signature regex (matched against line starts at class depth 1).
  const methodRe = /^\s*(?:private\s+)?(?:async\s+)?([a-zA-Z_]\w*)\s*\(/;

  // Pass 1: walk the class with brace-depth tracking and identify each
  // method's [start, end] line range. We use line ranges (not single-line
  // regex) because real client methods span multiple lines:
  //   return this.req<T>(
  //     'POST',
  //     `/agent/${encodeURIComponent(handle)}/audit`,
  //     { records }
  //   );
  // A single-line regex would miss the path on line 3.
  type Range = { method: ClientMethod; startLine: number; endLine: number };
  const ranges: Range[] = [];
  let cur: Range | null = null;
  let depth = 0;
  let inClass = false;

  for (let i = classStart; i < lines.length; i++) {
    const line = lines[i];
    const depthAtStart = depth;

    if (inClass && depthAtStart === 1) {
      const m = methodRe.exec(line);
      if (m) {
        if (cur) {
          cur.endLine = i - 1;
          ranges.push(cur);
        }
        const name = m[1];
        if (name === 'constructor') {
          cur = null;
        } else {
          cur = {
            method: {
              name,
              isPublic: !/^\s*private\s/.test(line),
              reqCalls: [],
            },
            startLine: i,
            endLine: -1,
          };
        }
      }
    }

    for (const ch of line) {
      if (ch === '{') {
        if (!inClass) inClass = true;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (inClass && depth === 0) {
          if (cur) {
            cur.endLine = i;
            ranges.push(cur);
          }
          // Pass 2: extract this.req(...) tuples from each method's body
          // joined as a single string (multi-line tolerant regex).
          return extractReqCalls(ranges, lines);
        }
      }
    }
  }

  // Class brace never closed cleanly; flush partial progress.
  if (cur) ranges.push(cur);
  return extractReqCalls(ranges, lines);
}

/**
 * For each method range, slice the lines that belong to it, join them
 * with spaces, and run the multi-line-tolerant `this.req(...)` regex
 * against the body. This catches calls that span multiple physical
 * lines, which the line-by-line approach would miss.
 */
function extractReqCalls(
  ranges: Array<{ method: ClientMethod; startLine: number; endLine: number }>,
  lines: string[]
): ClientMethod[] {
  // `[\s\S]*?` allows newlines between the method-string and the path
  // template — without that the regex stops at the first newline.
  const reqReBack =
    /this\.req(?:<[\s\S]*?>)?\(\s*['"]([^'"]+)['"]\s*,\s*`([^`]+)`/g;
  const reqReStr =
    /this\.req(?:<[\s\S]*?>)?\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;

  for (const r of ranges) {
    const body = lines
      .slice(r.startLine, (r.endLine < 0 ? lines.length : r.endLine + 1))
      .join('\n');
    let m: RegExpExecArray | null;
    reqReBack.lastIndex = 0;
    while ((m = reqReBack.exec(body))) {
      r.method.reqCalls.push({
        method: m[1].toUpperCase(),
        path: normalizePathTemplate(m[2]),
      });
    }
    reqReStr.lastIndex = 0;
    while ((m = reqReStr.exec(body))) {
      r.method.reqCalls.push({
        method: m[1].toUpperCase(),
        path: normalizePathTemplate(m[2]),
      });
    }
  }
  return ranges.map((r) => r.method);
}

/**
 * Convert client-side path templates (with ${this.teamId}, ${taskId},
 * encodeURIComponent(handle)) into the pathname-template form used in
 * CRITICAL_RUNTIME_ROUTES (`/api/holomesh/team/:teamId/...`).
 *
 * Notes:
 *  - Client paths begin at `/team/...`; server pathnames begin at
 *    `/api/holomesh/team/...`. We prepend `/api/holomesh` if missing.
 *  - Any `${...}` segment becomes `:param` (we don't try to recover the
 *    semantic name — order + position is what matters for the
 *    cross-check).
 */
function normalizePathTemplate(tpl: string): string {
  // Strip the encodeURIComponent wrappers + interpolation expressions to
  // a single :param token per segment.
  let path = tpl.replace(/\$\{[^}]+\}/g, ':param');
  if (!path.startsWith('/api/holomesh')) {
    path = '/api/holomesh' + path;
  }
  return path;
}

/**
 * Collapse all `:semanticName` placeholders to a single `:param` token so
 * comparisons are purely positional. The CRITICAL_RUNTIME_ROUTES list is
 * authored with semantic names (`:teamId`, `:taskId`, `:handle`) for
 * readability; the parser produces `:param` because the source-of-truth
 * is the client's interpolation expression which we don't try to
 * semantically resolve. Compare via paramless() to bridge the two.
 */
function paramless(routeKey: string): string {
  return routeKey.replace(/:[a-zA-Z_]\w*/g, ':param');
}

function parseRunnerCalls(): Set<string> {
  const src = readFileSync(resolve(AGENT_SRC, 'runner.ts'), 'utf-8');
  const calls = new Set<string>();
  const re = /\bmesh\.([a-zA-Z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) calls.add(m[1]);
  return calls;
}

function parseServerRoutes(): Set<string> {
  // Walk routes/ and extract every (METHOD, pathname-template) tuple.
  const routes = new Set<string>();
  const files = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith('-routes.ts') || f.endsWith('-routes.js')
  );

  // Three registration patterns observed in routes/:
  //  (a) literal-inline:  pathname === '/api/holomesh/...'  && method === '...'
  //  (b) regex-inline:    pathname.match(/^\/api\/holomesh\/.../) && method === '...'
  //  (c) regex-indirect:  const X = pathname.match(/^...$/); if (X && method === '...') {...}
  //
  // The indirect form (c) is used when the handler needs the regex
  // capture groups (e.g. `auditMatch[1]` for `:handle`). Without
  // matching (c), the test produces false-positive "client calls a
  // server route that isn't registered" failures.
  //
  // For regex forms, use non-greedy `(.+?)` between `/^` and `$/` so
  // escaped slashes (`\/`) inside the captured pathname source are
  // included verbatim.
  const literalRe =
    /pathname\s*===\s*['"]([^'"]+)['"]\s*&&\s*method\s*===\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/g;
  const regexRe =
    /pathname\.match\(\s*\/\^(.+?)\$\/\)\s*&&\s*method\s*===\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/g;
  // Reverse-match form: method first, pathname second.
  const literalRevRe =
    /method\s*===\s*['"](GET|POST|PATCH|PUT|DELETE)['"]\s*&&\s*pathname\s*===\s*['"]([^'"]+)['"]/g;
  // Indirect-regex form: assignment + later if-check. `\1` backref ties
  // the variable name across the two statements; `[\s\S]*?` allows any
  // intervening content (comments, blank lines, the handler body of a
  // prior route).
  const indirectRegexRe =
    /const\s+(\w+)\s*=\s*pathname\.match\(\s*\/\^(.+?)\$\/\);[\s\S]*?if\s*\(\s*\1\s*&&\s*method\s*===\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/g;

  for (const f of files) {
    const src = readFileSync(join(ROUTES_DIR, f), 'utf-8');
    let m: RegExpExecArray | null;

    literalRe.lastIndex = 0;
    while ((m = literalRe.exec(src))) {
      routes.add(`${m[2]} ${m[1]}`);
    }

    literalRevRe.lastIndex = 0;
    while ((m = literalRevRe.exec(src))) {
      routes.add(`${m[1]} ${m[2]}`);
    }

    regexRe.lastIndex = 0;
    while ((m = regexRe.exec(src))) {
      // Convert the regex pathname source to a template form.
      // E.g. `\/api\/holomesh\/team\/[^/]+\/join` → `/api/holomesh/team/:param/join`
      const raw = m[1].replace(/\\\//g, '/').replace(/\[\^\/\]\+/g, ':param').replace(/\(\[\^\/\]\+\)/g, ':param');
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      routes.add(`${m[2]} ${path}`);
    }

    // 2-phase scan for the indirect form. Pass A builds a varName→regex
    // map; pass B emits one tuple per (variable-reuse, method) pair. This
    // catches handlers like `/agent/:handle/audit` where ONE
    // `const auditMatch = pathname.match(...)` is reused by SEPARATE
    // `if (auditMatch && method === 'GET')` and `if (auditMatch &&
    // method === 'POST')` blocks (a single regex couldn't pair both
    // because /g would consume past the first match).
    const constAssignRe = /const\s+(\w+)\s*=\s*pathname\.match\(\s*\/\^(.+?)\$\/\)/g;
    const varToRegex = new Map<string, string>();
    constAssignRe.lastIndex = 0;
    while ((m = constAssignRe.exec(src))) {
      varToRegex.set(m[1], m[2]);
    }
    if (varToRegex.size > 0) {
      const ifCheckRe = /if\s*\(\s*(\w+)\s*&&\s*method\s*===\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/g;
      ifCheckRe.lastIndex = 0;
      while ((m = ifCheckRe.exec(src))) {
        const regexSrc = varToRegex.get(m[1]);
        if (!regexSrc) continue;
        const raw = regexSrc
          .replace(/\\\//g, '/')
          .replace(/\(\[\^\/\]\+\)/g, ':param')
          .replace(/\[\^\/\]\+/g, ':param');
        const path = raw.startsWith('/') ? raw : `/${raw}`;
        routes.add(`${m[2]} ${path}`);
      }
    }
  }

  return routes;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('three-touch API integration coverage (W.098)', () => {
  const clientMethods = parseClientFile();
  const runnerCalls = parseRunnerCalls();
  const serverRoutes = parseServerRoutes();

  // Client req-call tuples flattened across all methods.
  const clientReqs = new Set<string>();
  for (const m of clientMethods) {
    for (const c of m.reqCalls) clientReqs.add(`${c.method} ${c.path}`);
  }

  it('parses at least one client method, one runner call, and one server route (sanity)', () => {
    expect(clientMethods.length, 'no client methods parsed').toBeGreaterThan(0);
    expect(runnerCalls.size, 'no runner mesh.X calls parsed').toBeGreaterThan(0);
    expect(serverRoutes.size, 'no server routes parsed').toBeGreaterThan(0);
  });

  // Touch 1: every CRITICAL route has a matching client req call.
  // This catches: server has route, client doesn't know about it.
  for (const route of CRITICAL_RUNTIME_ROUTES) {
    const target = paramless(route);
    it(`client knows about critical route: ${route}`, () => {
      const matching = clientMethods.filter((m) =>
        m.reqCalls.some((c) => paramless(`${c.method} ${c.path}`) === target)
      );
      expect(
        matching.length,
        `No HolomeshClient method calls ${route}. Add one OR remove from CRITICAL_RUNTIME_ROUTES with justification.`
      ).toBeGreaterThan(0);
    });
  }

  // Touch 2: every CRITICAL route's client method is invoked by runner.
  // This catches: client method exists but runner doesn't call it.
  for (const route of CRITICAL_RUNTIME_ROUTES) {
    const target = paramless(route);
    it(`runner invokes the client method that hits: ${route}`, () => {
      const matchingMethods = clientMethods
        .filter((m) => m.reqCalls.some((c) => paramless(`${c.method} ${c.path}`) === target))
        .map((m) => m.name);
      const calledFromRunner = matchingMethods.some((name) => runnerCalls.has(name));
      expect(
        calledFromRunner,
        `No mesh.X(...) call in runner.ts hits ${route}. Client methods that touch it: [${matchingMethods.join(
          ', '
        )}]. Wire one into runner.tick() OR mark non-runtime with explicit comment.`
      ).toBe(true);
    });
  }

  // Touch 3: every public client method is invoked by runner OR explicitly opted out.
  // This catches: dead client method (the inverse of W.098).
  it('every public client method is exercised by runner or in OPT_OUT_NOT_RUNTIME', () => {
    const orphans: string[] = [];
    for (const m of clientMethods) {
      if (!m.isPublic) continue;
      if (m.name === 'constructor') continue;
      if (OPT_OUT_NOT_RUNTIME.has(m.name)) continue;
      if (!runnerCalls.has(m.name)) orphans.push(m.name);
    }
    expect(
      orphans,
      `Public HolomeshClient methods declared but not called from runner.ts: [${orphans.join(
        ', '
      )}]. Either wire each into runner OR add to OPT_OUT_NOT_RUNTIME with a comment.`
    ).toEqual([]);
  });

  // Touch 4 (soft): every client req call hits a server route that exists.
  // This catches: client posting to a non-existent server route (typo or removed).
  it('every client.req(METHOD, PATH) tuple has a matching server route registration', () => {
    const serverParamless = new Set([...serverRoutes].map(paramless));
    const orphans: string[] = [];
    for (const tuple of clientReqs) {
      if (!serverParamless.has(paramless(tuple))) orphans.push(tuple);
    }
    expect(
      orphans,
      `Client makes requests to server routes that aren't registered:\n  ${orphans.join(
        '\n  '
      )}\nServer routes parsed (${serverRoutes.size}): the route may exist with a different pathname template — verify the server registration matches the client's path EXACTLY (incl. /api/holomesh prefix).`
    ).toEqual([]);
  });
});
