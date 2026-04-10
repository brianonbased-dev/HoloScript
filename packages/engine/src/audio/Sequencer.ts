/**
 * Sequencer.ts
 *
 * Music sequencer implementation for HoloScript with pattern-based
 * composition, multi-track support, and BPM-based timing.
 *
 * @module audio
 */

import {
  ISequencer,
  ISequence,
  IPattern,
  ITrack,
  INote,
  SequencerState,
  LoopMode,
  ISequencerState,
  IAudioContext,
  AudioEventType,
  AudioEventCallback,
  IAudioEvent,
  midiToFrequency,
  noteNameToMidi,
} from './AudioTypes';

// ============================================================================
// Internal Types
// ============================================================================

interface ScheduledNote {
  track: string;
  note: INote;
  startTime: number;
  endTime: number;
  triggered: boolean;
  released: boolean;
}

// ============================================================================
// SequencerImpl
// ============================================================================

/**
 * HoloScript music sequencer implementation
 */
export class SequencerImpl implements ISequencer {
  private _state: SequencerState = 'stopped';
  private _bpm: number = 120;
  private _swing: number = 0;
  private _currentBeat: number = 0;
  private _currentBar: number = 0;
  private _currentPatternIndex: number = 0;
  private _loopMode: LoopMode = 'pattern';
  private _loopStart: number = 0;
  private _loopEnd: number = 4;
  private _metronomeEnabled: boolean = false;
  private _countInBars: number = 0;
  private _countingIn: boolean = false;

  private readonly context: IAudioContext;
  private readonly sequences: Map<string, ISequence> = new Map();
  private readonly patterns: Map<string, IPattern> = new Map();
  private readonly tracks: Map<string, ITrack> = new Map();
  private readonly scheduledNotes: ScheduledNote[] = [];
  private readonly eventListeners: Map<AudioEventType, Set<AudioEventCallback>> = new Map();
  private readonly triggerCallbacks: Map<string, Set<(note: INote, time: number) => void>> =
    new Map();

