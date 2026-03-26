/**
 * ScenarioLauncher.tsx — Full-page scenario launcher
 *
 * Combines the Gallery view with a panel viewer.
 * Click any scenario card → opens its panel full-screen.
 */

'use client';

import React, { useState, lazy, Suspense } from 'react';
import { ScenarioGallery } from './ScenarioGallery';

// Lazy-load panels to keep initial bundle small
const panels: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dna: lazy(() => import('./DNASequencerPanel')),
  space: lazy(() => import('./SpaceMissionPanel')),
  brain: lazy(() => import('./BrainMapperPanel')),
  climate: lazy(() => import('./ClimateDashboardPanel')),
  wine: lazy(() => import('./WineSommelierPanel')),
  ocean: lazy(() => import('./OceanExplorerPanel')),
  themepark: lazy(() => import('./ThemeParkPanel')),
  geology: lazy(() => import('./GeologyLabPanel')),
  music: lazy(() => import('./MusicStudioPanel')),
  forensic: lazy(() => import('./ForensicScenePanel')),
  escape: lazy(() => import('./EscapeRoomPanel')),
  biomech: lazy(() => import('./BiomechanicsPanel')),
  film: lazy(() => import('./FilmStudioPanel')),
  bridge: lazy(() => import('./BridgeLabPanel')),
  disaster: lazy(() => import('./DisasterResponsePanel')),
  surgery: lazy(() => import('./SurgicalRehearsalPanel')),
  dream: lazy(() => import('./DreamJournalPanel')),
  stars: lazy(() => import('./ConstellationPanel')),
  archaeology: lazy(() => import('./ArchaeologyPanel')),
  epidemic: lazy(() => import('./EpidemicPanel')),
  courtroom: lazy(() => import('./CourtroomPanel')),
  fashion: lazy(() => import('./FashionRunwayPanel')),
  timecapsule: lazy(() => import('./TimeCapsulePanel')),
  accessibility: lazy(() => import('./AccessibilityPanel')),
  molecular: lazy(() => import('./MolecularLabPanel')),
};

const SCENARIO_NAMES: Record<string, string> = {
  dna: '🧬 DNA Lab',
  space: '🚀 Space Mission',
  brain: '🧠 Brain Mapper',
  climate: '🌡️ Climate',
  wine: '🍷 Wine',
  ocean: '🌊 Ocean',
  themepark: '🎢 Theme Park',
  geology: '🪨 Geology',
  music: '🎵 Music',
  forensic: '🔬 Forensic',
  escape: '🔐 Escape Room',
  biomech: '🏋️ Biomechanics',
  film: '🎬 Film',
  bridge: '🏗️ Bridge',
  disaster: '🚨 Disaster',
  surgery: '🏥 Surgery',
  dream: '💭 Dream',
  stars: '⭐ Stars',
  archaeology: '🏛️ Archaeology',
  epidemic: '🦠 Epidemic',
  courtroom: '⚖️ Court',
  fashion: '👗 Fashion',
  timecapsule: '⏳ Time Capsule',
  accessibility: '♿ Accessibility',
  molecular: '🧪 Molecular',
};

export function ScenarioLauncher() {
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  if (activeScenario && panels[activeScenario]) {
    const Panel = panels[activeScenario];
    return (
      <div style={{ minHeight: '100vh', background: '#08090f' }}>
        {/* Top Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <button
            onClick={() => setActiveScenario(null)}
            style={{
              padding: '6px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#aab',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ← Gallery
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>
            {SCENARIO_NAMES[activeScenario] ?? activeScenario}
          </span>
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 11,
              padding: '3px 8px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 6,
              color: '#4ade80',
            }}
          >
            🔴 Recording
          </span>
        </div>
        {/* Panel */}
        <div style={{ maxWidth: 760, margin: '20px auto', padding: '0 20px' }}>
          <Suspense
            fallback={
              <div style={{ textAlign: 'center', padding: 60, color: '#556677' }}>
                <div style={{ fontSize: 32 }}>⏳</div>
                <div style={{ marginTop: 8 }}>Loading scenario engine...</div>
              </div>
            }
          >
            <Panel />
          </Suspense>
        </div>
      </div>
    );
  }

  return <ScenarioGallery onSelect={setActiveScenario} />;
}

export default ScenarioLauncher;
