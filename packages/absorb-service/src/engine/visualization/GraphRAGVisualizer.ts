/**
 * Graph RAG Visualizer
 *
 * Connects Graph RAG search results to the 3D scene composition.
 * Highlights matching nodes, animates call chains, and color-codes
 * impact sets for visual exploration.
 *
 * @version 1.0.0
 */

import type { SceneComposition, SceneObject, SceneEdge } from './CodebaseSceneCompiler';
import type { CallChain } from '../CodebaseGraph';

// =============================================================================
// TYPES
// =============================================================================

export interface RAGSearchResult {
  /** Node ID (Owner.name or name) */
  nodeId: string;
  /** Relevance score (0-1) */
  score: number;
}

export interface ImpactNode {
  /** File path */
  file: string;
  /** Hop distance from changed file (0 = direct, 1 = one import away, etc.) */
  distance: number;
}

// =============================================================================
// VISUALIZER
// =============================================================================

export class GraphRAGVisualizer {
  /**
   * Highlight search results in the scene.
   * Higher-scoring nodes get stronger glow and scale-up.
   * Non-matching nodes are dimmed.
   */
  highlightSearchResults(scene: SceneComposition, results: RAGSearchResult[]): SceneComposition {
    if (results.length === 0) return scene;

    const scoreMap = new Map(results.map((r) => [r.nodeId, r.score]));
    const maxScore = Math.max(...results.map((r) => r.score));

    return {
      ...scene,
      objects: scene.objects.map((obj) => {
        const score = scoreMap.get(obj.name);
        if (score !== undefined) {
          const normalizedScore = score / maxScore;
          return {
            ...obj,
            emissive: this.scoreToColor(normalizedScore),
            emissiveIntensity: 0.3 + normalizedScore * 0.5,
            opacity: 0.7 + normalizedScore * 0.3,
            scale: obj.scale * (1 + normalizedScore * 0.3),
          };
        }
        // Dim non-matching nodes
        return {
          ...obj,
          opacity: 0.15,
          emissiveIntensity: 0.02,
        };
      }),
      edges: scene.edges.map((edge) => {
        const fromMatch = scoreMap.has(edge.from);
        const toMatch = scoreMap.has(edge.to);
        if (fromMatch && toMatch) {
          return { ...edge, opacity: 0.8, width: edge.width + 1 };
        }
        return { ...edge, opacity: 0.05 };
      }),
    };
  }

  /**
   * Visualize a call chain path through the graph.
   * Nodes and edges along the chain are highlighted with a pulse-ready style.
   */
  visualizeCallChain(scene: SceneComposition, chain: CallChain): SceneComposition {
    if (chain.path.length === 0) return scene;

    const pathSet = new Set(chain.path);

    // Build ordered edge pairs for the chain
    const chainEdges = new Set<string>();
    for (let i = 0; i < chain.path.length - 1; i++) {
      chainEdges.add(`${chain.path[i]}->${chain.path[i + 1]}`);
    }

    return {
      ...scene,
      objects: scene.objects.map((obj, idx) => {
        if (pathSet.has(obj.name)) {
          const position = chain.path.indexOf(obj.name);
          const progress = position / (chain.path.length - 1);
          // Color gradient: start=green -> end=red
          const color = this.lerpColor('#00ff88', '#ff4444', progress);
          return {
            ...obj,
            emissive: color,
            emissiveIntensity: 0.6,
            opacity: 1.0,
            scale: obj.scale * 1.2,
            properties: {
              ...obj.properties,
              _chainPosition: position,
              _chainTotal: chain.path.length,
            },
          };
        }
        return { ...obj, opacity: 0.15, emissiveIntensity: 0.02 };
      }),
      edges: scene.edges.map((edge) => {
        const edgeKey = `${edge.from}->${edge.to}`;
        const reverseKey = `${edge.to}->${edge.from}`;
        if (chainEdges.has(edgeKey) || chainEdges.has(reverseKey)) {
          return {
            ...edge,
            color: '#ffaa00',
            opacity: 0.9,
            width: 4,
          };
        }
        return { ...edge, opacity: 0.05 };
      }),
    };
  }

  /**
   * Color-code nodes by impact distance from changed files.
   * Direct changes: red. 1 hop: orange. 2+ hops: yellow. Unaffected: dim.
   */
  visualizeImpactSet(
    scene: SceneComposition,
    impactedFiles: string[],
    maxDistance = 3
  ): SceneComposition {
    // Build file-to-nodeId mapping (assume properties.file exists)
    const fileDistanceMap = new Map<string, number>();
    for (let i = 0; i < impactedFiles.length; i++) {
      // Approximate distance by order (direct changes first, then propagated)
      // In practice, the caller should provide distance metadata
      const distance = Math.min(i, maxDistance);
      fileDistanceMap.set(impactedFiles[i], distance);
    }

    const distanceColors = ['#ff2222', '#ff8800', '#ffcc00', '#ffff66'];

    return {
      ...scene,
      objects: scene.objects.map((obj) => {
        const file = obj.properties.file as string | undefined;
        if (file && fileDistanceMap.has(file)) {
          const distance = fileDistanceMap.get(file)!;
          const color = distanceColors[Math.min(distance, distanceColors.length - 1)];
          return {
            ...obj,
            emissive: color,
            emissiveIntensity: 0.5 - distance * 0.1,
            opacity: 1.0 - distance * 0.15,
            properties: {
              ...obj.properties,
              _impactDistance: distance,
            },
          };
        }
        return { ...obj, opacity: 0.15, emissiveIntensity: 0.02 };
      }),
      edges: scene.edges.map((edge) => {
        // Highlight edges between impacted nodes
        const fromObj = scene.objects.find((o) => o.name === edge.from);
        const toObj = scene.objects.find((o) => o.name === edge.to);
        const fromFile = fromObj?.properties.file as string | undefined;
        const toFile = toObj?.properties.file as string | undefined;
        const bothImpacted =
          fromFile && toFile && fileDistanceMap.has(fromFile) && fileDistanceMap.has(toFile);

        if (bothImpacted) {
          return { ...edge, color: '#ff8800', opacity: 0.7, width: edge.width + 1 };
        }
        return { ...edge, opacity: 0.05 };
      }),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────

  /** Map a score (0-1) to a color (dim blue → bright green) */
  private scoreToColor(score: number): string {
    // Low score: #335577, high score: #00ff88
    const r = Math.round(0x33 + (0x00 - 0x33) * score);
    const g = Math.round(0x55 + (0xff - 0x55) * score);
    const b = Math.round(0x77 + (0x88 - 0x77) * score);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /** Linear interpolation between two hex colors */
  private lerpColor(colorA: string, colorB: string, t: number): string {
    const a = this.parseHex(colorA);
    const b = this.parseHex(colorB);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const blue = Math.round(a.b + (b.b - a.b) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
  }

  private parseHex(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }
}
