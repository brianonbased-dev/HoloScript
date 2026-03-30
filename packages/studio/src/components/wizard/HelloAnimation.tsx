'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * HelloAnimation -- Apple-style "hello" text animation.
 *
 * Renders "hello" in a thin elegant font using SVG, animates the stroke
 * via stroke-dashoffset over 2 seconds, holds for 0.5s, then fades out
 * and calls onComplete.
 */

interface HelloAnimationProps {
  /** Called when the animation finishes and the text has faded */
  onComplete: () => void;
}

export function HelloAnimation({ onComplete }: HelloAnimationProps) {
  const [phase, setPhase] = useState<'drawing' | 'holding' | 'fading' | 'done'>('drawing');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Phase 1: Drawing the stroke (2s)
    timerRef.current = setTimeout(() => {
      setPhase('holding');
    }, 2000);

    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (phase === 'holding') {
      // Phase 2: Hold for 0.5s
      timerRef.current = setTimeout(() => {
        setPhase('fading');
      }, 500);
    } else if (phase === 'fading') {
      // Phase 3: Fade out over 0.6s, then complete
      timerRef.current = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 600);
    }

    return () => clearTimeout(timerRef.current);
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-gray-950 transition-opacity duration-[600ms] ease-out ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="relative flex flex-col items-center">
        {/* SVG "hello" text with stroke animation */}
        <svg
          viewBox="0 0 400 120"
          className="w-[clamp(280px,50vw,500px)] h-auto"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <text
            x="50%"
            y="50%"
            dominantBaseline="central"
            textAnchor="middle"
            className="hello-text-stroke"
            style={{
              fontSize: '90px',
              fontFamily: "'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontWeight: 200,
              letterSpacing: '-2px',
            }}
          >
            hello
          </text>
        </svg>

        {/* Subtitle — fades in after stroke completes */}
        <p
          className={`mt-4 text-sm tracking-[0.3em] uppercase transition-all duration-700 ease-out ${
            phase === 'drawing' ? 'opacity-0 translate-y-2' : 'opacity-60 translate-y-0'
          }`}
          style={{ color: '#6b7280' }}
        >
          Welcome to HoloScript
        </p>
      </div>

      {/* Inline styles for the stroke animation */}
      <style>{`
        .hello-text-stroke {
          stroke: #3b82f6;
          stroke-width: 1.5;
          fill: none;
          stroke-dasharray: 800;
          stroke-dashoffset: 800;
          animation: drawHello 2s ease-out forwards;
        }

        @keyframes drawHello {
          0% {
            stroke-dashoffset: 800;
            fill: transparent;
          }
          70% {
            stroke-dashoffset: 0;
            fill: transparent;
          }
          100% {
            stroke-dashoffset: 0;
            fill: #3b82f6;
          }
        }
      `}</style>
    </div>
  );
}
