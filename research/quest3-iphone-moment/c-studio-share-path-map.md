# (c) Studio `/w/<hash>` Share Path — Codebase Map

**Headline:** Share publish + read + SSR viewer are already shipped. Path to the iPhone-moment "hand a URL to your friend" flow is ~2 days of edits, not new infrastructure.

---

## What's already built (no work needed)

| Piece | File | Status |
|---|---|---|
| Publish endpoint | [packages/studio/src/app/api/share/route.ts](../../packages/studio/src/app/api/share/route.ts) | `POST` accepts `{name, code, author}`, returns `{id, url}`. Drizzle+Postgres when `DATABASE_URL` set, in-memory fallback otherwise. |
| Read-by-id endpoint | [packages/studio/src/app/api/share/[id]/route.ts](../../packages/studio/src/app/api/share/[id]/route.ts) | `GET /api/share/[id]` returns scene. CORS OPTIONS handler present. |
| Public viewer | [packages/studio/src/app/shared/[id]/page.tsx](../../packages/studio/src/app/shared/[id]/page.tsx) | SSR, ISR (60s), OpenGraph metadata for link previews. |
| Publisher hook | [packages/studio/src/hooks/useSceneShare.ts](../../packages/studio/src/hooks/useSceneShare.ts) | `publish()`, `loadGallery()`, returns `shareUrl = ${origin}/shared/${id}`. |
| Gallery listing | same `POST /api/share` route — `GET` method | in-place. |
| Test coverage | [packages/studio/src/hooks/__tests__/useSceneShare.test.ts](../../packages/studio/src/hooks/__tests__/useSceneShare.test.ts) | exists — extend when editing. |

**You already have share URLs.** Today, `POST /api/share` with a `.holo` payload returns an id you can hand to anyone. This is the boring-but-essential backbone.

## Gaps for the iPhone-moment flow

### G1 — Short route `/w/<hash>` instead of `/shared/<id>` (P1, 30 min)

`/w/XYZ123` on a small Quest screen beats `/shared/9f3a2b6c-8e1d-47aa-b5f2-7c4a0d3e8912`. Alias, don't rename.

**Files to add:**
- `packages/studio/src/app/w/[id]/page.tsx` — re-export the `/shared/[id]` page as a thin wrapper, or symlink logic via a shared component.

**No DB migration.** Same id space; shorter URL surface.

### G2 — WebXR auto-enter on the viewer (P0, 1–2 days)

`/shared/[id]` today renders a 2D preview + code. On a Quest 3, the user wants "URL open → 3 seconds later → inside the scene." No tap-to-enter ceremony.

**Files to touch:**
- `packages/studio/src/app/shared/[id]/page.tsx` — split into server component (metadata, fetch) + client component.
- `packages/studio/src/app/shared/[id]/ImmersiveViewer.client.tsx` (new) — `"use client"`, detects WebXR support, button to enter; on Quest's Meta Browser, auto-tap the button after 2s if `navigator.userAgent.includes('OculusBrowser')`.
- Render path: compile `.holo` source in-browser (compiler-wasm) → hand AST to the r3f-renderer → wrap with `<XR>` from `@react-three/xr`. (Add dep if not already present.)

**Expected diff:** ~150 LOC new client component + ~10 LOC userAgent sniff. No server-side work.

### G3 — Content-addressed ids (P2, 4–6 hours, optional for v0)

Today each publish creates a new UUID. Republishing the same scene makes a new URL. For demos — where Joseph will republish as he iterates — a content hash gives stable URLs and deduplicates storage.

**File to touch:**
- `packages/studio/src/app/api/share/route.ts` — before insert: `const id = sha256(canonicalize(code)).slice(0, 12);`. On duplicate, return existing id. Break ties by keeping earliest `createdAt`.

**Why optional for v0:** the share flow works without it. Add when we see Joseph publishing the same scene 5x during a demo.

### G4 — Query-by-id instead of list+filter (P2, 30 min)

