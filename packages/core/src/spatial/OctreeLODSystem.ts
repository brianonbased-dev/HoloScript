/**
 * OctreeLODSystem.ts
 *
 * Octree-based Level-of-Detail system for Gaussian Splatting scenes.
 * Implements the Octree-GS approach (TPAMI 2025): anchor Gaussians assigned
 * to octree levels with camera-distance LOD selection and budget-aware capping.
 *
 * Key design decisions:
 *  - Anchor Gaussians are stored at the octree level matching their detail scale
 *  - Camera distance determines which LOD levels contribute to rendering
 *  - Power-law (Levy flight) transition thresholds replace linear spacing
 *  - Budget enforcement drops deepest LOD levels first when over cap
 *  - VR mode reserves fixed budget per avatar (W.034: 60K each, max 3)
 *
 * Research references:
 *   W.032 - Octree-GS LOD (anchor-based level selection, TPAMI 2025)
 *   W.034 - VR Gaussian budget (~180K total on Quest 3 at 72fps)
 *   P.030.01 - Hierarchical LOD Gaussian Architecture pattern
 *   P.030.05 - VR Gaussian Budget Management pattern
 *
 * @module spatial
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Gaussian anchor: a representative Gaussian at a specific octree level.
 * At rendering time, only anchors from selected LOD levels are drawn.
 */
export interface GaussianAnchor {
  /** Unique identifier for this anchor Gaussian */
  id: string;
  /** World-space position (center of the Gaussian) */
  x: number;
  y: number;
  z: number;
  /** Gaussian scale (max axis determines effective radius for octree insertion) */
  scale: number;
  /** LOD level this anchor belongs to (0 = coarsest/root, higher = finer detail) */
  lodLevel: number;
  /** Number of Gaussians this anchor represents (for budget accounting) */
  gaussianCount: number;
  /** Optional: index into the original splat array for rendering */
  splatIndex?: number;
}

/**
 * Octree node specialized for LOD-structured Gaussian anchors.
 * Each node holds anchors at a single LOD level (its depth).
 */
interface LODOctreeNode {
  /** Center of this node's bounding volume */
  cx: number;
  cy: number;
  cz: number;
  /** Half-size of this node's bounding cube */
  halfSize: number;
  /** Depth in the octree (0 = root, maps to LOD level) */
  depth: number;
  /** Anchor Gaussians stored at this node (all at depth's LOD level) */
  anchors: GaussianAnchor[];
  /** Total Gaussian count across all anchors at this node */
  gaussianCount: number;
  /** Eight children (null if leaf or not yet subdivided) */
  children: LODOctreeNode[] | null;
}

/**
 * Configuration for the octree LOD system.
 */
export interface OctreeLODConfig {
  /** Maximum octree depth (number of LOD levels). 4-8 typical for city-scale. */
  maxDepth: number;
  /**
   * Power-law exponent for transition threshold spacing.
   * Controls how distance thresholds grow with LOD level.
   * - 1.0 = linear spacing (uniform)
   * - 1.5 = moderate power-law (recommended for indoor/room-scale)
   * - 2.0 = aggressive power-law (recommended for outdoor/city-scale)
   * Levy flight research (W.030) suggests power-law distributions match
   * natural depth trajectory patterns in camera movement.
   */
  powerLawExponent: number;
  /** Base distance for LOD level 0 transition (in world units) */
  baseDistance: number;
  /** Maximum distance for the outermost LOD level (in world units) */
  maxDistance: number;
  /** VR mode: enable hard budget enforcement */
  vrMode: boolean;
  /** Total Gaussian budget (0 = unlimited). VR default: 180000 (Quest 3 at 72fps) */
  gaussianBudget: number;
  /** Per-avatar Gaussian reservation (0 = no avatar reservations) */
  perAvatarReservation: number;
  /** Maximum number of avatars with reserved budgets */
  maxAvatars: number;
  /** Maximum anchors per node before subdivision */
  maxAnchorsPerNode: number;
}

/**
 * Result of an LOD selection query: which levels and anchors to render.
 */
