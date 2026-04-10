/**
 * Hand-written type declarations for @holoscript/absorb-service/mcp
 *
 * tsup dts is disabled globally for absorb-service (daemon-actions has
 * implicit-any types that block tsc). This file provides the declarations
 * that mcp-server and studio need to consume the mcp subpath export.
 *
 * Keep in sync with: src/mcp/index.ts
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ── absorb-tools ─────────────────────────────────────────────────────────────

export declare const absorbServiceTools: Tool[];

export declare function handleAbsorbServiceTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null>;

// ── absorb-typescript-tools ──────────────────────────────────────────────────

export declare const absorbTypescriptTools: Tool[];

export declare function handleAbsorbTypescriptTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null>;

// ── codebase-tools ───────────────────────────────────────────────────────────

export declare const codebaseTools: Tool[];

export declare function handleCodebaseTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null>;

// ── graph-rag-tools ──────────────────────────────────────────────────────────

export declare const graphRagTools: Tool[];

export declare function setGraphRAGState(
  embeddingIndex: unknown,
  ragEngine: unknown,
): void;

export declare function isGraphRAGReady(): boolean;

export declare function handleGraphRagTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null>;
