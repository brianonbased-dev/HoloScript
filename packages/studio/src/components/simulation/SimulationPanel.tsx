'use client';

/**
 * SimulationPanel — Studio UI for finite element simulation.
 *
 * Workflow: Configure mesh → Apply constraints → Apply loads → Solve → See colors.
 *
 * Uses AutoMesher for mesh generation, StructuralSolverTET10 for GPU solving,
 * and SimResultsMesh for real-time visualization. No VTK files, no ParaView —
 * everything happens in-browser.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Zap, X, Play, RotateCcw, Box, Lock, ArrowDown, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/lib/stores';
import { useHistoryStore } from '@/lib/historyStore';
import { type ColormapName } from '@holoscript/r3f-renderer';

interface SimulationPanelProps {
  onClose: () => void;
}

type SolveStatus = 'idle' | 'meshing' | 'solving' | 'done' | 'error';

interface SimConfig {
  // Geometry
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  divisions: number;
  // Material
  youngsModulus: number; // Pa
  poissonRatio: number;
  yieldStrength: number; // Pa
  density: number; // kg/m³
  // Constraints
  fixedFace: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  // Loads
  loadFace: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  loadForceX: number;
  loadForceY: number;
  loadForceZ: number;
  // Visualization
  colormap: ColormapName;
  displacementScale: number;
  wireframe: boolean;
  useGpuBuffers: boolean;
  autoSolveOnPause: boolean;
  autoSolveDelayMs: number;
}

export interface SimulationInputConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  divisions: number;
  youngsModulus: number;
  poissonRatio: number;
  yieldStrength: number;
  density: number;
  fixedFace: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  loadFace: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  loadForceX: number;
  loadForceY: number;
  loadForceZ: number;
  useGpuBuffers: boolean;
}

const DEFAULT_CONFIG: SimConfig = {
  sizeX: 1,
  sizeY: 1,
  sizeZ: 10,
  divisions: 4,
  youngsModulus: 200e9, // Steel
  poissonRatio: 0.3,
  yieldStrength: 250e6,
  density: 7850,
  fixedFace: 'z-',
  loadFace: 'z+',
  loadForceX: 0,
  loadForceY: -10000,
  loadForceZ: 0,
  colormap: 'turbo',
  displacementScale: 1.0,
  wireframe: true,
  useGpuBuffers: true,
  autoSolveOnPause: false,
  autoSolveDelayMs: 800,
};

const MATERIAL_PRESETS: Record<string, Partial<SimConfig>> = {
  Steel: { youngsModulus: 200e9, poissonRatio: 0.3, yieldStrength: 250e6, density: 7850 },
  Aluminum: { youngsModulus: 69e9, poissonRatio: 0.33, yieldStrength: 276e6, density: 2700 },
  Concrete: { youngsModulus: 30e9, poissonRatio: 0.2, yieldStrength: 30e6, density: 2400 },
  Wood: { youngsModulus: 12e9, poissonRatio: 0.35, yieldStrength: 40e6, density: 600 },
  Rubber: { youngsModulus: 0.01e9, poissonRatio: 0.49, yieldStrength: 15e6, density: 1200 },
};

const FACES = ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'] as const;

interface SolveResult {
  nodeCount: number;
  elementCount: number;
  maxStress: number;
  minSafety: number;
  solveTimeMs: number;
  converged: boolean;
  iterations: number;
}

export function simulationInputHash(config: SimulationInputConfig): string {
  const input = {
    sizeX: config.sizeX,
    sizeY: config.sizeY,
    sizeZ: config.sizeZ,
    divisions: config.divisions,
    youngsModulus: config.youngsModulus,
    poissonRatio: config.poissonRatio,
    yieldStrength: config.yieldStrength,
    density: config.density,
    fixedFace: config.fixedFace,
    loadFace: config.loadFace,
    loadForceX: config.loadForceX,
    loadForceY: config.loadForceY,
    loadForceZ: config.loadForceZ,
    useGpuBuffers: config.useGpuBuffers,
  };
  return JSON.stringify(input);
}

export function shouldAutoSolve(params: {
  selectedNode: boolean;
  autoSolveOnPause: boolean;
  isDirty: boolean;
  status: SolveStatus;
}): boolean {
  return (
    params.selectedNode &&
    params.autoSolveOnPause &&
    params.isDirty &&
    params.status !== 'meshing' &&
    params.status !== 'solving'
  );
}

export function SimulationPanel({ onClose }: SimulationPanelProps) {
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useHistoryStore((s) => s.nodes);
  const addTrait = useHistoryStore((s) => s.addTrait);
  const setTraitProperty = useHistoryStore((s) => s.setTraitProperty);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedObjectId), [nodes, selectedObjectId]);
  const simulationTrait = selectedNode?.traits.find(t => t.name === 'simulation');

  const config = useMemo(() => {
    if (!simulationTrait) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(simulationTrait.properties as Record<string, unknown>) } as unknown as SimConfig;
  }, [simulationTrait]);

  const traitProps = (simulationTrait?.properties ?? {}) as Record<string, unknown>;
  const explicitDirty = traitProps._solveDirty === true;
  const storedResult = (traitProps._solveResult as SolveResult | undefined) ?? null;
  const storedSolveInputHash = typeof traitProps._solveInputHash === 'string' ? traitProps._solveInputHash : null;
  const lastSolvedAt = typeof traitProps._lastSolvedAt === 'number' ? traitProps._lastSolvedAt : null;
  const currentInputHash = useMemo(() => simulationInputHash(config), [config]);
  const hashMismatchDirty = !!storedSolveInputHash && storedSolveInputHash !== currentInputHash;
  const resultWithoutHashDirty = !!storedResult && !storedSolveInputHash;
  const isDirty = explicitDirty || hashMismatchDirty || resultWithoutHashDirty;
  const [status, setStatus] = useState<SolveStatus>(isDirty ? 'idle' : 'done');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holoCode, setHoloCode] = useState<string | null>(null);
  const autoSolveTimerRef = useRef<number | null>(null);
  const solveRunRef = useRef(0);
  const lastInputHashRef = useRef(currentInputHash);

  // If a user navigates away or undoes past a solve, we reset state visually
  useEffect(() => {
    if (simulationTrait && (simulationTrait.properties as any)._solveVersion) {
      // The visual state could be dirty, consider status sync
    }
  }, [simulationTrait]);

  const invalidatePendingSolve = useCallback(() => {
    if (autoSolveTimerRef.current !== null) {
      window.clearTimeout(autoSolveTimerRef.current);
      autoSolveTimerRef.current = null;
    }
    solveRunRef.current += 1;
  }, []);

  const updateConfig = useCallback((patch: Partial<SimConfig>) => {
    invalidatePendingSolve();

    if (!selectedNode) {
      // Fallback for if nothing is selected.
      return;
    }

    if (!simulationTrait) {
      addTrait(selectedNode.id, {
        name: 'simulation',
        properties: { ...DEFAULT_CONFIG, ...patch, _solveDirty: true }
      });
      return;
    }

    Object.entries(patch).forEach(([key, value]) => {
      setTraitProperty(selectedNode.id, 'simulation', key, value);
    });
    setTraitProperty(selectedNode.id, 'simulation', '_solveDirty', true);
    setStatus('idle'); // configuration changed, solver is dirty
  }, [selectedNode, simulationTrait, addTrait, setTraitProperty, invalidatePendingSolve]);

  const applyPreset = useCallback((name: string) => {
    const preset = MATERIAL_PRESETS[name];
    if (preset) updateConfig(preset);
  }, [updateConfig]);

  const runSimulation = useCallback(async () => {
    const runId = ++solveRunRef.current;
    setStatus('meshing');
    setError(null);
    setResult(null);

    try {
      // Dynamic import to avoid bundling engine in Studio unless needed
      const {
        meshBox,
        findNodesOnFace,
        StructuralSolverTET10,
        tet4ToTet10,
        youngsModulus,
        poissonRatio,
        yieldStrength,
        density,
        force,
      } = await import('@holoscript/engine/simulation');

      if (runId !== solveRunRef.current) return;

      const mesh = meshBox({
        size: [config.sizeX, config.sizeY, config.sizeZ],
        divisions: [config.divisions, config.divisions, Math.max(config.divisions, Math.round(config.divisions * config.sizeZ / config.sizeX))],
      });

      const tet10 = tet4ToTet10(mesh.vertices, mesh.tetrahedra);

      const fixedNodes = findNodesOnFace(mesh, config.fixedFace);
      const loadNodes = findNodesOnFace(mesh, config.loadFace);
      const forcePerNode: [number, number, number] = [
        config.loadForceX / loadNodes.length,
        config.loadForceY / loadNodes.length,
        config.loadForceZ / loadNodes.length,
      ];

      setStatus('solving');

      const solver = new StructuralSolverTET10({
        vertices: tet10.vertices,
        tetrahedra: tet10.tetrahedra,
        material: {
          youngs_modulus: youngsModulus(config.youngsModulus),
          poisson_ratio: poissonRatio(config.poissonRatio),
          yield_strength: yieldStrength(config.yieldStrength),
          density: density(config.density),
        },
        constraints: [{ id: 'fix', type: 'fixed', nodes: fixedNodes }],
        loads: loadNodes.map((n, i) => ({
          id: `load_${i}`,
          type: 'point' as const,
          nodeIndex: n,
          force: [force(forcePerNode[0]), force(forcePerNode[1]), force(forcePerNode[2])],
        })),
        maxIterations: 5000,
        tolerance: 1e-10,
        useGPU: config.useGpuBuffers,
      });

      const solveResult = await solver.solve();
      if (runId !== solveRunRef.current) {
        solver.dispose();
        return;
      }

      const stats = solver.getStats();

      setResult({
        nodeCount: stats.nodeCount,
        elementCount: stats.elementCount,
        maxStress: stats.maxVonMises,
        minSafety: stats.minSafetyFactor,
        solveTimeMs: stats.solveTimeMs,
        converged: solveResult.converged,
        iterations: solveResult.iterations,
      });

      // Generate HoloScript code for the simulation
      setHoloCode(`object SimBeam {
  @mesh { type: "tet10", size: [${config.sizeX}, ${config.sizeY}, ${config.sizeZ}], divisions: ${config.divisions} }
  @material { E: ${config.youngsModulus}, nu: ${config.poissonRatio}, Sy: ${config.yieldStrength}, rho: ${config.density} }
  @constraint { face: "${config.fixedFace}", type: "fixed" }
  @load { face: "${config.loadFace}", force: [${config.loadForceX}, ${config.loadForceY}, ${config.loadForceZ}] }
  @solve { type: "structural-tet10", colormap: "${config.colormap}", use_gpu_buffers: ${config.useGpuBuffers} }
}`);

      if (selectedNode) {
        const finalResult: SolveResult = {
          nodeCount: stats.nodeCount,
          elementCount: stats.elementCount,
          maxStress: stats.maxVonMises,
          minSafety: stats.minSafetyFactor,
          solveTimeMs: stats.solveTimeMs,
          converged: solveResult.converged,
          iterations: solveResult.iterations,
        };
        setTraitProperty(selectedNode.id, 'simulation', '_solveDirty', false);
        setTraitProperty(selectedNode.id, 'simulation', '_solveVersion', Date.now());
        setTraitProperty(selectedNode.id, 'simulation', '_lastSolvedAt', Date.now());
        setTraitProperty(selectedNode.id, 'simulation', '_solveInputHash', simulationInputHash(config));
        setTraitProperty(selectedNode.id, 'simulation', '_solveResult', finalResult);
      }

      solver.dispose();
      setStatus('done');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isNonlinearUnstable = /nonlinear solve failed to converge|failed to converge near load factor|inner linear solve failed/i.test(raw);
      if (isNonlinearUnstable) {
        setError(
          'Nonlinear solve unstable for current setup. Try smaller loads, stronger constraints, finer mesh quality, or disable nonlinear mode for quick iteration.\n\n' +
          `Details: ${raw}`,
        );
      } else {
        setError(raw);
      }
      setStatus('error');
    }
  }, [config, selectedNode, setTraitProperty]);

  // Optional background solve after edit pause (undo/redo friendly)
  useEffect(() => {
    if (autoSolveTimerRef.current !== null) {
      window.clearTimeout(autoSolveTimerRef.current);
      autoSolveTimerRef.current = null;
    }

    if (!shouldAutoSolve({
      selectedNode: !!selectedNode,
      autoSolveOnPause: config.autoSolveOnPause,
      isDirty,
      status,
    })) {
      return;
    }

    autoSolveTimerRef.current = window.setTimeout(() => {
      runSimulation();
    }, Math.max(150, config.autoSolveDelayMs));

    return () => {
      if (autoSolveTimerRef.current !== null) {
        window.clearTimeout(autoSolveTimerRef.current);
        autoSolveTimerRef.current = null;
      }
    };
  }, [config.autoSolveOnPause, config.autoSolveDelayMs, isDirty, status, runSimulation, selectedNode]);

  useEffect(() => {
    if (status === 'done' && isDirty) {
      setStatus('idle');
    }
  }, [status, isDirty]);

  // History scrubbing / undo while solving: invalidate stale in-flight solve
  useEffect(() => {
    const inputChanged = lastInputHashRef.current !== currentInputHash;
    lastInputHashRef.current = currentInputHash;
    if (!inputChanged) return;

    if (status === 'meshing' || status === 'solving') {
      solveRunRef.current += 1;
      setStatus('idle');
    }
  }, [currentInputHash, status]);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setHoloCode(null);
  }, []);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Zap className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold uppercase tracking-wider">Simulation</span>
        <button
          onClick={onClose}
          title="Close simulation panel"
          aria-label="Close simulation panel"
          className="ml-auto rounded p-0.5 hover:bg-studio-surface transition"
        >
          <X className="h-4 w-4 text-studio-muted" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Geometry Section */}
        <Section icon={<Box className="h-3.5 w-3.5" />} title="Geometry">
          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="X" value={config.sizeX} onChange={(v) => updateConfig({ sizeX: v })} min={0.01} step={0.1} />
            <NumberInput label="Y" value={config.sizeY} onChange={(v) => updateConfig({ sizeY: v })} min={0.01} step={0.1} />
            <NumberInput label="Z" value={config.sizeZ} onChange={(v) => updateConfig({ sizeZ: v })} min={0.01} step={0.1} />
          </div>
          <NumberInput label="Divisions" value={config.divisions} onChange={(v) => updateConfig({ divisions: Math.round(v) })} min={1} max={20} step={1} />
        </Section>

        {/* Material Section */}
        <Section icon={<span className="text-[10px]">Fe</span>} title="Material">
          <div className="flex flex-wrap gap-1">
            {Object.keys(MATERIAL_PRESETS).map((name) => (
              <button
                key={name}
                onClick={() => applyPreset(name)}
                className="rounded border border-studio-border px-2 py-0.5 text-[10px] hover:bg-studio-surface hover:border-studio-accent transition"
              >
                {name}
              </button>
            ))}
          </div>
          <NumberInput label="E (GPa)" value={config.youngsModulus / 1e9} onChange={(v) => updateConfig({ youngsModulus: v * 1e9 })} min={0.001} step={1} />
          <NumberInput label="Poisson" value={config.poissonRatio} onChange={(v) => updateConfig({ poissonRatio: v })} min={0} max={0.499} step={0.01} />
        </Section>

        {/* Boundary Conditions */}
        <Section icon={<Lock className="h-3.5 w-3.5" />} title="Constraints">
          <FaceSelect label="Fixed face" value={config.fixedFace} onChange={(v) => updateConfig({ fixedFace: v })} />
        </Section>

        <Section icon={<ArrowDown className="h-3.5 w-3.5" />} title="Loads">
          <FaceSelect label="Load face" value={config.loadFace} onChange={(v) => updateConfig({ loadFace: v })} />
          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="Fx (N)" value={config.loadForceX} onChange={(v) => updateConfig({ loadForceX: v })} step={100} />
            <NumberInput label="Fy (N)" value={config.loadForceY} onChange={(v) => updateConfig({ loadForceY: v })} step={100} />
            <NumberInput label="Fz (N)" value={config.loadForceZ} onChange={(v) => updateConfig({ loadForceZ: v })} step={100} />
          </div>
        </Section>

        <Section icon={<Zap className="h-3.5 w-3.5" />} title="GPU">
          <label className="flex items-center justify-between rounded border border-studio-border bg-[#0d0d14] px-2 py-1.5 text-[11px]">
            <span className="text-studio-muted">USE_GPU_BUFFERS</span>
            <input
              type="checkbox"
              checked={config.useGpuBuffers}
              onChange={(e) => updateConfig({ useGpuBuffers: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--studio-accent)]"
            />
          </label>
          <p className="text-[10px] text-studio-muted">
            Uses GPU CG + storage-buffer displacement interop when WebGPU is available.
          </p>
        </Section>

        <Section icon={<Play className="h-3.5 w-3.5" />} title="Solve Behavior">
          <label className="flex items-center justify-between rounded border border-studio-border bg-[#0d0d14] px-2 py-1.5 text-[11px]">
            <span className="text-studio-muted">Auto-solve on pause</span>
            <input
              type="checkbox"
              checked={config.autoSolveOnPause}
              onChange={(e) => updateConfig({ autoSolveOnPause: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--studio-accent)]"
            />
          </label>
          <NumberInput
            label="Auto-solve delay (ms)"
            value={config.autoSolveDelayMs}
            onChange={(v) => updateConfig({ autoSolveDelayMs: Math.round(v) })}
            min={150}
            max={5000}
            step={50}
          />
          <p className="text-[10px] text-studio-muted">
            Default is manual solve. Enable to re-solve in the background after undo/redo or edits settle.
          </p>
        </Section>

        {/* Results */}
        {(result || storedResult) && (
          <Section icon={<Zap className="h-3.5 w-3.5 text-green-400" />} title="Results">
            <div className={`space-y-1 text-[11px] relative transition-all duration-300 ${isDirty ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
              {isDirty && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="bg-red-500/10 border border-red-500/30 text-red-500 font-bold px-2 py-1 rounded backdrop-blur-sm -rotate-6 shadow-xl uppercase tracking-wider text-[10px]">
                    Stale / Dirty
                  </div>
                </div>
              )}
              {(() => {
                const r = result || storedResult!;
                return (
                  <>
                    <ResultRow label="Nodes" value={r.nodeCount.toLocaleString()} />
                    <ResultRow label="Elements" value={r.elementCount.toLocaleString()} />
                    <ResultRow label="Converged" value={r.converged ? `Yes (${r.iterations} iter)` : 'No'} ok={r.converged} />
                    <ResultRow label="Max Stress" value={`${(r.maxStress / 1e6).toFixed(1)} MPa`} />
                    <ResultRow label="Safety Factor" value={r.minSafety.toFixed(2)} ok={r.minSafety > 1} />
                    <ResultRow label="Solve Time" value={`${r.solveTimeMs.toFixed(0)} ms`} />
                    <ResultRow
                      label="Last Solved"
                      value={lastSolvedAt ? new Date(lastSolvedAt).toLocaleTimeString() : 'Never'}
                    />
                    <ResultRow
                      label="Input Match"
                      value={isDirty ? 'No' : 'Yes'}
                      ok={!isDirty}
                    />
                  </>
                );
              })()}
            </div>
          </Section>
        )}

        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {holoCode && (
          <Section icon={<span className="text-[10px] font-mono">.hs</span>} title="HoloScript">
            <pre className="rounded bg-studio-surface p-2 text-[10px] font-mono text-studio-muted overflow-x-auto whitespace-pre">
              {holoCode}
            </pre>
          </Section>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-studio-border p-3 space-y-2">
        {isDirty && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
            Results are stale. {config.autoSolveOnPause ? `Auto-solving after ${config.autoSolveDelayMs} ms idle.` : 'Press Solve to refresh.'}
          </div>
        )}
        <button
          onClick={status === 'idle' || status === 'done' || status === 'error' ? runSimulation : reset}
          disabled={status === 'meshing' || status === 'solving'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-studio-accent py-2.5 text-sm font-semibold text-white hover:brightness-110 transition disabled:opacity-50"
        >
          {status === 'meshing' && <><Loader2 className="h-4 w-4 animate-spin" /> Meshing...</>}
          {status === 'solving' && <><Loader2 className="h-4 w-4 animate-spin" /> Solving...</>}
          {(status === 'idle' || status === 'error') && !isDirty && <><Play className="h-4 w-4" /> Run Simulation</>}
          {(status === 'idle' || status === 'error' || status === 'done') && isDirty && <><RotateCcw className="h-4 w-4" /> Re-solve Required</>}
          {status === 'done' && !isDirty && <><RotateCcw className="h-4 w-4" /> Re-run Simulation</>}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-studio-border bg-studio-surface p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-studio-muted uppercase tracking-wider">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-studio-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full rounded border border-studio-border bg-[#0d0d14] px-2 py-1 text-[11px] text-studio-text focus:border-studio-accent focus:outline-none transition"
      />
    </label>
  );
}

function FaceSelect({ label, value, onChange }: {
  label: string; value: string; onChange: (v: typeof FACES[number]) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] text-studio-muted w-20">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as typeof FACES[number])}
        className="flex-1 rounded border border-studio-border bg-[#0d0d14] px-2 py-1 text-[11px] text-studio-text focus:border-studio-accent focus:outline-none"
      >
        {FACES.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
    </label>
  );
}

function ResultRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-studio-muted">{label}</span>
      <span className={ok === undefined ? '' : ok ? 'text-green-400' : 'text-red-400'}>{value}</span>
    </div>
  );
}
