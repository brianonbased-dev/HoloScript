import { useContext } from 'react';
import { SimulationContext, SimulationContextValue } from '../components/SimulationProvider';

/**
 * Access the active simulation solver and its scalar field output.
 * Must be called within a `<SimulationProvider>`.
 *
 * @returns solver instance, current scalar field (Float32Array), and simulation type
 */
export function useSimulationField(): SimulationContextValue {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulationField must be used within a <SimulationProvider>');
  }
  return context;
}
