'use client';

/**
 * RightPanelSidebar — Tabbed right sidebar for HoloScript Studio
 *
 * Mounts the 4 integration panels (Safety, Marketplace, Platform, Traits)
 * into a collapsible right drawer. Each tab shows its panel content.
 * Can be used on any page within the AppShell.
 */

import React, { useState } from 'react';
import { SafetyPanel } from './SafetyPanel';
import { MarketplacePanel } from './MarketplacePanel';
import { PlatformPicker } from './PlatformPicker';
import { TraitInspector } from './TraitInspector';
import type { EffectASTNode } from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

export type PanelTab = 'safety' | 'marketplace' | 'platform' | 'traits';

interface RightPanelSidebarProps {
  /** AST nodes for safety analysis (pass from editor) */
  safetyNodes?: EffectASTNode[];
  /** Current world ID for marketplace install */
  worldId?: string;
  /** Default active tab */
  defaultTab?: PanelTab;
  /** Whether sidebar starts open */
  defaultOpen?: boolean;
}

const TABS: { id: PanelTab; icon: string; label: string; title: string }[] = [
  { id: 'safety', icon: '🛡️', label: 'Safety', title: 'Compile-time safety analysis' },
  { id: 'marketplace', icon: '🛒', label: 'Store', title: 'Browse & install packages' },
  { id: 'platform', icon: '🎯', label: 'Platform', title: 'Target platform selection' },
  { id: 'traits', icon: '🧬', label: 'Traits', title: 'Trait inspector & culture norms' },
];

// ═══════════════════════════════════════════════════════════════════

export function RightPanelSidebar({
  safetyNodes = [],
  worldId = 'default',
  defaultTab = 'safety',
  defaultOpen = false,
}: RightPanelSidebarProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<PanelTab>(defaultTab);

  const handleTabClick = (tab: PanelTab) => {
    if (activeTab === tab && isOpen) {
      setIsOpen(false);
    } else {
      setActiveTab(tab);
      setIsOpen(true);
    }
  };

  return (
    <div className="flex h-full flex-shrink-0">
      {/* Panel content */}
      {isOpen && (
        <div
          className="border-l border-studio-border bg-studio-bg overflow-y-auto"
          style={{ width: 340 }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
            <span className="text-sm font-semibold text-studio-text">
              {TABS.find(t => t.id === activeTab)?.icon}{' '}
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-studio-muted hover:text-studio-text transition text-xs"
              title="Close panel"
            >
              ✕
            </button>
          </div>

          {/* Active panel */}
          <div className="p-0">
            {activeTab === 'safety' && (
              <SafetyPanel nodes={safetyNodes} autoAnalyze />
            )}
            {activeTab === 'marketplace' && (
              <MarketplacePanel worldId={worldId} />
            )}
            {activeTab === 'platform' && (
              <PlatformPicker />
            )}
            {activeTab === 'traits' && (
              <TraitInspector showCulture />
            )}
          </div>
        </div>
      )}

      {/* Tab strip (always visible) */}
      <div className="flex flex-col border-l border-studio-border bg-studio-bg w-10 flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            title={tab.title}
            className={`
              flex items-center justify-center h-10 w-10 text-base transition
              ${activeTab === tab.id && isOpen
                ? 'bg-studio-accent/10 text-studio-accent'
                : 'text-studio-muted hover:bg-studio-panel hover:text-studio-text'
              }
            `}
          >
            {tab.icon}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? 'Collapse panel' : 'Expand panel'}
          className="flex items-center justify-center h-10 w-10 text-studio-muted hover:text-studio-text transition text-xs"
        >
          {isOpen ? '▸' : '◂'}
        </button>
      </div>
    </div>
  );
}
