/**
 * Physics Traits for HoloScript Runtime
 *
 * Implements cloth, soft body, fluid, buoyancy, rope, wind, joint,
 * and enhanced rigidbody simulations using Three.js.
 *
 * @version 3.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';
import { getObjectTraits } from '../runtime-types';

// =============================================================================
// HELPERS
// =============================================================================

/** Simple pseudo-noise for turbulence */
function noise(x: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothNoise(t: number, seed: number): number {
  const floor = Math.floor(t);
  const frac = t - floor;
  const smooth = frac * frac * (3 - 2 * frac);
  return noise(floor, seed) + smooth * (noise(floor + 1, seed) - noise(floor, seed));
}

// =============================================================================
// CLOTH TRAIT - Verlet integration cloth simulation
// =============================================================================

export const ClothTrait: TraitHandler = {
  name: 'cloth',

  onApply(context: TraitContext) {
    const mesh = context.object as THREE.Mesh;
    const cfg = context.config;

    const resolution = (cfg.resolution as number) ?? 20;
    const size = (cfg.size as number) ?? 2;
    const stiffness = (cfg.stiffness as number) ?? 0.9;
    const damping = (cfg.damping as number) ?? 0.01;
    const gravityScale = (cfg.gravity_scale as number) ?? 1.0;
    const windResponse = (cfg.wind_response as number) ?? 0.3;

    // Create cloth plane geometry
    const geometry = new THREE.PlaneGeometry(size, size, resolution - 1, resolution - 1);
    geometry.rotateX(-Math.PI / 2); // Lay flat, then will drape with gravity

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = posAttr.count;

    // Store previous positions for Verlet integration
    const prevPositions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      prevPositions[i] = posAttr.array[i];
    }

    // Pin configuration: pin top row by default
    const pinnedVerts = new Set<number>();
    const pinConfig = cfg.pin_vertices as number[][] | undefined;
    if (pinConfig && pinConfig.length > 0) {
      for (const [row, col] of pinConfig) {
        const idx = row * resolution + col;
        if (idx < count) pinnedVerts.add(idx);
      }
    } else {
      // Default: pin top row corners
      pinnedVerts.add(0);
      pinnedVerts.add(resolution - 1);
    }

    // Build constraints (structural springs)
    const constraints: Array<[number, number, number]> = []; // [a, b, restLength]
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const idx = i * resolution + j;
        // Right neighbor
        if (j < resolution - 1) {
          const right = idx + 1;
          const dx = posAttr.getX(idx) - posAttr.getX(right);
          const dy = posAttr.getY(idx) - posAttr.getY(right);
          const dz = posAttr.getZ(idx) - posAttr.getZ(right);
          constraints.push([idx, right, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
        }
        // Bottom neighbor
        if (i < resolution - 1) {
          const below = idx + resolution;
          const dx = posAttr.getX(idx) - posAttr.getX(below);
          const dy = posAttr.getY(idx) - posAttr.getY(below);
          const dz = posAttr.getZ(idx) - posAttr.getZ(below);
          constraints.push([idx, below, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
        }
      }
    }

    // Replace mesh geometry
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geometry;

    // Make double-sided for cloth
    if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).side !== undefined) {
      (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    }

    context.data.resolution = resolution;
    context.data.prevPositions = prevPositions;
    context.data.pinnedVerts = pinnedVerts;
    context.data.constraints = constraints;
    context.data.stiffness = stiffness;
    context.data.damping = damping;
    context.data.gravityScale = gravityScale;
    context.data.windResponse = windResponse;
    context.data.time = 0;
  },

  onUpdate(context: TraitContext, delta: number) {
    const mesh = context.object as THREE.Mesh;
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;

    const prev = context.data.prevPositions as Float32Array;
    const pinned = context.data.pinnedVerts as Set<number>;
    const constraints = context.data.constraints as Array<[number, number, number]>;
    const stiffness = context.data.stiffness as number;
    const dampingFactor = 1.0 - (context.data.damping as number);
    const gravityScale = context.data.gravityScale as number;
    const windResponse = context.data.windResponse as number;
    context.data.time += delta;

    const count = posAttr.count;
    const gravity = -9.81 * gravityScale * delta * delta;

    // Wind turbulence
    const t = context.data.time as number;
    const windX = smoothNoise(t * 0.5, 0) * windResponse * delta;
    const windZ = smoothNoise(t * 0.7, 1) * windResponse * delta;

    // Verlet integration step
    for (let i = 0; i < count; i++) {
      if (pinned.has(i)) continue;

      const ix = i * 3,
        iy = i * 3 + 1,
        iz = i * 3 + 2;
      const cx = posAttr.array[ix];
      const cy = posAttr.array[iy];
      const cz = posAttr.array[iz];

      const vx = (cx - prev[ix]) * dampingFactor;
      const vy = (cy - prev[iy]) * dampingFactor;
      const vz = (cz - prev[iz]) * dampingFactor;

      prev[ix] = cx;
      prev[iy] = cy;
      prev[iz] = cz;

      (posAttr.array as Float32Array)[ix] = cx + vx + windX;
      (posAttr.array as Float32Array)[iy] = cy + vy + gravity;
      (posAttr.array as Float32Array)[iz] = cz + vz + windZ;
    }

    // Satisfy constraints (multiple iterations for stiffness)
    const iterations = Math.ceil(stiffness * 5);
    for (let iter = 0; iter < iterations; iter++) {
      for (const [a, b, restLen] of constraints) {
        const ax = posAttr.array[a * 3],
          ay = posAttr.array[a * 3 + 1],
          az = posAttr.array[a * 3 + 2];
        const bx = posAttr.array[b * 3],
          by = posAttr.array[b * 3 + 1],
          bz = posAttr.array[b * 3 + 2];

        const dx = bx - ax,
          dy = by - ay,
          dz = bz - az;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.0001) continue;

        const diff = ((dist - restLen) / dist) * 0.5;
        const ox = dx * diff,
          oy = dy * diff,
          oz = dz * diff;

        const aPin = pinned.has(a);
        const bPin = pinned.has(b);

        if (!aPin && !bPin) {
          (posAttr.array as Float32Array)[a * 3] += ox;
          (posAttr.array as Float32Array)[a * 3 + 1] += oy;
          (posAttr.array as Float32Array)[a * 3 + 2] += oz;
          (posAttr.array as Float32Array)[b * 3] -= ox;
          (posAttr.array as Float32Array)[b * 3 + 1] -= oy;
          (posAttr.array as Float32Array)[b * 3 + 2] -= oz;
        } else if (!aPin) {
          (posAttr.array as Float32Array)[a * 3] += ox * 2;
          (posAttr.array as Float32Array)[a * 3 + 1] += oy * 2;
          (posAttr.array as Float32Array)[a * 3 + 2] += oz * 2;
        } else if (!bPin) {
          (posAttr.array as Float32Array)[b * 3] -= ox * 2;
          (posAttr.array as Float32Array)[b * 3 + 1] -= oy * 2;
          (posAttr.array as Float32Array)[b * 3 + 2] -= oz * 2;
        }
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  },

  onRemove(context: TraitContext) {
    context.data.prevPositions = null;
    context.data.constraints = null;
  },
};

// =============================================================================
// SOFT BODY TRAIT - Spring-mass vertex deformation
// =============================================================================

export const SoftBodyTrait: TraitHandler = {
  name: 'soft_body',

  onApply(context: TraitContext) {
    const mesh = context.object as THREE.Mesh;
    const cfg = context.config;

    const stiffness = (cfg.stiffness as number) ?? 0.5;
    const damping = (cfg.damping as number) ?? 0.05;
    const pressure = (cfg.pressure as number) ?? 1.0;

    const geometry = mesh.geometry;
    if (!geometry) return;

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;

    // Store rest positions and velocities
    const count = posAttr.count;
    const restPositions = new Float32Array(posAttr.array);
    const velocities = new Float32Array(count * 3);

    // Build springs from face adjacency
    const springs: Array<[number, number, number]> = [];
    const edgeSet = new Set<string>();
    const index = geometry.getIndex();

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        for (const [v1, v2] of [
          [a, b],
          [b, c],
          [a, c],
        ]) {
          const key = Math.min(v1, v2) + '_' + Math.max(v1, v2);
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            const dx = restPositions[v1 * 3] - restPositions[v2 * 3];
            const dy = restPositions[v1 * 3 + 1] - restPositions[v2 * 3 + 1];
            const dz = restPositions[v1 * 3 + 2] - restPositions[v2 * 3 + 2];
            springs.push([v1, v2, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
          }
        }
      }
    }

    context.data.restPositions = restPositions;
    context.data.velocities = velocities;
    context.data.springs = springs;
    context.data.stiffness = stiffness;
    context.data.damping = damping;
    context.data.pressure = pressure;
  },

  onUpdate(context: TraitContext, delta: number) {
    const mesh = context.object as THREE.Mesh;
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;

    const rest = context.data.restPositions as Float32Array;
    const vel = context.data.velocities as Float32Array;
    const springs = context.data.springs as Array<[number, number, number]>;
    const stiffness = context.data.stiffness as number;
    const damping = context.data.damping as number;
    const pressure = context.data.pressure as number;
    const count = posAttr.count;

    const dt = Math.min(delta, 0.02); // Clamp timestep

    // Spring forces
    for (const [a, b, restLen] of springs) {
      const ax = posAttr.array[a * 3],
        ay = posAttr.array[a * 3 + 1],
        az = posAttr.array[a * 3 + 2];
      const bx = posAttr.array[b * 3],
        by = posAttr.array[b * 3 + 1],
        bz = posAttr.array[b * 3 + 2];
      const dx = bx - ax,
        dy = by - ay,
        dz = bz - az;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.0001) continue;

      const force = (dist - restLen) * stiffness;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      vel[a * 3] += fx * dt;
      vel[a * 3 + 1] += fy * dt;
      vel[a * 3 + 2] += fz * dt;
      vel[b * 3] -= fx * dt;
      vel[b * 3 + 1] -= fy * dt;
      vel[b * 3 + 2] -= fz * dt;
    }

    // Pressure force (push outward from center)
    if (pressure > 0) {
      let cx = 0,
        cy = 0,
        cz = 0;
      for (let i = 0; i < count; i++) {
        cx += posAttr.array[i * 3];
        cy += posAttr.array[i * 3 + 1];
        cz += posAttr.array[i * 3 + 2];
      }
      cx /= count;
      cy /= count;
      cz /= count;

      for (let i = 0; i < count; i++) {
        const dx = posAttr.array[i * 3] - cx;
        const dy = posAttr.array[i * 3 + 1] - cy;
        const dz = posAttr.array[i * 3 + 2] - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.0001) continue;
        const f = pressure * 0.01 * dt;
        vel[i * 3] += (dx / dist) * f;
        vel[i * 3 + 1] += (dy / dist) * f;
        vel[i * 3 + 2] += (dz / dist) * f;
      }
    }

    // Restore force toward rest shape
    for (let i = 0; i < count; i++) {
      const ix = i * 3,
        iy = i * 3 + 1,
        iz = i * 3 + 2;
      vel[ix] += (rest[ix] - posAttr.array[ix]) * stiffness * 0.1 * dt;
      vel[iy] += (rest[iy] - posAttr.array[iy]) * stiffness * 0.1 * dt;
      vel[iz] += (rest[iz] - posAttr.array[iz]) * stiffness * 0.1 * dt;

      // Damping
      vel[ix] *= 1 - damping;
      vel[iy] *= 1 - damping;
      vel[iz] *= 1 - damping;

      // Integrate
      (posAttr.array as Float32Array)[ix] += vel[ix];
      (posAttr.array as Float32Array)[iy] += vel[iy];
      (posAttr.array as Float32Array)[iz] += vel[iz];
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  },

  onRemove(context: TraitContext) {
    // Restore rest positions
    const mesh = context.object as THREE.Mesh;
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const rest = context.data.restPositions as Float32Array;
    if (posAttr && rest) {
      for (let i = 0; i < rest.length; i++) {
        (posAttr.array as Float32Array)[i] = rest[i];
      }
      posAttr.needsUpdate = true;
    }
  },
};

