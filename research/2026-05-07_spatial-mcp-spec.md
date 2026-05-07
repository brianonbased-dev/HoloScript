---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-05-07
canonical_for: "spatial-mcp-v0.1"
supersedes: ""
extends: ""
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** Spatial MCP v0.1 defines a canonical `SpatialContext` payload for headset room geometry, gaze, hands, controllers, and pose data so agents can receive structured 3D context instead of lossy prose. This first slice lands the core schema, validator, and placement helper as a foundation for later MCP tool and Studio helper wiring.

- **W -** Spatial inputs need named frames, units, and versioned schema boundaries before agents can safely act in 3D scenes.
- **P -** Land the protocol foundation as typed core primitives plus strict validation, then layer MCP handlers and headset emitters on top.
- **G -** Treating spatial state as chat text loses coordinate fidelity and recreates pose/ray/bounds schemas in every tool.

**Evidence:** `packages/core/src/spatial/spatial-context.ts`, `packages/core/src/spatial/__tests__/spatial-context.test.ts`.

---

# Spatial MCP - 3D context as first-class MCP tool params

**Status:** v0.1 spec + reference implementation landing in same commit
**Task:** `task_1778114195597_jira` (`[novel-tool] Spatial MCP`)
**Companion to:** D.019 (HoloGram push layer), I.002 (mobile innovation), I.008 (HoloMap)
**Author:** claudecode-claude-x402, 2026-05-07

## Problem

MCP today is text-in / text-out. Quest 3 daily users (Joseph + future paying users) operate in 3D. The bridge between the headset and mesh agents is currently:

1. Headset captures spatial state (room geometry, gaze, hands, controllers).
2. App serializes a free-form description into a chat message.
3. Agent re-parses ad-hoc fields, hallucinates the rest.
4. Agent emits text; headset has to re-interpret it for the spatial scene.

Every stage loses fidelity, and there is no shared schema across tools, so each integration re-invents `pose`, `ray`, `bounds`. Today's MCP tool registry has zero entries that accept structured 3D context. The competing assumption is "we'll model spatial as text" - but text is the wrong shape for `position: [x,y,z]`, quaternions, or a 2,400-vertex room mesh.

## Goal

Define one canonical `SpatialContext` payload that any MCP tool can declare as a first-class param, alongside text. Ship one reference tool that exercises the full round-trip. Ship one VR-side helper that emits the payload. Resist the urge to ship a full XR SDK - one round-trip proves the protocol; everything else is iteration.

## Non-goals (v0.1)

- Streaming spatial state (1+ Hz pose feeds). Out of scope; `holo_reconstruct_step` already covers per-frame ingest.
- Full hand-tracking taxonomy (per-finger joints, gestures). v0.1 ships hand transforms only (wrist pose + grip strength).
- Authoring an MCP-spec-level "spatial mode." This sits inside HoloScript's MCP server; if the protocol catches, contribute upstream as a profile.
- Server-side rendering of the spatial response. The VR helper renders.
- Cross-session anchors / world-locked content. AnchorContext (HoloMap) handles that channel.

## Design

### `SpatialContext` payload (v0.1)

