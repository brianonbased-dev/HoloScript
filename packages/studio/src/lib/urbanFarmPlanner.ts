/**
 * urbanFarmPlanner.ts — Urban Farm Planning Engine
 *
 * Sunlight simulation, crop rotation scheduling, irrigation layout,
 * vertical farming structures, soil analysis, and yield estimation.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type Vec2 = [number, number];

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type SoilType = 'clay' | 'sandy' | 'loam' | 'silt' | 'peat';
export type CropCategory = 'leafy' | 'root' | 'fruit' | 'legume' | 'herb' | 'grain';

export interface CropProfile {
  id: string;
  name: string;
  category: CropCategory;
  growingSeasons: Season[];
  daysToHarvest: number;
  sunHoursMin: number;
  waterLitersPerDay: number;
  spacingCm: number;
  companionCrops: string[];
  incompatibleCrops: string[];
  yieldKgPerM2: number;
}

export interface PlantingBed {
  id: string;
  position: Vec2;
  widthM: number;
  lengthM: number;
  soilType: SoilType;
  cropId: string | null;
  plantedDate: number | null;
  irrigationType: 'drip' | 'sprinkler' | 'manual' | 'wick';
}

export interface SunlightData {
  hour: number; // 0-23
  altitude: number; // degrees above horizon
  azimuth: number; // degrees from north
  intensity: number; // 0-1 (0 = shadow, 1 = full sun)
}

export interface VerticalLevel {
  level: number;
  heightM: number;
  cropId: string | null;
  lightType: 'natural' | 'led-full' | 'led-red-blue';
  lightHoursPerDay: number;
}

export interface IrrigationZone {
  id: string;
  beds: string[];
  flowRateLPH: number; // liters per hour
  schedule: { startHour: number; durationMin: number }[];
  waterUsageLitersPerDay: number;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const CROP_DATABASE: CropProfile[] = [
  {
    id: 'tomato',
    name: 'Tomato',
    category: 'fruit',
    growingSeasons: ['spring', 'summer'],
    daysToHarvest: 80,
    sunHoursMin: 6,
    waterLitersPerDay: 2,
    spacingCm: 60,
    companionCrops: ['basil', 'carrot'],
    incompatibleCrops: ['fennel'],
    yieldKgPerM2: 8,
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    category: 'leafy',
    growingSeasons: ['spring', 'fall'],
    daysToHarvest: 45,
    sunHoursMin: 4,
    waterLitersPerDay: 1,
    spacingCm: 25,
    companionCrops: ['carrot', 'radish'],
    incompatibleCrops: [],
    yieldKgPerM2: 5,
  },
  {
    id: 'carrot',
    name: 'Carrot',
    category: 'root',
    growingSeasons: ['spring', 'fall'],
    daysToHarvest: 70,
    sunHoursMin: 6,
    waterLitersPerDay: 1.5,
    spacingCm: 8,
    companionCrops: ['tomato', 'lettuce'],
    incompatibleCrops: ['dill'],
    yieldKgPerM2: 4,
  },
  {
    id: 'basil',
    name: 'Basil',
    category: 'herb',
    growingSeasons: ['spring', 'summer'],
    daysToHarvest: 30,
    sunHoursMin: 6,
    waterLitersPerDay: 0.5,
    spacingCm: 20,
    companionCrops: ['tomato'],
    incompatibleCrops: ['sage'],
    yieldKgPerM2: 2,
  },
  {
    id: 'bean',
    name: 'Bush Bean',
    category: 'legume',
    growingSeasons: ['spring', 'summer'],
    daysToHarvest: 55,
    sunHoursMin: 6,
    waterLitersPerDay: 1,
    spacingCm: 15,
    companionCrops: ['carrot', 'lettuce'],
    incompatibleCrops: ['onion'],
    yieldKgPerM2: 3,
  },
  {
    id: 'kale',
    name: 'Kale',
    category: 'leafy',
    growingSeasons: ['spring', 'fall', 'winter'],
    daysToHarvest: 55,
    sunHoursMin: 4,
    waterLitersPerDay: 1.5,
    spacingCm: 45,
    companionCrops: ['bean', 'lettuce'],
    incompatibleCrops: [],
    yieldKgPerM2: 4,
  },
];

// ═══════════════════════════════════════════════════════════════════
// Sunlight Simulation
// ═══════════════════════════════════════════════════════════════════

export function sunPositionAtHour(hour: number, latitude: number, dayOfYear: number): SunlightData {
  // Simplified solar position calculation
  const declination = 23.45 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const hourAngle = (hour - 12) * 15; // degrees
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;
  const altitude =
    (Math.asin(
      Math.sin(latRad) * Math.sin(decRad) +
        Math.cos(latRad) * Math.cos(decRad) * Math.cos((hourAngle * Math.PI) / 180)
    ) *
      180) /
    Math.PI;
  const azimuth = (hourAngle + 180) % 360;
  return { hour, altitude: Math.max(0, altitude), azimuth, intensity: Math.max(0, altitude / 90) };
}

export function dailySunHours(latitude: number, dayOfYear: number): number {
  let hours = 0;
  for (let h = 5; h <= 20; h++) {
    const sun = sunPositionAtHour(h, latitude, dayOfYear);
    if (sun.altitude > 0) hours++;
  }
  return hours;
}

export function hasSufficientSun(sunHours: number, crop: CropProfile): boolean {
  return sunHours >= crop.sunHoursMin;
}

// ═══════════════════════════════════════════════════════════════════
// Crop Management
// ═══════════════════════════════════════════════════════════════════

export function getCropById(id: string): CropProfile | undefined {
  return CROP_DATABASE.find((c) => c.id === id);
}

export function cropsForSeason(season: Season): CropProfile[] {
  return CROP_DATABASE.filter((c) => c.growingSeasons.includes(season));
}

export function areCompanions(a: CropProfile, b: CropProfile): boolean {
  return a.companionCrops.includes(b.id) || b.companionCrops.includes(a.id);
}

export function areIncompatible(a: CropProfile, b: CropProfile): boolean {
  return a.incompatibleCrops.includes(b.id) || b.incompatibleCrops.includes(a.id);
}

export function bedArea(bed: PlantingBed): number {
  return bed.widthM * bed.lengthM;
}

export function estimateYield(bed: PlantingBed, crop: CropProfile): number {
  return bedArea(bed) * crop.yieldKgPerM2;
}

export function plantsPerBed(bed: PlantingBed, spacingCm: number): number {
  const spacingM = spacingCm / 100;
  const cols = Math.floor(bed.widthM / spacingM);
  const rows = Math.floor(bed.lengthM / spacingM);
  return cols * rows;
}

export function dailyWaterUsage(beds: PlantingBed[]): number {
  let total = 0;
  for (const bed of beds) {
    if (!bed.cropId) continue;
    const crop = getCropById(bed.cropId);
    if (!crop) continue;
    const count = plantsPerBed(bed, crop.spacingCm);
    total += count * crop.waterLitersPerDay;
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════
// Permaculture — Food Forest Layers
// ═══════════════════════════════════════════════════════════════════

export type FoodForestLayer =
  | 'canopy' // Large fruit/nut trees (>10m)
  | 'understory' // Smaller trees (3-10m)
  | 'shrub' // Berry bushes, hazelnuts
  | 'herbaceous' // Herbs, perennial vegetables
  | 'groundcover' // Creeping plants, strawberries
  | 'rhizosphere' // Root crops, fungi
  | 'climber'; // Vines, grapes, kiwifruit

export interface FoodForestPlant {
  id: string;
  name: string;
  layer: FoodForestLayer;
  nitrogenFixer: boolean; // Leguminous — enriches soil
  dynamicAccumulator: boolean; // Deep roots bring up minerals
  pollinator: boolean; // Attracts bees/butterflies
  edible: boolean;
  perennial: boolean;
}

export const FOOD_FOREST_LAYERS: {
  layer: FoodForestLayer;
  heightM: string;
  description: string;
}[] = [
  {
    layer: 'canopy',
    heightM: '10-30m',
    description: 'Tall fruit/nut trees — chestnuts, walnuts, mulberries',
  },
  {
    layer: 'understory',
    heightM: '3-10m',
    description: 'Dwarf fruit trees — apples, peaches, figs, plums',
  },
  {
    layer: 'shrub',
    heightM: '1-3m',
    description: 'Berry bushes — blueberry, currant, gooseberry, hazelnut',
  },
  {
    layer: 'herbaceous',
    heightM: '0.3-1m',
    description: 'Herbs & perennials — comfrey, yarrow, rhubarb, mint',
  },
  {
    layer: 'groundcover',
    heightM: '0-0.3m',
    description: 'Spreading plants — strawberry, clover, creeping thyme',
  },
  {
    layer: 'rhizosphere',
    heightM: '<0m',
    description: 'Root layer — potato, garlic, ginger, mushrooms',
  },
  {
    layer: 'climber',
    heightM: 'vertical',
    description: 'Vines — grapes, kiwifruit, passionfruit, hops',
  },
];

// ═══════════════════════════════════════════════════════════════════
// Permaculture — Plant Guilds
// ═══════════════════════════════════════════════════════════════════

export interface PlantGuild {
  id: string;
  name: string;
  centerPlant: string; // Anchor species (usually a tree)
  members: FoodForestPlant[];
  benefits: string[]; // Mutual benefits
}

export const THREE_SISTERS_GUILD: PlantGuild = {
  id: 'three-sisters',
  name: 'Three Sisters (Corn-Bean-Squash)',
  centerPlant: 'corn',
  members: [
    {
      id: 'corn',
      name: 'Corn',
      layer: 'herbaceous',
      nitrogenFixer: false,
      dynamicAccumulator: false,
      pollinator: false,
      edible: true,
      perennial: false,
    },
    {
      id: 'bean',
      name: 'Climbing Bean',
      layer: 'climber',
      nitrogenFixer: true,
      dynamicAccumulator: false,
      pollinator: true,
      edible: true,
      perennial: false,
    },
    {
      id: 'squash',
      name: 'Winter Squash',
      layer: 'groundcover',
      nitrogenFixer: false,
      dynamicAccumulator: false,
      pollinator: true,
      edible: true,
      perennial: false,
    },
  ],
  benefits: [
    'Corn provides structure for beans',
    'Beans fix nitrogen for all',
    'Squash shades soil and suppresses weeds',
  ],
};

export const APPLE_GUILD: PlantGuild = {
  id: 'apple-guild',
  name: 'Apple Tree Guild',
  centerPlant: 'apple',
  members: [
    {
      id: 'apple',
      name: 'Apple Tree',
      layer: 'understory',
      nitrogenFixer: false,
      dynamicAccumulator: false,
      pollinator: true,
      edible: true,
      perennial: true,
    },
    {
      id: 'comfrey',
      name: 'Comfrey',
      layer: 'herbaceous',
      nitrogenFixer: false,
      dynamicAccumulator: true,
      pollinator: true,
      edible: false,
      perennial: true,
    },
    {
      id: 'white-clover',
      name: 'White Clover',
      layer: 'groundcover',
      nitrogenFixer: true,
      dynamicAccumulator: false,
      pollinator: true,
      edible: false,
      perennial: true,
    },
    {
      id: 'nasturtium',
      name: 'Nasturtium',
      layer: 'groundcover',
      nitrogenFixer: false,
      dynamicAccumulator: false,
      pollinator: true,
      edible: true,
      perennial: false,
    },
    {
      id: 'chives',
      name: 'Chives',
      layer: 'herbaceous',
      nitrogenFixer: false,
      dynamicAccumulator: false,
      pollinator: true,
      edible: true,
      perennial: true,
    },
  ],
  benefits: [
    'Clover fixes nitrogen',
    'Comfrey mines deep minerals',
    'Nasturtium traps aphids',
    'Chives deter pests',
  ],
};

export function guildNitrogenFixers(guild: PlantGuild): FoodForestPlant[] {
  return guild.members.filter((m) => m.nitrogenFixer);
}

export function guildDynamicAccumulators(guild: PlantGuild): FoodForestPlant[] {
  return guild.members.filter((m) => m.dynamicAccumulator);
}

export function guildLayerCoverage(guild: PlantGuild): FoodForestLayer[] {
  return [...new Set(guild.members.map((m) => m.layer))];
}

// ═══════════════════════════════════════════════════════════════════
// Restorative Farming — Soil Health
// ═══════════════════════════════════════════════════════════════════

export interface SoilHealthProfile {
  organicMatterPercent: number; // Ideal: 3-6%
  ph: number; // 6.0-7.0 for most crops
  nitrogenPPM: number;
  phosphorusPPM: number;
  potassiumPPM: number;
  microbialDiversityIndex: number; // 0-1 (Shannon-Wiener normalized)
  compactionPSI: number; // <300 ideal
  drainageRate: 'poor' | 'moderate' | 'good' | 'excessive';
}

export function soilHealthScore(soil: SoilHealthProfile): number {
  let score = 0;
  if (soil.organicMatterPercent >= 3 && soil.organicMatterPercent <= 6) score += 25;
  else if (soil.organicMatterPercent >= 2) score += 15;
  if (soil.ph >= 6.0 && soil.ph <= 7.0) score += 25;
  else if (soil.ph >= 5.5 && soil.ph <= 7.5) score += 15;
  if (soil.microbialDiversityIndex >= 0.7) score += 25;
  else if (soil.microbialDiversityIndex >= 0.4) score += 15;
  if (soil.drainageRate === 'good') score += 25;
  else if (soil.drainageRate === 'moderate') score += 15;
  return score;
}

// ═══════════════════════════════════════════════════════════════════
// Restorative Farming — Cover Crops & Rotation
// ═══════════════════════════════════════════════════════════════════

export interface CoverCrop {
  id: string;
  name: string;
  nitrogenFixKgPerHa: number; // Estimated nitrogen contribution
  biomassKgPerHa: number;
  season: Season;
  terminationMethod: 'mow' | 'crimp' | 'till' | 'frost-kill';
}

export const COVER_CROPS: CoverCrop[] = [
  {
    id: 'crimson-clover',
    name: 'Crimson Clover',
    nitrogenFixKgPerHa: 130,
    biomassKgPerHa: 4000,
    season: 'fall',
    terminationMethod: 'frost-kill',
  },
  {
    id: 'winter-rye',
    name: 'Winter Rye',
    nitrogenFixKgPerHa: 0,
    biomassKgPerHa: 8000,
    season: 'fall',
    terminationMethod: 'crimp',
  },
  {
    id: 'buckwheat',
    name: 'Buckwheat',
    nitrogenFixKgPerHa: 0,
    biomassKgPerHa: 3000,
    season: 'summer',
    terminationMethod: 'mow',
  },
  {
    id: 'hairy-vetch',
    name: 'Hairy Vetch',
    nitrogenFixKgPerHa: 180,
    biomassKgPerHa: 5000,
    season: 'fall',
    terminationMethod: 'crimp',
  },
];

export function coverCropNitrogenValue(crop: CoverCrop, areaSqM: number): number {
  return (crop.nitrogenFixKgPerHa * areaSqM) / 10000;
}

export function rotationPlan(categories: CropCategory[]): CropCategory[][] {
  // 4-year rotation: cycle categories + fallow
  const years: CropCategory[][] = [];
  for (let y = 0; y < 4; y++) {
    years.push(categories.map((_, i) => categories[(i + y) % categories.length]));
  }
  return years;
}

export function compostDecompositionRate(temperatureC: number, moisturePercent: number): number {
  // Decomposition rate multiplier (1.0 = optimal at 55°C, 60% moisture)
  const tempFactor =
    temperatureC >= 45 && temperatureC <= 65 ? 1.0 : temperatureC >= 30 ? 0.6 : 0.3;
  const moistureFactor =
    moisturePercent >= 50 && moisturePercent <= 70 ? 1.0 : moisturePercent >= 40 ? 0.7 : 0.3;
  return tempFactor * moistureFactor;
}

export function polycultureDiversityScore(plants: FoodForestPlant[]): number {
  // Shannon-Wiener diversity index simplified: count unique layers covered
  const uniqueLayers = new Set(plants.map((p) => p.layer));
  return uniqueLayers.size / 7; // 7 possible layers
}

// ═══════════════════════════════════════════════════════════════════
// IoT — Sensor Types & Devices
// ═══════════════════════════════════════════════════════════════════

export type IoTSensorType = 'soil-moisture' | 'temperature' | 'humidity' | 'light' | 'ph' | 'ec';
export type DeviceStatus = 'online' | 'offline' | 'low-battery' | 'error';

export interface IoTSensor {
  id: string;
  name: string;
  type: IoTSensorType;
  position: Vec2;
  bedId?: string; // Associated planting bed
  status: DeviceStatus;
  batteryPercent: number; // 0-100
  lastReading: number; // Latest sensor value
  lastReadingTime: number; // Unix timestamp
  unit: string; // e.g., '%', '°C', 'lux', 'pH', 'mS/cm'
}

export interface SensorReading {
  sensorId: string;
  value: number;
  timestamp: number;
  quality: 'good' | 'degraded' | 'suspect';
}

export interface SensorAlert {
  sensorId: string;
  type: 'low' | 'high' | 'offline' | 'battery';
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface SensorThreshold {
  sensorType: IoTSensorType;
  min: number;
  max: number;
  unit: string;
}

// ═══════════════════════════════════════════════════════════════════
// IoT — Weather Station
// ═══════════════════════════════════════════════════════════════════

export interface WeatherStation {
  id: string;
  position: Vec2;
  temperature: number; // °C
  humidity: number; // %
  windSpeedKmh: number;
  rainfall24h: number; // mm
  uvIndex: number; // 0-11+
  barometricPressure: number; // hPa
  status: DeviceStatus;
}

// ═══════════════════════════════════════════════════════════════════
// IoT — Smart Irrigation
// ═══════════════════════════════════════════════════════════════════

export interface IrrigationTrigger {
  bedId: string;
  moistureSensorId: string;
  thresholdPercent: number; // Trigger when soil moisture drops below
  durationMinutes: number;
  enabled: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// IoT — Thresholds & Defaults
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_SENSOR_THRESHOLDS: SensorThreshold[] = [
  { sensorType: 'soil-moisture', min: 30, max: 80, unit: '%' },
  { sensorType: 'temperature', min: 5, max: 40, unit: '°C' },
  { sensorType: 'humidity', min: 30, max: 90, unit: '%' },
  { sensorType: 'light', min: 200, max: 100000, unit: 'lux' },
  { sensorType: 'ph', min: 5.5, max: 7.5, unit: 'pH' },
  { sensorType: 'ec', min: 0.5, max: 3.0, unit: 'mS/cm' },
];

// ═══════════════════════════════════════════════════════════════════
// IoT — Core Functions
// ═══════════════════════════════════════════════════════════════════

export function checkSensorAlerts(sensor: IoTSensor, thresholds: SensorThreshold[]): SensorAlert[] {
  const alerts: SensorAlert[] = [];
  const now = Date.now();

  // Battery alert
  if (sensor.batteryPercent < 15) {
    alerts.push({
      sensorId: sensor.id,
      type: 'battery',
      value: sensor.batteryPercent,
      threshold: 15,
      message: `${sensor.name} battery low (${sensor.batteryPercent}%)`,
      timestamp: now,
      acknowledged: false,
    });
  }

  // Offline alert (no reading in 30 minutes)
  if (now - sensor.lastReadingTime > 30 * 60 * 1000) {
    alerts.push({
      sensorId: sensor.id,
      type: 'offline',
      value: 0,
      threshold: 30,
      message: `${sensor.name} offline — no data for 30+ min`,
      timestamp: now,
      acknowledged: false,
    });
  }

  // Value threshold alerts
  const threshold = thresholds.find((t) => t.sensorType === sensor.type);
  if (threshold) {
    if (sensor.lastReading < threshold.min) {
      alerts.push({
        sensorId: sensor.id,
        type: 'low',
        value: sensor.lastReading,
        threshold: threshold.min,
        message: `${sensor.name} below minimum (${sensor.lastReading} ${sensor.unit})`,
        timestamp: now,
        acknowledged: false,
      });
    }
    if (sensor.lastReading > threshold.max) {
      alerts.push({
        sensorId: sensor.id,
        type: 'high',
        value: sensor.lastReading,
        threshold: threshold.max,
        message: `${sensor.name} above maximum (${sensor.lastReading} ${sensor.unit})`,
        timestamp: now,
        acknowledged: false,
      });
    }
  }

  return alerts;
}

export function shouldTriggerIrrigation(
  trigger: IrrigationTrigger,
  moistureReading: number
): boolean {
  return trigger.enabled && moistureReading < trigger.thresholdPercent;
}

export function sensorsByType(sensors: IoTSensor[], type: IoTSensorType): IoTSensor[] {
  return sensors.filter((s) => s.type === type);
}

export function onlineSensors(sensors: IoTSensor[]): IoTSensor[] {
  return sensors.filter((s) => s.status === 'online');
}

export function offlineSensors(sensors: IoTSensor[]): IoTSensor[] {
  return sensors.filter((s) => s.status === 'offline' || s.status === 'error');
}

export function averageSensorValue(sensors: IoTSensor[]): number {
  if (sensors.length === 0) return 0;
  return sensors.reduce((sum, s) => sum + s.lastReading, 0) / sensors.length;
}

export function fleetHealthPercent(sensors: IoTSensor[]): number {
  if (sensors.length === 0) return 100;
  const healthy = sensors.filter((s) => s.status === 'online' && s.batteryPercent >= 15).length;
  return (healthy / sensors.length) * 100;
}

export function growingDegreeDays(readings: SensorReading[], baseTemperatureC: number): number {
  // Sum of (daily avg temp - base temp) for each reading above base
  let gdd = 0;
  for (const r of readings) {
    if (r.value > baseTemperatureC) {
      gdd += r.value - baseTemperatureC;
    }
  }
  return gdd;
}

export function frostWarning(weather: WeatherStation): boolean {
  return weather.temperature <= 2;
}

export function evapotranspirationEstimate(
  temperatureC: number,
  humidityPercent: number,
  windSpeedKmh: number,
  uvIndex: number
): number {
  // Simplified Penman-Monteith-inspired ET₀ in mm/day
  const tempFactor = Math.max(0, (temperatureC - 10) * 0.2);
  const humidityFactor = (100 - humidityPercent) / 100;
  const windFactor = 1 + windSpeedKmh * 0.01;
  const uvFactor = uvIndex * 0.3;
  return tempFactor * humidityFactor * windFactor + uvFactor;
}

// ═══════════════════════════════════════════════════════════════════
// Mycorrhizal Network Simulation
// ═══════════════════════════════════════════════════════════════════

export interface MycorrhizalLink {
  plantA: string;
  plantB: string;
  nutrientFlowKgPerYear: number;
  distanceM: number;
}

/**
 * Simulate mycorrhizal fungal network connections between plants.
 * Plants within maxDistanceM share nutrients proportional to proximity.
 */
