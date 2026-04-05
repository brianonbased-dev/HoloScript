/**
 * ParticleSystem.ts
 *
 * High-performance particle system with object pooling.
 * Manages particle lifecycle: birth, update, death, recycling.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Color4 {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Particle {
  // State
  alive: boolean;
  age: number; // Seconds since birth
  lifetime: number; // Total lifespan in seconds
  // Spatial
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  // Visual
  size: number;
  sizeStart: number;
  sizeEnd: number;
  color: Color4;
  colorStart: Color4;
  colorEnd: Color4;
  rotation: number;
  rotationSpeed: number;
}

export type EmitterShape = 'point' | 'sphere' | 'cone' | 'box';

export interface EmitterConfig {
  /** Shape of the emission volume */
  shape: EmitterShape;
  /** Particles emitted per second */
  rate: number;
  /** Burst: emit N particles instantly */
  burst?: number;
  /** Max active particles */
  maxParticles: number;
  /** Particle lifetime range [min, max] seconds */
  lifetime: [number, number];
  /** Initial speed range [min, max] */
  speed: [number, number];
  /** Initial size range [min, max] */
  size: [number, number];
  /** End size range [min, max] */
  sizeEnd: [number, number];
  /** Start color */
  colorStart: Color4;
  /** End color (interpolates over lifetime) */
  colorEnd: Color4;
  /** Emitter world position */
  position: { x: number; y: number; z: number };
  /** For cone shape: half-angle in radians */
  coneAngle?: number;
  /** For sphere/box: radius/extents */
  radius?: number;
  /** Rotation speed range [min, max] */
  rotationSpeed?: [number, number];
  /** Direction bias (normalized) */
  direction?: { x: number; y: number; z: number };
}

