/**
 * UIEventRouter — Pointer/focus/hover event routing with bubbling
 *
 * @version 1.0.0
 */

export type UIEventType =
  | 'click'
  | 'hover'
  | 'hoverEnd'
  | 'focus'
  | 'blur'
  | 'pointerDown'
  | 'pointerUp'
  | 'pointerMove'
  | 'valueChange';

export interface UIEvent {
  type: UIEventType;
  targetId: string;
  x?: number;
  y?: number;
  value?: unknown;
  propagationStopped: boolean;
  timestamp: number;
}

export type UIEventHandler = (event: UIEvent) => void;

export class UIEventRouter {
  private handlers: Map<string, Map<UIEventType, UIEventHandler[]>> = new Map();
  private focusedId: string | null = null;
  private hoveredId: string | null = null;
  private eventLog: UIEvent[] = [];
  private maxLog: number = 100;

  /**
   * Register an event handler for a widget
   */
  on(widgetId: string, type: UIEventType, handler: UIEventHandler): void {
    if (!this.handlers.has(widgetId)) this.handlers.set(widgetId, new Map());
    const typeMap = this.handlers.get(widgetId)!;
    if (!typeMap.has(type)) typeMap.set(type, []);
    typeMap.get(type)!.push(handler);
  }

  /**
   * Emit an event
   */
  emit(targetId: string, type: UIEventType, x?: number, y?: number, value?: unknown): UIEvent {
    const event: UIEvent = {
      type,
      targetId,
      x,
      y,
      value,
      propagationStopped: false,
      timestamp: Date.now(),
    };
      if (x !== undefined) (event as unknown as Record<number, unknown>)[0] = x;
      if (y !== undefined) (event as unknown as Record<number, unknown>)[1] = y;

    const typeMap = this.handlers.get(targetId);
    if (typeMap) {
      const handlers = typeMap.get(type);
      if (handlers) {
        for (const handler of handlers) {
          if (event.propagationStopped) break;
          handler(event);
        }
      }
    }

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLog) this.eventLog.shift();
    return event;
  }

  /**
   * Set focus
   */
  setFocus(widgetId: string): void {
    if (this.focusedId && this.focusedId !== widgetId) {
      this.emit(this.focusedId, 'blur');
    }
    this.focusedId = widgetId;
    this.emit(widgetId, 'focus');
  }

  /**
   * Update hover state
   */
  setHover(widgetId: string | null): void {
    if (this.hoveredId && this.hoveredId !== widgetId) {
      this.emit(this.hoveredId, 'hoverEnd');
    }
    this.hoveredId = widgetId;
    if (widgetId) this.emit(widgetId, 'hover');
  }

  /**
   * Simulate a click on a widget
   */
  click(widgetId: string, x?: number, y?: number): UIEvent {
    this.emit(widgetId, 'pointerDown', x, y);
    this.emit(widgetId, 'pointerUp', x, y);
    return this.emit(widgetId, 'click', x, y);
  }

  getFocused(): string | null {
    return this.focusedId;
  }
  getHovered(): string | null {
    return this.hoveredId;
  }
  getEventLog(): UIEvent[] {
    return [...this.eventLog];
  }
  clearLog(): void {
    this.eventLog = [];
  }
}
