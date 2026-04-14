/**
 * PhysicsIntegration.ts
 * Helper utilities for integrating multiple physics systems
 *
 * Enables cross-system interactions:
 * - Destruction → Granular: Convert destroyed fragments to particles
 * - Fluid → Granular: Water erosion of particles
 * - Cloth → Fluid: Wet cloth simulation
 * - Granular → Destruction: Particle pile stress on structures
 *
 * @module PhysicsIntegration
 */

import { VoronoiFractureSystem } from '../traits/VoronoiFractureTrait';
import { GranularMaterialSystem } from '../traits/GranularMaterialTrait';
import { FluidSimulationSystem } from '../traits/FluidSimulationTrait';
import { AdvancedClothSystem } from '../traits/AdvancedClothTrait';

// ============================================================================
// Types
// ============================================================================

export interface PhysicsIntegrationConfig {
  /** Enable destruction → granular conversion */
  enableDestructionToGranular?: boolean;
  /** Minimum fragment size to convert (smaller fragments ignored) */
  minFragmentSize?: number;
  /** Scale factor for particle size from fragment volume */
  particleSizeScale?: number;
  /** Material density for converted particles (kg/m³) */
  particleDensity?: number;
}

export interface ConversionStats {
  fragmentsConverted: number;
  particlesCreated: number;
  totalVolume: number;
  averageParticleSize: number;
}

// ============================================================================
// Destruction ↔ Granular Integration
// ============================================================================

/**
 * Manages conversion between destruction fragments and granular particles
 */
export class DestructionToGranularConverter {
  private config: Required<PhysicsIntegrationConfig>;
  private stats: ConversionStats;
  private convertedFragmentIds: Set<number>;

  constructor(config: PhysicsIntegrationConfig = {}) {
    this.config = {
      enableDestructionToGranular: config.enableDestructionToGranular ?? true,
      minFragmentSize: config.minFragmentSize ?? 0.01,
      particleSizeScale: config.particleSizeScale ?? 1.0,
      particleDensity: config.particleDensity ?? 2400, // Concrete density
    };

    this.stats = {
      fragmentsConverted: 0,
      particlesCreated: 0,
      totalVolume: 0,
      averageParticleSize: 0,
    };

    this.convertedFragmentIds = new Set<number>();
  }

  /**
   * Convert destroyed fragments from Voronoi fracture to granular particles
   *
   * @param fractureSystem - The Voronoi fracture system
   * @param granularSystem - The granular material system
   * @param recycleFragments - Whether to recycle fragments back to pool
   * @returns Statistics about the conversion
   */
  convertDestroyedFragments(
    fractureSystem: VoronoiFractureSystem,
    granularSystem: GranularMaterialSystem,
    recycleFragments = true
  ): ConversionStats {
    if (!this.config.enableDestructionToGranular) {
      return this.stats;
    }

    const fragments = fractureSystem.getFragments();
    const destroyedFragments = fragments.filter((f) => !f.active);

    let convertedCount = 0;
    let particlesCreated = 0;
    let totalVolume = 0;
    let totalParticleSize = 0;

    for (const fragment of destroyedFragments) {
      // Skip already converted fragments
      if (this.convertedFragmentIds.has(fragment.id)) {
        continue;
      }

      // Skip fragments that are too small
      if (fragment.volume < this.config.minFragmentSize) {
        if (recycleFragments) {
          fractureSystem.recycleFragment(fragment.id);
        }
        continue;
      }

      // Calculate particle radius from fragment volume
      // Volume of sphere: V = (4/3) * π * r³
      // r = ³√(3V / 4π)
      const radius =
        Math.cbrt((3 * fragment.volume) / (4 * Math.PI)) * this.config.particleSizeScale;

      // Add particle at fragment centroid
      const particleId = granularSystem.addParticle(fragment.position, radius);

      // Mark fragment as converted
      this.convertedFragmentIds.add(fragment.id);

      // Update statistics
      convertedCount++;
      particlesCreated++;
      totalVolume += fragment.volume;
      totalParticleSize += radius;

      // Recycle fragment back to pool
      if (recycleFragments) {
        fractureSystem.recycleFragment(fragment.id);
      }
    }

    // Update global statistics
    this.stats.fragmentsConverted += convertedCount;
    this.stats.particlesCreated += particlesCreated;
    this.stats.totalVolume += totalVolume;
    this.stats.averageParticleSize =
      particlesCreated > 0 ? totalParticleSize / particlesCreated : 0;

    return {
      fragmentsConverted: convertedCount,
      particlesCreated,
      totalVolume,
      averageParticleSize: this.stats.averageParticleSize,
    };
  }

