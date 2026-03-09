/**
 * urban-farm-planner.scenario.ts — LIVING-SPEC: Urban Farm Planner
 *
 * Persona: Sage — urban farmer who plans rooftop/vertical farms,
 * simulates sunlight, manages crop rotation, and optimizes water usage.
 * Extended with permaculture / restorative farming features.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  sunPositionAtHour,
  dailySunHours,
  hasSufficientSun,
  getCropById,
  cropsForSeason,
  areCompanions,
  areIncompatible,
  bedArea,
  estimateYield,
  plantsPerBed,
  dailyWaterUsage,
  guildNitrogenFixers,
  guildDynamicAccumulators,
  guildLayerCoverage,
  soilHealthScore,
  coverCropNitrogenValue,
  rotationPlan,
  compostDecompositionRate,
  polycultureDiversityScore,
  checkSensorAlerts,
  shouldTriggerIrrigation,
  sensorsByType,
  onlineSensors,
  offlineSensors,
  averageSensorValue,
  fleetHealthPercent,
  growingDegreeDays,
  frostWarning,
  evapotranspirationEstimate,
  mycorrhizalNetworkSim,
  lorawanMeshConnect,
  droneSurveyGrid,
  CROP_DATABASE,
  FOOD_FOREST_LAYERS,
  THREE_SISTERS_GUILD,
  APPLE_GUILD,
  COVER_CROPS,
  DEFAULT_SENSOR_THRESHOLDS,
  type PlantingBed,
  type SoilHealthProfile,
  type IoTSensor,
  type IrrigationTrigger,
  type WeatherStation,
  type SensorReading,
} from '@/lib/urbanFarmPlanner';

// ═══════════════════════════════════════════════════════════════════
// 1. Sunlight Simulation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Sunlight Simulation', () => {
  it('sun is above horizon at noon (latitude 40°, summer)', () => {
    const sun = sunPositionAtHour(12, 40, 172); // June 21
    expect(sun.altitude).toBeGreaterThan(0);
  });

  it('sun is below horizon at midnight', () => {
    const sun = sunPositionAtHour(0, 40, 172);
    expect(sun.altitude).toBe(0);
  });

  it('dailySunHours() returns ~15 for summer at 40°N', () => {
    const hours = dailySunHours(40, 172);
    expect(hours).toBeGreaterThanOrEqual(14);
  });

  it('dailySunHours() returns fewer hours in winter', () => {
    const summer = dailySunHours(40, 172);
    const winter = dailySunHours(40, 355);
    expect(winter).toBeLessThan(summer);
  });

  it('hasSufficientSun() checks crop minimum requirement', () => {
    const tomato = getCropById('tomato')!;
    expect(hasSufficientSun(8, tomato)).toBe(true); // needs 6
    expect(hasSufficientSun(4, tomato)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Crop Management
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Crop Management', () => {
  it('CROP_DATABASE has 6 crops', () => {
    expect(CROP_DATABASE).toHaveLength(6);
  });

  it('getCropById() returns tomato profile', () => {
    const tomato = getCropById('tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.daysToHarvest).toBe(80);
  });

  it('cropsForSeason(spring) includes tomato, lettuce, bean', () => {
    const spring = cropsForSeason('spring');
    expect(spring.length).toBeGreaterThanOrEqual(3);
    expect(spring.some((c) => c.id === 'tomato')).toBe(true);
  });

  it('cropsForSeason(winter) is limited to cold-hardy crops', () => {
    const winter = cropsForSeason('winter');
    expect(winter.length).toBeLessThan(CROP_DATABASE.length);
    expect(winter.some((c) => c.id === 'kale')).toBe(true);
  });

  it('areCompanions() — tomato + basil are companions', () => {
    expect(areCompanions(getCropById('tomato')!, getCropById('basil')!)).toBe(true);
  });

  it('areIncompatible() — tomato + fennel are incompatible', () => {
    expect(
      areIncompatible(getCropById('tomato')!, {
        id: 'fennel',
        name: 'Fennel',
        category: 'herb',
        growingSeasons: ['spring'],
        daysToHarvest: 60,
        sunHoursMin: 6,
        waterLitersPerDay: 1,
        spacingCm: 30,
        companionCrops: [],
        incompatibleCrops: ['tomato'],
        yieldKgPerM2: 2,
      })
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Bed & Yield
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Bed & Yield', () => {
  const bed: PlantingBed = {
    id: 'b1',
    position: { x: 0, y: 0 },
    widthM: 1.2,
    lengthM: 4,
    soilType: 'loam',
    cropId: 'tomato',
    plantedDate: Date.now(),
    irrigationType: 'drip',
  };

  it('bedArea() calculates m²', () => {
    expect(bedArea(bed)).toBeCloseTo(4.8, 1);
  });

  it('estimateYield() = area × yield/m²', () => {
    const tomato = getCropById('tomato')!;
    expect(estimateYield(bed, tomato)).toBeCloseTo(38.4, 0); // 4.8 × 8
  });

  it('plantsPerBed() uses grid spacing', () => {
    const count = plantsPerBed(bed, 60); // 60cm spacing
    expect(count).toBe(2 * 6); // 2 cols × 6 rows
  });

  it('dailyWaterUsage() sums all beds', () => {
    const beds: PlantingBed[] = [
      { ...bed, id: 'b1', cropId: 'tomato' },
      { ...bed, id: 'b2', cropId: 'lettuce' },
    ];
    const usage = dailyWaterUsage(beds);
    expect(usage).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Permaculture — Food Forest Layers
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Food Forest (Permaculture)', () => {
  it('food forest has 7 layers', () => {
    expect(FOOD_FOREST_LAYERS).toHaveLength(7);
  });

  it('layers span from canopy (10-30m) to rhizosphere (<0m)', () => {
    expect(FOOD_FOREST_LAYERS[0].layer).toBe('canopy');
    expect(FOOD_FOREST_LAYERS[5].layer).toBe('rhizosphere');
    expect(FOOD_FOREST_LAYERS[6].layer).toBe('climber');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Permaculture — Plant Guilds
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Plant Guilds (Permaculture)', () => {
  it('Three Sisters guild has corn, bean, squash', () => {
    expect(THREE_SISTERS_GUILD.members).toHaveLength(3);
    expect(THREE_SISTERS_GUILD.centerPlant).toBe('corn');
  });

  it('Three Sisters bean is a nitrogen fixer', () => {
    const fixers = guildNitrogenFixers(THREE_SISTERS_GUILD);
    expect(fixers).toHaveLength(1);
    expect(fixers[0].name).toBe('Climbing Bean');
  });

  it('Apple Guild has 5 members across 3 layers', () => {
    expect(APPLE_GUILD.members).toHaveLength(5);
    const layers = guildLayerCoverage(APPLE_GUILD);
    expect(layers.length).toBe(3); // understory, herbaceous, groundcover
  });

  it('Apple Guild has comfrey as dynamic accumulator', () => {
    const accumulators = guildDynamicAccumulators(APPLE_GUILD);
    expect(accumulators).toHaveLength(1);
    expect(accumulators[0].name).toBe('Comfrey');
  });

  it('Three Sisters covers 3 distinct layers', () => {
    const layers = guildLayerCoverage(THREE_SISTERS_GUILD);
    expect(layers).toContain('herbaceous');
    expect(layers).toContain('climber');
    expect(layers).toContain('groundcover');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Restorative Farming — Soil Health
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Soil Health (Restorative)', () => {
  it('ideal soil scores 100', () => {
    const ideal: SoilHealthProfile = {
      organicMatterPercent: 4,
      ph: 6.5,
      nitrogenPPM: 40,
      phosphorusPPM: 30,
      potassiumPPM: 200,
      microbialDiversityIndex: 0.8,
      compactionPSI: 200,
      drainageRate: 'good',
    };
    expect(soilHealthScore(ideal)).toBe(100);
  });

  it('depleted soil scores low', () => {
    const depleted: SoilHealthProfile = {
      organicMatterPercent: 0.5,
      ph: 4.5,
      nitrogenPPM: 5,
      phosphorusPPM: 5,
      potassiumPPM: 50,
      microbialDiversityIndex: 0.1,
      compactionPSI: 500,
      drainageRate: 'poor',
    };
    expect(soilHealthScore(depleted)).toBe(0);
  });

  it('moderate soil scores in between', () => {
    const moderate: SoilHealthProfile = {
      organicMatterPercent: 2.5,
      ph: 5.8,
      nitrogenPPM: 20,
      phosphorusPPM: 15,
      potassiumPPM: 100,
      microbialDiversityIndex: 0.5,
      compactionPSI: 300,
      drainageRate: 'moderate',
    };
    const score = soilHealthScore(moderate);
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(80);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Restorative Farming — Cover Crops & Rotation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — Cover Crops & Rotation (Restorative)', () => {
  it('COVER_CROPS has 4 species', () => {
    expect(COVER_CROPS).toHaveLength(4);
  });

  it('crimson clover fixes 130 kg N/ha', () => {
    const clover = COVER_CROPS.find((c) => c.id === 'crimson-clover')!;
    expect(clover.nitrogenFixKgPerHa).toBe(130);
  });

  it('coverCropNitrogenValue() scales by area', () => {
    const clover = COVER_CROPS[0]; // 130 kg/ha
    expect(coverCropNitrogenValue(clover, 10000)).toBe(130); // 1 ha
    expect(coverCropNitrogenValue(clover, 5000)).toBe(65); // 0.5 ha
  });

  it('rotationPlan() generates 4-year rotation', () => {
    const plan = rotationPlan(['leafy', 'root', 'fruit', 'legume']);
    expect(plan).toHaveLength(4);
    expect(plan[0]).toEqual(['leafy', 'root', 'fruit', 'legume']);
    expect(plan[1][0]).toBe('root');
  });

  it('compostDecompositionRate() optimal at 55°C, 60% moisture', () => {
    expect(compostDecompositionRate(55, 60)).toBe(1.0);
  });

  it('compostDecompositionRate() slow in cold/dry conditions', () => {
    expect(compostDecompositionRate(10, 20)).toBe(0.09); // 0.3 * 0.3
  });

  it('polycultureDiversityScore() measures layer coverage', () => {
    expect(polycultureDiversityScore(THREE_SISTERS_GUILD.members)).toBeCloseTo(3 / 7, 2);
    expect(polycultureDiversityScore(APPLE_GUILD.members)).toBeCloseTo(3 / 7, 2);
  });

  it('mycorrhizal network — simulate underground fungal nutrient sharing', () => {
    const plants = [
      { id: 'clover', position: { x: 0, y: 0 }, nitrogenFixer: true },
      { id: 'tomato', position: { x: 1, y: 0 }, nitrogenFixer: false },
      { id: 'basil', position: { x: 0.5, y: 0.5 }, nitrogenFixer: false },
      { id: 'far-tree', position: { x: 100, y: 100 }, nitrogenFixer: false },
    ];
    const links = mycorrhizalNetworkSim(plants, 2);
    // Close plants should be connected, far-tree should not
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some((l) => l.plantA === 'far-tree' || l.plantB === 'far-tree')).toBe(false);
    // Nitrogen fixer links have higher flow
    const cloverLink = links.find((l) => l.plantA === 'clover' || l.plantB === 'clover')!;
    expect(cloverLink.nutrientFlowKgPerYear).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. IoT — Sensor Alerts
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — IoT Sensor Alerts', () => {
  const now = Date.now();
  const healthySensor: IoTSensor = {
    id: 's1',
    name: 'Bed A Moisture',
    type: 'soil-moisture',
    position: { x: 1, y: 1 },
    bedId: 'b1',
    status: 'online',
    batteryPercent: 85,
    lastReading: 55,
    lastReadingTime: now,
    unit: '%',
  };

  it('healthy sensor generates no alerts', () => {
    expect(checkSensorAlerts(healthySensor, DEFAULT_SENSOR_THRESHOLDS)).toHaveLength(0);
  });

  it('low battery (<15%) triggers battery alert', () => {
    const lowBat = { ...healthySensor, batteryPercent: 8 };
    const alerts = checkSensorAlerts(lowBat, DEFAULT_SENSOR_THRESHOLDS);
    expect(alerts.some((a) => a.type === 'battery')).toBe(true);
  });

  it('stale reading (>30 min) triggers offline alert', () => {
    const stale = { ...healthySensor, lastReadingTime: now - 45 * 60 * 1000 };
    const alerts = checkSensorAlerts(stale, DEFAULT_SENSOR_THRESHOLDS);
    expect(alerts.some((a) => a.type === 'offline')).toBe(true);
  });

  it('reading below threshold triggers low alert', () => {
    const dry = { ...healthySensor, lastReading: 15 }; // min is 30%
    const alerts = checkSensorAlerts(dry, DEFAULT_SENSOR_THRESHOLDS);
    expect(alerts.some((a) => a.type === 'low')).toBe(true);
  });

  it('reading above threshold triggers high alert', () => {
    const saturated = { ...healthySensor, lastReading: 95 }; // max is 80%
    const alerts = checkSensorAlerts(saturated, DEFAULT_SENSOR_THRESHOLDS);
    expect(alerts.some((a) => a.type === 'high')).toBe(true);
  });

  it('DEFAULT_SENSOR_THRESHOLDS has 6 sensor types', () => {
    expect(DEFAULT_SENSOR_THRESHOLDS).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. IoT — Smart Irrigation & Fleet
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — IoT Irrigation & Fleet', () => {
  const trigger: IrrigationTrigger = {
    bedId: 'b1',
    moistureSensorId: 's1',
    thresholdPercent: 35,
    durationMinutes: 15,
    enabled: true,
  };

  it('shouldTriggerIrrigation() fires when moisture below threshold', () => {
    expect(shouldTriggerIrrigation(trigger, 25)).toBe(true);
  });

  it('shouldTriggerIrrigation() does NOT fire when moisture above threshold', () => {
    expect(shouldTriggerIrrigation(trigger, 50)).toBe(false);
  });

  it('shouldTriggerIrrigation() does NOT fire when disabled', () => {
    expect(shouldTriggerIrrigation({ ...trigger, enabled: false }, 10)).toBe(false);
  });

  const now = Date.now();
  const sensors: IoTSensor[] = [
    {
      id: 's1',
      name: 'Moisture 1',
      type: 'soil-moisture',
      position: { x: 0, y: 0 },
      status: 'online',
      batteryPercent: 90,
      lastReading: 55,
      lastReadingTime: now,
      unit: '%',
    },
    {
      id: 's2',
      name: 'Temp 1',
      type: 'temperature',
      position: { x: 1, y: 0 },
      status: 'online',
      batteryPercent: 70,
      lastReading: 22,
      lastReadingTime: now,
      unit: '°C',
    },
    {
      id: 's3',
      name: 'Moisture 2',
      type: 'soil-moisture',
      position: { x: 2, y: 0 },
      status: 'offline',
      batteryPercent: 5,
      lastReading: 0,
      lastReadingTime: now - 3600000,
      unit: '%',
    },
    {
      id: 's4',
      name: 'Light 1',
      type: 'light',
      position: { x: 3, y: 0 },
      status: 'online',
      batteryPercent: 50,
      lastReading: 45000,
      lastReadingTime: now,
      unit: 'lux',
    },
  ];

  it('sensorsByType(soil-moisture) returns 2 sensors', () => {
    expect(sensorsByType(sensors, 'soil-moisture')).toHaveLength(2);
  });

  it('onlineSensors() returns 3 sensors', () => {
    expect(onlineSensors(sensors)).toHaveLength(3);
  });

  it('offlineSensors() returns 1 sensor', () => {
    expect(offlineSensors(sensors)).toHaveLength(1);
  });

  it('averageSensorValue() calculates mean of moisture sensors', () => {
    const moisture = sensorsByType(sensors, 'soil-moisture');
    expect(averageSensorValue(moisture)).toBeCloseTo(27.5, 0); // (55+0)/2
  });

  it('fleetHealthPercent() = 75% (3 healthy out of 4)', () => {
    expect(fleetHealthPercent(sensors)).toBe(75);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. IoT — Weather & Growing Conditions
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Urban Farm — IoT Weather & Growing', () => {
  it('growingDegreeDays() accumulates above base temp', () => {
    const readings: SensorReading[] = [
      { sensorId: 't1', value: 20, timestamp: 1, quality: 'good' },
      { sensorId: 't1', value: 25, timestamp: 2, quality: 'good' },
      { sensorId: 't1', value: 8, timestamp: 3, quality: 'good' }, // below base
    ];
    const gdd = growingDegreeDays(readings, 10);
    expect(gdd).toBe(25); // (20-10) + (25-10) + 0
  });

  it('frostWarning() triggers at ≤2°C', () => {
    const warm: WeatherStation = {
      id: 'w1',
      position: { x: 0, y: 0 },
      temperature: 15,
      humidity: 60,
      windSpeedKmh: 10,
      rainfall24h: 0,
      uvIndex: 5,
      barometricPressure: 1013,
      status: 'online',
    };
    const cold: WeatherStation = { ...warm, temperature: 1 };
    expect(frostWarning(warm)).toBe(false);
    expect(frostWarning(cold)).toBe(true);
  });

  it('evapotranspirationEstimate() increases with heat and wind', () => {
    const cool = evapotranspirationEstimate(15, 80, 5, 3);
    const hot = evapotranspirationEstimate(35, 30, 20, 9);
    expect(hot).toBeGreaterThan(cool);
  });

  it('evapotranspirationEstimate() returns 0+ even in cool conditions', () => {
    const et = evapotranspirationEstimate(10, 90, 0, 0);
    expect(et).toBeGreaterThanOrEqual(0);
  });

  it('LoRaWAN mesh — long-range IoT connectivity for field sensors', () => {
    const nodes = [
      { id: 'gateway', position: { x: 0, y: 0 }, rangeM: 5000, isGateway: true },
      { id: 'sensor-a', position: { x: 1000, y: 0 }, rangeM: 3000, isGateway: false },
      { id: 'sensor-b', position: { x: 4000, y: 0 }, rangeM: 3000, isGateway: false },
      { id: 'isolated', position: { x: 20000, y: 20000 }, rangeM: 500, isGateway: false },
    ];
    const mesh = lorawanMeshConnect(nodes);
    // Gateway-to-sensor-a within range
    const gwToA = mesh.find((l) => l.from === 'gateway' && l.to === 'sensor-a');
    expect(gwToA!.connected).toBe(true);
    expect(gwToA!.signalStrength).toBeGreaterThan(0);
    // Isolated node cannot connect to anything
    const isolatedLinks = mesh.filter((l) => l.from === 'isolated' || l.to === 'isolated');
    expect(isolatedLinks.every((l) => !l.connected)).toBe(true);
  });

  it('drone survey — automated NDVI crop health imaging', () => {
    const waypoints = droneSurveyGrid(0, 0, 100, 200, 30, 25);
    expect(waypoints.length).toBeGreaterThanOrEqual(8); // 4+ lanes × 2 waypoints
    // Alternating direction (boustrophedon pattern)
    expect(waypoints[0].y).toBe(0);
    expect(waypoints[1].y).toBe(200);
    expect(waypoints[2].y).toBe(200); // Odd lane starts from far end
    expect(waypoints[3].y).toBe(0);
  });
});
