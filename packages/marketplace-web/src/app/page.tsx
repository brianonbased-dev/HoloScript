'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '@/components/SearchBar';
import { CategoryFilter } from '@/components/CategoryFilter';
import { TraitGrid } from '@/components/TraitGrid';
import { PopularTraits } from '@/components/PopularTraits';
import { useMarketplaceSearch, useSearchStore } from '@/lib/store';
import { marketplaceApi } from '@/lib/api';
import { Sparkles, TrendingUp, Clock, Layers } from 'lucide-react';

export default function MarketplacePage() {
  const { query, results, isSearching, error, filters, setQuery, performSearch } =
    useMarketplaceSearch();
  const { setPage } = useSearchStore();

  // Initial search on mount
  useEffect(() => {
    performSearch();
  }, []);

  // Fetch popular traits for the sidebar/featured section
  const { data: popularTraits } = useQuery({
    queryKey: ['popular-traits'],
    queryFn: () => marketplaceApi.traits.getPopular(undefined, 6),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch recent traits
  const { data: recentTraits } = useQuery({
    queryKey: ['recent-traits'],
    queryFn: () => marketplaceApi.traits.getRecent(6),
    staleTime: 5 * 60 * 1000,
  });

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery);
    performSearch(newQuery);
  };

  const handleFilterChange = () => {
    performSearch();
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-holoscript-50 to-holoscript-100 dark:from-holoscript-950 dark:to-zinc-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
              Discover HoloScript Traits
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              Browse thousands of reusable traits for rendering, physics, networking, AI, and more.
              Build immersive 3D and XR experiences faster.
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={() => performSearch()}
              placeholder="Search traits..."
              isLoading={isSearching}
            />
          </div>

          {/* Quick Stats */}
          <div className="flex justify-center gap-8 mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span>{results?.total.toLocaleString() || '1,000+'} traits</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>500k+ downloads</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>8 categories</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - Filters */}
          <aside className="lg:w-64 flex-shrink-0">
            <CategoryFilter onFilterChange={handleFilterChange} />
          </aside>

          {/* Main Content Area */}
          <div className="flex-1">
            {/* Results Header */}
            {results && (
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {query ? (
                    <>
                      Results for &quot;{query}&quot;
                      <span className="text-zinc-500 font-normal ml-2">
                        ({results.total.toLocaleString()})
                      </span>
                    </>
                  ) : (
                    <>
                      All Traits
                      <span className="text-zinc-500 font-normal ml-2">
                        ({results.total.toLocaleString()})
                      </span>
                    </>
                  )}
                </h2>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                <p className="text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Trait Grid */}
            <TraitGrid
              traits={results?.traits || []}
              isLoading={isSearching}
              emptyMessage={query ? `No traits found for "${query}"` : 'No traits available'}
            />

            {/* Pagination */}
            {results && results.totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <nav className="flex gap-2">
                  {Array.from({ length: Math.min(results.totalPages, 5) }).map((_, i) => (
                    <button
                      key={i}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        results.page === i + 1
                          ? 'bg-holoscript-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                      onClick={() => {
                        setPage(i + 1);
                        performSearch();
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Featured Sections */}
      {!query && (
        <>
          {/* Popular Traits */}
          {popularTraits && popularTraits.length > 0 && (
            <section className="bg-zinc-50 dark:bg-zinc-900/50 py-12">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="h-5 w-5 text-holoscript-500" />
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    Popular Traits
                  </h2>
                </div>
                <PopularTraits traits={popularTraits} />
              </div>
            </section>
          )}

          {/* Recently Updated */}
          {recentTraits && recentTraits.length > 0 && (
            <section className="py-12">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-2 mb-6">
                  <Clock className="h-5 w-5 text-holoscript-500" />
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    Recently Updated
                  </h2>
                </div>
                <PopularTraits traits={recentTraits} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
