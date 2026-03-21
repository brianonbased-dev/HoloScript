# Spec: @weather Hub Trait — World Simulation Driver

**TODO-FEAT-004** | Priority 4 | Pillar A
**Date**: 2026-03-21
**Status**: SPEC DRAFT

## Context

### What Exists
- **WeatherSystem.ts** (174 lines): State manager with 7 weather types, smooth transitions, wind/temperature/humidity/visibility/precipitation, event listeners, history tracking
- **WeatherGovProvider.ts**: External weather data integration (Weather.gov API)
- **weather-phenomena.visual.ts**: Visual presets for weather rendering
- **weather-particles.visual.ts**: Particle-based weather effects
- **@weather_sync trait**: Declared in VRRTraits.ts but NOT implemented

### What's Missing (GAPS W.157)
- **Physics coupling**: Weather state does NOT drive physics parameters. Wind doesn't affect cloth/particles, rain doesn't change friction coefficients.
- **Hub architecture**: Weather is isolated — not a "hub" that multiple traits read from
- **Blackboard state**: No shared blackboard for consumer traits to query
- **Day-night cycle**: sun_position not tracked
- **Erosion integration**: No connection to terrain modification
- **Persistence**: Weather state not stored in CRDT for cross-session continuity

## Design

### Hub Trait Pattern (P.GAPS.10)

@weather becomes a **hub trait** that owns a blackboard state. Consumer traits declare a dependency on @weather and read from the blackboard. This creates environmental coherence without trait-to-trait coupling.

```
@weather (hub)
    │
    ├── @volumetric_clouds  (reads: cloud_density, sun_position)
    ├── @god_rays            (reads: sun_position, cloud_density)
    ├── @fluid               (reads: wind_vector → surface waves)
    ├── @cloth               (reads: wind_vector → force on vertices)
    ├── @particle_system     (reads: precipitation → rain/snow particles)
    ├── @physics             (reads: precipitation → friction modifier)
    └── @erosion             (reads: precipitation, wind → terrain delta → Loro CRDT)
```

### Blackboard State

```typescript
// packages/core/src/environment/WeatherBlackboard.ts

export interface WeatherBlackboard {
  // Core state (updated by @weather trait)
  wind_vector: [number, number, number];     // Direction + magnitude
  precipitation: number;                      // 0-1 intensity
  precipitation_type: 'none' | 'rain' | 'snow' | 'hail';
  temperature: number;                        // Celsius
  humidity: number;                           // 0-1
  sun_position: [number, number, number];    // Normalized direction vector
  sun_intensity: number;                      // 0-1 (0 at night)
  cloud_density: number;                      // 0-1
  cloud_altitude: number;                     // Meters
  fog_density: number;                        // 0-1
  time_of_day: number;                        // 0-24 hours (fractional)

  // Derived (computed from core state)
  is_night: boolean;                          // sun_intensity < 0.1
  surface_wetness: number;                    // Accumulated precipitation
  wind_speed: number;                         // Magnitude of wind_vector
  visibility_range: number;                   // Meters (from fog + precipitation)
}

// Singleton blackboard — consumer traits import and read
export const weatherBlackboard: WeatherBlackboard = {
  wind_vector: [0, 0, 0],
  precipitation: 0,
  precipitation_type: 'none',
  temperature: 20,
  humidity: 0.5,
  sun_position: [0.5, 0.87, 0],  // ~60° elevation
  sun_intensity: 1.0,
  cloud_density: 0.3,
  cloud_altitude: 2000,
  fog_density: 0,
  time_of_day: 12,
  is_night: false,
  surface_wetness: 0,
  wind_speed: 0,
  visibility_range: 10000,
};
```

### @weather Trait Handler

```typescript
// packages/core/src/traits/WeatherHubTrait.ts

export interface WeatherHubConfig {
  // Day-night cycle
  day_length_seconds: number;          // Real seconds per in-game day (default: 1200 = 20 min)
  start_time: number;                  // Starting time of day (0-24)

  // Weather presets
  initial_weather: WeatherPreset;      // Starting conditions
  auto_cycle: boolean;                 // Auto-transition between weather types
  cycle_min_duration: number;          // Min seconds per weather state
  cycle_max_duration: number;          // Max seconds per weather state

  // Physics coupling strength
  wind_physics_scale: number;          // How much wind affects physics (default: 1.0)
  wetness_friction_modifier: number;   // Friction reduction when wet (default: 0.7)

  // Persistence
  persist_to_crdt: boolean;            // Save weather state to Loro (default: true)
}

export const weatherHubHandler: TraitHandler<WeatherHubConfig> = {
  name: 'weather',

  defaultConfig: {
    day_length_seconds: 1200,
    start_time: 12,
    initial_weather: 'clear',
    auto_cycle: true,
    cycle_min_duration: 120,
    cycle_max_duration: 600,
    wind_physics_scale: 1.0,
    wetness_friction_modifier: 0.7,
    persist_to_crdt: true,
  },

  onAttach(node, config, context) {
    // Initialize from existing WeatherSystem
    // Set initial blackboard state
    // Start day-night cycle timer
    // If persist_to_crdt: load last weather state from Loro
  },

  onUpdate(node, config, context, dt) {
    // 1. Advance time_of_day
    // 2. Compute sun_position from time_of_day (spherical coords)
    // 3. Update precipitation → surface_wetness accumulation
    // 4. Update wind_vector (with optional turbulence noise)
    // 5. Write all to weatherBlackboard (singleton)
    // 6. If persist_to_crdt: write weather state to Loro doc
  },

  onDetach(node) {
    // Save final state to CRDT
    // Clear blackboard
  },
};
```

