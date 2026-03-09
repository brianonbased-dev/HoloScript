import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEngine } from '../AudioEngine';

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = new AudioEngine();
  });

  // ---------- Listener ----------
  it('defaults listener at origin', () => {
    const l = engine.getListener();
    expect(l.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('sets listener position', () => {
    engine.setListenerPosition({ x: 5, y: 0, z: 0 });
    expect(engine.getListener().position).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('sets listener orientation', () => {
    engine.setListenerOrientation({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(engine.getListener().forward).toEqual({ x: 1, y: 0, z: 0 });
  });

  // ---------- Playback ----------
  it('play returns source ID', () => {
    const id = engine.play('click');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('play with custom ID', () => {
    const id = engine.play('click', { id: 'mySource' });
    expect(id).toBe('mySource');
  });

  it('getSource retrieves by ID', () => {
    const id = engine.play('shot');
    const src = engine.getSource(id);
    expect(src).toBeDefined();
    expect(src!.soundId).toBe('shot');
    expect(src!.isPlaying).toBe(true);
  });

  it('stop removes source', () => {
    const id = engine.play('shot');
    engine.stop(id);
    expect(engine.getSource(id)).toBeUndefined();
  });

  it('stopAll clears all sources', () => {
    engine.play('a');
    engine.play('b');
    engine.stopAll();
    expect(engine.getActiveCount()).toBe(0);
  });

  // ---------- Counts ----------
  it('getActiveCount tracks active sources', () => {
    engine.play('a');
    engine.play('b');
    expect(engine.getActiveCount()).toBe(2);
  });

  it('getActiveSources returns playing sources', () => {
    engine.play('a');
    engine.play('b');
    expect(engine.getActiveSources().length).toBe(2);
  });

  // ---------- Master volume / mute ----------
  it('sets and gets master volume', () => {
    engine.setMasterVolume(0.5);
    expect(engine.getMasterVolume()).toBe(0.5);
  });

  it('clamps master volume', () => {
    engine.setMasterVolume(2);
    expect(engine.getMasterVolume()).toBe(1);
    engine.setMasterVolume(-1);
    expect(engine.getMasterVolume()).toBe(0);
  });

  it('mute toggle', () => {
    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
    engine.setMuted(false);
    expect(engine.isMuted()).toBe(false);
  });

  // ---------- Update & spatialization ----------
  it('update advances currentTime', () => {
    const id = engine.play('tick', { id: 's1' });
    engine.update(0.5);
    expect(engine.getSource(id)!.currentTime).toBeCloseTo(0.5);
  });

  it('pitch affects time advancement', () => {
    const id = engine.play('tick', { id: 's2', pitch: 2 });
    engine.update(1);
    expect(engine.getSource(id)!.currentTime).toBeCloseTo(2);
  });

  it('spatial source attenuates with distance', () => {
    const id = engine.play('sfx', {
      id: 's3',
      position: { x: 30, y: 0, z: 0 },
      spatialize: true,
    });
    engine.update(0.1);
    expect(engine.getSource(id)!.computedVolume).toBeLessThan(1);
  });

  it('non-spatial source has zero pan', () => {
    const id = engine.play('ui', {
      id: 's4',
      position: { x: 50, y: 0, z: 0 },
      spatialize: false,
    });
    engine.update(0.1);
    expect(engine.getSource(id)!.computedPan).toBe(0);
  });

  it('setSourcePosition updates source pos', () => {
    const id = engine.play('sfx', { id: 's5' });
    engine.setSourcePosition(id, { x: 10, y: 0, z: 0 });
    const src = engine.getSource(id)!;
    expect(src.config.position).toEqual({ x: 10, y: 0, z: 0 });
  });

  it('muted engine produces zero computed volume', () => {
    const id = engine.play('sfx', { id: 's6' });
    engine.setMuted(true);
    engine.update(0.1);
    expect(engine.getSource(id)!.computedVolume).toBe(0);
  });
});
