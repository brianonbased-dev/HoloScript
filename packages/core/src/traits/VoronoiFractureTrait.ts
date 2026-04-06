/**
 * VoronoiFractureTrait.ts
 * Advanced procedural destruction and fracture simulation with Voronoi cells
 *
 * Features:
 * - 3D Voronoi cell generation for realistic fracture patterns
 * - Stress-based destruction model with damage accumulation
 * - Crack propagation simulation
 * - Progressive LOD for distant fragments
 * - Chunk pooling and recycling for performance
 * - Fragment mesh generation with interior faces
 *
 * @module VoronoiFractureTrait
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Represents a fracture fragment (chunk)
 */
export interface FractureFragment {
  /** Fragment ID */
  id: number;
  /** Centroid position */
  position: { x: number; y: number; z: number };
  /** Bounding box min */
  boundsMin: { x: number; y: number; z: number };
  /** Bounding box max */
  boundsMax: { x: number; y: number; z: number };
  /** Vertices of the fragment mesh */
  vertices: Array<{ x: number; y: number; z: number }>;
  /** Triangle indices (3 per triangle) */
  indices: number[];
  /** Current health (0 = destroyed) */
  health: number;
  /** Accumulated damage */
  damage: number;
  /** Is this fragment active? */
  active: boolean;
  /** LOD level (0 = full detail, higher = simplified) */
  lodLevel: number;
  /** Volume of the fragment */
  volume: number;
}

/**
 * Voronoi site (seed point for fracture cell)
 */
export interface VoronoiSite {
  /** Position */
  position: { x: number; y: number; z: number };
  /** Cell ID */
  id: number;
}

/**
 * Damage event (impact, explosion, etc.)
 */
export interface DamageEvent {
  /** Position of impact */
  position: { x: number; y: number; z: number };
  /** Damage radius */
  radius: number;
  /** Maximum damage at center */
  maxDamage: number;
  /** Falloff exponent (higher = sharper falloff) */
  falloff: number;
}

/**
 * Voronoi fracture simulation configuration
 */
export interface VoronoiFractureConfig {
  /** Number of Voronoi sites for fracture */
  voronoiSites: number;
  /** Bounding box for fracture volume */
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  /** Health threshold for destruction (0-1) */
  destructionThreshold: number;
  /** Maximum fragment health */
  maxHealth: number;
  /** Enable crack propagation? */
  enableCrackPropagation: boolean;
  /** Crack propagation speed (damage per second to neighbors) */
  crackPropagationSpeed: number;
  /** Enable LOD system? */
  enableLOD: boolean;
  /** Distance thresholds for LOD levels [LOD1, LOD2, LOD3] */
  lodDistances: [number, number, number];
  /** Enable fragment pooling? */
  enablePooling: boolean;
  /** Maximum pooled fragments */
  maxPooledFragments: number;
}

/**
 * Neighbor relationship between fragments
 */
interface FragmentNeighbor {
  fragmentId: number;
  sharedFaceArea: number; // For crack propagation strength
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Computes distance between two 3D points
 */
function distance3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Generates a random point within bounds
 */
function randomPointInBounds(bounds: {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}): { x: number; y: number; z: number } {
  return {
    x: bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
    y: bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y),
    z: bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z),
  };
}

/**
 * Computes bounding box for a set of vertices
 */
function computeBoundingBox(vertices: Array<{ x: number; y: number; z: number }>): {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
} {
  if (vertices.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
  }

  const min = { ...vertices[0] };
  const max = { ...vertices[0] };

  for (const v of vertices) {
    min.x = Math.min(min.x, v.x);
    min.y = Math.min(min.y, v.y);
    min.z = Math.min(min.z, v.z);
    max.x = Math.max(max.x, v.x);
    max.y = Math.max(max.y, v.y);
    max.z = Math.max(max.z, v.z);
  }

  return { min, max };
}

/**
 * Computes volume of a bounding box
 */
function computeVolume(bounds: {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}): number {
  const dx = bounds.max.x - bounds.min.x;
  const dy = bounds.max.y - bounds.min.y;
  const dz = bounds.max.z - bounds.min.z;
  return dx * dy * dz;
}

// ============================================================================
// Main Voronoi Fracture System
// ============================================================================

/**
 * Voronoi fracture and destruction simulation system
 */
