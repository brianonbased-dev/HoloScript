/**
 * @fileoverview Tests for StateMachine, InputManager, NetworkManager, CultureRuntime barrel exports
 */
import { describe, it, expect } from 'vitest';
import { StateMachine, InputManager, NetworkManager, CultureRuntime } from '../index';

describe('StateMachine exports', () => {
  it('creates states and transitions', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    sm.addTransition({ from: 'idle', to: 'run', event: 'GO' });
    sm.setInitialState('idle');
    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.getStateCount()).toBe(2);
  });

  it('send transitions state', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    sm.addTransition({ from: 'a', to: 'b', event: 'NEXT' });
    sm.setInitialState('a');
    const ok = sm.send('NEXT');
    expect(ok).toBe(true);
    expect(sm.getCurrentState()).toBe('b');
  });

  it('guard prevents transition', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    sm.addTransition({ from: 'a', to: 'b', event: 'GO', guard: (ctx) => ctx.ready === true });
    sm.setInitialState('a');
    expect(sm.send('GO')).toBe(false);
    sm.setContext('ready', true);
    expect(sm.send('GO')).toBe(true);
    expect(sm.getCurrentState()).toBe('b');
  });

  it('tracks history', () => {
    const sm = new StateMachine();
    sm.addState({ id: 'a' });
    sm.addState({ id: 'b' });
    sm.addState({ id: 'c' });
    sm.addTransition({ from: 'a', to: 'b', event: 'X' });
    sm.addTransition({ from: 'b', to: 'c', event: 'Y' });
    sm.setInitialState('a');
    sm.send('X');
    sm.send('Y');
    expect(sm.getHistory()).toEqual(['a', 'b', 'c']);
  });
});

describe('InputManager exports', () => {
  it('tracks key state', () => {
    const im = new InputManager();
    im.keyDown('w');
    expect(im.isKeyPressed('w')).toBe(true);
    im.keyUp('w');
    expect(im.isKeyPressed('w')).toBe(false);
  });

  it('maps actions to keys', () => {
    const im = new InputManager();
    im.mapAction('jump', ['Space']);
    im.keyDown('Space');
    im.update(0.016);
    expect(im.isActionPressed('jump')).toBe(true);
  });

  it('tracks mouse position', () => {
    const im = new InputManager();
    im.setMousePosition(100, 200);
    const pos = im.getMousePosition();
    expect(pos[0]).toBe(100);
    expect(pos[1]).toBe(200);
  });

  it('connects gamepads', () => {
    const im = new InputManager();
    im.connectGamepad(0, 'Xbox Controller');
    const snap = im.getSnapshot();
    expect(snap.gamepads.size).toBe(1);
  });
});

describe('NetworkManager exports', () => {
  it('connects and disconnects', () => {
    const nm = new NetworkManager('player-1');
    expect(nm.isConnected()).toBe(false);
    nm.connect();
    expect(nm.isConnected()).toBe(true);
    nm.disconnect();
    expect(nm.isConnected()).toBe(false);
  });

  it('manages peers', () => {
    const nm = new NetworkManager('player-1');
    nm.connect();
    nm.addPeer('p2', 'Alice');
    expect(nm.getPeerCount()).toBe(1);
    nm.removePeer('p2');
    expect(nm.getPeerCount()).toBe(0);
  });

  it('broadcasts messages to outbox', () => {
    const nm = new NetworkManager('player-1');
    nm.connect();
    nm.broadcast('state_update', { pos: [1, 2, 3] });
    const messages = nm.flush();
    expect(messages.length).toBeGreaterThan(0);
  });

  it('simulates latency', () => {
    const nm = new NetworkManager('player-1');
    nm.setSimulatedLatency(100);
    expect(nm.getSimulatedLatency()).toBe(100);
  });
});

describe('CultureRuntime exports', () => {
  it('creates runtime with default norms', () => {
    const cr = new CultureRuntime({ defaultNorms: ['no_griefing'] });
    const dash = cr.dashboard();
    expect(dash.health).toBeDefined();
    expect(typeof dash.agents).toBe('number');
  });

  it('agents join and leave', () => {
    const cr = new CultureRuntime();
    cr.agentJoin('a1');
    expect(cr.dashboard().agents).toBe(1);
    cr.agentLeave('a1');
    expect(cr.dashboard().agents).toBe(0);
  });

  it('tick advances simulation', () => {
    const cr = new CultureRuntime();
    cr.agentJoin('a1');
    const before = cr.dashboard().tickCount;
    cr.tick();
    expect(cr.dashboard().tickCount).toBe(before + 1);
  });

  it('exports full state', () => {
    const cr = new CultureRuntime();
    cr.agentJoin('a1');
    cr.tick();
    const state = cr.exportState();
    expect(state.tickCount).toBeGreaterThan(0);
    expect(state.memory).toBeDefined();
  });
});
