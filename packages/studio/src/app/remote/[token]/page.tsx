'use client';

/**
 * /remote/[token] — mobile touch controller page.
 *
 * Phone opens this URL (from QR code) and gets a virtual joystick + controls.
 * Commands are PUT to /api/remote?t=<token> as orbit/zoom/pan/reset/select.
 *
 * Uses pointer events for cross-device (touchscreen + mouse) support.
 */

import { use, useState, useRef, useCallback, useEffect } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Hand, Target } from 'lucide-react';
import { logger } from '@/lib/logger';

interface RemotePageProps {
  params: Promise<{ token: string }>;
}

interface Touch {
  x: number;
  y: number;
}

async function sendCommand(
  token: string,
  cmd: { type: string; dx?: number; dy?: number; delta?: number }
) {
  return fetch(`/api/remote?t=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  }).catch((err) => logger.warn('Swallowed error caught:', err));
}

function Joystick({ token }: { token: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<Touch>({ x: 0, y: 0 });
  const activeRef = useRef<{ id: number; origin: Touch } | null>(null);
  const sendRef = useRef<NodeJS.Timeout | null>(null);
  const knobRef = useRef<Touch>({ x: 0, y: 0 });
  const RADIUS = 60;

  const updateKnob = useCallback((x: number, y: number) => {
    const dist = Math.sqrt(x * x + y * y);
    const clamped = dist > RADIUS ? { x: (x / dist) * RADIUS, y: (y / dist) * RADIUS } : { x, y };
    knobRef.current = clamped;
    setKnob(clamped);
  }, []);

  const startLoop = useCallback(() => {
    if (sendRef.current) return;
    sendRef.current = setInterval(() => {
      const { x, y } = knobRef.current;
      if (Math.abs(x) > 2 || Math.abs(y) > 2) {
        sendCommand(token, { type: 'orbit', dx: x / RADIUS, dy: y / RADIUS });
      }
    }, 100);
  }, [token]);

  const stopLoop = useCallback(() => {
    if (sendRef.current) {
      clearInterval(sendRef.current);
      sendRef.current = null;
    }
    setKnob({ x: 0, y: 0 });
    knobRef.current = { x: 0, y: 0 };
    activeRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = outerRef.current!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      activeRef.current = { id: e.pointerId, origin: { x: cx, y: cy } };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startLoop();
    },
    [startLoop]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!activeRef.current || e.pointerId !== activeRef.current.id) return;
      const { origin } = activeRef.current;
      updateKnob(e.clientX - origin.x, e.clientY - origin.y);
    },
    [updateKnob]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activeRef.current?.id === e.pointerId) stopLoop();
    },
    [stopLoop]
  );

  useEffect(
    () => () => {
      if (sendRef.current) clearInterval(sendRef.current);
    },
    []
  );

  return (
    <div
      ref={outerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={stopLoop}
      className="relative h-36 w-36 touch-none select-none rounded-full border-2 border-violet-500/30 bg-white/5"
    >
      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/20 pointer-events-none">
        ORBIT
      </div>
      <div
        className="absolute h-14 w-14 rounded-full bg-violet-500/60 shadow-lg shadow-violet-500/20 border border-violet-400/40 transition-transform pointer-events-none"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
        }}
      />
    </div>
  );
}

export default function RemotePage({ params }: RemotePageProps) {
  const { token } = use(params);
  const [connected, setConnected] = useState(false);
  const [cmdCount, setCmdCount] = useState(0);

  // Verify token is valid
  useEffect(() => {
    fetch(`/api/remote?t=${token}`).then((r) => {
      setConnected(r.ok);
    });
  }, [token]);

  const doCmd = useCallback(
    (type: string, extra?: object) => {
      sendCommand(token, { type, ...extra });
      setCmdCount((c) => c + 1);
    },
    [token]
  );

  if (!connected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a12] text-white">
        <div className="text-center space-y-2">
          <p className="text-white/50 text-sm">Connecting to session…</p>
          <p className="text-white/20 text-xs font-mono">{token}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[#0a0a12] pb-safe text-white">
      {/* Header */}
      <div className="w-full border-b border-white/10 px-4 py-3 text-center">
        <p className="text-[11px] text-white/40 font-mono">{token.slice(0, 8)}…</p>
        <p className="text-xs text-white/30">cmds sent: {cmdCount}</p>
      </div>

      {/* Main joystick */}
      <div className="flex flex-col items-center gap-8 py-8">
        <Joystick token={token} />

        {/* Zoom row */}
        <div className="flex gap-6">
          <button
            onPointerDown={() => doCmd('zoom', { delta: -0.1 })}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/8 active:bg-violet-500/30 transition"
          >
            <ZoomOut className="h-6 w-6 text-white/70" />
          </button>
          <button
            onPointerDown={() => doCmd('reset')}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600/30 active:bg-violet-500/60 transition border border-violet-500/30"
          >
            <RotateCcw className="h-5 w-5 text-violet-300" />
          </button>
          <button
            onPointerDown={() => doCmd('zoom', { delta: 0.1 })}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/8 active:bg-violet-500/30 transition"
          >
            <ZoomIn className="h-6 w-6 text-white/70" />
          </button>
        </div>

        {/* Pan + Select */}
        <div className="flex gap-4">
          <button
            onPointerDown={() => doCmd('pan', { dx: 0, dy: 0.1 })}
            className="flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 text-sm active:bg-violet-500/20 transition"
          >
            <Hand className="h-4 w-4" /> Pan
          </button>
          <button
            onPointerDown={() => doCmd('select')}
            className="flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 text-sm active:bg-violet-500/20 transition"
          >
            <Target className="h-4 w-4" /> Select
          </button>
        </div>
      </div>

      <div className="pb-4 text-[10px] text-white/20">
        HoloScript Remote · drag joystick to orbit
      </div>
    </div>
  );
}
