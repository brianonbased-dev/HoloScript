# Lesson 3.7: Spatial Context Awareness

In this lesson, you'll learn how to create location-aware agents that understand and respond to spatial context in VR/XR environments.

## Learning Objectives

By the end of this lesson, you will:

- Understand spatial awareness concepts
- Track entities and agents in 3D space
- Create spatial triggers and zones
- Implement location-based agent choreography

## What is Spatial Context?

Spatial context awareness allows agents to understand:

- **Where** they are in a virtual environment
- **What** entities are nearby
- **How** proximity affects their behavior

```
┌─────────────────────────────────────────────────────────────┐
│                    Virtual World                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    Zone A              Zone B              Zone C            │
│   ┌──────────┐       ┌──────────┐       ┌──────────┐        │
│   │          │       │          │       │          │        │
│   │  🤖 ──►  │  ───► │          │  ───► │  🎯      │        │
│   │  Agent   │       │  Trigger │       │  Target  │        │
│   │          │       │    ⚡    │       │          │        │
│   └──────────┘       └──────────┘       └──────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## The SpatialAwareness Trait

Add spatial awareness to any agent:

```holoscript
composition "SpatialAgent" {
  template "AwareAgent" {
    @agent {
      type: "explorer"
      capabilities: ["navigation", "scanning"]
    }

    @spatialAwareness {
      update_frequency: 60          // Hz
      detection_radius: 10          // meters
      track_entities: true
      track_agents: true
      zones: ["safe", "danger", "objective"]
    }

    state {
      position: [0, 0, 0]
      nearby_entities: []
      current_zone: null
    }

    on zoneEnter(zone) {
      if (zone.type == "danger") {
        activateDefenses()
      }
    }

    on entityNearby(entity) {
      if (entity.type == "target") {
        focusOn(entity)
      }
    }
  }

  object "Explorer" using "AwareAgent" {
    position: [0, 1, 0]
  }
}
```

## Programmatic Spatial Tracking

Use TypeScript for advanced spatial logic:

```typescript
import { SpatialContext, SpatialQuery, Entity } from '@holoscript/core';

// Create spatial context
const spatial = new SpatialContext({
  worldBounds: { min: [-100, 0, -100], max: [100, 50, 100] },
  gridSize: 5, // 5m grid cells for efficient queries
  updateRate: 60,
});

// Register an entity
spatial.register({
  id: 'agent-001',
  position: [10, 1, 5],
  rotation: [0, 45, 0],
  bounds: { type: 'sphere', radius: 0.5 },
  metadata: { type: 'agent', team: 'blue' },
});

// Query nearby entities
const nearby = spatial.queryRadius({
  center: [10, 1, 5],
  radius: 15,
  filter: { type: 'agent' },
});

console.log(`Found ${nearby.length} agents within 15m`);
```

## Spatial Zones

Define zones with specific behaviors:

```typescript
import { SpatialZone, ZoneEvent } from '@holoscript/core';

// Create a danger zone
const dangerZone = spatial.createZone({
  id: 'danger-zone-1',
  type: 'danger',
  shape: 'box',
  bounds: {
    min: [20, 0, 20],
    max: [40, 5, 40],
  },
  properties: {
    damagePerSecond: 10,
    warningMessage: 'Entering hazardous area!',
  },
});

// Zone events
dangerZone.on('enter', (entity: Entity) => {
  console.log(`${entity.id} entered danger zone`);
  sendWarning(entity, dangerZone.properties.warningMessage);
});

dangerZone.on('exit', (entity: Entity) => {
  console.log(`${entity.id} left danger zone`);
  clearWarning(entity);
});

dangerZone.on('stay', (entity: Entity, duration: number) => {
  // Apply continuous damage
  applyDamage(entity, dangerZone.properties.damagePerSecond * duration);
});
```

## Proximity Detection

React to entities getting close:

```typescript
import { ProximityDetector, ProximityEvent } from '@holoscript/core';

// Create proximity detector for an agent
const proximity = new ProximityDetector({
  sourceId: 'agent-001',
  layers: [
    { name: 'immediate', radius: 2, priority: 'high' },
    { name: 'nearby', radius: 10, priority: 'medium' },
    { name: 'distant', radius: 50, priority: 'low' },
  ],
});

// Register with spatial context
spatial.addDetector(proximity);

// Handle proximity events
proximity.on('enter', (event: ProximityEvent) => {
  console.log(`${event.entityId} entered ${event.layer} range`);

  if (event.layer === 'immediate' && event.entity.hostile) {
    activateCombatMode();
  }
});

proximity.on('exit', (event: ProximityEvent) => {
  console.log(`${event.entityId} left ${event.layer} range`);
});

// Query current proximities
const immediateThreats = proximity.getEntities('immediate').filter((e) => e.metadata.hostile);
```

## Location-Based Choreography

Assign tasks based on agent location:

```typescript
import { SpatialChoreographer, LocationConstraint } from '@holoscript/core';

// Create spatial choreographer
const choreographer = new SpatialChoreographer(registry, spatial, {
  locationWeight: 0.4, // 40% weight on location in matching
  maxDistance: 100, // Max distance for task assignment
});

