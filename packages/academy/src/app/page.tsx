'use client';

/**
 * HoloScript Studio — Universal Point of Entry
 *
 * Native HoloScript-driven landing page. The hero section (title, tagline,
 * stats strip) is defined in compositions/studio/home.hsplus and rendered
 * by HoloSurfaceRenderer. Mode cards, industry chips, and footer stay in React.
 *
 * @module page
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';

// ── Mode Data ────────────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'play',
    title: 'Play',
    subtitle: 'Ages 5-12',
    description: 'Drag, drop & build colorful 3D worlds with big buttons and fun sounds',
    emoji: '🎨',
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
    glowColor: 'rgba(251, 146, 60, 0.4)',
    borderColor: 'rgba(251, 146, 60, 0.3)',
    href: '/play',
  },
  {
    id: 'learn',
    title: 'Learn',
    subtitle: 'Ages 13-22',
    description: 'Step-by-step scenarios, visual + code view, achievement badges',
    emoji: '🎓',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    glowColor: 'rgba(20, 184, 166, 0.4)',
    borderColor: 'rgba(20, 184, 166, 0.3)',
    href: '/learn',
  },
] as const;

// ── Industry Portal Data Removed ──────────────────────────────────────────────
// ── Animated Mesh Background ─────────────────────────────────────────────────

function MeshBackground() {
  return (
    <div className="mesh-bg" aria-hidden="true">
      <div className="mesh-orb mesh-orb-1" />
      <div className="mesh-orb mesh-orb-2" />
      <div className="mesh-orb mesh-orb-3" />
      <div className="mesh-grid" />
    </div>
  );
}

// ── Mode Card ────────────────────────────────────────────────────────────────

function ModeCard({ mode, index }: { mode: (typeof MODES)[number]; index: number }) {
  return (
    <Link
      href={mode.href}
      className="mode-card focus-ring"
      style={
        {
          '--card-glow': mode.glowColor,
          '--card-border': mode.borderColor,
          animationDelay: `${index * 100 + 200}ms`,
        } as React.CSSProperties
      }
    >
      <div className="mode-card-inner">
        <div className={`mode-emoji bg-gradient-to-br ${mode.gradient}`}>
          <span>{mode.emoji}</span>
        </div>
        <h3 className="mode-title">{mode.title}</h3>
        <span className="mode-subtitle">{mode.subtitle}</span>
        <p className="mode-description">{mode.description}</p>
        <div className="mode-arrow">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 10h12m0 0l-4-4m4 4l-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

// ── Industry Chip Removed ───────────────────────────────────────────────────// ── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [loaded, setLoaded] = useState(false);
  const composition = useHoloComposition('/api/surface/home');

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className={`home-root ${loaded ? 'home-loaded' : ''}`}>
      <MeshBackground />

      {/* ── Hero (native composition) ─────────────────────────────────── */}
      <section className="hero">
        {!composition.loading && !composition.error ? (
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={composition.emit}
            className="holo-surface-hero"
          />
        ) : (
          <>
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Open Platform for Spatial Computing
            </div>
            <h1 className="hero-title">
              <span className="hero-word hero-word-1">HoloScript</span>{' '}
              <span className="hero-word hero-word-2">Academy</span>
            </h1>
            <p className="hero-tagline">Learn Spatial Computing — No Code Required</p>
          </>
        )}
      </section>

      {/* ── Mode Cards ────────────────────────────────────────────────── */}
      <section className="modes">
        <h2 className="section-label">Choose Your Experience</h2>
        <div className="modes-grid">
          {MODES.map((mode, i) => (
            <ModeCard key={mode.id} mode={mode} index={i} />
          ))}
        </div>
      </section>

      {/* ── Removed Industry Portals ────────────────────────────────────────── */}
      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="home-footer">
        <span>HoloScript Academy</span>
        <span className="footer-sep">·</span>
        <Link href="/playground" className="footer-link">
          Playground
        </Link>
        <span className="footer-sep">·</span>
        <span className="footer-hint">
          Press <kbd>?</kbd> for help
        </span>
      </footer>
    </main>
  );
}