export function mycorrhizalNetworkSim(
  plants: { id: string; position: Vec2; nitrogenFixer: boolean }[],
  maxDistanceM: number
): MycorrhizalLink[] {
  const links: MycorrhizalLink[] = [];
  for (let i = 0; i < plants.length; i++) {
    for (let j = i + 1; j < plants.length; j++) {
      const dx = plants[i].position[0] - plants[j].position[0];
      const dy = plants[i].position[1] - plants[j].position[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= maxDistanceM) {
        const flow =
          (1 - dist / maxDistanceM) *
          (plants[i].nitrogenFixer || plants[j].nitrogenFixer ? 2 : 0.5);
        links.push({
          plantA: plants[i].id,
          plantB: plants[j].id,
          nutrientFlowKgPerYear: Math.round(flow * 100) / 100,
          distanceM: Math.round(dist * 100) / 100,
        });
      }
    }
  }
  return links;
}

// ═══════════════════════════════════════════════════════════════════
// LoRaWAN Mesh Connectivity
// ═══════════════════════════════════════════════════════════════════

export interface LoRaWANNode {
  id: string;
  position: Vec2;
  rangeM: number;
  isGateway: boolean;
}

/**
 * Test LoRaWAN mesh connectivity between IoT nodes.
 * Returns links with signal strength based on distance/range ratio.
 */