export interface LODSelectionResult {
  /** LOD levels selected for rendering (0 = coarsest, higher = finer) */
  selectedLevels: number[];
  /** Total Gaussians selected across all levels */
  totalGaussians: number;
  /** Whether the budget cap was applied (some levels were dropped) */
  budgetCapped: boolean;
  /** Number of LOD levels dropped due to budget cap */
  levelsDropped: number;
  /** Anchor Gaussians to render (flattened from selected levels) */
  anchors: GaussianAnchor[];
  /** Camera distance to scene center */
  cameraDistance: number;
  /** Computed transition thresholds (for debugging/visualization) */
  thresholds: number[];
  /** Available Gaussian budget after avatar reservations */
  availableBudget: number;
}

/**
 * Per-level statistics for the octree.
 */
export interface LODLevelStats {
  level: number;
  anchorCount: number;
  gaussianCount: number;
  nodeCount: number;
}

/**
 * Metrics snapshot for the entire OctreeLOD system.
 */
export interface OctreeLODMetrics {
  /** Total anchor count across all levels */
  totalAnchors: number;
  /** Total Gaussian count across all levels */
  totalGaussians: number;
  /** Per-level breakdown */
  levels: LODLevelStats[];
  /** Octree depth (actual, may be less than maxDepth) */
  actualDepth: number;
  /** Number of active avatar reservations */
  activeAvatarReservations: number;
  /** Total nodes in the octree */
  totalNodes: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: OctreeLODConfig = {
  maxDepth: 6,
  powerLawExponent: 1.5,
  baseDistance: 2.0,
  maxDistance: 200.0,
  vrMode: false,
  gaussianBudget: 0,
  perAvatarReservation: 0,
  maxAvatars: 3,
  maxAnchorsPerNode: 16,
};

// =============================================================================
// OCTREE LOD SYSTEM
// =============================================================================

/**
 * Octree-based Level-of-Detail system for Gaussian Splatting scenes.
 *
 * Architecture (based on Octree-GS, TPAMI 2025):
 *
 * 1. **Octree Construction**: Scene bounding box is recursively subdivided
 *    into 8 children up to maxDepth levels. Each level corresponds to an
 *    LOD level (depth 0 = coarsest overview, depth N = finest detail).
 *
 * 2. **Anchor Assignment**: Gaussian splats are assigned to the octree level
 *    matching their detail scale. Coarse/large Gaussians go to shallow levels;
 *    fine/small Gaussians go to deep levels. This is the "anchor" concept
 *    from Octree-GS.
 *
 * 3. **LOD Selection**: Given a camera position, compute distance to each
 *    octree voxel. Use power-law transition thresholds to determine which
 *    LOD levels are active. Closer voxels activate deeper (finer) levels.
 *
 * 4. **Budget Enforcement**: Sum Gaussian counts across selected levels.
 *    If total exceeds the budget, drop the deepest (finest) levels first.
 *    This preserves scene overview while sacrificing fine detail under pressure.
 *
 * 5. **VR Mode**: Reserves fixed Gaussian budget per avatar (e.g., 60K each),
 *    then allocates remaining budget to scene LOD selection.
 *
 * Usage:
 * ```typescript
 * const lod = new OctreeLODSystem({
 *   maxDepth: 6,
 *   powerLawExponent: 1.5,
 *   baseDistance: 2.0,
 *   maxDistance: 200.0,
 *   vrMode: true,
 *   gaussianBudget: 180000,
 *   perAvatarReservation: 60000,
 *   maxAvatars: 3,
 * });
 *
 * // Build octree from scene bounds
 * lod.initialize(0, 0, 0, 100); // center + halfSize
 *
 * // Insert anchor Gaussians at appropriate LOD levels
 * lod.insertAnchor({ id: 'a0', x: 10, y: 0, z: 5, scale: 2.0, lodLevel: 0, gaussianCount: 500 });
 * lod.insertAnchor({ id: 'a1', x: 10, y: 0, z: 5, scale: 0.1, lodLevel: 4, gaussianCount: 50 });
 *
 * // Select LOD levels for current camera
 * const selection = lod.selectLOD(cameraX, cameraY, cameraZ);
 * // selection.anchors contains the Gaussians to render this frame
 * ```
 */
export class OctreeLODSystem {
  private root: LODOctreeNode | null = null;
  private config: OctreeLODConfig;
  private thresholds: number[] = [];
  private anchorCount = 0;
  private totalGaussianCount = 0;
  private activeAvatars = 0;
  private nodeCount = 0;

