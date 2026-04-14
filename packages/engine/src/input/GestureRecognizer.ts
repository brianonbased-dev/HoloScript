/**
 * GestureRecognizer.ts
 *
 * Touch/pointer gesture recognition: tap, double-tap, swipe,
 * pinch, long press, and extensible custom gesture patterns.
 *
 * @module input
 */

// =============================================================================
// TYPES
// =============================================================================

export type GestureType = 'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'pinch' | 'pan' | 'custom';
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  timestamp: number;
}

export interface GestureEvent {
  type: GestureType;
  position: { x: number; y: number };
  timestamp: number;
  // Swipe data
  direction?: SwipeDirection;
  velocity?: number;
  distance?: number;
  // Pinch data
  scale?: number;
  // Pan data
  deltaX?: number;
  deltaY?: number;
  // Custom
  name?: string;
}

export interface GestureConfig {
  tapMaxDuration: number; // ms, max hold time for tap
  tapMaxDistance: number; // px, max movement for tap
  doubleTapWindow: number; // ms, max time between taps
  longPressMinDuration: number; // ms, min hold time for long press
  swipeMinDistance: number; // px, min swipe distance
  swipeMinVelocity: number; // px/ms
  pinchMinScale: number; // min scale change to trigger
}

export type GestureCallback = (event: GestureEvent) => void;

// =============================================================================
// GESTURE RECOGNIZER
// =============================================================================

let _gestureSubId = 0;

const DEFAULT_CONFIG: GestureConfig = {
  tapMaxDuration: 300,
  tapMaxDistance: 10,
  doubleTapWindow: 400,
  longPressMinDuration: 500,
  swipeMinDistance: 50,
  swipeMinVelocity: 0.3,
  pinchMinScale: 0.05,
};

export class GestureRecognizer {
  private config: GestureConfig;
  private activeTouches: Map<number, TouchPoint> = new Map();
  private touchStarts: Map<number, TouchPoint> = new Map(); // Original positions
  private subscribers: Map<string, { types: GestureType[]; callback: GestureCallback }> = new Map();
  private lastTapTime = 0;
  private lastTapPosition: { x: number; y: number } = { x: 0, y: 0 };
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private gestureHistory: GestureEvent[] = [];
  private initialPinchDistance = 0;

