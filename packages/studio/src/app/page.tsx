'use client';

/**
 * HoloScript Studio — Universal Point of Entry
 *
 * The front door for every user: ages 5-100+, all industries.
 * Animated hero, 4 adaptive mode cards, 9 industry portals.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

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
      {/* Floating orbs */}
      <div className="mesh-orb mesh-orb-1" />
      <div className="mesh-orb mesh-orb-2" />
      <div className="mesh-orb mesh-orb-3" />
      {/* Grid overlay */}
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
        {/* Emoji badge */}
        <div className={`mode-emoji bg-gradient-to-br ${mode.gradient}`}>
          <span>{mode.emoji}</span>
        </div>

        {/* Text */}
        <h3 className="mode-title">{mode.title}</h3>
        <span className="mode-subtitle">{mode.subtitle}</span>
        <p className="mode-description">{mode.description}</p>

        {/* Arrow */}
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

// ── Stat Counter ─────────────────────────────────────────────────────────────

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-badge">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Trigger entrance animations after mount
    const t = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className={`home-root ${loaded ? 'home-loaded' : ''}`}>
      <MeshBackground />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Open Platform for Spatial Computing
        </div>

        <h1 className="hero-title">
          <span className="hero-word hero-word-1">HoloScript</span>{' '}
          <span className="hero-word hero-word-2">Studio</span>
        </h1>

        <p className="hero-tagline">Create anything in 3D — no code required</p>

        {/* Stats strip */}
        <div className="hero-stats">
          <StatBadge value="18" label="Compile Targets" />
          <StatBadge value="1,525+" label="Traits" />
          <StatBadge value="43" label="Panels" />
          <StatBadge value="26" label="Scenarios" />
        </div>
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
        <Link href="/playground" className="footer-link">
          Playground
        </Link>
        <span className="footer-sep">·</span>
        <Link href="/workspace" className="footer-link">
          Workspace
        </Link>
        <span className="footer-sep">·</span>
        <span className="footer-hint">
          Press <kbd>?</kbd> for help
        </span>
      </footer>
    </main>
  );
}
