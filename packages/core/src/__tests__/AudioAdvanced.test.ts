import { describe, it, expect } from 'vitest';
import {
  SpatialAudioZoneSystem,
  REVERB_PRESETS,
  AudioOcclusionSystem,
  OCCLUSION_MATERIALS,
  AudioAnalyzer,
  DEFAULT_BANDS,
} from '@holoscript/engine/audio';

describe('Cycle 111: Audio & Spatial Sound', () => {
  // -------------------------------------------------------------------------
  // SpatialAudioZone
  // -------------------------------------------------------------------------

  it('should detect listener inside a box zone', () => {
    const system = new SpatialAudioZoneSystem();
    system.addZone({
      id: 'room1',
      shape: 'box',
      position: [0, 0, 0],
      size: [5, 3, 5],
      reverb: REVERB_PRESETS.room,
      priority: 1,
      fadeDistance: 2,
    });

    system.updateListenerPosition([2, 1, 2]);
    expect(system.isListenerInsideZone('room1')).toBe(true);

    const zones = system.getActiveZones();
    expect(zones).toHaveLength(1);
    expect(zones[0].blendWeight).toBe(1);
  });

  it('should fade zone influence at boundaries', () => {
    const system = new SpatialAudioZoneSystem();
    system.addZone({
      id: 'hall',
      shape: 'sphere',
      position: [0, 0, 0],
      size: [10, 10, 10],
      reverb: REVERB_PRESETS.hall,
      priority: 1,
      fadeDistance: 5,
    });

    // Outside sphere at distance 12 (2 into fade zone of 5)
    system.updateListenerPosition([12, 0, 0]);
    const zones = system.getActiveZones();
    expect(zones).toHaveLength(1);
    expect(zones[0].isInside).toBe(false);
    expect(zones[0].blendWeight).toBeGreaterThan(0);
    expect(zones[0].blendWeight).toBeLessThan(1);
  });

  it('should blend reverb between zones', () => {
    const system = new SpatialAudioZoneSystem();
    system.addZone({
      id: 'z1',
      shape: 'box',
      position: [0, 0, 0],
      size: [5, 3, 5],
      reverb: REVERB_PRESETS.cathedral,
      priority: 2,
      fadeDistance: 3,
    });
    system.addZone({
      id: 'z2',
      shape: 'box',
      position: [8, 0, 0],
      size: [5, 3, 5],
      reverb: REVERB_PRESETS.outdoor,
      priority: 1,
      fadeDistance: 3,
    });

    system.updateListenerPosition([0, 0, 0]);
    const reverb = system.getEffectiveReverb();
    expect(reverb).not.toBeNull();
    expect(reverb!.decay).toBe(REVERB_PRESETS.cathedral.decay);
  });

  // -------------------------------------------------------------------------
  // AudioOcclusion
  // -------------------------------------------------------------------------

  it('should compute no occlusion without obstacles', () => {
    const occlusion = new AudioOcclusionSystem();
    const result = occlusion.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    expect(result.occluded).toBe(false);
    expect(result.occlusionFactor).toBe(0);
  });

  it('should compute occlusion from manual hits', () => {
    const occlusion = new AudioOcclusionSystem();
    const result = occlusion.computeFromHits('src2', [
      { distance: 3, materialId: 'concrete', thickness: 0.3 },
    ]);
    expect(result.occluded).toBe(true);
    expect(result.hitCount).toBe(1);
    expect(result.totalTransmissionLoss).toBe(OCCLUSION_MATERIALS.concrete.transmissionLoss);
    expect(result.materials).toContain('concrete');
  });

  it('should clamp transmission loss to max', () => {
    const occlusion = new AudioOcclusionSystem();
    occlusion.setMaxTransmissionLoss(40);

    const result = occlusion.computeFromHits('src3', [
      { distance: 1, materialId: 'concrete', thickness: 0.3 },
      { distance: 2, materialId: 'metal', thickness: 0.1 },
    ]);
    expect(result.totalTransmissionLoss).toBe(40);
    expect(result.occlusionFactor).toBe(1);

    const vol = occlusion.getVolumeMultiplier(result.occlusionFactor);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(0.1);
  });

  it('should use raycast provider for occlusion', () => {
    const occlusion = new AudioOcclusionSystem();
    occlusion.setRaycastProvider((_ray) => [{ distance: 5, materialId: 'wood', thickness: 0.1 }]);

    const result = occlusion.computeOcclusion([0, 0, 0], [10, 0, 0], 'src4');
    expect(result.occluded).toBe(true);
    expect(result.totalTransmissionLoss).toBe(OCCLUSION_MATERIALS.wood.transmissionLoss);
  });

  // -------------------------------------------------------------------------
  // AudioAnalyzer
  // -------------------------------------------------------------------------

  it('should analyze a sine wave and detect peak frequency', () => {
    const analyzer = new AudioAnalyzer(256, 44100);
    const samples = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }

    analyzer.analyze(samples, 0);
    const spectrum = analyzer.getSpectrum();
    expect(spectrum).not.toBeNull();
    expect(spectrum!.binCount).toBeGreaterThan(0);
    expect(spectrum!.peakMagnitude).toBeGreaterThan(0);
  });

  it('should compute loudness metrics', () => {
    const analyzer = new AudioAnalyzer(128, 44100);
    const samples = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / 44100);
    }

    analyzer.analyze(samples, 0);
    const loudness = analyzer.getLoudness();
    expect(loudness.rms).toBeGreaterThan(0);
    expect(loudness.peak).toBeGreaterThan(0);
    expect(loudness.peak).toBeCloseTo(0.5, 1);
    expect(loudness.lufs).toBeLessThan(0);
  });

  it('should extract audio bands', () => {
    const analyzer = new AudioAnalyzer(256, 44100);
    const samples = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      samples[i] = Math.sin((2 * Math.PI * 100 * i) / 44100);
    }

    analyzer.analyze(samples, 0);
    const bands = analyzer.getBands();
    expect(bands).toHaveLength(DEFAULT_BANDS.length);
    const bass = bands.find((b) => b.name === 'bass');
    expect(bass).toBeDefined();
    expect(bass!.energy).toBeGreaterThan(0);
  });

  it('should provide audio-reactive value', () => {
    const analyzer = new AudioAnalyzer(128, 44100);
    const samples = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      samples[i] = Math.sin((2 * Math.PI * 150 * i) / 44100);
    }

    analyzer.analyze(samples, 0);
    const reactive = analyzer.getReactiveValue();
    expect(reactive).toBeGreaterThanOrEqual(0);
    expect(reactive).toBeLessThanOrEqual(1);
  });
});