  constructor(config?: Partial<GestureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  on(types: GestureType | GestureType[], callback: GestureCallback): string {
    const id = `gsub_${_gestureSubId++}`;
    const typeArr = Array.isArray(types) ? types : [types];
    this.subscribers.set(id, { types: typeArr, callback });
    return id;
  }

  off(subscriptionId: string): void {
    this.subscribers.delete(subscriptionId);
  }

  // ---------------------------------------------------------------------------
  // Touch Events
  // ---------------------------------------------------------------------------

  touchStart(id: number, x: number, y: number): void {
    const now = Date.now();
    this.activeTouches.set(id, { id, x, y, timestamp: now });
    this.touchStarts.set(id, { id, x, y, timestamp: now });

    // Start long press timer
    if (this.activeTouches.size === 1) {
      this.longPressTimer = setTimeout(() => {
        const touch = this.activeTouches.get(id);
        if (touch) {
          this.emit({
            type: 'longPress',
            position: { x: touch[0], y: touch[1] },
            timestamp: Date.now(),
          });
        }
      }, this.config.longPressMinDuration);
    }

    // Pinch start
    if (this.activeTouches.size === 2) {
      this.cancelLongPress();
      const points = [...this.activeTouches.values()];
      this.initialPinchDistance = this.distance(points[0], points[1]);
    }
  }

  touchMove(id: number, x: number, y: number): void {
    const touch = this.activeTouches.get(id);
    if (!touch) return;

    const dx = x - touch[0];
    const dy = y - touch[1];

    // Cancel long press if moved too far
    if (Math.sqrt(dx * dx + dy * dy) > this.config.tapMaxDistance) {
      this.cancelLongPress();
    }

    // Pan detection (single finger)
    if (this.activeTouches.size === 1) {
      this.emit({
        type: 'pan',
        position: { x, y },
        timestamp: Date.now(),
        deltaX: x - touch[0],
        deltaY: y - touch[1],
      });
    }

    // Pinch detection (two fingers)
    if (this.activeTouches.size === 2) {
      // Update this touch position temporarily
      const oldX = touch[0],
        oldY = touch[1];
      touch[0] = x;
      touch[1] = y;
      const points = [...this.activeTouches.values()];
      const currentDist = this.distance(points[0], points[1]);

      if (this.initialPinchDistance > 0) {
        const scale = currentDist / this.initialPinchDistance;
        if (Math.abs(scale - 1) >= this.config.pinchMinScale) {
          this.emit({
            type: 'pinch',
            position: {
              x: (points[0].x + points[1].x) / 2,
              y: (points[0].y + points[1].y) / 2,
            },
            timestamp: Date.now(),
            scale,
          });
        }
      }
      // Restore for proper end detection
      touch[0] = oldX;
      touch[1] = oldY;
    }

    // Update stored position
    touch[0] = x;
    touch[1] = y;
  }

  touchEnd(id: number, x: number, y: number): void {
    const touch = this.activeTouches.get(id);
    const startTouch = this.touchStarts.get(id);
    if (!touch || !startTouch) return;

    this.cancelLongPress();
    const now = Date.now();
    const duration = Math.max(1, now - startTouch.timestamp); // min 1ms
    const totalDx = x - startTouch[0];
    const totalDy = y - startTouch[1];
    const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

    this.activeTouches.delete(id);
    this.touchStarts.delete(id);

    // Swipe detection (using total distance from start)
    if (totalDist >= this.config.swipeMinDistance) {
      const velocity = totalDist / duration;
      if (velocity >= this.config.swipeMinVelocity) {
        this.emit({
          type: 'swipe',
          position: { x, y },
          timestamp: now,
          direction: this.getSwipeDirection(totalDx, totalDy),
          velocity,
          distance: totalDist,
        });
        return;
      }
    }

    // Tap detection
    if (duration <= this.config.tapMaxDuration && totalDist <= this.config.tapMaxDistance) {
      // Double tap check
      const timeSinceLastTap = now - this.lastTapTime;
      const distFromLastTap = Math.sqrt(
        (x - this.lastTapPosition[0]) ** 2 + (y - this.lastTapPosition[1]) ** 2
      );

      if (
        timeSinceLastTap <= this.config.doubleTapWindow &&
        distFromLastTap <= this.config.tapMaxDistance * 2
      ) {
        this.emit({ type: 'doubleTap', position: { x, y }, timestamp: now });
        this.lastTapTime = 0;
      } else {
        this.emit({ type: 'tap', position: { x, y }, timestamp: now });
        this.lastTapTime = now;
        this.lastTapPosition = { x, y };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private emit(event: GestureEvent): void {
    this.gestureHistory.push(event);
    if (this.gestureHistory.length > 100) this.gestureHistory.shift();

    for (const sub of this.subscribers.values()) {
      if (sub.types.includes(event.type) || sub.types.includes('custom')) {
        sub.callback(event);
      }
    }
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private getSwipeDirection(dx: number, dy: number): SwipeDirection {
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    }
    return dy > 0 ? 'down' : 'up';
  }

  private distance(a: TouchPoint, b: TouchPoint): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getActiveTouchCount(): number {
    return this.activeTouches.size;
  }
  getGestureHistory(): GestureEvent[] {
    return [...this.gestureHistory];
  }
  getRecentGestures(count: number): GestureEvent[] {
    return this.gestureHistory.slice(-count);
  }

  clearHistory(): void {
    this.gestureHistory = [];
  }
  getConfig(): GestureConfig {
    return { ...this.config };
  }
  setConfig(config: Partial<GestureConfig>): void {
    Object.assign(this.config, config);
  }
}
