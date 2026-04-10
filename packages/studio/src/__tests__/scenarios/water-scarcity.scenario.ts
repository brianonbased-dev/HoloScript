/**
 * water-scarcity.scenario.ts — LIVING-SPEC: Water Scarcity Swarm
 *
 * Persona: Hydrologist Amara — monitors water basins with IoT + satellite
 * sensors, fuses data, and coordinates autonomous mitigation swarms.
 */
import { describe, it, expect } from 'vitest';

function fuseMoisture(iot: number, satellite: number, drone?: number): number {
  if (drone !== undefined) return iot * 0.5 + satellite * 0.3 + drone * 0.2;
  return iot * 0.6 + satellite * 0.4;
}

function anomalyLevel(moisture: number): 'normal' | 'warning' | 'critical' {
  if (moisture >= 0.4) return 'normal';
  if (moisture >= 0.2) return 'warning';
  return 'critical';
}

function mitigationCost(severity: number): number {
  return severity > 0.7 ? 30 : 10;
}

function mitigationStrategy(severity: number): string {
  return severity > 0.7 ? 'emergency_divert' : 'scheduled_irrigate';
}

function sensorStaleness(lastReading: number, now: number, thresholdMs: number): boolean {
  return now - lastReading > thresholdMs;
}

describe('Scenario: Water Scarcity — Sensor Fusion', () => {
  it('fuseMoisture() weighted avg of iot + satellite', () => {
    expect(fuseMoisture(0.5, 0.5)).toBeCloseTo(0.5, 5);
    expect(fuseMoisture(1.0, 0.0)).toBeCloseTo(0.6, 5);
  });
  it('fuseMoisture() with drone input', () => {
    expect(fuseMoisture(0.6, 0.4, 0.8)).toBeCloseTo(0.58, 1);
  });
});

describe('Scenario: Water Scarcity — Anomaly Detection', () => {
  it('anomalyLevel() classifies moisture levels', () => {
    expect(anomalyLevel(0.5)).toBe('normal');
    expect(anomalyLevel(0.3)).toBe('warning');
    expect(anomalyLevel(0.1)).toBe('critical');
  });
});

describe('Scenario: Water Scarcity — Mitigation', () => {
  it('mitigationCost() — high severity = 30 credits', () => {
    expect(mitigationCost(0.8)).toBe(30);
  });
  it('mitigationCost() — low severity = 10 credits', () => {
    expect(mitigationCost(0.5)).toBe(10);
  });
  it('mitigationStrategy() — emergency vs scheduled', () => {
    expect(mitigationStrategy(0.9)).toBe('emergency_divert');
    expect(mitigationStrategy(0.4)).toBe('scheduled_irrigate');
  });
  it('sensorStaleness() detects stale readings', () => {
    expect(sensorStaleness(1000, 5000, 3000)).toBe(true);
    expect(sensorStaleness(4000, 5000, 3000)).toBe(false);
  });
  it.todo('ROS2 bridge integration for real IoT sensors');
});

// ── Visualization: Satellite Imagery Overlay ──────────────────────────────
// Multi-layer tile compositor for stacking satellite bands on terrain maps.

type SatelliteBand = 'visible' | 'infrared' | 'ndvi' | 'thermal';

interface SatelliteLayer {
  band: SatelliteBand;
  opacity: number; // 0–1
  resolution: number; // m/pixel
  tileUrl: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

interface CompositePixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

function composeLayers(layers: SatelliteLayer[]): SatelliteLayer[] {
  // Sort by opacity descending so highest-opacity layer renders on top
  return [...layers].sort((a, b) => b.opacity - a.opacity);
}

function layerCoversRegion(layer: SatelliteLayer, region: { lat: number; lon: number }): boolean {
  return (
    region.lat >= layer.bounds.minLat &&
    region.lat <= layer.bounds.maxLat &&
    region.lon >= layer.bounds.minLon &&
    region.lon <= layer.bounds.maxLon
  );
}

function blendOpacity(base: number, overlay: number, overlayAlpha: number): number {
  return base * (1 - overlayAlpha) + overlay * overlayAlpha;
}

function bestResolutionLayer(layers: SatelliteLayer[]): SatelliteLayer | null {
  if (layers.length === 0) return null;
  return layers.reduce((best, l) => (l.resolution < best.resolution ? l : best));
}

function filterByBand(layers: SatelliteLayer[], band: SatelliteBand): SatelliteLayer[] {
  return layers.filter((l) => l.band === band);
}

describe('Scenario: Water Scarcity — Satellite Imagery Overlay', () => {
  const layers: SatelliteLayer[] = [
    {
      band: 'visible',
      opacity: 1.0,
      resolution: 10,
      tileUrl: '/tiles/visible/{z}/{x}/{y}.png',
      bounds: { minLat: 10, maxLat: 20, minLon: 30, maxLon: 40 },
    },
    {
      band: 'ndvi',
      opacity: 0.6,
      resolution: 30,
      tileUrl: '/tiles/ndvi/{z}/{x}/{y}.png',
      bounds: { minLat: 10, maxLat: 20, minLon: 30, maxLon: 40 },
    },
    {
      band: 'infrared',
      opacity: 0.4,
      resolution: 60,
      tileUrl: '/tiles/ir/{z}/{x}/{y}.png',
      bounds: { minLat: 12, maxLat: 18, minLon: 32, maxLon: 38 },
    },
  ];

  it('composeLayers() sorts by opacity desc', () => {
    const composed = composeLayers(layers);
    expect(composed[0].band).toBe('visible');
    expect(composed[composed.length - 1].band).toBe('infrared');
  });
  it('layerCoversRegion() checks bounds', () => {
    expect(layerCoversRegion(layers[0], { lat: 15, lon: 35 })).toBe(true);
    expect(layerCoversRegion(layers[2], { lat: 11, lon: 35 })).toBe(false); // IR bounds tighter
  });
  it('blendOpacity() composites two values', () => {
    expect(blendOpacity(100, 200, 0.5)).toBe(150);
    expect(blendOpacity(100, 200, 0.0)).toBe(100);
    expect(blendOpacity(100, 200, 1.0)).toBe(200);
  });
  it('bestResolutionLayer() picks lowest m/pixel', () => {
    expect(bestResolutionLayer(layers)?.band).toBe('visible'); // 10 m/px
  });
  it('filterByBand() isolates specific bands', () => {
    expect(filterByBand(layers, 'ndvi')).toHaveLength(1);
    expect(filterByBand(layers, 'thermal')).toHaveLength(0);
  });
});
