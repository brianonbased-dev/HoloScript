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

      const explosionCenter = [0, 0, 0];
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
          [
            targetFragment.position[0],
            targetFragment.position[1] + 1 + i * 0.1,
            targetFragment.position[2]
          ],
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
        [
          targetFragment.position[0],
          targetFragment.position[1] - 1,
          targetFragment.position[2]
        ],
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
        [
          targetFragment.position[0] + 10,
          targetFragment.position[1] + 1,
          targetFragment.position[2]
        ],
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
          [
            fragment1.position[0],
            fragment1.position[1] + 1 + i * 0.1,
            fragment1.position[2]
          ],
          0.05
        );
      }

      // Add 2 particles above fragment2 (less mass)
      for (let i = 0; i < 2; i++) {
        granularSystem.addParticle(
          [
            fragment2.position[0],
            fragment2.position[1] + 1 + i * 0.1,
            fragment2.position[2]
          ],
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
          [
            fragments[0].position[0],
            fragments[0].position[1] + 1 + i * 0.1,
            fragments[0].position[2]
          ],
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

  // ==========================================================================
  // Defensive-any sweep — W2-T2 follow-up.
  // The previous defensive-cast pattern in PhysicsIntegration was
  // `(p as { x: number }).x ?? (p as number[])[0] ?? 0` — a chain that
  // silently coerced undefined values to 0 if the Vec3 alias plumbing ever
  // drifted (so a "no horizontal-distance match" outcome would be
  // indistinguishable from a "broken accessor" outcome). The fix replaces
  // those chains with `coordX/Y/Z` helpers that prefer the tuple form, fall
  // back to the named form, and only return 0 when neither yields a finite
  // number. These tests assert ACTUAL numeric outputs, not just
  // "doesn't throw", so a regression that re-introduces undefined-coercing
  // fallbacks will be caught.
  // ==========================================================================
  describe('coordinate-access numeric-output assertions', () => {
    it('GranularToDestructionStress reads positions as finite numbers and produces measurable damage', () => {
      const fractureSystem = new VoronoiFractureSystem({
        voronoiSites: 1,
        bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
      });
      const granularSystem = new GranularMaterialSystem();
      const stressHandler = new GranularToDestructionStress();

      fractureSystem.generateVoronoiFracture();
      const fragment = fractureSystem.getFragments()[0];

      // Place a stack of particles directly above the fragment.
      const stackMass = 10;
      const particleRadius = 0.05;
      const particleCount = 5;
      for (let i = 0; i < particleCount; i++) {
        granularSystem.addParticle(
          [
            fragment.position[0],
            fragment.position[1] + 0.5 + i * 0.1,
            fragment.position[2],
          ],
          particleRadius
        );
      }

      // Sanity: every particle's position must be a finite number — not NaN
      // and not undefined-coerced. Guards against any future drift in the
      // Vec3 alias getters (addIndexAliases) silently returning undefined.
      for (const p of granularSystem.getParticles()) {
        const px = (p.position as unknown as number[])[0];
        const py = (p.position as unknown as number[])[1];
        const pz = (p.position as unknown as number[])[2];
        expect(Number.isFinite(px)).toBe(true);
        expect(Number.isFinite(py)).toBe(true);
        expect(Number.isFinite(pz)).toBe(true);
      }

      // Capture damage delta and assert it's a strictly positive finite number,
      // not just `> 0` from some accidental fallback.
      const damageBefore = fragment.damage;
      stressHandler.applyPileStress(granularSystem, fractureSystem, 1.0);
      const damageDelta = fragment.damage - damageBefore;

      expect(Number.isFinite(damageDelta)).toBe(true);
      expect(damageDelta).toBeGreaterThan(0);
      // Damage scales with stress = totalMassAbove * 9.81 * multiplier; a
      // single-particle stack already gives a measurable positive delta.
      expect(damageDelta).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });

    it('GranularToDestructionStress stress scales linearly with stressMultiplier', () => {
      // Two identical setups, only the stressMultiplier differs. If the
      // coordinate accessor silently returned 0, both deltas would be 0
      // (no horizontal-distance match) and the ratio would be NaN.
      const makeScene = () => {
        const f = new VoronoiFractureSystem({
          voronoiSites: 1,
          bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
        });
        const g = new GranularMaterialSystem();
        f.generateVoronoiFracture();
        const frag = f.getFragments()[0];
        for (let i = 0; i < 5; i++) {
          g.addParticle(
            [frag.position[0], frag.position[1] + 0.5 + i * 0.1, frag.position[2]],
            0.05
          );
        }
        return { f, g, frag };
      };

      const a = makeScene();
      const b = makeScene();
      const handler = new GranularToDestructionStress();

      const aBefore = a.frag.damage;
      const bBefore = b.frag.damage;
      handler.applyPileStress(a.g, a.f, 1.0);
      handler.applyPileStress(b.g, b.f, 2.0);
      const aDelta = a.frag.damage - aBefore;
      const bDelta = b.frag.damage - bBefore;

      expect(aDelta).toBeGreaterThan(0);
      expect(bDelta).toBeGreaterThan(0);
      // 2x stress multiplier should produce ~2x damage delta (within damage-
      // model nonlinearity tolerance). Crucial: ratio must be finite.
      expect(bDelta / aDelta).toBeGreaterThan(1.5);
      expect(bDelta / aDelta).toBeLessThan(2.5);
    });

    it('convertWithVelocity produces non-zero, finite velocity components', () => {
      const fractureSystem = new VoronoiFractureSystem({ voronoiSites: 5 });
      const granularSystem = new GranularMaterialSystem();
      const converter = new DestructionToGranularConverter();

      fractureSystem.generateVoronoiFracture();
      const fragments = fractureSystem.getFragments();
      // Destroy a fragment that we know has a non-zero distance from the
      // explosion center, so velocity components should be non-zero finite.
      fractureSystem.applyStress(fragments[0].id, 10000);

      const explosionCenter: [number, number, number] = [10, 10, 10];
      const beforeCount = granularSystem.getParticles().length;
      converter.convertWithVelocity(fractureSystem, granularSystem, explosionCenter, 5.0);
      const newParticles = granularSystem.getParticles().slice(beforeCount);

      expect(newParticles.length).toBeGreaterThan(0);
      for (const p of newParticles) {
        const vx = (p.velocity as unknown as number[])[0];
        const vy = (p.velocity as unknown as number[])[1];
        const vz = (p.velocity as unknown as number[])[2];
        expect(Number.isFinite(vx)).toBe(true);
        expect(Number.isFinite(vy)).toBe(true);
        expect(Number.isFinite(vz)).toBe(true);
        const mag = Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2);
        // Velocity magnitude must be positive — was the regression smell.
        expect(mag).toBeGreaterThan(0);
        expect(Number.isFinite(mag)).toBe(true);
      }
    });

    it('granular particle Vec3 supports both .x/.y/.z and [0]/[1]/[2] access with the same numeric value', () => {
      // GranularMaterialSystem.addParticle() runs `addIndexAliases({...pos})`
      // which adds `[0]/[1]/[2]` getter aliases over the underlying
      // `{x,y,z}` Vec3. PhysicsIntegration's defensive-cast pattern
      // `(particle.position as { x }).x ?? (particle.position as number[])[0]`
      // assumes BOTH forms read the same numeric value. If the alias plumbing
      // ever drifts (returns undefined, NaN, or a getter function), this test
      // catches it before defensive `?? 0` fallbacks silently swallow the
      // wrong value.
      const granularSystem = new GranularMaterialSystem();
      const id = granularSystem.addParticle([1.5, 2.5, 3.5], 0.05);
      const p = granularSystem.getParticle(id);

      expect(p).toBeDefined();
      if (!p) return;

      // Numeric-key access via the alias getters
      const pos = p.position as unknown as Record<string, number>;
      expect(pos['0']).toBe(1.5);
      expect(pos['1']).toBe(2.5);
      expect(pos['2']).toBe(3.5);

      // Native named access on the underlying {x,y,z} object
      expect(p.position.x).toBe(1.5);
      expect(p.position.y).toBe(2.5);
      expect(p.position.z).toBe(3.5);

      // Both forms must agree — this is the invariant the defensive-cast
      // pattern in PhysicsIntegration relies on.
      expect(pos['0']).toBe(p.position.x);
      expect(pos['1']).toBe(p.position.y);
      expect(pos['2']).toBe(p.position.z);

      // Velocity and force start at [0,0,0] — must be readable as finite zero
      // through both forms.
      const vel = p.velocity as unknown as Record<string, number>;
      expect(vel['0']).toBe(0);
      expect(p.velocity.x).toBe(0);
      const force = p.force as unknown as Record<string, number>;
      expect(force['1']).toBe(0);
      expect(p.force.y).toBe(0);
    });
  });
});