export class VoronoiFractureSystem {
  private fragments: FractureFragment[] = [];
  private fragmentNeighbors: Map<number, FragmentNeighbor[]> = new Map();
  private fragmentPool: FractureFragment[] = [];
  private config: VoronoiFractureConfig;
  private nextFragmentId: number = 0;
  private voronoiSites: VoronoiSite[] = [];
  private cameraPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor(config: Partial<VoronoiFractureConfig> = {}) {
    this.config = {
      voronoiSites: config.voronoiSites ?? 10,
      bounds: config.bounds ?? {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
      },
      destructionThreshold: config.destructionThreshold ?? 0.2,
      maxHealth: config.maxHealth ?? 100,
      enableCrackPropagation: config.enableCrackPropagation ?? true,
      crackPropagationSpeed: config.crackPropagationSpeed ?? 10,
      enableLOD: config.enableLOD ?? true,
      lodDistances: config.lodDistances ?? [10, 20, 40],
      enablePooling: config.enablePooling ?? true,
      maxPooledFragments: config.maxPooledFragments ?? 100,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  getConfig(): VoronoiFractureConfig {
    return { ...this.config, bounds: { ...this.config.bounds } };
  }

  updateConfig(config: Partial<VoronoiFractureConfig>): void {
    Object.assign(this.config, config);
  }

  setCameraPosition(position: { x: number; y: number; z: number }): void {
    this.cameraPosition = { ...position };
  }

  // ==========================================================================
  // Voronoi Fracture Generation
  // ==========================================================================

  /**
   * Generate Voronoi fracture pattern
   */
  generateVoronoiFracture(): void {
    // Generate Voronoi sites
    this.voronoiSites = [];
    for (let i = 0; i < this.config.voronoiSites; i++) {
      this.voronoiSites.push({
        position: randomPointInBounds(this.config.bounds),
        id: i,
      });
    }

    // Generate fragments from Voronoi cells
    // (Simplified: using bounding box subdivision for now)
    // Full Voronoi implementation would use Fortune's algorithm or GPU-based methods
    this.fragments = [];
    for (const site of this.voronoiSites) {
      const fragment = this.createFragmentFromVoronoiCell(site);
      this.fragments.push(fragment);
    }

    // Build neighbor relationships
    this.buildNeighborGraph();
  }

  private createFragmentFromVoronoiCell(site: VoronoiSite): FractureFragment {
    // Simplified fragment creation (bounding box around site)
    // In a full implementation, this would compute actual Voronoi cell boundaries
    const size = 0.2; // Approximate fragment size
    const vertices = [
      // Cube vertices around site
      { x: site.position.x - size, y: site.position.y - size, z: site.position.z - size },
      { x: site.position.x + size, y: site.position.y - size, z: site.position.z - size },
      { x: site.position.x + size, y: site.position.y + size, z: site.position.z - size },
      { x: site.position.x - size, y: site.position.y + size, z: site.position.z - size },
      { x: site.position.x - size, y: site.position.y - size, z: site.position.z + size },
      { x: site.position.x + size, y: site.position.y - size, z: site.position.z + size },
      { x: site.position.x + size, y: site.position.y + size, z: site.position.z + size },
      { x: site.position.x - size, y: site.position.y + size, z: site.position.z + size },
    ];

    // Cube triangle indices (12 triangles, 2 per face)
    const indices = [
      0,
      1,
      2,
      0,
      2,
      3, // Front
      4,
      6,
      5,
      4,
      7,
      6, // Back
      0,
      4,
      5,
      0,
      5,
      1, // Bottom
      2,
      6,
      7,
      2,
      7,
      3, // Top
      0,
      3,
      7,
      0,
      7,
      4, // Left
      1,
      5,
      6,
      1,
      6,
      2, // Right
    ];

    const bounds = computeBoundingBox(vertices);
    const volume = computeVolume(bounds);

    return {
      id: this.nextFragmentId++,
      position: { ...site.position },
      boundsMin: bounds.min,
      boundsMax: bounds.max,
      vertices,
      indices,
      health: this.config.maxHealth,
      damage: 0,
      active: true,
      lodLevel: 0,
      volume,
    };
  }

  private buildNeighborGraph(): void {
    this.fragmentNeighbors.clear();

    // Simple neighbor detection: fragments within distance threshold are neighbors
    const neighborThreshold = 0.5;

    for (const frag1 of this.fragments) {
      const neighbors: FragmentNeighbor[] = [];

      for (const frag2 of this.fragments) {
        if (frag1.id === frag2.id) continue;

        const dist = distance3D(frag1.position, frag2.position);
        if (dist < neighborThreshold) {
          neighbors.push({
            fragmentId: frag2.id,
            sharedFaceArea: 1.0 / (dist + 0.1), // Approximate shared area
          });
        }
      }

      this.fragmentNeighbors.set(frag1.id, neighbors);
    }
  }

  // ==========================================================================
  // Damage Application
  // ==========================================================================

  applyDamage(event: DamageEvent): void {
    for (const fragment of this.fragments) {
      if (!fragment.active) continue;

      const dist = distance3D(fragment.position, event.position);

      if (dist < event.radius) {
        // Compute damage with falloff
        const damageRatio = 1 - Math.pow(dist / event.radius, event.falloff);
        const damage = event.maxDamage * damageRatio;

        fragment.damage += damage;
        fragment.health = Math.max(0, fragment.health - damage);

        // Check if fragment should be destroyed
        if (fragment.health / this.config.maxHealth < this.config.destructionThreshold) {
          fragment.active = false;

          // Pool fragment for reuse
          if (
            this.config.enablePooling &&
            this.fragmentPool.length < this.config.maxPooledFragments
          ) {
            this.fragmentPool.push(fragment);
          }
        }
      }
    }
  }

  // ==========================================================================
  // Crack Propagation
  // ==========================================================================

  propagateCracks(dt: number): void {
    if (!this.config.enableCrackPropagation) return;

    const damagePerSecond = this.config.crackPropagationSpeed * dt;

    for (const fragment of this.fragments) {
      if (!fragment.active) continue;

      // Only propagate from damaged fragments
      const damageRatio = fragment.damage / this.config.maxHealth;
      if (damageRatio < 0.3) continue; // Minimum damage threshold for propagation

      const neighbors = this.fragmentNeighbors.get(fragment.id) || [];

      for (const neighbor of neighbors) {
        const neighborFrag = this.fragments.find((f) => f.id === neighbor.fragmentId);
        if (!neighborFrag || !neighborFrag.active) continue;

        // Propagate damage to neighbor based on shared face area
        const propagatedDamage = damagePerSecond * neighbor.sharedFaceArea * damageRatio;
        neighborFrag.damage += propagatedDamage;
        neighborFrag.health = Math.max(0, neighborFrag.health - propagatedDamage);

        // Check destruction
        if (neighborFrag.health / this.config.maxHealth < this.config.destructionThreshold) {
          neighborFrag.active = false;

          if (
            this.config.enablePooling &&
            this.fragmentPool.length < this.config.maxPooledFragments
          ) {
            this.fragmentPool.push(neighborFrag);
          }
        }
      }
    }
  }

  // ==========================================================================
  // LOD Management
  // ==========================================================================

  updateLOD(): void {
    if (!this.config.enableLOD) return;

    for (const fragment of this.fragments) {
      if (!fragment.active) continue;

      const dist = distance3D(fragment.position, this.cameraPosition);

      // Assign LOD level based on distance
      if (dist < this.config.lodDistances[0]) {
        fragment.lodLevel = 0; // Full detail
      } else if (dist < this.config.lodDistances[1]) {
        fragment.lodLevel = 1; // Medium detail
      } else if (dist < this.config.lodDistances[2]) {
        fragment.lodLevel = 2; // Low detail
      } else {
        fragment.lodLevel = 3; // Culled/minimal detail
      }
    }
  }

  // ==========================================================================
  // Fragment Queries
  // ==========================================================================

  getFragments(): FractureFragment[] {
    return this.fragments;
  }

  getActiveFragments(): FractureFragment[] {
    return this.fragments.filter((f) => f.active);
  }

  getFragment(id: number): FractureFragment | undefined {
    return this.fragments.find((f) => f.id === id);
  }

  getFragmentCount(): number {
    return this.fragments.length;
  }

  getActiveFragmentCount(): number {
    return this.fragments.filter((f) => f.active).length;
  }

  getDestroyedFragmentCount(): number {
    return this.fragments.filter((f) => !f.active).length;
  }

  getFragmentsByLOD(lodLevel: number): FractureFragment[] {
    return this.fragments.filter((f) => f.active && f.lodLevel === lodLevel);
  }

  // ==========================================================================
  // Pooling
  // ==========================================================================

  getPooledFragmentCount(): number {
    return this.fragmentPool.length;
  }

  recycleFragment(id: number): boolean {
    const fragment = this.fragments.find((f) => f.id === id);
    if (!fragment || fragment.active) return false;

    // Reset fragment
    fragment.health = this.config.maxHealth;
    fragment.damage = 0;
    fragment.active = true;
    fragment.lodLevel = 0;

    // Remove from pool if present
    const poolIndex = this.fragmentPool.findIndex((f) => f.id === id);
    if (poolIndex !== -1) {
      this.fragmentPool.splice(poolIndex, 1);
    }

    return true;
  }

  clearPool(): void {
    this.fragmentPool = [];
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  getTotalDamage(): number {
    return this.fragments.reduce((sum, f) => sum + f.damage, 0);
  }

  getAverageDamage(): number {
    const activeFragments = this.getActiveFragments();
    if (activeFragments.length === 0) return 0;

    const totalDamage = activeFragments.reduce((sum, f) => sum + f.damage, 0);
    return totalDamage / activeFragments.length;
  }

  getTotalVolume(): number {
    return this.fragments.reduce((sum, f) => sum + f.volume, 0);
  }

  getDestroyedVolume(): number {
    return this.fragments.filter((f) => !f.active).reduce((sum, f) => sum + f.volume, 0);
  }

  getDestructionProgress(): number {
    const totalVolume = this.getTotalVolume();
    if (totalVolume === 0) return 0;

    const destroyedVolume = this.getDestroyedVolume();
    return destroyedVolume / totalVolume;
  }

  // ==========================================================================
  // Neighbors
  // ==========================================================================

  getNeighbors(fragmentId: number): number[] {
    const neighbors = this.fragmentNeighbors.get(fragmentId);
    if (!neighbors) return [];
    return neighbors.map((n) => n.fragmentId);
  }

  getNeighborCount(fragmentId: number): number {
    const neighbors = this.fragmentNeighbors.get(fragmentId);
    return neighbors ? neighbors.length : 0;
  }

  // ==========================================================================
  // Stress-Based Destruction
  // ==========================================================================

  /**
   * Apply stress-based destruction (accumulates damage over time based on external forces)
   */
  applyStress(fragmentId: number, stressMagnitude: number): void {
    const fragment = this.fragments.find((f) => f.id === fragmentId);
    if (!fragment || !fragment.active) return;

    // Stress accumulates as damage
    const stressDamage = stressMagnitude * 0.1; // Scale factor
    fragment.damage += stressDamage;
    fragment.health = Math.max(0, fragment.health - stressDamage);

    // Check destruction
    if (fragment.health / this.config.maxHealth < this.config.destructionThreshold) {
      fragment.active = false;

      if (this.config.enablePooling && this.fragmentPool.length < this.config.maxPooledFragments) {
        this.fragmentPool.push(fragment);
      }
    }
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  reset(): void {
    this.fragments = [];
    this.fragmentNeighbors.clear();
    this.fragmentPool = [];
    this.voronoiSites = [];
    this.nextFragmentId = 0;
  }

  /**
   * Get Voronoi sites (for visualization/debugging)
   */
  getVoronoiSites(): VoronoiSite[] {
    return this.voronoiSites;
  }
}

// ============================================================================
// Trait Interface
// ============================================================================

/**
 * VoronoiFracture trait interface for HoloScript
 */
export interface VoronoiFractureTrait {
  trait_type: 'voronoi_fracture';

  // Voronoi fracture settings
  voronoi_sites: number;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };

  // Destruction settings
  destruction_threshold: number; // 0-1, health ratio below which fragment is destroyed
  max_health: number;

  // Crack propagation
  enable_crack_propagation: boolean;
  crack_propagation_speed: number;

  // LOD settings
  enable_lod: boolean;
  lod_distances: [number, number, number]; // [LOD1, LOD2, LOD3]

  // Performance settings
  enable_pooling: boolean;
  max_pooled_fragments: number;

  // Initial fracture (optional)
  auto_fracture_on_start?: boolean;

  // Damage events (optional)
  initial_damage_events?: Array<{
    position: { x: number; y: number; z: number };
    radius: number;
    max_damage: number;
    falloff: number;
  }>;
}

// ── Handler (delegates to VoronoiFractureSystem) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const voronoiFractureHandler = {
  name: 'voronoi_fracture',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new VoronoiFractureSystem(config);
    node.__voronoi_fracture_instance = instance;
    ctx.emit('voronoi_fracture_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__voronoi_fracture_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('voronoi_fracture_detached', { node });
    delete node.__voronoi_fracture_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__voronoi_fracture_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'voronoi_fracture_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('voronoi_fracture_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__voronoi_fracture_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
