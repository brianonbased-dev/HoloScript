'use client';

/**
 * TouchJoystick — on-screen virtual joystick for mobile (founder requirement:
 * controllers AND touch screens). Left half = move (joystick), right half drag =
 * look. Writes into the shared `window.__lotusMove` MoveState that
 * DesktopTouchControls reads inside useFrame. DOM overlay so it works without any
 * extra dependency.
 */
import { useEffect, useRef, useState } from 'react';
import type { MoveState } from './locomotion';

export function TouchJoystick() {
  const [active, setActive] = useState(false);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const moveTouchId = useRef<number | null>(null);
  const lookTouchId = useRef<number | null>(null);
  const lookLast = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const getMove = (): MoveState | undefined =>
      (window as unknown as { __lotusMove?: MoveState }).__lotusMove;

    const onStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const onLeft = t.clientX < window.innerWidth / 2;
        if (onLeft && moveTouchId.current === null) {
          moveTouchId.current = t.identifier;
          setActive(true);
        } else if (!onLeft && lookTouchId.current === null) {
          lookTouchId.current = t.identifier;
          lookLast.current = { x: t.clientX, y: t.clientY };
        }
      }
    };

    const onMove = (e: TouchEvent) => {
      const m = getMove();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveTouchId.current && baseRef.current) {
          const rect = baseRef.current.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          let dx = (t.clientX - cx) / (rect.width / 2);
          let dy = (t.clientY - cy) / (rect.height / 2);
          const mag = Math.hypot(dx, dy);
          if (mag > 1) {
            dx /= mag;
            dy /= mag;
          }
          setKnob({ x: dx * 32, y: dy * 32 });
          if (m) {
            m.moveX = dx;
            m.moveZ = dy; // forward = up on stick = -Z handled in controls (moveZ sign)
          }
        } else if (t.identifier === lookTouchId.current && lookLast.current) {
          if (m) {
            m.lookYaw -= (t.clientX - lookLast.current.x) * 0.004;
            m.lookPitch -= (t.clientY - lookLast.current.y) * 0.004;
          }
          lookLast.current = { x: t.clientX, y: t.clientY };
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      const m = getMove();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveTouchId.current) {
          moveTouchId.current = null;
          setActive(false);
          setKnob({ x: 0, y: 0 });
          if (m) {
            m.moveX = 0;
            m.moveZ = 0;
          }
        } else if (t.identifier === lookTouchId.current) {
          lookTouchId.current = null;
          lookLast.current = null;
        }
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <>
      {/* Joystick base (bottom-left). Visible on touch devices; harmless on desktop. */}
      <div
        ref={baseRef}
        className="pointer-events-none absolute bottom-6 left-6 z-20 h-24 w-24 rounded-full border border-white/25 bg-white/5 backdrop-blur"
        style={{ touchAction: 'none' }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-white/30"
          style={{
            transform: `translate(-50%,-50%) translate(${knob.x}px, ${knob.y}px)`,
            opacity: active ? 1 : 0.55,
          }}
        />
      </div>
      <div className="pointer-events-none absolute bottom-7 right-6 z-20 text-[10px] text-gray-400">
        drag right half to look
      </div>
    </>
  );
}
