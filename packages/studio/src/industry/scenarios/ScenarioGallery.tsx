/**
 * ScenarioGallery.tsx — Browsable Scenario Gallery
 *
 * Stunning visual gallery of all 26 HoloScript scenario panels
 * with category filtering, search, and panel launcher.
 */

'use client';

import React, { useState, useMemo } from 'react';

// ─── Scenario Registry ──────────────────────────────────────────

export interface ScenarioEntry {
  id: string;
  name: string;
  emoji: string;
  category: ScenarioCategory;
  description: string;
  tags: string[];
  engine: string;
  testCount: number;
}

export type ScenarioCategory = 'science' | 'engineering' | 'health' | 'arts' | 'nature' | 'society';

const CATEGORY_INFO: Record<
  ScenarioCategory,
  { label: string; emoji: string; color: string; gradient: string }
> = {
  science: {
    label: 'Science',
    emoji: '🔬',
    color: '#4ecdc4',
    gradient: 'linear-gradient(135deg, #4ecdc4, #44a8b3)',
  },
  engineering: {
    label: 'Engineering',
    emoji: '⚙️',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  },
  health: {
    label: 'Health',
    emoji: '🏥',
    color: '#22c55e',
    gradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
  },
  arts: {
    label: 'Arts',
    emoji: '🎨',
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7, #9333ea)',
  },
  nature: {
    label: 'Nature',
    emoji: '🌍',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
  },
  society: {
    label: 'Society',
    emoji: '👥',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
  },
};

