/** @geospatial_climate Trait — Microclimate and environmental simulation for urban zones. @trait geospatial_climate */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface GeospatialClimateConfig {
  baseTemperatureC: number;
  albedo: number; // Surface reflectivity 0-1
  vegetationCoverPercent: number;
  windPermeability: number; // 0 (solid block) to 1 (open field)
  waterRetentionRate: number; // How well the area retains/absorbs rain
}

export interface GeospatialClimateState {
  currentTempC: number;
  urbanHeatIslandEffectC: number; // Calculated offset
  airQualityIndex: number;
  floodRiskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

const defaultConfig: GeospatialClimateConfig = {
  baseTemperatureC: 22,
  albedo: 0.2, // asphalt-ish
  vegetationCoverPercent: 10,
  windPermeability: 0.5,
  waterRetentionRate: 0.3
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
      ctx.emit?.('climate:initialized', n.__geospatialClimateState);
    },
    onDetach(n: HSPlusNode, _c: GeospatialClimateConfig, ctx: TraitContext) {
      delete n.__geospatialClimateState;
      ctx.emit?.('climate:removed');
    },
    onUpdate(n: HSPlusNode, _c: GeospatialClimateConfig, _ctx: TraitContext, _deltaTimeMs: number) {
      const s = n.__geospatialClimateState as GeospatialClimateState | undefined;
      if (!s) return;
      
      // Stub for continuous simulation: temp fluctuations, pollution accumulation
      // Not actually mutating per frame here to avoid CPU hit unless weather changes
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
        ctx.emit?.('climate:flood_risk_updated', { level: s.floodRiskLevel });
      }

      if (e.type === 'weather:heatwave') {
        const peakTemp = (e.payload?.peakTemp as number) ?? 35;
        // Concrete jungles heat up much more!
        s.currentTempC = peakTemp + s.urbanHeatIslandEffectC;
        ctx.emit?.('climate:temp_spike', { currentTempC: s.currentTempC });
      }
    },
  };
}