// =============================================================================
// FLUID TRAIT - Particle-based fluid simulation
// =============================================================================

export const FluidTrait: TraitHandler = {
  name: 'fluid',

  onApply(context: TraitContext) {
    const parent = context.object;
    const cfg = context.config;

    const particleCount = (cfg.particle_count as number) ?? 1000;
    const color = (cfg.color as string) ?? '#0088ff';
    const particleSize = (cfg.particle_size as number) ?? 0.05;
    const gravity = (cfg.gravity as number[]) ?? [0, -9.81, 0];
    const viscosity = (cfg.viscosity as number) ?? 0.01;
    const boundsSize = (cfg.bounds_size as number) ?? 2;

    // Create particle buffer geometry
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    // Initialize particles in a cube above the object
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * boundsSize * 0.5;
      positions[i * 3 + 1] = Math.random() * boundsSize * 0.5 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * boundsSize * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size: particleSize,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.name = parent.name + '_fluid';
    parent.add(points);

    context.data.points = points;
    context.data.velocities = velocities;
    context.data.particleCount = particleCount;
    context.data.gravity = gravity;
    context.data.viscosity = viscosity;
    context.data.boundsSize = boundsSize;
    context.data.time = 0;
  },

  onUpdate(context: TraitContext, delta: number) {
    const points = context.data.points as THREE.Points;
    if (!points) return;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const vel = context.data.velocities as Float32Array;
    const grav = context.data.gravity as number[];
    const viscosity = context.data.viscosity as number;
    const bounds = context.data.boundsSize as number;
    const count = context.data.particleCount as number;

    const dt = Math.min(delta, 0.02);
    const halfBounds = bounds * 0.5;

    for (let i = 0; i < count; i++) {
      const ix = i * 3,
        iy = i * 3 + 1,
        iz = i * 3 + 2;

      // Apply gravity
      vel[ix] += grav[0] * dt;
      vel[iy] += grav[1] * dt;
      vel[iz] += grav[2] * dt;

      // Viscosity damping
      vel[ix] *= 1 - viscosity;
      vel[iy] *= 1 - viscosity;
      vel[iz] *= 1 - viscosity;

      // Integrate position
      (posAttr.array as Float32Array)[ix] += vel[ix] * dt;
      (posAttr.array as Float32Array)[iy] += vel[iy] * dt;
      (posAttr.array as Float32Array)[iz] += vel[iz] * dt;

      // Bounce off bounds
      if (posAttr.array[iy] < -halfBounds) {
        (posAttr.array as Float32Array)[iy] = -halfBounds;
        vel[iy] = Math.abs(vel[iy]) * 0.3; // Damped bounce
      }
      for (const [_axis, aix] of [
        [0, ix],
        [2, iz],
      ] as [number, number][]) {
        if (posAttr.array[aix] < -halfBounds) {
          (posAttr.array as Float32Array)[aix] = -halfBounds;
          vel[aix] = Math.abs(vel[aix]) * 0.3;
        } else if (posAttr.array[aix] > halfBounds) {
          (posAttr.array as Float32Array)[aix] = halfBounds;
          vel[aix] = -Math.abs(vel[aix]) * 0.3;
        }
      }
    }

    posAttr.needsUpdate = true;
  },

  onRemove(context: TraitContext) {
    const points = context.data.points as THREE.Points;
    if (points) {
      points.geometry.dispose();
      (points.material as THREE.PointsMaterial).dispose();
      points.parent?.remove(points);
    }
  },
};

