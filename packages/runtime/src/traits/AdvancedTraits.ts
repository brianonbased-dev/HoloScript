/**
 * Advanced Traits for HoloScript Runtime
 *
 * Teleportation, UI panels, particle systems, weather, day/night cycles,
 * LOD, hand tracking, haptics, portals, and mirrors.
 *
 * @version 3.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';
import {
  dispatchCustomEvent,
  type GamepadWithVibration,
  type HapticActuatorWithPulse,
  type XRHandWithJoints,
} from '../runtime-types';

// =============================================================================
// TELEPORT TRAIT - Parabolic arc teleportation
// =============================================================================

const TELEPORT_ARC_SEGMENTS = 40;
const TELEPORT_ARC_VELOCITY = 6;
const TELEPORT_GRAVITY = -9.81;

function computeParabolicArc(
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  segments: number,
  velocity: number,
  gravity: number
): { points: THREE.Vector3[]; hitPoint: THREE.Vector3 | null } {
  const points: THREE.Vector3[] = [];
  const v0 = forward.clone().normalize().multiplyScalar(velocity);
  const dt = 0.05;
  let pos = origin.clone();
  const vel = v0.clone();
  let hitPoint: THREE.Vector3 | null = null;

  for (let i = 0; i <= segments; i++) {
    points.push(pos.clone());

    // Check if below ground plane (y=0)
    if (pos.y < 0 && i > 0) {
      // Interpolate exact ground hit
      const prev = points[points.length - 2];
      const curr = pos;
      const t = prev.y / (prev.y - curr.y);
      hitPoint = new THREE.Vector3(
        prev.x + (curr.x - prev.x) * t,
        0,
        prev.z + (curr.z - prev.z) * t
      );
      points[points.length - 1] = hitPoint.clone();
      break;
    }

    vel.y += gravity * dt;
    pos = pos.clone().add(vel.clone().multiplyScalar(dt));
  }

  // If we never went below ground, check the last point
  if (!hitPoint && points.length > 0) {
    const last = points[points.length - 1];
    if (last.y <= 0) {
      hitPoint = last.clone();
      hitPoint.y = 0;
    }
  }

  return { points, hitPoint };
}

export const TeleportTrait: TraitHandler = {
  name: 'teleport',

  onApply(context: TraitContext) {
    // Create arc line
    const arcPositions = new Float32Array(TELEPORT_ARC_SEGMENTS * 3);
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
    const arcMaterial = new THREE.LineBasicMaterial({
      // @ts-expect-error - TS2322 structural type mismatch
      color: context.config.arcColor || 0x00aaff,
      linewidth: 2,
    });
    const arcLine = new THREE.Line(arcGeometry, arcMaterial);
    arcLine.visible = false;
    arcLine.frustumCulled = false;
    context.object.add(arcLine);

    // Create target ring
    const ringGeometry = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      // @ts-expect-error - TS2322 structural type mismatch
      color: context.config.ringColor || 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2; // Lay flat on ground
    ring.visible = false;
    // Add ring to parent scene rather than object so it stays at world coords
    if (context.object.parent) {
      context.object.parent.add(ring);
    } else {
      context.object.add(ring);
    }

    context.data.arcLine = arcLine;
    context.data.arcGeometry = arcGeometry;
    context.data.arcMaterial = arcMaterial;
    context.data.ring = ring;
    context.data.ringGeometry = ringGeometry;
    context.data.ringMaterial = ringMaterial;
    context.data.targetPosition = new THREE.Vector3();
    context.data.hasValidTarget = false;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const arcLine = context.data.arcLine as THREE.Line;
    const ring = context.data.ring as THREE.Mesh;
    const userData = context.object.userData;

    if (userData.teleporting) {
      // Get forward direction from the object
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(context.object.quaternion);
      // Tilt upward slightly for parabolic arc
      forward.y = Math.max(forward.y, 0.3);
      forward.normalize();

      const worldPos = new THREE.Vector3();
      context.object.getWorldPosition(worldPos);

      const { points, hitPoint } = computeParabolicArc(
        worldPos,
        forward,
        TELEPORT_ARC_SEGMENTS,
        TELEPORT_ARC_VELOCITY,
        TELEPORT_GRAVITY
      );

      // Update arc line geometry
      const arcGeom = context.data.arcGeometry as THREE.BufferGeometry;
      const posAttr = arcGeom.getAttribute('position') as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < TELEPORT_ARC_SEGMENTS; i++) {
        if (i < points.length) {
          posArray[i * 3] = points[i].x;
          posArray[i * 3 + 1] = points[i].y;
          posArray[i * 3 + 2] = points[i].z;
        } else {
          // Pad remaining segments with last valid point
          const last = points[points.length - 1];
          posArray[i * 3] = last.x;
          posArray[i * 3 + 1] = last.y;
          posArray[i * 3 + 2] = last.z;
        }
      }
      posAttr.needsUpdate = true;
      arcGeom.setDrawRange(0, points.length);

      // Arc line uses world coordinates; detach from parent transform
      arcLine.matrixAutoUpdate = false;
      arcLine.matrix.identity();
      arcLine.visible = true;

      if (hitPoint) {
        ring.position.copy(hitPoint);
        ring.position.y += 0.01; // Slight offset above ground
        ring.visible = true;
        context.data.targetPosition = hitPoint.clone();
        context.data.hasValidTarget = true;
      } else {
        ring.visible = false;
        context.data.hasValidTarget = false;
      }
    } else {
      arcLine.visible = false;
      ring.visible = false;
    }

    // Confirm teleport
    if (userData.confirmTeleport && context.data.hasValidTarget) {
      const target = context.data.targetPosition as THREE.Vector3;
      context.object.position.set(target.x, target.y, target.z);
      userData.confirmTeleport = false;
      userData.teleporting = false;
      arcLine.visible = false;
      ring.visible = false;
      context.data.hasValidTarget = false;
    }
  },

  onRemove(context: TraitContext) {
    const arcLine = context.data.arcLine as THREE.Line;
    if (arcLine) {
      arcLine.parent?.remove(arcLine);
      (context.data.arcGeometry as THREE.BufferGeometry).dispose();
      (context.data.arcMaterial as THREE.LineBasicMaterial).dispose();
    }
    const ring = context.data.ring as THREE.Mesh;
    if (ring) {
      ring.parent?.remove(ring);
      (context.data.ringGeometry as THREE.RingGeometry).dispose();
      (context.data.ringMaterial as THREE.MeshBasicMaterial).dispose();
    }
  },
};

// =============================================================================
// UI PANEL TRAIT - Canvas-based UI panel
// =============================================================================

function renderCanvasText(
  canvas: HTMLCanvasElement,
  text: string,
  bgColor: string,
  textColor: string,
  fontSize: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Text rendering with word wrap
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.textBaseline = 'top';

  const padding = 16;
  const maxWidth = w - padding * 2;
  const lineHeight = fontSize * 1.3;
  const words = text.split(' ');
  let line = '';
  let y = padding;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? ' ' : '') + words[i];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, padding, y);
      line = words[i];
      y += lineHeight;
      if (y + lineHeight > h - padding) break; // Stop if out of bounds
    } else {
      line = testLine;
    }
  }
  if (y + lineHeight <= h - padding) {
    ctx.fillText(line, padding, y);
  }
}

export const UIPanelTrait: TraitHandler = {
  name: 'ui_panel',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const pixelWidth = (cfg.width as number) || 512;
    const pixelHeight = (cfg.height as number) || 256;
    const text = (cfg.text as string) || '';
    const bgColor = (cfg.backgroundColor as string) || '#222';
    const textColor = (cfg.textColor as string) || '#fff';
    const fontSize = (cfg.fontSize as number) || 24;
    const worldScale = (cfg.worldScale as number) || 1;

    // Create canvas and texture
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    renderCanvasText(canvas, text, bgColor, textColor, fontSize);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Create plane mesh
    const aspect = pixelWidth / pixelHeight;
    const planeGeometry = new THREE.PlaneGeometry(worldScale * aspect, worldScale);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const panelMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    panelMesh.name = context.object.name + '_uiPanel';
    context.object.add(panelMesh);

    context.data.canvas = canvas;
    context.data.texture = texture;
    context.data.panelMesh = panelMesh;
    context.data.planeGeometry = planeGeometry;
    context.data.planeMaterial = planeMaterial;
    context.data.bgColor = bgColor;
    context.data.textColor = textColor;
    context.data.fontSize = fontSize;

    // Set initial text on userData
    context.object.userData.uiText = text;
    context.object.userData.uiDirty = false;
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (context.object.userData.uiDirty) {
      const canvas = context.data.canvas as HTMLCanvasElement;
      const texture = context.data.texture as THREE.CanvasTexture;
      const text = (context.object.userData.uiText as string) || '';
      const bgColor = context.data.bgColor as string;
      const textColor = context.data.textColor as string;
      const fontSize = context.data.fontSize as number;

      renderCanvasText(canvas, text, bgColor, textColor, fontSize);
      texture.needsUpdate = true;
      context.object.userData.uiDirty = false;
    }
  },

  onRemove(context: TraitContext) {
    const panelMesh = context.data.panelMesh as THREE.Mesh;
    if (panelMesh) {
      panelMesh.parent?.remove(panelMesh);
    }
    (context.data.planeGeometry as THREE.PlaneGeometry)?.dispose();
    (context.data.planeMaterial as THREE.MeshBasicMaterial)?.dispose();
    (context.data.texture as THREE.CanvasTexture)?.dispose();
  },
};

// =============================================================================
// PARTICLE SYSTEM TRAIT - GPU-friendly particle emitter
// =============================================================================

export const ParticleSystemTrait: TraitHandler = {
  name: 'particle_system',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const count = (cfg.count as number) || 500;
    const particleColor = (cfg.color as string | number) || 0xffaa00;
    const size = (cfg.size as number) || 0.05;
    const speed = (cfg.speed as number) || 1;
    const spread = (cfg.spread as number) || 1;
    const lifetime = (cfg.lifetime as number) || 3;

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);

    // Initialize particles in a sphere
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.random() * spread * 0.5;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Random upward velocity with spread
      velocities[i * 3] = (Math.random() - 0.5) * spread * 0.5;
      velocities[i * 3 + 1] = Math.random() * speed;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.5;

      lifetimes[i] = Math.random() * lifetime;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(particleColor),
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.name = context.object.name + '_particles';
    context.object.add(points);

    context.data.points = points;
    context.data.geometry = geometry;
    context.data.material = material;
    context.data.velocities = velocities;
    context.data.lifetimes = lifetimes;
    context.data.count = count;
    context.data.speed = speed;
    context.data.spread = spread;
    context.data.maxLifetime = lifetime;
  },

  onUpdate(context: TraitContext, delta: number) {
    const geometry = context.data.geometry as THREE.BufferGeometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const velocities = context.data.velocities as Float32Array;
    const lifetimes = context.data.lifetimes as Float32Array;
    const count = context.data.count as number;
    const speed = context.data.speed as number;
    const spread = context.data.spread as number;
    const maxLifetime = context.data.maxLifetime as number;

    for (let i = 0; i < count; i++) {
      lifetimes[i] += delta;

      // Respawn at origin when lifetime exceeded
      if (lifetimes[i] >= maxLifetime) {
        lifetimes[i] = 0;
        positions[i * 3] = (Math.random() - 0.5) * spread * 0.1;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.1;

        velocities[i * 3] = (Math.random() - 0.5) * spread * 0.5;
        velocities[i * 3 + 1] = Math.random() * speed;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.5;
      }

      // Update positions
      positions[i * 3] += velocities[i * 3] * delta;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    }

    posAttr.needsUpdate = true;
  },

  onRemove(context: TraitContext) {
    const points = context.data.points as THREE.Points;
    if (points) {
      points.parent?.remove(points);
    }
    (context.data.geometry as THREE.BufferGeometry)?.dispose();
    (context.data.material as THREE.PointsMaterial)?.dispose();
  },
};

// =============================================================================
// WEATHER TRAIT - Rain, snow, and fog effects
// =============================================================================

export const WeatherTrait: TraitHandler = {
  name: 'weather',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const weatherType = (cfg.type as string) || 'rain'; // rain | snow | fog
    const count = (cfg.count as number) || 2000;
    const areaSize = (cfg.areaSize as number) || 30;
    const height = (cfg.height as number) || 20;

    context.data.weatherType = weatherType;
    context.data.areaSize = areaSize;
    context.data.height = height;

    if (weatherType === 'fog') {
      // Apply fog to the scene
      const fogColor = new THREE.Color((cfg.fogColor as string) || '#cccccc');
      const near = (cfg.fogNear as number) || 5;
      const far = (cfg.fogFar as number) || 50;

      // Traverse up to find the scene
      let scene: THREE.Object3D | null = context.object;
      while (scene && !(scene instanceof THREE.Scene) && scene.parent) {
        scene = scene.parent;
      }
      if (scene) {
        (scene as THREE.Scene).fog = new THREE.Fog(fogColor, near, far);
      }
      context.data.scene = scene;
      context.data.particles = null;
      return;
    }

    // Create particle system for rain/snow
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    const isSnow = weatherType === 'snow';
    const fallSpeed = isSnow ? -0.5 : -5;
    const particleSize = isSnow ? 0.08 : 0.02;
    const particleColor = isSnow ? 0xffffff : 0xaabbdd;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * areaSize;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize;

      velocities[i * 3] = isSnow ? (Math.random() - 0.5) * 0.3 : 0;
      velocities[i * 3 + 1] = fallSpeed + (Math.random() * 0.2 - 0.1);
      velocities[i * 3 + 2] = isSnow ? (Math.random() - 0.5) * 0.3 : 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: particleColor,
      size: particleSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: isSnow ? 0.9 : 0.6,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.name = context.object.name + '_weather';
    context.object.add(points);

    context.data.particles = points;
    context.data.geometry = geometry;
    context.data.material = material;
    context.data.velocities = velocities;
    context.data.count = count;
    context.data.fallSpeed = fallSpeed;
    context.data.isSnow = isSnow;
  },

  onUpdate(context: TraitContext, delta: number) {
    if (!context.data.particles) return;

    const geometry = context.data.geometry as THREE.BufferGeometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const velocities = context.data.velocities as Float32Array;
    const count = context.data.count as number;
    const areaSize = context.data.areaSize as number;
    const height = context.data.height as number;
    const isSnow = context.data.isSnow as boolean;

    for (let i = 0; i < count; i++) {
      // Snow gets time-varying lateral drift
      if (isSnow) {
        const drift = Math.sin(Date.now() * 0.001 + i * 0.1) * 0.1;
        velocities[i * 3] = drift;
        velocities[i * 3 + 2] = Math.cos(Date.now() * 0.0013 + i * 0.1) * 0.08;
      }

      positions[i * 3] += velocities[i * 3] * delta;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;

      // Respawn at top when below ground
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3] = (Math.random() - 0.5) * areaSize;
        positions[i * 3 + 1] = height + Math.random() * 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize;
      }

      // Wrap horizontally to stay in area
      if (Math.abs(positions[i * 3]) > areaSize * 0.5) {
        positions[i * 3] = -Math.sign(positions[i * 3]) * areaSize * 0.5 + Math.random();
      }
      if (Math.abs(positions[i * 3 + 2]) > areaSize * 0.5) {
        positions[i * 3 + 2] = -Math.sign(positions[i * 3 + 2]) * areaSize * 0.5 + Math.random();
      }
    }

    posAttr.needsUpdate = true;
  },

  onRemove(context: TraitContext) {
    const particles = context.data.particles as THREE.Points | null;
    if (particles) {
      particles.parent?.remove(particles);
      (context.data.geometry as THREE.BufferGeometry)?.dispose();
      (context.data.material as THREE.PointsMaterial)?.dispose();
    }

    // Remove fog if we set it
    if (context.data.weatherType === 'fog' && context.data.scene) {
      (context.data.scene as THREE.Scene).fog = null;
    }
  },
};

// =============================================================================
// DAY/NIGHT TRAIT - Dynamic sun cycle with color temperature
// =============================================================================

function sunColorForAngle(angle: number): THREE.Color {
  // angle: 0 = sunrise, PI/2 = noon, PI = sunset, 3PI/2 = midnight
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // Sunrise (warm orange-pink)
  if (normalized < Math.PI * 0.2) {
    const t = normalized / (Math.PI * 0.2);
    return new THREE.Color().setRGB(
      THREE.MathUtils.lerp(0.9, 1.0, t),
      THREE.MathUtils.lerp(0.4, 0.9, t),
      THREE.MathUtils.lerp(0.2, 0.8, t)
    );
  }
  // Morning to noon (warm to white)
  if (normalized < Math.PI * 0.5) {
    const t = (normalized - Math.PI * 0.2) / (Math.PI * 0.3);
    return new THREE.Color().setRGB(
      1.0,
      THREE.MathUtils.lerp(0.9, 1.0, t),
      THREE.MathUtils.lerp(0.8, 1.0, t)
    );
  }
  // Noon to afternoon (white to warm)
  if (normalized < Math.PI * 0.8) {
    const t = (normalized - Math.PI * 0.5) / (Math.PI * 0.3);
    return new THREE.Color().setRGB(
      1.0,
      THREE.MathUtils.lerp(1.0, 0.85, t),
      THREE.MathUtils.lerp(1.0, 0.7, t)
    );
  }
  // Sunset (deep orange-red)
  if (normalized < Math.PI) {
    const t = (normalized - Math.PI * 0.8) / (Math.PI * 0.2);
    return new THREE.Color().setRGB(
      THREE.MathUtils.lerp(1.0, 0.8, t),
      THREE.MathUtils.lerp(0.85, 0.3, t),
      THREE.MathUtils.lerp(0.7, 0.1, t)
    );
  }
  // Night (dim blue-ish)
  if (normalized < Math.PI * 1.8) {
    return new THREE.Color().setRGB(0.05, 0.05, 0.15);
  }
  // Pre-dawn
  const t = (normalized - Math.PI * 1.8) / (Math.PI * 0.2);
  return new THREE.Color().setRGB(
    THREE.MathUtils.lerp(0.05, 0.9, t),
    THREE.MathUtils.lerp(0.05, 0.4, t),
    THREE.MathUtils.lerp(0.15, 0.2, t)
  );
}

function sunIntensityForAngle(angle: number): number {
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  if (normalized < Math.PI) {
    // Daytime: sun intensity follows a sine curve peaking at noon
    return Math.max(0, Math.sin(normalized)) * 1.5;
  }
  // Nighttime: very dim (moonlight)
  return 0.05;
}

export const DayNightTrait: TraitHandler = {
  name: 'day_night',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const cycleDuration = (cfg.cycleDuration as number) || 120; // seconds for full day
    const startTime = (cfg.startTime as number) || 0; // fraction 0-1 of day

    // Create directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.name = context.object.name + '_sunLight';
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    context.object.add(sunLight);

    // Create ambient light
    const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
    ambientLight.name = context.object.name + '_ambientLight';
    context.object.add(ambientLight);

    context.data.sunLight = sunLight;
    context.data.ambientLight = ambientLight;
    context.data.cycleDuration = cycleDuration;
    context.data.elapsed = startTime * cycleDuration;
    context.data.sunDistance = (cfg.sunDistance as number) || 30;
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.elapsed = (context.data.elapsed as number) + delta;

    const cycleDuration = context.data.cycleDuration as number;
    const elapsed = context.data.elapsed as number;
    const sunDistance = context.data.sunDistance as number;

    // Compute angle (0 to 2PI over one full cycle)
    const angle = ((elapsed % cycleDuration) / cycleDuration) * Math.PI * 2;

    // Position sun in an arc
    const sunLight = context.data.sunLight as THREE.DirectionalLight;
    const sunX = Math.cos(angle) * sunDistance;
    const sunY = Math.sin(angle) * sunDistance;
    sunLight.position.set(sunX, sunY, 0);
    sunLight.target = context.object;

    // Set sun color and intensity based on position
    const sunColor = sunColorForAngle(angle);
    sunLight.color.copy(sunColor);
    sunLight.intensity = sunIntensityForAngle(angle);

    // Update ambient light
    const ambientLight = context.data.ambientLight as THREE.AmbientLight;
    const isDaytime = angle > 0 && angle < Math.PI;
    if (isDaytime) {
      ambientLight.color.setRGB(0.4, 0.45, 0.6);
      ambientLight.intensity = 0.3 + Math.sin(angle) * 0.3;
    } else {
      ambientLight.color.setRGB(0.05, 0.05, 0.15);
      ambientLight.intensity = 0.1;
    }

    // Expose current time-of-day info on userData
    context.object.userData.dayNightAngle = angle;
    context.object.userData.dayNightPhase = isDaytime ? 'day' : 'night';
    context.object.userData.dayNightProgress = (elapsed % cycleDuration) / cycleDuration;
  },

  onRemove(context: TraitContext) {
    const sunLight = context.data.sunLight as THREE.DirectionalLight;
    if (sunLight) {
      sunLight.parent?.remove(sunLight);
      sunLight.dispose();
    }
    const ambientLight = context.data.ambientLight as THREE.AmbientLight;
    if (ambientLight) {
      ambientLight.parent?.remove(ambientLight);
      ambientLight.dispose();
    }
  },
};

// =============================================================================
// LOD TRAIT - Level of Detail management
// =============================================================================

export const LODTrait: TraitHandler = {
  name: 'lod',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const distances = (cfg.distances as number[]) || [0, 15, 30];
    const obj = context.object;

    const lod = new THREE.LOD();
    lod.name = obj.name + '_lod';
    lod.position.copy(obj.position);
    lod.rotation.copy(obj.rotation);
    lod.scale.copy(obj.scale);

    // Level 0: Original object (full detail)
    const level0 = obj.clone();
    level0.position.set(0, 0, 0);
    level0.rotation.set(0, 0, 0);
    level0.scale.set(1, 1, 1);
    lod.addLevel(level0, distances[0] || 0);

    // Level 1: Wireframe version (medium detail)
    const level1 = obj.clone();
    level1.position.set(0, 0, 0);
    level1.rotation.set(0, 0, 0);
    level1.scale.set(1, 1, 1);
    level1.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshBasicMaterial({
          color: (cfg.wireframeColor as number) || 0x888888,
          wireframe: true,
        });
      }
    });
    lod.addLevel(level1, distances[1] || 15);

    // Level 2: Point representation (low detail)
    const level2Group = new THREE.Group();
    // Create a bounding box-sized point representation
    const bbox = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const pointCount = Math.max(8, Math.min(64, Math.ceil(size.length() * 4)));
    const pointPositions = new Float32Array(pointCount * 3);
    for (let i = 0; i < pointCount; i++) {
      pointPositions[i * 3] = (Math.random() - 0.5) * size.x;
      pointPositions[i * 3 + 1] = (Math.random() - 0.5) * size.y;
      pointPositions[i * 3 + 2] = (Math.random() - 0.5) * size.z;
    }
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    const pointMat = new THREE.PointsMaterial({
      color: (cfg.pointColor as number) || 0xaaaaaa,
      size: (cfg.pointSize as number) || 0.2,
      sizeAttenuation: true,
    });
    const pointCloud = new THREE.Points(pointGeom, pointMat);
    level2Group.add(pointCloud);
    lod.addLevel(level2Group, distances[2] || 30);

    // Replace object in parent
    const parent = obj.parent;
    if (parent) {
      parent.add(lod);
    }

    context.data.lod = lod;
    context.data.pointGeom = pointGeom;
    context.data.pointMat = pointMat;
    context.data.level1Materials = [] as THREE.Material[];

    // Collect level1 materials for disposal
    level1.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        (context.data.level1Materials as THREE.Material[]).push(
          (child as THREE.Mesh).material as THREE.Material
        );
      }
    });

    // Hide original object since LOD replaces it
    obj.visible = false;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const lod = context.data.lod as THREE.LOD;
    if (!lod) return;

    // Find the camera in the scene
    let camera: THREE.Camera | null = null;
    let root: THREE.Object3D | null = context.object;
    while (root && root.parent) {
      root = root.parent;
    }
    if (root) {
      root.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Camera).isCamera && !camera) {
          camera = child as THREE.Camera;
        }
      });
    }

    if (camera) {
      lod.update(camera);
    }
  },

  onRemove(context: TraitContext) {
    const lod = context.data.lod as THREE.LOD;
    if (lod) {
      lod.parent?.remove(lod);
    }

    // Dispose level1 wireframe materials
    const level1Mats = context.data.level1Materials as THREE.Material[];
    if (level1Mats) {
      for (const mat of level1Mats) {
        mat.dispose();
      }
    }

    // Dispose point cloud
    (context.data.pointGeom as THREE.BufferGeometry)?.dispose();
    (context.data.pointMat as THREE.PointsMaterial)?.dispose();

    // Show original object again
    context.object.visible = true;
  },
};

// =============================================================================
// HAND TRACKING TRAIT - XR hand joint tracking with finger spheres
// =============================================================================

const FINGERTIP_JOINTS = [
  'thumb-tip',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
] as const;

export const HandTrackingTrait: TraitHandler = {
  name: 'hand_tracking',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const hand = (cfg.hand as string) || 'right';
    const sphereRadius = (cfg.sphereRadius as number) || 0.008;
    const sphereColor = (cfg.sphereColor as number) || (hand === 'left' ? 0x4488ff : 0xff4488);

    // Create 5 spheres for fingertips
    const spheres: THREE.Mesh[] = [];
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 8, 6);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: sphereColor });

    for (let i = 0; i < 5; i++) {
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.name = `${context.object.name}_${hand}_finger_${i}`;
      sphere.visible = false;
      context.object.add(sphere);
      spheres.push(sphere);
    }

    // Create a wrist sphere (slightly larger)
    const wristGeom = new THREE.SphereGeometry(sphereRadius * 2, 8, 6);
    const wristMesh = new THREE.Mesh(wristGeom, sphereMaterial);
    wristMesh.name = `${context.object.name}_${hand}_wrist`;
    wristMesh.visible = false;
    context.object.add(wristMesh);

    context.data.hand = hand;
    context.data.handIndex = hand === 'left' ? 0 : 1;
    context.data.spheres = spheres;
    context.data.wristMesh = wristMesh;
    context.data.sphereGeometry = sphereGeometry;
    context.data.wristGeometry = wristGeom;
    context.data.sphereMaterial = sphereMaterial;
    context.data.pinchThreshold = (cfg.pinchThreshold as number) || 0.02;

    context.object.userData.pinching = false;
    context.object.userData.handTracked = false;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const spheres = context.data.spheres as THREE.Mesh[];
    const wristMesh = context.data.wristMesh as THREE.Mesh;
    const handIndex = context.data.handIndex as number;

    // Try to access XR hand from the renderer
    // This requires renderer.xr to be active
    let xrHand: XRHandWithJoints | null = null;
    let root: THREE.Object3D | null = context.object;
    while (root && root.parent) {
      root = root.parent;
    }

    // Check userData for renderer reference (set by runtime)
    const renderer = context.object.userData._renderer as THREE.WebGLRenderer | undefined;
    if (renderer && renderer.xr && renderer.xr.isPresenting) {
      const hand = renderer.xr.getHand(handIndex) as unknown as XRHandWithJoints | undefined;
      if (hand && hand.joints) {
        xrHand = hand;
      }
    }

    if (xrHand && xrHand.joints) {
      context.object.userData.handTracked = true;

      // Update fingertip sphere positions
      for (let i = 0; i < FINGERTIP_JOINTS.length; i++) {
        const jointName = FINGERTIP_JOINTS[i];
        const joint = xrHand.joints[jointName];
        if (joint) {
          spheres[i].visible = true;
          spheres[i].position.copy(joint.position);
          spheres[i].quaternion.copy(joint.quaternion);
        } else {
          spheres[i].visible = false;
        }
      }

      // Update wrist
      const wristJoint = xrHand.joints['wrist'];
      if (wristJoint) {
        wristMesh.visible = true;
        wristMesh.position.copy(wristJoint.position);
      } else {
        wristMesh.visible = false;
      }

      // Detect pinch: distance between thumb tip and index tip
      const thumbTip = xrHand.joints['thumb-tip'];
      const indexTip = xrHand.joints['index-finger-tip'];
      if (thumbTip && indexTip) {
        const dist = thumbTip.position.distanceTo(indexTip.position);
        context.object.userData.pinching = dist < (context.data.pinchThreshold as number);
        context.object.userData.pinchDistance = dist;
      }
    } else {
      context.object.userData.handTracked = false;
      // Hide all spheres when not tracking
      for (const sphere of spheres) {
        sphere.visible = false;
      }
      wristMesh.visible = false;
    }
  },

  onRemove(context: TraitContext) {
    const spheres = context.data.spheres as THREE.Mesh[];
    for (const sphere of spheres) {
      sphere.parent?.remove(sphere);
    }
    const wristMesh = context.data.wristMesh as THREE.Mesh;
    if (wristMesh) {
      wristMesh.parent?.remove(wristMesh);
    }
    (context.data.sphereGeometry as THREE.SphereGeometry)?.dispose();
    (context.data.wristGeometry as THREE.SphereGeometry)?.dispose();
    (context.data.sphereMaterial as THREE.MeshBasicMaterial)?.dispose();

    delete context.object.userData.pinching;
    delete context.object.userData.handTracked;
    delete context.object.userData.pinchDistance;
  },
};

// =============================================================================
// HAPTIC TRAIT - XR gamepad haptic feedback
// =============================================================================

export const HapticTrait: TraitHandler = {
  name: 'haptic',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.intensity = (cfg.intensity as number) ?? 0.5;
    context.data.duration = (cfg.duration as number) ?? 100;
    context.data.hand = (cfg.hand as string) || 'right'; // left | right | both
    context.data.lastTriggerTime = 0;
    context.data.cooldown = (cfg.cooldown as number) || 50; // ms cooldown between pulses

    context.object.userData.triggerHaptic = false;
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (!context.object.userData.triggerHaptic) return;

    const now = performance.now();
    const lastTrigger = context.data.lastTriggerTime as number;
    const cooldown = context.data.cooldown as number;

    // Respect cooldown
    if (now - lastTrigger < cooldown) {
      context.object.userData.triggerHaptic = false;
      return;
    }

    const intensity = context.data.intensity as number;
    const duration = context.data.duration as number;
    const handPref = context.data.hand as string;

    // Try to find XR session and gamepads
    const renderer = context.object.userData._renderer as THREE.WebGLRenderer | undefined;
    if (renderer && renderer.xr && renderer.xr.isPresenting) {
      const session = renderer.xr.getSession();
      if (session && session.inputSources) {
        for (const inputSource of session.inputSources) {
          const isTargetHand = handPref === 'both' || inputSource.handedness === handPref;

          if (isTargetHand && inputSource.gamepad) {
            const gamepad = inputSource.gamepad;
            if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
              // Standard Gamepad Haptic API
              const actuator = gamepad.hapticActuators[0] as unknown as HapticActuatorWithPulse | undefined;
              if (actuator && typeof actuator.pulse === 'function') {
                actuator.pulse(intensity, duration);
              }
            } else if ((gamepad as GamepadWithVibration).vibrationActuator) {
              // Alternative vibration API
              (gamepad as GamepadWithVibration).vibrationActuator!.playEffect('dual-rumble', {
                duration,
                strongMagnitude: intensity,
                weakMagnitude: intensity * 0.5,
              });
            }
          }
        }
      }
    }

    context.data.lastTriggerTime = now;
    context.object.userData.triggerHaptic = false;
  },

  onRemove(context: TraitContext) {
    delete context.object.userData.triggerHaptic;
  },
};

// =============================================================================
// PORTAL TRAIT - Teleportation portal with glowing ring
// =============================================================================

export const PortalTrait: TraitHandler = {
  name: 'portal',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const destination = (cfg.destination as number[]) || [0, 0, 0];
    const portalColor = new THREE.Color((cfg.color as string) || '#8800ff');
    const portalRadius = (cfg.radius as number) || 1.2;
    const activationDistance = (cfg.activationDistance as number) || 1;

    // Portal frame (torus ring)
    const ringGeometry = new THREE.TorusGeometry(portalRadius, 0.08, 16, 48);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: portalColor,
      emissive: portalColor,
      emissiveIntensity: 1.5,
      metalness: 0.8,
      roughness: 0.2,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.name = context.object.name + '_portalRing';
    context.object.add(ring);

    // Portal surface (semi-transparent plane inside the ring)
    const surfaceGeometry = new THREE.CircleGeometry(portalRadius * 0.95, 32);
    const surfaceMaterial = new THREE.MeshBasicMaterial({
      color: portalColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surface.name = context.object.name + '_portalSurface';
    context.object.add(surface);

    // Add a point light for glow effect
    const glowLight = new THREE.PointLight(portalColor, 1.5, portalRadius * 4);
    glowLight.name = context.object.name + '_portalGlow';
    context.object.add(glowLight);

    context.data.ring = ring;
    context.data.ringGeometry = ringGeometry;
    context.data.ringMaterial = ringMaterial;
    context.data.surface = surface;
    context.data.surfaceGeometry = surfaceGeometry;
    context.data.surfaceMaterial = surfaceMaterial;
    context.data.glowLight = glowLight;
    context.data.destination = new THREE.Vector3(destination[0], destination[1], destination[2]);
    context.data.activationDistance = activationDistance;
    context.data.rotationSpeed = (cfg.rotationSpeed as number) || 0.5;
    context.data.pulseTime = 0;
  },

  onUpdate(context: TraitContext, delta: number) {
    const ring = context.data.ring as THREE.Mesh;
    const surface = context.data.surface as THREE.Mesh;
    const surfaceMat = context.data.surfaceMaterial as THREE.MeshBasicMaterial;
    const ringMat = context.data.ringMaterial as THREE.MeshStandardMaterial;
    const rotationSpeed = context.data.rotationSpeed as number;
    const activationDist = context.data.activationDistance as number;
    const destination = context.data.destination as THREE.Vector3;

    // Slowly rotate the ring
    ring.rotation.z += rotationSpeed * delta;

    // Pulse the surface opacity
    context.data.pulseTime = (context.data.pulseTime as number) + delta;
    const pulse = (Math.sin((context.data.pulseTime as number) * 2) + 1) / 2;
    surfaceMat.opacity = 0.15 + pulse * 0.25;
    ringMat.emissiveIntensity = 1.0 + pulse * 0.8;

    // Check proximity of nearby objects
    const portalWorldPos = new THREE.Vector3();
    context.object.getWorldPosition(portalWorldPos);

    const scene = context.object.parent;
    if (scene) {
      scene.traverse((child: THREE.Object3D) => {
        if (child === context.object) return;
        if (child === ring || child === surface) return;
        // Only teleport objects tagged as teleportable or the camera rig
        if (!child.userData.teleportable && !child.userData.isPlayer) return;

        const childPos = new THREE.Vector3();
        child.getWorldPosition(childPos);
        const dist = childPos.distanceTo(portalWorldPos);

        if (dist < activationDist) {
          child.position.set(destination.x, destination.y, destination.z);
          dispatchCustomEvent(child, { type: 'portal_teleported', destination });
        }
      });
    }
  },

  onRemove(context: TraitContext) {
    const ring = context.data.ring as THREE.Mesh;
    if (ring) {
      ring.parent?.remove(ring);
      (context.data.ringGeometry as THREE.TorusGeometry).dispose();
      (context.data.ringMaterial as THREE.MeshStandardMaterial).dispose();
    }

    const surface = context.data.surface as THREE.Mesh;
    if (surface) {
      surface.parent?.remove(surface);
      (context.data.surfaceGeometry as THREE.CircleGeometry).dispose();
      (context.data.surfaceMaterial as THREE.MeshBasicMaterial).dispose();
    }

    const glowLight = context.data.glowLight as THREE.PointLight;
    if (glowLight) {
      glowLight.parent?.remove(glowLight);
      glowLight.dispose();
    }
  },
};

// =============================================================================
// MIRROR TRAIT - Reflective plane surface
// =============================================================================

export const MirrorTrait: TraitHandler = {
  name: 'mirror',

  onApply(context: TraitContext) {
    const cfg = context.config;
    const size = (cfg.size as number) || 2;
    const tint = new THREE.Color((cfg.tint as string | number) || 0xffffff);
    const orientation = (cfg.orientation as string) || 'vertical'; // vertical | horizontal | face_camera

    // Create reflective plane
    const mirrorGeometry = new THREE.PlaneGeometry(size, size);
    const mirrorMaterial = new THREE.MeshStandardMaterial({
      color: tint,
      metalness: 1.0,
      roughness: 0.05,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    });

    const mirrorMesh = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
    mirrorMesh.name = context.object.name + '_mirror';

    // Set initial orientation
    if (orientation === 'horizontal') {
      mirrorMesh.rotation.x = -Math.PI / 2;
    }
    // vertical is default (no rotation needed)

    context.object.add(mirrorMesh);

    // Add a subtle frame around the mirror
    const frameThickness = 0.04;
    const frameGeometry = new THREE.BoxGeometry(
      size + frameThickness * 2,
      size + frameThickness * 2,
      frameThickness
    );
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: (cfg.frameColor as number) || 0x333333,
      metalness: 0.9,
      roughness: 0.3,
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.name = context.object.name + '_mirrorFrame';
    frame.position.z = -frameThickness * 0.5;

    if (orientation === 'horizontal') {
      frame.rotation.x = -Math.PI / 2;
      frame.position.z = 0;
      frame.position.y = -frameThickness * 0.5;
    }

    context.object.add(frame);

    context.data.mirrorMesh = mirrorMesh;
    context.data.mirrorGeometry = mirrorGeometry;
    context.data.mirrorMaterial = mirrorMaterial;
    context.data.frame = frame;
    context.data.frameGeometry = frameGeometry;
    context.data.frameMaterial = frameMaterial;
    context.data.orientation = orientation;
    context.data.faceCamera = orientation === 'face_camera';
  },

  onUpdate(context: TraitContext, _delta: number) {
    if (!context.data.faceCamera) return;

    // Find camera in scene
    let camera: THREE.Camera | null = null;
    let root: THREE.Object3D | null = context.object;
    while (root && root.parent) {
      root = root.parent;
    }
    if (root) {
      root.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Camera).isCamera && !camera) {
          camera = child as THREE.Camera;
        }
      });
    }

    if (camera) {
      const mirrorMesh = context.data.mirrorMesh as THREE.Mesh;
      const frame = context.data.frame as THREE.Mesh;

      // Calculate the mirror normal that faces the camera
      // Mirror should face the camera but only rotate on Y axis (for a standing mirror)
      const cameraWorldPos = new THREE.Vector3();
      // @ts-expect-error - TS2339 structural type mismatch
      camera.getWorldPosition(cameraWorldPos);

      const mirrorWorldPos = new THREE.Vector3();
      context.object.getWorldPosition(mirrorWorldPos);

      // Direction from mirror to camera, projected onto XZ plane
      const dir = cameraWorldPos.clone().sub(mirrorWorldPos);
      dir.y = 0;
      dir.normalize();

      const targetAngle = Math.atan2(dir.x, dir.z);
      mirrorMesh.rotation.y = targetAngle;
      frame.rotation.y = targetAngle;
    }
  },

  onRemove(context: TraitContext) {
    const mirrorMesh = context.data.mirrorMesh as THREE.Mesh;
    if (mirrorMesh) {
      mirrorMesh.parent?.remove(mirrorMesh);
    }
    const frame = context.data.frame as THREE.Mesh;
    if (frame) {
      frame.parent?.remove(frame);
    }

    (context.data.mirrorGeometry as THREE.PlaneGeometry)?.dispose();
    (context.data.mirrorMaterial as THREE.MeshStandardMaterial)?.dispose();
    (context.data.frameGeometry as THREE.BoxGeometry)?.dispose();
    (context.data.frameMaterial as THREE.MeshStandardMaterial)?.dispose();
  },
};
