/**
 * @fileoverview Affective Memory module for HoloLand VR Platform.
 * Prioritizes scene loading and content surface caching based on emotional 
 * valence/arousal feedback metrics.
 */

import type { VRRRuntime } from '@holoscript/runtime';

export interface AffectScore {
  valence: number;  // -1 (negative) to 1 (positive)
  arousal: number;  // 0 (calm) to 1 (excited)
  timestamp: number;
}

export interface AffectiveSceneContext {
  sceneId: string;
  accumulatedAffect: AffectScore[];
  averageValence: number;
  priorityWeight: number; // calculated from valence and arousal
}

export class AffectiveMemory {
  private runtime: VRRRuntime;
  private sceneMemory: Map<string, AffectiveSceneContext> = new Map();
  
  constructor(runtime: VRRRuntime) {
    this.runtime = runtime;
  }

  /**
   * Tracks emotional affect data for a specific scene or VR event.
   */
  public trackAffect(sceneId: string, valence: number, arousal: number): void {
    const score: AffectScore = { valence, arousal, timestamp: Date.now() };
    
    if (!this.sceneMemory.has(sceneId)) {
      this.sceneMemory.set(sceneId, {
        sceneId,
        accumulatedAffect: [],
        averageValence: 0,
        priorityWeight: 0
      });
    }

    const context = this.sceneMemory.get(sceneId)!;
    context.accumulatedAffect.push(score);

    // Keep the last 100 affect events for the sliding window
    if (context.accumulatedAffect.length > 100) {
      context.accumulatedAffect.shift();
    }

    this.recalculatePriority(context);
    
    // Save to runtime persistence
    this.runtime.persistState(`affective_memory_${sceneId}`, context);
  }

  /**
   * Evaluates priority weight for VR cache loading based on high-valence scores
   */
  private recalculatePriority(context: AffectiveSceneContext): void {
    if (context.accumulatedAffect.length === 0) return;
    
    let sumValence = 0;
    let sumArousal = 0;
    for (const score of context.accumulatedAffect) {
      sumValence += score.valence;
      sumArousal += score.arousal;
    }
    
    context.averageValence = sumValence / context.accumulatedAffect.length;
    const avgArousal = sumArousal / context.accumulatedAffect.length;
    
    // Weight logic: Scenes with both high positivity (valence) and engagement (arousal) get top priority
    context.priorityWeight = (context.averageValence * 0.7) + (avgArousal * 0.3);
  }

  /**
   * Returns sorted list of scenes prioritized by high affective valence and arousal.
   * VR layer uses this to preemptively load high-affect scenes into the cache.
   */
  public getPrioritizedScenes(): string[] {
    const scenes = Array.from(this.sceneMemory.values());
    scenes.sort((a, b) => b.priorityWeight - a.priorityWeight);
    return scenes.map(s => s.sceneId);
  }

  /**
   * Inject affect-scoring hooks natively into the supplied VR runtime player actions.
   */
  public bindToRuntimeEvents(): void {
    const opts = this.runtime.options as any;
    if (!opts.hooks) {
      opts.hooks = {};
    }

    const previousHook = opts.hooks.onAffectEvent;
    opts.hooks.onAffectEvent = (args: any) => {
      this.trackAffect(args.sceneId, args.valence, args.arousal);
      if (previousHook) previousHook(args);
    };

    console.log('[VRR-Affective] Affective Memory hooks successfully bound to VR runtime.');
  }
}
