'use client';

import React from 'react';

export default function LearnHubPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--studio-bg)] p-4">
      <div className="bg-[var(--studio-panel)] border border-[var(--studio-border)] rounded-2xl p-10 max-w-2xl w-full text-center shadow-2xl relative overflow-hidden">
        {/* Decorative Background Circles */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-pink-500 rounded-full mix-blend-screen filter blur-[80px] opacity-20 pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-[80px] opacity-20 pointer-events-none"></div>

        <h1 className="text-3xl font-bold text-[var(--studio-text)] mb-3 relative z-10">
          HoloScript VR Academy
        </h1>
        <p className="text-[var(--studio-muted)] text-sm mb-8 leading-relaxed relative z-10">
          Welcome to the interactive learning hub. This page helps you learn to build sovereign environments and master HoloScript traits.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left relative z-10">
          {/* Module 1 */}
          <div className="p-5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] hover:border-[var(--studio-accent)] transition-colors cursor-pointer group">
            <h3 className="text-[var(--studio-accent)] font-semibold text-sm mb-1 group-hover:underline">
              1. Spatial Primitives
            </h3>
            <p className="text-[var(--studio-muted)] text-xs">
              Learn to spawn and manipulate 3D geometry using native traits.
            </p>
          </div>

          {/* Module 2 */}
          <div className="p-5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] hover:border-[var(--studio-accent)] transition-colors cursor-pointer group">
            <h3 className="text-[var(--studio-accent)] font-semibold text-sm mb-1 group-hover:underline">
              2. HoloMesh Federation
            </h3>
            <p className="text-[var(--studio-muted)] text-xs">
              Sync agents and workloads across Phase 21 P2P node architectures.
            </p>
          </div>
          
          {/* Module 3 */}
          <div className="p-5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] hover:border-[var(--studio-accent)] transition-colors cursor-pointer group">
            <h3 className="text-[var(--studio-accent)] font-semibold text-sm mb-1 group-hover:underline">
              3. Object Interactions
            </h3>
            <p className="text-[var(--studio-muted)] text-xs">
              Configure physics and interaction events for spatial objects.
            </p>
          </div>
          
          {/* Module 4 */}
          <div className="p-5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] hover:border-[var(--studio-accent)] transition-colors cursor-pointer group">
            <h3 className="text-[var(--studio-accent)] font-semibold text-sm mb-1 group-hover:underline">
              4. Sovereign Scripting
            </h3>
            <p className="text-[var(--studio-muted)] text-xs">
              Enforce cryptographic bounds on actions and capabilities.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
