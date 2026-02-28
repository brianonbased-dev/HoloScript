'use client';

/**
 * CharacterLibrary — Visual Gallery for Character Templates
 *
 * MEME-002: Character preset library UI
 * Priority: Medium | Estimate: 4 hours
 *
 * Features:
 * - Visual gallery of character templates
 * - Template details (traits, animations, popularity)
 * - One-click template application
 * - Search and filter functionality
 * - Category filtering (classic, viral, trending)
 */

import { useState, useMemo } from 'react';
import { Search, X, Star, TrendingUp, Flame, Sparkles } from 'lucide-react';
import {
  type MemeTemplate,
  getPopularTemplates,
  searchTemplates,
} from '@/lib/memeTemplates';

interface CharacterLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: MemeTemplate) => void;
}

type CategoryFilter = 'all' | 'classic' | 'viral' | 'trending';

export function CharacterLibrary({
  isOpen,
  onClose,
  onSelectTemplate,
}: CharacterLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<MemeTemplate | null>(null);

  // Get all templates
  const allTemplates = useMemo(() => getPopularTemplates(), []);

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    let results = allTemplates;

    // Apply popularity filter (mapped to category UI)
    if (categoryFilter !== 'all') {
      results = results.filter((t) => t.popularity === categoryFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      results = searchTemplates(searchQuery.trim());
      // If category filter is active, intersect results
      if (categoryFilter !== 'all') {
        results = results.filter((t) => t.popularity === categoryFilter);
      }
    }

    return results;
  }, [searchQuery, categoryFilter, allTemplates]);

  const handleSelectTemplate = (template: MemeTemplate) => {
    onSelectTemplate(template);
    onClose();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'classic':
        return <Star className="h-4 w-4" />;
      case 'viral':
        return <Flame className="h-4 w-4" />;
      case 'trending':
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'classic':
        return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
      case 'viral':
        return 'text-red-400 border-red-500/40 bg-red-500/10';
      case 'trending':
        return 'text-purple-400 border-purple-500/40 bg-purple-500/10';
      default:
        return 'text-gray-400 border-gray-500/40 bg-gray-500/10';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative h-[90vh] w-[90vw] max-w-6xl rounded-2xl border border-purple-500/30 bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20 text-2xl">
              🎭
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Character Library</h2>
              <p className="text-sm text-studio-muted">
                {filteredTemplates.length} character{filteredTemplates.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search and Filter */}
        <div className="border-b border-studio-border p-6">
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-studio-muted" />
            <input
              type="text"
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-studio-border bg-black/40 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-studio-muted focus:border-purple-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-studio-muted hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category filters */}
          <div className="flex gap-2">
            {(['all', 'classic', 'viral', 'trending'] as const).map((category) => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  categoryFilter === category
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
                }`}
              >
                {category !== 'all' && getCategoryIcon(category)}
                <span className="capitalize">{category}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div className="overflow-y-auto p-6" style={{ height: 'calc(90vh - 250px)' }}>
          {filteredTemplates.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 text-6xl opacity-30">🔍</div>
              <p className="text-lg font-semibold text-studio-text">No characters found</p>
              <p className="text-sm text-studio-muted">
                Try a different search term or category filter
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="group relative overflow-hidden rounded-xl border border-studio-border bg-black/40 p-5 text-left transition-all hover:border-purple-500/60 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/20"
                >
                  {/* Category badge */}
                  <div
                    className={`absolute right-3 top-3 flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${getCategoryColor(
                      template.popularity
                    )}`}
                  >
                    {getCategoryIcon(template.popularity)}
                    <span className="capitalize">{template.popularity}</span>
                  </div>

                  {/* Preview Image or Placeholder */}
                  <div className="mb-3 text-5xl transition-transform group-hover:scale-110">
                    {template.previewImage ? '🖼️' : '🎭'}
                  </div>

                  {/* Name and description */}
                  <h3 className="mb-1 text-lg font-bold text-white">{template.name}</h3>
                  <p className="mb-3 line-clamp-2 text-xs text-studio-muted">
                    {template.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1 text-purple-400">
                      <Sparkles className="h-3 w-3" />
                      <span>{template.defaultTraits.length} traits</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-400">
                      <TrendingUp className="h-3 w-3" />
                      <span>{template.popularity}/5</span>
                    </div>
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-purple-500/90 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="text-sm font-bold text-white">Click to view details</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Details Modal */}
      {selectedTemplate && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="relative w-full max-w-2xl rounded-2xl border border-purple-500/30 bg-studio-panel p-6 shadow-2xl">
            {/* Close button */}
            <button
              onClick={() => setSelectedTemplate(null)}
              className="absolute right-4 top-4 rounded-lg p-2 text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="mb-6 flex items-start gap-4">
              <div className="text-6xl">{selectedTemplate.previewImage ? '🖼️' : '🎭'}</div>
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white">{selectedTemplate.name}</h2>
                  <div
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${getCategoryColor(
                      selectedTemplate.popularity
                    )}`}
                  >
                    {getCategoryIcon(selectedTemplate.popularity)}
                    <span className="capitalize">{selectedTemplate.popularity}</span>
                  </div>
                </div>
                <p className="text-sm text-studio-muted">{selectedTemplate.description}</p>
              </div>
            </div>

            {/* Detection patterns */}
            <div className="mb-4 rounded-lg border border-studio-border bg-black/20 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
                Auto-detects
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.filenamePatterns.map((pattern, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-purple-500/20 px-2 py-1 font-mono text-xs text-purple-300"
                  >
                    {pattern.source}
                  </span>
                ))}
              </div>
            </div>

            {/* Default traits */}
            <div className="mb-4 rounded-lg border border-studio-border bg-black/20 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
                Default Traits ({selectedTemplate.defaultTraits.length})
              </p>
              <ul className="space-y-1 text-sm text-studio-text">
                {selectedTemplate.defaultTraits.map((trait, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-purple-400">•</span>
                    {trait}
                  </li>
                ))}
              </ul>
            </div>

            {/* Suggested animations */}
            <div className="mb-6 rounded-lg border border-studio-border bg-black/20 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
                Suggested Animations ({selectedTemplate.suggestedAnimations.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.suggestedAnimations.map((anim, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300"
                  >
                    {anim}
                  </span>
                ))}
              </div>
            </div>

            {/* Apply button */}
            <button
              onClick={() => handleSelectTemplate(selectedTemplate)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-6 py-3 font-semibold text-white transition-all hover:bg-purple-600 active:scale-95"
            >
              <Sparkles className="h-5 w-5" />
              Apply Character Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
