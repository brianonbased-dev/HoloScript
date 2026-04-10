/**
 * Circuit Breaker Strategy
 *
 * Protects against cascading failures by temporarily blocking requests
 * to failing services after repeated failures.
 */

import type {
  IRecoveryStrategy,
  IAgentFailure,
  IRecoveryResult,
  FailureType,
} from '../../extensions';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening
  resetTimeoutMs: number; // Time before trying half-open
  halfOpenMaxAttempts: number; // Attempts in half-open before closing
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
};

/**
 * Circuit breaker to prevent repeated calls to failing services
 */
export class CircuitBreakerStrategy implements IRecoveryStrategy {
  readonly id = 'circuit-breaker';
  readonly handles: FailureType[] = [
    'network-timeout',
    'api-rate-limit',
    'ai-service-error',
    'dependency-error',
  ];
  readonly maxAttempts = 1; // Circuit breaker only tries once
  readonly backoffMs = 0; // No initial backoff (circuit handles timing)

  private config: CircuitBreakerConfig;
  private circuits: Map<string, CircuitInfo> = new Map();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if this strategy handles the failure
   */
  matches(failure: IAgentFailure): boolean {
    return this.handles.includes(failure.errorType);
  }

  /**
   * Execute circuit breaker logic
   */
  async execute(failure: IAgentFailure): Promise<IRecoveryResult> {
    const circuitKey = this.getCircuitKey(failure);
    const circuit = this.getOrCreateCircuit(circuitKey);

    switch (circuit.state) {
      case 'open':
        // Check if it's time to try half-open
        if (Date.now() - circuit.lastFailureTime >= this.config.resetTimeoutMs) {
          this.transitionToHalfOpen(circuit);
          return this.handleHalfOpen(circuit, failure);
        }
        return {
          success: false,
          strategyUsed: this.id,
          message: `Circuit open - blocking requests until ${new Date(circuit.lastFailureTime + this.config.resetTimeoutMs).toISOString()}`,
          retryRecommended: false,
          nextAction: 'skip',
        };

      case 'half-open':
        return this.handleHalfOpen(circuit, failure);

      case 'closed':
      default:
        return this.handleClosed(circuit, failure);
    }
  }

  /**
   * Get current state of a circuit
   */
  getCircuitState(key: string): CircuitState {
    return this.circuits.get(key)?.state ?? 'closed';
  }

  /**
   * Manually reset a circuit to closed
   */
  resetCircuit(key: string): void {
    const circuit = this.circuits.get(key);
    if (circuit) {
      circuit.state = 'closed';
      circuit.failureCount = 0;
      circuit.successCount = 0;
    }
  }

  /**
   * Get all circuit states
   */
  getAllCircuits(): Map<string, CircuitState> {
    const states = new Map<string, CircuitState>();
    for (const [key, circuit] of this.circuits) {
      states.set(key, circuit.state);
    }
    return states;
  }

  /**
   * Record a success (used externally to close circuits)
   */
  recordSuccess(key: string): void {
    const circuit = this.circuits.get(key);
    if (circuit) {
      if (circuit.state === 'half-open') {
        circuit.successCount++;
        if (circuit.successCount >= this.config.halfOpenMaxAttempts) {
          circuit.state = 'closed';
          circuit.failureCount = 0;
          circuit.successCount = 0;
        }
      } else {
        // Reset failure count on success in closed state
        circuit.failureCount = 0;
      }
    }
  }

  /**
   * Record a failure (used externally)
   */
  recordFailure(key: string): void {
    const circuit = this.getOrCreateCircuit(key);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.failureCount >= this.config.failureThreshold) {
      circuit.state = 'open';
    }
  }

  // Private methods

  private getCircuitKey(failure: IAgentFailure): string {
    // Key by agent + error type to isolate circuits
    return `${failure.agentId}:${failure.errorType}`;
  }

  private getOrCreateCircuit(key: string): CircuitInfo {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  private handleClosed(circuit: CircuitInfo, _failure: IAgentFailure): IRecoveryResult {
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.failureCount >= this.config.failureThreshold) {
      circuit.state = 'open';
      return {
        success: false,
        strategyUsed: this.id,
        message: `Circuit tripped after ${circuit.failureCount} failures`,
        retryRecommended: false,
        nextAction: 'skip',
      };
    }

    return {
      success: false,
      strategyUsed: this.id,
      message: `Failure recorded (${circuit.failureCount}/${this.config.failureThreshold})`,
      retryRecommended: true,
      nextAction: 'retry',
    };
  }

  private handleHalfOpen(circuit: CircuitInfo, _failure: IAgentFailure): IRecoveryResult {
    // Any failure in half-open immediately opens the circuit
    circuit.state = 'open';
    circuit.lastFailureTime = Date.now();
    circuit.successCount = 0;

    return {
      success: false,
      strategyUsed: this.id,
      message: 'Failure in half-open state - circuit re-opened',
      retryRecommended: false,
      nextAction: 'skip',
    };
  }

  private transitionToHalfOpen(circuit: CircuitInfo): void {
    circuit.state = 'half-open';
    circuit.successCount = 0;
  }
}

interface CircuitInfo {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
}