  private currentSequenceId: string | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private lastScheduledBeat: number = -1;
  private scheduleAheadTime: number = 0.1; // seconds
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(context: IAudioContext) {
    this.context = context;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  public load(sequence: ISequence): void {
    this.createSequence(sequence);
    this.loadSequence(sequence.id);
  }

  public unload(): void {
    if (this.currentSequenceId) {
      this.removeSequence(this.currentSequenceId);
    }
  }

  public play(): void {
    this.start();
  }

  public start(): void {
    if (this._state === 'playing') return;

    if (this._state === 'paused') {
      // Resume from paused position
      const pauseDuration = this.context.currentTime - this.pausedTime;
      this.startTime += pauseDuration;
    } else {
      // Start fresh
      this.startTime = this.context.currentTime;
      this._currentBeat = 0;
      this._currentBar = 0;
      this._currentPatternIndex = 0;
      this.lastScheduledBeat = -1;
      this.scheduledNotes.length = 0;

      // Handle count-in
      if (this._countInBars > 0) {
        this._countingIn = true;
        this.startTime += this.barsToSeconds(this._countInBars);
      }
    }

    this._state = 'playing';
    this.startScheduler();

    this.emit({
      type: 'sequencerStarted',
      timestamp: this.context.currentTime,
    });
  }

  public stop(): void {
    if (this._state === 'stopped') return;

    this._state = 'stopped';
    this.stopScheduler();
    this._currentBeat = 0;
    this._currentBar = 0;
    this._currentPatternIndex = 0;
    this.lastScheduledBeat = -1;
    this.scheduledNotes.length = 0;
    this._countingIn = false;

    this.emit({
      type: 'sequencerStopped',
      timestamp: this.context.currentTime,
    });
  }

  public pause(): void {
    if (this._state !== 'playing') return;

    this._state = 'paused';
    this.pausedTime = this.context.currentTime;
    this.stopScheduler();

    this.emit({
      type: 'sequencerPaused',
      timestamp: this.context.currentTime,
    });
  }

  public get state(): SequencerState {
    return this._state;
  }

  public getState(): ISequencerState {
    return {
      isPlaying: this._state === 'playing',
      isPaused: this._state === 'paused',
      currentBeat: this._currentBeat,
      currentBar: this._currentBar,
      bpm: this._bpm,
      looping: this._loopMode !== 'none',
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
    };
  }

  public get isPlaying(): boolean {
    return this._state === 'playing';
  }

  public dispose(): void {
    this.stop();
    this.sequences.clear();
    this.patterns.clear();
    this.tracks.clear();
    this.eventListeners.clear();
    this.triggerCallbacks.clear();
  }

  // ==========================================================================
  // Transport Properties
  // ==========================================================================

  public get bpm(): number {
    return this._bpm;
  }

  public set bpm(value: number) {
    if (value > 0 && value <= 999) {
      this._bpm = value;

      this.emit({
        type: 'bpmChanged',
        timestamp: this.context.currentTime,
        data: { bpm: value },
      });
    }
  }

  public get swing(): number {
    return this._swing;
  }

  public set swing(value: number) {
    this._swing = Math.max(0, Math.min(1, value));
  }

  public get currentBeat(): number {
    return this._currentBeat;
  }

  public get currentBar(): number {
    return this._currentBar;
  }

  public get currentPatternIndex(): number {
    return this._currentPatternIndex;
  }

  public setBPM(bpm: number): void {
    this.bpm = bpm;
  }

  public getBPM(): number {
    return this.bpm;
  }

  public get loopMode(): LoopMode {
    return this._loopMode;
  }

  public set loopMode(value: LoopMode) {
    this._loopMode = value;
  }

  public setLoop(enabled: boolean, startBeat?: number, endBeat?: number): void {
    this._loopMode = enabled ? 'sequence' : 'none';
    if (startBeat !== undefined && endBeat !== undefined) {
      this.setLoopRange(startBeat, endBeat);
    }
  }

  public get metronomeEnabled(): boolean {
    return this._metronomeEnabled;
  }

  public set metronomeEnabled(value: boolean) {
    this._metronomeEnabled = value;
  }

  public get countInBars(): number {
    return this._countInBars;
  }

  public set countInBars(value: number) {
    this._countInBars = Math.max(0, Math.floor(value));
  }

  public get isCountingIn(): boolean {
    return this._countingIn;
  }

  // ==========================================================================
  // Transport Controls
  // ==========================================================================

  public setLoopRange(start: number, end: number): void {
    if (start >= 0 && end > start) {
      this._loopStart = start;
      this._loopEnd = end;
    }
  }

  public getLoopRange(): { start: number; end: number } {
    return {
      start: this._loopStart,
      end: this._loopEnd,
    };
  }

  public seek(beat: number, bar?: number): void {
    if (beat < 0) return;

    const wasPlaying = this._state === 'playing';
    if (wasPlaying) {
      this.pause();
    }

    this._currentBeat = beat;
    if (bar !== undefined) {
      this._currentBar = bar;
    }

    // Recalculate start time based on new position
    const elapsedBeats = this._currentBar * this.getBeatsPerBar() + this._currentBeat;
    this.startTime = this.context.currentTime - this.beatsToSeconds(elapsedBeats);
    this.lastScheduledBeat = Math.floor(this._currentBeat) - 1;
    this.scheduledNotes.length = 0;

    if (wasPlaying) {
      this._state = 'stopped'; // Allow start() to work
      this.start();
    }

    this.emit({
      type: 'sequencerSeeked',
      timestamp: this.context.currentTime,
      data: { beat: this._currentBeat, bar: this._currentBar },
    });
  }

  public getPlaybackPosition(): { beat: number; bar: number; pattern: number } {
    return {
      beat: this._currentBeat,
      bar: this._currentBar,
      pattern: this._currentPatternIndex,
    };
  }

  // ==========================================================================
  // Sequence Management
  // ==========================================================================

  public createSequence(config: ISequence): string {
    if (this.sequences.has(config.id)) {
      throw new Error(`Sequence with id '${config.id}' already exists`);
    }

    this.sequences.set(config.id, { ...config });
    return config.id;
  }

  public getSequence(id: string): ISequence | undefined {
    const seq = this.sequences.get(id);
    return seq ? { ...seq } : undefined;
  }

  public updateSequence(id: string, updates: Partial<ISequence>): void {
    const seq = this.sequences.get(id);
    if (seq) {
      Object.assign(seq, updates);
    }
  }

  public removeSequence(id: string): boolean {
    if (this.currentSequenceId === id) {
      this.stop();
      this.currentSequenceId = null;
    }
    return this.sequences.delete(id);
  }

  public loadSequence(id: string): boolean {
    if (!this.sequences.has(id)) return false;

    const wasPlaying = this._state === 'playing';
    this.stop();
    this.currentSequenceId = id;

    if (wasPlaying) {
      this.start();
    }

    return true;
  }

  public getCurrentSequence(): ISequence | undefined {
    return this.currentSequenceId ? this.getSequence(this.currentSequenceId) : undefined;
  }

  // ==========================================================================
  // Pattern Management
  // ==========================================================================

  public createPattern(config: IPattern): string {
    if (this.patterns.has(config.id)) {
      throw new Error(`Pattern with id '${config.id}' already exists`);
    }

    this.patterns.set(config.id, { ...config, notes: [...config.notes] });
    return config.id;
  }

  public addPattern(pattern: IPattern): void {
    this.createPattern(pattern);
  }

  public getPattern(id: string): IPattern | undefined {
    const pattern = this.patterns.get(id);
    if (!pattern) return undefined;
    return { ...pattern, notes: [...pattern.notes] };
  }

  public updatePattern(id: string, updates: Partial<IPattern>): void {
    const pattern = this.patterns.get(id);
    if (pattern) {
      if (updates.notes) {
        pattern.notes = [...updates.notes];
      }
      if (updates.name) pattern.name = updates.name;
      if (updates.bars !== undefined) pattern.bars = updates.bars;
      if (updates.beatsPerBar !== undefined) pattern.beatsPerBar = updates.beatsPerBar;
      if (updates.subdivision !== undefined) pattern.subdivision = updates.subdivision;
    }
  }

  public removePattern(id: string): boolean {
    return this.patterns.delete(id);
  }

  public addNoteToPattern(patternId: string, note: INote): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.notes.push({ ...note });
    }
  }

  public removeNoteFromPattern(patternId: string, noteIndex: number): void {
    const pattern = this.patterns.get(patternId);
    if (pattern && noteIndex >= 0 && noteIndex < pattern.notes.length) {
      pattern.notes.splice(noteIndex, 1);
    }
  }

  public scheduleNote(trackId: string, note: INote): void {
    const track = this.tracks.get(trackId);
    const patternRef = track?.patterns[0];
    if (!patternRef) return;

    const pattern = this.patterns.get(patternRef.patternId);
    if (!pattern) return;

    pattern.notes.push({ ...note });
  }

  public quantize(beat: number, grid: number): number {
    if (grid <= 0) return beat;
    return Math.round(beat / grid) * grid;
  }

  public quantizePattern(patternId: string, subdivision: number): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern || subdivision <= 0) return;

    const step = 1 / subdivision;
    for (const note of pattern.notes) {
      const start = note.start ?? note.startBeat ?? 0;
      note.start = Math.round(start / step) * step;
      note.startBeat = note.start;
      if (note.duration !== undefined) {
        note.duration = Math.max(step, Math.round(note.duration / step) * step);
      }
    }
  }

  // ==========================================================================
  // Track Management
  // ==========================================================================

  public createTrack(config: ITrack): string {
    if (this.tracks.has(config.id)) {
      throw new Error(`Track with id '${config.id}' already exists`);
    }

    this.tracks.set(config.id, {
      ...config,
      patterns: [...config.patterns],
      effects: config.effects ? [...config.effects] : [],
    });

    return config.id;
  }

  public getTrack(id: string): ITrack | undefined {
    const track = this.tracks.get(id);
    if (!track) return undefined;
    return {
      ...track,
      patterns: [...track.patterns],
      effects: track.effects ? [...track.effects] : [],
    };
  }

  public updateTrack(id: string, updates: Partial<ITrack>): void {
    const track = this.tracks.get(id);
    if (track) {
      if (updates.patterns) track.patterns = [...updates.patterns];
      if (updates.effects) track.effects = [...updates.effects];
      if (updates.name !== undefined) track.name = updates.name;
      if (updates.volume !== undefined) track.volume = updates.volume;
      if (updates.pan !== undefined) track.pan = updates.pan;
      if (updates.muted !== undefined) track.muted = updates.muted;
      if (updates.solo !== undefined) track.solo = updates.solo;
      if (updates.outputSource !== undefined) track.outputSource = updates.outputSource;
    }
  }

  public removeTrack(id: string): boolean {
    return this.tracks.delete(id);
  }

  public setTrackVolume(trackId: string, volume: number): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.volume = volume;
    }
  }

  public setTrackMuted(trackId: string, muted: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.muted = muted;
    }
  }

  public setTrackSolo(trackId: string, solo: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.solo = solo;
    }
  }

  // ==========================================================================
  // Note Triggers
  // ==========================================================================

  public onNoteTrigger(trackId: string, callback: (note: INote, time: number) => void): void {
    let callbacks = this.triggerCallbacks.get(trackId);
    if (!callbacks) {
      callbacks = new Set();
      this.triggerCallbacks.set(trackId, callbacks);
    }
    callbacks.add(callback);
  }

  public offNoteTrigger(trackId: string, callback: (note: INote, time: number) => void): void {
    const callbacks = this.triggerCallbacks.get(trackId);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  public on(event: AudioEventType, callback: AudioEventCallback): void {
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.eventListeners.set(event, listeners);
    }
    listeners.add(callback);
  }

  public off(event: AudioEventType, callback: AudioEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  public beatsToSeconds(beats: number): number {
    return (beats * 60) / this._bpm;
  }

  public secondsToBeats(seconds: number): number {
    return (seconds * this._bpm) / 60;
  }

  public barsToSeconds(bars: number): number {
    return this.beatsToSeconds(bars * this.getBeatsPerBar());
  }

  public secondsToBars(seconds: number): number {
    return this.secondsToBeats(seconds) / this.getBeatsPerBar();
  }

  public getMidiFrequency(midiNote: number): number {
    return midiToFrequency(midiNote);
  }

  public getNoteToMidi(noteName: string): number {
    return noteNameToMidi(noteName);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getBeatsPerBar(): number {
    const currentPattern = this.getCurrentPattern();
    return currentPattern?.beatsPerBar ?? 4;
  }

  private getCurrentPattern(): IPattern | undefined {
    const sequence = this.getCurrentSequence();
    const patternOrder = sequence?.patternOrder ?? sequence?.patterns?.map((p) => p.id) ?? [];
    if (!sequence || patternOrder.length === 0) return undefined;

    const patternId = patternOrder[this._currentPatternIndex];
    return patternId ? this.patterns.get(patternId) : undefined;
  }

  private startScheduler(): void {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      this.schedulerTick();
    }, 25); // 25ms tick rate
  }

  private stopScheduler(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private schedulerTick(): void {
    if (this._state !== 'playing') return;

    const currentTime = this.context.currentTime;
    const elapsedSeconds = currentTime - this.startTime;
    const elapsedBeats = this.secondsToBeats(elapsedSeconds);

    // Update current position
    const beatsPerBar = this.getBeatsPerBar();
    this._currentBeat = elapsedBeats % beatsPerBar;
    this._currentBar = Math.floor(elapsedBeats / beatsPerBar);

    // Update count-in state
    if (this._countingIn && elapsedSeconds >= 0) {
      this._countingIn = false;
    }

    // Emit beat events
    const currentBeatInt = Math.floor(elapsedBeats);
    if (currentBeatInt > this.lastScheduledBeat) {
      for (let beat = this.lastScheduledBeat + 1; beat <= currentBeatInt; beat++) {
        const beatInBar = beat % beatsPerBar;

        this.emit({
          type: 'beat',
          timestamp: this.beatsToSeconds(beat) + this.startTime,
          data: { beat: beatInBar, bar: Math.floor(beat / beatsPerBar) },
        });

        if (beatInBar === 0) {
          this.emit({
            type: 'bar',
            timestamp: this.beatsToSeconds(beat) + this.startTime,
            data: { bar: Math.floor(beat / beatsPerBar) },
          });
        }

        // Play metronome
        if (this._metronomeEnabled) {
          this.playMetronome(beatInBar === 0);
        }
      }
      this.lastScheduledBeat = currentBeatInt;
    }

    // Schedule notes
    this.scheduleNotes(elapsedBeats);

    // Handle looping
    this.handleLooping();

    // Trigger scheduled notes
    this.triggerScheduledNotes(currentTime);
  }

  private scheduleNotes(elapsedBeats: number): void {
    const sequence = this.getCurrentSequence();
    if (!sequence) return;

    const scheduleAheadBeats = this.secondsToBeats(this.scheduleAheadTime);
    const lookAheadEnd = elapsedBeats + scheduleAheadBeats;

    // Get current pattern
    const pattern = this.getCurrentPattern();
    if (!pattern) return;

    // Get tracks for this sequence
    for (const trackEntry of sequence.tracks) {
      const trackId = trackEntry.id;
      const track = this.tracks.get(trackId) ?? trackEntry;
      if (!track || track.muted) continue;

      // Find notes in pattern that fall within schedule window
      const patternBars = pattern.bars ?? 1;
      const patternOffset = this._currentPatternIndex * patternBars * (pattern.beatsPerBar ?? 4);

      for (const note of pattern.notes) {
        const noteStartBeat = patternOffset + (note.start ?? note.startBeat ?? 0);
        const noteEndBeat = noteStartBeat + (note.duration ?? 0.25);

        if (noteStartBeat >= elapsedBeats && noteStartBeat < lookAheadEnd) {
          // Check if already scheduled
          const alreadyScheduled = this.scheduledNotes.some(
            (sn) =>
              sn.track === trackId &&
              Math.abs(sn.startTime - this.beatsToSeconds(noteStartBeat)) < 0.001 &&
              sn.note.pitch === note.pitch
          );

          if (!alreadyScheduled) {
            this.scheduledNotes.push({
              track: trackId,
              note,
              startTime: this.startTime + this.beatsToSeconds(noteStartBeat),
              endTime: this.startTime + this.beatsToSeconds(noteEndBeat),
              triggered: false,
              released: false,
            });
          }
        }
      }
    }
  }

  private triggerScheduledNotes(currentTime: number): void {
    for (const scheduled of this.scheduledNotes) {
      // Trigger note on
      if (!scheduled.triggered && currentTime >= scheduled.startTime) {
        scheduled.triggered = true;

        const callbacks = this.triggerCallbacks.get(scheduled.track);
        if (callbacks) {
          for (const callback of callbacks) {
            try {
              callback(scheduled.note, scheduled.startTime);
            } catch (e) {
              console.error('Error in note trigger callback:', e);
            }
          }
        }

        this.emit({
          type: 'noteTriggered',
          timestamp: scheduled.startTime,
          data: { track: scheduled.track, note: scheduled.note },
        });
      }

      // Trigger note off
      if (!scheduled.released && currentTime >= scheduled.endTime) {
        scheduled.released = true;

        this.emit({
          type: 'noteReleased',
          timestamp: scheduled.endTime,
          data: { track: scheduled.track, note: scheduled.note },
        });
      }
    }

    // Clean up old scheduled notes
    const cutoffTime = currentTime - 1.0;
    for (let i = this.scheduledNotes.length - 1; i >= 0; i--) {
      if (this.scheduledNotes[i].released && this.scheduledNotes[i].endTime < cutoffTime) {
        this.scheduledNotes.splice(i, 1);
      }
    }
  }

  private handleLooping(): void {
    const sequence = this.getCurrentSequence();
    if (!sequence) return;

    const pattern = this.getCurrentPattern();
    if (!pattern) return;

    const patternBars = pattern.bars ?? 1;
    const patternLength = patternBars * (pattern.beatsPerBar ?? 4);
    const totalBeats = this._currentBar * this.getBeatsPerBar() + this._currentBeat;
    const patternEnd = (this._currentPatternIndex + 1) * patternLength;

    const patternOrder = sequence.patternOrder ?? sequence.patterns?.map((p) => p.id) ?? [];
    if (totalBeats >= patternEnd) {
      if (this._loopMode === 'pattern') {
        // Loop current pattern
        this.seek(0, this._currentPatternIndex * (pattern.bars ?? 1));
      } else if (this._loopMode === 'sequence') {
        // Move to next pattern or loop
        this._currentPatternIndex++;
        if (this._currentPatternIndex >= patternOrder.length) {
          this._currentPatternIndex = 0;
          this.seek(0, 0);
          this.emit({
            type: 'sequenceLooped',
            timestamp: this.context.currentTime,
          });
        }
      } else if (this._loopMode === 'none') {
        // Move to next pattern or stop
        this._currentPatternIndex++;
        if (this._currentPatternIndex >= patternOrder.length) {
          this.stop();
        }
      }
    }
  }

  private playMetronome(isDownbeat: boolean): void {
    // In real implementation, would play a click sound
    this.emit({
      type: 'metronomeClick',
      timestamp: this.context.currentTime,
      data: { isDownbeat },
    });
  }

  private emit(event: IAudioEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Error in sequencer event callback:', e);
        }
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new sequencer instance
 */
export function createSequencer(context: IAudioContext): ISequencer {
  return new SequencerImpl(context);
}
