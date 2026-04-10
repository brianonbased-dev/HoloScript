# M.010.12 — iOS SharePlay Multi-User AR via FaceTime (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Enable shared holographic sessions over FaceTime using SharePlay so participants can co-view and co-edit `.holo` scenes with synchronized state and session controls.

## Product behavior

1. Host starts FaceTime call and launches SharePlay AR session.
2. Invitees join and auto-load synchronized scene context.
3. Participant actions (placement/edit/tool changes) propagate to all peers.
4. Session state remains coherent through pause/resume and participant churn.
5. Final scene can be exported or persisted by host authority rules.

## Scope

### In scope (v1)

- SharePlay session bootstrap + participant lifecycle
- shared scene state sync contract
- host/participant role model and permissions
- conflict handling for concurrent edits
- reconnection and late-join snapshot replay

### Out of scope (v1)

- cross-platform non-FaceTime participation
- large-room (>N participants) scaling beyond launch target
- granular enterprise ACL management

## Architecture

### 1) SharePlay session controller

- detect active group session
- join/leave hooks
- participant identity mapping

```ts
interface SharePlayParticipant {
  participantId: string;
  displayName?: string;
  role: 'host' | 'editor' | 'viewer';
  joinedAtMs: number;
}
```

### 2) Shared state channel

```ts
interface SharePlayStateMessage {
  sessionId: string;
  senderId: string;
  type: 'snapshot' | 'delta' | 'presence' | 'control';
  sequence: number;
  timestampMs: number;
  payload: Record<string, unknown>;
}
```

- host authoritative ordering
- deltas for low-latency updates
- snapshots for late join/recovery

### 3) Conflict policy

- default host-ordered last-write-wins
- optional object-lock hint for active edit focus
- correction messages for rejected mutations

### 4) Resilience model

- participant reconnect handshake
- state gap detection + snapshot replay
- session pause/resume semantics for app backgrounding

## Proposed code touch points

- `packages/runtime/`
  - SharePlay adapter + participant lifecycle manager
  - state message codec and replay logic
- `packages/core/`
  - shared-session schema validation + merge helpers
- `packages/studio/` / iOS front-end package
  - host controls, participant list, role indicators

## Failure taxonomy

- `SHAREPLAY_SESSION_UNAVAILABLE`
- `PARTICIPANT_SYNC_TIMEOUT`
- `STATE_SEQUENCE_GAP`
- `CONFLICT_RESOLUTION_REJECTED`
- `SESSION_RESUME_FAILED`

## Acceptance criteria

1. Host and at least one participant can co-join and view the same AR scene.
2. Edit deltas propagate with deterministic ordering.
3. Late joiners converge to host scene state via snapshot replay.
4. Reconnect path restores participant state without scene corruption.
5. Session controls and role indicators are visible and functional.

## Test plan

### Unit

- message sequencing and gap detection
- role/permission gating
- conflict resolver behavior

### Integration

- host + 2 participant edit propagation
- late join snapshot replay
- reconnect after temporary disconnect/background

### Device validation

- iOS FaceTime SharePlay with supported devices
- variable network quality scenarios
- long-running collaboration session stability

## Shipping slices

- Slice A: SharePlay join/lifecycle + base message channel
- Slice B: scene delta/snapshot sync + conflict policy
- Slice C: participant UX, resilience hardening, and telemetry

## Metrics

- `shareplay_session_start_total`
- `shareplay_participant_join_total`
- `shareplay_delta_apply_latency_ms`
- `shareplay_snapshot_replay_total`
- `shareplay_reconnect_success_total`

## Definition of done

- Multi-user SharePlay AR session works end-to-end in FaceTime context
- acceptance criteria pass
- reconnect and late-join behavior validated
- operator docs include session roles, controls, and known limits
