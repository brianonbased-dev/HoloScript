/**
 * The one file that says which Studio API paths a stranger may reach.
 *
 * WHY THIS EXISTS. `src/proxy.ts` matched `/((?!api|_next/|favicon.ico).*)` —
 * every `/api` route was reachable by anyone, and each guard was a hand-patch
 * against that default. Nine rounds of per-route fixes each revealed the next
 * open door, because closing a door one at a time never changes what a NEW
 * door does. Census of 2026-09-15: 236 route files, 164 with no caller gate of
 * any kind, 27 of those attaching one of our own server keys.
 *
 * So the default is inverted: `/api/**` requires a caller, and publicness is
 * declared HERE, once, with a reason. A route added tomorrow is closed without
 * anyone remembering to close it.
 *
 * Three tiers:
 *  - PUBLIC             anyone, no credential. Every entry says why.
 *  - CALLER_CREDENTIAL  the caller sent SOME credential header. That is the
 *                       whole check at this tier — see the tier's own comment,
 *                       which says plainly where the route behind it adds
 *                       nothing and this door is therefore the only one.
 *  - (default)          a verified Studio session.
 *
 * Patterns: `*` matches one path segment, `**` matches the rest. `methods`
 * narrows an entry to those verbs; omitted means every verb. `except` carves
 * concrete paths back out of a wildcard, for when one segment value means
 * something categorically different from its siblings (`/api/holomesh/agent/self`
 * is "who am I", not "show me agent X").
 */

export type ApiAccess = 'public' | 'caller-credential' | 'session';

export interface ApiPathRule {
  /** Path pattern, e.g. `/api/share/*` or `/api/auth/**`. */
  pattern: string;
  /** Verbs this rule covers. Omitted = all verbs. */
  methods?: readonly string[];
  /**
   * Patterns this rule does NOT cover, even though `pattern` matches them.
   * Checked before `pattern`, so the narrower statement wins.
   */
  except?: readonly string[];
  /** Why this is reachable this way. Required — an entry with no reason is a guess. */
  why: string;
}

/**
 * Reachable with no credential at all.
 *
 * The bar for an entry: a signed-out visitor genuinely needs it, AND it neither
 * spends one of our server credentials on a stranger's behalf nor lets a
 * stranger choose what we persist. Where an entry falls short of that bar it
 * says so, so the next reader sees the debt instead of inheriting it silently.
 */
