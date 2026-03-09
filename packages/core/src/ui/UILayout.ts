/**
 * UILayout.ts
 *
 * Flexbox-inspired layout engine: direction, alignment,
 * auto-sizing, padding, margins, and anchoring.
 *
 * @module ui
 */

// =============================================================================
// TYPES
// =============================================================================

export type FlexDirection = 'row' | 'column';
export type FlexAlign = 'start' | 'center' | 'end' | 'stretch';
export type FlexJustify = 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
export type SizeMode = 'fixed' | 'auto' | 'fill' | 'percent';

export interface LayoutEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutConfig {
  direction: FlexDirection;
  alignItems: FlexAlign;
  justifyContent: FlexJustify;
  padding: LayoutEdges;
  margin: LayoutEdges;
  gap: number;
  widthMode: SizeMode;
  heightMode: SizeMode;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  flexGrow: number;
  flexShrink: number;
}

export interface LayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  config: LayoutConfig;
  children: LayoutNode[];
  result: LayoutResult;
}

// =============================================================================
// DEFAULT LAYOUT
// =============================================================================

export function createDefaultLayout(): LayoutConfig {
  return {
    direction: 'column',
    alignItems: 'stretch',
    justifyContent: 'start',
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: 0,
    widthMode: 'fixed',
    heightMode: 'fixed',
    width: 100,
    height: 30,
    minWidth: 0,
    minHeight: 0,
    maxWidth: Infinity,
    maxHeight: Infinity,
    flexGrow: 0,
    flexShrink: 1,
  };
}

// =============================================================================
// LAYOUT ENGINE
// =============================================================================

let _layoutNodeId = 0;

export class UILayoutEngine {
  // ---------------------------------------------------------------------------
  // Node Creation
  // ---------------------------------------------------------------------------

  createNode(config?: Partial<LayoutConfig>): LayoutNode {
    return {
      id: `layout_${_layoutNodeId++}`,
      config: { ...createDefaultLayout(), ...config },
      children: [],
      result: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  addChild(parent: LayoutNode, child: LayoutNode): void {
    parent.children.push(child);
  }

  // ---------------------------------------------------------------------------
  // Layout Computation
  // ---------------------------------------------------------------------------

  compute(
    node: LayoutNode,
    containerWidth: number,
    containerHeight: number,
    isRoot: boolean = true
  ): void {
    const cfg = node.config;
    const pad = cfg.padding;

    // For root node, resolve own size from config. For children, parent already set result size.
    if (isRoot) {
      let nodeW = this.resolveSize(cfg.widthMode, cfg.width, containerWidth);
      let nodeH = this.resolveSize(cfg.heightMode, cfg.height, containerHeight);
      nodeW = this.clamp(nodeW, cfg.minWidth, cfg.maxWidth);
      nodeH = this.clamp(nodeH, cfg.minHeight, cfg.maxHeight);
      node.result.width = nodeW;
      node.result.height = nodeH;
    }
    // For child nodes, result.width/height were already set by parent

    const innerW = node.result.width - pad.left - pad.right;
    const innerH = node.result.height - pad.top - pad.bottom;

    if (node.children.length === 0) return;

    const isRow = cfg.direction === 'row';
    const mainSize = isRow ? innerW : innerH;
    const crossSize = isRow ? innerH : innerW;

    // Measure children
    const childSizes: Array<{ main: number; cross: number }> = [];
    let totalMain = 0;
    let totalGrow = 0;

    for (const child of node.children) {
      const c = child.config;
      const childW = this.resolveSize(c.widthMode, c.width, innerW);
      const childH = this.resolveSize(c.heightMode, c.height, innerH);
      const clampedW = this.clamp(childW, c.minWidth, c.maxWidth);
      const clampedH = this.clamp(childH, c.minHeight, c.maxHeight);

      const childMain = isRow ? clampedW : clampedH;
      const childCross = isRow ? clampedH : clampedW;
      childSizes.push({ main: childMain, cross: childCross });
      totalMain += childMain;
      totalGrow += c.flexGrow;
    }

    const totalGaps = cfg.gap * (node.children.length - 1);
    let freeSpace = mainSize - totalMain - totalGaps;

    // Distribute extra space via flexGrow
    if (freeSpace > 0 && totalGrow > 0) {
      for (let i = 0; i < node.children.length; i++) {
        const grow = node.children[i].config.flexGrow;
        if (grow > 0) {
          childSizes[i].main += (grow / totalGrow) * freeSpace;
        }
      }
      freeSpace = 0;
    }

    // Justify content (starting offset)
    let mainOffset = 0;
    let gapExtra = 0;

    switch (cfg.justifyContent) {
      case 'center':
        mainOffset = freeSpace / 2;
        break;
      case 'end':
        mainOffset = freeSpace;
        break;
      case 'spaceBetween':
        gapExtra = node.children.length > 1 ? freeSpace / (node.children.length - 1) : 0;
        break;
      case 'spaceAround':
        gapExtra = freeSpace / node.children.length;
        mainOffset = gapExtra / 2;
        break;
    }

    // Position children
    let cursor = mainOffset;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const sz = childSizes[i];
      const m = child.config.margin;

      // Cross axis alignment
      let crossOffset = 0;
      const actualCross = cfg.alignItems === 'stretch' ? crossSize : sz.cross;
      switch (cfg.alignItems) {
        case 'center':
          crossOffset = (crossSize - actualCross) / 2;
          break;
        case 'end':
          crossOffset = crossSize - actualCross;
          break;
      }

      if (isRow) {
        child.result.x = pad.left + cursor + m.left;
        child.result.y = pad.top + crossOffset + m.top;
        child.result.width = sz.main;
        child.result.height = actualCross;
      } else {
        child.result.x = pad.left + crossOffset + m.left;
        child.result.y = pad.top + cursor + m.top;
        child.result.width = actualCross;
        child.result.height = sz.main;
      }

      // Clamp child
      child.result.width = this.clamp(
        child.result.width,
        child.config.minWidth,
        child.config.maxWidth
      );
      child.result.height = this.clamp(
        child.result.height,
        child.config.minHeight,
        child.config.maxHeight
      );

      // Recurse
      this.compute(child, child.result.width, child.result.height, false);

      cursor += sz.main + cfg.gap + gapExtra;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveSize(mode: SizeMode, value: number, container: number): number {
    switch (mode) {
      case 'fixed':
        return value;
      case 'fill':
        return container;
      case 'percent':
        return (value / 100) * container;
      case 'auto':
        return value; // Fallback to fixed for now
      default:
        return value;
    }
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
