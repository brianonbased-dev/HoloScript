import React, { createContext, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ThermalSolver,
  ThermalConfig,
  StructuralSolver,
  StructuralConfig,
  HydraulicSolver,
  HydraulicConfig,
  registerSimulationSolvers,
} from '@holoscript/engine/simulation';
import { SimulationSolverFactory } from '@holoscript/core/traits';

type SimulationType = 'thermal' | 'structural' | 'hydraulic';
type AnySolver = ThermalSolver | StructuralSolver | HydraulicSolver;

export interface SimulationProviderProps {
  type: SimulationType;
  config: ThermalConfig | StructuralConfig | HydraulicConfig;
  children?: React.ReactNode;
}

export interface SimulationContextValue {
  solver: AnySolver | null;
  scalarField: Float32Array | null;
  type: SimulationType;
}

export const SimulationContext = createContext<SimulationContextValue>({
  solver: null,
  scalarField: null,
  type: 'thermal',
});

export const SimulationProvider: React.FC<SimulationProviderProps> = ({ type, config, children }) => {
  const solverRef = useRef<AnySolver | null>(null);
  const [scalarField, setScalarField] = useState<Float32Array | null>(null);

  useEffect(() => {
    // Ensure trait handlers can instantiate solvers via the factory
    registerSimulationSolvers(SimulationSolverFactory);

    let solver: AnySolver | null = null;

    // Initialize corresponding solver
    if (type === 'thermal') {
      solver = new ThermalSolver(config as ThermalConfig);
    } else if (type === 'structural') {
      solver = new StructuralSolver(config as StructuralConfig);
    } else if (type === 'hydraulic') {
      solver = new HydraulicSolver(config as HydraulicConfig);
    }

    solverRef.current = solver;

    // Steady-state solvers: solve once on init (not every frame)
    if (solver && type === 'structural') {
      (solver as StructuralSolver).solve();
      setScalarField((solver as StructuralSolver).getVonMisesStress());
    } else if (solver && type === 'hydraulic') {
      (solver as HydraulicSolver).solve();
      setScalarField((solver as HydraulicSolver).getPressureField());
    }

    return () => {
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
    <SimulationContext.Provider value={{ solver: solverRef.current, scalarField, type }}>
      {children}
    </SimulationContext.Provider>
  );
};