export const PUBLIC_API_PATHS: readonly ApiPathRule[] = [
  {
    pattern: '/api/auth/**',
    methods: ['GET', 'POST'],
    why: "NextAuth's own sign-in, callback, session and CSRF endpoints. Gating these makes signing in impossible — this is the door every other caller walks through to get a session.",
  },
  {
    pattern: '/api/health',
    methods: ['GET', 'HEAD'],
    why: 'Liveness. next.config.js rewrites /health here, and Railway plus external monitors poll it with no credential. A monitor that has to authenticate cannot report that authentication is down.',
  },
  {
    pattern: '/api/docs',
    methods: ['GET', 'HEAD'],
    why: 'The OpenAPI description. An agent reads this to find out how to authenticate, so it cannot itself require authentication.',
  },
  {
    pattern: '/api/publish',
    methods: ['GET'],
    why: 'Loads a published scene by id for the share viewer. Publishing a scene is the act of making it readable; the POST side is NOT public.',
  },
  {
    pattern: '/api/share/*',
    methods: ['GET', 'HEAD'],
    why: 'The share viewer resolves a share token to a scene. Sharing a link to someone who must first sign in is not sharing.',
  },
  {
    pattern: '/api/hologram/*/*',
    methods: ['GET', 'HEAD'],
    why: 'Content-addressed bundle bytes, served immutable and long-cached. The route states this is a public read; uploads are authenticated separately.',
  },
  {
    pattern: '/api/examples',
    methods: ['GET', 'HEAD'],
    why: 'The public example library the landing and editor pages list before anyone signs in.',
  },
  {
    pattern: '/api/examples/*',
    methods: ['GET', 'HEAD'],
    why: 'A single public example by name — same library as above.',
  },
  {
    pattern: '/api/feed',
    methods: ['GET', 'HEAD'],
    why: 'The public activity feed rendered to signed-out visitors.',
  },

  // ── Editor catalogs. The editor at /create does NOT redirect to sign-in, so a
  // signed-out visitor can open it; these are its read-only catalog calls. All
  // are keyless and write nothing. Gating them would break anonymous editing —
  // the exact "legitimate caller locked out" failure this lane must avoid.
  {
    pattern: '/api/asset-packs',
    methods: ['GET'],
    why: 'Editor asset-pack catalog. Read-only, no credential attached, usable before sign-in.',
  },
  {
    pattern: '/api/audio-presets',
    methods: ['GET'],
    why: 'Editor audio preset catalog. Read-only, no credential attached.',
  },
  {
    pattern: '/api/environment-presets',
    methods: ['GET'],
    why: 'Editor environment preset catalog. Read-only, no credential attached.',
  },
  {
    pattern: '/api/shader-presets',
    methods: ['GET'],
    why: 'Editor shader preset catalog. Read-only, no credential attached.',
  },
  {
    pattern: '/api/trait-registry',
    methods: ['GET'],
    why: 'Trait vocabulary the editor needs to render a scene graph. Read-only, no credential attached.',
  },
  {
    pattern: '/api/plugins/node-types',
    methods: ['GET'],
    why: 'Node-graph vocabulary for the editor. Read-only, no credential attached.',
  },
  {
    pattern: '/api/nodes',
    methods: ['GET'],
    why: 'Node-graph panel catalog. Read-only, no credential attached.',
  },
  {
    pattern: '/api/lod',
    methods: ['GET'],
    why: 'Level-of-detail settings the viewport reads. Read-only, no credential attached.',
  },
  {
    pattern: '/api/polyhaven',
    methods: ['GET'],
    why: 'Proxied public asset search against a third-party free library. Read-only.',
  },
  {
    pattern: '/api/surface/*',
    methods: ['GET'],
    why: 'Marketing and vertical landing surfaces rendered for signed-out visitors.',
  },
  {
    pattern: '/api/preview',
    methods: ['GET', 'POST'],
    why: 'Live preview compile for the signed-out editor. Keyless and persists nothing; its cost ceiling is its own concern, not a door.',
  },

  // ── HoloMesh read relays. These are pinned anonymous by an existing suite
  // (src/lib/__tests__/premium-exits.test.ts, the #299/#304 doors work): a
  // visitor with no key must reach them and must receive premium rows as
  // teasers. Gating them would both break the public catalogue and delete the
  // guarantee that suite exists to prove.
  {
    pattern: '/api/holomesh/feed',
    methods: ['GET'],
    why: 'Public mesh feed; premium rows already reach an anonymous caller as teasers (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/marketplace',
    methods: ['GET'],
    why: 'Public marketplace listing; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/marketplace/trending',
    methods: ['GET'],
    why: 'Public trending listing; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/search',
    methods: ['GET'],
    why: 'Public mesh search; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/agent/*/storefront',
    methods: ['GET'],
    why: 'Public agent storefront page; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/entry/*',
    methods: ['GET'],
    why: 'A single public catalogue entry; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/knowledge/catalog',
    methods: ['GET'],
    why: 'Public knowledge catalogue; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/team/*/export',
    methods: ['GET'],
    why: 'Public team export; teasers only for an anonymous caller (premium-exits suite).',
  },
  {
    pattern: '/api/holomesh/entry/*/purchase',
    methods: ['POST'],
    why: "DEBT, NOT A DECISION: an x402 purchase reachable anonymously. The premium-exits suite pins anonymous reachability here, so gating it in this lane would break a guarantee its author owns. Left exactly as reachable as it is today and named in the PR as the next door — it writes referral and transaction rows for a caller nobody identified.",
  },

  // ── Derived 2026-09-16, not inherited. Method: for every page or component a
  // signed-out visitor can actually open (no getServerSession, no redirect to
  // /auth, no signIn gate), every /api path it fetches. Each entry names the
  // call site that proves it, so a reader can re-derive the claim instead of
  // trusting this list. Paths that a reviewer's list named but no signed-out
  // caller actually fetches are deliberately ABSENT — see the PR notes for
  // /api/quest-proof/gate-stats and /api/quest-proof/task, which have zero call
  // sites anywhere in the package.

  {
    pattern: '/api/manufacturing/mesh',
    methods: ['POST'],
    why: 'The landing page runs this on first paint: components/landing/ParametricPartDemo.tsx:121, mounted by app/page.tsx:438. Keyless, touches no database, and returns geometry computed from the posted SDF — a POST because the shape goes in the body, not because it writes. Gating it blanks the first thing a stranger sees.',
  },
  {
    pattern: '/api/manufacturing/stl',
    methods: ['POST'],
    why: 'Export half of the same landing demo, components/landing/ParametricPartDemo.tsx:153. Keyless, persists nothing, returns STL bytes for the shape posted to it.',
  },
  {
    pattern: '/api/quest-proof',
    methods: ['GET', 'POST'],
    why: "Headset proof capture from pages with no sign-in: app/shared/[id]/ImmersiveViewer.client.tsx:597 (POST) and :617 (GET fallback), components/quest/QuestProbe.tsx:127,143, app/quest-probe/page.tsx:249. This one WRITES anonymously, so plainly: a stranger can append one capped JSON line (label 300, detail 4000, url 2000, userAgent 1000 chars) to .bench-logs/format-stress/<runId>/quest-proof/receipts.jsonl. runId is sanitised to [A-Za-z0-9._-] and cut to 96 chars, so it cannot escape that directory; no server key is spent and no database row is created. Acceptable because the writer is a headset visitor who by definition has no account. NOT acceptable forever: nothing bounds the NUMBER of lines, so this is a disk-growth door until it is rate-limited. GET is here only because it carries the same write via ?record=1 when POST fails on the tunnel.",
  },
  {
    pattern: '/api/portable-mind/*',
    methods: ['GET', 'HEAD'],
    why: "The share viewer renders an agent's portable mind: app/shared/[id]/ImmersiveViewer.client.tsx:691. Read-only. Note for the next reader: the route builds the mind with a server-held seat key, and returns only the wallet ADDRESS plus memories already filtered to their public form — the key itself is never in the response. It answers 503 when no seat is configured, which is the common deployed case.",
  },
  {
    pattern: '/api/share',
    methods: ['POST'],
    why: "Publishing a voice-authored scene from the share viewer, app/shared/[id]/ImmersiveViewer.client.tsx:963. The route is explicitly built for this ('Sharing stays open to anonymous users') and stores ownerId null. Stated plainly: a stranger can persist an arbitrary code string as a new shared scene. That is the existing product decision, not one made here. Deliberately POST-only — bare GET /api/share lists the 50 most recent shares of EVERY user and is left session-gated by this flip.",
  },

  // ── Mesh catalogue reads behind signed-out pages. Same posture as the relays
  // above: our server key goes upstream when the visitor has none, so premium
  // rows come back cut to teasers (premium-view.ts).
  {
    pattern: '/api/holomesh/agents',
    methods: ['GET', 'HEAD'],
    why: 'Agent directory on three pages a stranger can open: app/agents/page.tsx:47, app/holomesh/page.tsx:68, app/holomesh/discover/page.tsx:81.',
  },
  {
    pattern: '/api/holomesh/agent/*',
    methods: ['GET', 'HEAD'],
    except: ['/api/holomesh/agent/self'],
    why: "Public agent profile read: app/agents/[id]/page.tsx:78 and app/agents/[id]/storefront/page.tsx:51, neither of which requires a session. `self` is carved out because it is a different question — the same route file answers 'who am I' for id=self by introspecting the caller's key, and with no caller key it would introspect OURS and hand a stranger Studio's own service-agent identity. Anonymous belongs at 401 there, so AppShell.tsx:205 and header/Toolbar.tsx:666 must tolerate one.",
  },
  {
    pattern: '/api/holomesh/domains',
    methods: ['GET', 'HEAD'],
    why: 'Domain list on the signed-out mesh landing page, app/holomesh/page.tsx:79.',
  },
  {
    pattern: '/api/holomesh/team/discover',
    methods: ['GET', 'HEAD'],
    why: 'Team discovery listing on app/teams/page.tsx:88, a page with no session gate.',
  },
  {
    pattern: '/api/holomesh/teams/leaderboard',
    methods: ['GET', 'HEAD'],
    why: 'Leaderboard on app/holomesh/leaderboard/page.tsx:78, a page with no session gate.',
  },

  // ── Editor and remaining signed-out pages.
  {
    pattern: '/api/registry',
    methods: ['GET', 'HEAD'],
    why: 'Asset-pack catalogue for the editor panel, components/registry/RegistryPanel.tsx:60, loaded by app/create/page.tsx:276 — an editor that does not require signing in. GET only: POST /api/registry appends to the pack list with no credential and stays closed.',
  },
  {
    pattern: '/api/registry/*',
    methods: ['GET', 'HEAD', 'POST'],
    why: 'One pack by id, plus the download counter the same panel increments at components/registry/RegistryPanel.tsx:87. The POST adds 1 to an in-process counter and nothing else. DELETE is deliberately excluded — the route implements it with no credential check at all.',
  },
  {
    pattern: '/api/conjecture/receipts',
    methods: ['GET', 'HEAD'],
    why: 'Receipt list on app/conjecture/receipts/page.tsx:52, a page with no session gate. Read-only and keyless. The sibling POST /api/conjecture/receipts/*/replay re-runs a geometry suite on the server and is left closed, so that page loses its replay button while signed out.',
  },
  {
    pattern: '/api/training/stream',
    methods: ['GET'],
    why: "Server-sent events consumed by app/spectator/training/page.tsx:79 through EventSource, which cannot attach headers — if this sat in the caller-credential tier no browser could ever reach it. Keyless, reads an in-process job history. GET only: POST on the same route broadcasts a packet to every connected viewer with no credential and stays closed.",
  },
];

