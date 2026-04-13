/**
 * CinematicDirector.ts
 *
 * Scene orchestration: actor positioning, cue system,
 * camera cuts, and sequence execution.
 *
 * @module cinematic
 */

import { SequenceTrack } from './SequenceTrack';
import { CameraRig } from './CameraRig';

// =============================================================================
// TYPES
// =============================================================================

export interface ActorMark {
  actorId: string;
  position: [number, number, number];
  rotation: { x: number; y: number; z: number };
  animation?: string;
}

export interface CuePoint {
  id: string;
  time: number;
  type: 'camera_cut' | 'actor_move' | 'dialogue' | 'sound' | 'effect' | 'custom';
  data: Record<string, unknown>;
  fired: boolean;
}

export interface CinematicScene {
  id: string;
  name: string;
  duration: number;
  actors: ActorMark[];
  cues: CuePoint[];
  cameraRigId?: string;
}

// =============================================================================
// CINEMATIC DIRECTOR
// =============================================================================

export class CinematicDirector {
  private scenes: Map<string, CinematicScene> = new Map();
  private activeScene: CinematicScene | null = null;
  private sequencer: SequenceTrack;
  private rigs: Map<string, CameraRig> = new Map();
  private activeRig: CameraRig | null = null;
  private playing = false;
  private elapsed = 0;
  private callbacks: Map<string, Array<(cue: CuePoint) => void>> = new Map();
  private firedCues: CuePoint[] = [];

  constructor() {
    this.sequencer = new SequenceTrack();
  }

  // ---------------------------------------------------------------------------
  // Scene Management
  // ---------------------------------------------------------------------------

  createScene(id: string, name: string, duration: number): CinematicScene {
    const scene: CinematicScene = { id, name, duration, actors: [], cues: [] };
    this.scenes.set(id, scene);
    return scene;
  }

  getScene(id: string): CinematicScene | undefined {
    return this.scenes.get(id);
  }

  addActorMark(sceneId: string, mark: ActorMark): void {
    const scene = this.scenes.get(sceneId);
    if (scene) scene.actors.push(mark);
  }

  addCue(sceneId: string, cue: Omit<CuePoint, 'fired'>): void {
    const scene = this.scenes.get(sceneId);
    if (scene) {
      scene.cues.push({ ...cue, fired: false });
      scene.cues.sort((a, b) => a.time - b.time);
    }
  }

  // ---------------------------------------------------------------------------
  // Camera Rigs
  // ---------------------------------------------------------------------------

  addRig(id: string, rig: CameraRig): void {
    this.rigs.set(id, rig);
  }

  setActiveRig(rigId: string): void {
    const rig = this.rigs.get(rigId);
    if (rig) this.activeRig = rig;
  }

  getActiveRig(): CameraRig | null {
    return this.activeRig;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  playScene(sceneId: string): boolean {
    const scene = this.scenes.get(sceneId);
    if (!scene) return false;

    this.activeScene = scene;
    this.playing = true;
    this.elapsed = 0;
    this.firedCues = [];

    // Reset all cues
    for (const cue of scene.cues) cue.fired = false;

    // Set rig
    if (scene.cameraRigId) this.setActiveRig(scene.cameraRigId);

    return true;
  }

  stop(): void {
    this.playing = false;
    this.activeScene = null;
    this.elapsed = 0;
  }

  pause(): void {
    this.playing = false;
  }
  resume(): void {
    if (this.activeScene) this.playing = true;
  }

  update(dt: number): void {
    if (!this.playing || !this.activeScene) return;

    this.elapsed += dt;

    // Fire cues
    for (const cue of this.activeScene.cues) {
      if (!cue.fired && this.elapsed >= cue.time) {
        cue.fired = true;
        this.firedCues.push(cue);
        this.fireCueCallbacks(cue);
      }
    }

    // Update rig
    if (this.activeRig) this.activeRig.update(dt);

    // Update sequencer
    this.sequencer.update(dt);

    // End check
    if (this.elapsed >= this.activeScene.duration) {
      this.playing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Cue Callbacks
  // ---------------------------------------------------------------------------

  onCue(type: CuePoint['type'], callback: (cue: CuePoint) => void): void {
    let cbs = this.callbacks.get(type);
    if (!cbs) {
      cbs = [];
      this.callbacks.set(type, cbs);
    }
    cbs.push(callback);
  }

  private fireCueCallbacks(cue: CuePoint): void {
    const cbs = this.callbacks.get(cue.type);
    if (cbs) cbs.forEach((cb) => cb(cue));
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  isPlaying(): boolean {
    return this.playing;
  }
  getElapsed(): number {
    return this.elapsed;
  }
  getActiveScene(): CinematicScene | null {
    return this.activeScene;
  }
  getFiredCues(): CuePoint[] {
    return [...this.firedCues];
  }
  getSequencer(): SequenceTrack {
    return this.sequencer;
  }
}
