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
    href: process.env.NEXT_PUBLIC_ACADEMY_URL ? `${process.env.NEXT_PUBLIC_ACADEMY_URL}/play` : 'http://localhost:3102/play',
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
    href: process.env.NEXT_PUBLIC_ACADEMY_URL ? `${process.env.NEXT_PUBLIC_ACADEMY_URL}/learn` : 'http://localhost:3102/learn',
  },
  {
    id: 'create',
    title: 'Create',
    subtitle: 'Ages 18+',
    description: 'Full IDE — 43 panels, real compilers, shader editor, AI tools',
    emoji: '🔨',
    gradient: 'from-blue-500 via-indigo-500 to-violet-500',
    glowColor: 'rgba(99, 102, 241, 0.4)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
    href: '/create',
  },
  {
    id: 'industry',
    title: 'Industry',
    subtitle: 'Professionals',
    description: 'Vertical-specific templates, workflows & export pipelines',
    emoji: '🏢',
    gradient: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    href: '/create?mode=industry',
  },
] as const;

// ── Industry Portal Data ─────────────────────────────────────────────────────

const INDUSTRIES = [
  { id: 'healthcare', emoji: '🏥', label: 'Healthcare', color: '#ef4444' },
  { id: 'architecture', emoji: '🏗️', label: 'Architecture', color: '#f59e0b' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming', color: '#22c55e' },
  { id: 'film', emoji: '🎬', label: 'Film & VFX', color: '#a855f7' },
  { id: 'manufacturing', emoji: '🏭', label: 'Manufacturing', color: '#64748b' },
  { id: 'agriculture', emoji: '🌾', label: 'Agriculture', color: '#84cc16' },
  { id: 'education', emoji: '🎓', label: 'Education', color: '#06b6d4' },
  { id: 'retail', emoji: '🛒', label: 'Retail', color: '#ec4899' },
  { id: 'automotive', emoji: '🚗', label: 'Automotive', color: '#3b82f6' },
] as const;

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
      href={mode.href.startsWith('http') ? mode.href : mode.href}
      className="mode-card focus-ring"
      style={
        {
          '--card-glow': mode.glowColor,
          '--card-border': mode.borderColor,
          animationDelay: `${index * 100 + 200}ms`,
        } as React.CSSProperties
      }
      {...(mode.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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

// ── Industry Chip ────────────────────────────────────────────────────────────

function IndustryChip({ industry }: { industry: (typeof INDUSTRIES)[number] }) {
  return (
    <Link
      href={`/create?industry=${industry.id}`}
      className="industry-chip focus-ring"
      style={{ '--chip-color': industry.color } as React.CSSProperties}
    >
      <span className="industry-emoji">{industry.emoji}</span>
      <span className="industry-label">{industry.label}</span>
    </Link>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

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
              <span className="hero-word hero-word-2">Studio</span>
            </h1>
            <p className="hero-tagline">Create anything in 3D — no code required</p>
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

      {/* ── Industry Portals ──────────────────────────────────────────── */}
      <section className="industries">
        <h2 className="section-label">Industry Portals</h2>
        <div className="industries-row">
          {INDUSTRIES.map((ind) => (
            <IndustryChip key={ind.id} industry={ind} />
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="home-footer">
        <span>HoloScript v3.22 · 17,740+ tests</span>
        <span className="footer-sep">·</span>
        <a href={process.env.NEXT_PUBLIC_ACADEMY_URL ? `${process.env.NEXT_PUBLIC_ACADEMY_URL}/playground` : 'http://localhost:3102/playground'} className="footer-link">
          Playground
        </a>
        <span className="footer-sep">·</span>
        <Link href="/workspace" className="footer-link">
          Workspace
        </Link>
        <span className="footer-sep">·</span>
        <Link href="/holodaemon" className="footer-link">
          HoloDaemon
        </Link>
        <span className="footer-sep">·</span>
        <Link href="/holoclaw" className="footer-link">
          HoloClaw
        </Link>
        <span className="footer-sep">·</span>
        <Link href="/pipeline" className="footer-link">
          Pipeline
        </Link>
        <span className="footer-sep">·</span>
        <Link href="/integrations" className="footer-link">
          Integrations
        </Link>
        <span className="footer-sep">·</span>
        <Link href="/absorb" className="footer-link">
          Absorb
        </Link>
        <span className="footer-sep">·</span>
        <span className="footer-hint">
          Press <kbd>?</kbd> for help
        </span>
      </footer>
    </main>
  );
}
