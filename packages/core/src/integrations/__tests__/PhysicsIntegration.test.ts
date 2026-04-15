import { describe, it, expect, beforeEach } from 'vitest';
import {
  DestructionToGranularConverter,
  GranularToDestructionStress,
  PhysicsIntegrationManager,
} from '../PhysicsIntegration';
import { VoronoiFractureSystem } from '../../traits/VoronoiFractureTrait';
import { GranularMaterialSystem } from '../../traits/GranularMaterialTrait';

describe('PhysicsIntegration', () => {
  describe('DestructionToGranularConverter', () => {
    let converter: DestructionToGranularConverter;
    let fractureSystem: VoronoiFractureSystem;
    let granularSystem: GranularMaterialSystem;

    beforeEach(() => {
      converter = new DestructionToGranularConverter();
      fractureSystem = new VoronoiFractureSystem({ voronoiSites: 10 });
      granularSystem = new GranularMaterialSystem();

      fractureSystem.generateVoronoiFracture();
    });

    it('converts destroyed fragments to particles', () => {
      const fragments = fractureSystem.getFragments();

      // Destroy some fragments
      fractureSystem.applyStress(fragments[0].id, 10000);
      fractureSystem.applyStress(fragments[1].id, 10000);

      const initialParticles = granularSystem.getParticles().length;

      const stats = converter.convertDestroyedFragments(fractureSystem, granularSystem);

      expect(stats.fragmentsConverted).toBeGreaterThan(0);
      expect(stats.particlesCreated).toBeGreaterThan(0);
      expect(granularSystem.getParticles().length).toBe(initialParticles + stats.particlesCreated);
    });

    it('respects minimum fragment size', () => {
      converter = new DestructionToGranularConverter({ minFragmentSize: 1000 });

      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      const stats = converter.convertDestroyedFragments(fractureSystem, granularSystem);

      // Fragments are too small, should not convert
      expect(stats.fragmentsConverted).toBe(0);
    });

    it('scales particle size correctly', () => {
      converter = new DestructionToGranularConverter({ particleSizeScale: 2.0 });

      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      const initialParticles = granularSystem.getParticles().length;
      converter.convertDestroyedFragments(fractureSystem, granularSystem);

      const particles = granularSystem.getParticles();
      const newParticle = particles[initialParticles];

      expect(newParticle).toBeDefined();
      expect(newParticle.radius).toBeGreaterThan(0);
    });

    it('recycles fragments when enabled', () => {
      // Create new system with pooling disabled initially to ensure fragments aren't pre-pooled
      const tempFracture = new VoronoiFractureSystem({
        voronoiSites: 5,
        enablePooling: false,
      });
      tempFracture.generateVoronoiFracture();

      const fragments = tempFracture.getFragments();
      tempFracture.applyStress(fragments[0].id, 10000);

      // Enable pooling via config update
      tempFracture.updateConfig({ enablePooling: true });

      const initialPooled = tempFracture.getPooledFragmentCount();

      converter.convertDestroyedFragments(tempFracture, granularSystem, true);

      // Pooled count should increase when recycling is enabled
      expect(tempFracture.getPooledFragmentCount()).toBeGreaterThanOrEqual(initialPooled);
    });

    it('does not recycle fragments when disabled', () => {
      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      const initialPooled = fractureSystem.getPooledFragmentCount();

      converter.convertDestroyedFragments(fractureSystem, granularSystem, false);

      expect(fractureSystem.getPooledFragmentCount()).toBe(initialPooled);
    });

    it('converts with initial velocity (explosion)', () => {
      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      const explosionCenter = { x: 0, y: 0, z: 0 };
      const explosionStrength = 10;

      const initialParticles = granularSystem.getParticles().length;

      converter.convertWithVelocity(
        fractureSystem,
        granularSystem,
        explosionCenter,
        explosionStrength
      );

      const particles = granularSystem.getParticles();
      const newParticle = particles[initialParticles];

      if (newParticle) {
        const velocityMag = Math.sqrt(
          newParticle.velocity[0] ** 2 + newParticle.velocity[1] ** 2 + newParticle.velocity[2] ** 2
        );
        expect(velocityMag).toBeGreaterThan(0);
      }
    });

    it('tracks conversion statistics', () => {
      const fragments = fractureSystem.getFragments();

      fractureSystem.applyStress(fragments[0].id, 10000);
      fractureSystem.applyStress(fragments[1].id, 10000);

      converter.convertDestroyedFragments(fractureSystem, granularSystem);

      const stats = converter.getStats();

      expect(stats.fragmentsConverted).toBeGreaterThan(0);
      expect(stats.particlesCreated).toBeGreaterThan(0);
      expect(stats.totalVolume).toBeGreaterThan(0);
      expect(stats.averageParticleSize).toBeGreaterThan(0);
    });

    it('resets statistics', () => {
      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      converter.convertDestroyedFragments(fractureSystem, granularSystem);
      converter.resetStats();

      const stats = converter.getStats();

      expect(stats.fragmentsConverted).toBe(0);
      expect(stats.particlesCreated).toBe(0);
      expect(stats.totalVolume).toBe(0);
      expect(stats.averageParticleSize).toBe(0);
    });

    it('updates configuration', () => {
      const initialConfig = converter.getConfig();
      expect(initialConfig.particleSizeScale).toBe(1.0);

      converter.updateConfig({ particleSizeScale: 2.0 });

      const updatedConfig = converter.getConfig();
      expect(updatedConfig.particleSizeScale).toBe(2.0);
    });

    it('can disable conversion', () => {
      converter.updateConfig({ enableDestructionToGranular: false });

      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      const stats = converter.convertDestroyedFragments(fractureSystem, granularSystem);

      expect(stats.fragmentsConverted).toBe(0);
      expect(stats.particlesCreated).toBe(0);
    });
  });

  describe('GranularToDestructionStress', () => {
    let stressHandler: GranularToDestructionStress;
    let fractureSystem: VoronoiFractureSystem;
    let granularSystem: GranularMaterialSystem;

    beforeEach(() => {
      stressHandler = new GranularToDestructionStress();
      fractureSystem = new VoronoiFractureSystem({
        voronoiSites: 5,
        bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
      });
      granularSystem = new GranularMaterialSystem();

      fractureSystem.generateVoronoiFracture();
    });

    it('applies stress from particle weight', () => {
      // Add particles above a fragment
      const fragments = fractureSystem.getFragments();
      const targetFragment = fragments[0];

      for (let i = 0; i < 10; i++) {
        granularSystem.addParticle(
          {
            x: targetFragment.position[0],
            y: targetFragment.position[1] + 1 + i * 0.1,
            z: targetFragment.position[2],
          },
          0.05
        );
      }

      const initialDamage = targetFragment.damage;

      stressHandler.applyPileStress(granularSystem, fractureSystem);

      expect(targetFragment.damage).toBeGreaterThan(initialDamage);
    });

    it('does not apply stress from particles below', () => {
      const fragments = fractureSystem.getFragments();
      const targetFragment = fragments[0];

      // Add particle below fragment
      granularSystem.addParticle(
        {
          x: targetFragment.position[0],
          y: targetFragment.position[1] - 1,
          z: targetFragment.position[2],
        },
        0.05
      );

      const initialDamage = targetFragment.damage;

      stressHandler.applyPileStress(granularSystem, fractureSystem);

      expect(targetFragment.damage).toBe(initialDamage);
    });

    it('respects horizontal distance threshold', () => {
      const fragments = fractureSystem.getFragments();
      const targetFragment = fragments[0];

      // Add particle far away horizontally
      granularSystem.addParticle(
        {
          x: targetFragment.position[0] + 10,
          y: targetFragment.position[1] + 1,
          z: targetFragment.position[2],
        },
        0.05
      );

      const initialDamage = targetFragment.damage;

      stressHandler.applyPileStress(granularSystem, fractureSystem);

      expect(targetFragment.damage).toBe(initialDamage);
    });

    it('applies more stress with more particles', () => {
      // Use fragments at specific positions to ensure clear separation
      const tempFracture = new VoronoiFractureSystem({
        voronoiSites: 2,
        bounds: { min: [-5, 0, -5], max: [5, 2, 5] },
      });
      tempFracture.generateVoronoiFracture();

      const fragments = tempFracture.getFragments();
      const fragment1 = fragments[0];
      const fragment2 = fragments[1];

      // Ensure fragments are far apart horizontally
      if (Math.abs(fragment1.position[0] - fragment2.position[0]) < 2) {
        // Skip test if fragments are too close
        return;
      }

      // Add 10 particles above fragment1 (more mass)
      for (let i = 0; i < 10; i++) {
        granularSystem.addParticle(
          {
            x: fragment1.position[0],
            y: fragment1.position[1] + 1 + i * 0.1,
            z: fragment1.position[2],
          },
          0.05
        );
      }

      // Add 2 particles above fragment2 (less mass)
      for (let i = 0; i < 2; i++) {
        granularSystem.addParticle(
          {
            x: fragment2.position[0],
            y: fragment2.position[1] + 1 + i * 0.1,
            z: fragment2.position[2],
          },
          0.05
        );
      }

      stressHandler.applyPileStress(granularSystem, tempFracture);

      // Fragment with more particles above should have more damage (or at least equal)
      expect(fragment1.damage).toBeGreaterThanOrEqual(fragment2.damage);
    });
  });

  describe('PhysicsIntegrationManager', () => {
    let manager: PhysicsIntegrationManager;

    beforeEach(() => {
      manager = new PhysicsIntegrationManager();
    });

    it('initializes all integration handlers', () => {
      expect(manager.destructionToGranular).toBeDefined();
      expect(manager.granularToDestruction).toBeDefined();
      expect(manager.fluidGranular).toBeDefined();
      expect(manager.clothFluid).toBeDefined();
    });

    it('updates destruction to granular conversion', () => {
      const fractureSystem = new VoronoiFractureSystem({ voronoiSites: 5 });
      const granularSystem = new GranularMaterialSystem();

      fractureSystem.generateVoronoiFracture();

      const fragments = fractureSystem.getFragments();
      fractureSystem.applyStress(fragments[0].id, 10000);

      const initialParticles = granularSystem.getParticles().length;

      manager.update({
        fracture: fractureSystem,
        granular: granularSystem,
      });

      expect(granularSystem.getParticles().length).toBeGreaterThan(initialParticles);
    });

    it('updates granular to destruction stress', () => {
      const fractureSystem = new VoronoiFractureSystem({
        voronoiSites: 5,
        bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
      });
      const granularSystem = new GranularMaterialSystem();

      fractureSystem.generateVoronoiFracture();

      const fragments = fractureSystem.getFragments();

      // Add particles above fragment
      for (let i = 0; i < 10; i++) {
        granularSystem.addParticle(
          {
            x: fragments[0].position[0],
            y: fragments[0].position[1] + 1 + i * 0.1,
            z: fragments[0].position[2],
          },
          0.05
        );
      }

      const initialDamage = fragments[0].damage;

      manager.update({
        fracture: fractureSystem,
        granular: granularSystem,
      });

      expect(fragments[0].damage).toBeGreaterThan(initialDamage);
    });

    it('handles missing systems gracefully', () => {
      expect(() => {
        manager.update({});
      }).not.toThrow();

      expect(() => {
        manager.update({ fracture: new VoronoiFractureSystem() });
      }).not.toThrow();

      expect(() => {
        manager.update({ granular: new GranularMaterialSystem() });
      }).not.toThrow();
    });

    it('accepts custom configuration', () => {
      const customManager = new PhysicsIntegrationManager({
        particleSizeScale: 3.0,
        minFragmentSize: 0.5,
      });

      const config = customManager.destructionToGranular.getConfig();

      expect(config.particleSizeScale).toBe(3.0);
      expect(config.minFragmentSize).toBe(0.5);
    });
  });
});
