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
 * Patterns: `*` matches one path segment, `**` matches the rest AND the bare
 * prefix it hangs off (`/api/brittney/**` covers `/api/brittney` itself — see
 * patternToRegExp for why that is the only safe reading). `methods`
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
    why: "Live preview for the signed-out editor (hooks/useLivePreview.ts:42 subscribes, :80 broadcasts). FOR THE LEAD, and stated precisely because the previous wording — 'persists nothing' — was true and still understated it. POST does not compile anything: it dispatches the posted code onto a process-global EventTarget (route.ts:19-20,34), and GET /api/preview?sceneId= streams that channel to every SSE subscriber of the same id. sceneId defaults to 'default' on BOTH sides (route.ts:30,47; useLivePreview.ts:22 sends the same default), so with no id at all a stranger's POST is delivered into the preview pane of every other visitor sitting on the default channel. Nothing is stored, so this is anonymous cross-visitor INJECTION, not a leak. Not scoped in this lane on purpose: the only real fix is an unguessable per-visitor channel id, since any scheme a stranger can guess is the same door with more steps, and changing the id contract without the editor client is the signed-out-editor lockout this lane exists to avoid.",
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
    except: ['/api/holomesh/agent/self/storefront'],
    why: "Public agent storefront page; teasers only for an anonymous caller (premium-exits suite). `self` is carved out for the same reason as /api/holomesh/agent/* above and it was missing here: this route hands the id straight to proxyHoloMesh, which attaches OUR HoloMesh key when the caller sent none, so /api/holomesh/agent/self/storefront asked upstream 'whose storefront is mine' while holding Studio's own service identity. That is the exact substitution the `self` carve-out exists to prevent. src/proxy.ts decodes the pathname before classifying, so `%73elf` cannot slip past this literal.",
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
  // `/api/holomesh/team/*/export` USED to sit here, described as "public team
  // export; teasers only for an anonymous caller (premium-exits suite)". Both
  // halves were wrong, and the entry cited a suite as cover for a door that
  // suite never checked. The premium cut (premium-view.ts) only rewrites rows
  // that carry knowledge TEXT — content, snippet, text, body, excerpt — and a
  // board task carries `title` and `description`, which it does not touch, on
  // a row with no price and no premium flag, which it does not consider
  // premium. So an anonymous GET returned any team's entire board — team,
  // open, claimed, blocked and done — fetched under our HOLOMESH_API_KEY.
  // Moved to the caller-credential tier below, where the route now requires
  // the caller to be a member of the team they are naming.
  // `/api/holomesh/entry/*/purchase` USED to sit here as "DEBT, NOT A DECISION:
  // an x402 purchase reachable anonymously. The premium-exits suite pins
  // anonymous reachability here, so gating it in this lane would break a
  // guarantee its author owns."
  //
  // That blocker did not exist. The suite it named
  // (src/lib/__tests__/premium-exits.test.ts:91) imports the route's POST and
  // calls it DIRECTLY at :293-296; it never imports src/proxy.ts or this file,
  // so no entry here could affect it in either direction. Measured 2026-09-16:
  // with the entry deleted, both cited suites are green — 36/36 — and not one
  // test needed editing. The reason was the only thing holding the door.
  //
  // What was behind it: an anonymous POST reaches
  // app/api/holomesh/entry/[id]/purchase/route.ts:16-24, which attaches our
  // HOLOMESH_API_KEY whenever the caller sends no authorization of their own,
  // and then on a 2xx with a caller-supplied referrerAgentId inserts rows into
  // holomeshReferrals and holomeshTransactions crediting an agent the stranger
  // named (:107-136). That breaks BOTH clauses of this file's own bar at :51-54
  // at once — it spends one of our credentials on a stranger's behalf, and it
  // lets a stranger choose what we persist — and it is the only public door
  // that moved money. It now falls to `session`, like everything nobody
  // declared. A buyer with their own mesh key is unaffected: they arrive with a
  // credential, which is what an x402 purchase was always supposed to carry.

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

  // ── Token-authenticated phone surfaces. On these two the `?t=` token IS the
  // credential: a phone that scanned a QR code has no Studio session and can
  // never acquire one, so requiring a session refuses the only caller the
  // surface was built for. The token is unguessable (24 and 12 random bytes),
  // the route looks it up and answers 404 when it does not resolve, and
  // src/proxy.ts:117 already treats /scan-room/mobile/ as a phone surface for
  // permissions-policy. CREATE stays closed on both — POST mints a new token,
  // which is a desktop action taken by someone who is signed in.
  {
    pattern: '/api/reconstruction/session',
    methods: ['GET', 'PUT'],
    why: "The phone half of a room or face scan: app/scan-room/mobile/[token]/page.tsx:233 (PUT phone-connected), :142 (PUT capture state) and :441 (GET feedback poll). The desktop opens the session and shows a QR; the phone that scans it holds only the token. POST is NOT here — creating a session already requires a signed-in caller in production (route.ts:51-56,133-137).",
  },
  {
    pattern: '/api/remote',
    methods: ['GET', 'PUT', 'DELETE'],
    why: "The phone half of the viewport remote: app/remote/[token]/page.tsx:137 (GET, verifies the token and polls the command queue) and :29 (PUT, sends an orbit/zoom/pan command). DELETE ends the session from the same page. Commands live in an in-process Map keyed by the token and expire in 30 minutes. POST is NOT here — it mints a token.",
  },

  {
    pattern: '/api/users/*',
    methods: ['GET', 'HEAD'],
    why: "The public profile. The route's own header calls it that (route.ts:14) and its GET reads no session at all — name, avatar, bio, public projects and published listings, each already filtered to its public form. app/u/[username]/page.tsx:49 is the page that renders it and shows an empty profile without it. GET and HEAD only: PUT on the same route updates a profile and checks both a session and that the caller IS that user (route.ts:111-119), so it stays closed here too.",
  },

  // ── Agent discovery. Measured 2026-09-16, after the flip: `/api/docs` is
  // PUBLIC, and its OpenAPI body advertises the two entries below at
  // app/api/docs/route.ts:101 and :123 — while the gate classified both
  // `session`. So the one document an agent is able to read told it to call
  // endpoints that answer 401, and the refusal looks like a broken key. That is
  // the silent-lockout half of this lane, and our customers are agents. It is
  // also the exact reasoning `/api/docs` itself is public under: a description
  // of how to authenticate cannot require authentication to read.
  {
    pattern: '/api/studio/capabilities',
    methods: ['GET', 'HEAD'],
    why: "Structured capability listing for agent discovery, advertised by the public /api/docs (route.ts:123) and called by lib/brittney/StudioAPIExecutor.ts:292. The handler is one static JSON literal: it reads no session, touches no database, spends no server key, and takes no input at all — so it clears both halves of this list's bar rather than being excused past them. GET and HEAD only; the file exports GET and OPTIONS and nothing else, so a verb added tomorrow inherits `session`.",
  },
  {
    pattern: '/api/studio/mcp-config',
    methods: ['GET', 'HEAD'],
    why: "The endpoint that tells an outside agent how to wire itself to us, advertised by the public /api/docs (route.ts:101) and called by lib/brittney/StudioAPIExecutor.ts:296. It carries credential INSTRUCTIONS, never a credential: every key in every format is the literal placeholder '<your HoloMesh API key>'. Requiring an account in order to read how to authenticate is a closed loop that no agent can open. GET and HEAD only.",
  },
  // `/api/studio/quickstart` is the third endpoint /api/docs advertises
  // (route.ts:115) and it deliberately does NOT join the two above. Its POST
  // makes an outbound call to the mesh on every request, carrying no credential
  // and doing no work on the caller's behalf first (route.ts:61-69), so opening
  // it anonymously points an unauthenticated amplifier at our own upstream. The
  // static half of what it returns is already readable through the two entries
  // above, so an agent onboarding through them loses nothing but the hello-world
  // compile. Named here, and reported, rather than quietly opened.
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
 * /api/holomesh/marketplace/sync, /api/holomesh/agent/*\/withdraw,
 * /api/holomesh/team/*\/export and /api/brittney/** actually authenticate the
 * caller. For the rest, THIS DOOR IS THE ONLY CHECK, and each such entry now
 * says so in its own `why` instead of inheriting a reassurance from up here.
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
    methods: ['POST'],
    why: "Files knowledge upstream under the caller's own key; the route forwards exactly that key and scopes a session caller to their own workspace (#304). Verb audit 2026-09-16: the route file exports POST and nothing else, and POST is the verb this caller needs — the write is made under the caller's OWN key, as themselves, which is why a write verb is admissible here at all.",
  },
  {
    pattern: '/api/knowledge/query',
    methods: ['POST'],
    why: "Reads knowledge under the caller's own key; guarded in 886264d9f. Verb audit 2026-09-16: the route file exports POST and nothing else — the search body is posted, so POST is a READ here despite the verb. There has never been a GET handler on this path, so nothing is lost by pinning it.",
  },
  {
    pattern: '/api/holomesh/marketplace/sync',
    methods: ['POST'],
    why: "Operator pre-warm of the marketplace cache. A caller's own key runs as themselves; without one the route requires a session and only then spends our key.",
  },
  {
    pattern: '/api/brittney/**',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    why: "Verb audit 2026-09-16: these four are exactly what the tree exports — POST (route.ts), GET+POST (conversations), POST (conversations/[id]/messages), GET+PATCH+DELETE (conversations/[id]). The write verbs are admissible because the caller is REALLY authenticated here, not merely header-bearing: requireAuthOrApiKey validates the bk_ key against the database and builds the session from the owning user row, so a write lands as that customer. The keys Studio SELLS for exactly this. components/settings/BrittneyAPIKeysPanel.tsx:119-126 tells the customer 'no browser session required' and to send `Authorization: Bearer bk_…`, and the routes honour it: requireAuthOrApiKey (lib/api-auth.ts:138) validates the key against the database and builds a session from the owning user row. Without this entry the edge refused the key before the route that understands it ever ran, so the advertised contract answered 401 — the worst lockout in this file, because our customers are agents. The bare path matters as much as the sub-paths: `**` covers `/api/brittney` itself (patternToRegExp), which is the endpoint the product's own client calls.",
  },
  {
    pattern: '/api/holomesh/agent/*/withdraw',
    methods: ['GET', 'POST'],
    why: "Verb audit 2026-09-16: the route exports GET and POST, and both are covered below. POST moves USDC, which is admissible ONLY because this route identifies its caller for real and requires them to BE the agent in the URL — a one-header caller who is not that agent withdraws nothing. One of the few entries where the route really does authenticate: resolveHoloMeshCaller (lib/holomesh-proxy.ts:79) introspects the caller's OWN mesh key against mcp-server /api/holomesh/me, NEVER falls back to our key, and then requires that the caller BE the agent named in the URL. Classifying it `session` refused a valid mesh key at the edge, which is the one credential this route is built to accept.",
  },
  {
    pattern: '/api/holomesh/team/*/export',
    methods: ['GET'],
    why: "A team's whole board, so the route now proves the caller is ON that team: resolveHoloMeshCaller identifies them by their OWN mesh key (never ours), then callerIsTeamMember asks mcp-server for that team's member list UNDER THAT SAME KEY and requires the caller's agentId to be in it. Anonymous is 401, a stranger's valid key is 403, and a membership answer we cannot read is 502 rather than a pass. It was previously PUBLIC on the claim that the premium-exits suite covered it; that suite only ever asserted the knowledge rows came back as teasers, and task text is not premium-classified at all, so the board was never covered by anything.",
  },

  {
    pattern: '/api/mcp/call',
    methods: ['GET', 'POST'],
    why: "The caller's OWN mesh key runs the call, so this tier's rule holds here rather than being excused. callerMeshKey (app/api/mcp/call/route.ts) reads x-mcp-api-key, or Authorization: Bearer, and forwards exactly that in the single header the upstream reads; ours is never substituted for a caller who sent one. With no key at all the route requires a Studio session and then admits only the short list of tools Studio's own UI calls, under our key. A bk_ bearer is refused rather than presented upstream, because that is a Studio credential and not a mesh one. This entry read 'NO GUARD … the caller's key is discarded' until #302 made that false, and the old wording recorded a real hole: the route built its headers from forwardAuthHeaders, which only ever sets Authorization, so the guard `!headers['x-mcp-api-key']` was ALWAYS true and HOLOSCRIPT_API_KEY was attached to every call — a one-header stranger could aim any tool name at the mesh under our identity. GET is here for the same reason and attaches our key to nothing.",
  },

  // ── Below here the route does NOT authenticate the caller. Each `why` says so
  // itself rather than leaning on the tier. All seven were audited 2026-09-16:
  // every one of them drops the caller's key and puts one of OURS on the
  // upstream request, so "the caller sent a header" is the only thing standing
  // between a stranger and our credential. (/api/mcp/call was the eighth and has
  // moved up into the group above, because #302 made it forward the caller's
  // own key instead of ours — the one repair that moves an entry between these
  // two halves.)
  {
    pattern: '/api/orchestrator/**',
    methods: ['GET'],
    why: "NO GUARD of its own, and it does spend ours: the relay sends `x-mcp-api-key` built from MCP_ORCHESTRATOR_API_KEY / HOLOSCRIPT_API_KEY / HOLOMESH_API_KEY (route.ts:30-34,63) because a browser cannot hold that key. Said plainly, since this entry previously asked for the same pin /api/export/v2 just received and the difference is the reason it does not get one: this relay is GET-only — GET and OPTIONS are the only handlers the file exports — and it answers 403 for every path outside an explicit two-entry allowlist of read-only telemetry, `gpu/lotus-status` and `serve/status` (route.ts:37-51). So the blast radius is those two read-only endpoints rather than the orchestrator, and it cannot be made to write. `methods` now pins GET here too, so a POST added to that file tomorrow inherits `session` instead of this entry.",
  },
  {
    pattern: '/api/capabilities',
    methods: ['GET'],
    why: "NO GUARD. Capability discovery, answered upstream under our MCP_ORCHESTRATOR_API_KEY / HOLOSCRIPT_API_KEY / HOLOMESH_API_KEY (route.ts:42-44). The caller's key is ignored. Low value to an attacker, but the door is still the only check.",
  },
  // `/api/export/v2` USED to sit here as "NO GUARD, and load-bearing … left
  // reachable only because the lead's hold enumerated /api/export alone". It is
  // now pinned to `session`, which is what the entry itself recommended. The
  // route attaches our EXPORT_API_KEY (route.ts:14-15) and ignores whatever the
  // caller sent, then posts the caller's source to the export service to be
  // COMPILED — arbitrary code, upstream, on our credential. "The caller typed
  // something into a header" cannot be the authorization for that. It is the
  // identical defect to /api/export, which was already pinned, and two doors
  // into the same service should not answer differently.
  {
    pattern: '/api/quest-proof/board',
    methods: ['GET'],
    why: "Headset-proof sweep agents poll it on a schedule and refusing them stops the sweep silently, so it stays reachable. Verb audit 2026-09-16: the route file exports GET only, and GET is now pinned so a POST added to it tomorrow inherits `session` instead of this entry. Read the entry below on what this tier does and does not buy here.",
  },
  {
    pattern: '/api/quest-proof/decide',
    methods: ['POST'],
    why: "Same scheduled sweep caller as /api/quest-proof/board. Verb audit 2026-09-16: the route file exports POST only, and POST is the verb the sweep needs — it marks a task done. What a one-header caller can actually write through it: NOTHING. The route opens with its own getServerSession check (route.ts:16-19) and answers 401 to a caller who has only a header, so this entry admits them to a door the route then shuts. That mismatch — the entry buys nothing, or the sweep was already broken before this branch — is real and is flagged for the lead rather than guessed at here.",
  },
  {
    pattern: '/api/quest-proof/inbox',
    methods: ['GET'],
    why: "NO GUARD, and it spends ours: upstream calls carry HOLOMESH_API_KEY (route.ts:26) against a fixed HOLOMESH_TEAM_ID. The caller's key is never used. GET stays reachable for the scheduled sweep that reads the founder's inbox. POST is NOT in this tier and this is the entry's whole point: the route exports a POST (route.ts:70-117) with no session check of any kind, which pushes an arbitrary url and label into the founder's team feed UNDER OUR KEY, with no identity recorded. On 'any non-empty header' that is a stranger planting links in the founder's inbox while spending our credential — so it is pinned to `session` until the route authenticates its own caller, exactly as /api/quest-proof/next-actions already pins its POST for the same reason.",
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
  // /api/studio/oracle-boost/status was listed here pinned to GET, but the route
  // exports only POST and OPTIONS (route.ts:90,163), so the entry admitted a verb
  // that does not exist and bought nothing. Pinning POST instead would have been
  // the wrong repair: that verb spends our HOLOSCRIPT_API_KEY and ignores the
  // caller's key, so admitting it on "any non-empty header" is the exact shape
  // this tier's own rule refuses. Removing the entry leaves POST on `session`,
  // where it already fell, and its only caller is the signed-in settings page
  // (components/settings/SettingsView.tsx:144,271).
];

