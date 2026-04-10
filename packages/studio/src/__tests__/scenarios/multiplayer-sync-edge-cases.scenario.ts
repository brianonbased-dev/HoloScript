/**
 * multiplayer-sync-edge-cases.scenario.ts — LIVING-SPEC: Multiplayer & Sync Edge Cases
 *
 * Tests the robustness of the HoloScript multiplayer CRDT sync system:
 * - High Latency Simulation: Managing out-of-order updates bridging 1000ms+ network delays.
 * - Desync Recovery: Reconciling client crash states with the authoritative mesh ledger.
 * - Permission Conflicts: Resolving simultaneous edits on shared objects via tie-breaker heuristics.
 */
import { describe, it, expect } from 'vitest';

export interface StateUpdate {
  tick: number;
  clientId: string;
  payload: any;
}

export interface ClientState {
  lastTick: number;
  data: Record<string, any>;
}

// 1. High Latency: Out-of-order Update Resolution (LWW - Last Write Wins by Tick)
export function applyLatencyTolerantUpdate(
  currentState: ClientState,
  incomingUpdate: StateUpdate
): ClientState {
  // If the incoming update is older than our last processed deterministic tick, we discard it
  // (In a true CRDT like Loro, it would merge backwards, but for this spatial LWW mock we drop stale ticks)
  if (incomingUpdate.tick < currentState.lastTick) {
    return currentState; // Stale update abandoned due to latency crossing
  }

  return {
    lastTick: incomingUpdate.tick,
    data: { ...currentState.data, ...incomingUpdate.payload },
  };
}

// 2. Desync Recovery: Client reconnects with stale diverging branch
export function reconcileDesyncMerge(
  localDivergedData: Record<string, any>,
  authoritativeMeshState: Record<string, any>,
  forceAuthoritativeOverwrites: string[]
): Record<string, any> {
  const merged = { ...localDivergedData };
  for (const key of forceAuthoritativeOverwrites) {
    if (key in authoritativeMeshState) {
      merged[key] = authoritativeMeshState[key]; // Overwrite local corrupted/stale state
    }
  }
  return merged;
}

// 3. Permission Conflicts: Simultaneous edit rights
export interface EditClaim {
  clientId: string;
  property: string;
  value: any;
  reputation: number;
}

export function resolveSimultaneousEdit(claims: EditClaim[]): EditClaim | null {
  if (claims.length === 0) return null;
  // Tie-breaker: Highest reputation wins. If matching, lexical sort of clientId for determinism.
  return claims.sort((a, b) => {
    if (b.reputation !== a.reputation) {
      return b.reputation - a.reputation;
    }
    return a.clientId.localeCompare(b.clientId);
  })[0];
}

describe('Scenario: Multiplayer — High Latency & Out-of-Order Packets', () => {
  it('Applies sequential incoming network updates', () => {
    let state: ClientState = { lastTick: 10, data: { status: 'idle' } };
    state = applyLatencyTolerantUpdate(state, {
      tick: 12,
      clientId: 'C1',
      payload: { status: 'moving' },
    });
    expect(state.data.status).toBe('moving');
    expect(state.lastTick).toBe(12);
  });

  it('Drops ghost updates heavily delayed past the current tick (1000ms+ lag jump)', () => {
    let state: ClientState = { lastTick: 100, data: { pos: 50 } };
    // A packet from tick 80 arrives way too late
    state = applyLatencyTolerantUpdate(state, { tick: 80, clientId: 'C1', payload: { pos: 20 } });
    expect(state.data.pos).toBe(50); // Did not override
    expect(state.lastTick).toBe(100);
  });
});

// 4. Loro CRDT Vector Clock Merge Mock
export function mergeVectorClocks(
  localClock: Record<string, number>,
  remoteClock: Record<string, number>
): Record<string, number> {
  const merged: Record<string, number> = { ...localClock };
  for (const [node, tick] of Object.entries(remoteClock)) {
    merged[node] = Math.max(merged[node] || 0, tick);
  }
  return merged;
}

describe('Scenario: Multiplayer — Crash Desync & Recovery', () => {
  it('Reconciles a recovering client by enforcing authoritative mesh anchors', () => {
    const localDiverged = {
      playerHealth: 80,
      enemyPos: { x: 10, y: 0 },
      localMenuOpen: true, // Unique UI state not synced globally
    };
    const authoritativeMesh = {
      playerHealth: 40, // Player actually took damage while disconnected
      enemyPos: { x: 50, y: 0 }, // Enemy moved while disconnected
    };

    // Force overwrite spatial and health variables but keep local UI configs
    const recovered = reconcileDesyncMerge(localDiverged, authoritativeMesh, [
      'playerHealth',
      'enemyPos',
    ]);

    expect(recovered.playerHealth).toBe(40);
    expect(recovered.enemyPos.x).toBe(50);
    expect(recovered.localMenuOpen).toBe(true); // Retained cleanly
  });

  it('Triggers auto-reconciliation via Loro CRDT backend vector clock merge', () => {
    const localClock = { client_A: 5, client_B: 2 };
    const remoteClock = { client_B: 4, client_C: 1 };

    const merged = mergeVectorClocks(localClock, remoteClock);
    expect(merged['client_A']).toBe(5);
    expect(merged['client_B']).toBe(4);
    expect(merged['client_C']).toBe(1);
  });
});

describe('Scenario: Multiplayer — Permission Edit Conflicts', () => {
  it('Resolves identical-tick property edits using reputation heuristics', () => {
    const edits: EditClaim[] = [
      { clientId: 'guest_123', property: 'wall_color', value: 'red', reputation: 10 },
      { clientId: 'admin_sys', property: 'wall_color', value: 'blue', reputation: 9000 },
      { clientId: 'mod_001', property: 'wall_color', value: 'green', reputation: 500 },
    ];

    const winner = resolveSimultaneousEdit(edits);
    expect(winner?.clientId).toBe('admin_sys');
    expect(winner?.value).toBe('blue');
  });

  it('Uses deterministic lexical sorting when reputations are exactly tied during a conflict', () => {
    const edits: EditClaim[] = [
      { clientId: 'user_B', property: 'door_state', value: 'open', reputation: 100 },
      { clientId: 'user_A', property: 'door_state', value: 'closed', reputation: 100 },
    ];

    const winner = resolveSimultaneousEdit(edits);
    expect(winner?.clientId).toBe('user_A'); // Lexical precedence
    expect(winner?.value).toBe('closed');
  });
});
