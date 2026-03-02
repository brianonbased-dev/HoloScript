/**
 * useTouchGestures - React hook for touch gesture recognition
 *
 * Provides swipe, pinch-to-zoom, long-press, and double-tap gesture detection
 * for tablet interaction with Studio panels and toolbars.
 *
 * All gesture thresholds follow platform conventions:
 * - Swipe: 50px minimum distance, directional tolerance of 30 degrees
 * - Pinch: scale delta threshold of 0.1
 * - Long press: 500ms hold without movement
 * - Double tap: 300ms between taps, 30px proximity
 *
 * Touch targets follow WCAG 2.1 Success Criterion 2.5.5:
 * minimum 44x44 CSS pixels for all interactive elements.
 *
 * @module @holoscript/studio-plugin-sdk/responsive
 */

import { useEffect, useRef, useCallback } from 'react';
import type {
  TouchGestureType,
  TouchGestureAction,
  TouchGestureEvent,
} from '../types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseTouchGesturesOptions {
  /** Target element ref */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Gesture actions to recognize */
  gestures: TouchGestureAction[];
  /** Whether gesture recognition is enabled (default: true) */
  enabled?: boolean;
  /** Prevent default touch behavior during gestures (default: true) */
  preventDefault?: boolean;
  /** Stop propagation of touch events during gestures (default: false) */
  stopPropagation?: boolean;
}

