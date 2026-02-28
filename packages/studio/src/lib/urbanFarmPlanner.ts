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
