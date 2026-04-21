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

import {
  TraitMatrixEntry,
  TraitPlatformSupport,
  TraitCoverage,
  SortField,
  SortDir,
} from './types';
import {
  PLATFORM_KEYS,
  PLATFORM_LABELS,
  CATEGORY_COLORS,
  SAMPLE_TRAITS,
} from './mockData';
import { PlatformCell, CoverageBadge } from './TraitMatrixBadges';
import { TraitDetailPanel } from './TraitDetailPanel';



// =============================================================================
// Sort Logic
// =============================================================================

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
              const _cScore = coverageScore(trait.coverage);
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
