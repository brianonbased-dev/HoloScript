'use client';

/**
 * RightPanelSidebar — Tabbed right sidebar for HoloScript Studio
 *
 * Mounts 24 integration panels into a collapsible right drawer.
 * Each tab shows its panel content. Can be used on any page within the AppShell.
 */

import React, { useState } from 'react';
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
import type { EffectASTNode } from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

export type PanelTab = 'safety' | 'marketplace' | 'platform' | 'traits' | 'physics' | 'ai' | 'dialogue' | 'ecs' | 'animation' | 'audio' | 'procgen' | 'multiplayer' | 'shader' | 'combat' | 'pathfinding' | 'particles' | 'camera' | 'inventory' | 'terrain' | 'lighting' | 'cinematic' | 'collaboration' | 'security' | 'scripting';

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

const TABS: { id: PanelTab; icon: string; label: string; title: string; separator?: boolean }[] = [
  { id: 'safety', icon: '🛡️', label: 'Safety', title: 'Compile-time safety analysis' },
  { id: 'marketplace', icon: '🛒', label: 'Store', title: 'Browse & install packages' },
  { id: 'platform', icon: '🎯', label: 'Platform', title: 'Target platform selection' },
  { id: 'traits', icon: '🧬', label: 'Traits', title: 'Trait inspector & culture norms' },
  { id: 'physics', icon: '⚡', label: 'Physics', title: 'Physics simulation preview', separator: true },
  { id: 'ai', icon: '🧠', label: 'AI', title: 'Behavior tree editor & debugger' },
  { id: 'dialogue', icon: '💬', label: 'Dialogue', title: 'Dialogue graph editor' },
  { id: 'ecs', icon: '🔧', label: 'ECS', title: 'Entity-Component-System inspector' },
  { id: 'animation', icon: '🎬', label: 'Anim', title: 'Animation timeline & easing', separator: true },
  { id: 'audio', icon: '🔊', label: 'Audio', title: 'Spatial audio manager' },
  { id: 'procgen', icon: '🌍', label: 'ProcGen', title: 'Procedural terrain generation' },
  { id: 'multiplayer', icon: '🌐', label: 'Net', title: 'Multiplayer state simulation' },
  { id: 'shader', icon: '✨', label: 'Shader', title: 'Visual shader graph editor', separator: true },
  { id: 'combat', icon: '⚔️', label: 'Combat', title: 'Combat system designer' },
  { id: 'pathfinding', icon: '🗺️', label: 'Path', title: 'A* pathfinding visualizer' },
  { id: 'particles', icon: '🎆', label: 'FX', title: 'Particle system editor' },
  { id: 'camera', icon: '📷', label: 'Cam', title: 'Camera controller', separator: true },
  { id: 'inventory', icon: '🎒', label: 'Items', title: 'Inventory system' },
  { id: 'terrain', icon: '🏔️', label: 'Terrain', title: 'Heightmap terrain editor' },
  { id: 'lighting', icon: '💡', label: 'Light', title: 'Scene lighting manager' },
  { id: 'cinematic', icon: '🎬', label: 'Cine', title: 'Cinematic director', separator: true },
  { id: 'collaboration', icon: '👥', label: 'Collab', title: 'Collaboration session' },
  { id: 'security', icon: '🔒', label: 'Sandbox', title: 'Security sandbox' },
  { id: 'scripting', icon: '📝', label: 'REPL', title: 'HoloScript REPL' },
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
          </div>
        </div>
      )}

      {/* Tab strip (always visible) */}
      <div className="flex flex-col border-l border-studio-border bg-studio-bg w-10 flex-shrink-0 overflow-y-auto">
        {TABS.map(tab => (
          <React.Fragment key={tab.id}>
            {tab.separator && <div className="border-t border-studio-border/40 mx-1.5 my-0.5" />}
            <button
              onClick={() => handleTabClick(tab.id)}
              title={tab.title}
              className={`
                flex items-center justify-center h-9 w-10 text-sm transition flex-shrink-0
                ${activeTab === tab.id && isOpen
                  ? 'bg-studio-accent/10 text-studio-accent'
                  : 'text-studio-muted hover:bg-studio-panel hover:text-studio-text'
                }
              `}
            >
              {tab.icon}
            </button>
          </React.Fragment>
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
