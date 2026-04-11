/**
 * AvalanchePhysics.ts
 *
 * Core avalanche physics simulation: triggering, state transitions, entrainment,
 * momentum transfer, friction, drag, terrain collision, and settling.
 *
 * Week 6: Avalanche Simulation - Avalanche Physics Engine
 */

import type { TerrainData } from './TerrainGenerator';
import type { SnowParticle } from './SnowAccumulation';

export interface AvalancheConfig {
  /** Gravity acceleration (m/s²) */
  gravity: number;
  /** Friction coefficient (snow on snow) */
  frictionCoefficient: number;
  /** Air drag coefficient */
  dragCoefficient: number;
  /** Entrainment pickup radius (m) */
  entrainmentRadius: number;
  /** Minimum velocity to entrain resting particles (m/s) */
  entrainmentThreshold: number;
  /** Coefficient of restitution (bounce factor) */
  restitution: number;
  /** Settling velocity threshold (m/s) */
  settlingVelocity: number;
}

export interface CollapseEvent {
  /** Event timestamp */
  time: number;
  /** Number of particles affected */
  particleCount: number;
  /** Event type */
  type: 'trigger' | 'entrainment' | 'collision';
  /** Event position [x, y, z] */
  position: [number, number, number];
}

export interface AvalancheStats {
  /** Total simulation time */
  elapsedTime: number;
  /** Is avalanche active */
  isActive: boolean;
  /** Resting particle count */
  restingCount: number;
  /** Sliding particle count */
  slidingCount: number;
  /** Airborne particle count */
  airborneCount: number;
  /** Average velocity of moving particles */
  avgVelocity: number;
  /** Maximum velocity */
  maxVelocity: number;
  /** Total collapse events */
  collapseEvents: number;
  /** Entrainment events */
  entrainmentCount: number;
}

/**
 * Avalanche physics simulation engine
 */
export class AvalanchePhysics {
  private config: AvalancheConfig;
  private terrain: TerrainData;
  private particles: SnowParticle[];
  private elapsedTime = 0;
  private isTriggered = false;
  private collapseEvents: CollapseEvent[] = [];

  constructor(terrain: TerrainData, particles: SnowParticle[], config: AvalancheConfig) {
    this.terrain = terrain;
    this.particles = particles;
    this.config = config;
  }

  /**
   * Trigger avalanche at epicenter
   */
  public triggerAvalanche(epicenter: [number, number], radius: number): void {
    const { angleOfRepose = 35 } = this.getAngleOfRepose();
    const angleOfReposeRad = (angleOfRepose * Math.PI) / 180;

    let triggeredCount = 0;

    for (const particle of this.particles) {
      if (particle.state !== 'resting') continue;

      // Check distance from epicenter
      const dx = particle.position[0] - epicenter[0];
      const dz = particle.position[2] - epicenter[1];
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= radius) {
        // Get terrain slope at particle position
        const slope = this.getTerrainSlope(particle.position[0], particle.position[2]);

        // Only trigger if slope is steep enough
        if (slope > angleOfReposeRad * 0.7) {
          // Transition to sliding
          particle.state = 'sliding';

          // Give initial downslope velocity
          const downslope = this.getDownslopeDirection(particle.position[0], particle.position[2]);
          const initialSpeed = 1.0 + Math.random() * 0.5; // 1-1.5 m/s

          particle.velocity = [
            downslope[0] * initialSpeed,
            downslope[1] * initialSpeed,
            downslope[2] * initialSpeed,
          ];

          triggeredCount++;
        }
      }
    }