/**
 * A caller presenting their OWN credential reaches these; the route then
 * validates or forwards it. Without any credential a Studio session is still
 * required.
 *
 * READ THIS BEFORE ADDING AN ENTRY. `hasCallerCredential` in src/proxy.ts
 * accepts ANY non-empty `x-mcp-api-key`, or any `Authorization: Bearer <one
 * non-space token>`. It does not and cannot check that the credential is real.
 * So the honest description of this tier is: "the caller typed something into a
 * header."
 *
 * An earlier version of this comment claimed "the authorization is the route's
 * own guard." That was false for most of the list. Audited 2026-09-16: of the
 * entries below, only /api/publish, /api/knowledge/sync, /api/knowledge/query,
 * /api/holomesh/marketplace/sync, /api/holomesh/agent/*\/withdraw and
 * /api/brittney/** actually authenticate the caller. For the rest, THIS DOOR IS
 * THE ONLY CHECK, and each such entry now says so in its own `why` instead of
 * inheriting a reassurance from up here.
 *
 * The rule that follows from that: a route which ignores the caller's key and
 * spends one of OURS does not belong in this tier at any strength of comment,
 * because "presented a header" is not a reason to spend our credential. Those
 * are pinned to `session` until they grow a real guard.
 */
export const CALLER_CREDENTIAL_API_PATHS: readonly ApiPathRule[] = [
  {
    pattern: '/api/publish',
    methods: ['POST'],
    why: "A caller's own mesh key publishes to the registry as themselves. The route now requires a session OR an upstream leg that actually succeeded before it persists anything locally.",
  },
  {
    pattern: '/api/knowledge/sync',
    why: "Files knowledge upstream under the caller's own key; the route forwards exactly that key and scopes a session caller to their own workspace (#304).",
  },
  {
    pattern: '/api/knowledge/query',
    why: "Reads knowledge under the caller's own key; guarded in 886264d9f.",
  },
  {
    pattern: '/api/holomesh/marketplace/sync',
    methods: ['POST'],
    why: "Operator pre-warm of the marketplace cache. A caller's own key runs as themselves; without one the route requires a session and only then spends our key.",
  },
  {
    pattern: '/api/brittney/**',
    why: "The keys Studio SELLS for exactly this. components/settings/BrittneyAPIKeysPanel.tsx:119-126 tells the customer 'no browser session required' and to send `Authorization: Bearer bk_…`, and the routes honour it: requireAuthOrApiKey (lib/api-auth.ts:138) validates the key against the database and builds a session from the owning user row. Without this entry the edge refused the key before the route that understands it ever ran, so the advertised contract answered 401 — the worst lockout in this file, because our customers are agents.",
  },
  {
    pattern: '/api/holomesh/agent/*/withdraw',
    why: "One of the few entries where the route really does authenticate: resolveHoloMeshCaller (lib/holomesh-proxy.ts:79) introspects the caller's OWN mesh key against mcp-server /api/holomesh/me, NEVER falls back to our key, and then requires that the caller BE the agent named in the URL. Classifying it `session` refused a valid mesh key at the edge, which is the one credential this route is built to accept.",
  },

  // ── Below here the route does NOT authenticate the caller. Each `why` says so
  // itself rather than leaning on the tier. All nine were audited 2026-09-16:
  // every one of them drops the caller's key and puts one of OURS on the
  // upstream request, so "the caller sent a header" is the only thing standing
  // between a stranger and our credential.
  {
    pattern: '/api/mcp/call',
    methods: ['GET', 'POST'],
    why: 'NO GUARD. The route reads no caller identity at all and calls upstream with our HOLOSCRIPT_API_KEY (route.ts:38); the caller\'s key is discarded. This door — "some non-empty header arrived" — is the only check. Kept reachable because agents depend on it and #302/#305 are fixing the identity handling; it is NOT safe on the strength of this entry.',
  },
  {
    pattern: '/api/orchestrator/**',
    why: "NO GUARD, and it spends ours: the relay sends `x-mcp-api-key` built from MCP_ORCHESTRATOR_API_KEY / HOLOSCRIPT_API_KEY / HOLOMESH_API_KEY (route.ts:31,63) and its own header comment concedes browsers cannot hold that key — which is precisely why it substitutes ours. The caller's credential is never forwarded or checked. Same standing as /api/mcp/call and it deserves the same pin; flagged to the lead.",
  },
  {
    pattern: '/api/capabilities',
    methods: ['GET'],
    why: "NO GUARD. Capability discovery, answered upstream under our MCP_ORCHESTRATOR_API_KEY / HOLOSCRIPT_API_KEY / HOLOMESH_API_KEY (route.ts:42-44). The caller's key is ignored. Low value to an attacker, but the door is still the only check.",
  },
  {
    pattern: '/api/export/v2',
    why: "NO GUARD, and load-bearing: it attaches our EXPORT_API_KEY (route.ts:14-15) and ignores whatever the caller sent, so any non-empty header spends our export credential. This is the SAME defect as /api/export, which is now pinned to `session`. Left reachable only because the lead's hold enumerated /api/export alone; recommended for the identical pin and named in the PR notes.",
  },
  {
    pattern: '/api/quest-proof/board',
    why: "NO GUARD of its own. Headset-proof sweep agents poll it on a schedule and refusing them stops the sweep silently, so it stays reachable — but the authorization is this door, not the route.",
  },
  {
    pattern: '/api/quest-proof/decide',
    why: "NO GUARD of its own. Same scheduled sweep caller as /api/quest-proof/board; same caveat, the door is the only check.",
  },
  {
    pattern: '/api/quest-proof/inbox',
    why: "NO GUARD, and it spends ours: upstream calls carry HOLOMESH_API_KEY (route.ts:26) against a fixed HOLOMESH_TEAM_ID. The caller's key is never used. Kept reachable for the scheduled sweep only.",
  },
  {
    pattern: '/api/quest-proof/next-actions',
    methods: ['GET'],
    why: "NO GUARD, and it spends our HOLOMESH_API_KEY (route.ts:16). GET stays reachable for the scheduled sweep agents that poll it. POST is NOT in this tier: it writes a founder-approval decision under our key, so it is pinned to `session` until the route authenticates its own caller.",
  },
  {
    pattern: '/api/holoshell/machine-state',
    methods: ['GET'],
    why: "NO GUARD. Machines report in without a browser session, but the route identifies them by our HOLOSCRIPT_API_KEY / HOLOMESH_API_KEY (route.ts:31) and a server-side seat id, not by the caller's key. The door is the only check.",
  },
  {
    pattern: '/api/studio/oracle-boost/status',
    methods: ['GET'],
    why: "NO GUARD. Status polling; the route sets `x-mcp-api-key` from our HOLOSCRIPT_API_KEY (route.ts:23,66) and ignores the caller's. GET only — POST on the same route is left to `session`.",
  },
];