  /** Scene center for distance calculations */
  private sceneCX = 0;
  private sceneCY = 0;
  private sceneCZ = 0;

  constructor(config?: Partial<OctreeLODConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.computeThresholds();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initialize the octree with scene bounds.
   * Must be called before inserting anchors.
   */
  initialize(centerX: number, centerY: number, centerZ: number, halfSize: number): void {
    this.sceneCX = centerX;
    this.sceneCY = centerY;
    this.sceneCZ = centerZ;
    this.root = this.createNode(centerX, centerY, centerZ, halfSize, 0);
    this.anchorCount = 0;
    this.totalGaussianCount = 0;
    this.nodeCount = 1;
  }

  /**
   * Initialize from a bounding box (min/max corners).
   */
  initializeFromBounds(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
  ): void {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const halfSize = Math.max(maxX - cx, maxY - cy, maxZ - cz);
    this.initialize(cx, cy, cz, halfSize);
  }

  // ---------------------------------------------------------------------------
  // Threshold Computation
  // ---------------------------------------------------------------------------

  /**
   * Compute power-law transition thresholds for LOD level selection.
   *
   * Power-law spacing (Levy flight-inspired, W.030):
   *   threshold[i] = baseDistance * ((i + 1) / maxDepth) ^ exponent * (maxDistance / baseDistance)
   *
   * This produces thresholds that are tightly spaced near the camera
   * (where detail matters most) and widely spaced at far distances
   * (where coarse LOD suffices).
   */
  private computeThresholds(): void {
    const { maxDepth, powerLawExponent, baseDistance, maxDistance } = this.config;
    this.thresholds = [];

    for (let i = 0; i < maxDepth; i++) {
      // Normalized position in [0, 1]
      const t = (i + 1) / maxDepth;
      // Power-law mapping
      const threshold = baseDistance + (maxDistance - baseDistance) * Math.pow(t, powerLawExponent);
      this.thresholds.push(threshold);
    }
  }

  /**
   * Get the computed transition thresholds (read-only).
   */
  getThresholds(): readonly number[] {
    return this.thresholds;
  }

  // ---------------------------------------------------------------------------
  // Anchor Insertion / Removal
  // ---------------------------------------------------------------------------

  /**
   * Insert an anchor Gaussian into the octree at its designated LOD level.
   * Returns true if successfully inserted.
   */
  insertAnchor(anchor: GaussianAnchor): boolean {
    if (!this.root) return false;
    if (anchor.lodLevel < 0 || anchor.lodLevel >= this.config.maxDepth) return false;

    const inserted = this.insertIntoNode(this.root, anchor);
    if (inserted) {
      this.anchorCount++;
      this.totalGaussianCount += anchor.gaussianCount;
    }
    return inserted;
  }

  private insertIntoNode(node: LODOctreeNode, anchor: GaussianAnchor): boolean {
    if (!this.containsPoint(node, anchor.x, anchor.y, anchor.z)) return false;

    // If this node's depth matches the anchor's LOD level, store here
    if (node.depth === anchor.lodLevel) {
      node.anchors.push(anchor);
      node.gaussianCount += anchor.gaussianCount;

      // Subdivide if too many anchors and below max depth
      if (
        node.anchors.length > this.config.maxAnchorsPerNode &&
        node.depth < this.config.maxDepth - 1 &&
        node.children === null
      ) {
        this.subdivideNode(node);
      }
      return true;
    }

    // Need to go deeper: ensure children exist
    if (node.children === null && node.depth < this.config.maxDepth - 1) {
      this.subdivideNode(node);
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.insertIntoNode(child, anchor)) return true;
      }
    }

    // If we can't go deeper but the LOD level doesn't match, store at this depth anyway
    if (node.depth < anchor.lodLevel) {
      node.anchors.push(anchor);
      node.gaussianCount += anchor.gaussianCount;
      return true;
    }

    return false;
  }