### Consumer Integration Pattern

Each consumer trait reads from the blackboard on its `onUpdate`:

```typescript
// Example: ClothTrait integration
import { weatherBlackboard } from '../environment/WeatherBlackboard';

// In ClothTrait.onUpdate():
const windForce = {
  x: weatherBlackboard.wind_vector[0] * config.wind_sensitivity,
  y: weatherBlackboard.wind_vector[1] * config.wind_sensitivity,
  z: weatherBlackboard.wind_vector[2] * config.wind_sensitivity,
};
// Apply windForce to PBD cloth vertices
```

```typescript
// Example: PhysicsTrait friction modification
const frictionMod = weatherBlackboard.surface_wetness > 0.1
  ? config.wetness_friction_modifier
  : 1.0;
// Apply frictionMod to ground contact friction
```

### Day-Night Cycle

```
time_of_day: 0 ─────── 6 ─────── 12 ─────── 18 ─────── 24
              midnight  sunrise   noon       sunset     midnight

sun_intensity: 0 ──── ramp ──── 1.0 ──── ramp ──── 0
sun_elevation: -90° ── 0° ──── max ──── 0° ──── -90°
```

Sun position computed as:
```typescript
const hourAngle = (timeOfDay - 12) * (Math.PI / 12);  // -π to π
const elevation = Math.cos(hourAngle) * maxElevation;
sunPosition = [
  Math.cos(hourAngle) * Math.cos(latitude),
  Math.sin(elevation),
  Math.sin(hourAngle) * Math.cos(latitude),
];
```

### Bridge to Existing WeatherSystem

WeatherHubTrait wraps the existing `WeatherSystem` class and adds:
1. Blackboard writes (the system already has the state — just expose it)
2. Day-night cycle (new)
3. Physics coupling parameters (new)
4. CRDT persistence (new)

The existing `WeatherSystem.onChange()` listener wires directly to blackboard updates.

## HoloScript Syntax

```holoscript
world MyWorld {
  @weather {
    day_length_seconds: 600
    start_time: 8
    initial_weather: "clear"
    auto_cycle: true
    wind_physics_scale: 1.5
    persist_to_crdt: true
  }

  object Flag {
    @cloth {
      wind_sensitivity: 2.0    // Reads wind from @weather blackboard
    }
    position: [0, 5, 0]
  }

  object Lake {
    @fluid {
      type: "liquid"
      particle_count: 50000    // Wind creates surface waves via @weather
    }
  }
}
```

## Files Changed

| File | Action |
|------|--------|
| `src/environment/WeatherBlackboard.ts` | **NEW** — Singleton blackboard state |
| `src/traits/WeatherHubTrait.ts` | **NEW** — @weather hub trait handler |
| `src/environment/WeatherSystem.ts` | Add blackboard write in state update |
| `src/traits/ClothTrait.ts` | Add wind force from blackboard (if exists) |
| `src/traits/FluidTrait.ts` | Add wind surface wave force (after MLS-MPM) |
| `src/traits/constants/environment-input.ts` | Add 'weather' to trait list |

## Test Targets

| Test | Target | Method |
|------|--------|--------|
| Blackboard propagation | Changes reach consumers in same frame | Unit test |
| Day-night cycle | Correct sun position over 24h | Unit test: step through 24h of sim time |
| Wind → cloth | Cloth moves when wind blows | Integration test with PBD |
| Rain → friction | Surface friction decreases when wet | Physics integration test |
| CRDT persistence | Weather state survives session restart | Integration with WorldState |

## Dependencies

- TODO-FEAT-001 (PBD solver — for wind → cloth coupling)
- TODO-FEAT-003 (Loro CRDT — for weather persistence)
- Existing: WeatherSystem.ts, ClothTrait.ts

## Risks

1. **Blackboard singleton**: Global mutable state. **Mitigation**: Only @weather writes, all others read. One @weather per world.
2. **Frame ordering**: Consumer traits must read blackboard AFTER @weather updates. **Mitigation**: @weather trait has highest update priority (runs first in trait update loop).
3. **Performance**: 7+ consumer traits reading blackboard each frame. **Mitigation**: Blackboard is a plain object — reads are essentially free.
