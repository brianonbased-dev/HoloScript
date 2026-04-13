/**
 * Perception Trait
 *
 * Agent sensory system for awareness with sight, hearing, and memory.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type SenseType = 'sight' | 'hearing' | 'proximity' | 'damage';

interface PerceivedEntity {
  id: string;
  position: [number, number, number];
  lastSeen: number;
  senseType: SenseType;
  confidence: number; // 0-1, decays over time
  threat: number; // Threat level 0-1
  velocity?: { x: number; y: number; z: number };
  tags: string[];
}

interface PerceptionState {
  entities: Map<string, PerceivedEntity>;
  lastUpdate: number;
  alertLevel: number; // 0-1
  isSearching: boolean;
  lastKnownPosition: { x: number; y: number; z: number } | null;
  scanTimer: number;
}

interface PerceptionConfig {
  sight_range: number;
  sight_angle: number; // Degrees
  hearing_range: number;
  memory_duration: number; // ms before forgetting
  detection_layers: string[]; // Tags to detect
  los_check: boolean; // Line of sight raycast
  peripheral_vision: boolean;
  peripheral_range: number; // Multiplier for peripheral
  peripheral_angle: number; // Additional angle for peripheral
  alert_radius: number;
  scan_interval: number; // How often to scan (seconds)
  confidence_decay: number; // Per second
}

// =============================================================================
// HELPERS
// =============================================================================

function distance3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
}

function angleBetween(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  forward: { x: number; z: number }
): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const targetAngle = Math.atan2(dx, dz);
  const forwardAngle = Math.atan2(forward.x, forward.z);

  let diff = targetAngle - forwardAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  return Math.abs(diff) * (180 / Math.PI); // Return degrees
}

// =============================================================================
// HANDLER
// =============================================================================

export const perceptionHandler: TraitHandler<PerceptionConfig> = {
  name: 'perception',

  defaultConfig: {
    sight_range: 20,
    sight_angle: 120,
    hearing_range: 15,
    memory_duration: 10000,
    detection_layers: [],
    los_check: true,
    peripheral_vision: true,
    peripheral_range: 0.5,
    peripheral_angle: 60,
    alert_radius: 5,
    scan_interval: 0.1,
    confidence_decay: 0.2,
  },

  onAttach(node, _config, _context) {
    const state: PerceptionState = {
      entities: new Map(),
      lastUpdate: Date.now(),
      alertLevel: 0,
      isSearching: false,
      lastKnownPosition: null,
      scanTimer: 0,
    };
    node.__perceptionState = state;
  },

  onDetach(node) {
    delete node.__perceptionState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__perceptionState as PerceptionState;
    if (!state) return;

    const now = Date.now();
    const position = node.position || { x: 0, y: 0, z: 0 };
    const rotation = node.rotation || { x: 0, y: 0, z: 0 };
    const forward = {
      x: Math.sin(rotation.y),
      z: Math.cos(rotation.y),
    };

    // Decay confidence and remove forgotten entities
    const toRemove: string[] = [];
    let highestThreat = 0;

    for (const [id, entity] of state.entities) {
      const age = now - entity.lastSeen;

      // Decay confidence
      entity.confidence -= config.confidence_decay * delta;

      // Remove if too old or confidence too low
      if (age > config.memory_duration || entity.confidence <= 0) {
        toRemove.push(id);
        context.emit?.('perception_lost', {
          node,
          entityId: id,
          lastPosition: entity.position,
        });
      } else {
        highestThreat = Math.max(highestThreat, entity.threat * entity.confidence);
      }
    }

    for (const id of toRemove) {
      state.entities.delete(id);
    }

    // Update alert level
    const prevAlert = state.alertLevel;
    state.alertLevel = Math.min(1, highestThreat);

    if (state.alertLevel > 0.5 && prevAlert <= 0.5) {
      context.emit?.('perception_alert', {
        node,
        alertLevel: state.alertLevel,
      });
    } else if (state.alertLevel <= 0.2 && prevAlert > 0.2) {
      context.emit?.('perception_calm', { node });
    }

    // Update last known position for searching
    if (state.entities.size > 0 && state.alertLevel > 0.3) {
      const closest = Array.from(state.entities.values()).sort((a, b) => b.threat - a.threat)[0];
      if (closest) {
        state.lastKnownPosition = { ...closest.position };
      }
    }

    // Periodic scan request
    state.scanTimer += delta;
    if (state.scanTimer >= config.scan_interval) {
      state.scanTimer = 0;

      context.emit?.('perception_scan_request', {
        node,
        position,
        sightRange: config.sight_range,
        hearingRange: config.hearing_range,
        sightAngle: config.sight_angle,
        forward,
        detectionLayers: config.detection_layers,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__perceptionState as PerceptionState;
    if (!state) return;

    const position = node.position || { x: 0, y: 0, z: 0 };
    const rotation = node.rotation || { x: 0, y: 0, z: 0 };
    const forward = {
      x: Math.sin(rotation.y),
      z: Math.cos(rotation.y),
    };

    if (event.type === 'perception_detect') {
      // External system reports a detected entity
      const target = event.target as {
        id: string;
        position: [number, number, number];
        tags?: string[];
        threat?: number;
        velocity?: { x: number; y: number; z: number };
      };

      if (!target?.id) return;

      // Check if in detection layers
      if (config.detection_layers.length > 0) {
        const targetTags = target.tags || [];
        if (!config.detection_layers.some((layer) => targetTags.includes(layer))) {
          return;
        }
      }

      const dist = distance3D(position, target.position);
      const angle = angleBetween(position, target.position, forward);

      let senseType: SenseType = 'proximity';
      let confidence = 1.0;

      // Sight check
      if (dist <= config.sight_range) {
        if (angle <= config.sight_angle / 2) {
          senseType = 'sight';
          confidence = 1.0 - (dist / config.sight_range) * 0.3;
        } else if (
          config.peripheral_vision &&
          angle <= (config.sight_angle + config.peripheral_angle) / 2
        ) {
          senseType = 'sight';
          confidence = 0.5 - (dist / config.sight_range) * 0.2;
        }
      }

      // Hearing check
      if (senseType === 'proximity' && dist <= config.hearing_range) {
        senseType = 'hearing';
        confidence = 0.7 - (dist / config.hearing_range) * 0.3;
      }

      // Close proximity always detected
      if (dist <= config.alert_radius) {
        confidence = 1.0;
      }

      const isNew = !state.entities.has(target.id);

      state.entities.set(target.id, {
        id: target.id,
        position: { ...target.position },
        lastSeen: Date.now(),
        senseType,
        confidence,
        threat: target.threat ?? 0.5,
        velocity: target.velocity,
        tags: target.tags || [],
      });

      if (isNew) {
        context.emit?.('perception_new', {
          node,
          entityId: target.id,
          senseType,
          confidence,
          position: target.position,
        });
      }
    } else if (event.type === 'perception_sound') {
      // Sound event
      const soundPos = event.position as { x: number; y: number; z: number };
      const dist = distance3D(position, soundPos);

      if (dist <= config.hearing_range) {
        const sourceId = (event.sourceId as string) || `sound_${Date.now()}`;

        state.entities.set(sourceId, {
          id: sourceId,
          position: { ...soundPos },
          lastSeen: Date.now(),
          senseType: 'hearing',
          confidence: 0.6 - (dist / config.hearing_range) * 0.3,
          threat: (event.threat as number) ?? 0.3,
          tags: ['sound'],
        });

        context.emit?.('perception_sound_detected', {
          node,
          position: soundPos,
          distance: dist,
        });
      }
    } else if (event.type === 'perception_damage') {
      // Took damage - immediate high-priority perception
      const attackerId = event.attackerId as string;
      const attackerPos = event.position as { x: number; y: number; z: number };

      if (attackerId && attackerPos) {
        state.entities.set(attackerId, {
          id: attackerId,
          position: { ...attackerPos },
          lastSeen: Date.now(),
          senseType: 'damage',
          confidence: 1.0,
          threat: 1.0,
          tags: ['hostile', 'attacker'],
        });

        state.alertLevel = 1.0;
        state.lastKnownPosition = { ...attackerPos };

        context.emit?.('perception_attacked', {
          node,
          attackerId,
          position: attackerPos,
        });
      }
    } else if (event.type === 'perception_forget') {
      const entityId = event.entityId as string;
      state.entities.delete(entityId);
    } else if (event.type === 'perception_clear') {
      state.entities.clear();
      state.alertLevel = 0;
      state.isSearching = false;
      state.lastKnownPosition = null;
    }
  },
};

export default perceptionHandler;
