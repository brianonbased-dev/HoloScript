/**
 * ParticleEmitter.ts
 *
 * Particle emission system: shapes, lifetime, velocity,
 * color/size over lifetime curves, and sub-emitters.
 *
 * @module particles
 */

// =============================================================================
// TYPES
// =============================================================================

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}
export interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface CurveKeyframe {
  time: number; // 0-1 normalized lifetime
  value: number;
}

export type EmissionShape = 'point' | 'sphere' | 'box' | 'cone' | 'circle' | 'line';

export interface EmitterConfig {
  id: string;
  maxParticles: number;
  emissionRate: number; // Particles per second
  emissionShape: EmissionShape;
  shapeParams: {
    radius?: number;
    angle?: number; // Cone angle in degrees
    extents?: IVector3; // Box half-extents
    length?: number; // Line length
  };
  lifetime: { min: number; max: number };
  startSpeed: { min: number; max: number };
  startSize: { min: number; max: number };
  startColor: IColor;
  endColor?: IColor;
  gravity: number;
  sizeOverLifetime?: CurveKeyframe[];
  alphaOverLifetime?: CurveKeyframe[];
  speedOverLifetime?: CurveKeyframe[];
  worldSpace: boolean;
  prewarm: boolean;
}

export interface Particle {
  position: IVector3;
  velocity: IVector3;
  color: IColor;
  size: number;
  age: number;
  lifetime: number;
  alive: boolean;
  startSpeed: number;
}

export interface EmitterState {
  id: string;
  playing: boolean;
  elapsed: number;
  emissionAccum: number;
  aliveCount: number;
  totalEmitted: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function sampleCurve(keyframes: CurveKeyframe[], t: number): number {
  if (keyframes.length === 0) return 1;
  if (t <= keyframes[0].time) return keyframes[0].value;
  if (t >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
      const segT = (t - keyframes[i].time) / (keyframes[i + 1].time - keyframes[i].time);
      return lerp(keyframes[i].value, keyframes[i + 1].value, segT);
    }
  }
  return keyframes[keyframes.length - 1].value;
}

// =============================================================================
// PARTICLE EMITTER
// =============================================================================

export class ParticleEmitter {
  readonly config: EmitterConfig;
  private particles: Particle[] = [];
  private state: EmitterState;

  constructor(config: EmitterConfig) {
    this.config = { ...config };
    this.state = {
      id: config.id,
      playing: false,
      elapsed: 0,
      emissionAccum: 0,
      aliveCount: 0,
      totalEmitted: 0,
    };

    // Pre-allocate particle pool
    for (let i = 0; i < config.maxParticles; i++) {
      this.particles.push(this.createDeadParticle());
    }

    if (config.prewarm) {
      this.play();
      this.update(2.0); // 2 seconds of prewarm
    }
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  play(): void {
    this.state.playing = true;
  }
  pause(): void {
    this.state.playing = false;
  }
  stop(): void {
    this.state.playing = false;
    this.state.elapsed = 0;
    this.state.emissionAccum = 0;
    for (const p of this.particles) p.alive = false;
    this.state.aliveCount = 0;
  }

  isPlaying(): boolean {
    return this.state.playing;
  }
  getState(): EmitterState {
    return { ...this.state };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): Particle[] {
    if (!this.state.playing) return this.getAliveParticles();

    this.state.elapsed += dt;

    // Emit new particles
    this.state.emissionAccum += this.config.emissionRate * dt;
    while (this.state.emissionAccum >= 1) {
      this.emit();
      this.state.emissionAccum -= 1;
    }

    // Update alive particles
    this.state.aliveCount = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.lifetime) {
        p.alive = false;
        continue;
      }

      const t = p.age / p.lifetime;

      // Apply gravity
      p.velocity.y -= this.config.gravity * dt;

      // Speed over lifetime
      if (this.config.speedOverLifetime) {
        const speedMul = sampleCurve(this.config.speedOverLifetime, t);
        const speed = Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2);
        if (speed > 0.001) {
          const targetSpeed = p.startSpeed * speedMul;
          const scale = targetSpeed / speed;
          p.velocity.x *= scale;
          p.velocity.y *= scale;
          p.velocity.z *= scale;
        }
      }

