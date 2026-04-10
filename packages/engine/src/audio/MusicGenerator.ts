/**
 * MusicGenerator.ts
 *
 * Procedural music: chord progressions, rhythm patterns,
 * melody generation, scale systems, and song structure.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export type ScaleType = 'major' | 'minor' | 'pentatonic' | 'blues' | 'dorian' | 'mixolydian';
export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug' | 'sus2' | 'sus4' | '7th';

export interface ChordDef {
  root: number; // MIDI note
  quality: ChordQuality;
  notes: number[];
  duration: number; // beats
}

export interface RhythmPattern {
  name: string;
  beats: boolean[]; // true = hit
  subdivision: number; // hits per beat
  swing: number; // 0-1
}

export interface MelodyNote {
  pitch: number; // MIDI note
  duration: number; // beats
  velocity: number; // 0-1
  time: number; // beat position
}

// =============================================================================
// SCALE DATA
// =============================================================================

const SCALES: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7th': [0, 4, 7, 10],
};

// =============================================================================
// MUSIC GENERATOR
// =============================================================================

export class MusicGenerator {
  private scale: ScaleType = 'major';
  private rootNote = 60; // Middle C
  private bpm = 120;
  private seed = 42;
  private rng: () => number;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = this.createRng(seed);
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setScale(scale: ScaleType): void {
    this.scale = scale;
  }
  setRoot(note: number): void {
    this.rootNote = note;
  }
  setBPM(bpm: number): void {
    this.bpm = bpm;
  }
  getScale(): ScaleType {
    return this.scale;
  }
  getBPM(): number {
    return this.bpm;
  }

  // ---------------------------------------------------------------------------
  // Scale Helpers
  // ---------------------------------------------------------------------------

  getScaleNotes(octaves = 2): number[] {
    const intervals = SCALES[this.scale];
    const notes: number[] = [];
    for (let oct = 0; oct < octaves; oct++) {
      for (const interval of intervals) {
        notes.push(this.rootNote + oct * 12 + interval);
      }
    }
    return notes;
  }

  isInScale(note: number): boolean {
    const relative = (((note - this.rootNote) % 12) + 12) % 12;
    return SCALES[this.scale].includes(relative);
  }

  // ---------------------------------------------------------------------------
  // Chord Generation
  // ---------------------------------------------------------------------------

  generateChord(scaleDegree: number, quality: ChordQuality = 'major', duration = 4): ChordDef {
    const intervals = SCALES[this.scale];
    const rootOffset = intervals[(scaleDegree - 1) % intervals.length];
    const root = this.rootNote + rootOffset;
    const chordIntervals = CHORD_INTERVALS[quality];
    const notes = chordIntervals.map((i) => root + i);

    return { root, quality, notes, duration };
  }

  generateProgression(degrees: number[], qualities?: ChordQuality[]): ChordDef[] {
    return degrees.map((deg, i) => {
      const quality = qualities?.[i] ?? 'major';
      return this.generateChord(deg, quality);
    });
  }

  // ---------------------------------------------------------------------------
  // Rhythm Generation
  // ---------------------------------------------------------------------------

  generateRhythm(beats: number, density = 0.5, subdivision = 4): RhythmPattern {
    const totalSlots = beats * subdivision;
    const hitSlots: boolean[] = [];

    for (let i = 0; i < totalSlots; i++) {
      hitSlots.push(this.rng() < density);
    }
    // Always hit beat 1
    hitSlots[0] = true;

    return { name: 'generated', beats: hitSlots, subdivision, swing: 0 };
  }

  // ---------------------------------------------------------------------------
  // Melody Generation
  // ---------------------------------------------------------------------------

  generateMelody(bars: number, noteDensity = 0.6): MelodyNote[] {
    const scaleNotes = this.getScaleNotes(2);
    const melody: MelodyNote[] = [];
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;

    let currentTime = 0;
    let lastNoteIndex = Math.floor(scaleNotes.length / 2);

    while (currentTime < totalBeats) {
      if (this.rng() < noteDensity) {
        // Step motion with occasional leaps
        const step =
          this.rng() < 0.7
            ? this.rng() < 0.5
              ? -1
              : 1 // Step
            : Math.floor(this.rng() * 5) - 2; // Leap

        lastNoteIndex = Math.max(0, Math.min(scaleNotes.length - 1, lastNoteIndex + step));

        const durations = [0.25, 0.5, 1, 2];
        const duration = durations[Math.floor(this.rng() * durations.length)];
        const velocity = 0.5 + this.rng() * 0.5;

        melody.push({
          pitch: scaleNotes[lastNoteIndex],
          duration,
          velocity,
          time: currentTime,
        });

        currentTime += duration;
      } else {
        currentTime += 0.5; // Rest
      }
    }

    return melody;
  }

  // ---------------------------------------------------------------------------
  // Seeded RNG
  // ---------------------------------------------------------------------------

  private createRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.rng = this.createRng(seed);
  }
}
