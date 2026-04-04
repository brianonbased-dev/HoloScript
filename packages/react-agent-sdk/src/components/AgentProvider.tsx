/**
 * @hololand/react-agent-sdk - AgentProvider Component
 *
 * Context provider for agent configuration
 */

import React from 'react';
import { AgentContext } from '../context/AgentContext';
import type { AgentProviderProps } from '../types';

/**
 * AgentProvider Component
 *
 * Provides agent configuration context to child components
 *
 * @example
 * ```tsx
 * <AgentProvider config={{
 *   apiUrl: 'https://api.example.com',
 *   token: 'your-auth-token',
 *   circuitBreaker: {
 *     threshold: 0.5,
 *     timeout: 60000,
 *   }
 * }}>
 *   <App />
 * </AgentProvider>
 * ```
 */
export function AgentProvider({ children, config = {} }: AgentProviderProps): React.JSX.Element {
  const contextValue = {
    apiUrl: config.apiUrl || 'http://localhost:3000',
    defaultTimeout: config.defaultTimeout || 30000,
    enableDegradedMode: config.enableDegradedMode !== false,
    circuitBreaker: config.circuitBreaker || {
      threshold: 0.5,
      timeout: 60000,
      windowSize: 100,
      minimumRequests: 10,
    },
    headers: config.headers,
    token: config.token,
  };

  return <AgentContext.Provider value={contextValue}>{children}</AgentContext.Provider>;
}
