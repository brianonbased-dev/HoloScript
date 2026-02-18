/**
 * TreemapGenerator
 *
 * Generates an HTML treemap visualisation of bundle composition.
 * Each file is represented as a proportionally-sized cell.
 * No external dependencies — pure HTML/CSS/JS in a single string.
 */

export interface TreemapNode {
  /** Display name (typically a file path) */
  name: string;
  /** Size in bytes */
  size: number;
  /** Optional child nodes for hierarchical treemaps */
  children?: TreemapNode[];
  /** Optional category label (e.g. "scene", "traits", "runtime") */
  category?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  scene: '#4f9cf9',
  traits: '#f97316',
  runtime: '#22c55e',
  utils: '#a855f7',
  core: '#ef4444',
  default: '#6b7280',
};

export class TreemapGenerator {
  /**
   * Generate a self-contained HTML page with an interactive treemap.
   */
  generate(nodes: TreemapNode[], title = 'HoloScript Bundle Analysis'): string {
    const totalSize = nodes.reduce((s, n) => s + n.size, 0);
    const cells = nodes
      .slice()
      .sort((a, b) => b.size - a.size)
      .map((n) => this.renderCell(n, totalSize))
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f1f5f9; padding: 24px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .meta { color: #94a3b8; font-size: 0.875rem; margin-bottom: 24px; }
    .treemap { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; }
    .cell {
      display: flex; flex-direction: column; justify-content: flex-end;
      padding: 8px; border-radius: 6px; overflow: hidden; position: relative;
      transition: opacity 0.15s; cursor: default;
    }
    .cell:hover { opacity: 0.85; }
    .cell .name { font-size: 0.75rem; font-weight: 600; white-space: nowrap;
                  overflow: hidden; text-overflow: ellipsis; color: #fff; }
    .cell .size { font-size: 0.65rem; color: rgba(255,255,255,0.75); margin-top: 2px; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; }
    .legend-swatch { width: 12px; height: 12px; border-radius: 2px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Total: ${this.formatBytes(totalSize)} &bull; ${nodes.length} files</p>
  <div class="treemap">
${cells}
  </div>
  <div class="legend">
${this.renderLegend()}
  </div>
</body>
</html>`;
  }

  /**
   * Export the node tree as indented JSON.
   */
  toJSON(nodes: TreemapNode[]): string {
    return JSON.stringify(nodes, null, 2);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private renderCell(node: TreemapNode, totalSize: number): string {
    const pct = totalSize > 0 ? (node.size / totalSize) * 100 : 0;
    // Width is proportional to share; minimum 4%
    const width = Math.max(pct, 4).toFixed(1);
    const color = CATEGORY_COLORS[node.category ?? 'default'] ?? CATEGORY_COLORS['default'];
    const shortName = node.name.split('/').pop() ?? node.name;
    return `    <div class="cell" style="width:${width}%;background:${color};height:${Math.max(pct * 2, 60).toFixed(0)}px" title="${node.name}: ${this.formatBytes(node.size)}">
      <span class="name">${shortName}</span>
      <span class="size">${this.formatBytes(node.size)}</span>
    </div>`;
  }

  private renderLegend(): string {
    return Object.entries(CATEGORY_COLORS)
      .filter(([k]) => k !== 'default')
      .map(
        ([cat, color]) =>
          `    <div class="legend-item"><div class="legend-swatch" style="background:${color}"></div>${cat}</div>`
      )
      .join('\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }
}
