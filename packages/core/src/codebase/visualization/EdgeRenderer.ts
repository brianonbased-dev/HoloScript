/**
 * Edge Renderer
 *
 * Generates 3D bezier curves for import and call edges between nodes.
 * Supports edge bundling for dense graphs to reduce visual clutter.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface EdgePoint {
  x: number;
  y: number;
  z: number;
}

export interface RenderedEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: 'import' | 'call';
  /** Bezier control points (source, control1, control2, target) */
  points: [EdgePoint, EdgePoint, EdgePoint, EdgePoint];
  /** Edge color */
  color: string;
  /** Edge opacity */
  opacity: number;
  /** Edge width */
  width: number;
}

export interface EdgeRenderOptions {
  /** Curve height factor (default: 0.3 = 30% of distance) */
  curveHeight?: number;
  /** Import edge color (default: '#4a90d9') */
  importColor?: string;
  /** Call edge color (default: '#e8a838') */
  callColor?: string;
  /** Import edge opacity (default: 0.4) */
  importOpacity?: number;
  /** Call edge opacity (default: 0.6) */
  callOpacity?: number;
  /** Maximum edges to render (default: 500) */
  maxEdges?: number;
  /** Enable edge bundling for dense graphs (default: true) */
  bundleEdges?: boolean;
}

// =============================================================================
// RENDERER
// =============================================================================

export class EdgeRenderer {
  private options: Required<EdgeRenderOptions>;

  constructor(options: EdgeRenderOptions = {}) {
    this.options = {
      curveHeight: options.curveHeight ?? 0.3,
      importColor: options.importColor ?? '#4a90d9',
      callColor: options.callColor ?? '#e8a838',
      importOpacity: options.importOpacity ?? 0.4,
      callOpacity: options.callOpacity ?? 0.6,
      maxEdges: options.maxEdges ?? 500,
      bundleEdges: options.bundleEdges ?? true,
    };
  }

  /**
   * Render edges as bezier curves between positioned nodes.
   */
  render(
    edges: Array<{ from: string; to: string; type: 'import' | 'call' }>,
    positions: Map<string, EdgePoint>,
  ): RenderedEdge[] {
    const result: RenderedEdge[] = [];
    const maxEdges = this.options.maxEdges;

    // Sort: call edges first (more important), then imports
    const sorted = [...edges].sort((a, b) => {
      if (a.type === 'call' && b.type !== 'call') return -1;
      if (a.type !== 'call' && b.type === 'call') return 1;
      return 0;
    });

    for (const edge of sorted) {
      if (result.length >= maxEdges) break;

      const fromPos = positions.get(edge.from);
      const toPos = positions.get(edge.to);
      if (!fromPos || !toPos) continue;

      const rendered = this.renderEdge(edge.from, edge.to, edge.type, fromPos, toPos);
      result.push(rendered);
    }

    if (this.options.bundleEdges && result.length > 50) {
      return this.bundleParallelEdges(result);
    }

    return result;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private renderEdge(
    from: string,
    to: string,
    type: 'import' | 'call',
    fromPos: EdgePoint,
    toPos: EdgePoint,
  ): RenderedEdge {
    const isCall = type === 'call';

    // Compute bezier control points for a curved edge
    const midX = (fromPos.x + toPos.x) / 2;
    const midY = (fromPos.y + toPos.y) / 2;
    const midZ = (fromPos.z + toPos.z) / 2;

    // Distance between nodes
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const dz = toPos.z - fromPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Curve height proportional to distance
    const lift = dist * this.options.curveHeight;

    // Control points lift upward (Y+) to create an arc
    const ctrl1: EdgePoint = {
      x: midX - dx * 0.1,
      y: midY + lift,
      z: midZ - dz * 0.1,
    };
    const ctrl2: EdgePoint = {
      x: midX + dx * 0.1,
      y: midY + lift,
      z: midZ + dz * 0.1,
    };

    return {
      from,
      to,
      type,
      points: [fromPos, ctrl1, ctrl2, toPos],
      color: isCall ? this.options.callColor : this.options.importColor,
      opacity: isCall ? this.options.callOpacity : this.options.importOpacity,
      width: isCall ? 2 : 1,
    };
  }

  /**
   * Bundle edges that share similar source/target regions.
   * Merges nearby parallel edges into thicker single edges.
   */
  private bundleParallelEdges(edges: RenderedEdge[]): RenderedEdge[] {
    // Group edges by approximate direction bucket
    const bucketSize = 5; // spatial hash resolution
    const buckets = new Map<string, RenderedEdge[]>();

    for (const edge of edges) {
      const fromBucket = this.spatialBucket(edge.points[0], bucketSize);
      const toBucket = this.spatialBucket(edge.points[3], bucketSize);
      const key = `${fromBucket}->${toBucket}`;

      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key)!.push(edge);
    }

    // For each bucket, if multiple edges share the path, merge into one thicker edge
    const result: RenderedEdge[] = [];
    for (const [, group] of buckets) {
      if (group.length === 1) {
        result.push(group[0]);
      } else {
        // Use the first edge as representative, increase width
        const representative = { ...group[0] };
        representative.width = Math.min(representative.width + group.length - 1, 5);
        representative.opacity = Math.min(representative.opacity + 0.1, 0.9);
        result.push(representative);
      }
    }

    return result;
  }

  private spatialBucket(point: EdgePoint, size: number): string {
    const bx = Math.floor(point.x / size);
    const by = Math.floor(point.y / size);
    const bz = Math.floor(point.z / size);
    return `${bx},${by},${bz}`;
  }
}
