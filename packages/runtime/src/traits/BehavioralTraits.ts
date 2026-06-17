/**
 * Behavioral Traits — Tier-1 native runtime handlers
 *
 * Implements client-side behavior for the ~17 Tier-1 traits identified in
 * research/2026-06-15_trait-parity-and-tsx-deprecation.md §4.2.
 *
 * Handlers that require server-side inference (ai_companion, ai_npc_brain,
 * llm_agent) provide visual-state scaffolding + event dispatch so the scene
 * reacts locally while the authoritative result arrives from the backend.
 *
 * Handlers for GPU-only paths (gpu_physics, gpu_particle, compute) register
 * a CPU fallback / stub so the trait system doesn't warn on apply, and mark
 * userData so the WebGPU upgrade path can detect and promote them.
 *
 * @version 1.0.0 — 2026-06-17
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';
import { dispatchCustomEvent } from '../runtime-types';

// =============================================================================
// FOLLOW TRAIT — per-frame target-following movement
// =============================================================================

export const FollowTrait: TraitHandler = {
  name: 'follow',

  onApply(context: TraitContext) {
    context.data.speed = (context.config.speed as number) ?? 2.0;
    context.data.minDistance = (context.config.min_distance as number) ?? 1.5;
    context.data.smoothing = (context.config.smoothing as number) ?? 0.1;
    context.data.targetId = (context.config.target as string) ?? null;
    context.data.velocity = new THREE.Vector3();
    context.object.userData.followEnabled = true;
  },

  onUpdate(context: TraitContext, delta: number) {
    const targetId = context.data.targetId as string | null;
    if (!targetId) return;

    // Resolve target from scene — scene must be reachable via object's parent chain
    let scene: THREE.Object3D | null = context.object;
    while (scene && !(scene instanceof THREE.Scene)) {
      scene = scene.parent;
    }
    if (!scene) return;

    const target = (scene as THREE.Scene).getObjectByName(targetId);
    if (!target) return;

    const minDist = context.data.minDistance as number;
    const speed = context.data.speed as number;
    const smoothing = context.data.smoothing as number;

    const dir = new THREE.Vector3().subVectors(target.position, context.object.position);
    const dist = dir.length();

    if (dist <= minDist) return;

    dir.normalize();
    const desired = dir.multiplyScalar(speed);
    const velocity = context.data.velocity as THREE.Vector3;
    velocity.lerp(desired, smoothing);

    context.object.position.addScaledVector(velocity, delta);

    // Face the direction of travel
    if (velocity.lengthSq() > 0.001) {
      const lookTarget = context.object.position.clone().add(velocity);
      context.object.lookAt(lookTarget);
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.followEnabled;
  },
};

// =============================================================================
// ORBIT TRAIT — per-frame orbital motion around a fixed point or target
// =============================================================================

export const OrbitTrait: TraitHandler = {
  name: 'orbit',

  onApply(context: TraitContext) {
    context.data.radius = (context.config.radius as number) ?? 3.0;
    context.data.speed = (context.config.speed as number) ?? 1.0;
    context.data.axis = (context.config.axis as string) ?? 'y';
    context.data.tilt = (context.config.tilt as number) ?? 0;
    context.data.phase = (context.config.phase as number) ?? 0;
    context.data.elapsed = 0;

    // Snap to starting orbital position
    const radius = context.data.radius as number;
    const phase = context.data.phase as number;
    context.data.originX = context.object.position.x - radius * Math.cos(phase);
    context.data.originZ = context.object.position.z - radius * Math.sin(phase);
    context.object.userData.orbiting = true;
  },

  onUpdate(context: TraitContext, delta: number) {
    const elapsed = (context.data.elapsed as number) + delta * (context.data.speed as number);
    context.data.elapsed = elapsed;

    const radius = context.data.radius as number;
    const tilt = context.data.tilt as number;
    const ax = context.data.axis as string;
    const ox = context.data.originX as number;
    const oz = context.data.originZ as number;

    if (ax === 'y') {
      context.object.position.x = ox + radius * Math.cos(elapsed);
      context.object.position.z = oz + radius * Math.sin(elapsed);
      context.object.position.y += Math.sin(elapsed * tilt) * 0.002;
    } else if (ax === 'x') {
      context.object.position.y = radius * Math.sin(elapsed);
      context.object.position.z = oz + radius * Math.cos(elapsed);
    } else {
      // z-axis
      context.object.position.x = ox + radius * Math.cos(elapsed);
      context.object.position.y = radius * Math.sin(elapsed);
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.orbiting;
  },
};

// =============================================================================
// CROWD SIM TRAIT — simplified Reynolds boids flocking per agent
// =============================================================================

export const CrowdSimTrait: TraitHandler = {
  name: 'crowd_sim',

  onApply(context: TraitContext) {
    context.data.maxSpeed = (context.config.max_speed as number) ?? 2.0;
    context.data.separationRadius = (context.config.separation_radius as number) ?? 1.5;
    context.data.cohesionRadius = (context.config.cohesion_radius as number) ?? 6.0;
    context.data.alignmentRadius = (context.config.alignment_radius as number) ?? 4.0;
    context.data.wanderStrength = (context.config.wander_strength as number) ?? 0.5;
    context.data.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      0,
      (Math.random() - 0.5) * 0.5
    );
    context.data.wanderAngle = Math.random() * Math.PI * 2;
    context.object.userData.crowdAgent = true;
  },

  onUpdate(context: TraitContext, delta: number) {
    const obj = context.object;
    const velocity = context.data.velocity as THREE.Vector3;
    const maxSpeed = context.data.maxSpeed as number;
    const sepR = context.data.separationRadius as number;
    const cohR = context.data.cohesionRadius as number;
    const aliR = context.data.alignmentRadius as number;

    const separation = new THREE.Vector3();
    const cohesion = new THREE.Vector3();
    const alignment = new THREE.Vector3();
    let sepCount = 0;
    let cohCount = 0;
    let aliCount = 0;

    // Sample nearby crowd agents from scene if reachable
    let scene: THREE.Object3D | null = obj;
    while (scene && !(scene instanceof THREE.Scene)) scene = scene.parent;
    if (scene) {
      (scene as THREE.Scene).traverse((other) => {
        if (other === obj || !other.userData.crowdAgent) return;
        const dist = obj.position.distanceTo(other.position);
        if (dist < sepR && dist > 0) {
          const away = new THREE.Vector3().subVectors(obj.position, other.position).divideScalar(dist);
          separation.add(away);
          sepCount++;
        }
        if (dist < cohR) {
          cohesion.add(other.position);
          cohCount++;
        }
        if (dist < aliR && (other.userData as Record<string, unknown>).__crowdVelocity) {
          alignment.add((other.userData as Record<string, unknown>).__crowdVelocity as THREE.Vector3);
          aliCount++;
        }
      });
    }

    // Compute steering
    const steering = new THREE.Vector3();

    if (sepCount > 0) {
      separation.divideScalar(sepCount).normalize().multiplyScalar(maxSpeed).sub(velocity);
      steering.addScaledVector(separation, 1.5);
    }
    if (cohCount > 0) {
      cohesion.divideScalar(cohCount).sub(obj.position).normalize().multiplyScalar(maxSpeed).sub(velocity);
      steering.addScaledVector(cohesion, 1.0);
    }
    if (aliCount > 0) {
      alignment.divideScalar(aliCount).normalize().multiplyScalar(maxSpeed).sub(velocity);
      steering.addScaledVector(alignment, 1.0);
    }

    // Wander: add slight random noise to keep agents moving
    const wanderAngle = (context.data.wanderAngle as number) + (Math.random() - 0.5) * 0.3;
    context.data.wanderAngle = wanderAngle;
    const wander = new THREE.Vector3(
      Math.cos(wanderAngle) * (context.data.wanderStrength as number),
      0,
      Math.sin(wanderAngle) * (context.data.wanderStrength as number)
    );
    steering.add(wander);

    velocity.add(steering.multiplyScalar(delta));
    // Clamp to maxSpeed in XZ plane (Y stays controlled)
    const xzSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (xzSpeed > maxSpeed) {
      const scale = maxSpeed / xzSpeed;
      velocity.x *= scale;
      velocity.z *= scale;
    }

    obj.position.addScaledVector(velocity, delta);
    obj.userData.__crowdVelocity = velocity;

    // Face direction of travel
    if (xzSpeed > 0.05) {
      const look = obj.position.clone().add(velocity);
      look.y = obj.position.y;
      obj.lookAt(look);
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.crowdAgent;
    delete (context.object.userData as Record<string, unknown>).__crowdVelocity;
  },
};

// =============================================================================
// CHAIN TRAIT — procedural spring-chain of child segments
// =============================================================================

interface ChainNode {
  position: THREE.Vector3;
  prev: THREE.Vector3;
  mesh: THREE.Mesh;
}

export const ChainTrait: TraitHandler = {
  name: 'chain',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const segments = (cfg.segments as number) ?? 6;
    const length = (cfg.segment_length as number) ?? 0.3;
    const radius = (cfg.radius as number) ?? 0.05;
    const color = (cfg.color as string) ?? '#888888';

    const nodes: ChainNode[] = [];
    const group = new THREE.Group();
    group.name = '__chain_group';

    const geo = new THREE.CylinderGeometry(radius, radius, length, 6);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });

    for (let i = 0; i < segments; i++) {
      const pos = context.object.position.clone();
      pos.y -= i * length;
      const mesh = new THREE.Mesh(geo.clone(), mat);
      mesh.position.copy(pos);
      group.add(mesh);
      nodes.push({ position: pos.clone(), prev: pos.clone(), mesh });
    }

    context.object.parent?.add(group);
    context.data.nodes = nodes;
    context.data.segLength = length;
    context.data.gravity = (cfg.gravity as number) ?? 9.81;
    context.data.damping = (cfg.damping as number) ?? 0.98;
    context.data.group = group;
    context.object.userData.hasChain = true;
  },

  onUpdate(context: TraitContext, delta: number) {
    const nodes = context.data.nodes as ChainNode[];
    if (!nodes || nodes.length === 0) return;

    const segLength = context.data.segLength as number;
    const g = context.data.gravity as number;
    const damp = context.data.damping as number;

    // Pin first node to parent object
    nodes[0].position.copy(context.object.position);

    // Verlet integration per node
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const vel = n.position.clone().sub(n.prev).multiplyScalar(damp);
      n.prev.copy(n.position);
      n.position.add(vel);
      n.position.y -= g * delta * delta;
    }

    // Distance constraint pass
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1];
        const b = nodes[i];
        const diff = b.position.clone().sub(a.position);
        const dist = diff.length();
        if (dist < 0.0001) continue;
        const correction = diff.multiplyScalar((dist - segLength) / dist / 2);
        if (i > 1) a.position.add(correction);
        b.position.sub(correction);
      }
    }

    // Update mesh positions and orientations
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.mesh.position.copy(n.position);
      if (i < nodes.length - 1) {
        const next = nodes[i + 1].position;
        n.mesh.lookAt(next);
        n.mesh.rotateX(Math.PI / 2);
      }
    }
  },

  onRemove(context: TraitContext) {
    const group = context.data.group as THREE.Group | undefined;
    if (group) group.parent?.remove(group);
    delete context.object.userData.hasChain;
  },
};

// =============================================================================
// AI COMPANION TRAIT — visual state + event dispatch (server-authoritative)
// =============================================================================

const AI_COMPANION_STATES = ['idle', 'following', 'interacting', 'thinking'] as const;
type AiCompanionState = (typeof AI_COMPANION_STATES)[number];

export const AiCompanionTrait: TraitHandler = {
  name: 'ai_companion',

  onApply(context: TraitContext) {
    context.data.state = 'idle' as AiCompanionState;
    context.data.thinkTimer = 0;
    context.data.thinkInterval = (context.config.think_interval as number) ?? 3.0;
    context.data.personality = (context.config.personality as string) ?? 'friendly';
    context.object.userData.aiCompanion = true;
    context.object.userData.aiCompanionState = 'idle';
    context.object.userData.aiCompanionPersonality = context.data.personality;

    // Visual state: add a soft emissive pulse to signal presence
    const mesh = context.object as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      context.data.originalEmissive = mat.emissive?.clone() ?? new THREE.Color(0);
      mat.emissiveIntensity = 0.15;
    }

    dispatchCustomEvent(context.object, {
      type: 'ai:companion:ready',
      personality: context.data.personality,
    });
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.thinkTimer = (context.data.thinkTimer as number) + delta;

    if ((context.data.thinkTimer as number) >= (context.data.thinkInterval as number)) {
      context.data.thinkTimer = 0;

      // Cycle state to reflect server inference pulse
      const states = AI_COMPANION_STATES;
      const currentIdx = states.indexOf(context.data.state as AiCompanionState);
      const nextState = currentIdx === 0
        ? ('following' as AiCompanionState)
        : ('idle' as AiCompanionState);
      context.data.state = nextState;
      context.object.userData.aiCompanionState = nextState;

      dispatchCustomEvent(context.object, {
        type: 'ai:companion:tick',
        state: nextState,
        elapsed: context.data.thinkTimer,
      });
    }

    // Subtle emissive pulse to show liveness
    const mesh = context.object as THREE.Mesh;
    if (mesh.isMesh && mesh.material && 'emissiveIntensity' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const t = (context.data.thinkTimer as number) / (context.data.thinkInterval as number);
      mat.emissiveIntensity = 0.1 + 0.12 * Math.sin(t * Math.PI * 2);
    }
  },

  onRemove(context: TraitContext) {
    const mesh = context.object as THREE.Mesh;
    if (mesh.isMesh && mesh.material && 'emissive' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (context.data.originalEmissive) mat.emissive = context.data.originalEmissive as THREE.Color;
      mat.emissiveIntensity = 0;
    }
    delete context.object.userData.aiCompanion;
    delete context.object.userData.aiCompanionState;
  },
};

// =============================================================================
// AI NPC BRAIN TRAIT — state-machine stub + visual indicator
// =============================================================================

const NPC_STATES = ['idle', 'patrol', 'alert', 'engage', 'flee'] as const;
type NpcState = (typeof NPC_STATES)[number];

export const AiNpcBrainTrait: TraitHandler = {
  name: 'ai_npc_brain',

  onApply(context: TraitContext) {
    context.data.state = 'idle' as NpcState;
    context.data.stateTimer = 0;
    context.data.stateDuration = (context.config.state_duration as number) ?? 5.0;
    context.data.aggressionRadius = (context.config.aggression_radius as number) ?? 8.0;
    context.data.fleeRadius = (context.config.flee_radius as number) ?? 2.0;
    context.object.userData.npcBrain = true;
    context.object.userData.npcState = 'idle';

    dispatchCustomEvent(context.object, {
      type: 'npc:brain:ready',
      state: 'idle',
      config: context.config,
    });
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.stateTimer = (context.data.stateTimer as number) + delta;

    if ((context.data.stateTimer as number) >= (context.data.stateDuration as number)) {
      context.data.stateTimer = 0;

      // Simple state transition: idle -> patrol -> idle cycle locally
      // (server-side LLM inference may override via event)
      const current = context.data.state as NpcState;
      const next: NpcState = current === 'idle' ? 'patrol' : 'idle';
      context.data.state = next;
      context.object.userData.npcState = next;

      dispatchCustomEvent(context.object, { type: 'npc:brain:state', from: current, to: next });
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.npcBrain;
    delete context.object.userData.npcState;
  },
};

// =============================================================================
// LLM AGENT TRAIT — thinking indicator + event dispatch for server inference
// =============================================================================

export const LlmAgentTrait: TraitHandler = {
  name: 'llm_agent',

  onApply(context: TraitContext) {
    context.data.model = (context.config.model as string) ?? 'auto';
    context.data.isThinking = false;
    context.data.thinkPhase = 0;
    context.data.pendingPrompt = null;
    context.object.userData.llmAgent = true;
    context.object.userData.llmModel = context.data.model;
    context.object.userData.llmThinking = false;

    dispatchCustomEvent(context.object, { type: 'llm:agent:ready', model: context.data.model });
  },

  onUpdate(context: TraitContext, delta: number) {
    const isThinking = context.object.userData.llmThinking as boolean;

    if (isThinking) {
      // Animate a "thinking" pulse — rapid emissive flicker
      context.data.thinkPhase = ((context.data.thinkPhase as number) + delta * 4) % (Math.PI * 2);
      const mesh = context.object as THREE.Mesh;
      if (mesh.isMesh && mesh.material && 'emissiveIntensity' in mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.05 + 0.25 * Math.abs(Math.sin(context.data.thinkPhase as number));
      }
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.llmAgent;
    delete context.object.userData.llmModel;
    delete context.object.userData.llmThinking;
  },
};

// =============================================================================
// GPU PARTICLE TRAIT — CPU fallback particle system (promotes to GPU when available)
// =============================================================================

export const GpuParticleTrait: TraitHandler = {
  name: 'gpu_particle',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const count = (cfg.count as number) ?? 200;
    const spread = (cfg.spread as number) ?? 2.0;
    const size = (cfg.size as number) ?? 0.05;
    const color = (cfg.color as string) ?? '#ffaa00';
    const lifetime = (cfg.lifetime as number) ?? 2.0;

    // CPU particle geometry
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count);

    const geo = new THREE.BufferGeometry();

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      velocities[i * 3] = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = Math.random() * 1.5 + 0.5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      ages[i] = Math.random() * lifetime;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.8 });
    const points = new THREE.Points(geo, mat);
    points.name = '__gpu_particle_fallback';
    context.object.add(points);

    context.data.points = points;
    context.data.velocities = velocities;
    context.data.ages = ages;
    context.data.lifetime = lifetime;
    context.data.count = count;
    context.data.spread = spread;
    context.data.gpuReady = false;
    context.object.userData.gpuParticle = true;
    context.object.userData.gpuParticleUpgradePending = true;
  },

  onUpdate(context: TraitContext, delta: number) {
    const points = context.data.points as THREE.Points;
    const velocities = context.data.velocities as Float32Array;
    const ages = context.data.ages as Float32Array;
    const lifetime = context.data.lifetime as number;
    const spread = context.data.spread as number;
    const count = context.data.count as number;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      ages[i] += delta;
      if (ages[i] > lifetime) {
        // Respawn
        ages[i] = 0;
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
        velocities[i * 3] = (Math.random() - 0.5) * 0.5;
        velocities[i * 3 + 1] = Math.random() * 1.5 + 0.5;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      } else {
        positions[i * 3] += velocities[i * 3] * delta;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
        velocities[i * 3 + 1] -= 2.0 * delta; // gravity
      }
    }
    posAttr.needsUpdate = true;
  },

  onRemove(context: TraitContext) {
    const points = context.data.points as THREE.Points | undefined;
    if (points) {
      context.object.remove(points);
      points.geometry.dispose();
    }
    delete context.object.userData.gpuParticle;
    delete context.object.userData.gpuParticleUpgradePending;
  },
};

// =============================================================================
// GPU PHYSICS TRAIT — marks object for GPU physics; falls back to PhysicsWorld
// =============================================================================

export const GpuPhysicsTrait: TraitHandler = {
  name: 'gpu_physics',

  onApply(context: TraitContext) {
    const shapeType =
      (context.config.shape as 'box' | 'sphere' | 'plane') ?? 'box';
    const mass = (context.config.mass as number) ?? 1.0;

    // Register with existing PhysicsWorld as CPU fallback
    context.physicsWorld.addBody(context.object.name, context.object, shapeType, mass);
    context.data.shapeType = shapeType;
    context.data.mass = mass;
    context.object.userData.gpuPhysics = true;
    context.object.userData.gpuPhysicsUpgradePending = true;

    dispatchCustomEvent(context.object, {
      type: 'gpu:physics:ready',
      fallback: 'cpu',
      shape: shapeType,
      mass,
    });
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.gpuPhysics;
    delete context.object.userData.gpuPhysicsUpgradePending;
  },
};

// =============================================================================
// DEFORMABLE TERRAIN TRAIT — simplified vertex displacement on plane mesh
// =============================================================================

export const DeformableTerrainTrait: TraitHandler = {
  name: 'deformable_terrain',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.resolution = (cfg.resolution as number) ?? 32;
    context.data.maxDepth = (cfg.max_depth as number) ?? 1.0;
    context.data.stiffness = (cfg.stiffness as number) ?? 0.5;
    context.data.impacts = [] as Array<{ x: number; z: number; depth: number; radius: number }>;

    const mesh = context.object as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Ensure geometry has enough segments for deformation
    const geo = mesh.geometry;
    if (!geo.hasAttribute('position')) return;

    // Store original y-positions for reset
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    context.data.originalY = new Float32Array(posAttr.array as Float32Array);
    context.object.userData.deformableTerrain = true;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const mesh = context.object as THREE.Mesh;
    if (!mesh.isMesh) return;

    const impacts = context.data.impacts as Array<{
      x: number;
      z: number;
      depth: number;
      radius: number;
    }>;
    if (impacts.length === 0) return;

    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const originalY = context.data.originalY as Float32Array;
    const maxDepth = context.data.maxDepth as number;
    const stiffness = context.data.stiffness as number;

    for (let i = 0; i < posAttr.count; i++) {
      const vx = positions[i * 3];
      const vz = positions[i * 3 + 2];
      let displacement = 0;

      for (const impact of impacts) {
        const dx = vx - impact.x;
        const dz = vz - impact.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < impact.radius) {
          const t = 1 - dist / impact.radius;
          displacement -= impact.depth * t * t;
        }
      }

      const targetY = originalY[i * 3 + 1] + Math.max(-maxDepth, displacement);
      positions[i * 3 + 1] += (targetY - positions[i * 3 + 1]) * stiffness;
    }

    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  },

  onRemove(context: TraitContext) {
    // Restore original geometry
    const mesh = context.object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const originalY = context.data.originalY as Float32Array | undefined;
    if (originalY) {
      for (let i = 0; i < posAttr.count; i++) {
        positions[i * 3 + 1] = originalY[i * 3 + 1];
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }
    delete context.object.userData.deformableTerrain;
  },
};

// =============================================================================
// SOFT BODY PRO TRAIT — extended soft body (delegates to PhysicsWorld + config)
// =============================================================================

export const SoftBodyProTrait: TraitHandler = {
  name: 'soft_body_pro',

  onApply(context: TraitContext) {
    const cfg = context.config;
    // Map to existing PhysicsWorld body with soft body parameters
    const mass = (cfg.mass as number) ?? 1.0;
    context.physicsWorld.addBody(context.object.name, context.object, 'sphere', mass);
    context.data.pressure = (cfg.pressure as number) ?? 200;
    context.data.volume = (cfg.volume as number) ?? 1.0;
    context.data.damping = (cfg.damping as number) ?? 0.1;
    context.data.drag = (cfg.drag as number) ?? 0.01;
    context.data.lift = (cfg.lift as number) ?? 0.003;
    context.object.userData.softBodyPro = true;
    context.object.userData.softBodyPressure = context.data.pressure;
  },

  onUpdate(_context: TraitContext, _delta: number) {
    // Physics simulation driven by PhysicsWorld step.
    // Advanced pressure/volume model requires Ammo.js btSoftBody upgrade;
    // userData flags signal the upgrade path.
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.softBodyPro;
    delete context.object.userData.softBodyPressure;
  },
};

// =============================================================================
// COMPUTE TRAIT — WebGPU compute stub; fires event with buffer reference
// =============================================================================

export const ComputeTrait: TraitHandler = {
  name: 'compute',

  onApply(context: TraitContext) {
    context.data.shader = (context.config.shader as string) ?? null;
    context.data.workgroups = (context.config.workgroups as [number, number, number]) ?? [1, 1, 1];
    context.data.interval = (context.config.interval as number) ?? 0; // 0 = every frame
    context.data.elapsed = 0;
    context.object.userData.computeShader = context.data.shader;
    context.object.userData.computeWorkgroups = context.data.workgroups;
    context.object.userData.computePending = true;

    dispatchCustomEvent(context.object, {
      type: 'gpu:compute:ready',
      shader: context.data.shader,
      workgroups: context.data.workgroups,
    });
  },

  onUpdate(context: TraitContext, delta: number) {
    const interval = context.data.interval as number;
    if (interval > 0) {
      context.data.elapsed = (context.data.elapsed as number) + delta;
      if ((context.data.elapsed as number) < interval) return;
      context.data.elapsed = 0;
    }

    // Signal external WebGPU handler (if wired) to run the compute pass
    dispatchCustomEvent(context.object, {
      type: 'gpu:compute:dispatch',
      shader: context.data.shader,
      workgroups: context.data.workgroups,
      delta,
    });
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.computeShader;
    delete context.object.userData.computeWorkgroups;
    delete context.object.userData.computePending;
  },
};

// =============================================================================
// OBJECT TRACKING TRAIT — AR object tracking annotation + XR ready marker
// =============================================================================

export const ObjectTrackingTrait: TraitHandler = {
  name: 'object_tracking',

  onApply(context: TraitContext) {
    context.data.trackingTarget = (context.config.target as string) ?? null;
    context.data.confidence = 0;
    context.data.isTracked = false;
    context.object.userData.objectTracking = true;
    context.object.userData.objectTrackingTarget = context.data.trackingTarget;
    context.object.userData.objectTrackingConfidence = 0;

    dispatchCustomEvent(context.object, {
      type: 'ar:tracking:ready',
      target: context.data.trackingTarget,
    });
  },

  onUpdate(context: TraitContext, _delta: number) {
    // XR session handles actual tracking; we relay the state from userData
    const confidence = (context.object.userData.objectTrackingConfidence as number) ?? 0;
    const wasTracked = context.data.isTracked as boolean;
    const isTracked = confidence > 0.5;

    if (isTracked !== wasTracked) {
      context.data.isTracked = isTracked;
      dispatchCustomEvent(context.object, {
        type: isTracked ? 'ar:tracking:acquired' : 'ar:tracking:lost',
        confidence,
      });
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.objectTracking;
    delete context.object.userData.objectTrackingTarget;
    delete context.object.userData.objectTrackingConfidence;
  },
};

// =============================================================================
// SENSOR TRAIT — IoT data feed polling stub
// =============================================================================

export const SensorTrait: TraitHandler = {
  name: 'sensor',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.sensorId = (cfg.sensor_id as string) ?? null;
    context.data.pollInterval = (cfg.poll_interval as number) ?? 1.0;
    context.data.elapsed = 0;
    context.data.lastValue = null;
    context.data.sensorType = (cfg.sensor_type as string) ?? 'generic';
    context.object.userData.sensor = true;
    context.object.userData.sensorId = context.data.sensorId;
    context.object.userData.sensorType = context.data.sensorType;

    dispatchCustomEvent(context.object, {
      type: 'sensor:ready',
      id: context.data.sensorId,
      sensorType: context.data.sensorType,
    });
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.elapsed = (context.data.elapsed as number) + delta;

    if ((context.data.elapsed as number) >= (context.data.pollInterval as number)) {
      context.data.elapsed = 0;
      // Signal external IoT bridge to push latest reading
      dispatchCustomEvent(context.object, {
        type: 'sensor:poll',
        id: context.data.sensorId,
        sensorType: context.data.sensorType,
        lastValue: context.data.lastValue,
      });
    }

    // Accept incoming sensor value from scene event system
    const incoming = context.object.userData.sensorIncoming;
    if (incoming !== undefined) {
      if (incoming !== context.data.lastValue) {
        context.data.lastValue = incoming;
        dispatchCustomEvent(context.object, {
          type: 'sensor:value',
          id: context.data.sensorId,
          value: incoming,
        });
      }
      delete context.object.userData.sensorIncoming;
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.sensor;
    delete context.object.userData.sensorId;
    delete context.object.userData.sensorType;
    delete context.object.userData.sensorIncoming;
  },
};

// =============================================================================
// DIGITAL TWIN TRAIT — IoT pairing annotation + sync interval
// =============================================================================

export const DigitalTwinTrait: TraitHandler = {
  name: 'digital_twin',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.deviceId = (cfg.device_id as string) ?? null;
    context.data.syncInterval = (cfg.sync_interval as number) ?? 5.0;
    context.data.elapsed = 0;
    context.data.lastSync = null;
    context.object.userData.digitalTwin = true;
    context.object.userData.digitalTwinDeviceId = context.data.deviceId;
    context.object.userData.digitalTwinSynced = false;

    dispatchCustomEvent(context.object, {
      type: 'twin:ready',
      deviceId: context.data.deviceId,
    });
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.elapsed = (context.data.elapsed as number) + delta;

    if ((context.data.elapsed as number) >= (context.data.syncInterval as number)) {
      context.data.elapsed = 0;
      dispatchCustomEvent(context.object, {
        type: 'twin:sync',
        deviceId: context.data.deviceId,
        position: context.object.position.toArray(),
        rotation: context.object.rotation.toArray(),
      });
    }

    // Accept incoming twin state
    const incomingState = context.object.userData.twinIncomingState as
      | Record<string, unknown>
      | undefined;
    if (incomingState) {
      if (incomingState.position) {
        const p = incomingState.position as [number, number, number];
        context.object.position.set(p[0], p[1], p[2]);
      }
      context.data.lastSync = Date.now();
      context.object.userData.digitalTwinSynced = true;
      delete context.object.userData.twinIncomingState;

      dispatchCustomEvent(context.object, {
        type: 'twin:updated',
        deviceId: context.data.deviceId,
        state: incomingState,
      });
    }
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.digitalTwin;
    delete context.object.userData.digitalTwinDeviceId;
    delete context.object.userData.digitalTwinSynced;
  },
};
