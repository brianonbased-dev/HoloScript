import { NextRequest } from 'next/server';

/**
 * GET /api/audio-presets — audio visualizer preset catalog
 * Returns waveform types and frequency band presets.
 */

export interface AudioPreset {
  id: string;
  name: string;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
  category: string;
  description: string;
  emoji: string;
  bpm: number;
  gain: number;
  lowFreq: number; // Hz
  midFreq: number; // Hz
  highFreq: number; // Hz
  traitSnippet: string;
}

const PRESETS: AudioPreset[] = [
  {
    id: 'ambient-drone',
    name: 'Ambient Drone',
    waveform: 'sine',
    category: 'ambient',
    emoji: '🌊',
    description: 'Slow evolving low-frequency drone for atmospheric scenes',
    bpm: 0,
    gain: 0.4,
    lowFreq: 60,
    midFreq: 200,
    highFreq: 800,
    traitSnippet: `  @audio {
    src: "ambient_drone.ogg"
    loop: true
    volume: 0.4
    spatial: true
    rolloffFactor: 0.5
    maxDistance: 30
  }`,
  },
  {
    id: 'exploration-theme',
    name: 'Exploration Theme',
    waveform: 'sine',
    category: 'music',
    emoji: '🎵',
    description: 'Gentle orchestral loop for open world exploration',
    bpm: 80,
    gain: 0.7,
    lowFreq: 80,
    midFreq: 500,
    highFreq: 4000,
    traitSnippet: `  @audio {
    src: "exploration.ogg"
    loop: true
    volume: 0.7
    crossfadeDuration: 2000
  }`,
  },
  {
    id: 'combat-pulse',
    name: 'Combat Pulse',
    waveform: 'sawtooth',
    category: 'music',
    emoji: '⚔️',
    description: 'Intense rhythmic loop for combat encounters',
    bpm: 140,
    gain: 0.8,
    lowFreq: 100,
    midFreq: 800,
    highFreq: 6000,
    traitSnippet: `  @audio {
    src: "combat_pulse.ogg"
    loop: true
    volume: 0.8
    bpm: 140
    beatSync: true
  }`,
  },
  {
    id: 'ui-click',
    name: 'UI Click',
    waveform: 'square',
    category: 'sfx',
    emoji: '🖱️',
    description: 'Crisp click sound for UI interactions',
    bpm: 0,
    gain: 0.5,
    lowFreq: 1000,
    midFreq: 3000,
    highFreq: 8000,
    traitSnippet: `  @audio {
    src: "ui_click.wav"
    loop: false
    volume: 0.5
    spatial: false
    playOn: "click"
  }`,
  },
  {
    id: 'footsteps',
    name: 'Footsteps',
    waveform: 'triangle',
    category: 'sfx',
    emoji: '👣',
    description: 'Character footstep sounds synchronized to movement',
    bpm: 120,
    gain: 0.6,
    lowFreq: 200,
    midFreq: 1200,
    highFreq: 3000,
    traitSnippet: `  @audio {
    src: "footsteps.ogg"
    loop: true
    volume: 0.6
    spatial: true
    playOn: "move"
    stepInterval: 500
  }`,
  },
  {
    id: 'wind',
    name: 'Wind',
    waveform: 'sine',
    category: 'ambient',
    emoji: '🌬️',
    description: 'Layered wind whoosh for outdoor environments',
    bpm: 0,
    gain: 0.35,
    lowFreq: 40,
    midFreq: 150,
    highFreq: 600,
    traitSnippet: `  @audio {
    src: "wind.ogg"
    loop: true
    volume: 0.35
    spatial: false
    randomizePitch: 0.1
  }`,
  },
  {
    id: 'explosion',
    name: 'Explosion',
    waveform: 'sawtooth',
    category: 'sfx',
    emoji: '💥',
    description: 'One-shot large explosion with debris tail',
    bpm: 0,
    gain: 1.0,
    lowFreq: 30,
    midFreq: 300,
    highFreq: 2000,
    traitSnippet: `  @audio {
    src: "explosion.ogg"
    loop: false
    volume: 1.0
    spatial: true
    rolloffFactor: 1.2
    maxDistance: 80
    pitchVariance: 0.05
  }`,
  },
  {
    id: 'tension-sting',
    name: 'Tension Sting',
    waveform: 'sawtooth',
    category: 'music',
    emoji: '😰',
    description: 'Short rising tension sting for dramatic moments',
    bpm: 0,
    gain: 0.75,
    lowFreq: 100,
    midFreq: 600,
    highFreq: 5000,
    traitSnippet: `  @audio {
    src: "tension_sting.ogg"
    loop: false
    volume: 0.75
    playOn: "trigger"
    fadeOutDuration: 500
  }`,
  },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const category = request.nextUrl.searchParams.get('category') ?? '';
  let results: AudioPreset[] = PRESETS;
  if (category) results = results.filter((p) => p.category === category);
  if (q)
    results = results.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  const categories = [...new Set(PRESETS.map((p) => p.category))];
  return Response.json({ presets: results, total: results.length, categories });
}
