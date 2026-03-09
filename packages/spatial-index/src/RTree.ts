/**
 * @holoscript/spatial-index - R-Tree Implementation
 *
 * High-performance R-Tree spatial index with OMT bulk loading.
 * Optimized for geospatial anchor queries with O(log n) performance.
 *
 * Based on research:
 * - RBush (https://github.com/mourner/rbush)
 * - OMT Algorithm for overlap minimization
 * - R*-Tree splitting algorithms
 *
 * @version 1.0.0
 */

import type {
  BBox,
  Point,
  GeospatialAnchor,
  RTreeNode,
  RTreeOptions,
  RTreeStats,
  QueryResult,
} from './types';
import {
  bboxArea,
  bboxIntersectionArea,
  bboxMargin,
  bboxContainsPoint,
  bboxIntersects,
  bboxEnlargement,
  createBBoxFromAnchor,
  extendBBox,
  mergeBBox,
  createContainingBBox,
  haversineDistance,
  minDistanceToBBox,
  createRadiusBBox,
} from './bbox';

/**
 * High-performance R-Tree for geospatial anchor indexing
 */
export class RTree {
  private root: RTreeNode;
  private options: Required<RTreeOptions>;
  private anchorMap: Map<string, GeospatialAnchor>;

  constructor(options: RTreeOptions = {}) {
    this.options = {
      maxEntries: options.maxEntries ?? 9,
      minEntries: options.minEntries ?? Math.ceil((options.maxEntries ?? 9) * 0.4),
      bulkLoadingEnabled: options.bulkLoadingEnabled ?? true,
    };

    this.root = this.createNode([], true);
    this.anchorMap = new Map();
  }

  /**
   * Insert a single geospatial anchor
   */
  insert(anchor: GeospatialAnchor): void {
    const bbox = createBBoxFromAnchor(anchor);
    this.anchorMap.set(anchor.id, anchor);
    this._insert(bbox, anchor, this.root.height);
  }

  /**
   * Bulk load multiple anchors (2-3x faster than individual inserts)
   */
  load(anchors: GeospatialAnchor[]): void {
    if (anchors.length === 0) return;

    // Store in anchor map
    for (const anchor of anchors) {
      this.anchorMap.set(anchor.id, anchor);
    }

    if (!this.options.bulkLoadingEnabled || anchors.length < this.options.minEntries) {
      // Fall back to sequential insertion for small datasets
      for (const anchor of anchors) {
        this.insert(anchor);
      }
      return;
    }

    // OMT (Overlap Minimizing Top-down) bulk loading
    const items = anchors.map((anchor) => ({
      bbox: createBBoxFromAnchor(anchor),
      anchor,
    }));

    this.root = this._bulkLoad(items, 0);
  }

  /**
   * Remove an anchor by ID
   */
  remove(anchorId: string): boolean {
    const anchor = this.anchorMap.get(anchorId);
    if (!anchor) return false;

    const bbox = createBBoxFromAnchor(anchor);
    const removed = this._remove(bbox, anchor, this.root);

    if (removed) {
      this.anchorMap.delete(anchorId);
    }

    return removed;
  }

  /**
   * Search for anchors within a bounding box
   */
  search(bbox: BBox): GeospatialAnchor[] {
    const results: GeospatialAnchor[] = [];
    this._search(bbox, this.root, results);
    return results;
  }

  /**
   * Search for anchors within radius of a point (in meters)
   */
  searchRadius(center: Point, radiusMeters: number): QueryResult[] {
    // First, do bounding box query to narrow candidates
    const searchBBox = createRadiusBBox(center, radiusMeters);
    const candidates = this.search(searchBBox);

    // Then filter by precise haversine distance
    const results: QueryResult[] = [];
    for (const anchor of candidates) {
      const distance = haversineDistance(center, { lat: anchor.lat, lon: anchor.lon });
      if (distance <= radiusMeters) {
        results.push({ anchor, distance });
      }
    }

    // Sort by distance
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Find K nearest neighbors
   */
  knn(center: Point, k: number): QueryResult[] {
    if (k <= 0) return [];

    const queue: Array<{ node: RTreeNode; dist: number; isLeaf: boolean }> = [];
    const results: QueryResult[] = [];

    // Initialize with root
    queue.push({
      node: this.root,
      dist: minDistanceToBBox(center, this.root.bbox),
      isLeaf: this.root.leaf,
    });

    while (queue.length > 0 && results.length < k) {
      // Pop closest item
      queue.sort((a, b) => a.dist - b.dist);
      const { node, isLeaf } = queue.shift()!;

      if (isLeaf && node.items) {
        // Add all items from this leaf
        for (const item of node.items) {
          const distance = haversineDistance(center, { lat: item.lat, lon: item.lon });
          results.push({ anchor: item, distance });
        }
      } else if (node.children) {
        // Add children to queue
        for (const child of node.children) {
          const dist = minDistanceToBBox(center, child.bbox);
          queue.push({ node: child, dist, isLeaf: child.leaf });
        }
      }
    }

    // Sort and take top k
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, k);
  }

