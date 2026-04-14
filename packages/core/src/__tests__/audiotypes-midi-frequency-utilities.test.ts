/**
 * Sprint 26 Acceptance Tests â€” Audio + Particles + Terrain (v3.35.0)
 *
 * Features:
 *   1A/B  AudioTypes         â€” utility functions, factory helpers
 *   2A    AudioEngine        â€” listener, play/stop, volume, muted
 *   3A    SpatialAudioSource â€” position, volume, playback state
 *   4A    SoundPool          â€” register, get, category queries
 *   5A    ParticleSystem     â€” emitting, burst, update, getAliveParticles
 *   6A    ParticleEmitter    â€” play/stop, update, getAliveCount
 *   7A    ParticleForceSystem â€” addForce, removeForce, apply
 *   8A    TerrainPaintLayer  â€” layers, paintAt, weights, undo
 *   9A    ErosionSim         â€” hydraulicErode, thermalErode, config
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Audio Types utilities
import {
  midiToFrequency,
  frequencyToMidi,
  midiToNoteName,
  noteNameToMidi,
  bufferSource,
  oscillatorSource,
  gainEffect,
  reverbEffect,
  delayEffect,
  filterEffect,
  createNote,
  createPattern,
  createTrack,
  validateSourceConfig,
  zeroVector,
  defaultOrientation,
  AUDIO_DEFAULTS,
} from '../audio/AudioTypes.js';

// AudioEngine
import { AudioEngine } from '../audio/AudioEngine.js';

// SpatialAudioSource
import { SpatialAudioSource } from '../audio/SpatialAudioSource.js';

// SoundPool
import { SoundPool } from '../audio/SoundPool.js';
import type { SoundDefinition } from '../audio/SoundPool.js';

// ParticleSystem
import { ParticleSystem } from '@holoscript/engine/particles';
import type { EmitterConfig, Color4 } from '@holoscript/engine/particles';

// ParticleEmitter
import { ParticleEmitter } from '@holoscript/engine/particles';
import type { EmitterConfig as EmitterCfg2 } from '@holoscript/engine/particles';

// ParticleForceSystem
import { ParticleForceSystem } from '@holoscript/engine/particles';

// TerrainPaintLayer
import { TerrainPaintLayer } from '@holoscript/engine/terrain/TerrainPaintLayer.js';
import type { PaintLayer } from '@holoscript/engine/terrain/TerrainPaintLayer.js';

// ErosionSim
import { ErosionSim } from '@holoscript/engine/terrain/ErosionSim.js';

// =============================================================================
// Helper constants
// =============================================================================

const COLOR_WHITE: Color4 = { r: 1, g: 1, b: 1, a: 1 };
const COLOR_RED: Color4 = { r: 1, g: 0, b: 0, a: 1 };

function makePointEmitter(max = 50): EmitterConfig {
  return {
    shape: 'point',
    rate: 10,
    maxParticles: max,
    lifetime: [1, 2],
    speed: [1, 2],
    size: [0.1, 0.2],
    sizeEnd: [0, 0.1],
    colorStart: COLOR_WHITE,
    colorEnd: COLOR_RED,
    position: [0, 0, 0],
  };
}

function makeEmitterCfg2(max = 50): EmitterCfg2 {
  return {
    id: 'e1',
    maxParticles: max,
    emissionRate: 10,
    emissionShape: 'point',
    shapeParams: {},
    lifetime: 2,
    startSpeed: 1,
    startSize: 0.1,
    startColor: { r: 1, g: 1, b: 1, a: 1 },
    gravity: { x: 0, y: -9.8, z: 0 },
    worldSpace: true,
    prewarm: false,
  };
}

// =============================================================================
// Feature 1A: AudioTypes â€” MIDI / frequency utilities
// =============================================================================

describe('Feature 1A: AudioTypes â€” MIDI / frequency utilities', () => {
  it('midiToFrequency(69) returns ~440 Hz (A4)', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 0);
  });

  it('midiToFrequency(60) returns ~261.63 Hz (C4)', () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it('frequencyToMidi(440) returns 69', () => {
    expect(frequencyToMidi(440)).toBe(69);
  });

  it('midiToNoteName(69) returns A4', () => {
    expect(midiToNoteName(69)).toBe('A4');
  });

  it('noteNameToMidi(A4) returns 69', () => {
    expect(noteNameToMidi('A4')).toBe(69);
  });

  it('midiToNoteName(60) returns C4', () => {
    expect(midiToNoteName(60)).toBe('C4');
  });

  it('zeroVector returns { x:0, y:0, z:0 }', () => {
    expect(zeroVector()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('defaultOrientation has forward and up', () => {
    const ori = defaultOrientation();
    expect(ori.forward).toBeDefined();
    expect(ori.up).toBeDefined();
  });

  it('AUDIO_DEFAULTS has sampleRate', () => {
    expect(AUDIO_DEFAULTS.sampleRate).toBeGreaterThan(0);
  });

  it('AUDIO_DEFAULTS has maxSources > 0', () => {
    expect(AUDIO_DEFAULTS.maxSources).toBeGreaterThan(0);
  });
});

// =============================================================================
// Feature 1B: AudioTypes â€” factory helpers
// =============================================================================

describe('Feature 1B: AudioTypes â€” factory helpers', () => {
  it('bufferSource creates config with type=buffer', () => {
    const src = bufferSource('s1', 'audio/test.ogg');
    expect(src.type).toBe('buffer');
    expect(src.id).toBe('s1');
  });

  it('oscillatorSource creates config with type=oscillator', () => {
    const src = oscillatorSource('osc1', 'sine', 440);
    expect(src.type).toBe('oscillator');
  });

  it('gainEffect creates gain effect config', () => {
    const fx = gainEffect('g1', 0.8);
    expect(fx.type).toBe('gain');
    expect(fx.gain).toBe(0.8);
  });

  it('reverbEffect creates reverb config', () => {
    const fx = reverbEffect('r1', 0.5, 0.3);
    expect(fx.type).toBe('reverb');
  });

  it('delayEffect creates delay config', () => {
    const fx = delayEffect('d1', 0.25, 0.4);
    expect(fx.type).toBe('delay');
  });

  it('filterEffect creates filter config', () => {
    const fx = filterEffect('f1', 'lowpass', 800);
    expect(fx.type).toBe('filter');
    expect(fx.filterType).toBe('lowpass');
  });

  it('createNote returns note with correct fields', () => {
    const note = createNote(69, 0, 1, 100);
    expect(note.pitch).toBe(69);
    expect(note.velocity).toBe(100);
    expect(note.duration).toBe(1);
  });

  it('createPattern returns pattern with id and notes', () => {
    const pat = createPattern('p1', [createNote(60, 0, 1)]);
    expect(pat.id).toBe('p1');
    expect(pat.notes).toHaveLength(1);
  });

  it('createTrack returns track with id and patterns', () => {
    const track = createTrack('t1', []);
    expect(track.id).toBe('t1');
    expect(Array.isArray(track.patterns)).toBe(true);
  });

  it('validateSourceConfig detects invalid config', () => {
    const result = validateSourceConfig({} as any);
    expect(result.valid).toBe(false);
  });

  it('validateSourceConfig accepts valid buffer config', () => {
    const src = bufferSource('v1', 'audio/test.ogg');
    const result = validateSourceConfig(src);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Feature 2A: AudioEngine â€” listener, play/stop, volume, muted
// =============================================================================

describe('Feature 2A: AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = new AudioEngine();
  });

  it('getMasterVolume returns 1 by default', () => {
    expect(engine.getMasterVolume()).toBe(1);
  });

  it('setMasterVolume / getMasterVolume round-trip', () => {
    engine.setMasterVolume(0.5);
    expect(engine.getMasterVolume()).toBe(0.5);
  });

  it('isMuted returns false by default', () => {
    expect(engine.isMuted()).toBe(false);
  });

  it('setMuted(true) / isMuted() round-trip', () => {
    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
  });

  it('getActiveCount is 0 initially', () => {
    expect(engine.getActiveCount()).toBe(0);
  });

  it('play returns a source id string', () => {
    const id = engine.play('beep');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('getActiveCount increases after play', () => {
    engine.play('beep');
    expect(engine.getActiveCount()).toBeGreaterThan(0);
  });

  it('getSource returns source after play', () => {
    const id = engine.play('beep');
    const src = engine.getSource(id);
    expect(src).toBeDefined();
    expect(src?.soundId).toBe('beep');
  });

  it('getActiveSources returns non-empty after play', () => {
    engine.play('beep');
    expect(engine.getActiveSources().length).toBeGreaterThan(0);
  });

  it('stop removes source', () => {
    const id = engine.play('beep');
    engine.stop(id);
    expect(engine.getSource(id)).toBeUndefined();
  });

  it('stopAll clears all sources', () => {
    engine.play('s1');
    engine.play('s2');
    engine.stopAll();
    expect(engine.getActiveCount()).toBe(0);
  });

  it('getListener returns position', () => {
    const l = engine.getListener();
    expect(l.position).toBeDefined();
  });

  it('setListenerPosition updates listener', () => {
    engine.setListenerPosition({ x: 5, y: 0, z: 5 });
    const l = engine.getListener();
    expect(l.position[0]).toBe(5);
  });
});

// =============================================================================
// Feature 3A: SpatialAudioSource
// =============================================================================

describe('Feature 3A: SpatialAudioSource', () => {
  let src: SpatialAudioSource;

  beforeEach(() => {
    src = new SpatialAudioSource({ position: [0, 0, 0] });
  });

  it('isPlaying returns false initially', () => {
    expect(src.isPlaying()).toBe(false);
  });

  it('play() sets isPlaying to true', () => {
    src.play();
    expect(src.isPlaying()).toBe(true);
  });

  it('stop() sets isPlaying to false', () => {
    src.play();
    src.stop();
    expect(src.isPlaying()).toBe(false);
  });

  it('pause() stops playback', () => {
    src.play();
    src.pause();
    expect(src.isPlaying()).toBe(false);
  });

  it('resume() after pause resumes', () => {
    src.play();
    src.pause();
    src.resume();
    expect(src.isPlaying()).toBe(true);
  });

  it('getVolume returns 1 by default', () => {
    expect(src.getVolume()).toBe(1);
  });

  it('setVolume / getVolume round-trip', () => {
    src.setVolume(0.5);
    expect(src.getVolume()).toBe(0.5);
  });

  it('getPosition returns initial position', () => {
    const pos = src.getPosition();
    expect(pos).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  it('setPosition updates position', () => {
    src.setPosition(3, 1, 2);
    const pos = src.getPosition();
    expect(pos.x).toBe(3);
    expect(pos.y).toBe(1);
  });

  it('getConfig returns config object', () => {
    const cfg = src.getConfig();
    expect(cfg).toBeDefined();
  });
});

// =============================================================================
// Feature 4A: SoundPool
// =============================================================================

describe('Feature 4A: SoundPool', () => {
  let pool: SoundPool;

  const makeSound = (id: string, cat = 'sfx'): SoundDefinition => ({
    id,
    name: `Sound ${id}`,
    duration: 1.0,
    category: cat,
    volume: 1.0,
    loop: false,
  });

  beforeEach(() => {
    pool = new SoundPool();
  });

  it('count is 0 initially', () => {
    expect(pool.count).toBe(0);
  });

  it('register increases count', () => {
    pool.register(makeSound('s1'));
    expect(pool.count).toBe(1);
  });

  it('has returns true after register', () => {
    pool.register(makeSound('s2'));
    expect(pool.has('s2')).toBe(true);
  });

  it('has returns false for unregistered', () => {
    expect(pool.has('nope')).toBe(false);
  });

  it('get returns registered sound', () => {
    pool.register(makeSound('s3'));
    expect(pool.get('s3')).toBeDefined();
    expect(pool.get('s3')?.id).toBe('s3');
  });

  it('get returns undefined for unknown', () => {
    expect(pool.get('unknown')).toBeUndefined();
  });

  it('registerAll registers multiple sounds', () => {
    pool.registerAll([makeSound('a'), makeSound('b'), makeSound('c')]);
    expect(pool.count).toBe(3);
  });

  it('getByCategory returns matching sounds', () => {
    pool.register(makeSound('x1', 'music'));
    pool.register(makeSound('x2', 'sfx'));
    pool.register(makeSound('x3', 'music'));
    expect(pool.getByCategory('music')).toHaveLength(2);
  });

  it('getByCategory returns empty for unknown category', () => {
    expect(pool.getByCategory('ambient')).toHaveLength(0);
  });

  it('getRandomFromCategory returns a sound from category', () => {
    pool.register(makeSound('r1', 'ambient'));
    pool.register(makeSound('r2', 'ambient'));
    const s = pool.getRandomFromCategory('ambient');
    expect(s).toBeDefined();
    expect(s?.category).toBe('ambient');
  });

  it('listIds returns all registered ids', () => {
    pool.registerAll([makeSound('id1'), makeSound('id2')]);
    const ids = pool.listIds();
    expect(ids).toContain('id1');
    expect(ids).toContain('id2');
  });
});

// =============================================================================
// Feature 5A: ParticleSystem â€” emitting, burst, update
// =============================================================================

describe('Feature 5A: ParticleSystem', () => {
  let sys: ParticleSystem;

  beforeEach(() => {
    sys = new ParticleSystem(makePointEmitter(100));
  });

  it('isEmitting is true by default', () => {
    expect(sys.isEmitting()).toBe(true);
  });

  it('setEmitting(false) stops emission', () => {
    sys.setEmitting(false);
    expect(sys.isEmitting()).toBe(false);
  });

  it('setEmitting(true) restarts emission', () => {
    sys.setEmitting(false);
    sys.setEmitting(true);
    expect(sys.isEmitting()).toBe(true);
  });

  it('getActiveCount is 0 before update', () => {
    expect(sys.getActiveCount()).toBe(0);
  });

  it('update with enough delta emits particles', () => {
    sys.update(1.0); // 1 second at rate=10 â†’ ~10 particles
    expect(sys.getActiveCount()).toBeGreaterThan(0);
  });

  it('getAliveParticles returns array', () => {
    sys.update(0.5);
    expect(Array.isArray(sys.getAliveParticles())).toBe(true);
  });

  it('burst(5) emits 5 particles', () => {
    sys.burst(5);
    sys.update(0); // flush activeCount recalculation
    expect(sys.getActiveCount()).toBe(5);
  });

  it('burst respects maxParticles', () => {
    sys.burst(200); // exceeds maxParticles=100
    sys.update(0);
    expect(sys.getActiveCount()).toBeLessThanOrEqual(100);
  });

  it('getConfig returns config with correct shape', () => {
    expect(sys.getConfig().shape).toBe('point');
  });

  it('setPosition updates emitter position', () => {
    sys.setPosition(5, 2, 3);
    expect(sys.getConfig().position[0]).toBe(5);
  });

  it('particles age over time', () => {
    sys.burst(5);
    sys.update(0.5);
    const particles = sys.getAliveParticles();
    expect(particles.every((p) => p.age > 0)).toBe(true);
  });
});

// =============================================================================
// Feature 6A: ParticleEmitter â€” play/stop, update, getAliveCount
// =============================================================================

describe('Feature 6A: ParticleEmitter', () => {
  let emitter: ParticleEmitter;

  beforeEach(() => {
    emitter = new ParticleEmitter(makeEmitterCfg2(100));
  });

  it('isPlaying returns false initially', () => {
    expect(emitter.isPlaying()).toBe(false);
  });

  it('play() sets isPlaying to true', () => {
    emitter.play();
    expect(emitter.isPlaying()).toBe(true);
  });

  it('stop() sets isPlaying to false', () => {
    emitter.play();
    emitter.stop();
    expect(emitter.isPlaying()).toBe(false);
  });

  it('pause() sets isPlaying to false', () => {
    emitter.play();
    emitter.pause();
    expect(emitter.isPlaying()).toBe(false);
  });

  it('getAliveCount is 0 before play', () => {
    expect(emitter.getAliveCount()).toBe(0);
  });

  it('update while playing emits particles', () => {
    emitter.play();
    emitter.update(1.0); // 1s at rate=10
    expect(emitter.getAliveCount()).toBeGreaterThan(0);
  });

  it('update while stopped emits nothing', () => {
    emitter.update(1.0);
    expect(emitter.getAliveCount()).toBe(0);
  });

  it('getAliveParticles returns array', () => {
    emitter.play();
    emitter.update(0.5);
    expect(Array.isArray(emitter.getAliveParticles())).toBe(true);
  });

  it('getCapacity matches maxParticles', () => {
    expect(emitter.getCapacity()).toBe(100);
  });

  it('getState reflects playing status', () => {
    emitter.play();
    const state = emitter.getState();
    expect(state.playing).toBe(true);
  });

  it('config is accessible', () => {
    expect(emitter.config.id).toBe('e1');
  });
});

// =============================================================================
// Feature 7A: ParticleForceSystem
// =============================================================================

describe('Feature 7A: ParticleForceSystem', () => {
  let forces: ParticleForceSystem;

  beforeEach(() => {
    forces = new ParticleForceSystem();
  });

  it('getForceCount is 0 initially', () => {
    expect(forces.getForceCount()).toBe(0);
  });

  it('addForce increases getForceCount', () => {
    forces.addForce({ id: 'gravity', type: 'gravity', strength: 9.8 });
    expect(forces.getForceCount()).toBe(1);
  });

  it('getForce returns added force', () => {
    forces.addForce({ id: 'wind', type: 'wind', strength: 2 });
    expect(forces.getForce('wind')).toBeDefined();
    expect(forces.getForce('wind')?.config.type).toBe('wind');
  });

  it('removeForce decreases count', () => {
    forces.addForce({ id: 'f1', type: 'gravity', strength: 1 });
    forces.removeForce('f1');
    expect(forces.getForceCount()).toBe(0);
  });

  it('getForce returns undefined for unknown id', () => {
    expect(forces.getForce('nope')).toBeUndefined();
  });

  it('setEnabled disables a force', () => {
    forces.addForce({ id: 'g1', type: 'gravity', strength: 9.8 });
    forces.setEnabled('g1', false);
    expect(forces.getForce('g1')?.enabled).toBe(false);
  });

  it('apply does not throw on empty particles', () => {
    forces.addForce({ id: 'g1', type: 'gravity', strength: 9.8 });
    expect(() => forces.apply([], 0.016)).not.toThrow();
  });
});

// =============================================================================
// Feature 8A: TerrainPaintLayer
// =============================================================================

describe('Feature 8A: TerrainPaintLayer', () => {
  let painter: TerrainPaintLayer;

  const makeLayer = (id: string): PaintLayer => ({
    id,
    name: `Layer ${id}`,
    textureId: `tex_${id}`,
    tiling: 1,
    metallic: 0,
    roughness: 0.8,
  });

  beforeEach(() => {
    painter = new TerrainPaintLayer(16);
  });

  it('getLayerCount is 0 initially', () => {
    expect(painter.getLayerCount()).toBe(0);
  });

  it('addLayer increases getLayerCount', () => {
    painter.addLayer(makeLayer('grass'));
    expect(painter.getLayerCount()).toBe(1);
  });

  it('addLayer returns index', () => {
    const idx = painter.addLayer(makeLayer('rock'));
    expect(idx).toBe(0);
  });

  it('getLayers returns added layers', () => {
    painter.addLayer(makeLayer('snow'));
    expect(painter.getLayers()).toHaveLength(1);
    expect(painter.getLayers()[0].id).toBe('snow');
  });

  it('removeLayer decreases count', () => {
    painter.addLayer(makeLayer('l1'));
    painter.addLayer(makeLayer('l2'));
    painter.removeLayer(0);
    expect(painter.getLayerCount()).toBe(1);
  });

  it('paintAt modifies weights', () => {
    painter.addLayer(makeLayer('base'));
    painter.addLayer(makeLayer('top'));
    painter.paintAt(5, 5, 1, 0.8, 2);
    const w = painter.getWeights(5, 5);
    expect(w[1]).toBeGreaterThan(0);
  });

  it('getDominantLayer returns index', () => {
    painter.addLayer(makeLayer('a'));
    painter.addLayer(makeLayer('b'));
    painter.paintAt(3, 3, 1, 1.0, 2);
    const dom = painter.getDominantLayer(3, 3);
    expect(dom).toBeGreaterThanOrEqual(0);
  });

  it('getUndoCount increases after paintAt', () => {
    painter.addLayer(makeLayer('g'));
    painter.paintAt(2, 2, 0, 0.5, 1);
    expect(painter.getUndoCount()).toBeGreaterThan(0);
  });

  it('undo decreases getUndoCount', () => {
    painter.addLayer(makeLayer('g'));
    painter.paintAt(2, 2, 0, 0.5, 1);
    const before = painter.getUndoCount();
    painter.undo();
    expect(painter.getUndoCount()).toBeLessThan(before);
  });

  it('undo returns false when nothing to undo', () => {
    expect(painter.undo()).toBe(false);
  });
});

// =============================================================================
// Feature 9A: ErosionSim
// =============================================================================

describe('Feature 9A: ErosionSim', () => {
  let sim: ErosionSim;

  beforeEach(() => {
    sim = new ErosionSim({ iterations: 100 });
  });

  it('getConfig returns config with iterations', () => {
    expect(sim.getConfig().iterations).toBe(100);
  });

  it('setConfig updates config', () => {
    sim.setConfig({ iterations: 200 });
    expect(sim.getConfig().iterations).toBe(200);
  });

  it('hydraulicErode returns ErosionResult', () => {
    const map = new Float32Array(16 * 16).fill(0.5);
    const result = sim.hydraulicErode(map, 16, 16);
    expect(result).toBeDefined();
    expect(typeof result.totalEroded).toBe('number');
  });

  it('hydraulicErode result has iterations field', () => {
    const map = new Float32Array(8 * 8).fill(0.3);
    const result = sim.hydraulicErode(map, 8, 8);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('thermalErode returns ErosionResult', () => {
    const map = new Float32Array(8 * 8);
    for (let i = 0; i < 64; i++) map[i] = Math.random();
    const result = sim.thermalErode(map, 8, 8);
    expect(result).toBeDefined();
    expect(typeof result.totalDeposited).toBe('number');
  });

  it('hydraulicErode modifies heightmap', () => {
    const map = new Float32Array(8 * 8);
    for (let i = 0; i < 64; i++) map[i] = 0.5 + (i % 3) * 0.1;
    const orig = map[10];
    sim.hydraulicErode(map, 8, 8);
    // At least one value should differ after erosion
    const changed = [...map].some((v, i) => Math.abs(v - (0.5 + (i % 3) * 0.1)) > 1e-6);
    expect(changed).toBe(true);
  });
});
