/**
 * @hololand/react-agent-sdk - Agent Context
 *
 * React context for agent configuration and state
 */

import { createContext, useContext } from 'react';
import type { AgentContextValue } from '../types';

/**
 * Default context value
 */
const defaultContextValue: AgentContextValue = {
  apiUrl: 'http://localhost:3000',
  defaultTimeout: 30000,
  enableDegradedMode: true,
  circuitBreaker: {
    threshold: 0.5,
    timeout: 60000,
    windowSize: 100,
    minimumRequests: 10,
  },
};

/**
 * Agent Context
 */
export const AgentContext = createContext<AgentContextValue>(defaultContextValue);

/**
 * Hook to use agent context
 */
export function useAgentContext(): AgentContextValue {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentContext must be used within an AgentProvider');
  }
  return context;
}
