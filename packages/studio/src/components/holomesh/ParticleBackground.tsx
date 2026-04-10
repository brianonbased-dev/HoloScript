'use client';

import { useEffect, useRef } from 'react';
import type { ParticlePreset } from './types';

interface ParticleBackgroundProps {
  preset: ParticlePreset;
  color?: string;
}

export function ParticleBackground({ preset, color = '#6366f1' }: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (preset === 'none' || preset === 'stars' || preset === 'snow') return;
    // Matrix rain uses Canvas2D
    if (preset !== 'matrix') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(1);

    let animId: number;
    function draw() {
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = color + '80';
      ctx!.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx!.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas!.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => cancelAnimationFrame(animId);
  }, [preset, color]);

  if (preset === 'none') return null;

  // CSS-based particles for stars, snow, fireflies, bubbles
  if (preset === 'stars') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {Array.from({ length: 80 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: i % 3 === 0 ? color : '#ffffff',
              opacity: Math.random() * 0.7 + 0.3,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${Math.random() * 3 + 2}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (preset === 'snow') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <style>{`
          @keyframes snowfall {
            0% { transform: translateY(-10vh) translateX(0); opacity: 1; }
            100% { transform: translateY(110vh) translateX(20px); opacity: 0.3; }
          }
        `}</style>
        {Array.from({ length: 40 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/60"
            style={{
              width: Math.random() * 4 + 2,
              height: Math.random() * 4 + 2,
              left: `${Math.random() * 100}%`,
              animation: `snowfall ${Math.random() * 5 + 5}s linear infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (preset === 'fireflies') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <style>{`
          @keyframes firefly {
            0%, 100% { transform: translate(0, 0); opacity: 0.2; }
            25% { transform: translate(30px, -20px); opacity: 1; }
            50% { transform: translate(-20px, -40px); opacity: 0.6; }
            75% { transform: translate(15px, 10px); opacity: 0.9; }
          }
        `}</style>
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 6 + 3,
              height: Math.random() * 6 + 3,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: color,
              boxShadow: `0 0 ${Math.random() * 10 + 5}px ${color}`,
              animation: `firefly ${Math.random() * 4 + 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (preset === 'bubbles') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <style>{`
          @keyframes bubble {
            0% { transform: translateY(100vh) scale(0.5); opacity: 0; }
            10% { opacity: 0.6; }
            100% { transform: translateY(-10vh) scale(1.2); opacity: 0; }
          }
        `}</style>
        {Array.from({ length: 15 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full border"
            style={{
              width: Math.random() * 30 + 10,
              height: Math.random() * 30 + 10,
              left: `${Math.random() * 100}%`,
              borderColor: color + '40',
              animation: `bubble ${Math.random() * 6 + 6}s ease-in infinite`,
              animationDelay: `${Math.random() * 6}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // Matrix rain
  if (preset === 'matrix') {
    return (
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-0"
        style={{ opacity: 0.15 }}
      />
    );
  }

  return null;
}
