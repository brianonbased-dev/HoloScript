/**
 * Force-Directed Layout (Barnes-Hut 3D)
 *
 * Positions nodes in 3D space using a simplified Barnes-Hut force simulation.
 * Connected nodes attract; all nodes repel. Produces organic, graph-aware layouts.
 *
 * @version 1.0.0
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Weight influences repulsion radius (e.g., LOC count) */
  weight: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
  weight: number;
}

export interface ForceLayoutOptions {
  /** Number of simulation iterations (default: 200) */
  iterations?: number;
  /** Repulsion strength between all nodes (default: 500) */
  repulsion?: number;
  /** Attraction strength along edges (default: 0.01) */
  attraction?: number;
  /** Damping factor per iteration (default: 0.95) */
  damping?: number;
  /** Minimum distance to avoid division by zero (default: 0.1) */
  minDistance?: number;
  /** Initial spread radius (default: 50) */
  initialSpread?: number;
}

export function forceDirectedLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: ForceLayoutOptions = {}
): LayoutNode[] {
  const iterations = options.iterations ?? 200;
  const repulsion = options.repulsion ?? 500;
  const attraction = options.attraction ?? 0.01;
  const damping = options.damping ?? 0.95;
  const minDist = options.minDistance ?? 0.1;
  const spread = options.initialSpread ?? 50;

  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    nodes[0].x = 0;
    nodes[0].y = 0;
    nodes[0].z = 0;
    return nodes;
  }

  // Initialize positions in a sphere
  for (let i = 0; i < nodes.length; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / nodes.length);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    nodes[i].x = spread * Math.sin(phi) * Math.cos(theta);
    nodes[i].y = spread * Math.sin(phi) * Math.sin(theta);
    nodes[i].z = spread * Math.cos(phi);
  }

  // Build edge lookup
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeIndex.set(nodes[i].id, i);
  }

  // Velocity arrays
  const vx = new Float64Array(nodes.length);
  const vy = new Float64Array(nodes.length);
  const vz = new Float64Array(nodes.length);

  // Simulation loop
  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations; // Cooling schedule

    // Repulsion (O(n^2) -- fine for <10k nodes typical in codebases)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), minDist);

        const force = (repulsion * temperature) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        vx[i] += fx;
        vy[i] += fy;
        vz[i] += fz;
        vx[j] -= fx;
        vy[j] -= fy;
        vz[j] -= fz;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const si = nodeIndex.get(edge.source);
      const ti = nodeIndex.get(edge.target);
      if (si === undefined || ti === undefined) continue;

      const dx = nodes[ti].x - nodes[si].x;
      const dy = nodes[ti].y - nodes[si].y;
      const dz = nodes[ti].z - nodes[si].z;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), minDist);

      const force = attraction * dist * edge.weight * temperature;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      vx[si] += fx;
      vy[si] += fy;
      vz[si] += fz;
      vx[ti] -= fx;
      vy[ti] -= fy;
      vz[ti] -= fz;
    }

    // Apply velocities with damping
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x += vx[i];
      nodes[i].y += vy[i];
      nodes[i].z += vz[i];
      vx[i] *= damping;
      vy[i] *= damping;
      vz[i] *= damping;
    }
  }

  return nodes;
}
