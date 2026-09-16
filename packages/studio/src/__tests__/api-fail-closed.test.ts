/**
 * The default for /api is CLOSED.
 *
 * Nine rounds of door fixes each closed one route and revealed the next,
 * because `src/proxy.ts` matched `/((?!api|_next/|favicon.ico).*)` — /api was
 * excluded, so every guard was a hand-patch against an open default and a route
 * added tomorrow inherited nothing. Census 2026-09-15: 236 route files, 164
 * with no caller gate at all, 27 of those attaching one of our server keys.
 *
 * These tests are about the DEFAULT, not about any one door:
 *
 *  1. a path nobody allowlisted is refused — including one that does not exist,
 *     which is the state every new route file starts in;
 *  2. every path that IS allowlisted still answers a signed-out visitor, so
 *     flipping the default cannot quietly break the public site;
 *  3. the matcher still covers /api, because the gate below is only reached if
 *     the middleware runs at all.
 *
 * Nothing here reaches the network: the middleware decides from the request.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

import { config, proxy } from '../proxy';
import {
  CALLER_CREDENTIAL_API_PATHS,
  PUBLIC_API_PATHS,
  classifyApiPath,
  type ApiPathRule,
} from '../lib/api-public-paths';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const API_DIR = join(HERE, '..', 'app', 'api');

/** Every route.ts under app/api, as the URL path it answers on. */
function routePaths(dir: string = API_DIR, prefix = '/api'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...routePaths(join(dir, entry.name), `${prefix}/${entry.name}`));
    } else if (entry.name === 'route.ts') {
      found.push(prefix);
    }
  }
  return found;
}

/** Fill dynamic segments so the path is one a real request could carry. */
function concrete(path: string): string {
  return path
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, 'probe')
    .replace(/\[\.\.\.[^\]]+\]/g, 'probe')
    .replace(/\[[^\]]+\]/g, 'probe');
}

function request(path: string, method = 'GET', headers: Record<string, string> = {}) {
  return new NextRequest(`https://studio.test${path}`, { method, headers });
}

async function anonymous(path: string, method = 'GET', headers: Record<string, string> = {}) {
  return proxy(request(path, method, headers));
}

