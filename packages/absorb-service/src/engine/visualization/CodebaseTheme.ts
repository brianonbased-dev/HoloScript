/**
 * Codebase Visualization Theme
 *
 * Maps language, symbol type, and complexity metrics to visual
 * properties: color, size, opacity, emissive glow.
 *
 * @version 1.0.0
 */

import type { SupportedLanguage, ExternalSymbolDefinition } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface VisualStyle {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  /** Scale factor (1 = base size) */
  scale: number;
  opacity: number;
  geometry: string;
}

export interface ThemeOptions {
  /** Color by: 'language', 'type', or 'community' */
  colorBy?: 'language' | 'type' | 'community';
  /** Size by: 'loc', 'connections', 'complexity', or 'uniform' */
  sizeBy?: 'loc' | 'connections' | 'complexity' | 'uniform';
  /** Base scale multiplier (default: 0.3) */
  baseScale?: number;
  /** Maximum scale (default: 2.0) */
  maxScale?: number;
}

// =============================================================================
// COLOR PALETTES
// =============================================================================

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3776ab',
  rust: '#dea584',
  go: '#00add8',
  java: '#b07219',
  cpp: '#f34b7d',
  csharp: '#178600',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#a97bff',
  holoscript: '#00ff88',
};

const TYPE_COLORS: Record<string, string> = {
  class: '#e74c3c',
  interface: '#3498db',
  enum: '#9b59b6',
  struct: '#e67e22',
  trait: '#1abc9c',
  function: '#2ecc71',
  method: '#27ae60',
  module: '#f39c12',
  namespace: '#d35400',
  package: '#c0392b',
  field: '#7f8c8d',
  constant: '#8e44ad',
  type_alias: '#2980b9',
};

const TYPE_GEOMETRIES: Record<string, string> = {
  class: 'cube',
  interface: 'octahedron',
  enum: 'dodecahedron',
  struct: 'cube',
  trait: 'torus',
  function: 'sphere',
  method: 'sphere',
  module: 'cylinder',
  namespace: 'cylinder',
  package: 'cylinder',
  field: 'cone',
  constant: 'tetrahedron',
  type_alias: 'icosahedron',
};

// =============================================================================
// THEME ENGINE
// =============================================================================

export class CodebaseTheme {
  private options: Required<ThemeOptions>;

  constructor(options: ThemeOptions = {}) {
    this.options = {
      colorBy: options.colorBy ?? 'language',
      sizeBy: options.sizeBy ?? 'loc',
      baseScale: options.baseScale ?? 0.3,
      maxScale: options.maxScale ?? 2.0,
    };
  }

  /**
   * Get the visual style for a symbol definition.
   */
  getStyle(
    symbol: ExternalSymbolDefinition,
    metrics?: { connections?: number; maxLoc?: number; maxConnections?: number }
  ): VisualStyle {
    const color = this.getColor(symbol);
    const scale = this.getScale(symbol, metrics);
    const isPublic = symbol.visibility === 'public';

    return {
      color,
      emissive: color,
      emissiveIntensity: isPublic ? 0.3 : 0.1,
      scale,
      opacity: isPublic ? 1.0 : 0.7,
      geometry: TYPE_GEOMETRIES[symbol.type] ?? 'sphere',
    };
  }

  /**
   * Get color for a symbol.
   */
  getColor(symbol: ExternalSymbolDefinition): string {
    if (this.options.colorBy === 'type') {
      return TYPE_COLORS[symbol.type] ?? '#888888';
    }
    return LANGUAGE_COLORS[symbol.language] ?? '#888888';
  }

  /**
   * Get scale for a symbol based on configured metric.
   */
  getScale(
    symbol: ExternalSymbolDefinition,
    metrics?: { connections?: number; maxLoc?: number; maxConnections?: number }
  ): number {
    const base = this.options.baseScale;
    const max = this.options.maxScale;

    if (this.options.sizeBy === 'uniform') {
      return base;
    }

    if (this.options.sizeBy === 'loc') {
      const loc = symbol.loc ?? 10;
      const maxLoc = metrics?.maxLoc ?? 500;
      return base + (loc / maxLoc) * (max - base);
    }

    if (this.options.sizeBy === 'connections') {
      const connections = metrics?.connections ?? 1;
      const maxConn = metrics?.maxConnections ?? 50;
      return base + (connections / maxConn) * (max - base);
    }

    return base;
  }

  /**
   * Get the color for an edge (import or call).
   */
  getEdgeColor(edgeType: 'import' | 'call'): string {
    return edgeType === 'import' ? '#4a90d9' : '#e8a838';
  }

  /**
   * Get the opacity for an edge.
   */
  getEdgeOpacity(edgeType: 'import' | 'call'): number {
    return edgeType === 'import' ? 0.4 : 0.6;
  }

  /**
   * Get hover visual style (brighter emissive, slight scale-up).
   */
  getHoverStyle(symbol: ExternalSymbolDefinition): Partial<VisualStyle> {
    const baseColor = this.getColor(symbol);
    return {
      emissive: '#ffffff',
      emissiveIntensity: 0.6,
      scale: (this.getScale(symbol) ?? this.options.baseScale) * 1.15,
      opacity: 1.0,
    };
  }

  /**
   * Get selected visual style (accent glow, full opacity).
   */
  getSelectedStyle(symbol: ExternalSymbolDefinition): Partial<VisualStyle> {
    return {
      emissive: '#00ff88',
      emissiveIntensity: 0.8,
      opacity: 1.0,
    };
  }

  /**
   * Get highlighted edge style (thicker, brighter).
   */
  getHighlightedEdgeStyle(edgeType: 'import' | 'call'): {
    color: string;
    opacity: number;
    width: number;
  } {
    return {
      color: edgeType === 'import' ? '#88ccff' : '#ffcc44',
      opacity: 0.9,
      width: edgeType === 'import' ? 3 : 4,
    };
  }
}