export interface TouchGestureState {
  /** Whether a gesture is currently in progress */
  isGesturing: boolean;
  /** The currently active gesture type (if any) */
  activeGesture: TouchGestureType | null;
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SWIPE_THRESHOLD = 50;    // pixels
const DEFAULT_LONG_PRESS_DURATION = 500; // ms
const DOUBLE_TAP_INTERVAL = 300;       // ms
const DOUBLE_TAP_DISTANCE = 30;        // pixels
const LONG_PRESS_MOVE_TOLERANCE = 10;  // pixels
const SWIPE_ANGLE_TOLERANCE = 30;      // degrees

// ── Helper: Calculate Distance ───────────────────────────────────────────────

function distance(p1: TouchPoint, p2: TouchPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Helper: Calculate Angle ──────────────────────────────────────────────────

function angle(p1: TouchPoint, p2: TouchPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

// ── Helper: Determine Swipe Direction ────────────────────────────────────────

function getSwipeDirection(deg: number): TouchGestureType | null {
  const absDeg = Math.abs(deg);

  if (absDeg <= SWIPE_ANGLE_TOLERANCE) return 'swipe-right';
  if (absDeg >= 180 - SWIPE_ANGLE_TOLERANCE) return 'swipe-left';
  if (deg >= 90 - SWIPE_ANGLE_TOLERANCE && deg <= 90 + SWIPE_ANGLE_TOLERANCE) return 'swipe-down';
  if (deg >= -(90 + SWIPE_ANGLE_TOLERANCE) && deg <= -(90 - SWIPE_ANGLE_TOLERANCE)) return 'swipe-up';

  return null;
}

// ── Helper: Calculate Pinch Scale ────────────────────────────────────────────

function getPinchScale(
  startTouches: [TouchPoint, TouchPoint],
  currentTouches: [TouchPoint, TouchPoint],
): number {
  const startDistance = distance(startTouches[0], startTouches[1]);
  const currentDistance = distance(currentTouches[0], currentTouches[1]);

  if (startDistance === 0) return 1;
  return currentDistance / startDistance;
}

// ── Helper: Create Gesture Event ─────────────────────────────────────────────

function createGestureEvent(
  type: TouchGestureType,
  start: TouchPoint,
  end: TouchPoint,
  originalEvent: TouchEvent,
  scale?: number,
): TouchGestureEvent {
  const dist = distance(start, end);
  const dur = end.timestamp - start.timestamp;

  return {
    type,
    startPosition: { x: start.x, y: start.y },
    endPosition: { x: end.x, y: end.y },
    distance: dist,
    angle: angle(start, end),
    velocity: dur > 0 ? dist / dur : 0,
    scale,
    duration: dur,
    originalEvent,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTouchGestures(options: UseTouchGesturesOptions): TouchGestureState {
  const {
    targetRef,
    gestures,
    enabled = true,
    preventDefault = true,
    stopPropagation = false,
  } = options;

  const stateRef = useRef<TouchGestureState>({
    isGesturing: false,
    activeGesture: null,
  });

  const touchStartRef = useRef<TouchPoint | null>(null);
  const touchStartTouchesRef = useRef<[TouchPoint, TouchPoint] | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ point: TouchPoint; timestamp: number } | null>(null);
  const isMultiTouchRef = useRef(false);

  // Find gesture action by type
  const findGesture = useCallback(
    (type: TouchGestureType): TouchGestureAction | undefined => {
      return gestures.find((g) => g.gesture === type);
    },
    [gestures],
  );

  // Execute a gesture action
  const executeGesture = useCallback(
    (gestureAction: TouchGestureAction, event: TouchGestureEvent) => {
      if (gestureAction.action === 'custom' && gestureAction.handler) {
        gestureAction.handler(event);
      }
      // Built-in actions (toggle, dismiss, expand, collapse) are handled
      // by the consuming component (ResponsivePanel / ResponsiveToolbar).
      // This hook just fires the event; the component decides what to do.
    },
    [],
  );

  // Clear long press timer
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const element = targetRef.current;
    if (!element || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (stopPropagation) e.stopPropagation();

      const touch = e.touches[0];
      const now = Date.now();

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: now,
      };

      // Multi-touch (pinch) detection
      if (e.touches.length === 2) {
        isMultiTouchRef.current = true;
        touchStartTouchesRef.current = [
          { x: e.touches[0].clientX, y: e.touches[0].clientY, timestamp: now },
          { x: e.touches[1].clientX, y: e.touches[1].clientY, timestamp: now },
        ];
        clearLongPress();
        return;
      }

      isMultiTouchRef.current = false;

      // Double-tap detection
      const doubleTapGesture = findGesture('double-tap');
      if (doubleTapGesture && lastTapRef.current) {
        const timeDelta = now - lastTapRef.current.timestamp;
        const dist = distance(lastTapRef.current.point, touchStartRef.current);

        if (timeDelta < DOUBLE_TAP_INTERVAL && dist < DOUBLE_TAP_DISTANCE) {
          if (preventDefault) e.preventDefault();

          const event = createGestureEvent(
            'double-tap',
            lastTapRef.current.point,
            touchStartRef.current,
            e,
          );
          executeGesture(doubleTapGesture, event);
          lastTapRef.current = null;
          return;
        }
      }

      // Long-press detection
      const longPressGesture = findGesture('long-press');
      if (longPressGesture) {
        const duration = longPressGesture.duration ?? DEFAULT_LONG_PRESS_DURATION;
        longPressTimerRef.current = setTimeout(() => {
          if (touchStartRef.current) {
            stateRef.current = { isGesturing: true, activeGesture: 'long-press' };

            const event = createGestureEvent(
              'long-press',
              touchStartRef.current,
              touchStartRef.current,
              e,
            );
            executeGesture(longPressGesture, event);

            stateRef.current = { isGesturing: false, activeGesture: null };
          }
        }, duration);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (stopPropagation) e.stopPropagation();

      // Cancel long press if finger moves too much
      if (touchStartRef.current && longPressTimerRef.current) {
        const touch = e.touches[0];
        const moved = distance(touchStartRef.current, {
          x: touch.clientX,
          y: touch.clientY,
          timestamp: Date.now(),
        });

        if (moved > LONG_PRESS_MOVE_TOLERANCE) {
          clearLongPress();
        }
      }

      // Pinch gesture tracking
      if (isMultiTouchRef.current && e.touches.length === 2 && touchStartTouchesRef.current) {
        const currentTouches: [TouchPoint, TouchPoint] = [
          { x: e.touches[0].clientX, y: e.touches[0].clientY, timestamp: Date.now() },
          { x: e.touches[1].clientX, y: e.touches[1].clientY, timestamp: Date.now() },
        ];

        const scale = getPinchScale(touchStartTouchesRef.current, currentTouches);
        const gestureType: TouchGestureType = scale < 1 ? 'pinch-in' : 'pinch-out';
        const gesture = findGesture(gestureType);

        if (gesture && Math.abs(scale - 1) > 0.1) {
          if (preventDefault) e.preventDefault();
          stateRef.current = { isGesturing: true, activeGesture: gestureType };
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (stopPropagation) e.stopPropagation();
      clearLongPress();

      const now = Date.now();

      // Handle pinch end
      if (isMultiTouchRef.current && touchStartTouchesRef.current && e.changedTouches.length > 0) {
        // Use the last known positions for pinch calculation
        const changedTouch = e.changedTouches[0];
        const endPoint: TouchPoint = {
          x: changedTouch.clientX,
          y: changedTouch.clientY,
          timestamp: now,
        };

        // Approximate final scale from remaining touch data
        if (touchStartRef.current) {
          const startDist = distance(touchStartTouchesRef.current[0], touchStartTouchesRef.current[1]);
          // We can only approximate here since one finger has lifted
          const scale = startDist > 0 ? distance(touchStartRef.current, endPoint) / startDist : 1;
          const gestureType: TouchGestureType = scale < 1 ? 'pinch-in' : 'pinch-out';
          const gesture = findGesture(gestureType);

          if (gesture && Math.abs(scale - 1) > 0.1) {
            const event = createGestureEvent(
              gestureType,
              touchStartTouchesRef.current[0],
              endPoint,
              e,
              scale,
            );
            executeGesture(gesture, event);
          }
        }

        isMultiTouchRef.current = false;
        touchStartTouchesRef.current = null;
        stateRef.current = { isGesturing: false, activeGesture: null };
        return;
      }

      // Handle swipe end
      if (touchStartRef.current && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const endPoint: TouchPoint = {
          x: touch.clientX,
          y: touch.clientY,
          timestamp: now,
        };

        const dist = distance(touchStartRef.current, endPoint);
        const swipeThreshold = gestures
          .filter((g) => g.gesture.startsWith('swipe-'))
          .reduce((min, g) => Math.min(min, g.threshold ?? DEFAULT_SWIPE_THRESHOLD), DEFAULT_SWIPE_THRESHOLD);

        if (dist >= swipeThreshold) {
          const deg = angle(touchStartRef.current, endPoint);
          const direction = getSwipeDirection(deg);

          if (direction) {
            const gesture = findGesture(direction);
            if (gesture) {
              if (preventDefault) e.preventDefault();

              const event = createGestureEvent(
                direction,
                touchStartRef.current,
                endPoint,
                e,
              );
              executeGesture(gesture, event);
            }
          }
        } else {
          // Short tap - record for double-tap detection
          lastTapRef.current = {
            point: endPoint,
            timestamp: now,
          };
        }
      }

      touchStartRef.current = null;
      stateRef.current = { isGesturing: false, activeGesture: null };
    };

    const handleTouchCancel = () => {
      clearLongPress();
      touchStartRef.current = null;
      touchStartTouchesRef.current = null;
      isMultiTouchRef.current = false;
      stateRef.current = { isGesturing: false, activeGesture: null };
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: !preventDefault });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd, { passive: !preventDefault });
    element.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      clearLongPress();
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [
    targetRef,
    enabled,
    preventDefault,
    stopPropagation,
    gestures,
    findGesture,
    executeGesture,
    clearLongPress,
  ]);

  return stateRef.current;
}