    if (triggeredCount > 0) {
      this.isTriggered = true;

      this.collapseEvents.push({
        time: this.elapsedTime,
        particleCount: triggeredCount,
        type: 'trigger',
        position: [epicenter[0], 0, epicenter[1]],
      });
    }
  }

  /**
   * Update physics simulation
   */
  public update(dt: number): void {
    this.elapsedTime += dt;

    if (!this.isTriggered) return;

    // Update all particles
    for (const particle of this.particles) {
      this.updateParticle(particle, dt);
    }

    // Process entrainment (snowball effect)
    this.updateEntrainment(dt);
  }

  /**
   * Update individual particle physics based on state
   */
  private updateParticle(particle: SnowParticle, dt: number): void {
    const { gravity, frictionCoefficient, dragCoefficient, restitution, settlingVelocity } =
      this.config;

    switch (particle.state) {
      case 'resting':
        // No motion, particle is at rest
        break;

      case 'sliding': {
        // Terrain-following motion with friction
        const terrainHeight = this.getTerrainHeight(particle.position[0], particle.position[2]);
        const downslope = this.getDownslopeDirection(particle.position[0], particle.position[2]);

        // Gravity force along slope
        const gravityForce = [
          downslope[0] * gravity,
          downslope[1] * gravity,
          downslope[2] * gravity,
        ];

        // Friction force (opposes motion)
        const speed = this.getSpeed(particle.velocity);
        const frictionForce =
          speed > 0.01
            ? [
                (-particle.velocity[0] / speed) * frictionCoefficient * gravity,
                (-particle.velocity[1] / speed) * frictionCoefficient * gravity,
                (-particle.velocity[2] / speed) * frictionCoefficient * gravity,
              ]
            : [0, 0, 0];

        // Total acceleration
        const acceleration = [
          gravityForce[0] + frictionForce[0],
          gravityForce[1] + frictionForce[1],
          gravityForce[2] + frictionForce[2],
        ];

        // Update velocity (semi-implicit Euler)
        particle.velocity[0] += acceleration[0] * dt;
        particle.velocity[1] += acceleration[1] * dt;
        particle.velocity[2] += acceleration[2] * dt;

        // Update position
        particle.position[0] += particle.velocity[0] * dt;
        particle.position[1] += particle.velocity[1] * dt;
        particle.position[2] += particle.velocity[2] * dt;

        // Terrain collision (keep on surface)
        if (particle.position[1] < terrainHeight) {
          particle.position[1] = terrainHeight;

          // Check if going too fast (launch into air)
          const verticalSpeed = Math.abs(particle.velocity[1]);
          if (verticalSpeed > 2.0) {
            // Transition to airborne
            particle.state = 'airborne';
            particle.velocity[1] = Math.abs(particle.velocity[1]) * 0.5; // Upward bounce
          } else {
            // Stay on terrain, remove vertical velocity
            particle.velocity[1] = 0;
          }
        }

        // Settling detection
        if (this.getSpeed(particle.velocity) < settlingVelocity) {
          particle.state = 'resting';
          particle.velocity = [0, 0, 0];

          // Snap to terrain surface
          particle.position[1] = terrainHeight;
        }
        break;
      }

      case 'airborne': {
        // Free-fall with drag
        const speed = this.getSpeed(particle.velocity);
        const dragMagnitude = dragCoefficient * speed * speed * 0.001; // Simplified drag

        const dragForce =
          speed > 0.01
            ? [
                (-particle.velocity[0] / speed) * dragMagnitude,
                (-particle.velocity[1] / speed) * dragMagnitude,
                (-particle.velocity[2] / speed) * dragMagnitude,
              ]
            : [0, 0, 0];

        // Total acceleration (gravity + drag)
        const acceleration = [dragForce[0], -gravity + dragForce[1], dragForce[2]];

        // Update velocity
        particle.velocity[0] += acceleration[0] * dt;
        particle.velocity[1] += acceleration[1] * dt;
        particle.velocity[2] += acceleration[2] * dt;

        // Update position
        particle.position[0] += particle.velocity[0] * dt;
        particle.position[1] += particle.velocity[1] * dt;
        particle.position[2] += particle.velocity[2] * dt;

        // Terrain collision with bounce
        const terrainHeight = this.getTerrainHeight(particle.position[0], particle.position[2]);

        if (particle.position[1] <= terrainHeight) {
          particle.position[1] = terrainHeight;

          // Bounce with restitution
          particle.velocity[1] = -particle.velocity[1] * restitution;

          // Record collision event
          this.collapseEvents.push({
            time: this.elapsedTime,
            particleCount: 1,
            type: 'collision',
            position: [...particle.position] as [number, number, number],
          });

          // Transition to sliding if bounce is small
          if (Math.abs(particle.velocity[1]) < 1.0) {
            particle.state = 'sliding';
          }
        }
        break;
      }
    }
  }

  /**
   * Process entrainment (snowball effect)
   */
  private updateEntrainment(_dt: number): void {
    const { entrainmentRadius, entrainmentThreshold } = this.config;

    // Get sliding particles (potential entrainers)
    const slidingParticles = this.particles.filter((p) => p.state === 'sliding');

    // Get resting particles (potential to be entrained)
    const restingParticles = this.particles.filter((p) => p.state === 'resting');

    let entrainedCount = 0;

    for (const sliding of slidingParticles) {
      const slidingSpeed = this.getSpeed(sliding.velocity);

      // Only fast-moving particles can entrain
      if (slidingSpeed < entrainmentThreshold) continue;

      // Find nearby resting particles
      for (const resting of restingParticles) {
        const dx = resting.position[0] - sliding.position[0];
        const dy = resting.position[1] - sliding.position[1];
        const dz = resting.position[2] - sliding.position[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= entrainmentRadius) {
          // Entrain the particle
          resting.state = 'sliding';

          // Transfer some momentum (simplified)
          resting.velocity[0] = sliding.velocity[0] * 0.5;
          resting.velocity[1] = sliding.velocity[1] * 0.5;
          resting.velocity[2] = sliding.velocity[2] * 0.5;

          // Slow down the entraining particle (conservation of momentum)
          sliding.velocity[0] *= 0.95;
          sliding.velocity[1] *= 0.95;
          sliding.velocity[2] *= 0.95;

          entrainedCount++;

          // Limit entrainment per frame to prevent performance issues
          if (entrainedCount > 100) break;
        }
      }

      if (entrainedCount > 100) break;
    }

    if (entrainedCount > 0) {
      this.collapseEvents.push({
        time: this.elapsedTime,
        particleCount: entrainedCount,
        type: 'entrainment',
        position: [0, 0, 0], // Generic position
      });
    }
  }

  /**
   * Get terrain height at position
   */
  private getTerrainHeight(x: number, z: number): number {
    const { width, depth, resolution } = this.terrain.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get integer grid coordinates
    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const z1 = Math.min(z0 + 1, resolution - 1);

    // Fractional parts
    const fx = cx - x0;
    const fz = cz - z0;

    // Get heights at 4 corners
    const h00 = this.terrain.heightmap[z0 * resolution + x0];
    const h10 = this.terrain.heightmap[z0 * resolution + x1];
    const h01 = this.terrain.heightmap[z1 * resolution + x0];
    const h11 = this.terrain.heightmap[z1 * resolution + x1];

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Get terrain slope at position
   */
  private getTerrainSlope(x: number, z: number): number {
    const { width, depth, resolution } = this.terrain.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get nearest grid cell
    const gridX = Math.round(cx);
    const gridZ = Math.round(cz);
    const index = gridZ * resolution + gridX;

    return this.terrain.slopes[index];
  }

  /**
   * Get downslope direction (normalized)
   */
  private getDownslopeDirection(x: number, z: number): [number, number, number] {
    const { width, depth, resolution } = this.terrain.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get integer grid coordinates
    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);

    // Calculate gradient (height change)
    const cellWidth = width / (resolution - 1);
    const cellDepth = depth / (resolution - 1);

    const hL =
      x0 > 0
        ? this.terrain.heightmap[z0 * resolution + (x0 - 1)]
        : this.terrain.heightmap[z0 * resolution + x0];
    const hR =
      x0 < resolution - 1
        ? this.terrain.heightmap[z0 * resolution + (x0 + 1)]
        : this.terrain.heightmap[z0 * resolution + x0];
    const hD =
      z0 > 0
        ? this.terrain.heightmap[(z0 - 1) * resolution + x0]
        : this.terrain.heightmap[z0 * resolution + x0];
    const hU =
      z0 < resolution - 1
        ? this.terrain.heightmap[(z0 + 1) * resolution + x0]
        : this.terrain.heightmap[z0 * resolution + x0];

    // Gradient direction (negative for downslope)
    const dx = -(hR - hL) / (2 * cellWidth);
    const dz = -(hU - hD) / (2 * cellDepth);

    // Normalize
    const length = Math.sqrt(dx * dx + 1 + dz * dz);

    return [dx / length, -1 / length, dz / length];
  }

  /**
   * Get speed (magnitude of velocity)
   */
  private getSpeed(velocity: [number, number, number]): number {
    return Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
  }

  /**
   * Get angle of repose from config (default 35°)
   */
  private getAngleOfRepose(): { angleOfRepose: number } {
    // Default angle of repose for snow
    return { angleOfRepose: 35 };
  }

  /**
   * Get all particles
   */
  public getParticles(): SnowParticle[] {
    return this.particles;
  }

  /**
   * Get particles by state
   */
  public getParticlesByState(state: 'resting' | 'sliding' | 'airborne'): SnowParticle[] {
    return this.particles.filter((p) => p.state === state);
  }

  /**
   * Get collapse events
   */
  public getCollapseEvents(): CollapseEvent[] {
    return this.collapseEvents;
  }

  /**
   * Get avalanche statistics
   */
  public getStatistics(): AvalancheStats {
    let restingCount = 0;
    let slidingCount = 0;
    let airborneCount = 0;
    let totalVelocity = 0;
    let maxVelocity = 0;

    for (const particle of this.particles) {
      const speed = this.getSpeed(particle.velocity);

      if (particle.state === 'resting') {
        restingCount++;
      } else if (particle.state === 'sliding') {
        slidingCount++;
        totalVelocity += speed;
        maxVelocity = Math.max(maxVelocity, speed);
      } else if (particle.state === 'airborne') {
        airborneCount++;
        totalVelocity += speed;
        maxVelocity = Math.max(maxVelocity, speed);
      }
    }

    const movingCount = slidingCount + airborneCount;
    const avgVelocity = movingCount > 0 ? totalVelocity / movingCount : 0;

    const entrainmentCount = this.collapseEvents.filter((e) => e.type === 'entrainment').length;

    return {
      elapsedTime: this.elapsedTime,
      isActive: this.isTriggered,
      restingCount,
      slidingCount,
      airborneCount,
      avgVelocity,
      maxVelocity,
      collapseEvents: this.collapseEvents.length,
      entrainmentCount,
    };
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    this.elapsedTime = 0;
    this.isTriggered = false;
    this.collapseEvents = [];

    // Reset all particles to resting
    for (const particle of this.particles) {
      particle.state = 'resting';
      particle.velocity = [0, 0, 0];
      particle.age = 0;

      // Reset position to terrain surface
      const terrainHeight = this.getTerrainHeight(particle.position[0], particle.position[2]);
      particle.position[1] = terrainHeight;
    }
  }
}