```ts
interface SpatialContext {
  /** Schema version. Server rejects unknown majors. */
  version: '0.1';

  /** Right-handed, Y-up, meters. Origin = tracking-space origin. */
  frame: 'tracking-space-y-up-meters';

  /** Room geometry. Optional - agents that don't need geometry skip it. */
  room?: {
    /** ASCII PLY (xyz) for portability - the same shape holo_reconstruct_export emits. */
    pointCloudPly?: string;
    /** Axis-aligned bounding box in tracking space. */
    aabb?: { min: [number, number, number]; max: [number, number, number] };
    /** Floor plane (Y=floorHeight) shortcut for rooms with a known floor. */
    floorHeight?: number;
  };

  /** Gaze ray in tracking space. */
  gaze?: {
    origin: [number, number, number];
    direction: [number, number, number]; // unit vector
    /** Optional: distance to first hit, if the headset already raycast. */
    hitDistance?: number;
  };

  /** Hand transforms - wrist pose + grip strength. Per-finger joints out of scope v0.1. */
  hands?: {
    left?: HandTransform;
    right?: HandTransform;
  };

  /** Controller poses. Reuses ControllerPose from @holoscript/core (already exists). */
  controllers?: {
    left?: ControllerPose;
    right?: ControllerPose;
  };

  /** Headset pose. Useful for "where am I looking from" without recomputing from gaze. */
  headset?: {
    position: [number, number, number];
    rotation: { x: number; y: number; z: number; w: number };
  };

  /** Free-form metadata the headset wants to forward (device id, session id, etc.). */
  meta?: Record<string, string | number | boolean>;
}

interface HandTransform {
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  /** 0..1 grip strength. Bridges Quest's hand tracking without exposing all 26 joints. */
  grip: number;
  /** 0..1 pinch strength (thumb-index distance, normalized). */
  pinch?: number;
}
```

**Why this shape:**

- **Reuses `ControllerPose`** (`packages/core/src/traits/ControllerInputTrait.ts:45`) so spatial-MCP and the controller trait share the same type. Avoids the M.087-style "two surfaces, two definitions of pose" drift.
- **PLY for room geometry.** Same wire format `holo_reconstruct_export` already emits for HoloMap exports - so a HoloMap session output is directly usable as `room.pointCloudPly`.
- **Frame is named** (`tracking-space-y-up-meters`) so we can introduce world-locked frames later without breaking v0.1.
- **All top-level fields except `version` and `frame` are optional.** A tool that only needs gaze does not require the caller to send hand transforms. Everything compositional.

### Response shape - `SpatialResponse`

The reference tool returns text + (optionally) a structured 3D update for the headset to render:

```ts
interface SpatialResponse {
  /** Always present - text fallback for non-spatial clients. */
  text: string;

  /** Optional: a .holo composition the headset should compile and render. */
  holo?: string;

  /** Optional: imperative scene patches when the headset is already rendering. */
  scenePatch?: Array<
    | { op: 'spawn'; id: string; position: [number, number, number]; trait?: string }
    | { op: 'move'; id: string; position: [number, number, number] }
    | { op: 'highlight'; id: string; color?: string }
    | { op: 'remove'; id: string }
  >;

  /** Frame the response is in (defaults to request.frame). */
  frame: SpatialContext['frame'];

  /** Schema version of the response. */
  version: '0.1';
}
```

The spatial response is a deliberate dual-channel: `text` always present (so a chat-only agent gets something useful), `holo`/`scenePatch` opt-in (so a Quest 3 client gets something to actually render).

### Reference tool - `compile_to_spatial`

A new MCP tool that:

1. Accepts `code` (a `.holo` composition) **and** `spatialContext` (the payload above).
2. Validates the context (version, frame, ranges).
3. Selects a placement: gaze-hit point, dominant-hand grip pose, or room AABB center, in that fallback order.
4. Returns `SpatialResponse`:
   - `text` - short summary of where the composition would be placed.
   - `holo` - the original code wrapped in a `placement` block at the chosen pose.
   - `scenePatch` - a single `spawn` op at the placement.

This is the simplest non-trivial tool that exercises the full round-trip (room -> agent -> scene update). It is **not** the full ecosystem of spatial tools - it is the proof of protocol.

### VR-side helper - `emitSpatialContext`

Lives in `packages/studio/src/lib/spatial-mcp.ts`. Takes the in-engine spatial state and emits a v0.1 payload:

```ts
function emitSpatialContext(input: {
  xrSession?: XRSession;
  controllers?: { left?: ControllerPose; right?: ControllerPose };
  // ... etc.
}): SpatialContext;
```

The helper is intentionally browser-aware (uses `navigator.xr` shape) but does not directly call the XR API - callers pass in their already-snapshotted state. This keeps the helper unit-testable in Node and reuses the controller trait's type.

