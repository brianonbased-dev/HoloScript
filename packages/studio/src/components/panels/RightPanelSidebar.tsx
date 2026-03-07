'use client';

/**
 * RightPanelSidebar — Tabbed right sidebar for HoloScript Studio
 *
 * 43 panels organized with domain-aware filtering, search, favorites,
 * and category headers for cross-domain navigation.
 */

import React, { useState, useMemo } from 'react';
import { SafetyPanel } from './SafetyPanel';
import { MarketplacePanel } from './MarketplacePanel';
import { PlatformPicker } from './PlatformPicker';
import { TraitInspector } from './TraitInspector';
import { PhysicsPreviewPanel } from './PhysicsPreviewPanel';
import { BehaviorTreePanel } from './BehaviorTreePanel';
import { DialoguePanel } from './DialoguePanel';
import { ECSInspectorPanel } from './ECSInspectorPanel';
import { AnimationPanel } from './AnimationPanel';
import { AudioPanel } from './AudioPanel';
import { ProcGenPanel } from './ProcGenPanel';
import { MultiplayerPanel } from './MultiplayerPanel';
import { ShaderPanel } from './ShaderPanel';
import { CombatPanel } from './CombatPanel';
import { PathfindingPanel } from './PathfindingPanel';
import { ParticlePanel } from './ParticlePanel';
import { CameraPanel } from './CameraPanel';
import { InventoryPanel } from './InventoryPanel';
import { TerrainPanel } from './TerrainPanel';
import { LightingPanel } from './LightingPanel';
import { CinematicPanel } from './CinematicPanel';
import { CollaborationPanel } from './CollaborationPanel';
import { SecurityPanel } from './SecurityPanel';
import { ScriptingPanel } from './ScriptingPanel';
import { SaveLoadPanel } from './SaveLoadPanel';
import { ProfilerPanel } from './ProfilerPanel';
import { CompilerPanel } from './CompilerPanel';
import { LODPanel } from './LODPanel';
import { StateMachinePanel } from './StateMachinePanel';
import { InputPanel } from './InputPanel';
import { NetworkPanel } from './NetworkPanel';
import { CulturePanel } from './CulturePanel';
import { TimelinePanel } from './TimelinePanel';
import { ScenePanel } from './ScenePanel';
import { AssetPanel } from './AssetPanel';
import { ReactiveStatePanel } from './ReactiveStatePanel';
import { ViewportPanel } from './ViewportPanel';
import { BusPanel } from './BusPanel';
import { PresetsPanel } from './PresetsPanel';
import { AgentCyclePanel } from './AgentCyclePanel';
import { CharacterPanel } from './CharacterPanel';
import { ModelViewerPanel } from './ModelViewerPanel';
import { TemplateGalleryPanel } from './TemplateGalleryPanel';
import { useDomainFilter, type DomainProfile } from '../../hooks/useDomainFilter';
import type { EffectASTNode } from '@holoscript/core';

// Re-export from shared types (breaks circular dependency)
export type { PanelTab } from '../../types/panels';
type PanelTab = import('../../types/panels').PanelTab;

interface RightPanelSidebarProps {
  safetyNodes?: EffectASTNode[];
  worldId?: string;
  defaultTab?: PanelTab;
  defaultOpen?: boolean;
}

// ─── Category-grouped tabs with headers ─────────────────────────────

interface TabDef {
  id: PanelTab;
  icon: string;
  label: string;
  title: string;
}

interface TabCategory {
  header: string;
  headerIcon: string;
  tabs: TabDef[];
}