  /**
   * Create particles from fragments with initial velocity
   * (useful for explosive destruction)
   */
  convertWithVelocity(
    fractureSystem: VoronoiFractureSystem,
    granularSystem: GranularMaterialSystem,
    explosionCenter: { x: number; y: number; z: number },
    explosionStrength: number,
    recycleFragments = true
  ): ConversionStats {
    const fragments = fractureSystem.getFragments();
    const destroyedFragments = fragments.filter((f) => !f.active);

    let convertedCount = 0;
    let particlesCreated = 0;
    let totalVolume = 0;
    let totalParticleSize = 0;

    for (const fragment of destroyedFragments) {
      if (fragment.volume < this.config.minFragmentSize) {
        if (recycleFragments) {
          fractureSystem.recycleFragment(fragment.id);
        }
        continue;
      }

      const radius =
        Math.cbrt((3 * fragment.volume) / (4 * Math.PI)) * this.config.particleSizeScale;

      // Calculate direction from explosion center
      const dir = {
        x: fragment.position[0] - explosionCenter[0],
        y: fragment.position[1] - explosionCenter[1],
        z: fragment.position[2] - explosionCenter[2],
      };

      const dist = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
      if (dist > 0) {
        dir[0] /= dist;
        dir[1] /= dist;
        dir[2] /= dist;
      }

      // Add particle with velocity
      const particleId = granularSystem.addParticle(fragment.position, radius);
      const particle = granularSystem.getParticle(particleId);

      if (particle) {
        // Set initial velocity based on distance from explosion
        const velocityMag = explosionStrength / Math.max(dist, 0.1);
        particle.velocity[0] = dir[0] * velocityMag;
        particle.velocity[1] = dir[1] * velocityMag;
        particle.velocity[2] = dir[2] * velocityMag;
      }

      convertedCount++;
      particlesCreated++;
      totalVolume += fragment.volume;
      totalParticleSize += radius;

      if (recycleFragments) {
        fractureSystem.recycleFragment(fragment.id);
      }
    }

    this.stats.fragmentsConverted += convertedCount;
    this.stats.particlesCreated += particlesCreated;
    this.stats.totalVolume += totalVolume;
    this.stats.averageParticleSize =
      particlesCreated > 0 ? totalParticleSize / particlesCreated : 0;

    return {
      fragmentsConverted: convertedCount,
      particlesCreated,
      totalVolume,
      averageParticleSize: this.stats.averageParticleSize,
    };
  }

  /**
   * Get overall conversion statistics
   */
  getStats(): ConversionStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      fragmentsConverted: 0,
      particlesCreated: 0,
      totalVolume: 0,
      averageParticleSize: 0,
    };
    this.convertedFragmentIds.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PhysicsIntegrationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<PhysicsIntegrationConfig> {
    return { ...this.config };
  }
}

// ============================================================================
// Granular ↔ Destruction Integration
// ============================================================================

/**
 * Apply stress from granular particle piles to destructible structures
 */
