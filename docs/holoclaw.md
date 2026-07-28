# HoloClaw — Embodied Agent Skill System

> **Updated**: 2026-06-13 | **Source**: Direct audit of `route.ts`, `embodiment.ts`, `embodiedAgents.ts`, `HoloClaw3DDeck.tsx`, `MotionSourceTrait.ts`, `HoloClawTab.tsx` | Live on `main`.

HoloClaw is HoloScript's skill execution system for embodied fleet agents. An agent runs a skill (`compositions/skills/<name>.hsplus`), registers on HoloMesh as a dispatchable target, and produces a visible avatar in the Studio 3D deck — all from a single `POST /api/holoclaw/run`. Nothing launched by HoloClaw is headless.

---

## Architecture

```
POST /api/holoclaw/run
  ├── spawn holodaemon child process  (execution engine)
  ├── registerHoloClawFleetAgent()    (HoloMesh dispatchable target + presence)
  ├── buildEmbodiedAgentCard()        ─┐
  │     └── buildAgentAvatarHolo()    │  embodiment artifact (non-headless guarantee)
  └── buildEmbodimentActivityEntry()  ─┘  → outbox.jsonl → SSE → deck
                                                                 └── HoloClaw3DDeck
                                                                       └── EmbodiedAvatarNode
```

The daemon child is the **execution engine**. The embodiment artifacts are what make it visible: a card with a deterministic-hue avatar and a `.holo` composition that any 3D surface can render.

---

## Non-Headless Guarantee

**Every launched skill produces an embodiment artifact.** This is enforced in `packages/studio/src/app/api/holoclaw/run/route.ts`:

```typescript
// EMBODIMENT (non-headless guarantee): every launched agent gets a visible,
// embodied representation — a deck card + a .holo avatar — even when fleet
// registration is disabled.
const embodiment = buildEmbodiedAgentCard(identity, 'running', fleet?.presence ?? false);
entry.embodiment = embodiment;
fs.appendFileSync(outboxPath, JSON.stringify(buildEmbodimentActivityEntry(embodiment)) + '\n');
```

The embodiment artifact (`EmbodiedAgentCard`) is:

1. **Appended to outbox** → SSE activity feed → HoloClawTab renders the deck
2. **Returned in the POST response** → Brittney session shows the launched agent immediately
3. **Listed in GET /api/holoclaw/run** → the deck can repopulate on reload

On process exit, a `status: "stopped"` embodiment entry is appended so the deck retires the avatar rather than leaving a ghost.

### EmbodiedAgentCard

```typescript
interface EmbodiedAgentCard {
  agentId: string;
  handle: string; // e.g. "holoclaw-research"
  skill: string; // e.g. "research"
  teamId: string;
  status: EmbodiedStatus; // 'spawning' | 'running' | 'idle' | 'error' | 'stopped'
  presence: boolean; // true when a fleet presence heartbeat session is open
  activityChannel: string; // outbox channel the deck tails, e.g. "skill:research"
  hue: number; // deterministic 0–359 from skill name, consistent across all surfaces
  avatarHolo: string; // generated .holo composition (see below)
}
```

### API Reference

| Method   | Path                | Auth   | Body / Response                                                     |
| -------- | ------------------- | ------ | ------------------------------------------------------------------- |
| `POST`   | `/api/holoclaw/run` | Bearer | `{name, cycles?, alwaysOn?}` → `{started, pid, fleet?, embodiment}` |
| `GET`    | `/api/holoclaw/run` | —      | `{running: [{name, pid, embodiment}], count}`                       |
| `DELETE` | `/api/holoclaw/run` | Bearer | `{name}` → `{stopped, pid}`                                         |

Skill `name` must match `/^[a-z0-9-]{1,64}$/`. The path is resolved inside `COMPOSITIONS_ROOT` before the file is opened (SEC-T05 path-traversal guard).

---

## Embodied-Motion: `@motion_source`

### The Problem It Solves

Before this capability, an embodied HoloClaw avatar was inert — it appeared in the 3D deck but stood still. `@motion_source` routes a motion intent through the Mixamo animation library into `AnimationTrait` crossfade/play, so embodied agents **move**.

### Trait Definition (`packages/core/src/traits/MotionSourceTrait.ts`)

