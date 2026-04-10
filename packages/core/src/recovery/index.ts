/**
 * Recovery Module
 *
 * Self-healing infrastructure for agent failure recovery.
 */

// Core service
export { SelfHealingService } from './SelfHealingService';
export type { SelfHealingConfig } from './SelfHealingService';

// Pattern learning
export { PatternLearner } from './PatternLearner';
export type { PatternLearnerConfig, PatternAnalysis } from './PatternLearner';

// Built-in strategies
export { NetworkRetryStrategy } from './strategies/NetworkRetryStrategy';
export type { NetworkRetryConfig } from './strategies/NetworkRetryStrategy';

export { CircuitBreakerStrategy } from './strategies/CircuitBreakerStrategy';
export type { CircuitBreakerConfig, CircuitState } from './strategies/CircuitBreakerStrategy';

export { FallbackCacheStrategy } from './strategies/FallbackCacheStrategy';
export type { FallbackCacheConfig } from './strategies/FallbackCacheStrategy';