const TAB_CATEGORIES: TabCategory[] = [
  {
    header: 'Core', headerIcon: '⬡',
    tabs: [
      { id: 'safety', icon: '🛡️', label: 'Safety', title: 'Compile-time safety analysis' },
      { id: 'marketplace', icon: '🛒', label: 'Store', title: 'Browse & install packages' },
      { id: 'platform', icon: '🎯', label: 'Platform', title: 'Target platform selection' },
      { id: 'traits', icon: '🧬', label: 'Traits', title: 'Trait inspector & culture norms' },
      { id: 'templates', icon: '🎨', label: 'Templates', title: 'Scene & character template gallery' },
    ],
  },
  {
    header: 'Engine', headerIcon: '⚙',
    tabs: [
      { id: 'physics', icon: '⚡', label: 'Physics', title: 'Physics simulation preview' },
      { id: 'ai', icon: '🧠', label: 'AI', title: 'Behavior tree editor & debugger' },
      { id: 'dialogue', icon: '💬', label: 'Dialogue', title: 'Dialogue graph editor' },
      { id: 'ecs', icon: '🔧', label: 'ECS', title: 'Entity-Component-System inspector' },
    ],
  },
  {
    header: 'Media', headerIcon: '🎨',
    tabs: [
      { id: 'animation', icon: '🎬', label: 'Anim', title: 'Animation timeline & easing' },
      { id: 'audio', icon: '🔊', label: 'Audio', title: 'Spatial audio manager' },
      { id: 'shader', icon: '✨', label: 'Shader', title: 'Visual shader graph' },
      { id: 'particles', icon: '🎆', label: 'FX', title: 'Particle system editor' },
    ],
  },
  {
    header: 'World', headerIcon: '🌍',
    tabs: [
      { id: 'camera', icon: '📷', label: 'Camera', title: 'Camera controller' },
      { id: 'terrain', icon: '🏔️', label: 'Terrain', title: 'Heightmap terrain editor' },
      { id: 'lighting', icon: '💡', label: 'Lighting', title: 'Scene lighting manager' },
      { id: 'procgen', icon: '🌋', label: 'ProcGen', title: 'Procedural generation' },
      { id: 'lod', icon: '🔍', label: 'LOD', title: 'Level of Detail' },
      { id: 'models', icon: '📐', label: 'Models', title: '3D model browser & preview' },
    ],
  },
  {
    header: 'Gameplay', headerIcon: '🎮',
    tabs: [
      { id: 'combat', icon: '⚔️', label: 'Combat', title: 'Combat system designer' },
      { id: 'inventory', icon: '🎒', label: 'Items', title: 'Inventory system' },
      { id: 'pathfinding', icon: '🗺️', label: 'Path', title: 'A* pathfinding visualizer' },
      { id: 'statemachine', icon: '🔄', label: 'FSM', title: 'State machine editor' },
      { id: 'input', icon: '🕹️', label: 'Input', title: 'Input mapping' },
      { id: 'character', icon: '🧑‍🎨', label: 'Character', title: 'Avatar & NPC customizer' },
    ],
  },
  {
    header: 'Scene', headerIcon: '🎭',
    tabs: [
      { id: 'scene', icon: '🎭', label: 'Scene', title: 'Scene graph manager' },
      { id: 'assets', icon: '📦', label: 'Assets', title: 'Asset browser' },
      { id: 'timeline', icon: '⏱️', label: 'Timeline', title: 'Animation timeline' },
      { id: 'cinematic', icon: '🎥', label: 'Cinematic', title: 'Cinematic director' },
      { id: 'state', icon: '⚡', label: 'State', title: 'Reactive state' },
    ],
  },
  {
    header: 'Network', headerIcon: '🌐',
    tabs: [
      { id: 'multiplayer', icon: '🌐', label: 'Multi', title: 'Multiplayer simulation' },
      { id: 'network', icon: '📡', label: 'NetMgr', title: 'Network manager' },
      { id: 'collaboration', icon: '👥', label: 'Collab', title: 'Collaboration session' },
      { id: 'culture', icon: '🏛️', label: 'Culture', title: 'Culture runtime' },
    ],
  },
  {
    header: 'Tools', headerIcon: '🔨',
    tabs: [
      { id: 'compiler', icon: '🔨', label: 'Build', title: 'Multi-target compiler' },
      { id: 'profiler', icon: '📊', label: 'Perf', title: 'Performance profiler' },
      { id: 'scripting', icon: '📝', label: 'REPL', title: 'HoloScript REPL' },
      { id: 'security', icon: '🔒', label: 'Sandbox', title: 'Security sandbox' },
      { id: 'saveload', icon: '💾', label: 'Save', title: 'Save/load manager' },
    ],
  },
  {
    header: 'View', headerIcon: '👁',
    tabs: [
      { id: 'viewport', icon: '🎬', label: '3D', title: 'Live 3D viewport' },
      { id: 'bus', icon: '📡', label: 'Bus', title: 'Event bus monitor & log' },
      { id: 'presets', icon: '💾', label: 'Presets', title: 'Panel layout presets' },
      { id: 'agent', icon: '🧠', label: 'Agent', title: 'uAA2++ agent cycle viewer' },
    ],
  },
];

