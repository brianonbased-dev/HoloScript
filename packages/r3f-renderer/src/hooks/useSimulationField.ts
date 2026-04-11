import { useContext } from 'react';
import { SimulationContext, SimulationContextValue } from '../components/SimulationProvider';

export function useSimulationField(): SimulationContextValue {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulationField must be used within a <SimulationProvider>');
  }
  return context;
}