/** Turn a pattern into a matcher. `*` = one segment, `**` = the rest. */
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment === '**') return '.*';
      if (segment === '*') return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${source}/?$`);
}

const compiled = new WeakMap<
  readonly ApiPathRule[],
  Array<{ re: RegExp; except: RegExp[]; rule: ApiPathRule }>
>();

function compile(rules: readonly ApiPathRule[]) {
  let entry = compiled.get(rules);
  if (!entry) {
    entry = rules.map((rule) => ({
      re: patternToRegExp(rule.pattern),
      except: (rule.except ?? []).map(patternToRegExp),
      rule,
    }));
    compiled.set(rules, entry);
  }
  return entry;
}

function findRule(
  rules: readonly ApiPathRule[],
  pathname: string,
  method: string
): ApiPathRule | null {
  for (const { re, except, rule } of compile(rules)) {
    if (!re.test(pathname)) continue;
    if (except.some((carveOut) => carveOut.test(pathname))) continue;
    if (rule.methods && !rule.methods.includes(method.toUpperCase())) continue;
    return rule;
  }
  return null;
}

/** The public rule covering this request, if any — the `why` is the audit trail. */
export function publicRuleFor(pathname: string, method: string): ApiPathRule | null {
  return findRule(PUBLIC_API_PATHS, pathname, method);
}

/** The caller-credential rule covering this request, if any. */
export function callerCredentialRuleFor(pathname: string, method: string): ApiPathRule | null {
  return findRule(CALLER_CREDENTIAL_API_PATHS, pathname, method);
}

/**
 * How this request may be authorized. Anything not named above needs a session —
 * that default is the point of the file.
 */
export function classifyApiPath(pathname: string, method: string): ApiAccess {
  if (publicRuleFor(pathname, method)) return 'public';
  if (callerCredentialRuleFor(pathname, method)) return 'caller-credential';
  return 'session';
}
