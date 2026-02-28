/**
 * @hololand/react-agent-sdk - useAgent Hook
 *
 * Initialize and manage agent instances with identity and RBAC
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentResponse } from '@holoscript/core/agents';
import type { UseAgentConfig, UseAgentReturn, TaskParams, TaskResult } from '../types';
import { useAgentContext } from '../context/AgentContext';
import { CircuitBreaker, ExponentialBackoff } from '../utils';

/**
 * Agent instance manager
 */
class AgentInstance {
  private eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  private circuitBreaker: CircuitBreaker;
  private backoff: ExponentialBackoff;
  private config: UseAgentConfig;

  constructor(
    public agentName: string,
    config: UseAgentConfig,
    circuitBreakerConfig?: { threshold: number; timeout: number; windowSize: number; minimumRequests: number }
  ) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.backoff = new ExponentialBackoff(
      config.reconnectDelay || 1000,
      60000,
      config.maxReconnectAttempts || 5
    );
  }

  /**
   * Send message to agent
   */
  async sendMessage(action: string, payload: unknown): Promise<AgentResponse> {
    return this.circuitBreaker.execute(async () => {
      // Simulate API call - replace with actual implementation
      const response = await fetch(`/api/agents/${this.agentName}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });

      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.statusText}`);
      }

      return response.json();
    });
  }

  /**
   * Execute task
   */
  async executeTask<T = unknown>(
    taskName: string,
    params?: TaskParams
  ): Promise<TaskResult<T>> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = Date.now();

    try {
      const result = await this.circuitBreaker.execute(async () => {
        // Simulate API call - replace with actual implementation
        const response = await fetch(`/api/agents/${this.agentName}/tasks/${taskName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, ...params }),
        });

        if (!response.ok) {
          throw new Error(`Task execution failed: ${response.statusText}`);
        }

        return response.json();
      });

      return {
        taskId,
        status: 'success',
        data: result as T,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
        retryCount: 0,
      };
    } catch (error) {
      return {
        taskId,
        status: 'error',
        error: error as Error,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
        retryCount: 0,
      };
    }
  }

  /**
   * Get agent state
   */
  getState(): unknown {
    return {
      agentName: this.agentName,
      config: this.config,
      circuitBreakerStatus: this.circuitBreaker.getStatus(),
    };
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (...args: unknown[]) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit event
   */
  emit(event: string, ...args: unknown[]): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(...args));
  }
}

/**
 * useAgent Hook
 *
 * Initialize and manage agent instance with identity and RBAC
 *
 * @param agentName - Name of the agent to initialize
 * @param config - Agent configuration
 * @returns Agent instance with methods and connection status
 *
 * @example
 * ```tsx
 * const { agent, status, error } = useAgent('brittney', {
 *   enableCircuitBreaker: true,
 *   autoReconnect: true,
 * });
 *
 * // Send message
 * const response = await agent.sendMessage('analyze', { data: [...] });
 * ```
 */
export function useAgent(
  agentName: string,
  config: UseAgentConfig = {}
): UseAgentReturn {
  const context = useAgentContext();
  const [status, setStatus] = useState<UseAgentReturn['status']>('connecting');
  const [error, setError] = useState<Error>();
  const agentRef = useRef<AgentInstance>();

  // Initialize agent instance
  useEffect(() => {
    const agent = new AgentInstance(
      agentName,
      config,
      config.enableCircuitBreaker ? context.circuitBreaker : undefined
    );
    agentRef.current = agent;

    // Simulate connection
    const connectTimer = setTimeout(() => {
      setStatus('connected');
    }, 100);

    return () => {
      clearTimeout(connectTimer);
    };
  }, [agentName, config, context.circuitBreaker]);

  /**
   * Reconnect to agent
   */
  const reconnect = useCallback(() => {
    setStatus('connecting');
    setError(undefined);

    // Simulate reconnection
    setTimeout(() => {
      setStatus('connected');
    }, 1000);
  }, []);

  return {
    agent: {
      sendMessage: async (action: string, payload: unknown) => {
        if (!agentRef.current) {
          throw new Error('Agent not initialized');
        }
        return agentRef.current.sendMessage(action, payload);
      },
      executeTask: async <T = unknown>(taskName: string, params?: TaskParams) => {
        if (!agentRef.current) {
          throw new Error('Agent not initialized');
        }
        return agentRef.current.executeTask<T>(taskName, params);
      },
      getState: () => {
        if (!agentRef.current) {
          throw new Error('Agent not initialized');
        }
        return agentRef.current.getState();
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (!agentRef.current) {
          throw new Error('Agent not initialized');
        }
        return agentRef.current.on(event, handler);
      },
    },
    status,
    error,
    reconnect,
  };
}