/**
 * Turn a pattern into a matcher. `*` = one segment, `**` = the rest of the path
 * INCLUDING the bare prefix.
 *
 * That last part was a real 401. `**` used to compile to `/.*`, so
 * `/api/brittney/**` became `^/api/brittney/.*\/?$` — which does not match
 * `/api/brittney`. That is the product's own chat endpoint
 * (app/api/brittney/route.ts), the one its client calls
 * (lib/brittney/BrittneySession.ts:150) and the one Settings advertises to
 * paying customers (components/settings/BrittneyAPIKeysPanel.tsx:119-126,
 * "no browser session required"). Every legitimate `bk_` customer was refused
 * at the edge before the route that understands their key ever ran.
 *
 * A rule written for `/api/brittney/**` is a statement about the brittney API,
 * and `/api/brittney` is the first path in it. Anything else makes the author
 * of a new entry responsible for remembering to write the bare path twice, and
 * the failure when they forget is silent and total. Re-checked when this
 * changed: `/api/auth/**` and `/api/orchestrator/**` now also cover their bare
 * prefixes, and neither has a bare route file — `auth/[...nextauth]/route.ts`
 * and `orchestrator/[...path]/route.ts` both require at least one further
 * segment — so both bare paths 404 exactly as they did before.
 */
function patternToRegExp(pattern: string): RegExp {
  let source = '';
  pattern.split('/').forEach((segment, index) => {
    if (segment === '**') {
      source += '(?:/.*)?';
      return;
    }
    const literal =
      segment === '*' ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    source += index === 0 ? literal : `/${literal}`;
  });
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
