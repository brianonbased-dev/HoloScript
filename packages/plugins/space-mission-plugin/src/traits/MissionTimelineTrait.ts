/**
 * @mission_timeline Trait — Mission phase and milestone tracking
 * @trait mission_timeline
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type MissionPhase = 'pre_launch' | 'launch' | 'ascent' | 'transit' | 'orbit_insertion' | 'operations' | 'deorbit' | 'landing';
export interface Milestone { id: string; name: string; tPlusSeconds: number; phase: MissionPhase; critical: boolean; status: 'pending' | 'go' | 'no_go' | 'complete'; }
export interface MissionTimelineConfig { phases: MissionPhase[]; milestones: Milestone[]; missionDurationS: number; missionName: string; }
export interface MissionTimelineState { currentPhase: MissionPhase; tPlusSeconds: number; completedMilestones: string[]; isActive: boolean; }

const defaultConfig: MissionTimelineConfig = { phases: ['pre_launch', 'launch', 'transit', 'operations'], milestones: [], missionDurationS: 86400, missionName: '' };

export function createMissionTimelineHandler(): TraitHandler<MissionTimelineConfig> {
  return {
    name: 'mission_timeline',
    defaultConfig,
    onAttach(node: HSPlusNode, _c: MissionTimelineConfig, ctx: TraitContext) {
      node.__missionState = { currentPhase: 'pre_launch' as MissionPhase, tPlusSeconds: 0, completedMilestones: [], isActive: false };
      ctx.emit?.('mission:attached');
    },
    onDetach(node: HSPlusNode, _c: MissionTimelineConfig, ctx: TraitContext) { delete node.__missionState; ctx.emit?.('mission:detached'); },
    onUpdate(node: HSPlusNode, config: MissionTimelineConfig, ctx: TraitContext, delta: number) {
      const s = node.__missionState as MissionTimelineState | undefined;
      if (!s?.isActive) return;
      s.tPlusSeconds += delta / 1000;
      for (const m of config.milestones) {
        if (!s.completedMilestones.includes(m.id) && s.tPlusSeconds >= m.tPlusSeconds && m.status === 'go') {
          s.completedMilestones.push(m.id);
          ctx.emit?.('mission:milestone_reached', { milestone: m.name, tPlus: s.tPlusSeconds });
        }
      }
    },
    onEvent(node: HSPlusNode, _c: MissionTimelineConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__missionState as MissionTimelineState | undefined;
      if (!s) return;
      if (event.type === 'mission:start') { s.isActive = true; ctx.emit?.('mission:started'); }
      if (event.type === 'mission:set_phase') { s.currentPhase = event.payload?.phase as MissionPhase; ctx.emit?.('mission:phase_changed', { phase: s.currentPhase }); }
    },
  };
}