## Validation strategy

- **Type-level**: `SpatialContext` and `SpatialResponse` exported as types from `@holoscript/core` so tool authors get autocomplete on the param shape. Land in `packages/core/src/spatial/spatial-context.ts`.
- **Schema-level**: JSON-Schema in the `inputSchema` of the MCP tool definition. The MCP server runtime rejects malformed payloads before reaching the handler.
- **Handler-level**: a `validateSpatialContext()` helper rejects unknown versions, infinite numbers, non-unit gaze directions (with tolerance).
- **Test**: one round-trip test `spatial-mcp.test.ts` - feed a `SpatialContext` with a gaze ray hitting a point, assert `compile_to_spatial` returns a `scenePatch` placing the spawn at that hit point.

## Wire schema (companion JSON)

Same shape as the TS interfaces above, embedded in the MCP tool's `inputSchema`. Ships as part of the MCP tool registration so any MCP client (Claude Desktop, Claude Code, custom) sees it automatically via `tools/list`.

## Compatibility / rollout

- New tool, new types, no existing tool broken.
- Adds one entry to the MCP `tools/list` response (`compile_to_spatial`).
- Existing `compile_to_*` family unaffected - none of them learn about spatial context yet. v0.2 can decide whether to retrofit.
- VR helper opt-in: studio code that does not import it sees no behavior change.

## What v0.2 looks like (deliberately not in scope)

- Streaming pose feeds (sub-second updates). Likely a separate transport (WebSocket / SSE) not standard MCP.
- Anchor-based world-locked content (cross-session). `AnchorContext` from HoloMap is the right channel.
- Per-finger hand joints + gesture taxonomy.
- `compile_to_*` retrofit: every compile target accepts `spatialContext` to generate placement-aware output.
- MCP profile contribution upstream.

## Risks

- **Schema rot.** The payload will change once Quest 3 (or Apple Vision Pro) telemetry shape forces it. Mitigation: `version` field, server rejects unknown majors, force a v0.2 migration when needed (instead of silently reinterpreting v0.1 fields).
- **Unit drift.** Some XR systems use Y-down or feet. Mitigation: `frame` is named, not implicit.
- **Quaternion canonicalization rot (W.GOLD.514 / F.041 echo).** Different runtimes pack quaternions as `(w,x,y,z)` vs `(x,y,z,w)`. Mitigation: explicit object form `{x,y,z,w}` in the type - no array packing for rotations, full stop.
- **PLY size.** Big rooms = big PLY. Mitigation: `pointCloudPly` is optional; tools that only need AABB skip it. The MCP transport already truncates payloads >2MB.

## Files this lands

| File | Role |
|------|------|
| `research/2026-05-07_spatial-mcp-spec.md` | This spec |
| `packages/core/src/spatial/spatial-context.ts` | Types + `validateSpatialContext()` |
| `packages/core/src/spatial/index.ts` | Public exports |
| `packages/core/src/index.ts` | Re-export `./spatial` |
| `packages/mcp-server/src/spatial-mcp-tools.ts` | Tool definition + handler for `compile_to_spatial` |
| `packages/mcp-server/src/handlers.ts` | Wire dispatcher |
| `packages/mcp-server/src/index.ts` | Add to `ALL_AVAILABLE_TOOLS` |
| `packages/studio/src/lib/spatial-mcp.ts` | VR-side helper `emitSpatialContext` |
| `packages/mcp-server/src/__tests__/spatial-mcp.test.ts` | Round-trip test |

## Decision log

- **One-tool scope** chosen over compiler-family retrofit. Founder ruling default per `/founder`: prove protocol, don't pre-build.
- **PLY over glTF** for room geometry: HoloMap export already emits PLY. Avoids two formats.
- **Object quaternions** (`{x,y,z,w}`) over array `[x,y,z,w]`: prevents F.041-style canonicalization rot at the type level.
- **Response carries `text` + `holo` + `scenePatch`**: text-only clients still work; spatial clients get structured output.
