/**
 * @holoscript/absorb-service
 *
 * Unified codebase intelligence, recursive self-improvement pipeline,
 * daemon system, and credit management for HoloScript.
 *
 * Sub-modules (import via sub-paths to avoid name collisions):
 *   - @holoscript/absorb-service/engine         -- Codebase scanner, graph, embeddings, visualization
 *   - @holoscript/absorb-service/pipeline        -- Recursive self-improvement orchestrator (L0/L1/L2)
 *   - @holoscript/absorb-service/daemon          -- Daemon actions, error taxonomy, prompt profiles, types
 *   - @holoscript/absorb-service/self-improvement -- Training data generation, quality scoring, GRPO
 *   - @holoscript/absorb-service/mcp             -- MCP tool definitions for absorb, codebase, graph-rag
 *   - @holoscript/absorb-service/credits         -- Credit system, pricing, metered LLM provider
 *   - @holoscript/absorb-service/schema          -- Drizzle DB tables
 *   - @holoscript/absorb-service/bridge          -- Absorb-to-pipeline trigger bridge
 *
 * The main entry re-exports engine and bridge (no collisions).
 * For pipeline/daemon/self-improvement, use the sub-path imports.
 *
 * @version 6.0.0
 * @packageDocumentation
 */

// Engine is the primary export (most commonly used)
export * from './engine/index';

// Bridge (no collisions)
export * from './bridge';