export function lorawanMeshConnect(
  nodes: LoRaWANNode[]
): { from: string; to: string; signalStrength: number; connected: boolean }[] {
  const links: { from: string; to: string; signalStrength: number; connected: boolean }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].position[0] - nodes[j].position[0];
      const dy = nodes[i].position[1] - nodes[j].position[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRange = Math.min(nodes[i].rangeM, nodes[j].rangeM);
      const connected = dist <= maxRange;
      const signalStrength = connected ? Math.max(0, 1 - dist / maxRange) : 0;
      links.push({
        from: nodes[i].id,
        to: nodes[j].id,
        signalStrength: Math.round(signalStrength * 100) / 100,
        connected,
      });
    }
  }
  return links;
}

// ═══════════════════════════════════════════════════════════════════
// Drone Survey Grid
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate an aerial drone survey grid for crop monitoring.
 */
export function droneSurveyGrid(
  originX: number,
  originY: number,
  widthM: number,
  heightM: number,
  altitudeM: number,
  laneSpacingM: number
): Vec2[] {
  const waypoints: Vec2[] = [];
  const lanes = Math.ceil(widthM / laneSpacingM);
  for (let i = 0; i <= lanes; i++) {
    const x = originX + i * laneSpacingM;
    const yStart = i % 2 === 0 ? originY : originY + heightM;
    const yEnd = i % 2 === 0 ? originY + heightM : originY;
    waypoints.push([x, yStart]);
    waypoints.push([x, yEnd]);
  }
  return waypoints;
}