export class GranularToDestructionStress {
  /**
   * Calculate stress on destruction fragments from particle pile weight
   *
   * @param granularSystem - The granular material system
   * @param fractureSystem - The Voronoi fracture system
   * @param stressMultiplier - Scale factor for stress application
   */
  applyPileStress(
    granularSystem: GranularMaterialSystem,
    fractureSystem: VoronoiFractureSystem,
    stressMultiplier = 1.0
  ): void {
    const particles = granularSystem.getParticles();
    const fragments = fractureSystem.getFragments();

    // For each fragment, calculate total particle mass above it
    for (const fragment of fragments) {
      if (!fragment.active) continue;

      let totalMassAbove = 0;

      // Check particles within horizontal range
      for (const particle of particles) {
        const dx = particle.position[0] - fragment.position[0];
        const dz = particle.position[2] - fragment.position[2];
        const horizontalDist = Math.sqrt(dx ** 2 + dz ** 2);

        // Only consider particles above and within radius
        if (particle.position[1] > fragment.position[1] && horizontalDist < 1.0) {
          totalMassAbove += particle.mass;
        }
      }

      // Apply stress proportional to mass above
      if (totalMassAbove > 0) {
        const stress = totalMassAbove * 9.81 * stressMultiplier; // F = mg
        fractureSystem.applyStress(fragment.id, stress);
      }
    }
  }
}

// ============================================================================
// Fluid ↔ Granular Integration
// ============================================================================

/**
 * Handle fluid-granular interactions (e.g., water erosion, wet sand)
 */
export class FluidGranularInteraction {
  /**
   * Apply fluid forces to granular particles (buoyancy, drag)
   *
   * @param fluidSystem - The fluid simulation system
   * @param granularSystem - The granular material system
   * @param dragCoefficient - Fluid drag coefficient
   */
  applyFluidForces(
    fluidSystem: FluidSimulationSystem,
    granularSystem: GranularMaterialSystem,
    dragCoefficient = 0.5
  ): void {
    const granularParticles = granularSystem.getParticles();

    for (const particle of granularParticles) {
      // Get fluid density at particle position
      const fluidDensity = fluidSystem.getDensityAt(particle.position);

      if (fluidDensity > 0.1) {
        // Buoyancy force: F = ρ_fluid * V * g
        const volume = (4 / 3) * Math.PI * Math.pow(particle.radius, 3);
        const buoyancy = fluidDensity * volume * 9.81;

        particle.force[1] += buoyancy;

        // Drag force: F = 0.5 * ρ * v² * C_d * A
        const area = Math.PI * particle.radius ** 2;
        const velocityMag = Math.sqrt(
          particle.velocity[0] ** 2 + particle.velocity[1] ** 2 + particle.velocity[2] ** 2
        );

        const dragForce = 0.5 * fluidDensity * velocityMag ** 2 * dragCoefficient * area;

        if (velocityMag > 0) {
          particle.force[0] -= (particle.velocity[0] / velocityMag) * dragForce;
          particle.force[1] -= (particle.velocity[1] / velocityMag) * dragForce;
          particle.force[2] -= (particle.velocity[2] / velocityMag) * dragForce;
        }
      }
    }
  }

  /**
   * Increase granular cohesion in wet areas (simulates wet sand/mud)
   */
  applyWetness(
    fluidSystem: FluidSimulationSystem,
    granularSystem: GranularMaterialSystem,
    wetCohesionMultiplier = 2.0
  ): void {
    const granularParticles = granularSystem.getParticles();
    const config = granularSystem.getConfig();
    const baseCohesion = config.material.cohesion;

    for (const particle of granularParticles) {
      const fluidDensity = fluidSystem.getDensityAt(particle.position);

      // Increase cohesion in wet areas
      if (fluidDensity > 0.5) {
        // Store wetness factor (could be a particle property)
        const wetnessFactor = Math.min(fluidDensity / 1000, 1.0);

        // Temporarily increase cohesion for wet particles
        // (In a full implementation, this would be a per-particle property)
        granularSystem.updateConfig({
          material: {
            ...config.material,
            cohesion: baseCohesion * (1 + wetnessFactor * wetCohesionMultiplier),
          },
        });
      }
    }
  }
}