// =============================================================================
// BUOYANCY TRAIT - Archimedes' principle
// =============================================================================

export const BuoyancyTrait: TraitHandler = {
  name: 'buoyancy',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.fluidLevel = (cfg.fluid_level as number) ?? 0;
    context.data.fluidDensity = (cfg.fluid_density as number) ?? 1000;
    context.data.objectDensity = (cfg.object_density as number) ?? 500;
    context.data.objectVolume = (cfg.object_volume as number) ?? 1.0;
    context.data.drag = (cfg.drag as number) ?? 1.0;
    context.data.flowDirection = (cfg.flow_direction as number[]) ?? [0, 0, 0];
    context.data.flowStrength = (cfg.flow_strength as number) ?? 0;
    context.data.lastY = context.object.position.y;
    context.data.velocityY = 0;
  },

  onUpdate(context: TraitContext, delta: number) {
    const obj = context.object;
    const fluidLevel = context.data.fluidLevel as number;
    const fluidDensity = context.data.fluidDensity as number;
    const objectDensity = context.data.objectDensity as number;
    const objectVolume = context.data.objectVolume as number;
    const drag = context.data.drag as number;
    const flowDir = context.data.flowDirection as number[];
    const flowStr = context.data.flowStrength as number;

    // Estimate object height from scale
    const objectHeight = obj.scale.y;
    const objectTop = obj.position.y + objectHeight / 2;
    const objectBottom = obj.position.y - objectHeight / 2;

    // Submersion ratio
    let submersion = 0;
    if (objectTop <= fluidLevel) {
      submersion = 1.0;
    } else if (objectBottom < fluidLevel) {
      submersion = (fluidLevel - objectBottom) / objectHeight;
    }

    if (submersion <= 0) {
      // Not in fluid - apply gravity only
      context.data.velocityY = ((context.data.velocityY as number) || 0) - 9.81 * delta;
      obj.position.y += (context.data.velocityY as number) * delta;
      context.data.lastY = obj.position.y;
      return;
    }

    // Buoyancy force (upward): F = ρ_fluid * V_submerged * g
    const buoyancyForce = fluidDensity * objectVolume * submersion * 9.81;
    // Weight: W = ρ_object * V * g
    const weight = objectDensity * objectVolume * 9.81;
    const netForce = buoyancyForce - weight;

    // Track velocity
    const vy = (context.data.velocityY as number) || 0;
    const newVy = vy + (netForce / (objectDensity * objectVolume)) * delta;

    // Apply fluid drag
    const draggedVy = newVy * (1 - drag * submersion * delta);
    context.data.velocityY = draggedVy;

    obj.position.y += draggedVy * delta;

    // Flow current
    if (flowStr > 0 && submersion > 0) {
      obj.position.x += flowDir[0] * flowStr * submersion * delta;
      obj.position.z += flowDir[2] * flowStr * submersion * delta;
    }

    // Bob rotation for realism
    const bobAngle = Math.sin(performance.now() * 0.001 + obj.position.x) * 0.02 * submersion;
    obj.rotation.z = bobAngle;

    context.data.lastY = obj.position.y;
  },

  onRemove(context: TraitContext) {
    context.object.rotation.z = 0;
  },
};

