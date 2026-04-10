/**
 * Extended Traits for HoloScript Runtime
 *
 * VR interaction extensions (rotatable, stackable, snappable, breakable),
 * character/spatial traits (character, patrol, networked, anchor),
 * and audio traits (spatial_audio, reverb_zone, voice_proximity).
 *
 * @version 3.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';
import { getObjectTraits } from '../runtime-types';

// =============================================================================
// VR INTERACTION: ROTATABLE
// =============================================================================

export const RotatableTrait: TraitHandler = {
  name: 'rotatable',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.speed = (cfg.speed as number) ?? 1.0;
    context.data.axis = (cfg.axis as string) ?? 'y';
    context.data.snap = (cfg.snap_angle as number) ?? 0; // 0 = free rotation
    context.data.isRotating = false;
    context.data.startAngle = 0;
  },

  onUpdate(context: TraitContext, delta: number) {
    // Auto-rotation when not being interacted with
    if (context.data.isRotating) return;

    const autoRotate = context.config.auto_rotate as boolean | undefined;
    if (autoRotate) {
      const speed = context.data.speed as number;
      const axis = context.data.axis as string;
      if (axis === 'x') context.object.rotation.x += speed * delta;
      else if (axis === 'z') context.object.rotation.z += speed * delta;
      else context.object.rotation.y += speed * delta;
    }
  },

  onRemove() {},
};

// =============================================================================
// VR INTERACTION: STACKABLE
// =============================================================================

export const StackableTrait: TraitHandler = {
  name: 'stackable',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.snapDistance = (cfg.snap_distance as number) ?? 0.3;
    context.data.stackOffset = (cfg.stack_offset as number) ?? 0; // Auto if 0
    context.data.maxStack = (cfg.max_stack as number) ?? 10;
    context.data.stackedOn = null;
    context.data.stackedCount = 0;
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (context.data.stackedOn) return; // Already stacked

    const obj = context.object;
    const snapDist = context.data.snapDistance as number;
    const scene = obj.parent;
    if (!scene) return;

    // Find stackable objects below
    scene.traverse((child: THREE.Object3D) => {
      if (child === obj) return;
      const traits = getObjectTraits(child);
      if (!traits) return;
      const stackTrait = traits.find((t) => t.name === 'stackable');
      if (!stackTrait) return;

      // Check if directly above
      const dx = Math.abs(obj.position.x - child.position.x);
      const dz = Math.abs(obj.position.z - child.position.z);
      const dy = obj.position.y - child.position.y;

      if (dx < snapDist && dz < snapDist && dy > 0 && dy < snapDist * 3) {
        const count = stackTrait.context.data.stackedCount as number;
        const maxStack = stackTrait.context.data.maxStack as number;
        if (count < maxStack) {
          // Snap to top
          const offset = (context.data.stackOffset as number) || child.scale.y;
          obj.position.x = child.position.x;
          obj.position.y = child.position.y + offset;
          obj.position.z = child.position.z;
          context.data.stackedOn = child.name;
          stackTrait.context.data.stackedCount = count + 1;
        }
      }
    });
  },

  onRemove() {},
};

// =============================================================================
// VR INTERACTION: SNAPPABLE
// =============================================================================

export const SnappableTrait: TraitHandler = {
  name: 'snappable',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.gridSize = (cfg.grid_size as number) ?? 0.5;
    context.data.snapPoints = (cfg.snap_points as number[][]) ?? [];
    context.data.snapDistance = (cfg.snap_distance as number) ?? 0.3;
    context.data.snapRotation = (cfg.snap_rotation as boolean) ?? false;
    context.data.rotationSnap = (cfg.rotation_snap as number) ?? 45; // degrees
    context.data.isSnapped = false;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const obj = context.object;
    const grid = context.data.gridSize as number;
    const snapPoints = context.data.snapPoints as number[][];
    const snapDist = context.data.snapDistance as number;

    // Check custom snap points first
    if (snapPoints.length > 0) {
      let closestDist = Infinity;
      let closestPoint: number[] | null = null;

      for (const pt of snapPoints) {
        const dx = obj.position.x - pt[0];
        const dy = obj.position.y - (pt[1] ?? obj.position.y);
        const dz = obj.position.z - pt[2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < closestDist && d < snapDist) {
          closestDist = d;
          closestPoint = pt;
        }
      }

      if (closestPoint) {
        obj.position.x = closestPoint[0];
        obj.position.y = closestPoint[1] ?? obj.position.y;
        obj.position.z = closestPoint[2];
        context.data.isSnapped = true;
        return;
      }
    }

    // Grid snapping: snap when close to grid intersection
    if (grid > 0) {
      const snappedX = Math.round(obj.position.x / grid) * grid;
      const snappedZ = Math.round(obj.position.z / grid) * grid;
      const dx = Math.abs(obj.position.x - snappedX);
      const dz = Math.abs(obj.position.z - snappedZ);

      if (dx < snapDist && dz < snapDist) {
        obj.position.x = snappedX;
        obj.position.z = snappedZ;
        context.data.isSnapped = true;
      } else {
        context.data.isSnapped = false;
      }
    }

    // Rotation snapping
    if (context.data.snapRotation) {
      const snapAngle = (context.data.rotationSnap as number) * (Math.PI / 180);
      obj.rotation.y = Math.round(obj.rotation.y / snapAngle) * snapAngle;
    }
  },

  onRemove() {},
};

// =============================================================================
// VR INTERACTION: BREAKABLE
// =============================================================================

export const BreakableTrait: TraitHandler = {
  name: 'breakable',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.breakForce = (cfg.break_force as number) ?? 5;
    context.data.fragments = (cfg.fragments as number) ?? 6;
    context.data.fragmentLifetime = (cfg.fragment_lifetime as number) ?? 4;
    context.data.isBroken = false;
    context.data.fragmentMeshes = [];
    context.data.fragmentVelocities = [];
    context.data.fragmentTimers = [];
    context.data.lastPos = context.object.position.clone();
    context.data.velocity = new THREE.Vector3();
  },

  onUpdate(context: TraitContext, delta: number) {
    const obj = context.object;

    if (!context.data.isBroken) {
      // Track velocity for impact detection
      const lastPos = context.data.lastPos as THREE.Vector3;
      const vel = context.data.velocity as THREE.Vector3;
      vel.set(
        (obj.position.x - lastPos.x) / delta,
        (obj.position.y - lastPos.y) / delta,
        (obj.position.z - lastPos.z) / delta
      );
      lastPos.copy(obj.position);

      // Check if impacted ground or another object
      if (obj.position.y <= 0 && vel.length() > (context.data.breakForce as number)) {
        breakObject(context);
      }
      return;
    }

    // Update fragments
    const meshes = context.data.fragmentMeshes as THREE.Mesh[];
    const velocities = context.data.fragmentVelocities as THREE.Vector3[];
    const timers = context.data.fragmentTimers as number[];
    const lifetime = context.data.fragmentLifetime as number;

    for (let i = meshes.length - 1; i >= 0; i--) {
      timers[i] += delta;
      velocities[i].y -= 9.81 * delta;
      meshes[i].position.add(velocities[i].clone().multiplyScalar(delta));
      meshes[i].rotation.x += delta * 2;
      meshes[i].rotation.z += delta * 1.5;

      // Ground collision
      if (meshes[i].position.y < 0) {
        meshes[i].position.y = 0;
        velocities[i].y = Math.abs(velocities[i].y) * 0.2;
        velocities[i].x *= 0.8;
        velocities[i].z *= 0.8;
      }

      // Fade and remove
      const fade = 1 - timers[i] / lifetime;
      if (fade <= 0) {
        meshes[i].parent?.remove(meshes[i]);
        meshes[i].geometry.dispose();
        (meshes[i].material as THREE.Material).dispose();
        meshes.splice(i, 1);
        velocities.splice(i, 1);
        timers.splice(i, 1);
      } else {
        (meshes[i].material as THREE.MeshStandardMaterial).opacity = fade;
      }
    }
  },

  onRemove(context: TraitContext) {
    const meshes = context.data.fragmentMeshes as THREE.Mesh[];
    for (const m of meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  },
};

function breakObject(context: TraitContext): void {
  context.data.isBroken = true;
  const mesh = context.object as THREE.Mesh;
  const scene = mesh.parent;
  if (!scene) return;

  const count = context.data.fragments as number;
  const color = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex() ?? 0xaaaaaa;
  const s = mesh.scale;

  for (let i = 0; i < count; i++) {
    const size = 0.15 + Math.random() * 0.25;
    const fGeom = new THREE.BoxGeometry(s.x * size, s.y * size, s.z * size);
    const fMat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 1,
      roughness: 0.8,
    });
    const frag = new THREE.Mesh(fGeom, fMat);
    frag.position.copy(mesh.position);
    frag.position.x += (Math.random() - 0.5) * s.x;
    frag.position.y += Math.random() * s.y * 0.5;
    frag.position.z += (Math.random() - 0.5) * s.z;

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      Math.random() * 4 + 1,
      (Math.random() - 0.5) * 3
    );

    scene.add(frag);
    (context.data.fragmentMeshes as THREE.Mesh[]).push(frag);
    (context.data.fragmentVelocities as THREE.Vector3[]).push(vel);
    (context.data.fragmentTimers as number[]).push(0);
  }

  mesh.visible = false;
}

// =============================================================================
// CHARACTER TRAIT - Basic character controller
// =============================================================================

export const CharacterTrait: TraitHandler = {
  name: 'character',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.speed = (cfg.speed as number) ?? 3;
    context.data.jumpForce = (cfg.jump_force as number) ?? 5;
    context.data.gravity = (cfg.gravity as number) ?? -9.81;
    context.data.groundLevel = (cfg.ground_level as number) ?? 0;
    context.data.velocityY = 0;
    context.data.isGrounded = true;
    context.data.keys = { w: false, a: false, s: false, d: false, space: false };

    // Add keyboard listeners
    const onKeyDown = (e: Event) => {
      const key = (e as KeyboardEvent).key.toLowerCase();
      const keys = context.data.keys as Record<string, boolean>;
      if (key in keys) keys[key] = true;
      if (key === ' ') keys.space = true;
    };
    const onKeyUp = (e: Event) => {
      const key = (e as KeyboardEvent).key.toLowerCase();
      const keys = context.data.keys as Record<string, boolean>;
      if (key in keys) keys[key] = false;
      if (key === ' ') keys.space = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    context.data._onKeyDown = onKeyDown;
    context.data._onKeyUp = onKeyUp;
  },

  onUpdate(context: TraitContext, delta: number) {
    const obj = context.object;
    const speed = context.data.speed as number;
    const keys = context.data.keys as Record<string, boolean>;
    const groundLevel = context.data.groundLevel as number;

    // Horizontal movement
    const moveX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const moveZ = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      obj.position.x += (moveX / len) * speed * delta;
      obj.position.z += (moveZ / len) * speed * delta;
    }

    // Jump
    if (keys.space && context.data.isGrounded) {
      context.data.velocityY = context.data.jumpForce as number;
      context.data.isGrounded = false;
    }

    // Gravity
    let vy = context.data.velocityY as number;
    vy += (context.data.gravity as number) * delta;
    obj.position.y += vy * delta;

    // Ground collision
    if (obj.position.y <= groundLevel) {
      obj.position.y = groundLevel;
      vy = 0;
      context.data.isGrounded = true;
    }
    context.data.velocityY = vy;
  },

  onRemove(context: TraitContext) {
    window.removeEventListener('keydown', context.data._onKeyDown as EventListener);
    window.removeEventListener('keyup', context.data._onKeyUp as EventListener);
  },
};

// =============================================================================
// PATROL TRAIT - Waypoint-based movement
// =============================================================================

export const PatrolTrait: TraitHandler = {
  name: 'patrol',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const waypoints = (cfg.waypoints as number[][]) ?? [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
      [0, 0, 2],
    ];
    context.data.waypoints = waypoints.map((w) => new THREE.Vector3(w[0], w[1] ?? 0, w[2] ?? 0));
    context.data.speed = (cfg.speed as number) ?? 1;
    context.data.currentIndex = 0;
    context.data.loop = (cfg.loop as boolean) ?? true;
    context.data.pauseTime = (cfg.pause_time as number) ?? 0;
    context.data.pauseTimer = 0;
    context.data.lookAtTarget = (cfg.look_at_target as boolean) ?? true;
    context.data.done = false;
  },

  onUpdate(context: TraitContext, delta: number) {
    if (context.data.done) return;

    const waypoints = context.data.waypoints as THREE.Vector3[];
    if (waypoints.length === 0) return;

    // Handle pause at waypoint
    if ((context.data.pauseTimer as number) > 0) {
      context.data.pauseTimer = (context.data.pauseTimer as number) - delta;
      return;
    }

    const obj = context.object;
    const speed = context.data.speed as number;
    const idx = context.data.currentIndex as number;
    const target = waypoints[idx];

    const dx = target.x - obj.position.x;
    const dy = target.y - obj.position.y;
    const dz = target.z - obj.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.15) {
      // Reached waypoint
      context.data.pauseTimer = context.data.pauseTime as number;
      const nextIdx = idx + 1;

      if (nextIdx >= waypoints.length) {
        if (context.data.loop) {
          context.data.currentIndex = 0;
        } else {
          context.data.done = true;
        }
      } else {
        context.data.currentIndex = nextIdx;
      }
    } else {
      // Move toward target
      const step = Math.min(speed * delta, dist);
      obj.position.x += (dx / dist) * step;
      obj.position.y += (dy / dist) * step;
      obj.position.z += (dz / dist) * step;

      // Face movement direction
      if (context.data.lookAtTarget) {
        obj.lookAt(target.x, obj.position.y, target.z);
      }
    }
  },

  onRemove() {},
};

// =============================================================================
// NETWORKED TRAIT - Network synchronization
// =============================================================================

export const NetworkedTrait: TraitHandler = {
  name: 'networked',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.syncRate = (cfg.sync_rate as number) ?? 10; // Hz
    context.data.interpolate = (cfg.interpolate as boolean) ?? true;
    context.data.ownership = (cfg.ownership as string) ?? 'server';
    context.data.lastSync = 0;
    context.data.syncTimer = 0;
  },

  onUpdate(context: TraitContext, delta: number) {
    // Network sync: send/receive position updates when transport is connected
    context.data.syncTimer = (context.data.syncTimer as number) + delta;
    const interval = 1.0 / (context.data.syncRate as number);

    if ((context.data.syncTimer as number) >= interval) {
      context.data.syncTimer = 0;
      // Would send: { position, rotation, scale, state } over WebSocket/WebRTC
    }
  },

  onRemove() {},
};

// =============================================================================
// ANCHOR TRAIT - Spatial anchor for AR
// =============================================================================

export const AnchorTrait: TraitHandler = {
  name: 'anchor',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.anchorType = (cfg.type as string) ?? 'world'; // world, surface, semantic
    context.data.persistent = (cfg.persistent as boolean) ?? false;
    context.data.trackingState = 'tracking';

    // Lock position as anchor point
    context.data.anchorPosition = context.object.position.clone();
    context.data.anchorRotation = context.object.quaternion.clone();
  },

  onUpdate(context: TraitContext, _delta: number) {
    // In AR mode, this would query the XR anchor system
    // In web mode, just maintain the anchored position
    if (context.data.trackingState === 'tracking') {
      const anchorPos = context.data.anchorPosition as THREE.Vector3;
      const anchorRot = context.data.anchorRotation as THREE.Quaternion;
      context.object.position.copy(anchorPos);
      context.object.quaternion.copy(anchorRot);
    }
  },

  onRemove() {},
};

// =============================================================================
// SPATIAL AUDIO TRAIT - Positional audio source
// =============================================================================

export const SpatialAudioTrait: TraitHandler = {
  name: 'spatial_audio',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.src = (cfg.src as string) ?? '';
    context.data.volume = (cfg.volume as number) ?? 1.0;
    context.data.refDistance = (cfg.ref_distance as number) ?? 1;
    context.data.maxDistance = (cfg.max_distance as number) ?? 50;
    context.data.rolloff = (cfg.rolloff as string) ?? 'inverse'; // inverse, linear, exponential
    context.data.loop = (cfg.loop as boolean) ?? true;
    context.data.autoplay = (cfg.autoplay as boolean) ?? false;
    context.data.listener = null;
    context.data.audio = null;

    // Create AudioListener and PositionalAudio if source provided
    if (context.data.src && typeof AudioContext !== 'undefined') {
      try {
        const listener = new THREE.AudioListener();
        // Attach listener to camera (will be found by scene traversal)
        const scene = context.object.parent;
        if (scene) {
          scene.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Camera).isCamera) {
              child.add(listener);
            }
          });
        }

        const audio = new THREE.PositionalAudio(listener);
        audio.setRefDistance(context.data.refDistance as number);
        audio.setMaxDistance(context.data.maxDistance as number);
        audio.setLoop(context.data.loop as boolean);
        audio.setVolume(context.data.volume as number);

        const distanceModel = context.data.rolloff as string;
        if (distanceModel === 'linear') audio.setDistanceModel('linear');
        else if (distanceModel === 'exponential') audio.setDistanceModel('exponential');
        else audio.setDistanceModel('inverse');

        context.object.add(audio);
        context.data.audio = audio;
        context.data.listener = listener;

        // Load audio file
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
          context.data.src as string,
          (buffer) => {
            audio.setBuffer(buffer);
            if (context.data.autoplay) {
              audio.play();
            }
          },
          undefined,
          (err) => console.warn(`[HoloScript] Failed to load audio: ${context.data.src}`, err)
        );
      } catch (e) {
        console.warn('[HoloScript] Spatial audio not available:', e);
      }
    }
  },

  onUpdate(_context: TraitContext, _delta: number) {
    // Positional audio updates automatically with Three.js
  },

  onRemove(context: TraitContext) {
    const audio = context.data.audio as THREE.PositionalAudio | null;
    if (audio) {
      if (audio.isPlaying) audio.stop();
      audio.parent?.remove(audio);
    }
    const listener = context.data.listener as THREE.AudioListener | null;
    if (listener) {
      listener.parent?.remove(listener);
    }
  },
};

// =============================================================================
// REVERB ZONE TRAIT - Audio reverb area
// =============================================================================

export const ReverbZoneTrait: TraitHandler = {
  name: 'reverb_zone',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.radius = (cfg.radius as number) ?? 5;
    context.data.reverbType = (cfg.type as string) ?? 'hall'; // hall, room, cave, outdoor
    context.data.wetLevel = (cfg.wet_level as number) ?? 0.5;
    context.data.dryLevel = (cfg.dry_level as number) ?? 1.0;
    context.data.decay = (cfg.decay as number) ?? 2.0;

    // Create visual indicator in debug mode
    if (cfg.show_bounds) {
      const sphereGeom = new THREE.SphereGeometry(context.data.radius as number, 16, 8);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.05,
        wireframe: true,
      });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.name = context.object.name + '_reverbBounds';
      context.object.add(sphere);
      context.data.boundsVisual = sphere;
    }
  },

  onUpdate(_context: TraitContext, _delta: number) {
    // Reverb zones affect audio sources within their radius
    // In a full implementation, this would query AudioContext convolver nodes
  },

  onRemove(context: TraitContext) {
    const visual = context.data.boundsVisual as THREE.Mesh | undefined;
    if (visual) {
      visual.geometry.dispose();
      (visual.material as THREE.Material).dispose();
      visual.parent?.remove(visual);
    }
  },
};

// =============================================================================
// VOICE PROXIMITY TRAIT - Distance-based voice attenuation
// =============================================================================

export const VoiceProximityTrait: TraitHandler = {
  name: 'voice_proximity',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.nearDistance = (cfg.near_distance as number) ?? 2;
    context.data.farDistance = (cfg.far_distance as number) ?? 15;
    context.data.minVolume = (cfg.min_volume as number) ?? 0;
    context.data.maxVolume = (cfg.max_volume as number) ?? 1;
    context.data.falloff = (cfg.falloff as string) ?? 'linear'; // linear, exponential
  },

  onUpdate(_context: TraitContext, _delta: number) {
    // In a real implementation, this would calculate distance to local player
    // and adjust voice chat volume accordingly via WebRTC gainNode
  },

  onRemove() {},
};