// =============================================================================
// RANDOM HELPERS
// =============================================================================

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerpColor(a: Color4, b: Color4, t: number): Color4 {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// =============================================================================
// PARTICLE SYSTEM
// =============================================================================

export class ParticleSystem {
  private pool: Particle[] = [];
  private config: EmitterConfig;
  private emitAccumulator: number = 0;
  private activeCount: number = 0;
  private _isEmitting: boolean = true;
  private totalElapsed: number = 0;

  /** External affectors applied each frame */
  private affectors: Array<(p: Particle, delta: number) => void> = [];

  constructor(config: EmitterConfig) {
    this.config = config;

    // Pre-allocate particle pool
    for (let i = 0; i < config.maxParticles; i++) {
      this.pool.push(this.createDeadParticle());
    }
  }

  private createDeadParticle(): Particle {
    return {
      alive: false,
      age: 0,
      lifetime: 1,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      ax: 0,
      ay: 0,
      az: 0,
      size: 1,
      sizeStart: 1,
      sizeEnd: 0,
      color: { r: 1, g: 1, b: 1, a: 1 },
      colorStart: { r: 1, g: 1, b: 1, a: 1 },
      colorEnd: { r: 1, g: 1, b: 1, a: 0 },
      rotation: 0,
      rotationSpeed: 0,
    };
  }

  /**
   * Add an affector function that runs on each particle per update.
   */
  addAffector(fn: (p: Particle, delta: number) => void): void {
    this.affectors.push(fn);
  }

  /**
   * Start/stop emitting new particles.
   */
  setEmitting(emitting: boolean): void {
    this._isEmitting = emitting;
  }

  isEmitting(): boolean {
    return this._isEmitting;
  }

  /**
   * Emit a burst of N particles immediately.
   */
  burst(count: number): void {
    for (let i = 0; i < count; i++) {
      this.emitOne();
    }
  }

  /**
   * Update all particles. Call every frame.
   */
  update(delta: number): void {
    this.totalElapsed += delta;

    // --- Emit new particles ---
    if (this._isEmitting) {
      this.emitAccumulator += this.config.rate * delta;
      while (this.emitAccumulator >= 1) {
        this.emitOne();
        this.emitAccumulator -= 1;
      }
    }

    // --- Update active particles ---
    this.activeCount = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;

      p.age += delta;

      // Death check
      if (p.age >= p.lifetime) {
        p.alive = false;
        continue;
      }

      this.activeCount++;
      const lifeT = p.age / p.lifetime; // 0-1 normalized age

      // Apply affectors
      for (const affector of this.affectors) {
        affector(p, delta);
      }

      // Integrate velocity -> position
      p.vx += p.ax * delta;
      p.vy += p.ay * delta;
      p.vz += p.az * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      // Interpolate size over lifetime
      p.size = lerp(p.sizeStart, p.sizeEnd, lifeT);

      // Interpolate color over lifetime
      p.color = lerpColor(p.colorStart, p.colorEnd, lifeT);

      // Rotation
      p.rotation += p.rotationSpeed * delta;
    }
  }

  private emitOne(): void {
    // Find a dead particle to recycle
    const p = this.pool.find((particle) => !particle.alive);
    if (!p) return; // Pool exhausted

    const cfg = this.config;

    // Position & Velocity based on shape
    const { px, py, pz, vx, vy, vz } = this.sampleEmitterShape();

    p.alive = true;
    p.age = 0;
    p.lifetime = randRange(cfg.lifetime[0], cfg.lifetime[1]);
    p.x = cfg.position.x + px;
    p.y = cfg.position.y + py;
    p.z = cfg.position.z + pz;

    const speed = randRange(cfg.speed[0], cfg.speed[1]);
    p.vx = vx * speed;
    p.vy = vy * speed;
    p.vz = vz * speed;
    p.ax = 0;
    p.ay = 0;
    p.az = 0;

    p.sizeStart = randRange(cfg.size[0], cfg.size[1]);
    p.sizeEnd = randRange(cfg.sizeEnd[0], cfg.sizeEnd[1]);
    p.size = p.sizeStart;

    p.colorStart = { ...cfg.colorStart };
    p.colorEnd = { ...cfg.colorEnd };
    p.color = { ...cfg.colorStart };

    const rotRange = cfg.rotationSpeed || [0, 0];
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = randRange(rotRange[0], rotRange[1]);
  }

  private sampleEmitterShape(): {
    px: number;
    py: number;
    pz: number;
    vx: number;
    vy: number;
    vz: number;
  } {
    const dir = this.config.direction || { x: 0, y: 1, z: 0 };

    switch (this.config.shape) {
      case 'point':
        return { px: 0, py: 0, pz: 0, vx: dir.x, vy: dir.y, vz: dir.z };

      case 'sphere': {
        const r = (this.config.radius || 0.1) * Math.random();
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const sx = Math.sin(phi) * Math.cos(theta);
        const sy = Math.sin(phi) * Math.sin(theta);
        const sz = Math.cos(phi);
        return { px: sx * r, py: sy * r, pz: sz * r, vx: sx, vy: sy, vz: sz };
      }

      case 'cone': {
        const angle = this.config.coneAngle || Math.PI / 6;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * angle;
        const sx = Math.sin(phi) * Math.cos(theta);
        const sy = Math.cos(phi); // Up
        const sz = Math.sin(phi) * Math.sin(theta);
        return { px: 0, py: 0, pz: 0, vx: sx, vy: sy, vz: sz };
      }

      case 'box': {
        const r = this.config.radius || 0.5;
        const px = (Math.random() - 0.5) * r * 2;
        const py = (Math.random() - 0.5) * r * 2;
        const pz = (Math.random() - 0.5) * r * 2;
        return { px, py, pz, vx: dir.x, vy: dir.y, vz: dir.z };
      }

      default:
        return { px: 0, py: 0, pz: 0, vx: 0, vy: 1, vz: 0 };
    }
  }

  /**
   * Get all alive particles (for rendering).
   */
  getAliveParticles(): Particle[] {
    return this.pool.filter((p) => p.alive);
  }

  /**
   * Get active particle count.
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * Get the config.
   */
  getConfig(): EmitterConfig {
    return this.config;
  }

  /**
   * Update emitter position.
   */
  setPosition(x: number, y: number, z: number): void {
    this.config.position = { x, y, z };
  }
}
