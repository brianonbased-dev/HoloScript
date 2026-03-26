'use client';

import React, { useCallback } from 'react';
import type { ScenarioEntry, ScenarioCategory } from './ScenarioGallery';

// ─── Category Styling ───────────────────────────────────────────

const CATEGORY_COLORS: Record<ScenarioCategory, { primary: string; bg: string; border: string }> = {
  science: { primary: '#4ecdc4', bg: '#4ecdc408', border: '#4ecdc440' },
  engineering: { primary: '#3b82f6', bg: '#3b82f608', border: '#3b82f640' },
  health: { primary: '#22c55e', bg: '#22c55e08', border: '#22c55e40' },
  arts: { primary: '#a855f7', bg: '#a855f708', border: '#a855f740' },
  nature: { primary: '#f59e0b', bg: '#f59e0b08', border: '#f59e0b40' },
  society: { primary: '#ec4899', bg: '#ec489908', border: '#ec489940' },
};

const CATEGORY_LABELS: Record<ScenarioCategory, { label: string; emoji: string }> = {
  science: { label: 'Science', emoji: '\u{1F52C}' },
  engineering: { label: 'Engineering', emoji: '\u{2699}\u{FE0F}' },
  health: { label: 'Health', emoji: '\u{1F3E5}' },
  arts: { label: 'Arts', emoji: '\u{1F3A8}' },
  nature: { label: 'Nature', emoji: '\u{1F30D}' },
  society: { label: 'Society', emoji: '\u{1F465}' },
};

// ─── Props ──────────────────────────────────────────────────────

export interface ScenarioCardProps {
  /** The scenario entry data to render. */
  scenario: ScenarioEntry;
  /** Called when user clicks the card to launch the scenario. */
  onSelect?: (id: string) => void;
  /** Whether this card is currently selected/active. */
  isActive?: boolean;
  /** Optional className for external styling. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────

/**
 * ScenarioCard -- A visual card for a single scenario entry.
 *
 * Displays the scenario name, emoji icon, category badge, description,
 * tags, and test count. Supports hover effects and selection state.
 */
export function ScenarioCard({
  scenario,
  onSelect,
  isActive = false,
  className,
}: ScenarioCardProps) {
  const cat = CATEGORY_COLORS[scenario.category];
  const catLabel = CATEGORY_LABELS[scenario.category];

  const handleClick = useCallback(() => {
    onSelect?.(scenario.id);
  }, [onSelect, scenario.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(scenario.id);
      }
    },
    [onSelect, scenario.id]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Launch ${scenario.name} scenario`}
      aria-pressed={isActive}
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        padding: 16,
        background: isActive ? cat.bg : 'rgba(255,255,255,0.025)',
        border: `1px solid ${isActive ? cat.border : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
        outline: 'none',
      }}
      data-testid={`scenario-card-${scenario.id}`}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 28 }} aria-hidden="true">
          {scenario.emoji}
        </span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>{scenario.name}</div>
          <div
            style={{
              fontSize: 10,
              color: cat.primary,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {catLabel.emoji} {catLabel.label}
          </div>
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 12,
          color: '#8899aa',
          lineHeight: 1.4,
          marginBottom: 8,
          margin: '0 0 8px 0',
        }}
      >
        {scenario.description}
      </p>

      {/* Footer: tags + test count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {scenario.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                padding: '1px 6px',
                background: `${cat.primary}10`,
                border: `1px solid ${cat.primary}20`,
                borderRadius: 6,
                fontSize: 9,
                color: `${cat.primary}cc`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 10, color: '#556677' }} aria-label={`${scenario.testCount} tests`}>
          {scenario.testCount} tests
        </span>
      </div>
    </div>
  );
}

export default ScenarioCard;