```
@motion_source(
  kind: "library" | "mocap" | "procedural" | "agent_intent",
  library: "mixamo",           // motion library name
  default_motion: "idle",      // clip played on attach
  blend: 0.25,                 // crossfade duration (seconds)
  catalog: {                   // preset name → AnimationTrait clip name
    idle: "idle",
    walk: "walk",
    run:  "run",
    wave: "wave",
    speak: "speak",
  },
  retarget: { skeleton: "mixamo" }
)
```

**Execution path**:

1. A `motion_request` event fires with a preset name (e.g. `"walk"`).
2. `MotionSourceTrait` looks up the preset in `catalog` → gets the clip name.
3. Calls `AnimationTrait.crossfade(clip, blend)` if available, else `AnimationTrait.play(clip)`.
4. Mirrors `node.__avatarEmbodimentState.currentAnimation` so `@avatar_embodiment` reports the active clip.

**Procedural gait** (when `kind: "procedural"`): a speed signal drives threshold selection — idle/walk/run — throttled to the configured `frequency` Hz.

**Graceful degradation**: if `@animation` is absent from the composition, `@motion_source` silences itself instead of throwing.

### Preset Resolution (G.006)

Preset names (`"idle"`, `"walk"`, etc.) are plain strings in the trait catalog. They resolve to real Mixamo animation IDs via `MixamoPresetMapper` at the server-side/asset layer — not inside the core trait, which runs client-side. This keeps the core package import-free from server-only modules.

### Default Agent Motion Catalog

Every generated avatar `.holo` declares the canonical five-motion catalog (`embodiment.ts:48`):

```typescript
export const DEFAULT_AGENT_MOTIONS = ['idle', 'walk', 'run', 'wave', 'speak'] as const;
```

The generated `.holo` emits:

```holo
@animation
@motion_source(
  kind: "library",
  library: "mixamo",
  default_motion: "idle",
  blend: 0.25,
  catalog: { idle: "idle", walk: "walk", run: "run", wave: "wave", speak: "speak" },
  retarget: { skeleton: "mixamo" }
)
```

### Registration

`@motion_source` is registered in `VRTraitSystem.ts` via the `motionSourceHandler` import at line 143 and `this.register()` at line 1727. It appears in `VR_TRAITS` (via `humanoid-avatar.ts`) so the parser accepts `@motion_source` in `.holo` and `.hsplus` files with `enableVRTraits: true`.

---

## 3D Deck — Live Avatar Rendering

`packages/studio/src/components/teams/HoloClaw3DDeck.tsx`

The 3D deck renders two classes of node:

| Node                            | Shape       | Ring radius | Source                               |
| ------------------------------- | ----------- | ----------- | ------------------------------------ |
| **TentacleNode** (skills)       | Icosahedron | 5           | static skill list                    |
| **EmbodiedAvatarNode** (agents) | Sphere      | 2.9         | `deriveEmbodiedAgents(activityFeed)` |

### EmbodiedAvatarNode

- **Body**: sphere, color `hsl(agent.hue, 70%, 55%)` — same hue computed by `avatarHueForSkill()` in `embodiment.ts`
- **Presence ring**: torus (visible only when `agent.presence === true`)
- **Tether**: line back to the coordinator obelisk, dashed when not running
- **Label**: `handle`, `status`, `live` badge (when `agent.presence`)
- **Animation**: rotation speed 1.2×/s when running, 0.3×/s when idle

### HoloClawTab Wiring

`packages/studio/src/components/teams/HoloClawTab.tsx` uses a `useHoloClawActivity` hook that:

1. Opens a single SSE connection to `/api/holoclaw/activity`
2. Collects activity entries (newest-first)
3. Derives the live agent roster via `useMemo(() => deriveEmbodiedAgents(entries), [entries])`
4. Passes `agents={agents}` to `HoloClaw3DDeck`

### Roster Derivation (`packages/studio/src/lib/holoclaw/embodiedAgents.ts`)

```typescript
deriveEmbodiedAgents(entries: ActivityLike[]): EmbodiedAgent[]
```

- Iterates **oldest → newest** so the newest `agent_embodiment` event per `agentId` wins
- Filters out agents with `status: "stopped"` — they leave the deck
- Ignores any entry where `metadata.kind !== 'agent_embodiment'` or `agentId` is absent

---

## Fleet Lifecycle

