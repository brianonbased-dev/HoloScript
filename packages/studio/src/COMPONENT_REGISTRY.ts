/**
 * Component Ownership Registry
 *
 * Canonical source-of-truth for component ownership, preventing duplicate
 * implementations. Each entry documents the canonical location, any deprecated
 * alternatives, and the domain it belongs to.
 *
 * RULES:
 *   1. Before creating a new component, search this registry for existing solutions.
 *   2. If a canonical component exists, extend it instead of creating a duplicate.
 *   3. Deprecated components must re-export or redirect to the canonical version.
 *   4. New components must be registered here before merging to main.
 *
 * Generated: 2026-03-01
 * Last consolidated: 2026-03-01 (13 duplicate clusters resolved)
 */

export const COMPONENT_REGISTRY = {
  // ═══════════════════════════════════════════════════════════════════
  // ERROR BOUNDARIES
  // ═══════════════════════════════════════════════════════════════════

  ErrorBoundary: {
    canonical: '@holoscript/ui → ErrorBoundary',
    exports: ['ErrorBoundary', 'ErrorBoundaryProps'],
    domain: 'ui-primitives',
    description:
      'Canonical error boundary from @holoscript/ui. Supports label, fallback, renderFallback, onError, showReloadButton, AST path extraction, dev-only stack trace. Used for both app-level (showReloadButton) and panel-level (label) wrapping.',
    usedIn: [
      'app/providers.tsx',
      'app/create/page.tsx',
      'components/panels/*',
      'components/scene/*',
    ],
    deprecated: [
      {
        file: 'components/ErrorBoundary.tsx (DELETED)',
        export: 'ErrorBoundary',
        reason: 'Consolidated into @holoscript/ui ErrorBoundary',
      },
      {
        file: 'components/orchestration/ErrorBoundary.tsx',
        export: 'OrchestrationErrorBoundary',
        reason: 'Replaced with ErrorBoundary wrapper with label="Orchestration"',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SHADER EDITORS
  // ═══════════════════════════════════════════════════════════════════

  ShaderEditor_NodeGraph: {
    canonical: 'components/shader-editor/ShaderEditor.tsx',
    exports: ['ShaderEditor'],
    domain: 'shader-editor',
    description:
      'Visual node-graph shader editor with toolbar, node palette, canvas, material preview, and code panel.',
    usedIn: ['app/shader-editor/page.tsx'],
  },

  ShaderEditor_Monaco: {
    canonical: 'components/shader-editor/ShaderEditorPanel.tsx',
    exports: ['ShaderEditorPanel'],
    domain: 'shader-editor',
    description:
      'Monaco-based GLSL editor with live Three.js preview sphere, vertex/fragment tabs, and apply-to-material.',
    usedIn: ['app/create/page.tsx (bottom panel)'],
    deprecated: [
      {
        file: 'components/shader/ShaderEditorPanel.tsx',
        export: 'GlslShaderPanel',
        reason:
          'V1 textarea-based GLSL editor. Replaced by Monaco ShaderEditorPanel with live preview.',
      },
    ],
  },

  ShaderEditor_Services: {
    canonical: 'features/shader-editor/index.ts',
    exports: [
      'ShaderEditorService',
      'LivePreviewService',
      'MaterialLibrary',
      'ShaderTemplateLibrary',
      'UndoRedoSystem',
    ],
    domain: 'shader-editor',
    description:
      'Backend services for the shader editor: persistence, live preview, material library, templates, and undo/redo system.',
    usedIn: ['features/shader-editor/**'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // COLLABORATION
  // ═══════════════════════════════════════════════════════════════════

  CollabCursors: {
    canonical: 'components/collab/CollabCursorsV2.tsx',
    exports: ['CollabCursorsV2'],
    domain: 'collaboration',
    description:
      'Named colored cursor overlays for multiplayer presence. Uses useMultiplayerRoom with deterministic HSL colors and smooth transitions.',
    usedIn: ['app/create/page.tsx'],
    deprecated: [
      {
        file: 'components/collab/CollabCursors.tsx',
        export: 'CollabCursors',
        reason:
          'V1 using useCollabStore. Replaced by V2 with better color assignment and transitions.',
      },
    ],
  },

  CollabStatusDot: {
    canonical: 'components/collab/CollabCursors.tsx',
    exports: ['CollabStatusDot'],
    domain: 'collaboration',
    description: 'Small green/grey dot indicating collaboration connection status with peer count.',
    usedIn: ['app/create/page.tsx (icon rail)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // PERFORMANCE OVERLAYS
  // ═══════════════════════════════════════════════════════════════════

  PerfOverlay_InCanvas: {
    canonical: 'components/profiler/PerformanceOverlay.tsx',
    exports: ['PerformanceOverlay'],
    domain: 'profiler',
    description:
      'Rich performance overlay inside R3F Canvas (via drei Html). FPS sparkline, ring buffer, frame time, draw calls, triangles, geometries, textures.',
    usedIn: ['components/scene/SceneRenderer.tsx'],
    deprecated: [
      {
        file: 'components/perf/PerfOverlay.tsx',
        export: 'PerfOverlay',
        reason:
          'Dead code — never imported anywhere. PerformanceOverlay is the canonical in-canvas overlay.',
      },
    ],
  },

  PerfOverlay_HTML: {
    canonical: 'components/profiler/ProfilerOverlay.tsx',
    exports: ['ProfilerOverlay'],
    domain: 'profiler',
    description:
      'HTML overlay outside Canvas using useProfiler hook. Compact HUD with FPS, frame-ms, dropped frames, and mini sparkline.',
    usedIn: ['app/create/page.tsx (viewport overlay)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // HISTORY / UNDO
  // ═══════════════════════════════════════════════════════════════════

  HistoryPanel: {
    canonical: 'components/HistoryPanel.tsx',
    exports: ['HistoryPanel'],
    domain: 'history',
    description:
      'Full history sidebar with list/tree view toggle, labeled entries from historyLabelStore, undo/redo/clear buttons, and future state display.',
    usedIn: ['app/create/page.tsx (historyOpen rail, undoHistoryOpen rail)'],
    deprecated: [
      {
        file: 'components/history/UndoHistorySidebar.tsx',
        export: 'UndoHistorySidebar',
        reason:
          'V1 sidebar using useUndoHistory hook. Replaced by HistoryPanel with list/tree toggle and richer features.',
      },
    ],
  },

  UndoRedo_Shortcuts: {
    canonical: 'hooks/useUndoRedo.ts',
    exports: ['useUndoRedo'],
    domain: 'history',
    description:
      'Keyboard shortcut hook for Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y. Skips when focus is in text inputs.',
    usedIn: ['app/create/page.tsx'],
  },

  UndoHistory_DataHook: {
    canonical: 'hooks/useUndoHistory.ts',
    exports: ['useUndoHistory', 'HistoryEntry'],
    domain: 'history',
    description:
      'Data hook that reads temporal store and returns labeled HistoryEntry[] with jumpTo function.',
    usedIn: ['components/history/UndoHistorySidebar.tsx (deprecated)'],
  },

  UndoRedo_ShaderGraph: {
    canonical: 'features/shader-editor/UndoRedoSystem.ts',
    exports: [
      'UndoRedoSystem',
      'ICommand',
      'AddNodeCommand',
      'DeleteNodeCommand',
      'ConnectCommand',
      'DisconnectCommand',
      'SetPropertyCommand',
      'MoveNodeCommand',
      'BatchCommand',
    ],
    domain: 'shader-editor',
    description:
      'Command pattern undo/redo system specific to the shader graph editor. Not a duplicate of the scene-level temporal store.',
    usedIn: ['features/shader-editor/**'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT PANELS
  // ═══════════════════════════════════════════════════════════════════

  ExportPanel_Scene: {
    canonical: 'components/export/ExportPanel.tsx',
    exports: ['ExportPanel'],
    domain: 'export',
    description:
      'Scene export panel with glTF/USD/USDZ/JSON format picker, scene summary, and ZIP download.',
    usedIn: ['app/create/page.tsx (exportOpen rail)'],
  },

  ExportPanel_Character: {
    canonical: 'industry/character/export/ExportPanel.tsx',
    exports: [
      'CharacterExportPanel',
      'ExportPanel (deprecated alias)',
      'buildCharacterCard',
      'CharacterCard',
    ],
    domain: 'character',
    description:
      'Character export panel with Character Card JSON, Full Bundle ZIP, and raw GLB download.',
    usedIn: ['industry/character/layout/CharacterLayout.tsx'],
    note: 'Renamed from ExportPanel to CharacterExportPanel to avoid naming collision with scene export.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // NN-PRIMARY INVERSION / RUNTIME TIER
  // ═══════════════════════════════════════════════════════════════════

  RuntimeTierPanel: {
    canonical: 'components/panels/RuntimeTierPanel.tsx',
    exports: ['RuntimeTierPanel'],
    domain: 'profiler',
    description:
      'NN-primary inversion public face. Per-frame tier badge, SNN spike-train sparkline, Tier-2 alpha indicator, Tier-3 verdict display, and dispatch-policy A/B toggle.',
    usedIn: ['components/panels/RightPanelSidebar.tsx'],
  },

  DispatchTraceCAELPanel: {
    canonical: 'components/instrumentation/DispatchTraceCAELPanel.tsx',
    exports: ['DispatchTraceCAELPanel'],
    domain: 'instrumentation',
    description:
      'CAEL-compatible dispatch trace viewer. Consumes dispatch.decision bus events and renders an audit table for reviewers.',
    usedIn: ['components/panels/RuntimeTierPanel (audit sub-view)'],
  },

  useDispatchTrace: {
    canonical: 'hooks/useDispatchTrace.ts',
    exports: ['useDispatchTrace'],
    domain: 'hooks',
    description:
      'React hook that manages DispatchTraceCollector, simulates dispatch decisions per frame, and exposes rolling telemetry to RuntimeTierPanel.',
    usedIn: ['components/panels/RuntimeTierPanel.tsx'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT PANELS (2026-05-14 AUDIT: DUPLICATE CLUSTERS)
  // ═══════════════════════════════════════════════════════════════════

  ExportPanel_Scene: {
    canonical: 'components/export/ExportPanel.tsx',
    exports: ['ExportPanel'],
    domain: 'export',
    description:
      'Scene export panel with glTF/USD/USDZ/JSON format picker. Uses useSceneExport hook. Downloads ZIP with source + exported file.',
    usedIn: ['app/create/page.tsx (exportOpen rail)'],
    note: 'V1 - uses useSceneExport hook pattern',
  },

  ExportPipelinePanel: {
    canonical: 'components/export/ExportPipelinePanel.tsx',
    exports: ['ExportPipelinePanel'],
    domain: 'export',
    description:
      'Export pipeline v2 with OBJ/FBX/glTF/USD/JSON format grid. Direct API call to /api/export/v2. Includes SceneIngestHarnessSection.',
    usedIn: ['TBD - needs consolidation'],
    note: 'V2 - direct API pattern. DUPLICATE: Should consolidate with ExportPanel.',
    deprecated: [
      {
        file: 'components/export/ExportPipelinePanel.tsx',
        export: 'ExportPipelinePanel',
        reason:
          'Functional duplicate of ExportPanel. Same purpose (scene export), different implementation. Consolidate by adding OBJ/FBX to ExportPanel format list.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SHADER EDITORS (2026-05-14 AUDIT: DUPLICATE CLUSTERS)
  // ═══════════════════════════════════════════════════════════════════

  ShaderEditor_NodeGraph: {
    canonical: 'components/shader-editor/ShaderEditor.tsx',
    exports: ['ShaderEditor'],
    domain: 'shader-editor',
    description:
      'Full visual node-graph shader editor with toolbar, node palette, canvas, material preview, and code panel.',
    usedIn: ['app/shader-editor/page.tsx'],
  },

  ShaderEditorPanel_Monaco: {
    canonical: 'components/shader-editor/ShaderEditorPanel.tsx',
    exports: ['ShaderEditorPanel'],
    domain: 'shader-editor',
    description:
      'Monaco-based GLSL shader editor with live Three.js preview sphere, vertex/fragment tabs, and apply-to-material.',
    usedIn: ['app/create/page.tsx (bottom panel)'],
    note: 'Textual shader editor for quick edits',
  },

  ShaderPanel_Graph: {
    canonical: 'components/panels/ShaderPanel.tsx',
    exports: ['ShaderPanel'],
    domain: 'shader',
    description:
      'Simplified shader graph visual editor with node add buttons, compile, and demo. Uses useShaderGraph hook.',
    usedIn: ['TBD - needs usage audit'],
    note: 'DUPLICATE: Overlaps with ShaderEditor components. Simpler graph-only view.',
    deprecated: [
      {
        file: 'components/panels/ShaderPanel.tsx',
        export: 'ShaderPanel',
        reason:
          'Functional overlap with ShaderEditor.tsx and ShaderEditorPanel.tsx. Same domain (shader editing), different UI approach. Consolidate into single ShaderEditor with graph/text toggle.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // PARTICLE PANELS (2026-05-14 AUDIT: DUPLICATE CLUSTERS)
  // ═══════════════════════════════════════════════════════════════════

  ParticlePanel_Presets: {
    canonical: 'components/particles/ParticlePanel.tsx',
    exports: ['ParticlePanel'],
    domain: 'particles',
    description:
      'Right-rail preset picker for @particles trait. Fetches presets from /api/particles, supports search and type filter. Inserts trait snippets into scene code.',
    usedIn: ['app/create/page.tsx (particlesOpen rail)'],
    note: 'V2 - API-driven preset browser with trait insertion',
  },

  ParticlePanel_Legacy: {
    canonical: 'components/panels/ParticlePanel.tsx',
    exports: ['ParticlePanel'],
    domain: 'particles',
    description:
      'Legacy particle system preset browser with direct useParticles hook integration. Burst, step, emit controls with visual preview.',
    usedIn: ['TBD - needs usage audit'],
    note: 'V1 - Direct hook integration. DUPLICATE: Same name, different implementation.',
    deprecated: [
      {
        file: 'components/panels/ParticlePanel.tsx',
        export: 'ParticlePanel',
        reason:
          'Naming collision + functional overlap with components/particles/ParticlePanel.tsx. Legacy uses useParticles hook directly; newer version uses API. Consolidate by migrating useParticles features to API-driven version.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // HISTORY/UNDO PANELS (2026-05-14 AUDIT: DUPLICATE CLUSTERS)
  // ═══════════════════════════════════════════════════════════════════

  HistoryPanel: {
    canonical: 'components/HistoryPanel.tsx',
    exports: ['HistoryPanel'],
    domain: 'history',
    description:
      'Full history sidebar with list/tree view toggle, labeled entries from historyLabelStore, undo/redo/clear buttons, and future state display.',
    usedIn: ['app/create/page.tsx (historyOpen rail, undoHistoryOpen rail)'],
  },

  UndoHistorySidebar: {
    canonical: 'components/history/UndoHistorySidebar.tsx',
    exports: ['UndoHistorySidebar'],
    domain: 'history',
    description: 'V1 sidebar using useUndoHistory hook. Shows labeled history entries with jumpTo.',
    usedIn: ['TBD - needs usage audit'],
    deprecated: [
      {
        file: 'components/history/UndoHistorySidebar.tsx',
        export: 'UndoHistorySidebar',
        reason:
          'Already marked deprecated in registry (2026-03-01). Replaced by HistoryPanel with list/tree toggle.',
      },
    ],
  },

  UndoTreePanel: {
    canonical: 'components/history/UndoTreePanel.tsx',
    exports: ['UndoTreePanel'],
    domain: 'history',
    description: 'Tree-based undo/redo visualization. Alternative view to HistoryPanel list view.',
    usedIn: ['TBD - needs usage audit'],
    note: 'May be complementary to HistoryPanel, not duplicate. Verify usage.',
  },

  VersionHistoryPanel: {
    canonical: 'components/versionControl/VersionHistoryPanel.tsx',
    exports: ['VersionHistoryPanel'],
    domain: 'version-control',
    description: 'Version control history panel for scene versions.',
    usedIn: ['TBD - needs usage audit'],
    note: 'Separate domain (git-like versioning vs undo history). Not a duplicate.',
  },
} as const;

/**
 * Quick lookup: find the canonical path for a component name
 */
export function findCanonical(componentName: string): string | undefined {
  for (const entry of Object.values(COMPONENT_REGISTRY)) {
    const exports = entry.exports as readonly string[];
    if (exports.includes(componentName)) {
      return entry.canonical;
    }
    if ('deprecated' in entry && entry.deprecated) {
      for (const dep of entry.deprecated as readonly { export: string; file: string }[]) {
        if (dep.export === componentName) {
          return `DEPRECATED: ${dep.file} -> use ${entry.canonical} instead`;
        }
      }
    }
  }
  return undefined;
}
