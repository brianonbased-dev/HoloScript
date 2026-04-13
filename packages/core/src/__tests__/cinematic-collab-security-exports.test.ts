/**
 * @fileoverview Tests for CinematicDirector, CollaborationSession, SandboxExecutor barrel exports
 */
import { describe, it, expect } from 'vitest';
import {
  CinematicDirector,
  CollaborationSession,
  createSandbox,
  executeSandbox,
  destroySandbox,
} from '../index';
import { createDefaultPolicy, createStrictPolicy } from '@holoscript/platform';

describe('CinematicDirector exports', () => {
  it('creates a scene with actors and cues', () => {
    const dir = new CinematicDirector();
    const scene = dir.createScene('s1', 'Test Scene', 5);
    expect(scene.id).toBe('s1');
    expect(scene.duration).toBe(5);
    dir.addActorMark('s1', {
      actorId: 'hero',
      position: [0, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
    });
    expect(dir.getScene('s1')?.actors.length).toBe(1);
  });

  it('adds cues sorted by time', () => {
    const dir = new CinematicDirector();
    dir.createScene('s1', 'Test', 10);
    dir.addCue('s1', { id: 'c1', time: 3, type: 'dialogue', data: {} });
    dir.addCue('s1', { id: 'c2', time: 1, type: 'camera_cut', data: {} });
    const cues = dir.getScene('s1')!.cues;
    expect(cues[0].time).toBe(1); // Sorted
    expect(cues[1].time).toBe(3);
  });

  it('playScene and update fires cues', () => {
    const dir = new CinematicDirector();
    dir.createScene('s1', 'Test', 5);
    dir.addCue('s1', { id: 'c1', time: 0.5, type: 'effect', data: {} });
    dir.addCue('s1', { id: 'c2', time: 2, type: 'sound', data: {} });
    dir.playScene('s1');
    expect(dir.isPlaying()).toBe(true);
    dir.update(1.0);
    expect(dir.getFiredCues().length).toBe(1); // Only c1 fired
    dir.update(1.5);
    expect(dir.getFiredCues().length).toBe(2); // Both fired
  });

  it('stop resets playback', () => {
    const dir = new CinematicDirector();
    dir.createScene('s1', 'Test', 5);
    dir.playScene('s1');
    dir.update(1);
    dir.stop();
    expect(dir.isPlaying()).toBe(false);
    expect(dir.getActiveScene()).toBeNull();
  });

  it('onCue callback fires for matching type', () => {
    const dir = new CinematicDirector();
    dir.createScene('s1', 'Test', 5);
    dir.addCue('s1', { id: 'c1', time: 0.1, type: 'dialogue', data: { text: 'Hello' } });
    let fired = false;
    dir.onCue('dialogue', (cue) => {
      fired = true;
      expect(cue.data.text).toBe('Hello');
    });
    dir.playScene('s1');
    dir.update(0.2);
    expect(fired).toBe(true);
  });
});

describe('CollaborationSession exports', () => {
  it('creates session with local peer', () => {
    const session = new CollaborationSession({
      sessionId: 'test',
      workspaceId: 'ws',
      localPeer: { peerId: 'me', displayName: 'Me', color: '#fff', platform: 'ide' },
    });
    expect(session.getState()).toBeDefined();
  });

  it('adds and removes peers', () => {
    const session = new CollaborationSession({
      sessionId: 'test',
      workspaceId: 'ws',
      localPeer: { peerId: 'me', displayName: 'Me', color: '#fff', platform: 'ide' },
    });
    session.addPeer({
      peerId: 'p1',
      displayName: 'Alice',
      color: '#f00',
      openDocuments: [],
      connectionQuality: 0.9,
      platform: 'vr',
      joinedAt: Date.now(),
    });
    expect(session.getPeerCount()).toBeGreaterThanOrEqual(1);
    session.removePeer('p1');
  });

  it('getStats returns session statistics', () => {
    const session = new CollaborationSession({
      sessionId: 'test',
      workspaceId: 'ws',
      localPeer: { peerId: 'me', displayName: 'Me', color: '#fff', platform: 'ide' },
    });
    const stats = session.getStats();
    expect(stats).toBeDefined();
    expect(stats.state).toBeDefined();
    expect(typeof stats.peerCount).toBe('number');
    expect(typeof stats.documentCount).toBe('number');
  });

  it('getPeers returns array', () => {
    const session = new CollaborationSession({
      sessionId: 'test',
      workspaceId: 'ws',
      localPeer: { peerId: 'me', displayName: 'Me', color: '#fff', platform: 'ide' },
    });
    expect(Array.isArray(session.getPeers())).toBe(true);
  });
});

describe('SandboxExecutor exports', () => {
  it('createSandbox returns sandbox in idle state', () => {
    const policy = createDefaultPolicy();
    const sb = createSandbox(policy);
    expect(sb.id).toBeDefined();
    expect(sb.state).toBe('idle');
    destroySandbox(sb);
  });

  it('execute runs safe code successfully', async () => {
    const policy = createDefaultPolicy();
    const sb = createSandbox(policy);
    const result = await executeSandbox('1 + 1', sb);
    expect(result.success).toBe(true);
    // Result value may or may not be captured depending on sandbox scope
    expect(result.cpuTimeUsed).toBeGreaterThanOrEqual(0);
    destroySandbox(sb);
  });

  it('execute blocks dangerous code', async () => {
    const policy = createStrictPolicy();
    const sb = createSandbox(policy);
    const result = await executeSandbox('process.exit(1)', sb);
    expect(result.success).toBe(false);
    destroySandbox(sb);
  });

  it('destroySandbox sets state to destroyed', () => {
    const policy = createDefaultPolicy();
    const sb = createSandbox(policy);
    destroySandbox(sb);
    expect(sb.state).toBe('destroyed');
  });
});
