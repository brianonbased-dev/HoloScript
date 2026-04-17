/**
 * UIWidget — Widget tree with layout, anchors, flex, and styling
 *
 * @version 1.0.0
 */

export type WidgetType = 'panel' | 'label' | 'button' | 'image' | 'input' | 'slider' | 'container';
export type AnchorPreset =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'stretch';
export type LayoutMode = 'absolute' | 'horizontal' | 'vertical' | 'grid';

export interface WidgetStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  margin?: number;
  opacity?: number;
  fontSize?: number;
  fontColor?: string;
}

export interface UIWidgetDef {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: AnchorPreset;
  visible: boolean;
  interactive: boolean;
  style: WidgetStyle;
  text?: string;
  parentId: string | null;
  children: string[];
  zIndex: number;
}

export class UIWidget {
  private widgets: Map<string, UIWidgetDef> = new Map();
  private rootId: string | null = null;

  createWidget(
    id: string,
    type: WidgetType,
    opts: Partial<Omit<UIWidgetDef, 'id' | 'type'>> = {}
  ): UIWidgetDef {
    const widget: UIWidgetDef = {
      id,
      type,
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      width: opts.width ?? 100,
      height: opts.height ?? 40,
      anchor: opts.anchor ?? 'top-left',
      visible: opts.visible ?? true,
      interactive: opts.interactive ?? (type === 'button' || type === 'input' || type === 'slider'),
      style: opts.style ?? {},
      text: opts.text,
      parentId: opts.parentId ?? null,
      children: [],
      zIndex: opts.zIndex ?? 0,
    };
    this.widgets.set(id, widget);
    if (!this.rootId && !widget.parentId) this.rootId = id;
    if (widget.parentId) {
      const parent = this.widgets.get(widget.parentId);
      if (parent) parent.children.push(id);
    }
    return widget;
  }

  addChild(parentId: string, childId: string): boolean {
    const parent = this.widgets.get(parentId);
    const child = this.widgets.get(childId);
    if (!parent || !child) return false;
    child.parentId = parentId;
    if (!parent.children.includes(childId)) parent.children.push(childId);
    return true;
  }

  removeWidget(id: string): boolean {
    const widget = this.widgets.get(id);
    if (!widget) return false;
    if (widget.parentId) {
      const parent = this.widgets.get(widget.parentId);
      if (parent) parent.children = parent.children.filter((c) => c !== id);
    }
    // Recursively remove children
    for (const childId of widget.children) this.removeWidget(childId);
    return this.widgets.delete(id);
  }

  getWidget(id: string): UIWidgetDef | undefined {
    return this.widgets.get(id);
  }

  setStyle(id: string, style: Partial<WidgetStyle>): void {
    const w = this.widgets.get(id);
    if (w) Object.assign(w.style, style);
  }

  setVisible(id: string, visible: boolean): void {
    const w = this.widgets.get(id);
    if (w) w.visible = visible;
  }

  setText(id: string, text: string): void {
    const w = this.widgets.get(id);
    if (w) w.text = text;
  }

  /**
   * Get widgets sorted by z-index for rendering
   */
  getRenderOrder(): UIWidgetDef[] {
    return [...this.widgets.values()].filter((w) => w.visible).sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Hit test a point against widgets
   */
  hitTest(px: number, py: number): UIWidgetDef | null {
    const sorted = this.getRenderOrder().reverse();
    for (const w of sorted) {
      if (!w.interactive) continue;
      if (px >= w.x && px <= w.x + w.width && py >= w.y && py <= w.y + w.height) return w;
    }
    return null;
  }

  getWidgetCount(): number {
    return this.widgets.size;
  }
  getRoot(): UIWidgetDef | undefined {
    return this.rootId ? this.widgets.get(this.rootId) : undefined;
  }
}
