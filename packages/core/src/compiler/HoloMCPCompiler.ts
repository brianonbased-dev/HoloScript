/**
 * HoloScript -> MCP Server Compiler (P0 skeleton)
 *
 * The inverse of MCPConfigCompiler: where that compiler emits IDE *client*
 * connection config, this compiler emits an MCP *server* — making the agent
 * tool surface a first-class compile target of the HoloScript trait library
 * (one trait -> rendered object + A2A agent card + MCP tool surface).
 *
 * THIS IS THE P0 SKELETON. It registers the `mcp-server` dialect, validates
 * compiler access, and emits a structurally valid (but tool-less) MCP server
 * manifest. The trait-walk that derives `Tool[]` + per-tool `inputSchema` from
 * trait declarations, the handler dispatch table, and the contract/receipt
 * governance wrappers land in P1+ — each of which introduces new imports that
 * must be cleared against scripts/docker/tsup.core.docker.cjs (W.731) before
 * shipping. The skeleton intentionally adds NO new @holoscript/core subpath
 * imports and does NOT override getRequiredCapability (it resolves through the
 * default COMPILER_CLASS_TO_ANS_NAME -> 'mcp-server' path).
 *
 * Design + phased plan + the narrowed governance claim:
 *   ai-ecosystem research/2026-06-16_holoscript-mcp-compiler-design.md
 *
 * @version 0.1.0 (P0 skeleton)
 * @module @holoscript/core/compiler/HoloMCPCompiler
 */

import { CompilerBase } from './CompilerBase';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

export interface HoloMCPCompilerOptions {
  /** Server name for the emitted MCP manifest (defaults to a generic name). */
  serverName?: string;
  /** Server version for the emitted MCP manifest. */
  serverVersion?: string;
}

/**
 * Emitted MCP server manifest shape (P0). `tools` is empty in the skeleton;
 * P1 populates it from the composition's traits.
 */
interface HoloMCPServerManifest {
  _generated: 'HoloMCPCompiler';
  _phase: string;
  _configKind: 'mcp-server';
  server: { name: string; version: string };
  capabilities: { tools: Record<string, unknown> };
  /** Count of composition objects seen — proves the AST was traversed (P1 turns these into tools). */
  sourceObjectCount: number;
  tools: unknown[];
}

export class HoloMCPCompiler extends CompilerBase {
  protected readonly compilerName = 'HoloMCPCompiler';

  private options: Required<HoloMCPCompilerOptions>;

  constructor(options: HoloMCPCompilerOptions = {}) {
    super();
    this.options = {
      serverName: options.serverName ?? '',
      serverVersion: options.serverVersion ?? '1.0.0',
    };
  }

  /**
   * Compile a HoloComposition into an MCP server manifest JSON string.
   *
   * @param composition - Parsed HoloScript composition AST
   * @param agentToken - Agent token for RBAC validation (JWT or UCAN)
   * @param outputPath - Optional output path for scope validation
   * @returns JSON string of the MCP server manifest (P0: tool-less skeleton)
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const serverName = this.options.serverName || 'holoscript-mcp-server';
    const sourceObjectCount = composition.objects?.length ?? 0;

    const manifest: HoloMCPServerManifest = {
      _generated: 'HoloMCPCompiler',
      _phase: 'skeleton (P0) — trait-walk Tool[] emission + handler dispatch + governance wrappers land in P1+',
      _configKind: 'mcp-server',
      server: { name: serverName, version: this.options.serverVersion },
      capabilities: { tools: {} },
      sourceObjectCount,
      tools: [],
    };

    return JSON.stringify(manifest, null, 2);
  }
}
