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
 *  - CALLER_CREDENTIAL  a caller presenting their OWN key reaches the route,
 *                       which validates or forwards it. The door here is not
 *                       the authorization — the route's own guard is.
 *  - (default)          a verified Studio session.
 *
 * Patterns: `*` matches one path segment, `**` matches the rest. `methods`
 * narrows an entry to those verbs; omitted means every verb.
 */

export type ApiAccess = 'public' | 'caller-credential' | 'session';

export interface ApiPathRule {
  /** Path pattern, e.g. `/api/share/*` or `/api/auth/**`. */
  pattern: string;
  /** Verbs this rule covers. Omitted = all verbs. */
  methods?: readonly string[];
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
    why: "NextAuth's own sign-in, callback, session and CSRF endpoints. Gating these makes signing in impossible — this is the door every other caller walks through to get a session.",
  },
  {
    pattern: '/api/health',
    why: 'Liveness. next.config.js rewrites /health here, and Railway plus external monitors poll it with no credential. A monitor that has to authenticate cannot report that authentication is down.',
  },
  {
    pattern: '/api/docs',
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
    why: 'The public example library the landing and editor pages list before anyone signs in.',
  },
  {
    pattern: '/api/examples/*',
    why: 'A single public example by name — same library as above.',
  },
  {
    pattern: '/api/feed',
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
];

/**
 * A caller presenting their OWN credential reaches these; the route then
 * validates or forwards it. Without any credential a Studio session is still
 * required.
 *
 * This tier deliberately does NOT check that the key is real — it cannot, at
 * the edge, without the upstream. It exists so an agent arriving with its own
 * key is not refused at the door and told to "sign in" when signing in is not
 * what it has. The authorization is the route's own guard, and where that guard
 * is still weak the entry says so.
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
    pattern: '/api/mcp/call',
    why: 'Agent tool-call surface reached with a caller key. Its own identity handling is being fixed in #302/#305 — this entry keeps agents reachable and does not claim the route is guarded.',
  },
  {
    pattern: '/api/orchestrator/**',
    why: 'Agent orchestrator relay reached with a caller key. Same caveat as /api/mcp/call: the route, not this tier, is the authorization.',
  },
  {
    pattern: '/api/capabilities',
    methods: ['GET'],
    why: 'Capability discovery agents call with their own key before they have a session.',
  },
  {
    pattern: '/api/export',
    why: 'Compile/export reached by agents with their own key.',
  },
  {
    pattern: '/api/export/v2',
    why: 'Compile/export reached by agents with their own key.',
  },
  {
    pattern: '/api/quest-proof/board',
    why: 'Headset-proof sweep agents call this with their own key on a schedule; refusing them would silently stop the sweep.',
  },
  {
    pattern: '/api/quest-proof/decide',
    why: 'Headset-proof sweep agents call this with their own key on a schedule.',
  },
  {
    pattern: '/api/quest-proof/inbox',
    why: 'Headset-proof sweep agents call this with their own key on a schedule.',
  },
  {
    pattern: '/api/quest-proof/next-actions',
    why: 'Headset-proof sweep agents call this with their own key on a schedule.',
  },
  {
    pattern: '/api/holoshell/machine-state',
    methods: ['GET'],
    why: 'HoloShell machines report in with their own key rather than a browser session.',
  },
  {
    pattern: '/api/studio/oracle-boost/status',
    why: 'Oracle-boost status polled by an agent holding its own key.',
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

const compiled = new WeakMap<readonly ApiPathRule[], Array<{ re: RegExp; rule: ApiPathRule }>>();

function compile(rules: readonly ApiPathRule[]) {
  let entry = compiled.get(rules);
  if (!entry) {
    entry = rules.map((rule) => ({ re: patternToRegExp(rule.pattern), rule }));
    compiled.set(rules, entry);
  }
  return entry;
}

function findRule(
  rules: readonly ApiPathRule[],
  pathname: string,
  method: string
): ApiPathRule | null {
  for (const { re, rule } of compile(rules)) {
    if (!re.test(pathname)) continue;
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
