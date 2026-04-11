import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ThermalSolver,
  ThermalConfig,
  StructuralSolver,
  StructuralConfig,
  HydraulicSolver,
  HydraulicConfig,
} from '@holoscript/engine/simulation';

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

    // Step or solve the physics solver
    if (type === 'thermal') {
      (solver as ThermalSolver).step(delta);
    } else if (type === 'structural') {
      (solver as StructuralSolver).solve();
    } else if (type === 'hydraulic') {
      (solver as HydraulicSolver).solve();
    }

    // Extract the primary scalar field output
    let currentField: Float32Array | null = null;
    if (type === 'thermal') {
      currentField = (solver as ThermalSolver).getTemperatureField();
    } else if (type === 'structural') {
      currentField = (solver as StructuralSolver).getVonMisesStress();
    } else if (type === 'hydraulic') {
      currentField = (solver as HydraulicSolver).getPressureField();
    }

    // Optionally trigger a re-render. Since Float32Array might be updated in-place,
    // we may pass the reference, but React state compares by reference. 
    // Usually R3F components use references inside useFrame to avoid React updates,
    // but the spec required: "useState() -> scalarField Float32Array"
    setScalarField(currentField);
  });

  return (
    <SimulationContext.Provider value={{ solver: solverRef.current, scalarField, type }}>
      {children}
    </SimulationContext.Provider>
  );
};
