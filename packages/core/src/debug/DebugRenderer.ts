/**
 * DebugRenderer.ts
 *
 * Debug visualization primitives: wireframe shapes, gizmos,
 * bounding boxes, ray/line drawing, and text labels.
 *
 * @module debug
 */

// =============================================================================
// TYPES
// =============================================================================

export type DebugDrawType =
  | 'line'
  | 'sphere'
  | 'box'
  | 'ray'
  | 'arrow'
  | 'text'
  | 'circle'
  | 'grid';

export interface DebugColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface DebugDrawCall {
  id: string;
  type: DebugDrawType;
  params: Record<string, unknown>;
  color: DebugColor;
  duration: number; // Seconds, 0 = single frame
  createdAt: number;
  depthTest: boolean;
}

// =============================================================================
// PRESET COLORS
// =============================================================================

export const DebugColors = {
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 1, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 },
  yellow: { r: 1, g: 1, b: 0, a: 1 },
  cyan: { r: 0, g: 1, b: 1, a: 1 },
  magenta: { r: 1, g: 0, b: 1, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  gray: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
} as const;

// =============================================================================
// DEBUG RENDERER
// =============================================================================

let _debugId = 0;

export class DebugRenderer {
  private drawCalls: DebugDrawCall[] = [];
  private enabled = true;
  private currentTime = 0;

  // ---------------------------------------------------------------------------
  // Draw Primitives
  // ---------------------------------------------------------------------------

  drawLine(
    from: [number, number, number],
    to: [number, number, number],
    color = DebugColors.green,
    duration = 0
  ): string {
    return this.addDraw('line', { from, to }, color, duration);
  }

  drawRay(
    origin: [number, number, number],
    direction: [number, number, number],
    length = 10,
    color = DebugColors.yellow,
    duration = 0
  ): string {
    return this.addDraw('ray', { origin, direction, length }, color, duration);
  }

  drawArrow(
    from: [number, number, number],
    to: [number, number, number],
    headSize = 0.3,
    color = DebugColors.cyan,
    duration = 0
  ): string {
    return this.addDraw('arrow', { from, to, headSize }, color, duration);
  }

  drawSphere(
    center: [number, number, number],
    radius: number,
    color = DebugColors.white,
    duration = 0
  ): string {
    return this.addDraw('sphere', { center, radius }, color, duration);
  }

  drawBox(
    center: [number, number, number],
    size: [number, number, number],
    color = DebugColors.green,
    duration = 0
  ): string {
    return this.addDraw('box', { center, size }, color, duration);
  }

  drawCircle(
    center: [number, number, number],
    radius: number,
    normal: [number, number, number],
    color = DebugColors.blue,
    duration = 0
  ): string {
    return this.addDraw('circle', { center, radius, normal }, color, duration);
  }

  drawText(
    position: [number, number, number],
    text: string,
    color = DebugColors.white,
    duration = 0
  ): string {
    return this.addDraw('text', { position, text }, color, duration);
  }

  drawGrid(
    center: [number, number, number],
    size: number,
    divisions: number,
    color = DebugColors.gray,
    duration = 0
  ): string {
    return this.addDraw('grid', { center, size, divisions }, color, duration);
  }

  // ---------------------------------------------------------------------------
  // Management
  // ---------------------------------------------------------------------------

  private addDraw(
    type: DebugDrawType,
    params: Record<string, unknown>,
    color: DebugColor,
    duration: number
  ): string {
    if (!this.enabled) return '';
    const id = `dbg_${_debugId++}`;
    this.drawCalls.push({
      id,
      type,
      params,
      color,
      duration,
      createdAt: this.currentTime,
      depthTest: true,
    });
    return id;
  }

  removeDraw(id: string): boolean {
    const idx = this.drawCalls.findIndex((d) => d.id === id);
    if (idx < 0) return false;
    this.drawCalls.splice(idx, 1);
    return true;
  }

  update(dt: number): void {
    this.currentTime += dt;
    this.drawCalls = this.drawCalls.filter((d) => {
      if (d.duration <= 0) return false; // Single-frame, remove after one update
      return this.currentTime - d.createdAt < d.duration;
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getDrawCalls(): DebugDrawCall[] {
    return [...this.drawCalls];
  }
  getDrawCallCount(): number {
    return this.drawCalls.length;
  }
  getDrawCallsByType(type: DebugDrawType): DebugDrawCall[] {
    return this.drawCalls.filter((d) => d.type === type);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }

  clear(): void {
    this.drawCalls = [];
  }
}
