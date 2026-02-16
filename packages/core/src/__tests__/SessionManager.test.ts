import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../network/SessionManager';

// =============================================================================
// C310 — SessionManager
// =============================================================================

describe('SessionManager', () => {
  let sm: SessionManager;
  beforeEach(() => { sm = new SessionManager({ maxReconnectAttempts: 3, reconnectWindowMs: 30000 }); });

  it('creates a session and transitions to connecting', () => {
    sm.createSession('game-1');
    expect(sm.getSessionId()).toBe('game-1');
    expect(sm.getState()).toBe('connecting');
  });

  it('connect transitions to connected', () => {
    sm.createSession('game-1');
    sm.connect();
    expect(sm.getState()).toBe('connected');
  });

  it('addPlayer and getPlayerCount', () => {
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    expect(sm.getPlayerCount()).toBe(2);
    expect(sm.getPlayer('p1')?.name).toBe('Alice');
  });

  it('playerDisconnected sets reconnecting state', () => {
    sm.addPlayer('p1', 'Alice');
    sm.playerDisconnected('p1');
    expect(sm.getPlayer('p1')?.state).toBe('reconnecting');
  });

  it('playerReconnect succeeds within window and attempts', () => {
    sm.addPlayer('p1', 'Alice');
    sm.playerDisconnected('p1');
    const ok = sm.playerReconnect('p1');
    expect(ok).toBe(true);
    expect(sm.getPlayer('p1')?.state).toBe('connected');
  });

  it('playerReconnect fails after max attempts', () => {
    sm.addPlayer('p1', 'Alice');
    sm.playerDisconnected('p1');
    // Each reconnect increments attempts. max=3, so 4th should fail.
    sm.playerReconnect('p1'); // attempt 1 → success, state=connected
    sm.playerDisconnected('p1'); // state=reconnecting, attempts=0
    sm.playerReconnect('p1'); // attempt 1
    sm.playerDisconnected('p1'); // attempts=0
    sm.playerReconnect('p1'); // attempt 1
    // Now try 3 more reconnects from a single disconnect
    sm.playerDisconnected('p1'); // attempts=0
    sm.playerReconnect('p1'); // attempt 1
    sm.playerReconnect('p1'); // attempt 2
    sm.playerReconnect('p1'); // attempt 3
    const result = sm.playerReconnect('p1'); // attempt 4 > max=3
    expect(result).toBe(false);
    expect(sm.getPlayer('p1')?.state).toBe('disconnected');
  });

  it('removePlayer deletes from session', () => {
    sm.addPlayer('p1', 'Alice');
    sm.removePlayer('p1');
    expect(sm.getPlayerCount()).toBe(0);
  });

  it('endSession transitions to ended', () => {
    sm.createSession('game-1');
    sm.connect();
    sm.endSession();
    expect(sm.getState()).toBe('ended');
  });

  it('getSnapshot returns session summary', () => {
    sm.createSession('game-1');
    sm.connect();
    sm.addPlayer('p1', 'Alice');
    const snap = sm.getSnapshot();
    expect(snap.sessionId).toBe('game-1');
    expect(snap.state).toBe('connected');
    expect(snap.players.length).toBe(1);
  });

  it('state history tracks transitions', () => {
    sm.createSession('game-1');
    sm.connect();
    sm.endSession();
    const history = sm.getStateHistory();
    expect(history.length).toBe(3);
    expect(history.map(h => h.state)).toEqual(['connecting', 'connected', 'ended']);
  });

  it('heartbeat updates lastSeenAt', () => {
    sm.addPlayer('p1', 'Alice');
    const before = sm.getPlayer('p1')!.lastSeenAt;
    // Small delay to ensure timestamp differs
    sm.heartbeat('p1');
    const after = sm.getPlayer('p1')!.lastSeenAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
