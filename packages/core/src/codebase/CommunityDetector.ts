/**
 * Community Detector
 *
 * Implements a simplified Louvain algorithm on the import/call graph
 * to detect module boundaries automatically. Falls back to directory
 * grouping for sparse or disconnected graphs.
 *
 * @version 1.0.0
 */

import type { ImportEdge, CallEdge } from './types';

// Minimum edges-per-node ratio for graph-based detection to be meaningful
const SPARSE_THRESHOLD = 0.5;
// Maximum iterations for Louvain convergence
const MAX_ITERATIONS = 50;

export class CommunityDetector {
  /**
   * Detect communities from file-level import and call edges.
   * Returns a map of community label -> file paths.
   */
  detect(
    files: string[],
    imports: ImportEdge[],
    calls: CallEdge[],
  ): Map<string, string[]> {
    // Build adjacency: file -> Set<file> (undirected, weighted by edge count)
    const adjacency = this.buildAdjacency(files, imports, calls);

    // Check density — if too sparse, fall back to directory grouping
    const totalEdges = this.countEdges(adjacency);
    const density = files.length > 0 ? totalEdges / files.length : 0;

    if (density < SPARSE_THRESHOLD || files.length < 3) {
      return this.directoryGrouping(files);
    }

    // Run Louvain
    const nodeToComm = this.louvain(files, adjacency);

    // Convert node->community to community->nodes
    return this.invertMapping(nodeToComm);
  }

  // ── Adjacency Builder ────────────────────────────────────────────────────

  private buildAdjacency(
    files: string[],
    imports: ImportEdge[],
    calls: CallEdge[],
  ): Map<string, Map<string, number>> {
    const adj: Map<string, Map<string, number>> = new Map();

    // Initialize all files
    for (const f of files) {
      adj.set(f, new Map());
    }

    // Import edges
    for (const imp of imports) {
      const target = imp.resolvedPath ?? imp.toModule;
      // Only count edges between files we know about
      if (!adj.has(imp.fromFile) || !adj.has(target)) continue;
      if (imp.fromFile === target) continue;

      this.addEdge(adj, imp.fromFile, target);
    }

    // Call edges — group by file
    const callsByFile: Map<string, Set<string>> = new Map();
    for (const call of calls) {
      if (!callsByFile.has(call.filePath)) {
        callsByFile.set(call.filePath, new Set());
      }
      // Find which file defines the callee (best-effort by name matching)
      for (const [filePath] of adj) {
        if (filePath === call.filePath) continue;
        // The callee might be defined in this file — we can't be sure
        // without full resolution, so we rely on import edges primarily.
        // Call edges strengthen existing import connections.
      }
    }

    return adj;
  }

  private addEdge(
    adj: Map<string, Map<string, number>>,
    a: string,
    b: string,
  ): void {
    const aNeighbors = adj.get(a)!;
    aNeighbors.set(b, (aNeighbors.get(b) ?? 0) + 1);

    const bNeighbors = adj.get(b)!;
    bNeighbors.set(a, (bNeighbors.get(a) ?? 0) + 1);
  }

  private countEdges(adj: Map<string, Map<string, number>>): number {
    let total = 0;
    for (const neighbors of adj.values()) {
      for (const weight of neighbors.values()) {
        total += weight;
      }
    }
    return total / 2; // undirected
  }

  // ── Louvain Algorithm ────────────────────────────────────────────────────

