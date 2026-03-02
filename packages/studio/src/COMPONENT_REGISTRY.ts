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

  ErrorBoundary_AppLevel: {
    canonical: 'components/ErrorBoundary.tsx',
    exports: ['ErrorBoundary'],
    domain: 'app-shell',
    description: 'App-level error boundary wrapping the entire application. Full-page recovery UI with Try Again + Reload buttons and technical details.',
    usedIn: ['app/providers.tsx'],
  },

  ErrorBoundary_Panel: {
    canonical: 'components/ui/StudioErrorBoundary.tsx',
    exports: ['StudioErrorBoundary'],
    domain: 'ui-primitives',
    description: 'Panel-level error boundary with label, onError callback, role="alert", dev-only stack trace. Use this for wrapping individual panels/features.',
    usedIn: ['app/create/page.tsx (multiple panels)'],
    deprecated: [
      {
        file: 'components/orchestration/ErrorBoundary.tsx',
        export: 'OrchestrationErrorBoundary',
        reason: 'Replaced with StudioErrorBoundary wrapper with label="Orchestration"',
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
    description: 'Visual node-graph shader editor with toolbar, node palette, canvas, material preview, and code panel.',
    usedIn: ['app/shader-editor/page.tsx'],
  },

  ShaderEditor_Monaco: {
    canonical: 'components/shader-editor/ShaderEditorPanel.tsx',
    exports: ['ShaderEditorPanel'],
    domain: 'shader-editor',
    description: 'Monaco-based GLSL editor with live Three.js preview sphere, vertex/fragment tabs, and apply-to-material.',
    usedIn: ['app/create/page.tsx (bottom panel)'],
    deprecated: [
      {
        file: 'components/shader/ShaderEditorPanel.tsx',
        export: 'GlslShaderPanel',
        reason: 'V1 textarea-based GLSL editor. Replaced by Monaco ShaderEditorPanel with live preview.',
      },
    ],
  },

  ShaderEditor_Services: {
    canonical: 'features/shader-editor/index.ts',
    exports: ['ShaderEditorService', 'LivePreviewService', 'MaterialLibrary', 'ShaderTemplateLibrary', 'UndoRedoSystem'],
    domain: 'shader-editor',
    description: 'Backend services for the shader editor: persistence, live preview, material library, templates, and undo/redo system.',
    usedIn: ['features/shader-editor/**'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // COLLABORATION
  // ═══════════════════════════════════════════════════════════════════

  CollabCursors: {
    canonical: 'components/collab/CollabCursorsV2.tsx',
    exports: ['CollabCursorsV2'],
    domain: 'collaboration',
    description: 'Named colored cursor overlays for multiplayer presence. Uses useMultiplayerRoom with deterministic HSL colors and smooth transitions.',
    usedIn: ['app/create/page.tsx'],
    deprecated: [
      {
        file: 'components/collab/CollabCursors.tsx',
        export: 'CollabCursors',
        reason: 'V1 using useCollabStore. Replaced by V2 with better color assignment and transitions.',
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
    description: 'Rich performance overlay inside R3F Canvas (via drei Html). FPS sparkline, ring buffer, frame time, draw calls, triangles, geometries, textures.',
    usedIn: ['components/scene/SceneRenderer.tsx'],
    deprecated: [
      {
        file: 'components/perf/PerfOverlay.tsx',
        export: 'PerfOverlay',
        reason: 'Dead code — never imported anywhere. PerformanceOverlay is the canonical in-canvas overlay.',
      },
    ],
  },

  PerfOverlay_HTML: {
    canonical: 'components/profiler/ProfilerOverlay.tsx',
    exports: ['ProfilerOverlay'],
    domain: 'profiler',
    description: 'HTML overlay outside Canvas using useProfiler hook. Compact HUD with FPS, frame-ms, dropped frames, and mini sparkline.',
    usedIn: ['app/create/page.tsx (viewport overlay)'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // HISTORY / UNDO
  // ═══════════════════════════════════════════════════════════════════

  HistoryPanel: {
    canonical: 'components/HistoryPanel.tsx',
    exports: ['HistoryPanel'],
    domain: 'history',
    description: 'Full history sidebar with list/tree view toggle, labeled entries from historyLabelStore, undo/redo/clear buttons, and future state display.',
    usedIn: ['app/create/page.tsx (historyOpen rail, undoHistoryOpen rail)'],
    deprecated: [
      {
        file: 'components/history/UndoHistorySidebar.tsx',
        export: 'UndoHistorySidebar',
        reason: 'V1 sidebar using useUndoHistory hook. Replaced by HistoryPanel with list/tree toggle and richer features.',
      },
    ],
  },

  UndoRedo_Shortcuts: {
    canonical: 'hooks/useUndoRedo.ts',
    exports: ['useUndoRedo'],
    domain: 'history',
    description: 'Keyboard shortcut hook for Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y. Skips when focus is in text inputs.',
    usedIn: ['app/create/page.tsx'],
  },

  UndoHistory_DataHook: {
    canonical: 'hooks/useUndoHistory.ts',
    exports: ['useUndoHistory', 'HistoryEntry'],
    domain: 'history',
    description: 'Data hook that reads temporal store and returns labeled HistoryEntry[] with jumpTo function.',
    usedIn: ['components/history/UndoHistorySidebar.tsx (deprecated)'],
  },

  UndoRedo_ShaderGraph: {
    canonical: 'features/shader-editor/UndoRedoSystem.ts',
    exports: ['UndoRedoSystem', 'ICommand', 'AddNodeCommand', 'DeleteNodeCommand', 'ConnectCommand', 'DisconnectCommand', 'SetPropertyCommand', 'MoveNodeCommand', 'BatchCommand'],
    domain: 'shader-editor',
    description: 'Command pattern undo/redo system specific to the shader graph editor. Not a duplicate of the scene-level temporal store.',
    usedIn: ['features/shader-editor/**'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT PANELS
  // ═══════════════════════════════════════════════════════════════════

  ExportPanel_Scene: {
    canonical: 'components/export/ExportPanel.tsx',
    exports: ['ExportPanel'],
    domain: 'export',
    description: 'Scene export panel with glTF/USD/USDZ/JSON format picker, scene summary, and ZIP download.',
    usedIn: ['app/create/page.tsx (exportOpen rail)'],
  },

  ExportPanel_Character: {
    canonical: 'components/character/export/ExportPanel.tsx',
    exports: ['CharacterExportPanel', 'ExportPanel (deprecated alias)', 'buildCharacterCard', 'CharacterCard'],
    domain: 'character',
    description: 'Character export panel with Character Card JSON, Full Bundle ZIP, and raw GLB download.',
    usedIn: ['components/character/layout/CharacterLayout.tsx'],
    note: 'Renamed from ExportPanel to CharacterExportPanel to avoid naming collision with scene export.',
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
