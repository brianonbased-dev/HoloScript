/**
 * CavemanDriveTrait.ts
 *
 * Sovereign-LLM-driven NPC drive system for the caveman (and derivative) archetype.
 *
 * Part of the GLB → HoloScript $BRIAN Caveman pipeline (research/2026-05-16_glb-character-to-sovereign-caveman-agent.md).
 *
 * Design (from research):
 * - 5 scalar drives [0..1]: hunger, thirst, fatigue, fear, curiosity (social optional in follow-ups)
 * - Pure-math update_drives (no LLM)
 * - should_call_llm gate: one drive ≥ 0.8 OR attention_target changed OR action queue empty
 * - Target: ≥90% ticks with no LLM call (drive math + BT inertia carries the NPC)
 *
 * Composes with existing: AIDriverTrait, BehaviorTreeTrait, NeuralAnimationTrait, HumanoidLoader (GLB ingest).
 */

import type { Trait } from './Trait';
import { AIDriverTrait } from './AIDriverTrait';
import {
  dispatchCavemanAction,
  mapVerbToClip,
  type CavemanVerb,
} from './CavemanActionAnimationBridge';

/**
 * AI-LOD tier for this NPC. Controls whether LLM calls are allowed at all.
 *
 * - 'near' (default) — full LLM reasoning; ticks contribute to safety-valve budget.
 * - 'mid'            — same as 'near' for now; reserved for future reduced-frequency logic.
 * - 'far'            — LLM is disabled unconditionally. shouldCallLLM() always returns false.
 *                      Use for NPCs beyond the player's attention radius to stay within
 *                      the Jetson-scale ~1 call/sec budget across a 50-NPC fleet.
 *
 * Set via `setAiLod()` or pass `aiLod` in the constructor config. Default: 'near'.
 */
export type AiLodTier = 'near' | 'mid' | 'far';

export interface CavemanDriveState {
  hunger: number; // 0..1 — rises on time, falls on eat
  thirst: number; // 0..1 — rises on time, falls on drink
  fatigue: number; // 0..1 — rises with action cost, falls on rest
  fear: number; // 0..1 — rises on threat, decays with time / safety
  curiosity: number; // 0..1 — rises with novelty, falls on inspect
  attentionTarget: string | null;
  lastLLMCallTick: number;
  /** AI-LOD tier: 'far' disables LLM calls entirely (see AiLodTier). Default: 'near'. */
  aiLod: AiLodTier;
}

export class CavemanDriveTrait implements Trait {
  static readonly id = 'caveman_drive';
  static readonly version = '0.1.0';

  // Implements Trait.name
  readonly name = CavemanDriveTrait.id;

  private state: CavemanDriveState = {
    hunger: 0.5,
    thirst: 0.5,
    fatigue: 0.3,
    fear: 0.2,
    curiosity: 0.4,
    attentionTarget: null,
    lastLLMCallTick: 0,
    aiLod: 'near',
  };

  private tickCount = 0;

  onAttach(entity: any) {
    // Compose with existing driver + BT if present
    // AIDriverTrait.id not exposed as static — use the canonical string ID
    const aiDriver = entity.getTrait('ai_driver') as AIDriverTrait;
    // BehaviorTreeTrait is a handler not a class — use string ID
    void entity.getTrait('behavior_tree'); // kept for future composition

    if (aiDriver) {
      // setPerceptionCallback is not yet in AIDriverTrait public API — cast to any
      (aiDriver as any).setPerceptionCallback?.((nearby: any[]) => this.perceive(nearby));
    }
  }

