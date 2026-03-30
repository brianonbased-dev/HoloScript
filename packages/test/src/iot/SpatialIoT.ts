/**
 * SpatialIoT — Spatial IoT Bridge Module
 *
 * Bridges HoloScript spatial math with real-world IoT automation.
 * Provides ThermalZone modeling, room volume calculation, and
 * spatial-aware HVAC orchestration commands.
 *
 * This module is the concrete implementation of REAL_WORLD use case #1:
 * "The Spatial IoT Bridge (Smart Home & HVAC Automation)"
 *
 * Instead of blindly pinging a thermostat API, agents can:
 *   1. Load a .holo digital twin layout
 *   2. Calculate exact room volumes and thermal boundaries
 *   3. Issue spatially-aware HVAC commands per zone
 */

import { BoundingBox, Vec3 } from '../spatial/BoundingBox';
import { SpatialEntity } from '../spatial/SpatialEntity';

// ── Enums & Types ───────────────────────────────────────────────────────────

export type ThermalBoundaryType = 'wall' | 'window' | 'door' | 'vent' | 'open';

export interface ThermalBoundary {
  /** ID of the boundary surface. */
  id: string;
  /** Type of boundary (affects heat transfer coefficient). */
  type: ThermalBoundaryType;
  /** The spatial entity representing this boundary. */
  entity: SpatialEntity;
  /** Insulation R-value (m²·K/W). Higher = better insulated. */
  rValue: number;
  /** Whether the boundary is currently open (doors, windows, vents). */
  isOpen: boolean;
}

export interface ThermalZone {
  /** Unique zone ID (e.g., "living_room", "bedroom_1"). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** The bounding box representing the room's spatial volume. */
  bounds: BoundingBox;
  /** Current temperature in °C. */
  currentTemp: number;
  /** Target temperature in °C. */
  targetTemp: number;
  /** Thermal boundaries (walls, windows, doors, vents). */
  boundaries: ThermalBoundary[];
  /** IoT device IDs associated with this zone. */
  devices: string[];
}

export interface HVACCommand {
  /** Target device ID. */
  deviceId: string;
  /** Command type. */
  action: 'set_temperature' | 'set_fan_speed' | 'open_vent' | 'close_vent' | 'toggle_power';
  /** Target value (temperature in °C, fan speed 0-100, etc). */
  value: number;
  /** The zone this command applies to. */
  zoneId: string;
  /** Rationale for the agent's decision. */
  reason: string;
}

// ── Volume Calculator ──────────────────────────────────────────────────────

/**
 * Calculate the volume of a thermal zone in cubic meters.
 */
export function zoneVolume(zone: ThermalZone): number {
  return zone.bounds.volume();
}

/**
 * Calculate the usable floor area of a thermal zone in m².
 */
export function zoneFloorArea(zone: ThermalZone): number {
  const s = zone.bounds.size();
  return s.x * s.z; // width × depth
}

/**
 * Calculate the effective air volume considering open boundaries.
 * Open doors/windows connect adjacent zones, increasing the effective volume
 * that needs conditioning.
 */
export function effectiveAirVolume(zone: ThermalZone, adjacentZones: ThermalZone[]): number {
  let totalVolume = zoneVolume(zone);

  for (const boundary of zone.boundaries) {
    if (boundary.isOpen && (boundary.type === 'door' || boundary.type === 'window')) {
      // Find the adjacent zone that shares this boundary
      const adjacent = adjacentZones.find((z) =>
        z.boundaries.some((b) => b.id === boundary.id || b.entity.intersects(boundary.entity))
      );
      if (adjacent) {
        // Add a fraction of the adjacent zone's volume based on opening size
        const openingArea = boundary.entity.bounds.volume();
        const adjacentVol = zoneVolume(adjacent);
        const flowFraction = Math.min(openingArea / zoneFloorArea(zone), 0.5);
        totalVolume += adjacentVol * flowFraction;
      }
    }
  }

  return totalVolume;
}

// ── Thermal Analysis ──────────────────────────────────────────────────────

/**
 * Calculate the total window area in a zone (affects heat gain/loss).
 */
export function windowArea(zone: ThermalZone): number {
  return zone.boundaries
    .filter((b) => b.type === 'window')
    .reduce((sum, b) => {
      const s = b.entity.bounds.size();
      // Window area is the largest face (width × height)
      return sum + Math.max(s.x * s.y, s.y * s.z, s.x * s.z);
    }, 0);
}

