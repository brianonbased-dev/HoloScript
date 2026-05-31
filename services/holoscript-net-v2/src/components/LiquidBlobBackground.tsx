'use client';

import React from 'react';

// Pink "liquid blob" page background.
//
// This is the @slot island mounted by the .holo composition (a 3D/animated
// background can't be authored in 2D Native traits, so it's a React island —
// exactly what @slot is for). It's a pure-CSS animated glow: several large,
// heavily-blurred magenta/fuchsia radial blobs that drift and breathe, over the
// near-black base. No WebGL — so it renders reliably on every device/browser,
// including SSR/static prerender, with no canvas-sizing or GPU dependency.
//
// A richer R3F MeshDistortMaterial "liquid" version is tracked as a Gate-2
// enhancement (the @react-three/fiber Canvas does not render in this fixed,
// statically-prerendered Next 16 context — its scene never commits).
export function LiquidBlobBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="lb-blob lb-blob-a" />
      <div className="lb-blob lb-blob-b" />
      <div className="lb-blob lb-blob-c" />
      {/* Readability scrim so foreground text stays legible over the glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/30 via-[#050505]/45 to-[#050505]/70" />
      <style>{`
        .lb-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(90px);
          opacity: 0.55;
          will-change: transform;
          mix-blend-mode: screen;
        }
        .lb-blob-a {
          width: 60vw; height: 60vw;
          top: -8vw; left: 50%;
          background: radial-gradient(circle at 50% 50%, #ff2ad6 0%, #c026d3 45%, rgba(192,38,211,0) 70%);
          animation: lb-drift-a 18s ease-in-out infinite;
        }
        .lb-blob-b {
          width: 46vw; height: 46vw;
          top: 6vw; left: 20%;
          background: radial-gradient(circle at 50% 50%, #d100ff 0%, #7c3aed 50%, rgba(124,58,237,0) 72%);
          animation: lb-drift-b 24s ease-in-out infinite;
        }
        .lb-blob-c {
          width: 38vw; height: 38vw;
          top: 2vw; left: 70%;
          background: radial-gradient(circle at 50% 50%, #00e0ff 0%, #2563eb 55%, rgba(37,99,235,0) 74%);
          opacity: 0.4;
          animation: lb-drift-c 21s ease-in-out infinite;
        }
        @keyframes lb-drift-a {
          0%,100% { transform: translate(-50%, 0) scale(1); }
          50%     { transform: translate(-46%, 4vw) scale(1.12); }
        }
        @keyframes lb-drift-b {
          0%,100% { transform: translate(0, 0) scale(1); }
          50%     { transform: translate(6vw, -3vw) scale(0.92); }
        }
        @keyframes lb-drift-c {
          0%,100% { transform: translate(0, 0) scale(1); }
          50%     { transform: translate(-5vw, 5vw) scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lb-blob { animation: none; }
        }
      `}</style>
    </div>
  );
}