      // Move
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      // Size over lifetime
      if (this.config.sizeOverLifetime) {
        p.size = sampleCurve(this.config.sizeOverLifetime, t);
      }

      // Alpha over lifetime
      if (this.config.alphaOverLifetime) {
        p.color.a = sampleCurve(this.config.alphaOverLifetime, t);
      }

      // Color lerp
      if (this.config.endColor) {
        p.color.r = lerp(this.config.startColor.r, this.config.endColor.r, t);
        p.color.g = lerp(this.config.startColor.g, this.config.endColor.g, t);
        p.color.b = lerp(this.config.startColor.b, this.config.endColor.b, t);
      }

      this.state.aliveCount++;
    }

    return this.getAliveParticles();
  }

  // ---------------------------------------------------------------------------
  // Emission
  // ---------------------------------------------------------------------------

  private emit(): void {
    // Find a dead particle to reuse
    const p = this.particles.find((p) => !p.alive);
    if (!p) return;

    p.alive = true;
    p.age = 0;
    p.lifetime = randomRange(this.config.lifetime.min, this.config.lifetime.max);
    p.size = randomRange(this.config.startSize.min, this.config.startSize.max);
    p.color = { ...this.config.startColor };
    p.startSpeed = randomRange(this.config.startSpeed.min, this.config.startSpeed.max);

    // Emit position and direction from shape
    const { position, direction } = this.sampleShape();
    p.position = position;
    p.velocity = {
      x: direction.x * p.startSpeed,
      y: direction.y * p.startSpeed,
      z: direction.z * p.startSpeed,
    };

    this.state.totalEmitted++;
  }

  private sampleShape(): { position: IVector3; direction: IVector3 } {
    const shape = this.config.emissionShape;
    const params = this.config.shapeParams;

    switch (shape) {
      case 'point':
        return { position: { x: 0, y: 0, z: 0 }, direction: this.randomDirection() };

      case 'sphere': {
        const dir = this.randomDirection();
        const r = (params.radius ?? 1) * Math.cbrt(Math.random());
        return {
          position: { x: dir.x * r, y: dir.y * r, z: dir.z * r },
          direction: dir,
        };
      }

      case 'box': {
        const ext = params.extents ?? { x: 1, y: 1, z: 1 };
        return {
          position: {
            x: randomRange(-ext.x, ext.x),
            y: randomRange(-ext.y, ext.y),
            z: randomRange(-ext.z, ext.z),
          },
          direction: { x: 0, y: 1, z: 0 },
        };
      }

      case 'cone': {
        const angle = ((params.angle ?? 30) * Math.PI) / 180;
        const phi = Math.random() * 2 * Math.PI;
        const cosTheta = Math.cos(angle * Math.random());
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        return {
          position: { x: 0, y: 0, z: 0 },
          direction: {
            x: sinTheta * Math.cos(phi),
            y: cosTheta,
            z: sinTheta * Math.sin(phi),
          },
        };
      }

      case 'circle': {
        const r = (params.radius ?? 1) * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        return {
          position: { x: r * Math.cos(theta), y: 0, z: r * Math.sin(theta) },
          direction: { x: 0, y: 1, z: 0 },
        };
      }

      case 'line': {
        const len = params.length ?? 2;
        return {
          position: { x: randomRange(-len / 2, len / 2), y: 0, z: 0 },
          direction: { x: 0, y: 1, z: 0 },
        };
      }
    }
  }

  private randomDirection(): IVector3 {
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = 2 * Math.PI * Math.random();
    return {
      x: Math.sin(theta) * Math.cos(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(theta),
    };
  }

  private createDeadParticle(): Particle {
    return {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: { r: 1, g: 1, b: 1, a: 1 },
      size: 1,
      age: 0,
      lifetime: 1,
      alive: false,
      startSpeed: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getAliveParticles(): Particle[] {
    return this.particles.filter((p) => p.alive);
  }

  getAliveCount(): number {
    return this.state.aliveCount;
  }

  getCapacity(): number {
    return this.config.maxParticles;
  }
}

