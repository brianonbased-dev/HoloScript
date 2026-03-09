import { describe, it, expect } from 'vitest';
import { SynthEngine } from '../audio/SynthEngine';
import { AudioGraph } from '../audio/AudioGraph';
import { MusicGenerator } from '../audio/MusicGenerator';

describe('Cycle 129: Procedural Audio', () => {
  // -------------------------------------------------------------------------
  // SynthEngine
  // -------------------------------------------------------------------------

  it('should play notes with ADSR envelope', () => {
    const synth = new SynthEngine();
    const id = synth.noteOn(440, 'sine', { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 });

    expect(synth.getActiveVoiceCount()).toBe(1);

    // Generate a sample during sustain
    const voice = synth.getVoice(id)!;
    voice.elapsed = 0.5; // past attack+decay
    const sample = synth.generateSample(0.5);
    expect(Math.abs(sample)).toBeGreaterThan(0);
  });

  it('should handle polyphony and voice stealing', () => {
    const synth = new SynthEngine();
    synth.setMaxPolyphony(3);

    synth.noteOn(261, 'sine');
    synth.noteOn(330, 'sine');
    synth.noteOn(392, 'sine');
    expect(synth.getActiveVoiceCount()).toBe(3);

    synth.noteOn(440, 'sine'); // Should steal oldest
    expect(synth.getActiveVoiceCount()).toBe(3);
  });

  it('should generate different waveform samples', () => {
    const synth = new SynthEngine();
    const id = synth.noteOn(440, 'square');
    const voice = synth.getVoice(id)!;
    voice.elapsed = 0.5;

    const sample = synth.generateSample(0.25);
    expect(typeof sample).toBe('number');
    expect(sample).toBeGreaterThanOrEqual(-1);
    expect(sample).toBeLessThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // AudioGraph
  // -------------------------------------------------------------------------

  it('should build and connect audio graph nodes', () => {
    const graph = new AudioGraph();
    const source = graph.addNode('source');
    const gain = graph.addNode('gain', { gain: 0.8 });
    const output = graph.addNode('output');

    graph.connect(source.id, gain.id);
    graph.connect(gain.id, output.id);

    expect(graph.getNodeCount()).toBe(3);
    expect(graph.getConnectionCount()).toBe(2);
    expect(graph.getParam(gain.id, 'gain')).toBe(0.8);
  });

  it('should compute topological processing order', () => {
    const graph = new AudioGraph();
    const src = graph.addNode('source');
    const fx = graph.addNode('delay');
    const out = graph.addNode('output');
    graph.connect(src.id, fx.id);
    graph.connect(fx.id, out.id);

    const order = graph.getProcessingOrder();
    const srcIdx = order.indexOf(src.id);
    const fxIdx = order.indexOf(fx.id);
    const outIdx = order.indexOf(out.id);

    expect(srcIdx).toBeLessThan(fxIdx);
    expect(fxIdx).toBeLessThan(outIdx);
  });

  it('should automate parameters', () => {
    const graph = new AudioGraph();
    const gain = graph.addNode('gain', { gain: 1 });

    graph.automate(gain.id, 'gain', [
      { time: 0, value: 1, curve: 'linear' },
      { time: 1, value: 0, curve: 'linear' },
    ]);

    graph.applyAutomation(0.5);
    expect(graph.getParam(gain.id, 'gain')).toBeCloseTo(0.5, 1);
  });

  // -------------------------------------------------------------------------
  // MusicGenerator
  // -------------------------------------------------------------------------

  it('should generate scale notes in key', () => {
    const gen = new MusicGenerator();
    gen.setRoot(60);
    gen.setScale('major');

    const notes = gen.getScaleNotes(1);
    expect(notes).toEqual([60, 62, 64, 65, 67, 69, 71]);
    expect(gen.isInScale(60)).toBe(true);
    expect(gen.isInScale(61)).toBe(false); // C# not in C major
  });

  it('should generate chord progressions', () => {
    const gen = new MusicGenerator();
    gen.setRoot(60);
    gen.setScale('major');

    const prog = gen.generateProgression([1, 4, 5, 1], ['major', 'major', 'major', 'major']);
    expect(prog).toHaveLength(4);
    expect(prog[0].root).toBe(60); // I
    expect(prog[1].root).toBe(65); // IV
    expect(prog[2].root).toBe(67); // V
    expect(prog[0].notes).toHaveLength(3); // Triad
  });

  it('should generate melodies deterministically from seed', () => {
    const gen1 = new MusicGenerator(42);
    gen1.setScale('pentatonic');
    const mel1 = gen1.generateMelody(2);

    const gen2 = new MusicGenerator(42);
    gen2.setScale('pentatonic');
    const mel2 = gen2.generateMelody(2);

    expect(mel1.length).toBe(mel2.length);
    expect(mel1[0].pitch).toBe(mel2[0].pitch);
    expect(mel1.length).toBeGreaterThan(0);
  });
});
