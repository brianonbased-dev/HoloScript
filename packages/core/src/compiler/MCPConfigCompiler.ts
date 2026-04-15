/**
 * HoloScript -> MCP Config Compiler
 *
 * Generates IDE-specific MCP server configuration files from .holo compositions.
 * One .holo source of truth, multiple IDE outputs with correct credential handling.
 *
 * Targets:
 *   - claude    → ~/.mcp/config.json      (uses ${VAR} interpolation)
 *   - vscode    → .vscode/mcp.json        (uses ${env:VAR} interpolation)
 *   - cursor    → .cursor/mcp.json        (uses ${VAR} interpolation)
 *   - antigravity → .gemini/.../mcp_config.json (injects literal values from .env)
 *   - generic   → mcp.json                (uses ${VAR}, no IDE-specific features)
 *
 * .holo syntax:
 *
 *   mcp_servers {
 *     server holoscript_remote {
 *       @connector(holoscript, transport: "http")
 *       url: "https://mcp.holoscript.net/mcp"
 *       @env(HOLOSCRIPT_API_KEY, header: "Authorization: Bearer")
 *     }
 *
 *     server brave_search {
 *       @connector(brave, transport: "stdio")
 *       command: "npx"
 *       args: ["-y", "@modelcontextprotocol/server-brave-search"]
 *       @env(BRAVE_API_KEY)
 *     }
 *   }
 *
 * @version 1.0.0
 * @module @holoscript/core/compiler/MCPConfigCompiler
 */