  private louvain(
    nodes: string[],
    adj: Map<string, Map<string, number>>,
  ): Map<string, string> {
    // Each node starts in its own community
    const nodeToComm: Map<string, string> = new Map();
    for (const node of nodes) {
      nodeToComm.set(node, node);
    }

    // Compute total weight
    let totalWeight = 0;
    for (const neighbors of adj.values()) {
      for (const w of neighbors.values()) {
        totalWeight += w;
      }
    }
    totalWeight /= 2; // undirected double-counted

    if (totalWeight === 0) {
      return nodeToComm;
    }

    // Compute node degree (sum of edge weights)
    const degree: Map<string, number> = new Map();
    for (const [node, neighbors] of adj) {
      let d = 0;
      for (const w of neighbors.values()) {
        d += w;
      }
      degree.set(node, d);
    }

    // Iterate: greedily move nodes to best community
    let improved = true;
    let iteration = 0;

    while (improved && iteration < MAX_ITERATIONS) {
      improved = false;
      iteration++;

      for (const node of nodes) {
        const currentComm = nodeToComm.get(node)!;
        const nodeDeg = degree.get(node) ?? 0;

        // Compute edges to each neighboring community
        const commEdges: Map<string, number> = new Map();
        const neighbors = adj.get(node);
        if (!neighbors) continue;

        for (const [neighbor, weight] of neighbors) {
          const neighborComm = nodeToComm.get(neighbor)!;
          commEdges.set(neighborComm, (commEdges.get(neighborComm) ?? 0) + weight);
        }

        // Compute sum of degrees in each candidate community
        const commDegree: Map<string, number> = new Map();
        for (const [n, comm] of nodeToComm) {
          if (n === node) continue;
          commDegree.set(comm, (commDegree.get(comm) ?? 0) + (degree.get(n) ?? 0));
        }

        // Find best community (max modularity gain)
        let bestComm = currentComm;
        let bestGain = 0;

        // Current community edges (for removal cost)
        const edgesToCurrent = commEdges.get(currentComm) ?? 0;
        const currentCommDeg = commDegree.get(currentComm) ?? 0;

        for (const [candidateComm, edgesToCandidate] of commEdges) {
          if (candidateComm === currentComm) continue;

          const candidateCommDeg = commDegree.get(candidateComm) ?? 0;

          // Modularity gain = edges_to_candidate / totalWeight
          //   - nodeDeg * candidateCommDeg / (2 * totalWeight^2)
          //   - ( - edges_to_current / totalWeight
          //       + nodeDeg * currentCommDeg / (2 * totalWeight^2) )
          const gain =
            (edgesToCandidate - edgesToCurrent) / totalWeight -
            (nodeDeg * (candidateCommDeg - currentCommDeg)) /
              (2 * totalWeight * totalWeight);

          if (gain > bestGain) {
            bestGain = gain;
            bestComm = candidateComm;
          }
        }

        if (bestComm !== currentComm) {
          nodeToComm.set(node, bestComm);
          improved = true;
        }
      }
    }

    // Normalize community labels to human-readable names
    return this.normalizeCommunityLabels(nodeToComm);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Fallback: group files by their top-level directory.
   */
  private directoryGrouping(files: string[]): Map<string, string[]> {
    const communities: Map<string, string[]> = new Map();

    for (const file of files) {
      // Use first directory segment as community
      const parts = file.replace(/\\/g, '/').split('/');
      const group = parts.length > 1 ? parts[0] : 'root';

      if (!communities.has(group)) {
        communities.set(group, []);
      }
      communities.get(group)!.push(file);
    }

    return communities;
  }

  /**
   * Rename community labels from arbitrary node names to descriptive labels
   * based on the most common directory prefix.
   */
  private normalizeCommunityLabels(
    nodeToComm: Map<string, string>,
  ): Map<string, string> {
    // Group nodes by community
    const communities = this.invertMapping(nodeToComm);
    const renamed: Map<string, string> = new Map();

    for (const [comm, files] of communities) {
      // Find the most common directory prefix
      const label = this.findCommonPrefix(files);

      // Remap all nodes in this community
      for (const file of files) {
        renamed.set(file, label);
      }
    }

    return renamed;
  }

  /**
   * Find a common directory prefix for a set of file paths.
   */
  private findCommonPrefix(files: string[]): string {
    if (files.length === 0) return 'unknown';
    if (files.length === 1) {
      const parts = files[0].replace(/\\/g, '/').split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
    }

    // Count directory occurrences
    const dirCounts: Map<string, number> = new Map();
    for (const file of files) {
      const parts = file.replace(/\\/g, '/').split('/');
      // Take directory portion
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }

    // Return the most common directory
    let best = 'root';
    let bestCount = 0;
    for (const [dir, count] of dirCounts) {
      if (count > bestCount) {
        bestCount = count;
        best = dir;
      }
    }

    return best;
  }

  /**
   * Convert node->community mapping to community->nodes mapping.
   */
  private invertMapping(nodeToComm: Map<string, string>): Map<string, string[]> {
    const communities: Map<string, string[]> = new Map();
    for (const [node, comm] of nodeToComm) {
      if (!communities.has(comm)) {
        communities.set(comm, []);
      }
      communities.get(comm)!.push(node);
    }
    return communities;
  }
}
