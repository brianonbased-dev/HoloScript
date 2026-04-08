import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';
import { dispatchCustomEvent } from '../runtime-types';

// ============================================================================
// Grabbable Trait
// ============================================================================

export const GrabbableTrait: TraitHandler = {
  name: 'grabbable',
  onApply: (context: TraitContext) => {
    context.object.userData.grabbable = true;
    context.data.originalMass = null;
    context.data.wasKinematic = false;

    if (context.config.snapToHand) {
      context.object.userData.snapToHand = true;
    }

    // Store grip offset
    context.data.gripOffset = context.config.gripOffset || { x: 0, y: 0, z: 0 };
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    const isHeld = context.object.userData.isHeld;
    const body = context.physicsWorld.getBody(context.object.name);

    if (isHeld && body) {
      // Store original mass on first grab
      if (context.data.originalMass === null) {
        context.data.originalMass = body.mass;
        context.data.wasKinematic = body.type === 4; // KINEMATIC
      }

      // Make kinematic while held
      context.physicsWorld.setKinematic(context.object.name, true);
      context.physicsWorld.setVelocity(context.object.name, [0, 0, 0]);

      // Sync physics to visual
      context.physicsWorld.setPosition(context.object.name, [
        context.object.position.x,
        context.object.position.y,
        context.object.position.z,
      ]);
      context.physicsWorld.setRotation(context.object.name, [
        context.object.quaternion.x,
        context.object.quaternion.y,
        context.object.quaternion.z,
        context.object.quaternion.w,
      ]);
    } else if (!isHeld && context.data.originalMass !== null && body) {
      // Restore physics on release
      if (!context.data.wasKinematic) {
        context.physicsWorld.setKinematic(context.object.name, false);
        // @ts-expect-error - TS2345 structural type mismatch
        context.physicsWorld.setMass(context.object.name, context.data.originalMass);
        context.physicsWorld.wakeUp(context.object.name);
      }
      context.data.originalMass = null;
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.grabbable = false;
  },
};

// ============================================================================
// Throwable Trait
// ============================================================================

export const ThrowableTrait: TraitHandler = {
  name: 'throwable',
  onApply: (context: TraitContext) => {
    context.object.userData.throwable = true;
    context.data.velocityHistory = [];
    context.data.maxThrowSpeed = context.config.maxSpeed || 20;
    context.data.velocityScale = context.config.velocityScale || 1.5;
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    if (context.object.userData.isHeld) {
      // Track position history for velocity calculation
      const history = context.data.velocityHistory;
      // @ts-expect-error - TS18046 structural type mismatch
      history.push({
        pos: context.object.position.clone(),
        time: performance.now(),
      });
      // @ts-expect-error - TS18046 structural type mismatch
      if (history.length > 10) history.shift();
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.throwable = false;
  },
};

// Helper to calculate throw velocity on release
export function calculateThrowVelocity(context: TraitContext): [number, number, number] {
  const history = context.data.velocityHistory || [];
  // @ts-expect-error - TS2339 structural type mismatch
  if (history.length < 2) return [0, 0, 0];

  // @ts-expect-error - TS2339 structural type mismatch
  const recent = history.slice(-3);
  let vx = 0,
    vy = 0,
    vz = 0;

  for (let i = 1; i < recent.length; i++) {
    const dt = (recent[i].time - recent[i - 1].time) / 1000;
    if (dt > 0) {
      vx += (recent[i].pos.x - recent[i - 1].pos.x) / dt;
      vy += (recent[i].pos.y - recent[i - 1].pos.y) / dt;
      vz += (recent[i].pos.z - recent[i - 1].pos.z) / dt;
    }
  }

  const count = recent.length - 1;
  // @ts-expect-error - TS2363 structural type mismatch
  vx = (vx / count) * (context.data.velocityScale || 1.5);
  // @ts-expect-error - TS2363 structural type mismatch
  vy = (vy / count) * (context.data.velocityScale || 1.5);
  // @ts-expect-error - TS2363 structural type mismatch
  vz = (vz / count) * (context.data.velocityScale || 1.5);

  // Clamp to max speed
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const maxSpeed = context.data.maxThrowSpeed || 20;
  // @ts-expect-error - TS2365 structural type mismatch
  if (speed > maxSpeed) {
    // @ts-expect-error - TS2362 structural type mismatch
    const scale = maxSpeed / speed;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }

  return [vx, vy, vz];
}

// ============================================================================
// Collidable Trait
// ============================================================================

export const CollidableTrait: TraitHandler = {
  name: 'collidable',
  onApply: (context: TraitContext) => {
    context.object.userData.collidable = true;
    context.data.collisionCallbacks = [];

    // Subscribe to collision events
    const unsubscribe = context.physicsWorld.onCollision(context.object.name, (event) => {
      // Store collision for access
      context.object.userData.lastCollision = event;

      // Call registered callbacks
      // @ts-expect-error - TS18046 structural type mismatch
      for (const cb of context.data.collisionCallbacks) {
        cb(event);
      }

      // Dispatch custom event on the object (cast to any for custom event types)
      dispatchCustomEvent(context.object, { type: event.type, event });
    });

    context.data.unsubscribeCollision = unsubscribe;
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.collidable = false;
    if (context.data.unsubscribeCollision) {
      // @ts-expect-error - TS2349 structural type mismatch
      context.data.unsubscribeCollision();
    }
  },
};

// ============================================================================
// Physics Trait (adds rigidbody to object)
// ============================================================================

export const PhysicsTrait: TraitHandler = {
  name: 'physics',
  onApply: (context: TraitContext) => {
    const config = context.config;

    // Add physics body with configuration
    context.physicsWorld.addBodyWithConfig(context.object.name, context.object, {
      // @ts-expect-error - TS2322 structural type mismatch
      mass: config.mass ?? 1,
      type: config.static ? 'static' : config.kinematic ? 'kinematic' : 'dynamic',
      // @ts-expect-error - TS2322 structural type mismatch
      shape: config.shape || 'box',
      // @ts-expect-error - TS2322 structural type mismatch
      friction: config.friction ?? 0.3,
      // @ts-expect-error - TS2322 structural type mismatch
      restitution: config.bounciness ?? config.restitution ?? 0.3,
      // @ts-expect-error - TS2322 structural type mismatch
      linearDamping: config.drag ?? config.linearDamping ?? 0.01,
      // @ts-expect-error - TS2322 structural type mismatch
      angularDamping: config.angularDrag ?? config.angularDamping ?? 0.01,
      // @ts-expect-error - TS2322 structural type mismatch
      isTrigger: config.isTrigger ?? false,
      // @ts-expect-error - TS2322 structural type mismatch
      fixedRotation: config.fixedRotation ?? false,
    });

    // Apply initial velocity if specified
    if (config.velocity) {
      // @ts-expect-error - TS2345 structural type mismatch
      context.physicsWorld.setVelocity(context.object.name, config.velocity);
    }

    context.object.userData.hasPhysics = true;
  },
  onRemove: (context: TraitContext) => {
    context.physicsWorld.removeBody(context.object.name);
    context.object.userData.hasPhysics = false;
  },
};

// ============================================================================
// Gravity Trait (simplified physics with just gravity)
// ============================================================================

export const GravityTrait: TraitHandler = {
  name: 'gravity',
  onApply: (context: TraitContext) => {
    const mass = context.config.mass ?? 1;
    context.physicsWorld.addBodyWithConfig(context.object.name, context.object, {
      // @ts-expect-error - TS2322 structural type mismatch
      mass,
      type: 'dynamic',
      shape: 'box',
    });
    context.object.userData.hasGravity = true;
  },
  onRemove: (context: TraitContext) => {
    context.physicsWorld.removeBody(context.object.name);
    context.object.userData.hasGravity = false;
  },
};

// ============================================================================
// Trigger Trait (non-physical collision zone)
// ============================================================================

export const TriggerTrait: TraitHandler = {
  name: 'trigger',
  onApply: (context: TraitContext) => {
    context.physicsWorld.addBodyWithConfig(context.object.name, context.object, {
      mass: 0,
      type: 'static',
      // @ts-expect-error - TS2322 structural type mismatch
      shape: context.config.shape || 'box',
      isTrigger: true,
    });

    context.object.userData.isTrigger = true;
    context.data.enterCallbacks = [];
    context.data.exitCallbacks = [];

    // Subscribe to trigger events
    const unsubscribe = context.physicsWorld.onCollision(context.object.name, (event) => {
      if (event.type === 'trigger-enter') {
        // @ts-expect-error - TS18046 structural type mismatch
        for (const cb of context.data.enterCallbacks) cb(event);
        dispatchCustomEvent(context.object, { type: 'triggerEnter', event });
      } else if (event.type === 'trigger-exit') {
        // @ts-expect-error - TS18046 structural type mismatch
        for (const cb of context.data.exitCallbacks) cb(event);
        dispatchCustomEvent(context.object, { type: 'triggerExit', event });
      }
    });

    context.data.unsubscribe = unsubscribe;
  },
  onRemove: (context: TraitContext) => {
    context.physicsWorld.removeBody(context.object.name);
    context.object.userData.isTrigger = false;
    // @ts-expect-error - TS2349 structural type mismatch
    if (context.data.unsubscribe) context.data.unsubscribe();
  },
};

// ============================================================================
// Pointable Trait
// ============================================================================

export const PointableTrait: TraitHandler = {
  name: 'pointable',
  onApply: (context: TraitContext) => {
    context.object.userData.pointable = true;
    context.object.userData.isPointed = false;
    context.data.highlightColor = context.config.highlightColor || 0x4488ff;
    context.data.originalEmissive = null;
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    const mesh = context.object as THREE.Mesh;
    if (mesh.material && 'emissive' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (context.object.userData.isPointed) {
        if (context.data.originalEmissive === null) {
          context.data.originalEmissive = mat.emissive.getHex();
        }
        // @ts-expect-error - TS2345 structural type mismatch
        mat.emissive.setHex(context.data.highlightColor);
      } else if (context.data.originalEmissive !== null) {
        // @ts-expect-error - TS2345 structural type mismatch
        mat.emissive.setHex(context.data.originalEmissive);
        context.data.originalEmissive = null;
      }
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.pointable = false;
  },
};

// ============================================================================
// Hoverable Trait
// ============================================================================

export const HoverableTrait: TraitHandler = {
  name: 'hoverable',
  onApply: (context: TraitContext) => {
    context.object.userData.hoverable = true;
    context.object.userData.isHovered = false;
    context.data.hoverScale = context.config.hoverScale || 1.1;
    context.data.originalScale = context.object.scale.clone();
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const targetScale = context.object.userData.isHovered ? context.data.hoverScale : 1.0;
    const origScale = context.data.originalScale;

    // Smooth scale transition
    // @ts-expect-error - TS18046 structural type mismatch
    const currentScale = context.object.scale.x / origScale.x;
    // @ts-expect-error - TS2345 structural type mismatch
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 10);
    context.object.scale.set(
      // @ts-expect-error - TS18046 structural type mismatch
      origScale.x * newScale,
      // @ts-expect-error - TS18046 structural type mismatch
      origScale.y * newScale,
      // @ts-expect-error - TS18046 structural type mismatch
      origScale.z * newScale
    );
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.hoverable = false;
    const orig = context.data.originalScale;
    // @ts-expect-error - TS2345 structural type mismatch
    if (orig) context.object.scale.copy(orig);
  },
};

// ============================================================================
// Clickable Trait
// ============================================================================

export const ClickableTrait: TraitHandler = {
  name: 'clickable',
  onApply: (context: TraitContext) => {
    context.object.userData.clickable = true;
    context.data.onClick = context.config.onClick || null;
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.clickable = false;
  },
};

// ============================================================================
// Draggable Trait
// ============================================================================

export const DraggableTrait: TraitHandler = {
  name: 'draggable',
  onApply: (context: TraitContext) => {
    context.object.userData.draggable = true;
    context.data.dragPlane = context.config.plane || 'xz'; // xz, xy, or yz
    context.data.isDragging = false;
    context.data.dragOffset = new THREE.Vector3();
  },
  onUpdate: (_context: TraitContext, _delta: number) => {
    // Drag logic handled by InputManager
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.draggable = false;
  },
};

// ============================================================================
// Scalable Trait (two-handed scaling)
// ============================================================================

export const ScalableTrait: TraitHandler = {
  name: 'scalable',
  onApply: (context: TraitContext) => {
    context.object.userData.scalable = true;
    context.data.minScale = context.config.minScale || 0.1;
    context.data.maxScale = context.config.maxScale || 10;
    context.data.isScaling = false;
    context.data.initialDistance = 0;
    context.data.initialScale = 1;
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    // Two-handed scaling logic
    if (context.data.isScaling && context.data.hands) {
      const hands = context.data.hands;
      // @ts-expect-error - TS2339 structural type mismatch
      const currentDistance = hands.left.position.distanceTo(hands.right.position);
      // @ts-expect-error - TS18046 structural type mismatch
      const scaleFactor = currentDistance / context.data.initialDistance;
      const newScale = THREE.MathUtils.clamp(
        // @ts-expect-error - TS18046 structural type mismatch
        context.data.initialScale * scaleFactor,
        // @ts-expect-error - TS2345 structural type mismatch
        context.data.minScale,
        context.data.maxScale
      );
      context.object.scale.setScalar(newScale);
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.scalable = false;
  },
};

// ============================================================================
// Glowing Trait (emissive material effect)
// ============================================================================

export const GlowingTrait: TraitHandler = {
  name: 'glowing',
  onApply: (context: TraitContext) => {
    const mesh = context.object as THREE.Mesh;
    context.data.intensity = context.config.intensity ?? 0.5;
    context.data.color = context.config.color || null;
    context.data.pulse = context.config.pulse ?? false;
    context.data.pulseSpeed = context.config.pulseSpeed ?? 2;
    context.data.originalEmissive = null;
    context.data.originalIntensity = 0;
    context.data.time = 0;

    if (mesh.material && 'emissive' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      context.data.originalEmissive = mat.emissive.clone();
      context.data.originalIntensity = mat.emissiveIntensity;

      if (context.data.color) {
        // @ts-expect-error - TS2345 structural type mismatch
        mat.emissive = new THREE.Color(context.data.color);
      } else {
        mat.emissive = mat.color.clone();
      }
      // @ts-expect-error - TS2322 structural type mismatch
      mat.emissiveIntensity = context.data.intensity;
    }
  },
  onUpdate: (context: TraitContext, delta: number) => {
    if (!context.data.pulse) return;

    const mesh = context.object as THREE.Mesh;
    if (mesh.material && 'emissiveIntensity' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      // @ts-expect-error - TS18046 structural type mismatch
      context.data.time += delta * context.data.pulseSpeed;
      // @ts-expect-error - TS2345 structural type mismatch
      const pulse = (Math.sin(context.data.time) + 1) / 2;
      // @ts-expect-error - TS18046 structural type mismatch
      mat.emissiveIntensity = context.data.intensity * (0.5 + pulse * 0.5);
    }
  },
  onRemove: (context: TraitContext) => {
    const mesh = context.object as THREE.Mesh;
    if (mesh.material && 'emissive' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (context.data.originalEmissive) {
        // @ts-expect-error - TS2740 structural type mismatch
        mat.emissive = context.data.originalEmissive;
        // @ts-expect-error - TS2322 structural type mismatch
        mat.emissiveIntensity = context.data.originalIntensity;
      }
    }
  },
};

// ============================================================================
// Transparent Trait (adjustable opacity)
// ============================================================================

export const TransparentTrait: TraitHandler = {
  name: 'transparent',
  onApply: (context: TraitContext) => {
    const mesh = context.object as THREE.Mesh;
    context.data.opacity = context.config.opacity ?? 0.5;
    context.data.fadeIn = context.config.fadeIn ?? false;
    context.data.fadeOut = context.config.fadeOut ?? false;
    context.data.fadeDuration = context.config.fadeDuration ?? 1;
    context.data.fadeProgress = 0;
    context.data.originalOpacity = 1;

    if (mesh.material && 'opacity' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      context.data.originalOpacity = mat.opacity;
      mat.transparent = true;
      // @ts-expect-error - TS2322 structural type mismatch
      mat.opacity = context.data.fadeIn ? 0 : context.data.opacity;
    }
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const mesh = context.object as THREE.Mesh;
    if (!mesh.material || !('opacity' in mesh.material)) return;

    const mat = mesh.material as THREE.MeshStandardMaterial;

    // @ts-expect-error - TS18046 structural type mismatch
    if (context.data.fadeIn && context.data.fadeProgress < 1) {
      // @ts-expect-error - TS18046 structural type mismatch
      context.data.fadeProgress += delta / context.data.fadeDuration;
      // @ts-expect-error - TS2345 structural type mismatch
      mat.opacity = THREE.MathUtils.lerp(0, context.data.opacity, context.data.fadeProgress);
    }
  },
  onRemove: (context: TraitContext) => {
    const mesh = context.object as THREE.Mesh;
    if (mesh.material && 'opacity' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      // @ts-expect-error - TS2322 structural type mismatch
      mat.opacity = context.data.originalOpacity;
    }
  },
};

// ============================================================================
// Spinning Trait (continuous rotation)
// ============================================================================

export const SpinningTrait: TraitHandler = {
  name: 'spinning',
  onApply: (context: TraitContext) => {
    context.data.axis = context.config.axis || 'y';
    context.data.speed = context.config.speed ?? 1; // Radians per second
    context.data.oscillate = context.config.oscillate ?? false;
    context.data.angle = context.config.angle ?? Math.PI / 4;
    context.data.time = 0;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const obj = context.object;
    const axis = context.data.axis;

    if (context.data.oscillate) {
      // @ts-expect-error - TS18046 structural type mismatch
      context.data.time += delta * context.data.speed;
      // @ts-expect-error - TS2345 structural type mismatch
      const rotation = Math.sin(context.data.time) * context.data.angle;
      if (axis === 'x') obj.rotation.x = rotation;
      else if (axis === 'y') obj.rotation.y = rotation;
      else if (axis === 'z') obj.rotation.z = rotation;
    } else {
      // @ts-expect-error - TS18046 structural type mismatch
      const rotAmount = delta * context.data.speed;
      if (axis === 'x') obj.rotation.x += rotAmount;
      else if (axis === 'y') obj.rotation.y += rotAmount;
      else if (axis === 'z') obj.rotation.z += rotAmount;
    }
  },
  onRemove: () => {},
};

// ============================================================================
// Floating Trait (bobbing up and down)
// ============================================================================

export const FloatingTrait: TraitHandler = {
  name: 'floating',
  onApply: (context: TraitContext) => {
    context.data.amplitude = context.config.amplitude ?? 0.2;
    context.data.speed = context.config.speed ?? 1;
    context.data.time = context.config.offset ?? Math.random() * Math.PI * 2;
    context.data.baseY = context.object.position.y;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    // @ts-expect-error - TS18046 structural type mismatch
    context.data.time += delta * context.data.speed;
    // @ts-expect-error - TS2345 structural type mismatch
    const offset = Math.sin(context.data.time) * context.data.amplitude;
    // @ts-expect-error - TS18046 structural type mismatch
    context.object.position.y = context.data.baseY + offset;
  },
  onRemove: (context: TraitContext) => {
    // @ts-expect-error - TS2322 structural type mismatch
    context.object.position.y = context.data.baseY;
  },
};

// ============================================================================
// Billboard Trait (always faces camera)
// ============================================================================

export const BillboardTrait: TraitHandler = {
  name: 'billboard',
  onApply: (context: TraitContext) => {
    context.data.lockY = context.config.lockY ?? true; // Lock vertical axis
    context.object.userData.billboard = true;
  },
  onUpdate: (_context: TraitContext, _delta: number) => {
    // Billboard update handled by InputManager camera reference
    // This is a marker trait - actual billboarding done in render loop
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.billboard = false;
  },
};

// ============================================================================
// Pulse Trait (scale pulsing)
// ============================================================================

export const PulseTrait: TraitHandler = {
  name: 'pulse',
  onApply: (context: TraitContext) => {
    context.data.minScale = context.config.minScale ?? 0.9;
    context.data.maxScale = context.config.maxScale ?? 1.1;
    context.data.speed = context.config.speed ?? 2;
    context.data.time = 0;
    context.data.originalScale = context.object.scale.clone();
  },
  onUpdate: (context: TraitContext, delta: number) => {
    // @ts-expect-error - TS18046 structural type mismatch
    context.data.time += delta * context.data.speed;
    // @ts-expect-error - TS2345 structural type mismatch
    const t = (Math.sin(context.data.time) + 1) / 2;
    // @ts-expect-error - TS2345 structural type mismatch
    const scale = THREE.MathUtils.lerp(context.data.minScale, context.data.maxScale, t);
    const orig = context.data.originalScale;
    // @ts-expect-error - TS18046 structural type mismatch
    context.object.scale.set(orig.x * scale, orig.y * scale, orig.z * scale);
  },
  onRemove: (context: TraitContext) => {
    const orig = context.data.originalScale;
    // @ts-expect-error - TS2345 structural type mismatch
    if (orig) context.object.scale.copy(orig);
  },
};

// ============================================================================
// Animated Trait (plays model animations)
// ============================================================================

export const AnimatedTrait: TraitHandler = {
  name: 'animated',
  onApply: (context: TraitContext) => {
    context.data.clip = context.config.clip || 'idle';
    context.data.loop = context.config.loop ?? true;
    context.data.speed = context.config.speed ?? 1;
    context.data.crossFade = context.config.crossFade ?? 0.3;
    context.data.mixer = null;
    context.data.action = null;

    // Animation mixer is set by loader when model is loaded
    context.object.userData.animatedConfig = {
      clip: context.data.clip,
      loop: context.data.loop,
      speed: context.data.speed,
    };
  },
  onUpdate: (_context: TraitContext, _delta: number) => {
    // Mixer update is handled in BrowserRuntime's animation loop
    // This trait just marks the object and stores config
  },
  onRemove: (context: TraitContext) => {
    if (context.data.action) {
      // @ts-expect-error - TS2339 structural type mismatch
      context.data.action.stop();
    }
  },
};

// ============================================================================
// LookAt Trait (object looks at target)
// ============================================================================

export const LookAtTrait: TraitHandler = {
  name: 'look_at',
  onApply: (context: TraitContext) => {
    context.data.target = context.config.target || null;
    context.data.smoothing = context.config.smoothing ?? 5;
    context.data.lockY = context.config.lockY ?? true;
    context.object.userData.lookAtTarget = context.data.target;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const target = context.data.target;
    if (!target) return;

    // Find target object by name in scene
    const scene = context.object.parent;
    if (!scene) return;

    let targetObj: THREE.Object3D | undefined;
    scene.traverse((child) => {
      if (child.name === target) targetObj = child;
    });

    if (targetObj) {
      const targetPos = targetObj.position.clone();
      if (context.data.lockY) {
        targetPos.y = context.object.position.y;
      }

      // Smooth look at
      const targetQuat = new THREE.Quaternion();
      const lookMatrix = new THREE.Matrix4().lookAt(
        context.object.position,
        targetPos,
        new THREE.Vector3(0, 1, 0)
      );
      targetQuat.setFromRotationMatrix(lookMatrix);
      // @ts-expect-error - TS18046 structural type mismatch
      context.object.quaternion.slerp(targetQuat, delta * context.data.smoothing);
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.lookAtTarget = null;
  },
};

// ============================================================================
// Outline Trait (highlighted outline effect)
// ============================================================================

export const OutlineTrait: TraitHandler = {
  name: 'outline',
  onApply: (context: TraitContext) => {
    context.data.color = context.config.color || 0x00ffff;
    context.data.thickness = context.config.thickness ?? 0.03;
    context.data.visible = context.config.visible ?? true;
    context.object.userData.outline = {
      color: context.data.color,
      thickness: context.data.thickness,
      visible: context.data.visible,
    };
    // Actual outline rendering handled by post-processing in BrowserRuntime
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.outline = null;
  },
};

// ============================================================================
// Proximity Trait (trigger events when player is near)
// ============================================================================

export const ProximityTrait: TraitHandler = {
  name: 'proximity',
  onApply: (context: TraitContext) => {
    context.data.radius = context.config.radius ?? 3;
    context.data.onEnter = context.config.onEnter || null;
    context.data.onExit = context.config.onExit || null;
    context.data.playerInside = false;
    context.object.userData.proximityRadius = context.data.radius;
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    // Proximity check handled by InputManager with camera position
    const isInside = context.object.userData.playerNearby ?? false;

    if (isInside && !context.data.playerInside) {
      context.data.playerInside = true;
      if (context.data.onEnter) {
        dispatchCustomEvent(context.object, { type: 'proximityEnter' });
      }
    } else if (!isInside && context.data.playerInside) {
      context.data.playerInside = false;
      if (context.data.onExit) {
        dispatchCustomEvent(context.object, { type: 'proximityExit' });
      }
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.proximityRadius = null;
  },
};
