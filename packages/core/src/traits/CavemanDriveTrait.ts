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

import { Trait } from '../trait-system';
import { AIDriverTrait } from './AIDriverTrait';
import { BehaviorTreeTrait } from './BehaviorTreeTrait';

export interface CavemanDriveState {
  hunger: number;     // 0..1 — rises on time, falls on eat
  thirst: number;     // 0..1 — rises on time, falls on drink
  fatigue: number;    // 0..1 — rises with action cost, falls on rest
  fear: number;       // 0..1 — rises on threat, decays with time / safety
  curiosity: number;  // 0..1 — rises with novelty, falls on inspect
  attentionTarget: string | null;
  lastLLMCallTick: number;
}

export class CavemanDriveTrait extends Trait {
  static readonly id = 'caveman_drive';
  static readonly version = '0.1.0';

  private state: CavemanDriveState = {
    hunger: 0.5,
    thirst: 0.5,
    fatigue: 0.3,
    fear: 0.2,
    curiosity: 0.4,
    attentionTarget: null,
    lastLLMCallTick: 0,
  };

  private tickCount = 0;

  constructor() {
    super(CavemanDriveTrait.id, CavemanDriveTrait.version);
  }

  onAttach(entity: any) {
    // Compose with existing driver + BT if present
    const aiDriver = entity.getTrait(AIDriverTrait.id) as AIDriverTrait;
    const bt = entity.getTrait(BehaviorTreeTrait.id) as BehaviorTreeTrait;

    if (aiDriver) {
      aiDriver.setPerceptionCallback((nearby: any[]) => this.perceive(nearby));
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

    if (s.hunger >= 0.8 || s.thirst >= 0.8 || s.fear >= 0.8 || s.fatigue >= 0.9) return true;
    if (s.attentionTarget && s.attentionTarget !== this.state.attentionTarget) return true;
    if (this.tickCount - s.lastLLMCallTick > 20) return true; // safety valve

    return false;
  }

  perceive(nearbyEntities: any[]) {
    // Simple attention heuristic (research §4)
    const threat = nearbyEntities.find(e => e.type === 'predator' || e.threatLevel > 0.6);
    if (threat) {
      this.state.attentionTarget = threat.id;
      this.state.fear = Math.min(1, this.state.fear + 0.3);
    } else {
      const interesting = nearbyEntities.find(e => e.type === 'food' || e.type === 'shiny');
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
}
