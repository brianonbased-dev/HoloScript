// TARGET: packages/studio/src/components/registry/TraitSupportMatrixDashboard.tsx
'use client';

/**
 * TraitSupportMatrixDashboard -- Searchable, filterable matrix of all HoloScript
 * traits showing platform support, test status, coverage, and dependencies.
 *
 * Features:
 *  - Full-text search across trait names, categories, and features
 *  - Filter by category, platform, and coverage status
 *  - Sortable columns (name, category, platform count, coverage)
 *  - Platform support heatmap with checkmark/cross indicators
 *  - Coverage badges (example, test, doc)
 *  - Expandable rows showing properties, requirements, and conflicts
 *  - Summary stats bar with category distribution chart
 *
 * Uses types from @holoscript/core TraitSupportMatrix.ts
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Check,
  X as XIcon,
  BarChart3,
  Grid3X3,
  ArrowUpDown,
  FileCheck,
  TestTube2,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';

// =============================================================================
// Types (mirrors @holoscript/core TraitSupportMatrix types)
// =============================================================================

interface TraitPlatformSupport {
  r3f: boolean;
  gltf: boolean;
  unity: boolean;
  unreal: boolean;
  babylon: boolean;
  webxr: boolean;
  arcore: boolean;
  arkit: boolean;
}

interface TraitPropertyInfo {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

interface TraitCoverage {
  hasExample: boolean;
  hasTest: boolean;
  hasDoc: boolean;
}

interface TraitMatrixEntry {
  name: string;
  category: string;
  platforms: TraitPlatformSupport;
  features: string[];
  properties: TraitPropertyInfo[];
  requires: string[];
  conflicts: string[];
  coverage: TraitCoverage;
}

// =============================================================================
// Sample Data (representative subset of HoloScript traits)
// =============================================================================

const PLATFORM_KEYS: (keyof TraitPlatformSupport)[] = [
  'r3f',
  'gltf',
  'unity',
  'unreal',
  'babylon',
  'webxr',
  'arcore',
  'arkit',
];

const PLATFORM_LABELS: Record<string, string> = {
  r3f: 'R3F',
  gltf: 'glTF',
  unity: 'Unity',
  unreal: 'Unreal',
  babylon: 'Babylon',
  webxr: 'WebXR',
  arcore: 'ARCore',
  arkit: 'ARKit',
};

const CATEGORY_COLORS: Record<string, string> = {
  interaction: 'bg-blue-900/40 text-blue-300',
  visual: 'bg-purple-900/40 text-purple-300',
  physics: 'bg-orange-900/40 text-orange-300',
  audio: 'bg-pink-900/40 text-pink-300',
  networking: 'bg-cyan-900/40 text-cyan-300',
  intelligence: 'bg-emerald-900/40 text-emerald-300',
  xr: 'bg-indigo-900/40 text-indigo-300',
  animation: 'bg-amber-900/40 text-amber-300',
  accessibility: 'bg-teal-900/40 text-teal-300',
  other: 'bg-studio-panel text-studio-muted',
};

const SAMPLE_TRAITS: TraitMatrixEntry[] = [
  {
    name: 'grabbable',
    category: 'interaction',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: false,
      arkit: false,
    },
    features: ['snap_to_hand', 'two_handed', 'haptic_feedback'],
    properties: [
      { name: 'snap_to_hand', type: 'boolean', required: false, default: true },
      { name: 'grab_distance', type: 'number', required: false, default: 0.5 },
      { name: 'throw_velocity', type: 'number', required: false, default: 1.0 },
    ],
    requires: [],
    conflicts: ['static'],
    coverage: { hasExample: true, hasTest: true, hasDoc: true },
  },
  {
    name: 'glowing',
    category: 'visual',
    platforms: {
      r3f: true,
      gltf: true,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: true,
      arkit: true,
    },
    features: ['emissive_color', 'pulse_animation', 'intensity'],
    properties: [
      { name: 'color', type: 'string', required: false, default: '#ffffff' },
      { name: 'intensity', type: 'number', required: false, default: 1.0 },
      { name: 'pulse', type: 'boolean', required: false, default: false },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: true, hasDoc: true },
  },
  {
    name: 'animated',
    category: 'animation',
    platforms: {
      r3f: true,
      gltf: true,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: false,
      arkit: false,
    },
    features: ['keyframe', 'loop', 'blend'],
    properties: [
      { name: 'clip', type: 'string', required: true },
      { name: 'loop', type: 'boolean', required: false, default: true },
      { name: 'speed', type: 'number', required: false, default: 1.0 },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: false, hasDoc: true },
  },
  {
    name: 'physics_body',
    category: 'physics',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: false,
      arcore: false,
      arkit: false,
    },
    features: ['rigidbody', 'collider', 'mass', 'friction'],
    properties: [
      { name: 'mass', type: 'number', required: false, default: 1.0 },
      { name: 'type', type: 'string', required: false, default: 'dynamic' },
      { name: 'friction', type: 'number', required: false, default: 0.5 },
      { name: 'restitution', type: 'number', required: false, default: 0.3 },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: true, hasDoc: true },
  },
  {
    name: 'networked',
    category: 'networking',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: false,
      webxr: true,
      arcore: false,
      arkit: false,
    },
    features: ['sync_transform', 'ownership', 'interpolation'],
    properties: [
      { name: 'sync_rate', type: 'number', required: false, default: 20 },
      { name: 'interpolate', type: 'boolean', required: false, default: true },
      { name: 'ownership', type: 'string', required: false, default: 'server' },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: false, hasDoc: false },
  },
  {
    name: 'interactive',
    category: 'interaction',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: true,
      arkit: true,
    },
    features: ['click', 'hover', 'focus', 'pointer_events'],
    properties: [
      { name: 'cursor', type: 'string', required: false, default: 'pointer' },
      { name: 'highlight_on_hover', type: 'boolean', required: false, default: true },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: true, hasDoc: true },
  },
  {
    name: 'spatial_audio',
    category: 'audio',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: false,
      arkit: false,
    },
    features: ['3d_positioning', 'occlusion', 'reverb'],
    properties: [
      { name: 'src', type: 'string', required: true },
      { name: 'volume', type: 'number', required: false, default: 1.0 },
      { name: 'rolloff', type: 'number', required: false, default: 1.0 },
      { name: 'max_distance', type: 'number', required: false, default: 50 },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: false, hasTest: false, hasDoc: true },
  },
  {
    name: 'npc_behavior',
    category: 'intelligence',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: false,
      webxr: false,
      arcore: false,
      arkit: false,
    },
    features: ['patrol', 'dialogue', 'state_machine'],
    properties: [
      { name: 'behavior_tree', type: 'string', required: true },
      { name: 'personality', type: 'string', required: false },
      { name: 'aggression', type: 'number', required: false, default: 0.5 },
    ],
    requires: ['animated'],
    conflicts: [],
    coverage: { hasExample: true, hasTest: false, hasDoc: false },
  },
  {
    name: 'ar_anchor',
    category: 'xr',
    platforms: {
      r3f: false,
      gltf: false,
      unity: true,
      unreal: false,
      babylon: false,
      webxr: true,
      arcore: true,
      arkit: true,
    },
    features: ['surface_detection', 'persistence', 'cloud_anchor'],
    properties: [
      { name: 'anchor_type', type: 'string', required: false, default: 'plane' },
      { name: 'persistent', type: 'boolean', required: false, default: false },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: false, hasTest: false, hasDoc: true },
  },
  {
    name: 'material',
    category: 'visual',
    platforms: {
      r3f: true,
      gltf: true,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: true,
      arkit: true,
    },
    features: ['pbr', 'textures', 'clearcoat', 'sheen', 'transmission'],
    properties: [
      { name: 'color', type: 'string', required: false, default: '#ffffff' },
      { name: 'roughness', type: 'number', required: false, default: 0.5 },
      { name: 'metalness', type: 'number', required: false, default: 0.0 },
      { name: 'emissive', type: 'string', required: false, default: '#000000' },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: true, hasDoc: true },
  },
  {
    name: 'particles',
    category: 'visual',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: true,
      babylon: true,
      webxr: true,
      arcore: false,
      arkit: false,
    },
    features: ['emission_rate', 'lifetime', 'forces', 'color_over_life'],
    properties: [
      { name: 'count', type: 'number', required: false, default: 100 },
      { name: 'lifetime', type: 'number', required: false, default: 2.0 },
      { name: 'speed', type: 'number', required: false, default: 1.0 },
      { name: 'color', type: 'string', required: false, default: '#ffffff' },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: true, hasTest: false, hasDoc: true },
  },
  {
    name: 'a11y_narrate',
    category: 'accessibility',
    platforms: {
      r3f: true,
      gltf: false,
      unity: true,
      unreal: false,
      babylon: false,
      webxr: true,
      arcore: false,
      arkit: true,
    },
    features: ['screen_reader', 'spatial_description', 'alt_text'],
    properties: [
      { name: 'label', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
      { name: 'role', type: 'string', required: false, default: 'object' },
    ],
    requires: [],
    conflicts: [],
    coverage: { hasExample: false, hasTest: false, hasDoc: false },
  },
];

// =============================================================================
// Sort Logic
// =============================================================================

type SortField = 'name' | 'category' | 'platforms' | 'coverage';
type SortDir = 'asc' | 'desc';

function platformCount(p: TraitPlatformSupport): number {
  return Object.values(p).filter(Boolean).length;
}

function coverageScore(c: TraitCoverage): number {
  return (c.hasExample ? 1 : 0) + (c.hasTest ? 1 : 0) + (c.hasDoc ? 1 : 0);
}

function sortTraits(
  traits: TraitMatrixEntry[],
  field: SortField,
  dir: SortDir
): TraitMatrixEntry[] {
  const sorted = [...traits].sort((a, b) => {
    switch (field) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'category':
        return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      case 'platforms':
        return platformCount(a.platforms) - platformCount(b.platforms);
      case 'coverage':
        return coverageScore(a.coverage) - coverageScore(b.coverage);
    }
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
}

// =============================================================================
// Sub-components
// =============================================================================

function PlatformCell({ supported }: { supported: boolean }) {
  return supported ? (
    <Check className="h-3 w-3 text-green-400 mx-auto" />
  ) : (
    <XIcon className="h-3 w-3 text-red-400/30 mx-auto" />
  );
}

function CoverageBadge({
  has,
  label,
  icon: Icon,
}: {
  has: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] ${
        has ? 'bg-green-900/40 text-green-300' : 'bg-red-900/20 text-red-400/50'
      }`}
      title={`${label}: ${has ? 'Yes' : 'No'}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function TraitDetailPanel({ trait }: { trait: TraitMatrixEntry }) {
  return (
    <div className="px-4 py-3 bg-studio-bg/50 border-t border-studio-border space-y-3">
      {/* Properties */}
      {trait.properties.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1.5">
            Properties
          </div>
          <div className="grid grid-cols-2 gap-1 lg:grid-cols-3">
            {trait.properties.map((p) => (
              <div
                key={p.name}
                className="rounded border border-studio-border bg-studio-panel/50 px-2 py-1"
              >
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-semibold text-studio-text">
                    {p.name}
                  </span>
                  {p.required && (
                    <span className="text-[7px] bg-red-900/40 text-red-300 rounded px-1">REQ</span>
                  )}
                </div>
                <div className="text-[9px] text-studio-muted">
                  <span className="text-cyan-400/70">{p.type}</span>
                  {p.default !== undefined && (
                    <span className="ml-1">= {JSON.stringify(p.default)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {trait.features.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
            Features
          </div>
          <div className="flex flex-wrap gap-1">
            {trait.features.map((f) => (
              <span
                key={f}
                className="rounded bg-studio-accent/10 px-1.5 py-0.5 text-[9px] font-mono text-studio-accent"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      <div className="flex gap-6">
        {trait.requires.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
              Requires
            </div>
            <div className="flex flex-wrap gap-1">
              {trait.requires.map((r) => (
                <span
                  key={r}
                  className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[9px] font-mono text-amber-300"
                >
                  @{r}
                </span>
              ))}
            </div>
          </div>
        )}
        {trait.conflicts.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
              Conflicts
            </div>
            <div className="flex flex-wrap gap-1">
              {trait.conflicts.map((c) => (
                <span
                  key={c}
                  className="rounded bg-red-900/30 px-1.5 py-0.5 text-[9px] font-mono text-red-300"
                >
                  @{c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface TraitSupportMatrixDashboardProps {
  traits?: TraitMatrixEntry[];
}

export function TraitSupportMatrixDashboard({
  traits: externalTraits,
}: TraitSupportMatrixDashboardProps) {
  const allTraits = externalTraits || SAMPLE_TRAITS;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'covered' | 'uncovered'>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Derived data
  const categories = useMemo(
    () => Array.from(new Set(allTraits.map((t) => t.category))).sort(),
    [allTraits]
  );

  const filteredTraits = useMemo(() => {
    let result = allTraits;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.features.some((f) => f.toLowerCase().includes(q)) ||
          t.properties.some((p) => p.name.toLowerCase().includes(q))
      );
    }

    // Category
    if (categoryFilter !== 'all') {
      result = result.filter((t) => t.category === categoryFilter);
    }

    // Platform
    if (platformFilter !== 'all') {
      result = result.filter((t) => t.platforms[platformFilter as keyof TraitPlatformSupport]);
    }

    // Coverage
    if (coverageFilter === 'covered') {
      result = result.filter(
        (t) => t.coverage.hasExample || t.coverage.hasTest || t.coverage.hasDoc
      );
    } else if (coverageFilter === 'uncovered') {
      result = result.filter(
        (t) => !t.coverage.hasExample && !t.coverage.hasTest && !t.coverage.hasDoc
      );
    }

    return sortTraits(result, sortField, sortDir);
  }, [allTraits, search, categoryFilter, platformFilter, coverageFilter, sortField, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const total = allTraits.length;
    const withTests = allTraits.filter((t) => t.coverage.hasTest).length;
    const withExamples = allTraits.filter((t) => t.coverage.hasExample).length;
    const withDocs = allTraits.filter((t) => t.coverage.hasDoc).length;
    const catCounts: Record<string, number> = {};
    for (const t of allTraits) {
      catCounts[t.category] = (catCounts[t.category] || 0) + 1;
    }
    return { total, withTests, withExamples, withDocs, catCounts };
  }, [allTraits]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField]
  );

  const toggleRow = useCallback((name: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider ${
        sortField === field ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
      }`}
    >
      {label}
      <ArrowUpDown className="h-2.5 w-2.5" />
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-[#0a0a12] text-studio-text overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2.5">
        <Grid3X3 className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Trait Support Matrix</span>
        <span className="text-[9px] text-studio-muted ml-1">
          {filteredTraits.length}/{allTraits.length} traits
        </span>
      </div>

      {/* Stats Bar */}
      <div className="flex shrink-0 items-center gap-4 border-b border-studio-border px-3 py-2 text-[10px] text-studio-muted overflow-x-auto">
        <span className="flex items-center gap-1">
          <BarChart3 className="h-3 w-3" />
          {stats.total} total
        </span>
        <span className="flex items-center gap-1 text-green-400">
          <TestTube2 className="h-3 w-3" />
          {stats.withTests} tested
        </span>
        <span className="flex items-center gap-1 text-blue-400">
          <FileCheck className="h-3 w-3" />
          {stats.withExamples} examples
        </span>
        <span className="flex items-center gap-1 text-purple-400">
          <BookOpen className="h-3 w-3" />
          {stats.withDocs} documented
        </span>
        {Object.keys(stats.catCounts).length > 0 && (
          <>
            <span className="text-studio-border">|</span>
            {Object.entries(stats.catCounts).map(([cat, count]) => (
              <span
                key={cat}
                className={`rounded px-1 py-0.5 text-[8px] ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}
              >
                {cat}: {count}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-studio-border px-3 py-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[150px] max-w-[300px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-studio-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search traits, features, properties..."
            className="w-full rounded-lg border border-studio-border bg-studio-bg pl-7 pr-2 py-1.5 text-[10px] text-studio-text outline-none focus:border-studio-accent placeholder:text-studio-muted/50"
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-studio-muted" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-studio-border bg-studio-bg px-2 py-1 text-[10px] text-studio-text outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Platform filter */}
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="rounded-lg border border-studio-border bg-studio-bg px-2 py-1 text-[10px] text-studio-text outline-none"
        >
          <option value="all">All Platforms</option>
          {PLATFORM_KEYS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>

        {/* Coverage filter */}
        <select
          value={coverageFilter}
          onChange={(e) => setCoverageFilter(e.target.value as 'all' | 'covered' | 'uncovered')}
          className="rounded-lg border border-studio-border bg-studio-bg px-2 py-1 text-[10px] text-studio-text outline-none"
        >
          <option value="all">All Coverage</option>
          <option value="covered">Has Coverage</option>
          <option value="uncovered">No Coverage</option>
        </select>
      </div>

      {/* Matrix Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead className="sticky top-0 bg-studio-panel z-10">
            <tr className="border-b border-studio-border">
              <th className="w-6 px-1" />
              <th className="text-left px-3 py-2">
                <SortButton field="name" label="Trait" />
              </th>
              <th className="text-left px-2 py-2">
                <SortButton field="category" label="Category" />
              </th>
              {PLATFORM_KEYS.map((p) => (
                <th
                  key={p}
                  className="text-center px-1 py-2 text-[8px] font-semibold text-studio-muted uppercase tracking-wider"
                >
                  {PLATFORM_LABELS[p]}
                </th>
              ))}
              <th className="text-center px-2 py-2">
                <SortButton field="platforms" label="Count" />
              </th>
              <th className="text-center px-2 py-2">
                <SortButton field="coverage" label="Coverage" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTraits.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 text-center text-[10px] text-studio-muted">
                  No traits match the current filters.
                </td>
              </tr>
            )}
            {filteredTraits.map((trait) => {
              const isExpanded = expandedRows.has(trait.name);
              const pCount = platformCount(trait.platforms);
              const cScore = coverageScore(trait.coverage);
              const hasWarning = trait.requires.length > 0 || trait.conflicts.length > 0;

              return (
                <React.Fragment key={trait.name}>
                  <tr
                    className={`border-b border-studio-border/50 cursor-pointer transition hover:bg-studio-panel/50 ${
                      isExpanded ? 'bg-studio-panel/30' : ''
                    }`}
                    onClick={() => toggleRow(trait.name)}
                  >
                    <td className="px-1 text-center">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-studio-muted inline" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-studio-muted inline" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono font-semibold text-studio-text">
                          @{trait.name}
                        </span>
                        {hasWarning && <AlertTriangle className="h-3 w-3 text-amber-400/60" />}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${CATEGORY_COLORS[trait.category] || CATEGORY_COLORS.other}`}
                      >
                        {trait.category}
                      </span>
                    </td>
                    {PLATFORM_KEYS.map((p) => (
                      <td key={p} className="px-1 py-2 text-center">
                        <PlatformCell supported={trait.platforms[p]} />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          pCount >= 6
                            ? 'text-green-400'
                            : pCount >= 3
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }`}
                      >
                        {pCount}/{PLATFORM_KEYS.length}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <CoverageBadge
                          has={trait.coverage.hasExample}
                          label="Ex"
                          icon={FileCheck}
                        />
                        <CoverageBadge has={trait.coverage.hasTest} label="Ts" icon={TestTube2} />
                        <CoverageBadge has={trait.coverage.hasDoc} label="Dc" icon={BookOpen} />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={12}>
                        <TraitDetailPanel trait={trait} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