// Flat list for lookups
const ALL_TABS = TAB_CATEGORIES.flatMap(c => c.tabs);

// ═══════════════════════════════════════════════════════════════════

export function RightPanelSidebar({
  safetyNodes = [],
  worldId = 'default',
  defaultTab = 'safety',
  defaultOpen = false,
}: RightPanelSidebarProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<PanelTab>(defaultTab);
  const { domain, domains, setDomain, isVisible, visibleCount, toggleFavorite, isFavorite, search, setSearch, matchesSearch } = useDomainFilter();
  const [showSearch, setShowSearch] = useState(false);

  const handleTabClick = (tab: PanelTab) => {
    if (activeTab === tab && isOpen) {
      setIsOpen(false);
    } else {
      setActiveTab(tab);
      setIsOpen(true);
    }
  };

  // Filter tabs by domain + search
  const filteredCategories = useMemo(() => {
    return TAB_CATEGORIES.map(cat => ({
      ...cat,
      tabs: cat.tabs.filter(t => isVisible(t.id) && matchesSearch(t.label, t.title)),
    })).filter(cat => cat.tabs.length > 0);
  }, [isVisible, matchesSearch, search]);

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab);

  return (
    <div className="flex h-full flex-shrink-0">
      {/* Panel content */}
      {isOpen && (
        <div className="border-l border-studio-border bg-studio-bg overflow-y-auto" style={{ width: 340 }}>
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
            <span className="text-sm font-semibold text-studio-text">
              {activeTabDef?.icon} {activeTabDef?.label}
            </span>
            <button onClick={() => setIsOpen(false)} className="text-studio-muted hover:text-studio-text transition text-xs" title="Close panel">✕</button>
          </div>

          {/* Active panel */}
          <div className="p-0">
            {activeTab === 'safety' && <SafetyPanel nodes={safetyNodes} autoAnalyze />}
            {activeTab === 'marketplace' && <MarketplacePanel worldId={worldId} />}
            {activeTab === 'platform' && <PlatformPicker />}
            {activeTab === 'traits' && <TraitInspector showCulture />}
            {activeTab === 'physics' && <PhysicsPreviewPanel />}
            {activeTab === 'ai' && <BehaviorTreePanel />}
            {activeTab === 'dialogue' && <DialoguePanel />}
            {activeTab === 'ecs' && <ECSInspectorPanel />}
            {activeTab === 'animation' && <AnimationPanel />}
            {activeTab === 'audio' && <AudioPanel />}
            {activeTab === 'procgen' && <ProcGenPanel />}
            {activeTab === 'multiplayer' && <MultiplayerPanel />}
            {activeTab === 'shader' && <ShaderPanel />}
            {activeTab === 'combat' && <CombatPanel />}
            {activeTab === 'pathfinding' && <PathfindingPanel />}
            {activeTab === 'particles' && <ParticlePanel />}
            {activeTab === 'camera' && <CameraPanel />}
            {activeTab === 'inventory' && <InventoryPanel />}
            {activeTab === 'terrain' && <TerrainPanel />}
            {activeTab === 'lighting' && <LightingPanel />}
            {activeTab === 'cinematic' && <CinematicPanel />}
            {activeTab === 'collaboration' && <CollaborationPanel />}
            {activeTab === 'security' && <SecurityPanel />}
            {activeTab === 'scripting' && <ScriptingPanel />}
            {activeTab === 'saveload' && <SaveLoadPanel />}
            {activeTab === 'profiler' && <ProfilerPanel />}
            {activeTab === 'compiler' && <CompilerPanel />}
            {activeTab === 'lod' && <LODPanel />}
            {activeTab === 'statemachine' && <StateMachinePanel />}
            {activeTab === 'input' && <InputPanel />}
            {activeTab === 'network' && <NetworkPanel />}
            {activeTab === 'culture' && <CulturePanel />}
            {activeTab === 'timeline' && <TimelinePanel />}
            {activeTab === 'scene' && <ScenePanel />}
            {activeTab === 'assets' && <AssetPanel />}
            {activeTab === 'state' && <ReactiveStatePanel />}
            {activeTab === 'viewport' && <ViewportPanel />}
            {activeTab === 'bus' && <BusPanel />}
            {activeTab === 'presets' && <PresetsPanel />}
            {activeTab === 'agent' && <AgentCyclePanel />}
            {activeTab === 'character' && <CharacterPanel />}
            {activeTab === 'models' && <ModelViewerPanel />}
            {activeTab === 'templates' && <TemplateGalleryPanel />}
          </div>
        </div>
      )}

      {/* Tab strip with headers, domain filter, search, favorites */}
      <div className="flex flex-col border-l border-studio-border bg-studio-bg w-12 flex-shrink-0 overflow-y-auto">

        {/* Domain selector */}
        <div className="flex flex-col items-center py-1 border-b border-studio-border/40">
          {(Object.keys(domains) as DomainProfile[]).map(d => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              title={domains[d].description}
              className={`w-10 h-5 text-[8px] font-bold tracking-wider transition rounded-sm
                ${domain === d
                  ? 'bg-studio-accent/20 text-studio-accent'
                  : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel/50'
                }`}
            >
              {domains[d].label.toUpperCase()}
            </button>
          ))}
          <div className="text-[7px] text-studio-muted mt-0.5">{visibleCount} tabs</div>
        </div>

        {/* Search toggle */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          title="Search panels (Ctrl+Shift+P)"
          className={`flex items-center justify-center h-7 text-xs transition
            ${showSearch ? 'bg-studio-accent/10 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
        >
          🔎
        </button>

        {showSearch && (
          <div className="px-0.5 pb-1">
            <input
              type="text"
              placeholder="..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full px-1 py-0.5 bg-studio-panel/40 rounded text-[9px] text-studio-text placeholder-studio-muted border border-studio-border/30 focus:border-studio-accent/50 outline-none"
            />
          </div>
        )}

        {/* Category-grouped tabs */}
        {filteredCategories.map(cat => (
          <React.Fragment key={cat.header}>
            {/* Category header */}
            <div className="px-0.5 pt-1.5 pb-0.5" title={cat.header}>
              <div className="text-[7px] font-bold text-studio-muted/60 tracking-widest text-center uppercase leading-none">
                {cat.header}
              </div>
            </div>

            {/* Category tabs */}
            {cat.tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                onContextMenu={e => { e.preventDefault(); toggleFavorite(tab.id); }}
                title={`${tab.title}${isFavorite(tab.id) ? ' ★' : ''}\nRight-click to ${isFavorite(tab.id) ? 'unpin' : 'pin'}`}
                className={`
                  relative flex items-center justify-center h-8 w-12 text-sm transition flex-shrink-0
                  ${activeTab === tab.id && isOpen
                    ? 'bg-studio-accent/15 text-studio-accent'
                    : 'text-studio-muted hover:bg-studio-panel/50 hover:text-studio-text'
                  }
                `}
              >
                {tab.icon}
                {isFavorite(tab.id) && (
                  <span className="absolute top-0.5 right-0.5 text-[6px] text-amber-400">★</span>
                )}
              </button>
            ))}
          </React.Fragment>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? 'Collapse panel' : 'Expand panel'}
          className="flex items-center justify-center h-10 w-12 text-studio-muted hover:text-studio-text transition text-xs border-t border-studio-border/30"
        >
          {isOpen ? '▸' : '◂'}
        </button>
      </div>
    </div>
  );
}