/**
 * Calculate average R-value for the zone's envelope.
 * Lower values mean more heat transfer (worse insulation).
 */
export function averageRValue(zone: ThermalZone): number {
  if (zone.boundaries.length === 0) return 0;
  const total = zone.boundaries.reduce((sum, b) => sum + b.rValue, 0);
  return total / zone.boundaries.length;
}

/**
 * Estimate the BTU/h cooling/heating load for a zone.
 *
 * Simplified model:
 *   Q = (Volume × ΔT × air_density × specific_heat) / (R_avg × time_constant)
 *
 * For a more accurate model, use ASHRAE Manual J calculations.
 */
export function estimateLoad(zone: ThermalZone, outsideTemp: number): number {
  const vol = zoneVolume(zone);
  const deltaT = Math.abs(outsideTemp - zone.targetTemp);
  const rAvg = Math.max(averageRValue(zone), 0.1); // prevent division by zero
  const winArea = windowArea(zone);

  // Base load from volume and temperature difference
  const baseLoad = vol * deltaT * 1.08; // 1.08 BTU/(ft³·°F·h) equivalent

  // Additional solar gain through windows (simplified)
  const solarGain = winArea * 200; // ~200 BTU/h per m² of window in direct sun

  // Insulation factor
  const insulationFactor = 1 / rAvg;

  return (baseLoad + solarGain) * insulationFactor;
}

// ── HVAC Command Generator ──────────────────────────────────────────────────

/**
 * Generate spatially-aware HVAC commands to reach target temperature
 * in each zone. This is the core "intelligence" layer that translates
 * spatial math into actionable IoT commands.
 */
export function generateHVACCommands(zones: ThermalZone[], outsideTemp: number): HVACCommand[] {
  const commands: HVACCommand[] = [];

  for (const zone of zones) {
    const tempDiff = zone.targetTemp - zone.currentTemp;
    if (Math.abs(tempDiff) < 0.5) continue; // within tolerance

    const load = estimateLoad(zone, outsideTemp);
    const vol = zoneVolume(zone);
    const needsCooling = tempDiff < 0;

    // Map devices to commands based on zone analysis
    for (const deviceId of zone.devices) {
      // Set temperature
      commands.push({
        deviceId,
        action: 'set_temperature',
        value: zone.targetTemp,
        zoneId: zone.id,
        reason: `Zone "${zone.name}" is ${Math.abs(tempDiff).toFixed(1)}°C ${needsCooling ? 'above' : 'below'} target. Volume: ${vol.toFixed(1)} m³, Load: ${load.toFixed(0)} BTU/h.`,
      });

      // Adjust fan speed based on volume and load
      const fanSpeed = Math.min(100, Math.round((load / vol) * 2));
      commands.push({
        deviceId,
        action: 'set_fan_speed',
        value: fanSpeed,
        zoneId: zone.id,
        reason: `Fan speed ${fanSpeed}% scaled to room volume (${vol.toFixed(1)} m³) and thermal load (${load.toFixed(0)} BTU/h).`,
      });
    }

    // Open/close vents based on spatial analysis
    for (const boundary of zone.boundaries) {
      if (boundary.type === 'vent') {
        const shouldOpen = Math.abs(tempDiff) > 1.0;
        if (shouldOpen !== boundary.isOpen) {
          commands.push({
            deviceId: boundary.id,
            action: shouldOpen ? 'open_vent' : 'close_vent',
            value: shouldOpen ? 1 : 0,
            zoneId: zone.id,
            reason: `${shouldOpen ? 'Opening' : 'Closing'} vent "${boundary.id}" — zone "${zone.name}" is ${Math.abs(tempDiff).toFixed(1)}°C from target.`,
          });
        }
      }
    }
  }

  return commands;
}

// ── Digital Twin Builder ──────────────────────────────────────────────────────

/**
 * Build a ThermalZone from a SpatialEntity and its properties.
 * This is the bridge between HoloScript scene data and the IoT layer.
 */
export function buildZoneFromEntity(
  entity: SpatialEntity,
  opts: {
    name: string;
    currentTemp: number;
    targetTemp: number;
    devices: string[];
    boundaries?: ThermalBoundary[];
  }
): ThermalZone {
  return {
    id: entity.id,
    name: opts.name,
    bounds: entity.bounds,
    currentTemp: opts.currentTemp,
    targetTemp: opts.targetTemp,
    boundaries: opts.boundaries ?? [],
    devices: opts.devices,
  };
}
