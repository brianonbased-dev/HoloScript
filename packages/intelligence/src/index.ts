/**
 * @holoscript/intelligence — AI & Agent Systems
 *
 * Re-exports AI, swarm, agents, training, self-improvement from @holoscript/core.
 * ~56K LOC combined.
 *
 * Usage:
 *   import { AgentRuntime, SwarmController, SelfImproveCommand } from '@holoscript/intelligence';
 */

// Re-export self-improvement subsystem from core subpath
// Phase 2: ai/swarm/agents/training source files will be moved here
export * from '@holoscript/core/self-improvement';
