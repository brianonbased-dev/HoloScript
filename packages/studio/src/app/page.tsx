'use client';

/**
 * HoloScript Studio — Absorb-First Landing
 *
 * The home page IS the Absorb door. Users paste a URL, upload a CSV, or
 * describe their business. Everything else is secondary navigation.
 *
 * Flow: Absorb → Knowledge → Compile → Deploy
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Nav Items (secondary) ───────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/absorb', label: 'Projects', icon: '📊' },
  { href: '/create', label: 'Editor', icon: '🔨' },
  { href: '/templates', label: 'Templates', icon: '📐' },
  { href: '/holoclaw', label: 'Agents', icon: '🤖' },
  { href: '/holodaemon', label: 'Daemons', icon: '👾' },
  { href: '/pipeline', label: 'Pipeline', icon: '⚡' },
  { href: '/operations', label: 'Operations', icon: '📈' },
  { href: '/holomesh', label: 'HoloMesh', icon: '🌐' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
] as const;

const INDUSTRY_CHIPS = [
  { id: 'retail', label: 'Retail', emoji: '🏪' },
  { id: 'healthcare', label: 'Healthcare', emoji: '🏥' },
  { id: 'robotics', label: 'Robotics', emoji: '🤖' },
  { id: 'architecture', label: 'Architecture', emoji: '🏗️' },
  { id: 'agriculture', label: 'Agriculture', emoji: '🌾' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'manufacturing', label: 'Manufacturing', emoji: '🏭' },
  { id: 'automotive', label: 'Automotive', emoji: '🚗' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
] as const;

// ── Absorb Input ────────────────────────────────────────────────────────────

function AbsorbInput() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'url' | 'csv' | 'describe'>('url');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);

    if (mode === 'url') {
      // GitHub URL → Absorb scan
      router.push(`/absorb?repo=${encodeURIComponent(input.trim())}`);
    } else if (mode === 'csv') {
      // CSV paste → schema mapper
      router.push(`/absorb?csv=1`);
    } else {
      // Business description → Brittney
      router.push(`/absorb?describe=${encodeURIComponent(input.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      {/* Mode tabs */}
      <div className="flex gap-1 mb-3">
        {(['url', 'csv', 'describe'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === m
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            {m === 'url' ? '🔗 GitHub URL' : m === 'csv' ? '📊 CSV / Data' : '💬 Describe'}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mode === 'url'
              ? 'https://github.com/your-org/your-repo'
              : mode === 'csv'
                ? 'Paste CSV headers or upload a file...'
                : 'I run a dispensary with 200 SKUs and 3 locations...'
          }
          className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-lg focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-lg text-white font-medium transition-all"
        >
          {loading ? '...' : 'Absorb'}
        </button>
      </div>

      <p className="mt-2 text-white/30 text-sm text-center">
        {mode === 'url' && 'Scans your codebase into a knowledge graph. Free tier: 1 repo.'}
        {mode === 'csv' && 'Maps your data fields to HoloScript traits. Generates a spatial experience.'}
        {mode === 'describe' && 'Brittney builds your business simulation from a description. No data needed.'}
      </p>
    </form>
  );
}

// ── Stats Strip ─────────────────────────────────────────────────────────────

function StatsStrip() {
  return (
    <div className="flex flex-wrap justify-center gap-6 text-white/40 text-sm">
      <span>40 compilers</span>
      <span className="text-white/20">·</span>
      <span>3,300+ traits</span>
      <span className="text-white/20">·</span>
      <span>177 MCP tools</span>
      <span className="text-white/20">·</span>
      <span>57,356 tests</span>
      <span className="text-white/20">·</span>
      <span>Phone · Web · Quest · AR</span>
    </div>
  );
}

// ── Industry Row ────────────────────────────────────────────────────────────

function IndustryRow() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {INDUSTRY_CHIPS.map((ind) => (
        <Link
          key={ind.id}
          href={`/industry/${ind.id}`}
          className="px-3 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 text-sm transition-all"
        >
          {ind.emoji} {ind.label}
        </Link>
      ))}
    </div>
  );
}

// ── Secondary Nav ───────────────────────────────────────────────────────────

function SecondaryNav() {
  return (
    <nav className="flex flex-wrap justify-center gap-4 text-sm">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white/40 hover:text-white/80 transition-colors"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 gap-12 bg-gradient-to-b from-[#0a0a1a] via-[#0d1117] to-[#0a0a1a]">
      {/* Hero */}
      <section className="text-center space-y-4 max-w-3xl">
        <h1 className="text-5xl font-bold text-white tracking-tight">
          HoloScript Studio
        </h1>
        <p className="text-xl text-white/60">
          Point it at your data. Get a spatial experience on every device.
        </p>
      </section>

      {/* Absorb — the door */}
      <AbsorbInput />

      {/* Stats */}
      <StatsStrip />

      {/* Industries */}
      <section className="text-center space-y-3">
        <p className="text-white/30 text-sm">Works for any domain</p>
        <IndustryRow />
      </section>

      {/* Secondary nav */}
      <SecondaryNav />

      {/* Footer */}
      <footer className="text-white/20 text-xs">
        HoloScript v6.0.1 · Simulation-first
      </footer>
    </main>
  );
}
