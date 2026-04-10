# M.010.16 — Android Nearby Connections Mesh for Shared AR (Execution Spec)

Date: 2026-04-04  
Owner: Copilot execution lane  
Status: Ready for implementation

## Goal

Enable serverless local multi-device AR collaboration on Android using Nearby Connections, allowing users to share and co-edit `.holo` scene state over peer-to-peer mesh in proximity.

## Product behavior

1. Host starts a local shared AR session.
2. Nearby devices discover and join via local handshake.
3. Devices sync authoritative scene state + deltas.
4. Participants see each other’s updates in near real time.
5. Session can end/export without cloud dependency.

## Scope

### In scope (v1)

- host/peer session lifecycle over Nearby Connections
- scene state snapshot + delta sync
- conflict policy for concurrent updates
- reconnection/rejoin behavior
- local session telemetry + diagnostics

### Out of scope (v1)

- internet relay fallback
- cross-platform (iOS) interoperability in initial release
- identity/account-based access controls beyond local session code

## Architecture

### 1) Session transport layer

- Nearby strategy selection per context (P2P_STAR baseline)
- host advertises session
- peers discover and request join

### 2) State synchronization model

```ts
interface MeshStateEnvelope {
  sessionId: string;
  senderId: string;
  type: 'snapshot' | 'delta' | 'ack' | 'heartbeat';
  sequence: number;
  timestampMs: number;
  payload: Record<string, unknown>;
}
```

- Host authoritative for ordering
- Peers apply ordered deltas
- Snapshot replay for late joiners

### 3) Conflict resolution

- default: host-ordered last-write-wins
- optional field-level merge for safe domains (transform, selection metadata)
- rejected deltas return correction envelope

### 4) Reliability and recovery

- heartbeat interval for liveness
- gap detection via sequence numbers
- snapshot resync on drift or reconnect

## Proposed code touch points

- `packages/runtime/`
  - nearby transport adapter
  - mesh session manager
  - state envelope codec and apply pipeline
- `packages/core/`
  - merge policy helpers + schema guards
- `packages/studio/` mobile flow
  - host/join controls and participant status UI

## Failure taxonomy

- `DISCOVERY_TIMEOUT`
- `JOIN_REJECTED`
- `SEQUENCE_GAP_DETECTED`
- `STATE_DRIFT_REQUIRES_RESYNC`
- `MESH_LINK_DROPPED`

## Acceptance criteria

1. Two+ Android devices can host/join a local AR session without backend server.
2. Scene updates propagate in near real time (<150ms LAN median target).
3. Late joiner receives snapshot and reaches consistent scene state.
4. Disconnect/reconnect path restores participation without corrupting shared state.
5. Session export captures final authoritative scene state.

## Test plan

### Unit

- envelope encoding/decoding
- sequence ordering and gap detection
- conflict resolver behavior

### Integration

- host + 2 peers state propagation
- late join snapshot replay
- forced disconnect/reconnect resync path

### Device validation

- Android-to-Android local network + offline scenarios
- variable signal strength and movement stress
- power-saving mode behavior on background/foreground transitions

## Shipping slices

- Slice A: transport + discovery/join lifecycle
- Slice B: snapshot/delta sync + host authority model
- Slice C: reconnection hardening + UX + telemetry

## Metrics

- `nearby_session_host_total`
- `nearby_session_join_success_total`
- `nearby_state_delta_applied_total`
- `nearby_resync_total`
- `nearby_mesh_disconnect_total`

## Definition of done

- local serverless shared AR session works across multiple Android devices
- acceptance criteria pass
- deterministic resync behavior verified
- operator docs include host/join workflow and known limits