  /**
   * Remove an anchor by ID.
   */
  removeAnchor(id: string): boolean {
    if (!this.root) return false;
    const result = this.removeFromNode(this.root, id);
    if (result.removed) {
      this.anchorCount--;
      this.totalGaussianCount -= result.gaussianCount;
    }
    return result.removed;
  }

  private removeFromNode(
    node: LODOctreeNode,
    id: string,
  ): { removed: boolean; gaussianCount: number } {
    const idx = node.anchors.findIndex(a => a.id === id);
    if (idx >= 0) {
      const count = node.anchors[idx].gaussianCount;
      node.anchors.splice(idx, 1);
      node.gaussianCount -= count;
      return { removed: true, gaussianCount: count };
    }

    if (node.children) {
      for (const child of node.children) {
        const result = this.removeFromNode(child, id);
        if (result.removed) return result;
      }
    }

    return { removed: false, gaussianCount: 0 };
  }

  /**
   * Bulk-insert anchors (more efficient than individual inserts for large scenes).
   * Anchors are sorted by LOD level for efficient tree traversal.
   */
  bulkInsert(anchors: GaussianAnchor[]): number {
    if (!this.root) return 0;

    // Sort by LOD level (coarsest first) for efficient insertion
    const sorted = [...anchors].sort((a, b) => a.lodLevel - b.lodLevel);
    let inserted = 0;

    for (const anchor of sorted) {
      if (this.insertAnchor(anchor)) {
        inserted++;
      }
    }

    return inserted;
  }

  // ---------------------------------------------------------------------------
  // LOD Selection (Core Algorithm)
  // ---------------------------------------------------------------------------

  /**
   * Select LOD levels and anchors to render based on camera position.
   *
   * Algorithm:
   * 1. Compute camera distance to scene center
   * 2. Walk thresholds to find the deepest (finest) LOD level visible
   * 3. Select all levels from 0 (coarsest) through the deepest visible level
   * 4. Collect anchors from selected levels
   * 5. If budget mode, drop deepest levels until under budget
   * 6. In VR mode, subtract avatar reservations from available budget
   */
  selectLOD(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    avatarCount?: number,
  ): LODSelectionResult {
    if (!this.root) {
      return {
        selectedLevels: [],
        totalGaussians: 0,
        budgetCapped: false,
        levelsDropped: 0,
        anchors: [],
        cameraDistance: 0,
        thresholds: [...this.thresholds],
        availableBudget: this.config.gaussianBudget,
      };
    }

    // 1. Camera distance to scene center
    const dx = cameraX - this.sceneCX;
    const dy = cameraY - this.sceneCY;
    const dz = cameraZ - this.sceneCZ;
    const cameraDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 2. Determine deepest visible LOD level from thresholds
    //    Level 0 is always visible (coarsest overview).
    //    Each threshold[i] defines the max camera distance for level i+1.
    //    At distance d, level L is visible if d < threshold[L-1] for L>0.
    let deepestVisibleLevel = 0;
    for (let i = 0; i < this.thresholds.length; i++) {
      if (cameraDistance < this.thresholds[i]) {
        deepestVisibleLevel = i + 1;
      } else {
        break;
      }
    }

    // Clamp to maxDepth - 1
    deepestVisibleLevel = Math.min(deepestVisibleLevel, this.config.maxDepth - 1);

    // 3. Build selected levels array: 0 through deepestVisibleLevel
    const selectedLevels: number[] = [];
    for (let l = 0; l <= deepestVisibleLevel; l++) {
      selectedLevels.push(l);
    }

    // 4. Collect anchors from selected levels
    const anchorsByLevel = new Map<number, GaussianAnchor[]>();
    const gaussiansByLevel = new Map<number, number>();
    for (const level of selectedLevels) {
      anchorsByLevel.set(level, []);
      gaussiansByLevel.set(level, 0);
    }
    this.collectAnchors(this.root, selectedLevels, anchorsByLevel, gaussiansByLevel);

    // 5. Compute available budget (VR mode subtracts avatar reservations)
    let availableBudget = this.config.gaussianBudget;
    const actualAvatars = avatarCount ?? this.activeAvatars;
    if (this.config.vrMode && this.config.perAvatarReservation > 0 && availableBudget > 0) {
      const clampedAvatars = Math.min(actualAvatars, this.config.maxAvatars);
      const reserved = clampedAvatars * this.config.perAvatarReservation;
      availableBudget = Math.max(0, availableBudget - reserved);
    }

    // 6. Budget enforcement: drop deepest levels first if over budget
    let budgetCapped = false;
    let levelsDropped = 0;
    let totalGaussians = 0;

    for (const level of selectedLevels) {
      totalGaussians += gaussiansByLevel.get(level) ?? 0;
    }

    if (availableBudget > 0 && totalGaussians > availableBudget) {
      budgetCapped = true;
      // Drop from deepest level until under budget
      while (selectedLevels.length > 1 && totalGaussians > availableBudget) {
        const droppedLevel = selectedLevels.pop()!;
        totalGaussians -= gaussiansByLevel.get(droppedLevel) ?? 0;
        anchorsByLevel.delete(droppedLevel);
        levelsDropped++;
      }
    }

    // 7. Flatten anchors from remaining levels
    const anchors: GaussianAnchor[] = [];
    for (const level of selectedLevels) {
      const levelAnchors = anchorsByLevel.get(level);
      if (levelAnchors) {
        anchors.push(...levelAnchors);
      }
    }

    return {
      selectedLevels,
      totalGaussians,
      budgetCapped,
      levelsDropped,
      anchors,
      cameraDistance,
      thresholds: [...this.thresholds],
      availableBudget,
    };
  }

