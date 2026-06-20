'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const R3FLiquidBlobBackground = dynamic(() => import('./R3FLiquidBlobBackground'), {
  ssr: false,
  loading: () => null,
});

// Pink "liquid blob" page background with a client-only R3F liquid layer.
//
// This is the @slot island mounted by the .holo composition. The CSS glow stays
// as the no-WebGL/reduced-motion fallback while the R3F layer supplies the richer
// MeshDistortMaterial liquid mesh when the browser can mount WebGL.
export function LiquidBlobBackground() {
  const [webglReady, setWebglReady] = React.useState(false);

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      data-webgl-ready={webglReady ? 'true' : 'false'}
    >
      <div className="lb-fallback">
        <div className="lb-blob lb-blob-a" />
        <div className="lb-blob lb-blob-b" />
        <div className="lb-blob lb-blob-c" />
      </div>
      <div className="r3f-liquid-blob">
        <R3FLiquidBlobBackground onReady={() => setWebglReady(true)} />
      </div>
      {/* Readability scrim so foreground text stays legible over the glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/30 via-[#050505]/45 to-[#050505]/70" />
      <style>{`
        .lb-fallback,
        .r3f-liquid-blob {
          position: absolute;
          inset: 0;
        }
        .lb-fallback {
          opacity: 1;
          transition: opacity 600ms ease;
        }
        .r3f-liquid-blob {
          opacity: 0;
          transition: opacity 900ms ease;
        }
        [data-webgl-ready="true"] .lb-fallback {
          opacity: 0.42;
        }
        [data-webgl-ready="true"] .r3f-liquid-blob {
          opacity: 0.95;
        }
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
          .r3f-liquid-blob { display: none; }
          [data-webgl-ready="true"] .lb-fallback { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
