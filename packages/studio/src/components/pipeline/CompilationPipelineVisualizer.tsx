'use client';
/**
 * CompilationPipelineVisualizer — Visual representation of HoloScript compilation pipeline
 *
 * TODO-062: Compilation Pipeline Visualizer
 *
 * Features:
 * - Pipeline stage visualization (parse -> validate -> optimize -> emit)
 * - Intermediate representation display at each stage
 * - Per-stage timing and performance metrics
 * - Error location highlighting with source mapping
 * - Stage detail expansion with AST/IR node counts
 * - Live compilation progress animation
 *
 * @version 1.0.0
 */
import React, { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type PipelineStageId = 'parse' | 'validate' | 'optimize' | 'emit';

export type StageStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';

export interface PipelineError {
  stage: PipelineStageId;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source?: string;
  suggestion?: string;
}

export interface IRSnapshot {
  format: string; // e.g. 'AST', 'ValidatedAST', 'OptimizedIR', 'R3FTree'
  nodeCount: number;
  depth: number;
  preview: string; // truncated JSON or tree representation
  sizeBytes: number;
}

export interface PipelineStage {
  id: PipelineStageId;
  name: string;
  icon: string;
  description: string;
  status: StageStatus;
  durationMs: number;
  errors: PipelineError[];
  inputIR?: IRSnapshot;
  outputIR?: IRSnapshot;
  metrics: Record<string, number | string>;
}

export interface CompilationResult {
  stages: PipelineStage[];
  totalDurationMs: number;
  sourceFile: string;
  targetFormat: string;
  success: boolean;
}

export interface CompilationPipelineVisualizerProps {
  result?: CompilationResult;
  onStageClick?: (stage: PipelineStage) => void;
  onRecompile?: () => void;
  className?: string;
}

// =============================================================================
// DEMO DATA
// =============================================================================

function createDemoResult(): CompilationResult {
  return {
    sourceFile: 'scene.holo',
    targetFormat: 'R3F',
    success: true,
    totalDurationMs: 47.3,
    stages: [
      {
        id: 'parse',
        name: 'Parse',
        icon: '📝',
        description: 'Tokenize and build Abstract Syntax Tree',
        status: 'success',
        durationMs: 12.1,
        errors: [],
        outputIR: {
          format: 'AST',
          nodeCount: 84,
          depth: 7,
          sizeBytes: 14200,
          preview: '{\n  "type": "Composition",\n  "name": "MyScene",\n  "objects": [{ "type": "Object", "shape": "sphere", ... }],\n  "traits": [{ "@material": "glass" }, ...]\n}',
        },
        metrics: {
          tokens: 342,
          lines: 48,
          imports: 3,
          compositions: 1,
        },
      },
      {
        id: 'validate',
        name: 'Validate',
        icon: '✅',
        description: 'Type-check traits, resolve references, validate constraints',
        status: 'warning',
        durationMs: 8.4,
        errors: [
          {
            stage: 'validate',
            line: 23,
            column: 8,
            message: 'Trait @iridescence on object "floor" may conflict with @emissive',
            severity: 'warning',
            source: '@iridescence { strength: 0.8 }',
            suggestion: 'Consider reducing iridescence strength or removing @emissive',
          },
        ],
        inputIR: {
          format: 'AST',
          nodeCount: 84,
          depth: 7,
          sizeBytes: 14200,
          preview: '{ ... }',
        },
        outputIR: {
          format: 'ValidatedAST',
          nodeCount: 84,
          depth: 7,
          sizeBytes: 15800,
          preview: '{\n  "type": "ValidatedComposition",\n  "resolvedTraits": [...],\n  "typeAnnotations": {...}\n}',
        },
        metrics: {
          traitsResolved: 12,
          referencesLinked: 7,
          constraintsChecked: 24,
          warnings: 1,
        },
      },
      {
        id: 'optimize',
        name: 'Optimize',
        icon: '⚡',
        description: 'Apply optimization passes: LOD, batching, tree-shaking',
        status: 'success',
        durationMs: 15.6,
        errors: [],
        inputIR: {
          format: 'ValidatedAST',
          nodeCount: 84,
          depth: 7,
          sizeBytes: 15800,
          preview: '{ ... }',
        },
        outputIR: {
          format: 'OptimizedIR',
          nodeCount: 71,
          depth: 6,
          sizeBytes: 12400,
          preview: '{\n  "type": "OptimizedScene",\n  "batchGroups": [{ "material": "glass", "count": 3 }],\n  "lodTiers": [...]\n}',
        },
        metrics: {
          nodesRemoved: 13,
          batchGroups: 4,
          lodTiers: 3,
          'sizeReduction': '21.5%',
        },
      },
      {
        id: 'emit',
        name: 'Emit',
        icon: '📤',
        description: 'Generate target code (R3F JSX, GLTF, USDZ)',
        status: 'success',
        durationMs: 11.2,
        errors: [],
        inputIR: {
          format: 'OptimizedIR',
          nodeCount: 71,
          depth: 6,
          sizeBytes: 12400,
          preview: '{ ... }',
        },
        outputIR: {
          format: 'R3FTree',
          nodeCount: 71,
          depth: 6,
          sizeBytes: 8900,
          preview: '<group>\n  <mesh position={[0, 1, 0]}>\n    <sphereGeometry />\n    <meshPhysicalMaterial color="#4488ff" />\n  </mesh>\n  ...\n</group>',
        },
        metrics: {
          components: 71,
          hooks: 5,
          drawCalls: 18,
          outputBytes: 8900,
        },
      },
    ],
  };
}

// =============================================================================
// HELPERS
// =============================================================================

const STATUS_COLORS: Record<StageStatus, string> = {
  pending: 'text-studio-muted bg-studio-panel/30',
  running: 'text-studio-accent bg-studio-accent/10 animate-pulse',
  success: 'text-emerald-400 bg-emerald-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  error: 'text-red-400 bg-red-500/10',
  skipped: 'text-studio-muted/50 bg-studio-panel/10',
};

const STATUS_ICONS: Record<StageStatus, string> = {
  pending: '○',
  running: '◎',
  success: '✓',
  warning: '⚠',
  error: '✗',
  skipped: '—',
};

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-red-400 bg-red-500/10 border-red-500/30',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
};

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CompilationPipelineVisualizer({
  result: externalResult,
  onStageClick,
  onRecompile,
  className = '',
}: CompilationPipelineVisualizerProps) {
  const [demoResult] = useState(() => createDemoResult());
  const result = externalResult || demoResult;
  const [expandedStage, setExpandedStage] = useState<PipelineStageId | null>(null);
  const [showIR, setShowIR] = useState(false);

  const toggleStage = useCallback(
    (id: PipelineStageId) => {
      setExpandedStage((prev) => (prev === id ? null : id));
      const stage = result.stages.find((s) => s.id === id);
      if (stage) onStageClick?.(stage);
    },
    [result.stages, onStageClick]
  );

  const totalErrors = useMemo(
    () => result.stages.reduce((sum, s) => sum + s.errors.filter((e) => e.severity === 'error').length, 0),
    [result.stages]
  );
  const totalWarnings = useMemo(
    () => result.stages.reduce((sum, s) => sum + s.errors.filter((e) => e.severity === 'warning').length, 0),
    [result.stages]
  );

  return (
    <div className={`p-3 space-y-3 text-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔧 Compilation Pipeline</h3>
        <span className="text-[10px] text-studio-muted">
          {result.totalDurationMs.toFixed(1)}ms · {result.targetFormat}
        </span>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-studio-muted">{result.sourceFile}</span>
        <span className="text-studio-muted">→</span>
        <span className="text-studio-text font-medium">{result.targetFormat}</span>
        <span className="flex-1" />
        {result.success ? (
          <span className="text-emerald-400">Success</span>
        ) : (
          <span className="text-red-400">Failed</span>
        )}
        {totalWarnings > 0 && <span className="text-amber-400">{totalWarnings} warnings</span>}
        {totalErrors > 0 && <span className="text-red-400">{totalErrors} errors</span>}
      </div>

      {/* Pipeline stages */}
      <div className="space-y-0">
        {result.stages.map((stage, idx) => (
          <div key={stage.id}>
            {/* Connector line */}
            {idx > 0 && (
              <div className="flex items-center justify-center py-0.5">
                <div className="w-px h-3 bg-studio-muted/20" />
              </div>
            )}

            {/* Stage card */}
            <div
              onClick={() => toggleStage(stage.id)}
              className={`
                rounded-lg px-3 py-2 cursor-pointer transition-all
                ${STATUS_COLORS[stage.status]}
                ${expandedStage === stage.id ? 'ring-1 ring-studio-accent/40' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{stage.icon}</span>
                  <div>
                    <div className="text-[11px] font-medium">{stage.name}</div>
                    <div className="text-[9px] opacity-70">{stage.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-mono">{stage.durationMs.toFixed(1)}ms</span>
                  <span>{STATUS_ICONS[stage.status]}</span>
                </div>
              </div>

              {/* Timing bar */}
              <div className="mt-1.5 h-1 bg-black/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    stage.status === 'error' ? 'bg-red-400' : stage.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${(stage.durationMs / result.totalDurationMs) * 100}%` }}
                />
              </div>
            </div>

            {/* Expanded stage detail */}
            {expandedStage === stage.id && (
              <div className="ml-4 mt-1 space-y-1.5 border-l-2 border-studio-accent/20 pl-3 py-1">
                {/* Metrics */}
                <div className="grid grid-cols-4 gap-1">
                  {Object.entries(stage.metrics).map(([key, value]) => (
                    <div key={key} className="bg-studio-panel/30 rounded px-1.5 py-1 text-center">
                      <div className="text-studio-text font-mono text-[10px]">{value}</div>
                      <div className="text-studio-muted text-[8px] capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                    </div>
                  ))}
                </div>

                {/* IR snapshot */}
                {stage.outputIR && (
                  <div className="space-y-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowIR((prev) => !prev); }}
                      className="text-[10px] text-studio-accent hover:underline"
                    >
                      {showIR ? '▼' : '▶'} {stage.outputIR.format} ({stage.outputIR.nodeCount} nodes, {formatBytes(stage.outputIR.sizeBytes)})
                    </button>
                    {showIR && (
                      <pre className="bg-black/30 rounded p-2 text-[9px] text-studio-text/80 font-mono overflow-x-auto max-h-[120px] whitespace-pre-wrap">
                        {stage.outputIR.preview}
                      </pre>
                    )}
                  </div>
                )}

                {/* Errors */}
                {stage.errors.length > 0 && (
                  <div className="space-y-0.5">
                    {stage.errors.map((err, i) => (
                      <div
                        key={i}
                        className={`rounded px-2 py-1 text-[10px] border ${SEVERITY_COLORS[err.severity]}`}
                      >
                        <div className="flex items-center gap-1">
                          {err.line && (
                            <span className="font-mono opacity-70">
                              L{err.line}{err.column ? `:${err.column}` : ''}
                            </span>
                          )}
                          <span>{err.message}</span>
                        </div>
                        {err.source && (
                          <pre className="mt-0.5 font-mono text-[9px] opacity-60">{err.source}</pre>
                        )}
                        {err.suggestion && (
                          <div className="mt-0.5 text-[9px] opacity-80 italic">{err.suggestion}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex gap-1.5">
        {onRecompile && (
          <button
            onClick={onRecompile}
            className="flex-1 px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
          >
            ↻ Recompile
          </button>
        )}
        <button
          onClick={() => setExpandedStage(null)}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          Collapse All
        </button>
      </div>
    </div>
  );
}

export default CompilationPipelineVisualizer;