export const SCENARIOS: ScenarioEntry[] = [
  {
    id: 'dna',
    name: 'DNA Sequencing Lab',
    emoji: '🧬',
    category: 'science',
    description: 'Base pairing, protein synthesis, CRISPR guide designer',
    tags: ['genomics', 'biology', 'crispr'],
    engine: 'dnaSequencing',
    testCount: 20,
  },
  {
    id: 'space',
    name: 'Space Mission Control',
    emoji: '🚀',
    category: 'science',
    description: 'Hohmann transfers, delta-v budgets, fuel calculator',
    tags: ['orbital', 'physics', 'rockets'],
    engine: 'spaceMission',
    testCount: 13,
  },
  {
    id: 'brain',
    name: 'Brain Mapper',
    emoji: '🧠',
    category: 'science',
    description: 'EEG bands, cognitive states, neural pathways',
    tags: ['neuroscience', 'eeg', 'brain'],
    engine: 'neuroscienceViz',
    testCount: 16,
  },
  {
    id: 'climate',
    name: 'Climate Dashboard',
    emoji: '🌡️',
    category: 'nature',
    description: 'GHG forcing, SSP scenarios, carbon budget',
    tags: ['climate', 'co2', 'warming'],
    engine: 'climateModeling',
    testCount: 18,
  },
  {
    id: 'wine',
    name: 'Wine Sommelier',
    emoji: '🍷',
    category: 'arts',
    description: 'Food pairing, cellar management, aging curves',
    tags: ['wine', 'pairing', 'sommelier'],
    engine: 'wineSommelier',
    testCount: 16,
  },
  {
    id: 'ocean',
    name: 'Ocean Explorer',
    emoji: '🌊',
    category: 'nature',
    description: 'Depth zones, water column, tides, marine life',
    tags: ['ocean', 'marine', 'tides'],
    engine: 'oceanography',
    testCount: 21,
  },
  {
    id: 'themepark',
    name: 'Theme Park Designer',
    emoji: '🎢',
    category: 'engineering',
    description: 'G-forces, queue optimizer, thrill scoring',
    tags: ['rides', 'physics', 'queues'],
    engine: 'themeParkDesigner',
    testCount: 17,
  },
  {
    id: 'geology',
    name: 'Geology Lab',
    emoji: '🪨',
    category: 'nature',
    description: 'Mohs scale, seismic waves, earthquake energy',
    tags: ['rocks', 'seismic', 'minerals'],
    engine: 'geologySimulator',
    testCount: 17,
  },
  {
    id: 'music',
    name: 'Music Studio',
    emoji: '🎵',
    category: 'arts',
    description: 'MIDI keyboard, mixer, BPM transport, gain',
    tags: ['audio', 'midi', 'mixing'],
    engine: 'musicProduction',
    testCount: 20,
  },
  {
    id: 'forensic',
    name: 'Forensic Scene',
    emoji: '🔬',
    category: 'science',
    description: 'Ballistics, blood spatter, witness reliability',
    tags: ['forensics', 'csi', 'evidence'],
    engine: 'forensicScene',
    testCount: 26,
  },
  {
    id: 'escape',
    name: 'Escape Room',
    emoji: '🔐',
    category: 'arts',
    description: 'Puzzle chains, hint system, progress tracking',
    tags: ['puzzles', 'games', 'escape'],
    engine: 'escapeRoomDesigner',
    testCount: 15,
  },
  {
    id: 'biomech',
    name: 'Sports Biomechanics',
    emoji: '🏋️',
    category: 'health',
    description: 'Forces, fatigue index, injury risk, VO₂',
    tags: ['sports', 'biomechanics', 'fitness'],
    engine: 'sportsBiomechanics',
    testCount: 18,
  },
  {
    id: 'film',
    name: 'Film Storyboard',
    emoji: '🎬',
    category: 'arts',
    description: 'Three-act structure, shot analysis, scheduling',
    tags: ['film', 'cinema', 'storyboard'],
    engine: 'filmStoryboard',
    testCount: 14,
  },
  {
    id: 'bridge',
    name: 'Bridge Engineering',
    emoji: '🏗️',
    category: 'engineering',
    description: 'Stress analysis, safety factor, fatigue life',
    tags: ['civil', 'structural', 'bridges'],
    engine: 'bridgeEngineering',
    testCount: 16,
  },
  {
    id: 'disaster',
    name: 'Disaster Response',
    emoji: '🚨',
    category: 'society',
    description: 'Triage, resource allocation, evacuation',
    tags: ['emergency', 'triage', 'disaster'],
    engine: 'disasterResponse',
    testCount: 22,
  },
  {
    id: 'surgery',
    name: 'Surgical Rehearsal',
    emoji: '🏥',
    category: 'health',
    description: 'Procedure steps, patient profile, anesthesia',
    tags: ['surgery', 'medical', 'operating'],
    engine: 'surgicalRehearsal',
    testCount: 17,
  },
  {
    id: 'dream',
    name: 'Dream Journal',
    emoji: '💭',
    category: 'health',
    description: 'Mood tracking, recurring symbols, lucidity',
    tags: ['dreams', 'psychology', 'sleep'],
    engine: 'dreamJournal',
    testCount: 19,
  },
  {
    id: 'stars',
    name: 'Constellation Storyteller',
    emoji: '⭐',
    category: 'nature',
    description: 'Star maps, mythology, seasonal visibility',
    tags: ['astronomy', 'stars', 'night-sky'],
    engine: 'constellationStory',
    testCount: 14,
  },
  {
    id: 'archaeology',
    name: 'Archaeological Dig',
    emoji: '🏛️',
    category: 'society',
    description: 'Carbon-14 dating, artifact registry, eras',
    tags: ['archaeology', 'history', 'dating'],
    engine: 'archaeologicalDig',
    testCount: 19,
  },
  {
    id: 'epidemic',
    name: 'Epidemic Tracker',
    emoji: '🦠',
    category: 'health',
    description: 'SIR model, R₀, herd immunity, projections',
    tags: ['epidemic', 'sir', 'public-health'],
    engine: 'epidemicHeatmap',
    testCount: 18,
  },
  {
    id: 'courtroom',
    name: 'Courtroom Evidence',
    emoji: '⚖️',
    category: 'society',
    description: 'Admissibility, chain of custody, weight',
    tags: ['legal', 'evidence', 'court'],
    engine: 'courtroomEvidence',
    testCount: 12,
  },
  {
    id: 'fashion',
    name: 'Fashion Runway',
    emoji: '👗',
    category: 'arts',
    description: 'Runway segments, model roster, walk timing',
    tags: ['fashion', 'runway', 'design'],
    engine: 'fashionRunway',
    testCount: 14,
  },
  {
    id: 'timecapsule',
    name: 'Time Capsule',
    emoji: '⏳',
    category: 'society',
    description: 'Sealed contents, preservation, aging',
    tags: ['history', 'time', 'capsule'],
    engine: 'timeCapsule',
    testCount: 11,
  },
  {
    id: 'accessibility',
    name: 'Accessibility Auditor',
    emoji: '♿',
    category: 'engineering',
    description: 'Contrast checker, WCAG, ADA compliance',
    tags: ['a11y', 'wcag', 'compliance'],
    engine: 'accessibilityAuditor',
    testCount: 24,
  },
  {
    id: 'molecular',
    name: 'Molecular Drug Lab',
    emoji: '🧪',
    category: 'science',
    description: "Lipinski's rules, drug-likeness, properties",
    tags: ['pharma', 'molecules', 'drugs'],
    engine: 'molecularDesigner',
    testCount: 26,
  },
  {
    id: 'farm',
    name: 'Urban Farm Planner',
    emoji: '🌱',
    category: 'nature',
    description: 'Permaculture, IoT sensors, crop rotation',
    tags: ['farming', 'iot', 'permaculture'],
    engine: 'urbanFarmPlanner',
    testCount: 55,
  },
  {
    id: 'inventor',
    name: 'Hardware Inventor',
    emoji: '🛠️',
    category: 'engineering',
    description: 'BOM tracking, physics stress simulations, and assembly cost',
    tags: ['hardware', 'prototype', 'engineering'],
    engine: 'inventorScenario',
    testCount: 4,
  },
  {
    id: 'nonspatial',
    name: 'Non-Spatial Developer',
    emoji: '💻',
    category: 'engineering',
    description: 'Stateless-to-Spatial mapping, CRDT sync latencies, REST bridging',
    tags: ['web', 'crdt', 'networking'],
    engine: 'nonspatialScenario',
    testCount: 5,
  },
  {
    id: 'soc',
    name: 'Threat Intelligence SOC',
    emoji: '🛡️',
    category: 'society',
    description: 'Node breach telemetry, threat heuristics, layer 3 isolation',
    tags: ['cybersecurity', 'breach', 'network'],
    engine: 'threatIntelligence',
    testCount: 3,
  },
  { id: 'v6-swarm', name: 'Agent Swarm Commander', emoji: '🌐', category: 'engineering', description: 'P2P Gossip, Agent Roles, Swarm Coordination', tags: ['v6', 'agents', 'mesh'], engine: 'v6PlatformServices', testCount: 0 },
  { id: 'v6-snn', name: 'Spiking Neural Net GPU', emoji: '🧠', category: 'science', description: 'WebGPU neuron inferencing in real-time', tags: ['v6', 'ai', 'snn'], engine: 'v6PlatformServices', testCount: 0 },
  { id: 'v6-sandbox', name: 'RBAC Sandbox Auditor', emoji: '🛡️', category: 'engineering', description: 'StdlibPolicy limits and cryptograhpic context isolation', tags: ['v6', 'security'], engine: 'v6PlatformServices', testCount: 0 },
  { id: 'v6-compiler', name: 'Universal Output Compiler', emoji: '📦', category: 'engineering', description: 'AST metrics to USD, Unity, VRChat backends', tags: ['v6', 'compiler'], engine: 'v6PlatformServices', testCount: 0 },
  { id: 'v6-market', name: 'Galactic Infinite Market', emoji: '🏦', category: 'society', description: 'V2 Reputation, Agent Escrows, Micropayments', tags: ['v6', 'economy'], engine: 'v6PlatformServices', testCount: 0 },
  {
    id: 'astro-radio',
    name: 'Radio Astrophysics Lab',
    emoji: '📡',
    category: 'science',
    description: 'Volumetric telemetry mapping, FITS cube rendering, RFI filtering',
    tags: ['astronomy', 'radio', 'volumetric'],
    engine: 'astrophysicsScenario',
    testCount: 4,
  },
  {
    id: 'absorb-orchestrator',
    name: 'Knowledge Orchestrator',
    emoji: '🌀',
    category: 'engineering',
    description: 'GraphRAG query tracking, Swarm execution funnel, token efficiencies',
    tags: ['orchestration', 'ai', 'graphrag', 'mesh'],
    engine: 'absorbOrchestration',
    testCount: 2,
  },
  {
    id: 'vfx-volumetric',
    name: 'Volumetric VFX Studio',
    emoji: '📽️',
    category: 'arts',
    description: 'Gaussian Splats, NeRF generation, and text-to-universe volumetric rendering',
    tags: ['vfx', 'nerf', 'gaussian', 'volumetric', 'text_to_universe'],
    engine: 'volumetricVfx',
    testCount: 6,
  },
  {
    id: 'text-to-universe',
    name: 'Text-to-Universe Generator',
    emoji: '🌌',
    category: 'arts',
    description: 'Generative AI pipeline converting text prompts to entire volumetric universes',
    tags: ['ai', 'text_to_universe', 'generative', 'worldbuilding'],
    engine: 'textToUniverse',
    testCount: 5,
  },
];