// ============================================================================
// Cloth ↔ Fluid Integration
// ============================================================================

/**
 * Handle cloth-fluid interactions (wet cloth, drag forces)
 */
export class ClothFluidInteraction {
  /**
   * Apply fluid drag forces to cloth particles
   */
  applyFluidDrag(
    clothSystem: AdvancedClothSystem,
    fluidSystem: FluidSimulationSystem,
    dragCoefficient = 1.0
  ): void {
    const clothParticles = clothSystem.getParticles();

    for (const particle of clothParticles) {
      const fluidDensity = fluidSystem.getDensityAt(particle.position);

      if (fluidDensity > 0.1) {
        // Apply drag force opposing particle velocity
        const velocityMag = Math.sqrt(
          particle.velocity[0] ** 2 + particle.velocity[1] ** 2 + particle.velocity[2] ** 2
        );

        const dragForce = dragCoefficient * fluidDensity * velocityMag;

        if (velocityMag > 0) {
          particle.velocity[0] -= (particle.velocity[0] / velocityMag) * dragForce * 0.01;
          particle.velocity[1] -= (particle.velocity[1] / velocityMag) * dragForce * 0.01;
          particle.velocity[2] -= (particle.velocity[2] / velocityMag) * dragForce * 0.01;
        }
      }
    }
  }

  /**
   * Make cloth heavier when wet
   */
  applyWetWeight(
    clothSystem: AdvancedClothSystem,
    fluidSystem: FluidSimulationSystem,
    wetWeightMultiplier = 2.0
  ): void {
    const clothParticles = clothSystem.getParticles();

    for (const particle of clothParticles) {
      const fluidDensity = fluidSystem.getDensityAt(particle.position);

      if (fluidDensity > 0.5) {
        // Increase gravity effect for wet particles
        const wetnessFactor = Math.min(fluidDensity / 1000, 1.0);
        const additionalWeight = particle.mass * 9.81 * wetnessFactor * wetWeightMultiplier;

        particle.force[1] -= additionalWeight;
      }
    }
  }
}

// ============================================================================
// Unified Physics Integration Manager
// ============================================================================

/**
 * Central manager for all physics system integrations
 */
export class PhysicsIntegrationManager {
  public destructionToGranular: DestructionToGranularConverter;
  public granularToDestruction: GranularToDestructionStress;
  public fluidGranular: FluidGranularInteraction;
  public clothFluid: ClothFluidInteraction;

  constructor(config?: PhysicsIntegrationConfig) {
    this.destructionToGranular = new DestructionToGranularConverter(config);
    this.granularToDestruction = new GranularToDestructionStress();
    this.fluidGranular = new FluidGranularInteraction();
    this.clothFluid = new ClothFluidInteraction();
  }

  /**
   * Update all active integrations in one call
   */
  update(systems: {
    fracture?: VoronoiFractureSystem;
    granular?: GranularMaterialSystem;
    fluid?: FluidSimulationSystem;
    cloth?: AdvancedClothSystem;
  }): void {
    // Destruction → Granular
    if (systems.fracture && systems.granular) {
      this.destructionToGranular.convertDestroyedFragments(systems.fracture, systems.granular);
    }

    // Granular → Destruction (pile stress)
    if (systems.granular && systems.fracture) {
      this.granularToDestruction.applyPileStress(systems.granular, systems.fracture);
    }

    // Fluid ↔ Granular
    if (systems.fluid && systems.granular) {
      this.fluidGranular.applyFluidForces(systems.fluid, systems.granular);
      this.fluidGranular.applyWetness(systems.fluid, systems.granular);
    }

    // Cloth ↔ Fluid
    if (systems.cloth && systems.fluid) {
      this.clothFluid.applyFluidDrag(systems.cloth, systems.fluid);
      this.clothFluid.applyWetWeight(systems.cloth, systems.fluid);
    }
  }
}
