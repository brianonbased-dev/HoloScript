import { describe, it, expect, beforeEach } from 'vitest';
import { AudioContextImpl } from '../AudioContextImpl';

describe('AudioContextImpl', () => {
  let ctx: AudioContextImpl;
  beforeEach(async () => {
    ctx = new AudioContextImpl();
    await ctx.initialize();
  });

  // --- Lifecycle ---
  it('initializes to running state', () => {
    expect(ctx.state).toBe('running');
  });

  it('currentTime starts at 0', () => {
    expect(ctx.currentTime).toBe(0);
  });

  it('sampleRate has valid default', () => {
    expect(ctx.sampleRate).toBeGreaterThan(0);
  });

  it('suspend changes state', async () => {
    await ctx.suspend();
    expect(ctx.state).toBe('suspended');
  });

  it('resume from suspended', async () => {
    await ctx.suspend();
    await ctx.resume();
    expect(ctx.state).toBe('running');
  });

  it('dispose closes context', () => {
    ctx.dispose();
    expect(ctx.state).toBe('closed');
  });

  // --- Master volume ---
  it('setMasterVolume / getMasterVolume', () => {
    ctx.setMasterVolume(0.5);
    expect(ctx.getMasterVolume()).toBeCloseTo(0.5);
  });

  it('setMasterVolume clamps', () => {
    ctx.setMasterVolume(2);
    expect(ctx.getMasterVolume()).toBeLessThanOrEqual(1);
    ctx.setMasterVolume(-1);
    expect(ctx.getMasterVolume()).toBeGreaterThanOrEqual(0);
  });

  // --- Mute ---
  it('mute / unmute / isMuted', () => {
    expect(ctx.isMuted).toBe(false);
    ctx.mute();
    expect(ctx.isMuted).toBe(true);
    ctx.unmute();
    expect(ctx.isMuted).toBe(false);
  });

  // --- Listener ---
  it('setListenerPosition', () => {
    ctx.setListenerPosition({ x: 1, y: 2, z: 3 });
    const config = ctx.getListenerConfig();
    expect(config.position.x).toBe(1);
  });

  it('setListenerOrientation', () => {
    ctx.setListenerOrientation({
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
    });
    const config = ctx.getListenerConfig();
    expect(config.orientation).toBeDefined();
  });

  // --- Source management ---
  it('createSource returns id', async () => {
    const id = await ctx.createSource({ id: 'test-src', url: 'test.mp3' });
    expect(typeof id).toBe('string');
  });

  it('getSource returns source state', async () => {
    const id = await ctx.createSource({ id: 'src1', url: 'test.mp3' });
    const source = ctx.getSource(id);
    expect(source).toBeDefined();
    expect(source!.state).toBe('stopped');
  });

  it('getAllSources returns all', async () => {
    await ctx.createSource({ id: 'a', url: 'a.mp3' });
    await ctx.createSource({ id: 'b', url: 'b.mp3' });
    const all = ctx.getAllSources();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('removeSource deletes id', async () => {
    const id = await ctx.createSource({ id: 'del', url: 'x.mp3' });
    expect(ctx.removeSource(id)).toBe(true);
    expect(ctx.getSource(id)).toBeUndefined();
  });

  it('removeSource returns false for unknown', () => {
    expect(ctx.removeSource('nope')).toBe(false);
  });

  // --- Playback ---
  it('play transitions to playing', async () => {
    const id = await ctx.createSource({ id: 'play1', url: 'x.mp3' });
    ctx.play(id);
    const src = ctx.getSource(id);
    expect(src!.state).toBe('playing');
  });

  it('stop transitions to stopped', async () => {
    const id = await ctx.createSource({ id: 'stop1', url: 'x.mp3' });
    ctx.play(id);
    ctx.stop(id);
    const src = ctx.getSource(id);
    expect(src!.state).toBe('stopped');
  });

  it('pause transitions to paused', async () => {
    const id = await ctx.createSource({ id: 'pause1', url: 'x.mp3' });
    ctx.play(id);
    ctx.pause(id);
    const src = ctx.getSource(id);
    expect(src!.state).toBe('paused');
  });

  it('resumeSource transitions from paused to playing', async () => {
    const id = await ctx.createSource({ id: 'res1', url: 'x.mp3' });
    ctx.play(id);
    ctx.pause(id);
    ctx.resumeSource(id);
    const src = ctx.getSource(id);
    expect(src!.state).toBe('playing');
  });

  // --- Source properties ---
  it('setVolume changes source volume', async () => {
    const id = await ctx.createSource({ id: 'vol1', url: 'x.mp3' });
    ctx.setVolume(id, 0.3);
    const src = ctx.getSource(id);
    expect(src!.volume).toBeCloseTo(0.3);
  });

  it('setPitch changes source pitch', async () => {
    const id = await ctx.createSource({ id: 'pitch1', url: 'x.mp3' });
    ctx.setPitch(id, 1.5);
    const src = ctx.getSource(id);
    expect(src!.pitch).toBeCloseTo(1.5);
  });

  it('setLoop updates loop flag', async () => {
    const id = await ctx.createSource({ id: 'loop1', url: 'x.mp3' });
    ctx.setLoop(id, true);
    const src = ctx.getSource(id);
    expect(src!.loop).toBe(true);
  });

  it('setPosition updates spatial position', async () => {
    const id = await ctx.createSource({ id: 'pos1', url: 'x.mp3' });
    ctx.setPosition(id, { x: 5, y: 0, z: -3 });
    const src = ctx.getSource(id);
    expect(src!.position.x).toBe(5);
  });
});
