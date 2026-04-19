/** @geospatial_climate Trait — Microclimate and environmental simulation for urban zones. @trait geospatial_climate */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface GeospatialClimateConfig {
  baseTemperatureC: number;
  albedo: number; // Surface reflectivity 0-1
  vegetationCoverPercent: number;
  windPermeability: number; // 0 (solid block) to 1 (open field)
  waterRetentionRate: number; // How well the area retains/absorbs rain
  /** Emit simulation events (`climate:sim_tick`, etc.). Default true. */
  emitEvents?: boolean;
  /** Minimum simulation emit cadence in ms. Default 2000. */
  emitIntervalMs?: number;
}

export interface GeospatialClimateState {
  currentTempC: number;
  urbanHeatIslandEffectC: number; // Calculated offset
  airQualityIndex: number;
  floodRiskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Accumulated ms for throttled continuous simulation (internal). */
  _simMs?: number;
}

const defaultConfig: GeospatialClimateConfig = {
  baseTemperatureC: 22,
  albedo: 0.2, // asphalt-ish
  vegetationCoverPercent: 10,
  windPermeability: 0.5,
  waterRetentionRate: 0.3,
  emitEvents: true,
  emitIntervalMs: 2000,
};

export function createGeospatialClimateHandler(): TraitHandler<GeospatialClimateConfig> {
  return {
    name: 'geospatial_climate',
    defaultConfig,
    onAttach(n: HSPlusNode, c: GeospatialClimateConfig, ctx: TraitContext) {
      // Calculate initial Urban Heat Island effect based on albedo and vegetation
      const heatOffset = (0.8 - c.albedo) * 3 + (100 - c.vegetationCoverPercent) * 0.05;
      
      n.__geospatialClimateState = {
        currentTempC: c.baseTemperatureC + heatOffset,
        urbanHeatIslandEffectC: heatOffset,
        airQualityIndex: 50, // baseline good
        floodRiskLevel: 'low'
      };
      if (c.emitEvents !== false) {
        ctx.emit?.('climate:initialized', n.__geospatialClimateState);
      }
    },
    onDetach(n: HSPlusNode, _c: GeospatialClimateConfig, ctx: TraitContext) {
      delete n.__geospatialClimateState;
      if (_c.emitEvents !== false) {
        ctx.emit?.('climate:removed');
      }
    },
    onUpdate(n: HSPlusNode, c: GeospatialClimateConfig, ctx: TraitContext, deltaTimeMs: number) {
      const s = n.__geospatialClimateState as GeospatialClimateState | undefined;
      if (!s) return;

      // Throttled continuous simulation (~2s) — light sinusoidal drift + slow AQI drift
      const intervalMs = Math.max(250, Number(c.emitIntervalMs ?? 2000));
      const acc = (s._simMs ?? 0) + Math.max(0, deltaTimeMs);
      if (acc < intervalMs) {
        s._simMs = acc;
        return;
      }
      s._simMs = 0;

      const seed =
        (typeof n.id === 'string' ? n.id.length : 0) * 997 +
        Math.floor(s.currentTempC * 100) +
        (c.vegetationCoverPercent | 0);
      const t = seed * 0.017;
      const tempWobble = Math.sin(t) * 0.12 * (1.1 - c.windPermeability);
      const nextTemp = s.currentTempC + tempWobble;
      s.currentTempC = Math.max(-25, Math.min(58, nextTemp));

      const aqDrift = (Math.cos(t * 1.3) + 1) * 0.35 - 0.2;
      const vegBonus = (c.vegetationCoverPercent / 100) * 0.15;
      s.airQualityIndex = Math.max(
        0,
        Math.min(500, s.airQualityIndex + aqDrift - vegBonus)
      );

      if (c.emitEvents !== false) {
        ctx.emit?.('climate:sim_tick', {
          currentTempC: s.currentTempC,
          airQualityIndex: s.airQualityIndex,
        });
      }
    },
    onEvent(n: HSPlusNode, c: GeospatialClimateConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__geospatialClimateState as GeospatialClimateState | undefined;
      if (!s) return;
      
      if (e.type === 'weather:storm') {
        const rainfallMm = (e.payload?.rainfallMm as number) ?? 50;
        // Calculate flood risk based on retention
        if (rainfallMm > 20 && c.waterRetentionRate < 0.2) {
            s.floodRiskLevel = 'critical';
        } else if (rainfallMm > 50 && c.waterRetentionRate < 0.5) {
            s.floodRiskLevel = 'high';
        } else if (rainfallMm > 100) {
            s.floodRiskLevel = 'medium';
        }
        if (c.emitEvents !== false) {
          ctx.emit?.('climate:flood_risk_updated', { level: s.floodRiskLevel });
        }
      }

      if (e.type === 'weather:heatwave') {
        const peakTemp = (e.payload?.peakTemp as number) ?? 35;
        // Concrete jungles heat up much more!
        s.currentTempC = peakTemp + s.urbanHeatIslandEffectC;
        if (c.emitEvents !== false) {
          ctx.emit?.('climate:temp_spike', { currentTempC: s.currentTempC });
        }
      }
    },
  };
}