beforeEach(() => {
  // A secret must exist or no session could be verified for anyone; the
  // requests below simply carry no session cookie.
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-gate-decisions');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the /api default is closed', () => {
  it('refuses a path nobody allowlisted — the state every new route starts in', async () => {
    // This is the compounding assertion. No route file exists here; if someone
    // adds one tomorrow and writes no guard, this is the answer it inherits.
    const response = await anonymous('/api/__a_route_nobody_has_written_yet__', 'POST');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ signInRequired: true });
  });

  it('refuses every real route that is not allowlisted, signed out', async () => {
    const closed = routePaths()
      .map(concrete)
      .filter((path) => classifyApiPath(path, 'GET') === 'session');

    // Guard against a vacuous pass: if the allowlist ever swallowed everything,
    // this suite would "pass" while proving nothing.
    expect(closed.length).toBeGreaterThan(100);

    const reachable: string[] = [];
    for (const path of closed) {
      const response = await anonymous(path);
      if (response.status !== 401) reachable.push(path);
    }

    expect(reachable).toEqual([]);
  });

  it('refuses the specific doors this lane was opened for', async () => {
    const doors: Array<[string, string]> = [
      ['/api/publish', 'POST'],
      ['/api/admin/probe', 'GET'],
      ['/api/admin/probe', 'POST'],
      ['/api/holomesh/marketplace/sync', 'POST'],
      ['/api/knowledge/sync', 'POST'],
    ];

    for (const [path, method] of doors) {
      const response = await anonymous(path, method);
      expect.soft(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('refuses the doors the finish pass closed, even when a header is present', async () => {
    // Each of these was reachable on "the caller typed something into a
    // header". A credential this gate cannot check is not a reason to spend
    // one of ours, so they are pinned to `session` and the header buys nothing.
    const closed: Array<[string, string]> = [
      // Attaches our EXPORT_API_KEY and has arbitrary source compiled upstream.
      ['/api/export/v2', 'POST'],
      // `self` asks "who am I" of whichever key is attached — ours, anonymously.
      ['/api/holomesh/agent/self/storefront', 'GET'],
      ['/api/holomesh/agent/self', 'GET'],
      // The one public door that moved money. An anonymous POST attached our
      // HOLOMESH_API_KEY and then wrote referral and ledger rows crediting an
      // agent the caller named. It was kept public on a stated reason — that
      // the premium-exits suite pinned anonymous reachability — which was not
      // true: that suite calls the route's POST directly and never goes through
      // this gate at all.
      ['/api/holomesh/entry/entry-abc/purchase', 'POST'],
    ];

    for (const [path, method] of closed) {
      const withHeader = await anonymous(path, method, { 'x-mcp-api-key': 'any-non-empty-string' });
      expect.soft(withHeader.status, `${method} ${path}`).toBe(401);
    }
  });

  it('refuses agent "self" however the caller spells it', async () => {
    // Next resolves routes on the DECODED path, so %73elf reaches the same
    // handler as self. A carve-out compared against the raw spelling would
    // miss, and the wildcard above it would answer with our key attached.
    for (const path of [
      '/api/holomesh/agent/%73elf/storefront',
      '/api/holomesh/agent/%73elf',
      '/api/holomesh/agent/se%6Cf/storefront',
    ]) {
      expect.soft((await anonymous(path)).status, path).toBe(401);
    }

    // …while an ordinary agent id still answers, or the carve-out ate the rule.
    for (const path of ['/api/holomesh/agent/agent-abc', '/api/holomesh/agent/agent-abc/storefront']) {
      expect.soft((await anonymous(path)).status, path).not.toBe(401);
    }
  });

  it('covers the bare path of a `**` rule, not only what is under it', async () => {
    // `/api/brittney/**` used to compile to `^/api/brittney/.*$`, which does not
    // match `/api/brittney` — the product's own chat endpoint. Every paying
    // bk_ customer was refused at the edge.
    const key = { authorization: 'Bearer bk_a_customers_own_key' };
    expect((await anonymous('/api/brittney', 'POST', key)).status).not.toBe(401);
    expect((await anonymous('/api/brittney/conversations', 'GET', key)).status).not.toBe(401);

    // The bare path is still not open to a caller with nothing.
    expect((await anonymous('/api/brittney', 'POST')).status).toBe(401);
  });

  it('still runs for /api at all — the gate is useless if the matcher skips it', () => {
    // The matcher excluded `api` until 2026-09-15. If that exclusion ever comes
    // back, every assertion above keeps passing while production is wide open,
    // because these call proxy() directly. This is the assertion that notices.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/api/publish')).toBe(true);
    expect(matcher.test('/api/anything/at/all')).toBe(true);
    expect(matcher.test('/_next/static/chunk.js')).toBe(false);
  });
});

describe('the allowlist keeps the signed-out site working', () => {
  const sample = (rule: ApiPathRule) => ({
    path: concrete(rule.pattern.replace(/\*\*/g, 'probe').replace(/\*/g, 'probe')),
    method: rule.methods?.[0] ?? 'GET',
  });

  it('every public path still answers a visitor with no credential', async () => {
    const refused: string[] = [];
    for (const rule of PUBLIC_API_PATHS) {
      const { path, method } = sample(rule);
      const response = await anonymous(path, method);
      if (response.status === 401) refused.push(`${method} ${path}`);
    }

    expect(refused).toEqual([]);
  });

  it('keeps the sign-in route reachable, or nobody could ever get a session', async () => {
    for (const path of ['/api/auth/session', '/api/auth/callback/github', '/api/auth/csrf']) {
      expect.soft((await anonymous(path)).status, path).not.toBe(401);
    }
  });

  it('never refuses a CORS preflight, which carries no credential by design', async () => {
    for (const path of ['/api/publish', '/api/admin/probe', '/api/holomesh/marketplace/sync']) {
      expect.soft((await anonymous(path, 'OPTIONS')).status, path).not.toBe(401);
    }
  });

  it('lets an agent with its own key reach the routes that run on caller keys', async () => {
    for (const rule of CALLER_CREDENTIAL_API_PATHS) {
      const { path, method } = sample(rule);

      const withKey = await anonymous(path, method, { 'x-mcp-api-key': 'an-agents-own-key' });
      expect.soft(withKey.status, `key ${method} ${path}`).not.toBe(401);

      const without = await anonymous(path, method);
      expect.soft(without.status, `bare ${method} ${path}`).toBe(401);
    }
  });

  it('does not lock out the benchmark runner on the path it actually calls', async () => {
    // requireAuth has honoured an opt-in `x-benchmark-key` bypass since before
    // this gate existed. A gate in front that refuses what the route behind it
    // would have accepted is a silent lockout, and it presents as a broken key
    // rather than as a new door. The runner posts to /api/brittney
    // (src/__benchmarks__/brittney-vs-baselines/configs/brittney-prod.ts:77).
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', 'configured-benchmark-key');

    const accepted = await anonymous('/api/brittney', 'POST', {
      'x-benchmark-key': 'configured-benchmark-key',
    });
    expect(accepted.status).not.toBe(401);

    const wrongKey = await anonymous('/api/brittney', 'POST', { 'x-benchmark-key': 'not-the-key' });
    expect(wrongKey.status).toBe(401);
  });

  it('does NOT let a benchmark header open a path the benchmark never calls', async () => {
    // The bypass was checked for every /api path, before the session test. The
    // route-level bypass it mirrors only hands a synthetic user to routes that
    // call requireAuth; at the edge, unscoped, it was a master key for all 236
    // routes — including the 164 with no guard of their own. Mirroring one door
    // is not the same as opening every door beside it.
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', 'configured-benchmark-key');

    for (const [path, method] of [
      ['/api/projects', 'GET'],
      ['/api/export/v2', 'POST'],
      ['/api/holomesh/team/team-abc/export', 'GET'],
      ['/api/__a_route_nobody_has_written_yet__', 'POST'],
    ] as Array<[string, string]>) {
      const response = await anonymous(path, method, {
        'x-benchmark-key': 'configured-benchmark-key',
      });
      expect.soft(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('the benchmark header alone opens nothing when the key is not configured', async () => {
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', '');

    const response = await anonymous('/api/brittney', 'POST', {
      'x-benchmark-key': 'anything-at-all',
    });

    expect(response.status).toBe(401);
  });

  it('pins a verb on every allowlisted entry, in BOTH tiers, so a new verb inherits nothing', () => {
    // An entry with no `methods` covers EVERY verb, including one added to the
    // route tomorrow. A route that is readable is not thereby writable, and
    // nobody revisits this file when they add a POST.
    //
    // This ratchet used to filter PUBLIC_API_PATHS alone, and the tier it
    // skipped is the one where the omission cost something. Seven
    // caller-credential entries carried no `methods`, and the sharpest was
    // /api/quest-proof/inbox: its route exports a POST with no session check
    // that pushes an arbitrary link into the founder's inbox under our
    // HOLOMESH_API_KEY. "The caller typed something into a header" was the only
    // thing in front of it. Both tiers are checked now, so the next entry
    // written without a verb fails here instead of in production.
    const openToAllVerbs = [...PUBLIC_API_PATHS, ...CALLER_CREDENTIAL_API_PATHS]
      .filter((rule) => !rule.methods?.length)
      .map((rule) => rule.pattern);

    expect(openToAllVerbs).toEqual([]);
  });

  it('documents why each allowlisted path is reachable', () => {
    for (const rule of [...PUBLIC_API_PATHS, ...CALLER_CREDENTIAL_API_PATHS]) {
      expect.soft(rule.why.trim().length, rule.pattern).toBeGreaterThan(30);
    }
  });
});

/**
 * What the signed-out site actually needs — written out by hand, on purpose.
 *
 * Everything above derives its cases FROM the allowlist, which means it can
 * only ever check that the allowlist agrees with itself. Proven on 2026-09-16:
 * a reviewer deleted the `/api/health` entry outright and the suite stayed
 * 11/11 green, because deleting an entry also deletes the test for it. A
 * regression test that vanishes along with the thing it guards is not a test.
 *
 * So this list is LITERAL and independent. Each row is a real call in a page or
 * component a signed-out visitor can open, with the file and line beside it so
 * the next reader can re-derive the claim instead of trusting it. Deleting an
 * allowlist entry that the site depends on now turns this file red and names
 * the call site that broke.
 *
 * Adding a row here is a claim that a signed-out visitor makes this call. If a
 * row is wrong, fix the row — do not widen the allowlist to satisfy it.
 */
const SIGNED_OUT_UI_DEPENDENCIES: ReadonlyArray<{
  method: string;
  path: string;
  callSite: string;
}> = [
  // Sign-in itself.
  { method: 'GET', path: '/api/auth/session', callSite: 'NextAuth; every page via SessionProvider' },
  { method: 'GET', path: '/api/auth/csrf', callSite: 'NextAuth sign-in form' },

  // Liveness and discovery. `/api/health` is the entry the reviewer deleted.
  { method: 'GET', path: '/api/health', callSite: 'next.config.js rewrite of /health; Railway + external monitors' },
  { method: 'GET', path: '/api/docs', callSite: 'agents reading how to authenticate before they can' },

  // Landing page, first paint, no session.
  { method: 'POST', path: '/api/manufacturing/mesh', callSite: 'components/landing/ParametricPartDemo.tsx:121 via app/page.tsx:438' },
  { method: 'POST', path: '/api/manufacturing/stl', callSite: 'components/landing/ParametricPartDemo.tsx:153' },
  { method: 'GET', path: '/api/feed', callSite: 'signed-out activity feed' },
  { method: 'GET', path: '/api/examples', callSite: 'landing + editor example library' },

  // Public share viewer at /shared/[id].
  { method: 'GET', path: '/api/share/abc12345', callSite: 'app/shared/[id]/page.tsx:19' },
  { method: 'POST', path: '/api/share', callSite: 'app/shared/[id]/ImmersiveViewer.client.tsx:963' },
  { method: 'GET', path: '/api/examples/hello-world', callSite: 'app/shared/[id]/ImmersiveViewer.client.tsx:642' },
  { method: 'GET', path: '/api/portable-mind/agent-abc', callSite: 'app/shared/[id]/ImmersiveViewer.client.tsx:691' },

  // Headset proof capture, from pages with no sign-in.
  { method: 'POST', path: '/api/quest-proof', callSite: 'ImmersiveViewer.client.tsx:597; components/quest/QuestProbe.tsx:127' },
  { method: 'GET', path: '/api/quest-proof', callSite: 'ImmersiveViewer.client.tsx:617; app/quest-probe/page.tsx:249 (?record=1 fallback)' },

  // Signed-out editor at /create.
  { method: 'POST', path: '/api/preview', callSite: 'app/create/page.tsx live preview compile' },
  { method: 'GET', path: '/api/registry', callSite: 'components/registry/RegistryPanel.tsx:60 via app/create/page.tsx:276' },
  { method: 'POST', path: '/api/registry/pack-abc', callSite: 'components/registry/RegistryPanel.tsx:87 download counter' },
  { method: 'GET', path: '/api/asset-packs', callSite: 'editor asset-pack catalog' },
  { method: 'GET', path: '/api/trait-registry', callSite: 'editor trait vocabulary' },
  { method: 'GET', path: '/api/nodes', callSite: 'editor node-graph panel' },

  // Public mesh catalogue pages.
  { method: 'GET', path: '/api/holomesh/agents', callSite: 'app/agents/page.tsx:47; app/holomesh/page.tsx:68' },
  { method: 'GET', path: '/api/holomesh/agent/agent-abc', callSite: 'app/agents/[id]/page.tsx:78' },
  { method: 'GET', path: '/api/holomesh/agent/agent-abc/storefront', callSite: 'app/agents/[id]/storefront/page.tsx:51' },
  { method: 'GET', path: '/api/holomesh/domains', callSite: 'app/holomesh/page.tsx:79' },
  { method: 'GET', path: '/api/holomesh/team/discover', callSite: 'app/teams/page.tsx:88' },
  { method: 'GET', path: '/api/holomesh/teams/leaderboard', callSite: 'app/holomesh/leaderboard/page.tsx:78' },
  { method: 'GET', path: '/api/holomesh/feed', callSite: 'public mesh feed' },
  { method: 'GET', path: '/api/holomesh/marketplace', callSite: 'public marketplace listing' },
  { method: 'GET', path: '/api/holomesh/search', callSite: 'public mesh search' },

  // Remaining signed-out pages.
  { method: 'GET', path: '/api/conjecture/receipts', callSite: 'app/conjecture/receipts/page.tsx:52' },
  { method: 'GET', path: '/api/training/stream', callSite: 'app/spectator/training/page.tsx:79 (EventSource, cannot send headers)' },

  // Token-authenticated phone surfaces. The `?t=` token IS the credential; a
  // phone that scanned a QR code holds no session and can never get one.
  { method: 'PUT', path: '/api/reconstruction/session', callSite: 'app/scan-room/mobile/[token]/page.tsx:233 phone-connected' },
  { method: 'GET', path: '/api/reconstruction/session', callSite: 'app/scan-room/mobile/[token]/page.tsx:441 feedback poll' },
  { method: 'PUT', path: '/api/remote', callSite: 'app/remote/[token]/page.tsx:29 viewport command' },
  { method: 'GET', path: '/api/remote', callSite: 'app/remote/[token]/page.tsx:137 token check + command queue' },

  // Public profile.
  { method: 'GET', path: '/api/users/user-abc', callSite: 'app/u/[username]/page.tsx:49 renders empty without it' },
];

describe('the signed-out site keeps working, checked against a hand-written list', () => {
  it('answers a visitor with no credential on every path the UI actually calls', async () => {
    const refused: string[] = [];

    for (const dependency of SIGNED_OUT_UI_DEPENDENCIES) {
      const response = await anonymous(dependency.path, dependency.method);
      if (response.status === 401) {
        refused.push(`${dependency.method} ${dependency.path} — called by ${dependency.callSite}`);
      }
    }

    // The failure message names the call site, so whoever broke it learns what
    // went dark rather than just which string stopped matching.
    expect(refused).toEqual([]);
  });

  it('is written out literally, not derived from the allowlist it checks', () => {
    // If someone ever "simplifies" the list above into a map over
    // PUBLIC_API_PATHS, this suite goes back to agreeing with itself and the
    // deleted-entry hole reopens. These assertions make that refactor fail.
    expect(SIGNED_OUT_UI_DEPENDENCIES.length).toBeGreaterThan(25);

    for (const dependency of SIGNED_OUT_UI_DEPENDENCIES) {
      expect.soft(dependency.path, 'concrete path, no wildcard').not.toMatch(/[*[\]]/);
      expect.soft(dependency.callSite.trim().length, dependency.path).toBeGreaterThan(10);
    }

    const patterns = new Set(PUBLIC_API_PATHS.map((rule) => rule.pattern));
    const literalPaths = SIGNED_OUT_UI_DEPENDENCIES.filter((d) => patterns.has(d.path));
    // Some rows match an allowlist pattern verbatim; many must not, or the list
    // is just the allowlist retyped and proves nothing new.
    expect(literalPaths.length).toBeLessThan(SIGNED_OUT_UI_DEPENDENCIES.length);
  });
});

/**
 * Which callers arrive with a credential of their OWN — written out by hand,
 * for the same reason the list above is.
 *
 * The derived test earlier in this file maps over CALLER_CREDENTIAL_API_PATHS
 * and substitutes `**` with `probe`, so it can only ever check that the tier
 * agrees with itself. Measured 2026-09-16: deleting `/api/brittney/**`
 * outright, or the withdraw entry, left that suite 14/14 green — because
 * deleting an entry deletes its own test case with it. Our customers are
 * agents; a lockout that no test notices is the failure this lane exists to
 * beat.
 *
 * So each row below is a real caller, with the credential it actually presents
 * and the call site that presents it. Deleting an allowlist entry now turns
 * this file red and names who stopped being able to call.
 */
const CALLER_CREDENTIAL_DEPENDENCIES: ReadonlyArray<{
  method: string;
  path: string;
  credential: string;
  header: Record<string, string>;
  callSite: string;
}> = [
  {
    method: 'POST',
    path: '/api/brittney',
    credential: "the customer's own Brittney key (bk_…), validated against the database by requireAuthOrApiKey (lib/api-auth.ts:138)",
    header: { authorization: 'Bearer bk_a_customers_own_key' },
    callSite: 'lib/brittney/BrittneySession.ts:150; sold and documented at components/settings/BrittneyAPIKeysPanel.tsx:119-126 as "no browser session required"',
  },
  {
    method: 'GET',
    path: '/api/brittney/conversations',
    credential: 'the same bk_ key on a sub-path of the same product',
    header: { authorization: 'Bearer bk_a_customers_own_key' },
    callSite: 'lib/brittney/conversationsClient.ts:57',
  },
  {
    method: 'POST',
    path: '/api/holomesh/agent/agent-abc/withdraw',
    credential: "the agent's own HoloMesh key, introspected upstream and required to BE that agent",
    header: { 'x-mcp-api-key': 'an-agents-own-mesh-key' },
    callSite: 'lib/holomesh-proxy.ts:79 resolveHoloMeshCaller — the one credential this route accepts',
  },
  {
    method: 'GET',
    path: '/api/holomesh/team/team-abc/export',
    credential: "a team member's own HoloMesh key; the route checks membership under that same key",
    header: { 'x-mcp-api-key': 'a-members-own-mesh-key' },
    callSite: 'app/api/holomesh/team/[id]/export/route.ts',
  },
  {
    method: 'POST',
    path: '/api/publish',
    credential: "the publisher's own mesh key, which the registry itself vouches for",
    header: { 'x-mcp-api-key': 'a-publishers-own-mesh-key' },
    callSite: 'app/api/publish/route.ts:49 callerMeshKey',
  },
  {
    method: 'POST',
    path: '/api/knowledge/sync',
    credential: "the caller's own mesh key, forwarded upstream unchanged",
    header: { 'x-mcp-api-key': 'a-callers-own-mesh-key' },
    callSite: 'app/api/knowledge/sync/route.ts (#304)',
  },
  {
    method: 'POST',
    path: '/api/knowledge/query',
    credential: "the caller's own mesh key",
    header: { 'x-mcp-api-key': 'a-callers-own-mesh-key' },
    // This row said GET until the 2026-09-16 verb audit. The route file exports
    // POST and nothing else — the search goes in the body — so the row was
    // claiming a caller that cannot exist. Fixed the row rather than widening
    // the allowlist to match it, which is the rule this list is written under.
    callSite: 'app/api/knowledge/query/route.ts:26 (POST is the only handler), guarded in 886264d9f',
  },
  {
    method: 'POST',
    path: '/api/holomesh/marketplace/sync',
    credential: "an operator's own mesh key; without one the route demands a session",
    header: { 'x-mcp-api-key': 'an-operators-own-mesh-key' },
    callSite: 'app/api/holomesh/marketplace/sync/route.ts',
  },
  {
    method: 'GET',
    path: '/api/mcp/call',
    credential: "the agent's own mesh key, forwarded upstream unchanged; ours is never substituted for a caller who sent one",
    header: { 'x-mcp-api-key': 'an-agents-own-key' },
    callSite: 'app/api/mcp/call/route.ts callerMeshKey — GET reads the mesh inventory under the caller own key (#302)',
  },
  {
    method: 'GET',
    path: '/api/orchestrator/gpu/lotus-status',
    credential: 'any caller credential; GET-only and allowlisted to two read-only telemetry paths',
    header: { 'x-mcp-api-key': 'an-operators-own-key' },
    callSite: 'Operations console telemetry, app/api/orchestrator/[...path]/route.ts:37-40',
  },
];

describe('the callers who arrive with their own credential, checked against a hand-written list', () => {
  it('lets every one of them through, and refuses the same call made bare', async () => {
    const refused: string[] = [];
    const openedWithoutCredential: string[] = [];

    for (const dependency of CALLER_CREDENTIAL_DEPENDENCIES) {
      const { method, path, header, credential, callSite } = dependency;

      const presented = await anonymous(path, method, header);
      if (presented.status === 401) {
        refused.push(`${method} ${path} — presenting ${credential}; called by ${callSite}`);
      }

      // The tier is "a caller arrived", so the same call with nobody behind it
      // must still be refused, or the entry is just a hole with a comment.
      const bare = await anonymous(path, method);
      if (bare.status !== 401) openedWithoutCredential.push(`${method} ${path}`);
    }

    expect(refused).toEqual([]);
    expect(openedWithoutCredential).toEqual([]);
  });

  it('accepts either header spelling agents actually arrive with', async () => {
    // mcp-server takes both, so a gate in front that takes only one is a
    // lockout wearing the costume of a bad key.
    for (const header of [
      { authorization: 'Bearer an-agents-own-mesh-key' },
      { 'x-mcp-api-key': 'an-agents-own-mesh-key' },
    ]) {
      const response = await anonymous('/api/knowledge/query', 'POST', header);
      expect.soft(response.status, JSON.stringify(header)).not.toBe(401);
    }
  });

  it('is written out literally, not derived from the tier it checks', () => {
    expect(CALLER_CREDENTIAL_DEPENDENCIES.length).toBeGreaterThan(8);

    for (const dependency of CALLER_CREDENTIAL_DEPENDENCIES) {
      expect.soft(dependency.path, 'concrete path, no wildcard').not.toMatch(/[*[\]]/);
      expect.soft(dependency.callSite.trim().length, dependency.path).toBeGreaterThan(10);
      expect.soft(dependency.credential.trim().length, dependency.path).toBeGreaterThan(10);
      expect.soft(Object.keys(dependency.header), dependency.path).toHaveLength(1);
    }

    const patterns = new Set(CALLER_CREDENTIAL_API_PATHS.map((rule) => rule.pattern));
    const retyped = CALLER_CREDENTIAL_DEPENDENCIES.filter((d) => patterns.has(d.path));
    // If every row matched a pattern verbatim this would be the tier retyped,
    // and deleting an entry would once again delete its own test.
    expect(retyped.length).toBeLessThan(CALLER_CREDENTIAL_DEPENDENCIES.length);
  });
});

/**
 * THE POSITIVE CONTROL.
 *
 * Every other test in both suites is credential-less: they all prove somebody
 * is refused. Not one of them proves anybody is ADMITTED, so the entire gate
 * rests on `getToken` behaving, and a gate that refuses everyone passes every
 * one of them. Twice now this branch has been green while the site was dark;
 * this is the assertion that would have noticed.
 *
 * It matters most for the cookie NAME. `getToken` picks one name from the
 * environment — `__Secure-next-auth.session-token` when NEXTAUTH_URL starts
 * with https, `next-auth.session-token` otherwise — and the browser's cookie
 * was named by the same setting at sign-in. If those two ever disagree, every
 * signed-in user is locked out of every session-tier path at once, and the 401
 * looks exactly like a login bug. So a real, correctly-signed token is sent
 * under BOTH names here.
 */
describe('a signed-in visitor is admitted — the check nothing else in this file makes', () => {
  const SECRET = 'test-secret-for-gate-decisions';
  const COOKIE_NAMES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

  async function sessionCookie(secret: string): Promise<string> {
    return encode({ token: { sub: 'user-1', name: 'Signed In' }, secret });
  }

  it('lets a real session through on a session-tier path, under either cookie name', async () => {
    const token = await sessionCookie(SECRET);

    for (const name of COOKIE_NAMES) {
      const response = await anonymous('/api/projects', 'GET', { cookie: `${name}=${token}` });
      expect.soft(response.status, `signed in via ${name}`).not.toBe(401);
    }
  });

  it('admits that session on paths of every tier, not just one', async () => {
    const token = await sessionCookie(SECRET);
    const cookie = { cookie: `__Secure-next-auth.session-token=${token}` };

    for (const path of ['/api/projects', '/api/export/v2', '/api/holomesh/agent/self']) {
      expect.soft((await anonymous(path, 'GET', cookie)).status, path).not.toBe(401);
    }
  });

  it('still refuses a token signed with somebody else’s secret', async () => {
    // Without this the test above would pass just as well on a gate that waved
    // every cookie through, and would be proving nothing at all.
    const forged = await sessionCookie('not-the-studio-secret');

    for (const name of COOKIE_NAMES) {
      const response = await anonymous('/api/projects', 'GET', { cookie: `${name}=${forged}` });
      expect.soft(response.status, `forged via ${name}`).toBe(401);
    }
  });

  it('still refuses a cookie that is merely present', async () => {
    for (const name of COOKIE_NAMES) {
      const response = await anonymous('/api/projects', 'GET', { cookie: `${name}=not-a-jwt` });
      expect.soft(response.status, name).toBe(401);
    }
  });

  it('refuses everyone when no secret is configured, rather than trusting the cookie', async () => {
    const token = await sessionCookie(SECRET);
    vi.stubEnv('NEXTAUTH_SECRET', '');
    vi.stubEnv('AUTH_SECRET', '');

    const response = await anonymous('/api/projects', 'GET', {
      cookie: `next-auth.session-token=${token}`,
    });

    expect(response.status).toBe(401);
  });
});