`GET /api/share/[id]` currently fetches the full list and filters. O(n) on every view, won't scale past ~100 scenes.

**File to touch:**
- `packages/studio/src/app/api/share/[id]/route.ts` — direct `db.select().from(sharedScenes).where(eq(sharedScenes.id, id)).limit(1)`. Also increment `views` here.

**Do this when G3 lands.** Together they take the API from prototype to production.

### G5 — COOP/COEP headers on `studio.holoscript.net` deployment (P1, 15 min)

Compiler-wasm uses `SharedArrayBuffer` for faster parse. SAB requires cross-origin isolation. Without these headers, the browser forbids SAB and wasm falls back to slower codepath (still works, just slower).

**File to touch:**
- `packages/studio/next.config.ts` — add headers:
  ```ts
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    }];
  }
  ```
- Probe (a) step 7 tells you if this is needed. If SAB shows YELLOW on Quest, do this.

**Caveat:** COEP breaks cross-origin embeds (iframes, external images). Audit Studio's third-party dependencies before enabling. If there are loaded assets from a non-isolated origin, either host them via Studio or use `credentialless` COEP mode.

### G6 — Publish-from-inside-VR button (P0, 1 day)

Joseph is in the headset. He says "share this." The UI must be a big, hand-reachable button inside the WebXR session — not a 2D DOM button. Uses `@react-three/drei` 3D components inside the `<XR>` root.

**Files to add:**
- `packages/studio/src/components/xr/PublishButton.tsx` (new) — 3D mesh button, on trigger: POST to `/api/share`, display returned URL as a 3D QR code you can point your phone at.
- `packages/studio/src/components/xr/QRDisplay.tsx` (new) — small wrapper around `qrcode` npm lib rendering to a texture.

**Why QR:** the whole iPhone-moment test requires "hand a URL to your friend." Reading a URL off a headset display into someone's phone is annoying. Pointing their phone camera at a QR in your scene is magic. This is the difference between a demo and a moment.

---

## Dependencies not yet installed

Run this once, probably in the `studio` package:

```
pnpm --filter @holoscript/studio add @react-three/xr three @react-three/drei qrcode
pnpm --filter @holoscript/studio add -D @types/qrcode
```

(Confirm `three` isn't already a transitive dep before adding; check `r3f-renderer`'s peerDeps first.)

---

## Concrete sprint — two days to demo

| Day | Task | Gate |
|---|---|---|
| Day 1 AM | G5 (COOP/COEP) + G1 (`/w/<id>` alias) | Probe (a) SAB goes GREEN |
| Day 1 PM | G2 (WebXR viewer for `/shared/[id]`) — render a scene from a hand-crafted seed id | Open `/w/<seed-id>` on Quest, session auto-enters, scene visible |
| Day 2 AM | G6 (publish button + QR in-VR) | From inside a scene, tap button → QR appears → phone reads URL |
| Day 2 PM | End-to-end acceptance: publish a scene from Studio editor (2D) → open `/w/<returned-id>` on Quest → inside-VR republish button → QR → phone sees same scene in a non-headset browser | iPhone moment v0 passes |

---

## What this does not cover (non-blockers for v0)

- **Auth.** Scenes are published as "Anonymous" by default. Fine for demo; add Clerk/auth when moderation matters.
- **Moderation.** Public gallery with anonymous publish = spam risk. Add rate limiting + reporting before a public launch, not before Joseph's first share-with-a-friend test.
- **Persistence / edit-after-publish.** Published scenes are immutable. "Edit and republish" creates a new URL. Good UX for v0 — we add "save draft" later.
- **Multi-user.** Two headsets in the same scene = Path B (native Quest app) or the Three.js sync layer we haven't built yet. v0 is single-user creation, many-viewer consumption.

---

## The one thing that must work first

Before any of G1–G6, probe (a) must return GREEN for (2) VR session start and (8) Studio fetch. Everything downstream depends on those two. If both are GREEN, the rest of this doc is an engineering sprint. If either is RED, this plan stalls until we know why.
