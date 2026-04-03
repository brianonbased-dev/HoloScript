'use client';

/**
 * MarketplacePanel — Browse, search, install HoloScript packages
 */

import React, { useState, useEffect } from 'react';
import { useMarketplace } from '../../hooks/useMarketplace';
import type { ContentCategory } from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

interface MarketplacePanelProps {
  worldId?: string;
  /** Default search category */
  category?: ContentCategory;
}

const CATEGORIES: { value: ContentCategory | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '🌐' },
  { value: 'world', label: 'Worlds', icon: '🌍' },
  { value: 'object', label: 'Objects', icon: '📦' },
  { value: 'agent', label: 'Agents', icon: '🤖' },
  { value: 'trait', label: 'Traits', icon: '🧬' },
  { value: 'shader', label: 'Shaders', icon: '🎨' },
  { value: 'vfx', label: 'VFX', icon: '✨' },
  { value: 'audio', label: 'Audio', icon: '🔊' },
  { value: 'template', label: 'Templates', icon: '📋' },
  { value: 'plugin', label: 'Plugins', icon: '🔌' },
];

export function MarketplacePanel({ worldId = 'default', category }: MarketplacePanelProps) {
  const { results, installed, stats, search, install, uninstall, selected, select } =
    useMarketplace(worldId);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ContentCategory | 'all'>(category || 'all');
  const [tab, setTab] = useState<'browse' | 'installed'>('browse');

  useEffect(() => {
    search({
      query: query || undefined,
      category: activeCategory === 'all' ? undefined : activeCategory,
    });
  }, [query, activeCategory, search]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span>🛒 Marketplace</span>
        <span style={styles.stats}>
          {stats.totalPackages} packages · {stats.totalDownloads} downloads
        </span>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={tab === 'browse' ? styles.tabActive : styles.tab}
          onClick={() => setTab('browse')}
        >
          Browse
        </button>
        <button
          style={tab === 'installed' ? styles.tabActive : styles.tab}
          onClick={() => setTab('installed')}
        >
          Installed ({installed.length})
        </button>
      </div>

      {tab === 'browse' ? (
        <>
          {/* Search */}
          <input
            style={styles.search}
            placeholder="Search packages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {/* Categories */}
          <div style={styles.categories}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                style={activeCategory === cat.value ? styles.catActive : styles.cat}
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div style={styles.results}>
            {results?.listings.map((listing) => {
              const isInstalled = installed.some((m) => m.packageId === listing.metadata.id);
              return (
                <div
                  key={listing.metadata.id}
                  style={styles.card}
                  onClick={() => select(listing.metadata.id)}
                >
                  <div style={styles.cardHeader}>
                    <span style={styles.cardName}>{listing.metadata.name}</span>
                    <span style={styles.cardVerdict}>
                      {listing.safetyReport.verdict === 'safe'
                        ? '✅'
                        : listing.safetyReport.verdict === 'warnings'
                          ? '⚠️'
                          : '🛑'}
                    </span>
                  </div>
                  <div style={styles.cardDesc}>{listing.metadata.description}</div>
                  <div style={styles.cardMeta}>
                    <span>by {listing.metadata.publisher.name}</span>
                    <span>⬇ {listing.downloads}</span>
                    <span>⭐ {listing.rating.toFixed(1)}</span>
                  </div>
                  <div style={styles.cardTags}>
                    {listing.metadata.tags.slice(0, 3).map((t: string) => (
                      <span key={t} style={styles.cardTag}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <button
                    style={isInstalled ? styles.btnUninstall : styles.btnInstall}
                    onClick={(e) => {
                      e.stopPropagation();
                      isInstalled
                        ? uninstall(listing.metadata.id, worldId)
                        : install(listing.metadata.id, worldId);
                    }}
                  >
                    {isInstalled ? 'Uninstall' : 'Install'}
                  </button>
                </div>
              );
            })}
            {results?.listings.length === 0 && <div style={styles.empty}>No packages found</div>}
          </div>
        </>
      ) : (
        /* Installed Tab */
        <div style={styles.results}>
          {installed.map((manifest) => (
            <div key={manifest.packageId} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.cardName}>{manifest.packageId}</span>
                <span>{manifest.safetyVerdict === 'safe' ? '✅' : '⚠️'}</span>
              </div>
              <div style={styles.cardMeta}>
                <span>
                  v{manifest.version.major}.{manifest.version.minor}.{manifest.version.patch}
                </span>
                <span>Danger: {manifest.dangerScore}/10</span>
              </div>
              <button
                style={styles.btnUninstall}
                onClick={() => uninstall(manifest.packageId, worldId)}
              >
                Uninstall
              </button>
            </div>
          ))}
          {installed.length === 0 && <div style={styles.empty}>No packages installed</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    color: '#e0e0e0',
    background: '#1a1a2e',
    borderRadius: 8,
    border: '1px solid #2a2a4a',
  },
  header: {
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stats: { fontSize: 11, color: '#888' },
  tabs: { display: 'flex', gap: 4, marginBottom: 8 },
  tab: {
    padding: '4px 12px',
    background: '#2a2a4a',
    border: 'none',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 12,
  },
  tabActive: {
    padding: '4px 12px',
    background: '#4040aa',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  search: {
    width: '100%',
    padding: '6px 10px',
    background: '#1e1e3a',
    border: '1px solid #3a3a5a',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 12,
    marginBottom: 8,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  categories: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 8 },
  cat: {
    padding: '2px 8px',
    background: '#2a2a4a',
    border: 'none',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 11,
  },
  catActive: {
    padding: '2px 8px',
    background: '#4040aa',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
  results: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    maxHeight: 400,
    overflowY: 'auto' as const,
  },
  card: {
    padding: 10,
    background: '#1e1e3a',
    borderRadius: 6,
    border: '1px solid #2a2a5a',
    cursor: 'pointer',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardName: { fontWeight: 600, fontSize: 13 },
  cardVerdict: { fontSize: 14 },
  cardDesc: { fontSize: 12, color: '#aaa', marginBottom: 6 },
  cardMeta: { display: 'flex', gap: 12, fontSize: 11, color: '#888', marginBottom: 6 },
  cardTags: { display: 'flex', gap: 4, marginBottom: 6 },
  cardTag: {
    padding: '1px 6px',
    background: '#2a2a5a',
    borderRadius: 3,
    fontSize: 10,
    color: '#a0a0ff',
  },
  btnInstall: {
    padding: '4px 12px',
    background: '#10b981',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
  btnUninstall: {
    padding: '4px 12px',
    background: '#ef4444',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
  empty: { color: '#666', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' },
};