// =============================================================================
// ROPE TRAIT - Verlet chain simulation
// =============================================================================

export const RopeTrait: TraitHandler = {
  name: 'rope',

  onApply(context: TraitContext) {
    const parent = context.object;
    const cfg = context.config;

    const segmentCount = (cfg.segments as number) ?? 20;
    const length = (cfg.length as number) ?? 3;
    const stiffness = (cfg.stiffness as number) ?? 0.9;
    const _damping = (cfg.damping as number) ?? 0.02;
    const _radius = (cfg.radius as number) ?? 0.03;
    const gravityScale = (cfg.gravity_scale as number) ?? 1.0;
    const color = (cfg.color as string) ?? '#886644';

    const segmentLength = length / segmentCount;

    // Initialize positions hanging down from parent
    const positions: THREE.Vector3[] = [];
    const prevPositions: THREE.Vector3[] = [];
    for (let i = 0; i <= segmentCount; i++) {
      const pos = new THREE.Vector3(0, -i * segmentLength, 0);
      positions.push(pos);
      prevPositions.push(pos.clone());
    }

    // Create line geometry for visualization
    const linePositions = new Float32Array((segmentCount + 1) * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      linewidth: 2,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = parent.name + '_rope';

    // Add to scene (not parent, so rope hangs in world space)
    const scene = parent.parent;
    if (scene) {
      scene.add(line);
    } else {
      parent.add(line);
    }

    context.data.positions = positions;
    context.data.prevPositions = prevPositions;
    context.data.segmentCount = segmentCount;
    context.data.segmentLength = segmentLength;
    context.data.stiffness = stiffness;
    context.data.damping = damping;
    context.data.gravityScale = gravityScale;
    context.data.line = line;
    context.data.isWorldSpace = !!scene;
  },

  onUpdate(context: TraitContext, delta: number) {
    const positions = context.data.positions as THREE.Vector3[];
    const prevPositions = context.data.prevPositions as THREE.Vector3[];
    const segmentCount = context.data.segmentCount as number;
    const segmentLength = context.data.segmentLength as number;
    const stiffness = context.data.stiffness as number;
    const dampFactor = 1.0 - (context.data.damping as number);
    const gravityScale = context.data.gravityScale as number;
    const line = context.data.line as THREE.Line;

    const gravity = -9.81 * gravityScale * delta * delta;

    // Pin first segment to parent position
    const worldPos = new THREE.Vector3();
    context.object.getWorldPosition(worldPos);
    positions[0].copy(worldPos);

    // Verlet integration
    for (let i = 1; i <= segmentCount; i++) {
      const pos = positions[i];
      const prev = prevPositions[i];

      const vx = (pos.x - prev.x) * dampFactor;
      const vy = (pos.y - prev.y) * dampFactor;
      const vz = (pos.z - prev.z) * dampFactor;

      prev.copy(pos);

      pos.x += vx;
      pos.y += vy + gravity;
      pos.z += vz;
    }

    // Satisfy distance constraints
    const iterations = Math.ceil(stiffness * 5);
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < segmentCount; i++) {
        const a = positions[i];
        const b = positions[i + 1];

        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.0001) continue;

        const diff = ((dist - segmentLength) / dist) * 0.5;

        if (i === 0) {
          // First is pinned
          b.x -= dx * diff * 2;
          b.y -= dy * diff * 2;
          b.z -= dz * diff * 2;
        } else {
          a.x += dx * diff;
          a.y += dy * diff;
          a.z += dz * diff;
          b.x -= dx * diff;
          b.y -= dy * diff;
          b.z -= dz * diff;
        }
      }
    }

    // Update line geometry
    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= segmentCount; i++) {
      posAttr.setXYZ(i, positions[i].x, positions[i].y, positions[i].z);
    }
    posAttr.needsUpdate = true;
  },

  onRemove(context: TraitContext) {
    const line = context.data.line as THREE.Line;
    if (line) {
      line.geometry.dispose();
      (line.material as THREE.LineBasicMaterial).dispose();
      line.parent?.remove(line);
    }
  },
};

