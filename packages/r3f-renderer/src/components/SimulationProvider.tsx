import React, { createContext, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ThermalSolver,
  ThermalConfig,
  StructuralSolver,
  StructuralConfig,
  StructuralSolverTET10,
  TET10Config,
  HydraulicSolver,
  HydraulicConfig,
  registerSimulationSolvers,
} from '@holoscript/engine/simulation';
import { SimulationSolverFactory } from '@holoscript/core/traits';

type SimulationType = 'thermal' | 'structural' | 'structural-tet10' | 'hydraulic';
type AnySolver = ThermalSolver | StructuralSolver | StructuralSolverTET10 | HydraulicSolver;

export interface SimulationProviderProps {
  type: SimulationType;
  config: ThermalConfig | StructuralConfig | TET10Config | HydraulicConfig;
  children?: React.ReactNode;
}

export interface SimulationContextValue {
  solver: AnySolver | null;
  scalarField: Float32Array | Float64Array | null;
  /** Per-node displacements (structural solvers only) */
  displacements: Float32Array | Float64Array | null;
  /** Direct GPU buffer for displacements (zero-copy) */
  displacementBuffer: any | null; // GPUBuffer
  type: SimulationType;
  /** Whether the solver is currently computing */
  solving: boolean;
}

export const SimulationContext = createContext<SimulationContextValue>({
  solver: null,
  scalarField: null,
  displacements: null,
  displacementBuffer: null,
  type: 'thermal',
  solving: false,
});

export const SimulationProvider: React.FC<SimulationProviderProps> = ({ type, config, children }) => {
  const solverRef = useRef<AnySolver | null>(null);
  const [scalarField, setScalarField] = useState<Float32Array | Float64Array | null>(null);
  const [displacements, setDisplacements] = useState<Float32Array | Float64Array | null>(null);
  const [displacementBuffer, setDisplacementBuffer] = useState<any | null>(null);
  const [solving, setSolving] = useState(false);

  useEffect(() => {
    // Ensure trait handlers can instantiate solvers via the factory
    registerSimulationSolvers(SimulationSolverFactory);

    let solver: AnySolver | null = null;
    let cancelled = false;

    // Initialize corresponding solver
    if (type === 'thermal') {
      solver = new ThermalSolver(config as ThermalConfig);
    } else if (type === 'structural') {
      solver = new StructuralSolver(config as StructuralConfig);
    } else if (type === 'structural-tet10') {
      solver = new StructuralSolverTET10(config as TET10Config);
    } else if (type === 'hydraulic') {
      solver = new HydraulicSolver(config as HydraulicConfig);
    }

    solverRef.current = solver;

    // Steady-state solvers: solve once on init
    if (solver && type === 'structural') {
      (solver as StructuralSolver).solve();
      setScalarField((solver as StructuralSolver).getVonMisesStress());
      setDisplacements((solver as StructuralSolver).getDisplacements());
    } else if (solver && type === 'structural-tet10') {
      // TET10 solve is async (GPU path)
      setSolving(true);
      const tet10 = solver as StructuralSolverTET10;
      tet10.solve().then(() => {
        if (cancelled) return;
        setScalarField(tet10.getVonMisesStress());
        setDisplacements(tet10.getDisplacements());
        setDisplacementBuffer(tet10.getDisplacementBuffer());
        setSolving(false);
      }).catch(() => {
        if (cancelled) return;
        // GPU unavailable — fallback to CPU solve
        tet10.solveCPU();
        setScalarField(tet10.getVonMisesStress());
        setDisplacements(tet10.getDisplacements());
        setDisplacementBuffer(null);
        setSolving(false);
      });
    } else if (solver && type === 'hydraulic') {
      (solver as HydraulicSolver).solve();
      setScalarField((solver as HydraulicSolver).getPressureField());
    }

    return () => {
      cancelled = true;
      if (solver && typeof solver.dispose === 'function') {
        solver.dispose();
      }
      solverRef.current = null;
    };
  }, [type, config]);

  useFrame((_state, delta) => {
    const solver = solverRef.current;
    if (!solver) return;

    // Only time-dependent solvers step every frame
    if (type === 'thermal') {
      (solver as ThermalSolver).step(delta);
      setScalarField((solver as ThermalSolver).getTemperatureField());
    }
    // Structural/hydraulic are steady-state — solved once in useEffect.
    // Re-solve only when config changes (triggers new useEffect).
  });

  return (
    <SimulationContext.Provider value={{ solver: solverRef.current, scalarField, displacements, displacementBuffer, type, solving }}>
      {children}
    </SimulationContext.Provider>
  );
};
