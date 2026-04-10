'use client';

import { useFilterStore } from '@/lib/store';
import type { TraitCategory, Platform } from '@/types';
import { CATEGORY_LABELS, PLATFORM_LABELS, SORT_OPTIONS } from '@/types';
import {
  Palette,
  Atom,
  Globe,
  Volume2,
  Layout,
  Brain,
  Coins,
  Wrench,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const CATEGORY_ICONS: Record<TraitCategory, React.ReactNode> = {
  rendering: <Palette className="h-4 w-4" />,
  physics: <Atom className="h-4 w-4" />,
  networking: <Globe className="h-4 w-4" />,
  audio: <Volume2 className="h-4 w-4" />,
  ui: <Layout className="h-4 w-4" />,
  ai: <Brain className="h-4 w-4" />,
  blockchain: <Coins className="h-4 w-4" />,
  utility: <Wrench className="h-4 w-4" />,
};

interface CategoryFilterProps {
  onFilterChange?: () => void;
}

export function CategoryFilter({ onFilterChange }: CategoryFilterProps) {
  const { filters, setCategory, setPlatform, setVerified, setSortBy, resetFilters } =
    useFilterStore();

  const [expandedSections, setExpandedSections] = useState({
    categories: true,
    platforms: true,
    options: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleCategoryClick = (category: TraitCategory) => {
    setCategory(filters.category === category ? null : category);
    onFilterChange?.();
  };

  const handlePlatformClick = (platform: Platform) => {
    setPlatform(filters.platform === platform ? null : platform);
    onFilterChange?.();
  };

  const handleVerifiedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVerified(e.target.checked ? true : null);
    onFilterChange?.();
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as typeof filters.sortBy);
    onFilterChange?.();
  };

  const handleReset = () => {
    resetFilters();
    onFilterChange?.();
  };

  const hasActiveFilters =
    filters.category !== null || filters.platform !== null || filters.verified !== null;

  return (
    <div className="space-y-6">
      {/* Reset Filters */}
      {hasActiveFilters && (
        <button
          onClick={handleReset}
          className="w-full py-2 px-4 text-sm text-holoscript-600 dark:text-holoscript-400 
            bg-holoscript-50 dark:bg-holoscript-900/20 
            hover:bg-holoscript-100 dark:hover:bg-holoscript-900/30 
            rounded-lg transition-colors"
        >
          Clear all filters
        </button>
      )}

      {/* Sort By */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Sort by
        </label>
        <select
          value={filters.sortBy}
          onChange={handleSortChange}
          className="w-full py-2 px-3 bg-white dark:bg-zinc-800 
            border border-zinc-200 dark:border-zinc-700 
            rounded-lg text-sm text-zinc-900 dark:text-white
            focus:ring-2 focus:ring-holoscript-500 focus:border-transparent"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Categories */}
      <div>
        <button
          onClick={() => toggleSection('categories')}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3"
        >
          <span>Categories</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expandedSections.categories ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections.categories && (
          <div className="space-y-1">
            {(Object.keys(CATEGORY_LABELS) as TraitCategory[]).map((category) => (
              <button
                key={category}
                onClick={() => handleCategoryClick(category)}
                className={`
                    w-full flex items-center gap-3 py-2 px-3 rounded-lg text-sm transition-colors
                    ${
                      filters.category === category
                        ? `category-${category} font-medium`
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }
                  `}
              >
                {CATEGORY_ICONS[category]}
                <span className="flex-1 text-left">{CATEGORY_LABELS[category]}</span>
                {filters.category === category && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Platforms */}
      <div>
        <button
          onClick={() => toggleSection('platforms')}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3"
        >
          <span>Platforms</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expandedSections.platforms ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections.platforms && (
          <div className="space-y-1">
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => (
              <button
                key={platform}
                onClick={() => handlePlatformClick(platform)}
                className={`
                  w-full flex items-center gap-3 py-2 px-3 rounded-lg text-sm transition-colors
                  ${
                    filters.platform === platform
                      ? 'bg-holoscript-50 dark:bg-holoscript-900/20 text-holoscript-600 dark:text-holoscript-400 font-medium'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }
                `}
              >
                <span className="flex-1 text-left">{PLATFORM_LABELS[platform]}</span>
                {filters.platform === platform && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Options */}
      <div>
        <button
          onClick={() => toggleSection('options')}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3"
        >
          <span>Options</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expandedSections.options ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections.options && (
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.verified === true}
                onChange={handleVerifiedChange}
                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 
                  text-holoscript-500 focus:ring-holoscript-500"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Verified authors only
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