// =============================================================================
// WIND TRAIT - Force field affecting nearby objects
// =============================================================================

export const WindTrait: TraitHandler = {
  name: 'wind',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.direction = (cfg.direction as number[]) ?? [1, 0, 0];
    context.data.strength = (cfg.strength as number) ?? 5;
    context.data.turbulence = (cfg.turbulence as number) ?? 0.3;
    context.data.turbulenceFreq = (cfg.turbulence_frequency as number) ?? 1.0;
    context.data.radius = (cfg.radius as number) ?? 50;
    context.data.gustChance = (cfg.gust_chance as number) ?? 0.01;
    context.data.gustMultiplier = (cfg.gust_multiplier as number) ?? 2.0;
    context.data.gustTimer = 0;
    context.data.time = 0;

    // Visual indicator (optional): add a subtle directional arrow
    if (cfg.show_indicator) {
      const dir = new THREE.Vector3(...(context.data.direction as number[])).normalize();
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), 1, 0x88ccff, 0.3, 0.15);
      arrow.name = context.object.name + '_windArrow';
      context.object.add(arrow);
      context.data.arrow = arrow;
    }
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.time += delta;
    const t = context.data.time as number;

    // Update turbulence
    const turbFreq = context.data.turbulenceFreq as number;
    const turb = context.data.turbulence as number;
    const turbX = smoothNoise(t * turbFreq, 0) * turb;
    const turbY = smoothNoise(t * turbFreq, 1) * turb * 0.5;
    const turbZ = smoothNoise(t * turbFreq, 2) * turb;

    // Handle gusts
    let gustMul = 1.0;
    let gustTimer = context.data.gustTimer as number;
    if (gustTimer > 0) {
      gustTimer -= delta;
      gustMul = context.data.gustMultiplier as number;
    } else if (Math.random() < (context.data.gustChance as number) * delta * 60) {
      gustTimer = 0.5 + Math.random() * 1.5;
      gustMul = context.data.gustMultiplier as number;
    }
    context.data.gustTimer = gustTimer;

    const strength = (context.data.strength as number) * gustMul;
    const dir = context.data.direction as number[];
    const radius = context.data.radius as number;
    const windPos = context.object.position;

    // Apply force to nearby objects that have physics or cloth traits
    const scene = context.object.parent;
    if (!scene) return;

    scene.traverse((child: THREE.Object3D) => {
      if (child === context.object) return;
      const traits = getObjectTraits(child);
      if (!traits) return;

      // Check distance
      const dist = child.position.distanceTo(windPos);
      if (dist > radius) return;

      const falloff = 1 - dist / radius;
      const forceMag = strength * falloff;

      // Apply to cloth trait
      const clothTrait = traits.find((t) => t.name === 'cloth');
      if (clothTrait) {
        // Wind affects cloth via its internal wind response
        // We modify the cloth's position slightly
        child.position.x += (dir[0] + turbX) * forceMag * delta * 0.01;
        child.position.z += (dir[2] + turbZ) * forceMag * delta * 0.01;
      }

      // Apply to objects with physics body
      const body = context.physicsWorld.getBody(child.name);
      if (body) {
        const fx = (dir[0] + turbX) * forceMag * delta;
        const fy = (dir[1] + turbY) * forceMag * delta;
        const fz = (dir[2] + turbZ) * forceMag * delta;
        child.position.x += fx * 0.1;
        child.position.y += fy * 0.1;
        child.position.z += fz * 0.1;
      }
    });
  },

  onRemove(context: TraitContext) {
    const arrow = context.data.arrow as THREE.ArrowHelper | undefined;
    if (arrow) {
      arrow.parent?.remove(arrow);
    }
  },
};

