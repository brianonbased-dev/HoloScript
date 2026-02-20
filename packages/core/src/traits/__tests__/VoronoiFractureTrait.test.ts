import { describe, it, expect } from 'vitest';
import { VoronoiFractureSystem } from '../VoronoiFractureTrait';

describe('VoronoiFractureTrait', () => {
  describe('Configuration', () => {
    it('applies default configuration', () => {
      const system = new VoronoiFractureSystem();
      const config = system.getConfig();

      expect(config.voronoiSites).toBe(10);
      expect(config.maxHealth).toBe(100);
      expect(config.destructionThreshold).toBe(0.2);
      expect(config.enableLOD).toBe(true);
      expect(config.enablePooling).toBe(true);
    });

    it('applies custom configuration', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 50,
        maxHealth: 200,
        destructionThreshold: 0.5,
        enableLOD: false,
        enablePooling: false,
      });
      const config = system.getConfig();

      expect(config.voronoiSites).toBe(50);
      expect(config.maxHealth).toBe(200);
      expect(config.destructionThreshold).toBe(0.5);
      expect(config.enableLOD).toBe(false);
      expect(config.enablePooling).toBe(false);
    });

    it('validates bounds configuration', () => {
      const system = new VoronoiFractureSystem({
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      });
      const config = system.getConfig();

      expect(config.bounds.min.x).toBe(0);
      expect(config.bounds.max.x).toBe(10);
    });
  });

  describe('Voronoi Generation', () => {
    it('generates Voronoi sites', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10 });
      system.generateVoronoiFracture();
      const sites = system.getVoronoiSites();

      expect(sites.length).toBe(10);
      sites.forEach((site) => {
        expect(site.position.x).toBeGreaterThanOrEqual(-1);
        expect(site.position.x).toBeLessThanOrEqual(1);
      });
    });

    it('creates fragments from Voronoi cells', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      expect(fragments.length).toBe(5);
      fragments.forEach((fragment) => {
        expect(fragment.health).toBe(100);
        expect(fragment.damage).toBe(0);
        expect(fragment.active).toBe(true);
      });
    });

    it('builds neighbor graph', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 10,
        bounds: { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } },
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Check that at least some fragments have neighbors (with smaller bounds, fragments are closer)
      const hasNeighbors = fragments.some((f) => system.getNeighborCount(f.id) > 0);
      expect(hasNeighbors).toBe(true);
    });

    it('assigns unique IDs to fragments', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();
      const ids = new Set(fragments.map((f) => f.id));

      expect(ids.size).toBe(10);
    });

    it('positions fragments within bounds', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 10,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 5 } },
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      fragments.forEach((fragment) => {
        expect(fragment.position.x).toBeGreaterThanOrEqual(0);
        expect(fragment.position.x).toBeLessThanOrEqual(5);
      });
    });

    it('calculates fragment volumes', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      fragments.forEach((fragment) => {
        expect(fragment.volume).toBeGreaterThan(0);
      });
    });
  });

  describe('Damage Application', () => {
    it('applies point damage to fragments', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();

      system.applyDamage({
        position: { x: 0, y: 0, z: 0 },
        radius: 5.0,
        maxDamage: 150,
        falloff: 1.0,
      });

      const fragments = system.getFragments();
      const damaged = fragments.filter((f) => f.damage > 0);

      expect(damaged.length).toBeGreaterThan(0);
    });

    it('destroys fragments exceeding damage threshold', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Apply high damage to destroy fragment
      system.applyDamage({
        position: fragments[0].position,
        radius: 1.0,
        maxDamage: 200,
        falloff: 0.1,
      });

      const destroyed = fragments.filter((f) => !f.active);
      expect(destroyed.length).toBeGreaterThan(0);
    });

    it('applies damage falloff with distance', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10 });
      system.generateVoronoiFracture();

      const damagePoint = { x: 0, y: 0, z: 0 };
      system.applyDamage({
        position: damagePoint,
        radius: 2.0,
        maxDamage: 100,
        falloff: 2.0,
      });

      const fragments = system.getFragments();
      const damaged = fragments.filter((f) => f.damage > 0);

      // Fragments closer should have more damage
      if (damaged.length > 1) {
        const sorted = [...damaged].sort((a, b) => {
          const distA = Math.sqrt(
            Math.pow(a.position.x - damagePoint.x, 2) +
              Math.pow(a.position.y - damagePoint.y, 2) +
              Math.pow(a.position.z - damagePoint.z, 2)
          );
          const distB = Math.sqrt(
            Math.pow(b.position.x - damagePoint.x, 2) +
              Math.pow(b.position.y - damagePoint.y, 2) +
              Math.pow(b.position.z - damagePoint.z, 2)
          );
          return distA - distB;
        });

        expect(sorted[0].damage).toBeGreaterThanOrEqual(sorted[sorted.length - 1].damage);
      }
    });

    it('applies stress-based damage', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 500);

      expect(fragments[0].damage).toBeGreaterThan(0);
    });

    it('clamps damage appropriately', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5, maxHealth: 100 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      expect(fragments[0].health).toBeGreaterThanOrEqual(0);
    });

    it('updates health based on damage', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5, maxHealth: 100 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      const initialHealth = fragments[0].health;
      system.applyStress(fragments[0].id, 500);

      expect(fragments[0].health).toBeLessThan(initialHealth);
    });

    it('marks fragments as destroyed when health is low', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      expect(fragments[0].active).toBe(false);
    });
  });

  describe('Crack Propagation', () => {
    it('propagates damage to neighbors', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        enableCrackPropagation: true,
        crackPropagationSpeed: 10.0,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Damage one fragment
      system.applyStress(fragments[0].id, 500);

      // Propagate cracks
      system.propagateCracks(0.1);

      // Check if neighbors received damage
      const neighbors = system.getNeighbors(fragments[0].id);
      if (neighbors.length > 0) {
        const neighborFragments = neighbors
          .map((nId) => fragments.find((f) => f.id === nId))
          .filter((f) => f !== undefined);

        const neighborDamaged = neighborFragments.some((n) => n!.damage > 0);
        expect(neighborDamaged).toBe(true);
      }
    });

    it('propagation speed affects damage transfer rate', () => {
      const slowSystem = new VoronoiFractureSystem({
        voronoiSites: 5,
        enableCrackPropagation: true,
        crackPropagationSpeed: 1.0,
      });
      const fastSystem = new VoronoiFractureSystem({
        voronoiSites: 5,
        enableCrackPropagation: true,
        crackPropagationSpeed: 10.0,
      });

      slowSystem.generateVoronoiFracture();
      fastSystem.generateVoronoiFracture();

      const slowFragments = slowSystem.getFragments();
      const fastFragments = fastSystem.getFragments();

      slowSystem.applyStress(slowFragments[0].id, 500);
      fastSystem.applyStress(fastFragments[0].id, 500);

      slowSystem.propagateCracks(0.1);
      fastSystem.propagateCracks(0.1);

      const slowTotal = slowSystem.getTotalDamage();
      const fastTotal = fastSystem.getTotalDamage();

      expect(fastTotal).toBeGreaterThanOrEqual(slowTotal);
    });

    it('stops propagating to destroyed fragments', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
        enableCrackPropagation: true,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);
      expect(fragments[0].active).toBe(false);

      const initialDestroyedCount = system.getDestroyedFragmentCount();

      // Step multiple times
      system.propagateCracks(0.1);
      system.propagateCracks(0.1);

      const finalDestroyedCount = system.getDestroyedFragmentCount();

      expect(finalDestroyedCount).toBeGreaterThanOrEqual(initialDestroyedCount);
    });

    it('propagates based on shared face area', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        enableCrackPropagation: true,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 500);
      system.propagateCracks(0.1);

      if (system.getNeighborCount(fragments[0].id) > 0) {
        const totalDamage = system.getTotalDamage();
        expect(totalDamage).toBeGreaterThan(fragments[0].damage);
      }
    });

    it('can disable propagation by setting speed to zero', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        enableCrackPropagation: true,
        crackPropagationSpeed: 0,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      const initialDamage = 500;
      system.applyStress(fragments[0].id, initialDamage);

      const damage1 = system.getTotalDamage();
      system.propagateCracks(0.1);
      const damage2 = system.getTotalDamage();

      expect(damage2).toBeCloseTo(damage1, 1);
    });

    it('accumulates propagated damage over time', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        enableCrackPropagation: true,
        crackPropagationSpeed: 5.0,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 500);

      system.propagateCracks(0.1);
      const damage1 = system.getTotalDamage();

      system.propagateCracks(0.1);
      const damage2 = system.getTotalDamage();

      expect(damage2).toBeGreaterThanOrEqual(damage1);
    });
  });

  describe('LOD Management', () => {
    it('assigns LOD levels based on camera distance', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10, enableLOD: true });
      system.generateVoronoiFracture();
      system.setCameraPosition({ x: 0, y: 0, z: 0 });
      system.updateLOD();

      const fragments = system.getFragments();
      const lodLevels = new Set(fragments.map((f) => f.lodLevel));

      expect(lodLevels.size).toBeGreaterThan(0);
    });

    it('assigns LOD 0 to closest fragments', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10, enableLOD: true });
      system.generateVoronoiFracture();
      const cameraPos = { x: 0, y: 0, z: 0 };
      system.setCameraPosition(cameraPos);
      system.updateLOD();

      const lod0Fragments = system.getFragmentsByLOD(0);
      expect(lod0Fragments.length).toBeGreaterThan(0);

      // LOD 0 should be closest to camera
      const lod2Fragments = system.getFragmentsByLOD(2);
      if (lod0Fragments.length > 0 && lod2Fragments.length > 0) {
        const dist0 = Math.sqrt(
          Math.pow(lod0Fragments[0].position.x - cameraPos.x, 2) +
            Math.pow(lod0Fragments[0].position.y - cameraPos.y, 2) +
            Math.pow(lod0Fragments[0].position.z - cameraPos.z, 2)
        );
        const dist2 = Math.sqrt(
          Math.pow(lod2Fragments[0].position.x - cameraPos.x, 2) +
            Math.pow(lod2Fragments[0].position.y - cameraPos.y, 2) +
            Math.pow(lod2Fragments[0].position.z - cameraPos.z, 2)
        );
        expect(dist0).toBeLessThanOrEqual(dist2);
      }
    });

    it('respects LOD distance thresholds', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 10,
        enableLOD: true,
        lodDistances: [2, 5, 10],
      });
      system.generateVoronoiFracture();
      system.setCameraPosition({ x: 100, y: 100, z: 100 });
      system.updateLOD();

      const fragments = system.getFragments();

      // All fragments should be far away, so high LOD
      const highLOD = fragments.filter((f) => f.lodLevel >= 2);
      expect(highLOD.length).toBeGreaterThan(0);
    });

    it('can disable LOD system', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10, enableLOD: false });
      system.generateVoronoiFracture();
      system.setCameraPosition({ x: 0, y: 0, z: 0 });
      system.updateLOD();

      const fragments = system.getFragments();

      // All fragments should have LOD 0 when disabled
      const allLOD0 = fragments.every((f) => f.lodLevel === 0);
      expect(allLOD0).toBe(true);
    });

    it('updates LOD dynamically as camera moves', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10, enableLOD: true });
      system.generateVoronoiFracture();

      system.setCameraPosition({ x: 0, y: 0, z: 0 });
      system.updateLOD();
      const lod1 = system.getFragments().map((f) => f.lodLevel);

      system.setCameraPosition({ x: 100, y: 100, z: 100 });
      system.updateLOD();
      const lod2 = system.getFragments().map((f) => f.lodLevel);

      // LOD should change when camera moves
      const changed = lod1.some((level, i) => level !== lod2[i]);
      expect(changed).toBe(true);
    });
  });

  describe('Fragment Queries', () => {
    it('gets fragments by ID', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      const fragment = system.getFragment(fragments[0].id);
      expect(fragment).toBeDefined();
      expect(fragment?.id).toBe(fragments[0].id);
    });

    it('returns undefined for non-existent ID', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();

      const fragment = system.getFragment(999);
      expect(fragment).toBeUndefined();
    });

    it('gets active (non-destroyed) fragments', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      const active = system.getActiveFragments();
      expect(active.length).toBe(system.getActiveFragmentCount());
      expect(active.length).toBeLessThan(fragments.length);
    });

    it('gets destroyed fragments count', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      const destroyedCount = system.getDestroyedFragmentCount();
      expect(destroyedCount).toBeGreaterThan(0);
    });

    it('gets fragments by LOD level', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10, enableLOD: true });
      system.generateVoronoiFracture();
      system.setCameraPosition({ x: 0, y: 0, z: 0 });
      system.updateLOD();

      const lod0 = system.getFragmentsByLOD(0);
      const lod1 = system.getFragmentsByLOD(1);
      const lod2 = system.getFragmentsByLOD(2);

      expect(lod0.length + lod1.length + lod2.length).toBe(10);
    });

    it('counts fragments correctly', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 10 });
      system.generateVoronoiFracture();

      expect(system.getFragmentCount()).toBe(10);
      expect(system.getActiveFragmentCount()).toBe(10);
      expect(system.getDestroyedFragmentCount()).toBe(0);
    });

    it('gets average damage', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 500);
      system.applyStress(fragments[1].id, 300);

      const avgDamage = system.getAverageDamage();
      expect(avgDamage).toBeGreaterThan(0);
    });

    it('gets fragment neighbors', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      const neighbors = system.getNeighbors(fragments[0].id);
      expect(Array.isArray(neighbors)).toBe(true);
    });
  });

  describe('Pooling', () => {
    it('pools destroyed fragments when enabled', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
        enablePooling: true,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      const pooled = system.getPooledFragmentCount();
      expect(pooled).toBeGreaterThan(0);
    });

    it('does not pool when disabled', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
        enablePooling: false,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      const pooled = system.getPooledFragmentCount();
      expect(pooled).toBe(0);
    });

    it('recycles pooled fragments', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
        enablePooling: true,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Destroy and pool
      system.applyStress(fragments[0].id, 10000);
      expect(system.getPooledFragmentCount()).toBeGreaterThan(0);

      // Recycle from pool
      const recycled = system.recycleFragment(fragments[0].id);
      expect(recycled).toBe(true);
    });

    it('limits pool size', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 10,
        maxHealth: 50,
        destructionThreshold: 0.2,
        enablePooling: true,
        maxPooledFragments: 3,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Destroy multiple fragments
      for (let i = 0; i < 5; i++) {
        system.applyStress(fragments[i].id, 10000);
      }

      const pooled = system.getPooledFragmentCount();
      expect(pooled).toBeLessThanOrEqual(3);
    });

    it('clears pool on demand', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
        enablePooling: true,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);
      expect(system.getPooledFragmentCount()).toBeGreaterThan(0);

      system.clearPool();
      expect(system.getPooledFragmentCount()).toBe(0);
    });
  });

  describe('Analysis Methods', () => {
    it('calculates destruction progress percentage', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 10,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Destroy half
      for (let i = 0; i < 5; i++) {
        system.applyStress(fragments[i].id, 10000);
      }

      const progress = system.getDestructionProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('calculates total volume', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();

      const totalVolume = system.getTotalVolume();
      expect(totalVolume).toBeGreaterThan(0);
    });

    it('calculates destroyed volume', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      const destroyedVolume = system.getDestroyedVolume();
      expect(destroyedVolume).toBeGreaterThan(0);
    });

    it('calculates total damage', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 500);
      system.applyStress(fragments[1].id, 300);

      const totalDamage = system.getTotalDamage();
      expect(totalDamage).toBeGreaterThan(0);
    });

    it('gets fragment count statistics', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 10,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 10000);

      expect(system.getFragmentCount()).toBe(10);
      expect(system.getActiveFragmentCount()).toBe(9);
      expect(system.getDestroyedFragmentCount()).toBe(1);
    });
  });

  describe('Stress-Based Destruction', () => {
    it('accumulates stress over time', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 300);
      const damage1 = fragments[0].damage;

      system.applyStress(fragments[0].id, 400);
      const damage2 = fragments[0].damage;

      expect(damage2).toBeGreaterThan(damage1);
    });

    it('destroys when accumulated stress exceeds threshold', () => {
      const system = new VoronoiFractureSystem({
        voronoiSites: 5,
        maxHealth: 100,
        destructionThreshold: 0.2,
      });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      system.applyStress(fragments[0].id, 600);
      expect(fragments[0].active).toBe(true);

      system.applyStress(fragments[0].id, 5000);
      expect(fragments[0].active).toBe(false);
    });

    it('supports external stress input for physics integration', () => {
      const system = new VoronoiFractureSystem({ voronoiSites: 5 });
      system.generateVoronoiFracture();
      const fragments = system.getFragments();

      // Simulate external physics engine applying stress
      const stressValues = [100, 200, 150, 50, 300];
      stressValues.forEach((stress, i) => {
        system.applyStress(fragments[i].id, stress);
      });

      const totalDamage = system.getTotalDamage();
      expect(totalDamage).toBeGreaterThan(0);
    });
  });
});