  /** Pure math update — called every tick (~250ms) */
  updateDrives(deltaTime: number, context: any = {}) {
    const s = this.state;

    // Simple linear models (tunable; research §Detailed Insight)
    s.hunger = Math.min(1, s.hunger + 0.01 * deltaTime);
    s.thirst = Math.min(1, s.thirst + 0.012 * deltaTime);
    s.fatigue = Math.min(1, s.fatigue + 0.008 * deltaTime);

    if (context.ate) s.hunger = Math.max(0, s.hunger - 0.6);
    if (context.drank) s.thirst = Math.max(0, s.thirst - 0.65);
    if (context.rested) s.fatigue = Math.max(0, s.fatigue - 0.5);

    if (context.threat) s.fear = Math.min(1, s.fear + 0.4);
    else s.fear = Math.max(0, s.fear - 0.05 * deltaTime);

    if (context.novelty) s.curiosity = Math.min(1, s.curiosity + 0.3);
    else s.curiosity = Math.max(0, s.curiosity - 0.02 * deltaTime);

    this.tickCount++;
  }

  /** The critical gate — 90%+ of ticks should return false */
  shouldCallLLM(): boolean {
    const s = this.state;

    // LOD gate: far-tier NPCs never call the LLM. This is the primary MMO-scale
    // budget lever — a future LOD system sets 'far' on NPCs outside the player's
    // attention radius so only near/mid NPCs consume Jetson inference capacity.
    if (s.aiLod === 'far') return false;

    if (s.hunger >= 0.8 || s.thirst >= 0.8 || s.fear >= 0.8 || s.fatigue >= 0.9) return true;
    if (s.attentionTarget && s.attentionTarget !== this.state.attentionTarget) return true;

    // Safety valve: force an LLM call after 200 ticks of silence (~50s at ~250ms/tick).
    // Budget math: 200 ticks × 250ms = 50s between forced calls per NPC.
    // At 50 near-tier NPCs, worst-case forced rate = 50 / 50s = 1 call/sec —
    // within the Jetson Orin qwen3:4b throughput (~0.5–1 call/sec).
    // The OLD valve was 20 ticks (~5s/NPC → ~10 calls/sec for 50 NPCs = 10–20× over budget).
    if (this.tickCount - s.lastLLMCallTick > 200) return true;

    return false;
  }

  /**
   * Set the AI-LOD tier for this NPC.
   *
   * Call this from a spatial LOD / streaming system when the NPC moves in or out
   * of the player's attention radius:
   *
   *   npc.getTrait('caveman_drive')?.setAiLod('far');   // outside radius → no LLM
   *   npc.getTrait('caveman_drive')?.setAiLod('near');  // inside radius  → full LLM
   *
   * 'far' takes effect immediately on the next shouldCallLLM() check.
   */
  setAiLod(tier: AiLodTier): void {
    this.state.aiLod = tier;
  }

  perceive(nearbyEntities: any[]) {
    // Simple attention heuristic (research §4)
    const threat = nearbyEntities.find((e) => e.type === 'predator' || e.threatLevel > 0.6);
    if (threat) {
      this.state.attentionTarget = threat.id;
      this.state.fear = Math.min(1, this.state.fear + 0.3);
    } else {
      const interesting = nearbyEntities.find((e) => e.type === 'food' || e.type === 'shiny');
      if (interesting) this.state.attentionTarget = interesting.id;
    }
  }

  /** Called after a successful LLM think */
  recordLLMCall() {
    this.state.lastLLMCallTick = this.tickCount;
  }

  getState(): CavemanDriveState {
    return { ...this.state };
  }

  // For the scaffolder / brain template
  getActionVerbBias(): Record<string, number> {
    const s = this.state;
    return {
      eat: s.hunger,
      drink: s.thirst,
      rest: s.fatigue,
      flee: s.fear,
      inspect: s.curiosity,
    };
  }

  /**
   * Called by the brain / AIDriver when the LLM returns one of the 9 allowed verbs.
   * This is the LLM → animation bridge entry point (BUILD item 6).
   */
  onLLMAction(verb: string, target?: string, availableClips?: string[]) {
    const result = dispatchCavemanAction(
      /* entity/context */ this as any,
      verb,
      target,
      { fear: this.state.fear },
      availableClips
    );

    // Record that we acted (helps the drive gate)
    this.recordLLMCall();

    return result;
  }

  /** Pure mapper exposed for tests / scaffolder */
  static mapVerbToClip = mapVerbToClip;
}
