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

import { useState, useCallback } from 'react';
import { Zap, X, Play, RotateCcw, Box, Lock, ArrowDown, Loader2 } from 'lucide-react';

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
  colormap: 'turbo' | 'viridis' | 'jet' | 'inferno' | 'coolwarm';
  displacementScale: number;
  wireframe: boolean;
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
  displacementScale: 100,
  wireframe: false,
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

export function SimulationPanel({ onClose }: SimulationPanelProps) {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<SolveStatus>('idle');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holoCode, setHoloCode] = useState<string | null>(null);

  const updateConfig = useCallback((patch: Partial<SimConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyPreset = useCallback((name: string) => {
    const preset = MATERIAL_PRESETS[name];
    if (preset) updateConfig(preset);
  }, [updateConfig]);

  const runSimulation = useCallback(async () => {
    setStatus('meshing');
    setError(null);
    setResult(null);

    try {
      // Dynamic import to avoid bundling engine in Studio unless needed
      const { meshBox, findNodesOnFace } = await import('@holoscript/engine/simulation');
      const { StructuralSolverTET10, tet4ToTet10 } = await import('@holoscript/engine/simulation');

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
          youngs_modulus: config.youngsModulus,
          poisson_ratio: config.poissonRatio,
          yield_strength: config.yieldStrength,
          density: config.density,
        },
        constraints: [{ id: 'fix', type: 'fixed', nodes: fixedNodes }],
        loads: loadNodes.map((n, i) => ({
          id: `load_${i}`,
          type: 'point' as const,
          nodeIndex: n,
          force: forcePerNode,
        })),
        maxIterations: 5000,
        tolerance: 1e-10,
        useGPU: false, // CPU for now — GPU requires browser WebGPU
      });

      const solveResult = solver.solveCPU();
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
  @solve { type: "structural-tet10", colormap: "${config.colormap}" }
}`);

      solver.dispose();
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [config]);

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
        <button onClick={onClose} className="ml-auto rounded p-0.5 hover:bg-studio-surface transition">
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

        {/* Results */}
        {result && (
          <Section icon={<Zap className="h-3.5 w-3.5 text-green-400" />} title="Results">
            <div className="space-y-1 text-[11px]">
              <ResultRow label="Nodes" value={result.nodeCount.toLocaleString()} />
              <ResultRow label="Elements" value={result.elementCount.toLocaleString()} />
              <ResultRow label="Converged" value={result.converged ? `Yes (${result.iterations} iter)` : 'No'} ok={result.converged} />
              <ResultRow label="Max Stress" value={`${(result.maxStress / 1e6).toFixed(1)} MPa`} />
              <ResultRow label="Safety Factor" value={result.minSafety.toFixed(2)} ok={result.minSafety > 1} />
              <ResultRow label="Solve Time" value={`${result.solveTimeMs.toFixed(0)} ms`} />
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
        <button
          onClick={status === 'idle' || status === 'done' || status === 'error' ? runSimulation : reset}
          disabled={status === 'meshing' || status === 'solving'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-studio-accent py-2.5 text-sm font-semibold text-white hover:brightness-110 transition disabled:opacity-50"
        >
          {status === 'meshing' && <><Loader2 className="h-4 w-4 animate-spin" /> Meshing...</>}
          {status === 'solving' && <><Loader2 className="h-4 w-4 animate-spin" /> Solving...</>}
          {(status === 'idle' || status === 'error') && <><Play className="h-4 w-4" /> Run Simulation</>}
          {status === 'done' && <><RotateCcw className="h-4 w-4" /> Re-run</>}
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
