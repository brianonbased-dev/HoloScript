export { DayNightCycle, type TimeOfDay, type DayNightState } from './DayNightCycle';

export {
  EnvironmentManager,
  PRESET_SUNNY_DAY,
  PRESET_SUNSET,
  PRESET_NIGHT,
  PRESET_OVERCAST,
  PRESET_SCIFI,
  ALL_PRESETS,
  type SkyboxConfig,
  type LightConfig,
  type FogConfig,
  type AtmosphereConfig,
  type EnvironmentConfig,
  type TimeOfDayConfig,
  type WeatherState as PresetWeatherState,
} from './EnvironmentPresets';

export {
  FoliageSystem,
  type FoliageType,
  type FoliageInstance,
  type FoliagePatch,
} from './FoliageSystem';

export { GrassRenderer, type GrassBlade, type GrassConfig } from './GrassRenderer';

export {
  SkyRenderer,
  type SkyGradient,
  type StarField,
  type CloudLayer,
  type CelestialBody,
} from './SkyRenderer';

export { TerrainBrush, type BrushMode, type BrushConfig, type BrushStroke } from './TerrainBrush';

export {
  TerrainSystem,
  type TerrainConfig,
  type TerrainLayer,
  type TerrainVertex,
  type TerrainChunk,
  type TerrainCollider,
} from './TerrainSystem';

export { TreePlacer, type TreeTemplate, type PlacedTree, type BiomeRule } from './TreePlacer';

export {
  weatherBlackboard,
  updateWeatherBlackboard,
  resetWeatherBlackboard,
  computeSunPosition,
  computeSunIntensity,
  type PrecipitationType,
  type WeatherBlackboardState,
} from './WeatherBlackboard';

export {
  WeatherSystem,
  type WeatherType,
  type WeatherState as SystemWeatherState,
  type WeatherTransition,
} from './WeatherSystem';
