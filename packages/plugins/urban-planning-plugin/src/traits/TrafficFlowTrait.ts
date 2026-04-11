/** @traffic_flow Trait — Traffic simulation and analysis. @trait traffic_flow */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type RoadType = 'highway' | 'arterial' | 'collector' | 'local' | 'pedestrian' | 'bike_lane';
export interface TrafficFlowConfig { roadType: RoadType; lanesPerDirection: number; speedLimitKmh: number; capacityVehiclesPerHour: number; intersectionType: 'signalized' | 'roundabout' | 'stop_sign' | 'none'; }
export interface TrafficFlowState { currentVolume: number; levelOfService: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; avgSpeedKmh: number; congestionIndex: number; }

const defaultConfig: TrafficFlowConfig = { roadType: 'local', lanesPerDirection: 1, speedLimitKmh: 50, capacityVehiclesPerHour: 800, intersectionType: 'stop_sign' };

export function createTrafficFlowHandler(): TraitHandler<TrafficFlowConfig> {
  return { name: 'traffic_flow', defaultConfig,
    onAttach(n: HSPlusNode, c: TrafficFlowConfig, ctx: TraitContext) { n.__trafficState = { currentVolume: 0, levelOfService: 'A' as const, avgSpeedKmh: c.speedLimitKmh, congestionIndex: 0 }; ctx.emit?.('traffic:initialized', { roadType: c.roadType }); },
    onDetach(n: HSPlusNode, _c: TrafficFlowConfig, ctx: TraitContext) { delete n.__trafficState; ctx.emit?.('traffic:removed'); },
    onUpdate(n: HSPlusNode, c: TrafficFlowConfig, ctx: TraitContext, _d: number) {
      const s = n.__trafficState as TrafficFlowState | undefined; if (!s) return;
      const ratio = s.currentVolume / c.capacityVehiclesPerHour;
      s.congestionIndex = Math.min(1, ratio);
      s.avgSpeedKmh = c.speedLimitKmh * (1 - s.congestionIndex * 0.7);
      const los: Array<'A'|'B'|'C'|'D'|'E'|'F'> = ['A','B','C','D','E','F'];
      s.levelOfService = los[Math.min(5, Math.floor(ratio * 6))];
      if (s.levelOfService === 'F') ctx.emit?.('traffic:gridlock', { volume: s.currentVolume });
    },
    onEvent(n: HSPlusNode, _c: TrafficFlowConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__trafficState as TrafficFlowState | undefined; if (!s) return;
      if (e.type === 'traffic:add_volume') { s.currentVolume += (e.payload?.vehicles as number) ?? 0; ctx.emit?.('traffic:volume_updated', { volume: s.currentVolume, los: s.levelOfService }); }
    },
  };
}