import { CompilerBase } from './CompilerBase';
import type {
  HoloComposition,
  HoloDomainBlock,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes';
import { DialectRegistry } from './DialectRegistry';

// =============================================================================
// TYPES
// =============================================================================

export type MCPConfigTarget = 'claude' | 'vscode' | 'cursor' | 'antigravity' | 'generic';

export interface MCPConfigCompilerOptions {
  /** Target IDE format */
  target?: MCPConfigTarget;
  /** Path to .env file for literal value injection (antigravity target) */
  envFile?: string;
  /** Inline env values for literal injection (alternative to envFile) */
  envValues?: Record<string, string>;
  /** Working directory for stdio servers (antigravity needs absolute paths) */
  cwd?: string;
}

interface MCPServerDef {
  name: string;
  transport: 'http' | 'stdio' | 'sse';
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  description?: string;
  envVars: EnvRef[];
}

interface EnvRef {
  name: string;
  header?: string;  // e.g., "Authorization: Bearer" or "x-mcp-api-key"
}

// =============================================================================
// COMPILER
// =============================================================================

export class MCPConfigCompiler extends CompilerBase {
  protected readonly compilerName = 'MCPConfigCompiler';

  private options: Required<MCPConfigCompilerOptions>;
  private servers: MCPServerDef[] = [];

  constructor(options: MCPConfigCompilerOptions = {}) {
    super();
    this.options = {
      target: options.target ?? 'generic',
      envFile: options.envFile ?? '',
      envValues: options.envValues ?? {},
      cwd: options.cwd ?? '',
    };
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): string {
    this.validateCompilerAccess(agentToken, outputPath);
    this.servers = [];

    // Extract server definitions from domain blocks named "mcp_servers"
    if (composition.domainBlocks) {
      for (const block of composition.domainBlocks) {
        if (block.domain === 'mcp_servers' || block.name === 'mcp_servers') {
          this.extractServersFromBlock(block);
        }
      }
    }

    // Also extract from top-level objects with @connector trait
    if (composition.objects) {
      for (const obj of composition.objects) {
        if (this.hasConnectorTrait(obj)) {
          this.servers.push(this.extractServerFromObject(obj));
        }
      }
    }

    // Generate IDE-specific output
    const config = this.generateConfig();
    return JSON.stringify(config, null, 2);
  }

  // ── Extraction ────────────────────────────────────────────────────────────

  private extractServersFromBlock(block: HoloDomainBlock): void {
    if (!block.children) return;
    for (const child of block.children) {
      if ('type' in child && (child as HoloObjectDecl).type === 'Object') {
        const obj = child as HoloObjectDecl;
        this.servers.push(this.extractServerFromObject(obj));
      }
    }
  }

  private extractServerFromObject(obj: HoloObjectDecl): MCPServerDef {
    const props = this.objectPropsToMap(obj.properties);
    const traits = obj.traits || [];

    // Determine transport from @connector trait config
    let transport: 'http' | 'stdio' | 'sse' = 'http';
    const connectorTrait = traits.find(t => t.name === 'connector');
    if (connectorTrait?.config) {
      const t = this.resolveString(connectorTrait.config['transport'] || connectorTrait.config['_arg1']);
      if (t === 'stdio' || t === 'sse' || t === 'http') transport = t;
    }

    // Extract @env traits
    const envVars: EnvRef[] = [];
    for (const trait of traits) {
      if (trait.name === 'env') {
        const varName = this.resolveString(trait.config['_arg0'] || trait.config['name'] || '');
        const header = this.resolveString(trait.config['header'] || '');
        if (varName) {
          envVars.push({ name: varName, header: header || undefined });
        }
      }
    }

    return {
      name: obj.name,
      transport,
      url: this.resolveString(props.get('url')),
      command: this.resolveString(props.get('command')),
      args: this.resolveArray(props.get('args')),
      cwd: this.resolveString(props.get('cwd')),
      description: this.resolveString(props.get('description')),
      envVars,
    };
  }

  private hasConnectorTrait(obj: HoloObjectDecl): boolean {
    return (obj.traits || []).some(t => t.name === 'connector');
  }

  // ── Config Generation ─────────────────────────────────────────────────────

  private generateConfig(): Record<string, unknown> {
    const mcpServers: Record<string, unknown> = {};

    for (const server of this.servers) {
      mcpServers[server.name] = this.generateServerEntry(server);
    }

    const config: Record<string, unknown> = {
      _generated: 'HoloScript MCPConfigCompiler',
      _target: this.options.target,
      _updated: new Date().toISOString().split('T')[0],
      mcpServers,
    };

    if (this.options.target === 'claude') {
      config['$schema'] = 'https://modelcontextprotocol.io/schemas/mcp-config.json';
    }

    return config;
  }

  private generateServerEntry(server: MCPServerDef): Record<string, unknown> {
    const entry: Record<string, unknown> = {};

    if (server.transport === 'stdio') {
      // stdio: command + args + env
      entry.command = server.command || 'node';
      if (server.args) entry.args = server.args;

      // cwd: antigravity needs absolute paths, others inherit
      if (server.cwd || this.options.target === 'antigravity') {
        entry.cwd = server.cwd || this.options.cwd || undefined;
      }

      // env block for stdio servers
      const envBlock: Record<string, string> = {};
      for (const ev of server.envVars) {
        if (!ev.header) {
          // Plain env var (no header mapping)
          envBlock[ev.name] = this.resolveEnvValue(ev.name);
        }
      }
      if (Object.keys(envBlock).length > 0) {
        entry.env = envBlock;
      }
    } else {
      // http/sse: url + headers
      if (this.options.target === 'antigravity') {
        entry.serverURL = server.url;
      } else {
        entry.url = server.url;
      }

      if (this.options.target !== 'antigravity' && server.transport === 'sse') {
        entry.transport = 'sse';
      }

      // Headers from @env traits with header config
      const headers: Record<string, string> = {};
      for (const ev of server.envVars) {
        if (ev.header) {
          // e.g., "Authorization: Bearer" → "Authorization": "Bearer <value>"
          const [headerName, ...prefix] = ev.header.split(':');
          const prefixStr = prefix.join(':').trim();
          const value = this.resolveEnvValue(ev.name);
          headers[headerName.trim()] = prefixStr ? `${prefixStr} ${value}` : value;
        } else {
          // env var as header directly (e.g., x-mcp-api-key)
          headers[ev.name] = this.resolveEnvValue(ev.name);
        }
      }
      if (Object.keys(headers).length > 0) {
        entry.headers = headers;
      }
    }

    if (server.description) {
      entry.description = server.description;
    }

    return entry;
  }

  // ── Env Value Resolution ──────────────────────────────────────────────────

  private resolveEnvValue(varName: string): string {
    switch (this.options.target) {
      case 'antigravity':
        // Antigravity doesn't interpolate — inject literal values
        return this.options.envValues[varName]
          || this.readEnvFile(varName)
          || `MISSING_${varName}`;

      case 'vscode':
        // VS Code uses ${env:VAR} syntax
        return `\${env:${varName}}`;

      case 'claude':
      case 'cursor':
      case 'generic':
      default:
        // These IDEs interpolate ${VAR}
        return `\${${varName}}`;
    }
  }

  private readEnvFile(varName: string): string | undefined {
    if (!this.options.envFile) return undefined;
    try {
      // In a real environment this would read the file
      // For compilation, envValues should be pre-populated by the caller
      return this.options.envValues[varName];
    } catch {
      return undefined;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private objectPropsToMap(
    props: Array<{ key: string; value: HoloValue }> | undefined
  ): Map<string, HoloValue> {
    const map = new Map<string, HoloValue>();
    if (!props) return map;
    for (const prop of props) {
      map.set(prop.key, prop.value);
    }
    return map;
  }

  private resolveString(value: HoloValue | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
      return String((value as Record<string, unknown>).value);
    }
    return String(value);
  }

  private resolveArray(value: HoloValue | undefined): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      return value.map(v => {
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v && 'value' in v) return String(v.value);
        return String(v);
      });
    }
    return undefined;
  }
}

// ── Dialect Registration ─────────────────────────────────────────────────

DialectRegistry.register({
  name: 'mcp-config',
  domain: 'configuration',
  description: 'Compiles .holo server definitions to IDE-specific MCP config JSON',
  supportedTraits: ['connector', 'env'],
  riskTier: 'standard',
  factory: (options) => new MCPConfigCompiler(options as MCPConfigCompilerOptions),
  outputExtensions: ['.json'],
});
