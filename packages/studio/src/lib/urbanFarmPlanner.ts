/**
 * urbanFarmPlanner.ts — Urban Farm Planning Engine
 *
 * Sunlight simulation, crop rotation scheduling, irrigation layout,
 * vertical farming structures, soil analysis, and yield estimation.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Vec2 { x: number; y: number }

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
  hour: number;         // 0-23
  altitude: number;     // degrees above horizon
  azimuth: number;      // degrees from north
  intensity: number;    // 0-1 (0 = shadow, 1 = full sun)
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
  flowRateLPH: number;       // liters per hour
  schedule: { startHour: number; durationMin: number }[];
  waterUsageLitersPerDay: number;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const CROP_DATABASE: CropProfile[] = [
  { id: 'tomato', name: 'Tomato', category: 'fruit', growingSeasons: ['spring', 'summer'], daysToHarvest: 80, sunHoursMin: 6, waterLitersPerDay: 2, spacingCm: 60, companionCrops: ['basil', 'carrot'], incompatibleCrops: ['fennel'], yieldKgPerM2: 8 },
  { id: 'lettuce', name: 'Lettuce', category: 'leafy', growingSeasons: ['spring', 'fall'], daysToHarvest: 45, sunHoursMin: 4, waterLitersPerDay: 1, spacingCm: 25, companionCrops: ['carrot', 'radish'], incompatibleCrops: [], yieldKgPerM2: 5 },
  { id: 'carrot', name: 'Carrot', category: 'root', growingSeasons: ['spring', 'fall'], daysToHarvest: 70, sunHoursMin: 6, waterLitersPerDay: 1.5, spacingCm: 8, companionCrops: ['tomato', 'lettuce'], incompatibleCrops: ['dill'], yieldKgPerM2: 4 },
  { id: 'basil', name: 'Basil', category: 'herb', growingSeasons: ['spring', 'summer'], daysToHarvest: 30, sunHoursMin: 6, waterLitersPerDay: 0.5, spacingCm: 20, companionCrops: ['tomato'], incompatibleCrops: ['sage'], yieldKgPerM2: 2 },
  { id: 'bean', name: 'Bush Bean', category: 'legume', growingSeasons: ['spring', 'summer'], daysToHarvest: 55, sunHoursMin: 6, waterLitersPerDay: 1, spacingCm: 15, companionCrops: ['carrot', 'lettuce'], incompatibleCrops: ['onion'], yieldKgPerM2: 3 },
  { id: 'kale', name: 'Kale', category: 'leafy', growingSeasons: ['spring', 'fall', 'winter'], daysToHarvest: 55, sunHoursMin: 4, waterLitersPerDay: 1.5, spacingCm: 45, companionCrops: ['bean', 'lettuce'], incompatibleCrops: [], yieldKgPerM2: 4 },
];

// ═══════════════════════════════════════════════════════════════════
// Sunlight Simulation
// ═══════════════════════════════════════════════════════════════════

export function sunPositionAtHour(hour: number, latitude: number, dayOfYear: number): SunlightData {
  // Simplified solar position calculation
  const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
  const hourAngle = (hour - 12) * 15; // degrees
  const latRad = latitude * Math.PI / 180;
  const decRad = declination * Math.PI / 180;
  const altitude = Math.asin(
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle * Math.PI / 180)
  ) * 180 / Math.PI;
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
  return CROP_DATABASE.find(c => c.id === id);
}

export function cropsForSeason(season: Season): CropProfile[] {
  return CROP_DATABASE.filter(c => c.growingSeasons.includes(season));
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
  | 'canopy'         // Large fruit/nut trees (>10m)
  | 'understory'     // Smaller trees (3-10m)
  | 'shrub'          // Berry bushes, hazelnuts
  | 'herbaceous'     // Herbs, perennial vegetables
  | 'groundcover'    // Creeping plants, strawberries
  | 'rhizosphere'    // Root crops, fungi
  | 'climber';       // Vines, grapes, kiwifruit

export interface FoodForestPlant {
  id: string;
  name: string;
  layer: FoodForestLayer;
  nitrogenFixer: boolean;    // Leguminous — enriches soil
  dynamicAccumulator: boolean; // Deep roots bring up minerals
  pollinator: boolean;        // Attracts bees/butterflies
  edible: boolean;
  perennial: boolean;
}

export const FOOD_FOREST_LAYERS: { layer: FoodForestLayer; heightM: string; description: string }[] = [
  { layer: 'canopy',      heightM: '10-30m',  description: 'Tall fruit/nut trees — chestnuts, walnuts, mulberries' },
  { layer: 'understory',  heightM: '3-10m',   description: 'Dwarf fruit trees — apples, peaches, figs, plums' },
  { layer: 'shrub',       heightM: '1-3m',    description: 'Berry bushes — blueberry, currant, gooseberry, hazelnut' },
  { layer: 'herbaceous',  heightM: '0.3-1m',  description: 'Herbs & perennials — comfrey, yarrow, rhubarb, mint' },
  { layer: 'groundcover', heightM: '0-0.3m',  description: 'Spreading plants — strawberry, clover, creeping thyme' },
  { layer: 'rhizosphere', heightM: '<0m',      description: 'Root layer — potato, garlic, ginger, mushrooms' },
  { layer: 'climber',     heightM: 'vertical', description: 'Vines — grapes, kiwifruit, passionfruit, hops' },
];

// ═══════════════════════════════════════════════════════════════════
// Permaculture — Plant Guilds
// ═══════════════════════════════════════════════════════════════════

export interface PlantGuild {
  id: string;
  name: string;
  centerPlant: string;       // Anchor species (usually a tree)
  members: FoodForestPlant[];
  benefits: string[];        // Mutual benefits
}

export const THREE_SISTERS_GUILD: PlantGuild = {
  id: 'three-sisters', name: 'Three Sisters (Corn-Bean-Squash)',
  centerPlant: 'corn',
  members: [
    { id: 'corn', name: 'Corn', layer: 'herbaceous', nitrogenFixer: false, dynamicAccumulator: false, pollinator: false, edible: true, perennial: false },
    { id: 'bean', name: 'Climbing Bean', layer: 'climber', nitrogenFixer: true, dynamicAccumulator: false, pollinator: true, edible: true, perennial: false },
    { id: 'squash', name: 'Winter Squash', layer: 'groundcover', nitrogenFixer: false, dynamicAccumulator: false, pollinator: true, edible: true, perennial: false },
  ],
  benefits: ['Corn provides structure for beans', 'Beans fix nitrogen for all', 'Squash shades soil and suppresses weeds'],
};

export const APPLE_GUILD: PlantGuild = {
  id: 'apple-guild', name: 'Apple Tree Guild',
  centerPlant: 'apple',
  members: [
    { id: 'apple', name: 'Apple Tree', layer: 'understory', nitrogenFixer: false, dynamicAccumulator: false, pollinator: true, edible: true, perennial: true },
    { id: 'comfrey', name: 'Comfrey', layer: 'herbaceous', nitrogenFixer: false, dynamicAccumulator: true, pollinator: true, edible: false, perennial: true },
    { id: 'white-clover', name: 'White Clover', layer: 'groundcover', nitrogenFixer: true, dynamicAccumulator: false, pollinator: true, edible: false, perennial: true },
    { id: 'nasturtium', name: 'Nasturtium', layer: 'groundcover', nitrogenFixer: false, dynamicAccumulator: false, pollinator: true, edible: true, perennial: false },
    { id: 'chives', name: 'Chives', layer: 'herbaceous', nitrogenFixer: false, dynamicAccumulator: false, pollinator: true, edible: true, perennial: true },
  ],
  benefits: ['Clover fixes nitrogen', 'Comfrey mines deep minerals', 'Nasturtium traps aphids', 'Chives deter pests'],
};

export function guildNitrogenFixers(guild: PlantGuild): FoodForestPlant[] {
  return guild.members.filter(m => m.nitrogenFixer);
}

export function guildDynamicAccumulators(guild: PlantGuild): FoodForestPlant[] {
  return guild.members.filter(m => m.dynamicAccumulator);
}

export function guildLayerCoverage(guild: PlantGuild): FoodForestLayer[] {
  return [...new Set(guild.members.map(m => m.layer))];
}

// ═══════════════════════════════════════════════════════════════════
// Restorative Farming — Soil Health
// ═══════════════════════════════════════════════════════════════════

export interface SoilHealthProfile {
  organicMatterPercent: number;   // Ideal: 3-6%
  ph: number;                      // 6.0-7.0 for most crops
  nitrogenPPM: number;
  phosphorusPPM: number;
  potassiumPPM: number;
  microbialDiversityIndex: number; // 0-1 (Shannon-Wiener normalized)
  compactionPSI: number;           // <300 ideal
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
  nitrogenFixKgPerHa: number;    // Estimated nitrogen contribution
  biomassKgPerHa: number;
  season: Season;
  terminationMethod: 'mow' | 'crimp' | 'till' | 'frost-kill';
}

export const COVER_CROPS: CoverCrop[] = [
  { id: 'crimson-clover', name: 'Crimson Clover', nitrogenFixKgPerHa: 130, biomassKgPerHa: 4000, season: 'fall', terminationMethod: 'frost-kill' },
  { id: 'winter-rye', name: 'Winter Rye', nitrogenFixKgPerHa: 0, biomassKgPerHa: 8000, season: 'fall', terminationMethod: 'crimp' },
  { id: 'buckwheat', name: 'Buckwheat', nitrogenFixKgPerHa: 0, biomassKgPerHa: 3000, season: 'summer', terminationMethod: 'mow' },
  { id: 'hairy-vetch', name: 'Hairy Vetch', nitrogenFixKgPerHa: 180, biomassKgPerHa: 5000, season: 'fall', terminationMethod: 'crimp' },
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

export function compostDecompositionRate(
  temperatureC: number,
  moisturePercent: number
): number {
  // Decomposition rate multiplier (1.0 = optimal at 55°C, 60% moisture)
  const tempFactor = temperatureC >= 45 && temperatureC <= 65 ? 1.0
    : temperatureC >= 30 ? 0.6
    : 0.3;
  const moistureFactor = moisturePercent >= 50 && moisturePercent <= 70 ? 1.0
    : moisturePercent >= 40 ? 0.7
    : 0.3;
  return tempFactor * moistureFactor;
}

export function polycultureDiversityScore(plants: FoodForestPlant[]): number {
  // Shannon-Wiener diversity index simplified: count unique layers covered
  const uniqueLayers = new Set(plants.map(p => p.layer));
  return uniqueLayers.size / 7; // 7 possible layers
}