// =============================================================================
// JOINT TRAIT - Constraint between two objects
// =============================================================================

export const JointTrait: TraitHandler = {
  name: 'joint',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.jointType = (cfg.joint_type as string) ?? 'spring';
    context.data.connectedBody = (cfg.connected_body as string) ?? '';
    context.data.stiffness = (cfg.stiffness as number) ?? 100;
    context.data.damping = (cfg.damping as number) ?? 5;
    context.data.restLength = (cfg.rest_length as number) ?? -1; // -1 = auto-detect
    context.data.breakForce = (cfg.break_force as number) ?? Infinity;
    context.data.broken = false;
    context.data.anchorOffset = (cfg.anchor as number[]) ?? [0, 0, 0];
  },

  onUpdate(context: TraitContext, delta: number) {
    if (context.data.broken) return;

    const connectedName = context.data.connectedBody as string;
    if (!connectedName) return;

    // Find connected object in scene
    const scene = context.object.parent;
    if (!scene) return;
    const target = scene.getObjectByName(connectedName);
    if (!target) return;

    const jointType = context.data.jointType as string;
    const stiffness = context.data.stiffness as number;
    const _damping = context.data.damping as number;
    const offset = context.data.anchorOffset as number[];

    const myPos = context.object.position;
    const targetPos = target.position
      .clone()
      .add(new THREE.Vector3(offset[0], offset[1], offset[2]));

    const dx = targetPos.x - myPos.x;
    const dy = targetPos.y - myPos.y;
    const dz = targetPos.z - myPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Auto-detect rest length on first frame
    if (context.data.restLength < 0) {
      context.data.restLength = dist;
    }
    const restLen = context.data.restLength as number;

    if (jointType === 'fixed') {
      // Fixed joint - maintain exact distance
      if (dist > 0.001) {
        const correction = (dist - restLen) / dist;
        myPos.x += dx * correction * 0.5;
        myPos.y += dy * correction * 0.5;
        myPos.z += dz * correction * 0.5;
      }
    } else if (jointType === 'spring' || jointType === 'distance') {
      // Spring joint - Hooke's law
      const displacement = dist - restLen;
      const force = displacement * stiffness * delta;

      if (dist > 0.001) {
        const nx = dx / dist,
          ny = dy / dist,
          nz = dz / dist;
        myPos.x += nx * force * delta;
        myPos.y += ny * force * delta;
        myPos.z += nz * force * delta;
      }

      // Check break force
      const forceAmount = Math.abs(displacement * stiffness);
      if (forceAmount > (context.data.breakForce as number)) {
        context.data.broken = true;
      }
    } else if (jointType === 'hinge') {
      // Hinge: constrain to circular path around target
      if (dist > 0.001) {
        const correction = ((dist - restLen) / dist) * 0.5;
        myPos.x += dx * correction;
        myPos.z += dz * correction;
        // Y is free to rotate
      }
    }
  },

  onRemove() {
    // No cleanup needed
  },
};