// Submit location-aware task
const task = await choreographer.submit({
  type: 'investigate',
  location: [30, 1, 25],
  radius: 5,
  constraints: {
    preferNearby: true,
    maxDistance: 50,
    excludeZones: ['danger'],
  },
  payload: {
    targetId: 'suspicious-object',
    action: 'scan',
  },
});

// Get nearest capable agent
const agent = await choreographer.findNearest({
  location: [30, 1, 25],
  capabilities: ['scanning'],
  available: true,
});

console.log(`Nearest scanner: ${agent.id} at distance ${agent.distance}m`);
```

## Spatial Queries

Perform complex spatial queries:

```typescript
// Ray cast query
const hits = spatial.rayCast({
  origin: [0, 1.6, 0],
  direction: [0, 0, 1],
  maxDistance: 100,
  filter: { type: 'interactable' },
});

// Box query
const inBox = spatial.queryBox({
  min: [10, 0, 10],
  max: [20, 5, 20],
  includePartial: true,
});

// Frustum query (what's visible)
const visible = spatial.queryFrustum({
  position: [0, 1.6, 0],
  forward: [0, 0, 1],
  fov: 90,
  nearPlane: 0.1,
  farPlane: 50,
});

// Path query
const path = spatial.findPath({
  from: [0, 0, 0],
  to: [50, 0, 50],
  avoidZones: ['danger', 'restricted'],
  maxSlope: 30, // degrees
});
```

## Complete Example: Guard Patrol System

```holoscript
composition "SecuritySystem" {
  config {
    spatial: {
      world_bounds: [[-100, 0, -100], [100, 20, 100]]
      grid_size: 5
    }
  }

  // Define patrol zones
  zone "Perimeter" {
    shape: "polygon"
    points: [[-50, -50], [50, -50], [50, 50], [-50, 50]]
    height: 3
    type: "patrol"
  }

  zone "VaultArea" {
    shape: "box"
    bounds: [[0, 0, 0], [10, 3, 10]]
    type: "high-security"
    access_level: "admin"
  }

  zone "Entrance" {
    shape: "sphere"
    center: [-45, 1, 0]
    radius: 5
    type: "checkpoint"
  }

  // Guard agent template
  template "GuardAgent" {
    @agent {
      type: "security"
      capabilities: ["patrol", "investigate", "apprehend"]
    }

    @spatialAwareness {
      detection_radius: 20
      track_entities: true
      alert_on: ["intruder", "suspicious"]
    }

    @patrol {
      route: "perimeter"
      speed: 2
      pause_duration: 5
    }

    state {
      mode: "patrol"
      alert_level: 0
      current_waypoint: 0
    }

    on entityNearby(entity) {
      if (entity.tags.includes("suspicious")) {
        this.state.mode = "investigate"
        investigateTarget(entity)
      }
    }

    on zoneEnter(zone) {
      if (zone.type == "high-security") {
        this.state.alert_level = 2
        scanForThreats()
      }
    }

    action investigateTarget(target) {
      // Move to target
      moveTo(target.position)

      // Scan and assess
      const assessment = await scan(target)

      if (assessment.threat_level > 0.7) {
        broadcast("alerts", {
          type: "threat-detected",
          location: target.position,
          target: target.id
        })
      }
    }
  }

  // Patrol waypoints
  waypoints "perimeter" [
    [-45, 1, -45],
    [45, 1, -45],
    [45, 1, 45],
    [-45, 1, 45]
  ]

  // Instantiate guards
  object "Guard1" using "GuardAgent" {
    position: [-45, 1, 0]
    patrol_start: 0
  }

  object "Guard2" using "GuardAgent" {
    position: [45, 1, 0]
    patrol_start: 2
  }
}
```

## Spatial Events

Listen for spatial events globally:

```typescript
// Global spatial events
spatial.on('entity:moved', (entityId, oldPos, newPos) => {
  // Track movement
});

spatial.on('zone:crowded', (zoneId, count) => {
  if (count > 10) {
    requestReinforcements(zoneId);
  }
});

spatial.on('collision', (entityA, entityB, point) => {
  handleCollision(entityA, entityB, point);
});
```

## Performance Optimization

For large worlds with many entities:

```typescript
const spatial = new SpatialContext({
  // Use spatial partitioning
  partitioning: 'octree',
  maxDepth: 8,

  // Batch updates
  batchUpdates: true,
  updateBatchSize: 100,

  // Level of detail
  lod: {
    immediate: { radius: 10, updateRate: 60 },
    nearby: { radius: 50, updateRate: 30 },
    distant: { radius: 200, updateRate: 10 },
  },

  // Culling
  enableCulling: true,
  cullingMethod: 'frustum',
});
```

## Exercise: Create a Territory Control Game

Build a multi-agent territory game where:

1. Agents claim zones by staying in them
2. Contested zones trigger negotiations
3. Agents coordinate to defend territories
4. Spatial proximity affects influence strength

## Summary

In this lesson you learned:

- **Spatial Context**: Track entities in 3D space
- **Zones**: Define areas with behaviors
- **Proximity**: React to nearby entities
- **Spatial Choreography**: Location-aware task assignment
- **Spatial Queries**: Search by location, ray, frustum

## Next Steps

- [Lesson 3.8: Consensus Mechanisms](./08-consensus.md)
