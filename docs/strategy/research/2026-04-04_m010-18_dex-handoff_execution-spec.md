# M.010.18 — Android Samsung DeX Holographic Handoff (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Enable seamless handoff of a running mobile holographic session into Samsung DeX desktop mode, preserving:

- scene graph state
- camera/view parameters
- active interaction context
- session identity and permissions

The result is a user flow where a phone becomes a desktop holographic workspace without a restart.

## Why this opens doors

- Gives immediate enterprise demo value (phone-to-desk continuity)
- Differentiates from static AR demos by showing persistent spatial workflow
- Reuses existing `.holo` graph model while exposing a practical, user-visible win

## Product behavior

1. User starts a `.holo` scene on Android phone.
2. User enters Samsung DeX mode (dock/cable/wireless DeX).
3. Runtime detects mode transition and emits `session_handoff_requested`.
4. State snapshot is serialized to a handoff payload.
5. Desktop DeX runtime initializes using payload.
6. User resumes in the same scene context (state + camera + tool mode).

## Scope

### In scope (v1)

- DeX mode detection and transition eventing
- Scene snapshot serialization/deserialization
- Session continuity contract (`HandoffPayload`)
- Recovery behavior on partial handoff failure
- Telemetry for handoff latency and failure classes

### Out of scope (v1)

- Cross-device handoff between different physical phones
- Multi-user collaborative handoff merge
- Full GPU context transfer (state-level transfer only)

## Technical architecture

### 1) Runtime mode detector

Add Android runtime probe:

- source: display + desktop-mode state
- output: `mobile | dex`
- event: `runtime_mode_changed`

### 2) Handoff payload contract

```ts
interface HandoffPayload {
  version: 'm010.18.v1';
  sessionId: string;
  sceneId: string;
  timestamp: string;
  camera: {
    position: [number, number, number];
    rotation: [number, number, number];
    fov?: number;
  };
  interaction: {
    activeTool?: string;
    selectedIds: string[];
    cursor?: [number, number, number];
  };
  sceneStateDelta: Record<string, unknown>;
  capabilityFlags: {
    dexKeyboardMouse: boolean;
    externalDisplay: boolean;
  };
}
```

### 3) Handoff orchestrator

Two-phase transfer:

1. `prepare_handoff(payload)` — freeze transient mutations, emit checkpoint
2. `commit_handoff(payload)` — initialize DeX view and resume event loop

Fallback path:

- if commit fails, revert to mobile loop and display non-destructive warning

### 4) Renderer adaptation (DeX)

- switch input mapping to mouse/keyboard-first
- preserve gesture compatibility when touch is still present
- increase UI density and panel layout for desktop viewport

## Proposed code touch points

- `packages/runtime/`:
  - add mode detector module
  - add handoff orchestrator and payload codec
- `packages/core/`:
  - add `HandoffPayload` shared type and schema validation
- `packages/studio/` (if using studio-hosted preview path):
  - add handoff telemetry panel or debug logs

## Failure taxonomy

- `DEX_NOT_AVAILABLE`
- `PAYLOAD_SCHEMA_INVALID`
- `SCENE_DELTA_DESERIALIZE_FAILED`
- `CAPABILITY_MISMATCH`
- `COMMIT_TIMEOUT`

Each failure must include user-safe fallback and telemetry emission.

## Acceptance criteria (v1)

1. Entering DeX triggers handoff flow automatically.
2. Scene object states match pre-handoff snapshot within deterministic tolerance.
3. Active tool + selection survives handoff.
4. End-to-end handoff completes under 1500ms on target Samsung test device.
5. On failure, user remains in functional mobile session with no scene corruption.

## Test plan

### Unit

- payload schema validation
- camera/tool/selection serialization round-trip
- failure-class mapping

### Integration

- simulated `mobile -> dex` mode switch
- orchestrator two-phase commit behavior
- fallback rollback on forced commit failure

### Device validation

- Samsung DeX wired mode
- Samsung DeX wireless mode
- external keyboard/mouse input continuity

## Shipping slices

### Slice A (2-3 days)

- payload contract + schema + unit tests
- mode detector + event wiring

### Slice B (3-4 days)

- orchestrator prepare/commit + rollback path
- integration tests

### Slice C (2 days)

- input/layout adaptation for DeX
- telemetry + final device validation

## Metrics

- `handoff_attempt_total`
- `handoff_success_total`
- `handoff_failure_total{code}`
- `handoff_latency_ms`
- `handoff_rollback_total`

## Definition of done

- All acceptance criteria pass
- integration tests are green
- device validation checklist complete on at least one Samsung DeX-capable device
- docs updated with user-facing handoff behavior and known limits