// =============================================================================
// RIGIDBODY TRAIT - Enhanced physics body
// =============================================================================

export const RigidbodyTrait: TraitHandler = {
  name: 'rigidbody',

  onApply(context: TraitContext) {
    const mesh = context.object as THREE.Mesh;
    const cfg = context.config;

    const mass = (cfg.mass as number) ?? 1;
    const restitution = (cfg.restitution as number) ?? 0.3;
    const friction = (cfg.friction as number) ?? 0.5;
    const isStatic = (cfg.is_static as boolean) ?? false;
    const useGravity = (cfg.use_gravity as boolean) ?? true;

    // Determine shape from mesh geometry
    const geometry = mesh.geometry;
    let shapeType: 'box' | 'sphere' | 'plane' = 'box';
    if (geometry instanceof THREE.SphereGeometry) {
      shapeType = 'sphere';
    } else if (geometry instanceof THREE.PlaneGeometry) {
      shapeType = 'plane';
    }

    const finalMass = isStatic ? 0 : mass;
    context.physicsWorld.addBody(mesh.name, mesh, shapeType, finalMass);

    context.data.mass = finalMass;
    context.data.restitution = restitution;
    context.data.friction = friction;
    context.data.useGravity = useGravity;
    context.data.velocity = new THREE.Vector3(0, 0, 0);
  },

  onUpdate(context: TraitContext, delta: number) {
    // Physics world handles position sync in its step()
    // We just add gravity if needed and physics world doesn't handle it
    if (context.data.mass === 0) return; // Static

    const useGravity = context.data.useGravity as boolean;
    if (useGravity) {
      const vel = context.data.velocity as THREE.Vector3;
      vel.y -= 9.81 * delta;

      // Simple ground collision
      if (context.object.position.y + vel.y * delta < 0) {
        vel.y *= -(context.data.restitution as number);
        if (Math.abs(vel.y) < 0.1) vel.y = 0;
        context.object.position.y = 0;
      } else {
        context.object.position.y += vel.y * delta;
      }
    }
  },

  onRemove(context: TraitContext) {
    context.physicsWorld.removeBody(context.object.name);
  },
};

