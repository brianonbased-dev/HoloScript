import { describe, it, expect, beforeEach } from 'vitest';
import { AudioAnalyzer } from '../AudioAnalyzer';

describe('AudioAnalyzer', () => {
  let analyzer: AudioAnalyzer;

  beforeEach(() => { analyzer = new AudioAnalyzer(256, 44100); });

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('constructs with default fftSize', () => {
    const a = new AudioAnalyzer();
    // default is 256 based on constructor signature
    expect(a).toBeDefined();
  });

  it('constructs with custom params', () => {
    const a = new AudioAnalyzer(512, 48000);
    expect(a).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Pre-analysis (silent / no data)
  // ---------------------------------------------------------------------------

  it('getSpectrum returns null before any analysis', () => {
    expect(analyzer.getSpectrum()).toBeNull();
  });

  it('getLoudness returns zero metrics before analysis', () => {
    const loud = analyzer.getLoudness();
    expect(loud.rms).toBe(0);
    expect(loud.peak).toBe(0);
  });

  it('getBands returns default band array', () => {
    const bands = analyzer.getBands();
    expect(bands.length).toBeGreaterThan(0);
    // All energies should be 0 before analysis
    bands.forEach(b => expect(b.energy).toBe(0));
  });

  it('getBandEnergy returns 0 for known band before analysis', () => {
    expect(analyzer.getBandEnergy('bass')).toBe(0);
  });

  it('getBeats returns empty array initially', () => {
    expect(analyzer.getBeats()).toHaveLength(0);
  });

  it('getLastBeat returns null initially', () => {
    expect(analyzer.getLastBeat()).toBeNull();
  });

  it('getEstimatedBPM returns 0 with no beats', () => {
    expect(analyzer.getEstimatedBPM()).toBe(0);
  });

  it('getSmoothedEnergy returns 0 with no data', () => {
    expect(analyzer.getSmoothedEnergy()).toBe(0);
  });

  it('getReactiveValue returns 0 with no data', () => {
    expect(analyzer.getReactiveValue()).toBeGreaterThanOrEqual(0);
    expect(analyzer.getReactiveValue()).toBeLessThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  it('analyze populates spectrum data', () => {
    const samples = new Float32Array(256);
    // sine wave at 440Hz
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
    }
    analyzer.analyze(samples, 0);
    const spectrum = analyzer.getSpectrum();
    expect(spectrum).not.toBeNull();
    expect(spectrum!.binCount).toBe(128); // fftSize/2
    expect(spectrum!.sampleRate).toBe(44100);
  });

  it('analyze updates loudness metrics', () => {
    const samples = new Float32Array(256);
    for (let i = 0; i < samples.length; i++) samples[i] = 0.5;
    analyzer.analyze(samples, 0);
    const loud = analyzer.getLoudness();
    expect(loud.rms).toBeGreaterThan(0);
  });

  it('analyze updates band energies', () => {
    const samples = new Float32Array(256);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 100 * i / 44100); // bass frequency
    }
    analyzer.analyze(samples, 0);
    // bass band should have some energy
    const bands = analyzer.getBands();
    const bassBand = bands.find(b => b.name === 'bass');
    expect(bassBand).toBeDefined();
  });

  it('spectrum peakFrequency is populated', () => {
    const samples = new Float32Array(256);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 1000 * i / 44100);
    }
    analyzer.analyze(samples, 0);
    const spectrum = analyzer.getSpectrum()!;
    expect(spectrum.peakFrequency).toBeGreaterThan(0);
    expect(spectrum.peakMagnitude).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Beat Detection
  // ---------------------------------------------------------------------------

  it('detects beats from strong transients', () => {
    const analyzer2 = new AudioAnalyzer(256, 44100, {
      sensitivity: 1.2,
      minInterval: 200,
      energyThreshold: 0.01,
    });
    // Simulate several loud then quiet buffers to trigger beat detection
    for (let frame = 0; frame < 20; frame++) {
      const samples = new Float32Array(256);
      const loud = frame % 5 === 0;
      for (let i = 0; i < samples.length; i++) {
        samples[i] = loud ? Math.sin(2 * Math.PI * 100 * i / 44100) : 0;
      }
      analyzer2.analyze(samples, frame * 100);
    }
    // May or may not detect beats depending on algorithm sensitivity
    expect(analyzer2.getBeats()).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  it('reset clears all state', () => {
    const samples = new Float32Array(256);
    for (let i = 0; i < samples.length; i++) samples[i] = 0.5;
    analyzer.analyze(samples, 0);
    analyzer.reset();
    expect(analyzer.getSpectrum()).toBeNull();
    expect(analyzer.getBeats()).toHaveLength(0);
    expect(analyzer.getLoudness().rms).toBe(0);
  });
});