// ─── Component ───────────────────────────────────────────────────

export function ScenarioGallery({ onSelect }: { onSelect?: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ScenarioCategory | 'all'>('all');

  const categories = Object.entries(CATEGORY_INFO) as [
    ScenarioCategory,
    typeof CATEGORY_INFO.science,
  ][];

  const filtered = useMemo(() => {
    return SCENARIOS.filter((s) => {
      const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
      const matchesSearch =
        search === '' ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.tags.some((t) => t.includes(search.toLowerCase())) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const totalTests = SCENARIOS.reduce((sum, s) => sum + s.testCount, 0);

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #08090f 0%, #0d1020 100%)',
        borderRadius: 16,
        padding: 24,
        color: '#d0d0e8',
        fontFamily: "'Inter', sans-serif",
        minHeight: '100vh',
      }}
    >
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 20 }}>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #4ecdc4, #a855f7, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 8,
          }}
        >
          HoloScript Scenarios
        </h1>
        <p style={{ fontSize: 14, color: '#667788', maxWidth: 500, margin: '0 auto' }}>
          26 interactive engines spanning science, engineering, health, arts, and more. Each backed
          by production-grade logic and {totalTests}+ tests.
        </p>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        {[
          ['26', 'Scenarios'],
          [totalTests.toString(), 'Tests'],
          ['26', 'Panels'],
          ['18', 'Compile Targets'],
        ].map(([val, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{val}</div>
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                color: '#556677',
                letterSpacing: 1,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ maxWidth: 480, margin: '0 auto 20px', position: 'relative' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search scenarios, tags, or topics..."
          style={{
            width: '100%',
            padding: '12px 16px 12px 40px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: '#d0d0e8',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
            opacity: 0.4,
          }}
        >
          🔍
        </span>
      </div>

      {/* Category Filters */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setActiveCategory('all')}
          style={{
            padding: '6px 14px',
            background:
              activeCategory === 'all' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${activeCategory === 'all' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            color: activeCategory === 'all' ? '#fff' : '#889',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          All ({SCENARIOS.length})
        </button>
        {categories.map(([key, info]) => {
          const count = SCENARIOS.filter((s) => s.category === key).length;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              style={{
                padding: '6px 14px',
                background: activeCategory === key ? `${info.color}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeCategory === key ? `${info.color}40` : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8,
                color: activeCategory === key ? info.color : '#889',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {info.emoji} {info.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Scenario Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
          maxWidth: 960,
          margin: '0 auto',
        }}
      >
        {filtered.map((scenario) => {
          const cat = CATEGORY_INFO[scenario.category];
          return (
            <div
              key={scenario.id}
              onClick={() => onSelect?.(scenario.id)}
              style={{
                padding: 16,
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${cat.color}40`;
                (e.currentTarget as HTMLElement).style.background = `${cat.color}08`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 28 }}>{scenario.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>
                    {scenario.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: cat.color,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {cat.emoji} {cat.label}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.4, marginBottom: 8 }}>
                {scenario.description}
              </p>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {scenario.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: '1px 6px',
                        background: `${cat.color}10`,
                        border: `1px solid ${cat.color}20`,
                        borderRadius: 6,
                        fontSize: 9,
                        color: `${cat.color}cc`,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: '#556677' }}>{scenario.testCount} tests</span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#556677' }}>
          No scenarios match "{search}"
        </div>
      )}
    </div>
  );
}

export default ScenarioGallery;