// =============================================================================
// DESTRUCTION TRAIT - Break into fragments on impact
// =============================================================================

export const DestructionTrait: TraitHandler = {
  name: 'destruction',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.breakForce = (cfg.break_force as number) ?? 10;
    context.data.fragmentCount = (cfg.fragments as number) ?? 8;
    context.data.fragmentLifetime = (cfg.fragment_lifetime as number) ?? 3;
    context.data.isBroken = false;
    context.data.fragments = [];
    context.data.fragmentTimers = [];
  },

  onUpdate(context: TraitContext, delta: number) {
    if (!context.data.isBroken) return;

    // Update fragment positions (simple gravity)
    const fragments = context.data.fragments as THREE.Mesh[];
    const timers = context.data.fragmentTimers as number[];
    const lifetime = context.data.fragmentLifetime as number;

    for (let i = fragments.length - 1; i >= 0; i--) {
      timers[i] += delta;
      const frag = fragments[i];

      // Apply gravity and spin
      frag.position.y -= 9.81 * delta * delta * 0.5 * timers[i];
      frag.rotation.x += delta * (i + 1) * 0.5;
      frag.rotation.z += delta * (i + 0.5) * 0.3;

      // Fade out
      const fadeRatio = 1 - timers[i] / lifetime;
      if (fadeRatio <= 0) {
        frag.parent?.remove(frag);
        frag.geometry.dispose();
        (frag.material as THREE.Material).dispose();
        fragments.splice(i, 1);
        timers.splice(i, 1);
      } else {
        const mat = frag.material as THREE.MeshStandardMaterial;
        mat.opacity = fadeRatio;
      }
    }
  },

  onRemove(context: TraitContext) {
    const fragments = context.data.fragments as THREE.Mesh[];
    for (const frag of fragments) {
      frag.parent?.remove(frag);
      frag.geometry.dispose();
      (frag.material as THREE.Material).dispose();
    }
  },
};

/**
 * Trigger destruction externally by calling this function
 */
export function triggerDestruction(object: THREE.Object3D): void {
  const traits = getObjectTraits(object);
  if (!traits) return;

  const destructTrait = traits.find((t) => t.name === 'destruction');
  if (!destructTrait || destructTrait.context.data.isBroken) return;

  const ctx = destructTrait.context;
  ctx.data.isBroken = true;

  const mesh = object as THREE.Mesh;
  const scene = mesh.parent;
  if (!scene) return;

  const fragCount = ctx.data.fragmentCount as number;
  const color = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex() ?? 0xffffff;
  const scale = mesh.scale.clone().multiplyScalar(0.3);

  for (let i = 0; i < fragCount; i++) {
    const fragGeom = new THREE.BoxGeometry(
      scale.x * (0.5 + Math.random() * 0.5),
      scale.y * (0.5 + Math.random() * 0.5),
      scale.z * (0.5 + Math.random() * 0.5)
    );
    const fragMat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 1,
    });
    const frag = new THREE.Mesh(fragGeom, fragMat);
    frag.position.copy(mesh.position);
    frag.position.x += (Math.random() - 0.5) * scale.x * 2;
    frag.position.y += (Math.random() - 0.5) * scale.y * 2;
    frag.position.z += (Math.random() - 0.5) * scale.z * 2;

    scene.add(frag);
    (ctx.data.fragments as THREE.Mesh[]).push(frag);
    (ctx.data.fragmentTimers as number[]).push(0);
  }

  // Hide original
  mesh.visible = false;
}