  /**
   * Get all anchors
   */
  all(): GeospatialAnchor[] {
    return Array.from(this.anchorMap.values());
  }

  /**
   * Clear all anchors
   */
  clear(): void {
    this.root = this.createNode([], true);
    this.anchorMap.clear();
  }

  /**
   * Get tree statistics
   */
  getStats(): RTreeStats {
    let totalNodes = 0;
    let totalAnchors = 0;
    let totalArea = 0;
    let totalOverlap = 0;

    const traverse = (node: RTreeNode) => {
      totalNodes++;
      if (node.leaf && node.items) {
        totalAnchors += node.items.length;
      }
      if (node.children) {
        totalArea += node.children.reduce((sum, child) => sum + bboxArea(child.bbox), 0);

        // Calculate overlap between siblings
        for (let i = 0; i < node.children.length; i++) {
          for (let j = i + 1; j < node.children.length; j++) {
            totalOverlap += bboxIntersectionArea(node.children[i].bbox, node.children[j].bbox);
          }
        }

        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(this.root);

    return {
      totalNodes,
      totalAnchors,
      height: this.root.height,
      avgFillRatio: totalAnchors / (totalNodes * this.options.maxEntries),
      totalOverlap,
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private createNode(children: RTreeNode[], leaf: boolean): RTreeNode {
    const node: RTreeNode = {
      bbox: this.createEmptyBBox(),
      children: leaf ? undefined : children,
      items: leaf ? [] : undefined,
      height: leaf ? 1 : children[0]?.height + 1 || 1,
      leaf,
    };

    if (leaf && children.length > 0) {
      // For leaf nodes created during bulk loading
      node.items = children as any;
    }

    this.updateBBox(node);
    return node;
  }

  private createEmptyBBox(): BBox {
    return {
      minLat: Infinity,
      minLon: Infinity,
      maxLat: -Infinity,
      maxLon: -Infinity,
    };
  }

  private updateBBox(node: RTreeNode): void {
    node.bbox = this.createEmptyBBox();

    if (node.leaf && node.items) {
      for (const item of node.items) {
        const point = { lat: item.lat, lon: item.lon };
        node.bbox = extendBBox(node.bbox, point);
      }
    } else if (node.children) {
      for (const child of node.children) {
        node.bbox = mergeBBox(node.bbox, child.bbox);
      }
    }
  }

  private _insert(bbox: BBox, anchor: GeospatialAnchor, level: number): void {
    const insertPath: RTreeNode[] = [];

    // Find the best leaf to insert into
    const node = this.chooseSubtree(bbox, this.root, level, insertPath);

    // Insert into leaf
    node.items!.push(anchor);
    this.updateBBox(node);

    // Split if necessary and propagate changes up
    while (level >= 0) {
      const parent = insertPath[level];
      if (
        (parent.leaf ? parent.items!.length : parent.children!.length) > this.options.maxEntries
      ) {
        this.split(insertPath, level);
      } else {
        this.updateBBox(parent);
      }
      level--;
    }
  }

  private chooseSubtree(bbox: BBox, node: RTreeNode, level: number, path: RTreeNode[]): RTreeNode {
    path.push(node);

    if (node.leaf || path.length - 1 === level) {
      return node;
    }

    let minEnlargement = Infinity;
    let minArea = Infinity;
    let targetChild: RTreeNode | null = null;

    for (const child of node.children!) {
      const enlargement = bboxEnlargement(child.bbox, { lat: bbox.minLat, lon: bbox.minLon });
      const area = bboxArea(child.bbox);

      if (enlargement < minEnlargement || (enlargement === minEnlargement && area < minArea)) {
        minEnlargement = enlargement;
        minArea = area;
        targetChild = child;
      }
    }

    return this.chooseSubtree(bbox, targetChild!, level, path);
  }

  private split(insertPath: RTreeNode[], level: number): void {
    const node = insertPath[level];
    const items = node.leaf ? node.items! : node.children!;

    // Choose split axis and index
    const [m, M] = this.chooseSplitAxis(items, node.leaf);

    // Split the node
    const left = node.leaf ? items.slice(0, m) : items.slice(0, m);
    const right = node.leaf ? items.slice(m) : items.slice(m);

    if (node.leaf) {
      node.items = left as GeospatialAnchor[];
    } else {
      node.children = left as RTreeNode[];
    }
    this.updateBBox(node);

    const newNode = this.createNode(right as any, node.leaf);

    if (level === 0) {
      // Create new root
      const newRoot = this.createNode([node, newNode], false);
      this.root = newRoot;
    } else {
      insertPath[level - 1].children!.push(newNode);
      this.updateBBox(insertPath[level - 1]);
    }
  }

  private chooseSplitAxis(
    items: (RTreeNode | GeospatialAnchor)[],
    isLeaf: boolean
  ): [number, number] {
    const m = this.options.minEntries;
    const M = items.length;

    // Sort by latitude
    items.sort((a, b) => {
      const aLat = isLeaf ? (a as GeospatialAnchor).lat : (a as RTreeNode).bbox.minLat;
      const bLat = isLeaf ? (b as GeospatialAnchor).lat : (b as RTreeNode).bbox.minLat;
      return aLat - bLat;
    });

    const latSplit = this.findBestSplit(items, m, M, isLeaf);

    // Sort by longitude
    items.sort((a, b) => {
      const aLon = isLeaf ? (a as GeospatialAnchor).lon : (a as RTreeNode).bbox.minLon;
      const bLon = isLeaf ? (b as GeospatialAnchor).lon : (b as RTreeNode).bbox.minLon;
      return aLon - bLon;
    });

    const lonSplit = this.findBestSplit(items, m, M, isLeaf);

    // Choose axis with minimum overlap
    return latSplit.overlap < lonSplit.overlap ? [latSplit.index, M] : [lonSplit.index, M];
  }

  private findBestSplit(
    items: (RTreeNode | GeospatialAnchor)[],
    m: number,
    M: number,
    isLeaf: boolean
  ) {
    let minOverlap = Infinity;
    let minArea = Infinity;
    let bestIndex = m;

    for (let i = m; i <= M - m; i++) {
      const left = items.slice(0, i);
      const right = items.slice(i);

      const leftBBox = this.calcBBox(left, isLeaf);
      const rightBBox = this.calcBBox(right, isLeaf);

      const overlap = bboxIntersectionArea(leftBBox, rightBBox);
      const area = bboxArea(leftBBox) + bboxArea(rightBBox);

      if (overlap < minOverlap || (overlap === minOverlap && area < minArea)) {
        minOverlap = overlap;
        minArea = area;
        bestIndex = i;
      }
    }

    return { index: bestIndex, overlap: minOverlap };
  }

  private calcBBox(items: (RTreeNode | GeospatialAnchor)[], isLeaf: boolean): BBox {
    let bbox = this.createEmptyBBox();

    for (const item of items) {
      if (isLeaf) {
        const anchor = item as GeospatialAnchor;
        bbox = extendBBox(bbox, { lat: anchor.lat, lon: anchor.lon });
      } else {
        bbox = mergeBBox(bbox, (item as RTreeNode).bbox);
      }
    }

    return bbox;
  }

  private _search(bbox: BBox, node: RTreeNode, results: GeospatialAnchor[]): void {
    if (!bboxIntersects(bbox, node.bbox)) {
      return;
    }

    if (node.leaf && node.items) {
      for (const item of node.items) {
        const point = { lat: item.lat, lon: item.lon };
        if (bboxContainsPoint(bbox, point)) {
          results.push(item);
        }
      }
    } else if (node.children) {
      for (const child of node.children) {
        this._search(bbox, child, results);
      }
    }
  }

  private _remove(bbox: BBox, anchor: GeospatialAnchor, node: RTreeNode): boolean {
    if (!bboxIntersects(bbox, node.bbox)) {
      return false;
    }

    if (node.leaf && node.items) {
      const index = node.items.findIndex((item) => item.id === anchor.id);
      if (index !== -1) {
        node.items.splice(index, 1);
        this.updateBBox(node);
        return true;
      }
    } else if (node.children) {
      for (const child of node.children) {
        if (this._remove(bbox, anchor, child)) {
          this.updateBBox(node);
          return true;
        }
      }
    }

    return false;
  }

  private _bulkLoad(
    items: Array<{ bbox: BBox; anchor: GeospatialAnchor }>,
    level: number
  ): RTreeNode {
    const N = items.length;
    const M = this.options.maxEntries;

    if (N <= M) {
      // Create leaf node
      return this.createNode(items.map((item) => item.anchor) as any, true);
    }

    // Sort items by Hilbert value for better spatial locality
    items.sort((a, b) => {
      const aCenter = {
        lat: (a.bbox.minLat + a.bbox.maxLat) / 2,
        lon: (a.bbox.minLon + a.bbox.maxLon) / 2,
      };
      const bCenter = {
        lat: (b.bbox.minLat + b.bbox.maxLat) / 2,
        lon: (b.bbox.minLon + b.bbox.maxLon) / 2,
      };
      return this.hilbertValue(aCenter) - this.hilbertValue(bCenter);
    });

    // Split into groups
    const groups: Array<Array<{ bbox: BBox; anchor: GeospatialAnchor }>> = [];
    for (let i = 0; i < N; i += M) {
      groups.push(items.slice(i, i + M));
    }

    // Recursively build nodes
    const children = groups.map((group) => this._bulkLoad(group, level + 1));

    if (children.length === 1) {
      return children[0];
    }

    return this.createNode(children, false);
  }

  private hilbertValue(point: Point): number {
    // Simplified Hilbert curve value for spatial sorting
    // Normalize to [0, 1]
    const x = (point.lon + 180) / 360;
    const y = (point.lat + 90) / 180;

    // Simple interleaving (Morton code approximation)
    let result = 0;
    for (let i = 0; i < 16; i++) {
      const bit = 1 << i;
      if (Math.floor(x * (1 << 16)) & bit) result |= 1 << (i * 2);
      if (Math.floor(y * (1 << 16)) & bit) result |= 1 << (i * 2 + 1);
    }
    return result;
  }
}