  /**
   * Recursively collect anchors from the octree that belong to the selected levels.
   */
  private collectAnchors(
    node: LODOctreeNode,
    levels: number[],
    anchorsByLevel: Map<number, GaussianAnchor[]>,
    gaussiansByLevel: Map<number, number>,
  ): void {
    // Collect anchors at this node if its depth is in the selected levels
    if (anchorsByLevel.has(node.depth)) {
      for (const anchor of node.anchors) {
        if (levels.includes(anchor.lodLevel)) {
          anchorsByLevel.get(anchor.lodLevel)!.push(anchor);
          gaussiansByLevel.set(
            anchor.lodLevel,
            (gaussiansByLevel.get(anchor.lodLevel) ?? 0) + anchor.gaussianCount,
          );
        }
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.collectAnchors(child, levels, anchorsByLevel, gaussiansByLevel);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Avatar Reservation Management
  // ---------------------------------------------------------------------------

  /**
   * Set the number of active avatars (for VR budget reservation).
   */
  setActiveAvatars(count: number): void {
    this.activeAvatars = Math.min(Math.max(0, count), this.config.maxAvatars);
  }

  /**
   * Get the number of active avatar reservations.
   */
  getActiveAvatars(): number {
    return this.activeAvatars;
  }

  /**
   * Get the scene-available Gaussian budget after avatar reservations.
   */
  getAvailableSceneBudget(): number {
    if (this.config.gaussianBudget <= 0) return Infinity;
    const reserved = this.activeAvatars * this.config.perAvatarReservation;
    return Math.max(0, this.config.gaussianBudget - reserved);
  }

  // ---------------------------------------------------------------------------
  // Auto-Assignment: Assign LOD Level from Scale
  // ---------------------------------------------------------------------------

  /**
   * Compute the appropriate LOD level for a Gaussian based on its scale.
   *
   * Larger Gaussians (coarse detail) -> lower LOD levels (shallow octree nodes)
   * Smaller Gaussians (fine detail) -> higher LOD levels (deep octree nodes)
   *
   * Uses logarithmic mapping: level = floor(log2(maxScale / scale))
   * Clamped to [0, maxDepth-1].
   */
  computeLODLevelFromScale(scale: number, maxScaleInScene: number): number {
    if (scale <= 0 || maxScaleInScene <= 0) return this.config.maxDepth - 1;
    if (scale >= maxScaleInScene) return 0;

    const ratio = maxScaleInScene / scale;
    const level = Math.floor(Math.log2(ratio));
    return Math.min(Math.max(0, level), this.config.maxDepth - 1);
  }

  // ---------------------------------------------------------------------------
  // Octree Internals
  // ---------------------------------------------------------------------------

  private createNode(
    cx: number, cy: number, cz: number,
    halfSize: number, depth: number,
  ): LODOctreeNode {
    return {
      cx, cy, cz, halfSize, depth,
      anchors: [],
      gaussianCount: 0,
      children: null,
    };
  }

  private subdivideNode(node: LODOctreeNode): void {
    const hs = node.halfSize / 2;
    node.children = [];

    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          const child = this.createNode(
            node.cx + x * hs,
            node.cy + y * hs,
            node.cz + z * hs,
            hs,
            node.depth + 1,
          );
          node.children.push(child);
          this.nodeCount++;
        }
      }
    }

    // Redistribute anchors that can fit in children
    const remaining: GaussianAnchor[] = [];
    for (const anchor of node.anchors) {
      let placed = false;
      // Only redistribute if the anchor's LOD level is deeper than this node
      if (anchor.lodLevel > node.depth) {
        for (const child of node.children) {
          if (this.containsPoint(child, anchor.x, anchor.y, anchor.z)) {
            if (anchor.lodLevel === child.depth) {
              child.anchors.push(anchor);
              child.gaussianCount += anchor.gaussianCount;
            } else {
              // Need to go deeper; re-insert from child
              this.insertIntoNode(child, anchor);
            }
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        remaining.push(anchor);
      }
    }
    node.anchors = remaining;

    // Recompute gaussianCount for this node
    node.gaussianCount = remaining.reduce((sum, a) => sum + a.gaussianCount, 0);
  }

  private containsPoint(node: LODOctreeNode, x: number, y: number, z: number): boolean {
    return Math.abs(x - node.cx) <= node.halfSize &&
           Math.abs(y - node.cy) <= node.halfSize &&
           Math.abs(z - node.cz) <= node.halfSize;
  }

  // ---------------------------------------------------------------------------
  // Metrics & Diagnostics
  // ---------------------------------------------------------------------------

  /**
   * Get comprehensive metrics about the octree state.
   */
  getMetrics(): OctreeLODMetrics {
    const levelStats = new Map<number, LODLevelStats>();
    for (let i = 0; i < this.config.maxDepth; i++) {
      levelStats.set(i, { level: i, anchorCount: 0, gaussianCount: 0, nodeCount: 0 });
    }

    if (this.root) {
      this.collectMetrics(this.root, levelStats);
    }

    let actualDepth = 0;
    for (const [level, stats] of levelStats) {
      if (stats.anchorCount > 0 && level > actualDepth) {
        actualDepth = level;
      }
    }

    return {
      totalAnchors: this.anchorCount,
      totalGaussians: this.totalGaussianCount,
      levels: Array.from(levelStats.values()),
      actualDepth,
      activeAvatarReservations: this.activeAvatars,
      totalNodes: this.nodeCount,
    };
  }

  private collectMetrics(
    node: LODOctreeNode,
    stats: Map<number, LODLevelStats>,
  ): void {
    const ls = stats.get(node.depth);
    if (ls) {
      ls.nodeCount++;
      for (const anchor of node.anchors) {
        const anchorStats = stats.get(anchor.lodLevel);
        if (anchorStats) {
          anchorStats.anchorCount++;
          anchorStats.gaussianCount += anchor.gaussianCount;
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectMetrics(child, stats);
      }
    }
  }

  /**
   * Get the total number of anchors.
   */
  getAnchorCount(): number {
    return this.anchorCount;
  }

  /**
   * Get the total Gaussian count across all anchors.
   */
  getTotalGaussianCount(): number {
    return this.totalGaussianCount;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<OctreeLODConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration (recomputes thresholds).
   */
  updateConfig(config: Partial<OctreeLODConfig>): void {
    this.config = { ...this.config, ...config };
    this.computeThresholds();
  }

  /**
   * Clear all anchors and reset the octree.
   * Preserves configuration.
   */
  clear(): void {
    if (this.root) {
      this.root.anchors = [];
      this.root.gaussianCount = 0;
      this.root.children = null;
    }
    this.anchorCount = 0;
    this.totalGaussianCount = 0;
    this.nodeCount = this.root ? 1 : 0;
  }

  /**
   * Check if the system has been initialized.
   */
  isInitialized(): boolean {
    return this.root !== null;
  }
}