`packages/studio/src/lib/holoclaw/fleetLifecycle.ts`

```typescript
registerHoloClawFleetAgent(skill: string, opts?: { clientAuth?: string | null; teamId?: string }): Promise<FleetRegistration | null>
deregisterHoloClawFleetAgent(fleet: FleetRegistration, clientAuth?: string | null, reason?: string): Promise<void>
```

- Registration posts to HoloMesh via `/api/holomesh/team/:teamId/agents` and opens a presence heartbeat session
- Deregistration closes the presence session and removes the agent from the dispatch pool on exit
- Both are best-effort: failure does not abort the skill launch

```typescript
interface FleetRegistration {
  agentId: string;
  teamId: string;
  handle: string;
  registered: boolean;
  presence: boolean;
}
```

---

## Skill Execution

Skills are `.hsplus` compositions in `compositions/skills/`. The daemon process runs the behavior tree; `POST /api/holoclaw/run` spawns it.

| Field          | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| Spawn command  | `npx tsx packages/cli/src/cli.ts holodaemon <skillPath> --cycles N` |
| Default cycles | 5 (set `alwaysOn: true` for unbounded)                              |
| Lock file      | `.holoscript/skill-<name>.lock`                                     |
| Activity feed  | `.holoscript/outbox.jsonl` (stdout + stderr appended per line)      |
| SSE endpoint   | `GET /api/holoclaw/activity?stream=true`                            |

Skill names must match `/^[a-z0-9-]{1,64}$/`. The path is contained inside `COMPOSITIONS_ROOT` before the file is opened.

### Seed Skills

| Skill              | Budget | What It Does                                               |
| ------------------ | ------ | ---------------------------------------------------------- |
| `code-health`      | $0.10  | `tsc --noEmit` + lint scan + vitest → health score         |
| `lint-sweep`       | $0.50  | Find console.log / @ts-ignore / `as any` → auto-fix        |
| `test-runner`      | $0.05  | Targeted vitest for specific packages                      |
| `dependency-audit` | $0.05  | `npm audit` + `ncu --jsonUpgraded` → CVE + outdated report |
| `dead-code-finder` | $0.10  | `ts-prune` → unused export detection                       |
| `git-digest`       | $0.02  | `git log --since=24h` → commit summary                     |
| `bundle-analyzer`  | $0.20  | `next build` → bundle size regression alerts               |

---

## Economy System

`packages/core/src/traits/EconomyPrimitivesTrait.ts`

| Feature         | Config                      | Description                                          |
| --------------- | --------------------------- | ---------------------------------------------------- |
| Credits         | initial_balance: 100        | Agents earn by completing tasks, spend on inference  |
| Spend limits    | per hour, configurable      | Prevents runaway spending                            |
| Bounties        | 5min deadline, max 10/agent | Post task with escrow → agents compete → winner paid |
| Escrow          | enabled by default          | Funds locked until task verified                     |
| Transaction log | max 200 entries             | Full audit trail per account                         |

```
open → claimed (agent accepts) → completed (escrow released)
                               → expired (escrow refunded)
```

---

## Agent Identity & Signing

Every agent-generated code change is cryptographically signed via `AgentCommitSigner.ts` (Ed25519). Compositions compile to A2A agent cards (`A2AAgentCardCompiler.ts`) at `/.well-known/agent-card.json`.

---

## Verification

```bash
# Start a skill and observe embodiment in the response
curl -X POST http://localhost:3000/api/holoclaw/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"name": "code-health", "cycles": 3}'
# → response includes { embodiment: { agentId, handle, hue, avatarHolo, ... } }

# List running agents with their embodiment cards
curl http://localhost:3000/api/holoclaw/run

# Tail the activity feed (includes agent_embodiment events)
curl -N http://localhost:3000/api/holoclaw/activity?stream=true

# Run embodiedAgents unit tests (7 tests)
pnpm vitest run packages/studio/src/lib/holoclaw/__tests__/embodiedAgents.test.ts

# Run embodiment unit tests (11 tests including @motion_source assertions)
pnpm vitest run packages/studio/src/lib/holoclaw/__tests__/embodiment.test.ts

# Run @motion_source trait tests (verify counts — change with feature work)
pnpm vitest run packages/core/src/traits/__tests__/MotionSourceTrait.test.ts
```
