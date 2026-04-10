/**
 * Triple-Output Compilation Documentation Generator
 *
 * Generates three additional outputs after standard compilation:
 * 1. llms.txt - Scene description, trait list, export targets, API surface (max 800 tokens)
 * 2. .well-known/mcp - MCP server card conforming to SEP-1649/SEP-1960 schema
 * 3. Markdown documentation bundle - Auto-generated from composition metadata
 *
 * SEP-1649 Conformance:
 *   - serverInfo nested object with name, title, version
 *   - protocolVersion field
 *   - transport with type + endpoint
 *   - capabilities object
 *   - tools as static array or ["dynamic"]
 *
 * SEP-1960 Conformance:
 *   - endpoints object mapping transport types to URLs
 *   - authentication section with methods
 *   - capabilities as boolean flags
 *   - documentation/terms_of_service links
 *
 * @version 2.0.0
 * @package @holoscript/core/compiler
 */

import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Triple-output compilation result
 */
export interface TripleOutputResult {
  /** llms.txt format - concise AI-readable scene description (max 800 tokens) */
  llmsTxt: string;

  /** .well-known/mcp server card - MCP discovery metadata */
  wellKnownMcp: MCPServerCard;

  /** Markdown documentation bundle - human-readable reference */
  markdownDocs: string;
}

/**
 * MCP Server Card Schema (SEP-1649 serverInfo + SEP-1960 endpoints)
 *
 * Conforms to both Model Context Protocol specification proposals for server discovery.
 *
 * SEP-1649: Server Cards — HTTP Server Discovery via .well-known
 * SEP-1960: .well-known/mcp Discovery Endpoint for Server Metadata
 *
 * Published at /.well-known/mcp to enable automated MCP server detection.
 *
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1960
 */
export interface MCPServerCard {
  /** MCP specification version (SEP-1960: mcp_version) */
  mcpVersion: string;

  /**
   * Protocol version identifier (SEP-1649: protocolVersion)
   * e.g., "2025-06-18"
   */
  protocolVersion: string;

  /**
   * Server info object (SEP-1649: serverInfo)
   * Contains name, title, and version as a nested object
   */
  serverInfo: MCPServerInfo;

  /** Human-readable description (SEP-1649: description) */
  description: string;

  /** Transport configuration (SEP-1649) */
  transport: MCPTransportConfig;

  /** Server capabilities (SEP-1649 nested object / SEP-1960 boolean flags) */
  capabilities: MCPCapabilities;

  /**
   * Tool manifest (SEP-1649/SEP-1960)
   * Static array of tool definitions, or ["dynamic"] for runtime discovery
   */
  tools: MCPToolManifest[];

  /**
   * Endpoint URLs by transport type (SEP-1960)
   * Maps transport mechanism name to connection URL
   */
  endpoints: MCPEndpoints;

  /**
   * Authentication configuration (SEP-1960)
   */
  authentication?: MCPAuthentication;

  /** Contact information */
  contact?: {
    repository?: string;
    documentation?: string;
    support?: string;
  };

  /** Documentation URL (SEP-1960) */
  documentation?: string;

  /** Icon URL for display (SEP-1649) */
  iconUrl?: string;

  /**
   * Additional metadata (SEP-1649: _meta)
   * Extension point for vendor-specific metadata
   */
  _meta?: Record<string, unknown>;

  // ── Legacy compatibility aliases ──────────────────────────────────────────
  // These fields are kept for backward compatibility with v1.0.0 consumers
  // that read `name` / `version` directly off the card root.

  /** @deprecated Use serverInfo.name instead */
  name: string;

  /** @deprecated Use serverInfo.version instead */
  version: string;
}

/**
 * MCP Server Info (SEP-1649)
 * Nested object containing server identification metadata
 */
export interface MCPServerInfo {
  /** Server name (unique, kebab-case identifier) */
  name: string;

  /** Human-readable title */
  title?: string;

  /** Server version (semver) */
  version: string;
}

/**
 * MCP Transport Configuration (SEP-1649)
 */
export interface MCPTransportConfig {
  /** Transport type (e.g., "streamable-http", "stdio", "sse") */
  type: string;

  /**
   * Transport endpoint URL (SEP-1649: endpoint)
   * For HTTP-based transports, the full URL to the MCP protocol endpoint
   */
  endpoint?: string;

  /** Authentication requirements */
  authentication?: {
    type: 'bearer' | 'api-key' | 'none';
    header?: string;
  } | null;
}

/**
 * MCP Capabilities (SEP-1649 + SEP-1960)
 *
 * Supports both the SEP-1649 nested object format and SEP-1960 boolean flags.
 * Consumers should check for both formats.
 */
export interface MCPCapabilities {
  /** Tool support (SEP-1649: { count: N }, SEP-1960: boolean) */
  tools?:
    | {
        count: number;
      }
    | boolean;

  /** Resource support */
  resources?: boolean;

  /** Prompt support */
  prompts?: boolean;

  /** Sampling support */
  sampling?: boolean;

  /** Roots support (SEP-1960) */
  roots?: boolean;
}

/**
 * MCP Endpoints (SEP-1960)
 *
 * Maps transport mechanism names to their connection URLs.
 * At least one endpoint must be present.
 */
export interface MCPEndpoints {
  /** Streamable HTTP endpoint */
  streamable_http?: string;

  /** Server-Sent Events endpoint */
  sse?: string;

  /** WebSocket endpoint */
  websocket?: string;

  /** Allow additional custom transport endpoints */
  [key: string]: string | undefined;
}

/**
 * MCP Authentication Configuration (SEP-1960)
 */
export interface MCPAuthentication {
  /** Whether authentication is required */
  required: boolean;

  /** Supported authentication methods */
  methods?: ('oauth2' | 'api_key' | 'mtls' | 'bearer' | 'none')[];

  /** OAuth2 configuration (if method is oauth2) */
  oauth2?: {
    authorization_endpoint?: string;
    token_endpoint?: string;
    scopes_supported?: string[];
  };
}

/**
 * MCP Tool Manifest Entry (SEP-1649 / SEP-1960)
 */
export interface MCPToolManifest {
  /** Tool name (unique identifier) */
  name: string;

  /** Tool description */
  description: string;

  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
}

/**
 * Options for documentation generation
 */
export interface DocumentationGeneratorOptions {
  /** Service base URL for MCP server card */
  serviceUrl?: string;

  /** Service version */
  serviceVersion?: string;

  /** Maximum tokens for llms.txt (default: 800) */
  maxLlmsTxtTokens?: number;

  /** Include trait documentation in markdown bundle (default: true) */
  includeTraitDocs?: boolean;

  /** Include examples in markdown bundle (default: true) */
  includeExamples?: boolean;

  /** MCP transport type (default: "streamable-http") */
  mcpTransportType?: string;

  /** Contact repository URL */
  contactRepository?: string;

  /** Contact documentation URL */
  contactDocumentation?: string;
}

// =============================================================================
// COMPILER DOCUMENTATION GENERATOR
// =============================================================================

/**
 * Generates triple-output documentation for HoloScript compositions.
 *
 * This generator produces three standardized output formats:
 * 1. llms.txt - Concise AI-readable scene description
 * 2. .well-known/mcp - MCP server discovery card (SEP-1649 + SEP-1960)
 * 3. Markdown - Human-readable documentation bundle
 *
 * @example
 * ```typescript
 * const generator = new CompilerDocumentationGenerator({
 *   serviceUrl: 'https://my-service.example.com',
 *   serviceVersion: '1.0.0',
 * });
 *
 * const docs = generator.generate(composition, 'r3f', compiledCode);
 * console.log(docs.llmsTxt); // AI-readable summary
 * console.log(docs.wellKnownMcp); // MCP discovery card
 * console.log(docs.markdownDocs); // Full documentation
 * ```
 */
export class CompilerDocumentationGenerator {
  private options: Required<DocumentationGeneratorOptions>;

  constructor(options: DocumentationGeneratorOptions = {}) {
    this.options = {
      serviceUrl: options.serviceUrl ?? 'http://localhost:3000',
      serviceVersion: options.serviceVersion ?? '1.0.0',
      maxLlmsTxtTokens: options.maxLlmsTxtTokens ?? 800,
      includeTraitDocs: options.includeTraitDocs ?? true,
      includeExamples: options.includeExamples ?? true,
      mcpTransportType: options.mcpTransportType ?? 'streamable-http',
      contactRepository: options.contactRepository ?? '',
      contactDocumentation: options.contactDocumentation ?? '',
    };
  }

  private getObjectType(obj: HoloObjectDecl): string {
    const typeProperty = obj.properties?.find(
      (property) =>
        property.key === 'geometry' || property.key === 'shape' || property.key === 'type'
    )?.value;

    return typeof typeProperty === 'string' ? typeProperty : 'Object';
  }

  /**
   * Generate all three documentation outputs for a compilation
   *
   * @param composition - Parsed HoloScript composition AST
   * @param targetName - Compiler target (e.g., 'r3f', 'unity', 'unreal')
   * @param compiledCode - The compiled output code
   * @returns Triple-output documentation bundle
   */
  generate(
    composition: HoloComposition,
    targetName: string,
    compiledCode: string | Record<string, string>
  ): TripleOutputResult {
    return {
      llmsTxt: this.generateLlmsTxt(composition, targetName, compiledCode),
      wellKnownMcp: this.generateMCPServerCard(composition, targetName),
      markdownDocs: this.generateMarkdownDocs(composition, targetName, compiledCode),
    };
  }

  // ===========================================================================
  // LLMS.TXT GENERATION
  // ===========================================================================

  /**
   * Generate llms.txt format documentation (max 800 tokens)
   *
   * llms.txt is a standardized format for AI-readable project documentation.
   * It provides a concise overview optimized for LLM context windows.
   *
   * Includes: scene description, trait list, export targets, API surface,
   * MCP tool manifest summary, and state management.
   *
   * @see https://llmstxt.org/
   */
  private generateLlmsTxt(
    composition: HoloComposition,
    targetName: string,
    compiledCode: string | Record<string, string>
  ): string {
    const sections: string[] = [];

    // Header
    sections.push(`# ${composition.name || 'HoloScript Composition'}`);
    sections.push('');

    // Scene description
    sections.push('## Scene Description');
    sections.push(`Compiled for: ${targetName}`);
    sections.push(`Objects: ${composition.objects?.length || 0}`);
    sections.push(`Lights: ${composition.lights?.length || 0}`);
    sections.push(`Spatial Groups: ${composition.spatialGroups?.length || 0}`);
    sections.push(`Templates: ${composition.templates?.length || 0}`);
    sections.push('');

    // Trait list
    const traits = this.extractTraits(composition);
    if (traits.length > 0) {
      sections.push('## Traits Used');
      const traitsByCategory = this.groupTraitsByCategory(traits);
      for (const [category, categoryTraits] of Object.entries(traitsByCategory)) {
        sections.push(`- ${category}: ${categoryTraits.join(', ')}`);
      }
      sections.push('');
    }

    // Export targets
    sections.push('## Export Capabilities');
    sections.push(`Primary target: ${targetName}`);
    sections.push(
      'Compatible targets: unity, unreal, godot, r3f, webgpu, babylon, openxr, vrchat, wasm, gltf, usd'
    );
    sections.push('');

    // API surface (if multi-file compilation)
    if (typeof compiledCode === 'object') {
      sections.push('## API Surface');
      const files = Object.keys(compiledCode);
      sections.push(`Generated files: ${files.length}`);
      sections.push(`- ${files.slice(0, 5).join('\n- ')}`);
      if (files.length > 5) {
        sections.push(`- ... and ${files.length - 5} more`);
      }
      sections.push('');
    }

    // MCP Tool Manifests (concise summary)
    const mcpTools = this.extractMCPTools(composition, targetName);
    if (mcpTools.length > 0) {
      sections.push('## MCP Tools');
      sections.push(`Available tools: ${mcpTools.length}`);
      for (const tool of mcpTools.slice(0, 8)) {
        // Limit for token budget
        sections.push(`- ${tool.name}: ${tool.description}`);
      }
      if (mcpTools.length > 8) {
        sections.push(`- ... and ${mcpTools.length - 8} more`);
      }
      sections.push('');
    }

    // State management
    if (composition.state) {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const stateObj = composition.state as Record<string, unknown>;
      let stateProps: string[] = [];

      if (stateObj.properties && Array.isArray(stateObj.properties)) {
        // HoloState with properties array
        stateProps = (stateObj.properties as Array<{ key: string }>).map((p) => p.key);
      } else {
        // Plain object
        stateProps = Object.keys(stateObj);
      }

      if (stateProps.length > 0) {
        sections.push('## State Management');
        sections.push(`State properties: ${stateProps.length}`);
        sections.push(`- ${stateProps.slice(0, 5).join(', ')}`);
        if (stateProps.length > 5) {
          sections.push(`  ... and ${stateProps.length - 5} more`);
        }
        sections.push('');
      }
    }

    // Environment
    if (composition.environment) {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const env = composition.environment as Record<string, unknown>;
      sections.push('## Environment');
      sections.push(`Background: ${(env.background as string) || 'default'}`);
      if (env.fog) {
        sections.push('Fog: enabled');
      }
      sections.push('');
    }

    const fullText = sections.join('\n');

    // Truncate to approximate token limit (rough estimate: 1 token ~ 4 characters)
    const maxChars = this.options.maxLlmsTxtTokens * 4;
    if (fullText.length > maxChars) {
      return fullText.substring(0, maxChars) + '\n\n... (truncated to fit token limit)';
    }

    return fullText;
  }

  // ===========================================================================
  // .WELL-KNOWN/MCP GENERATION
  // ===========================================================================

  /**
   * Generate MCP server card conforming to SEP-1649 and SEP-1960
   *
   * Produces a server card that satisfies both specification proposals:
   * - SEP-1649: serverInfo nested object, transport with endpoint, protocolVersion
   * - SEP-1960: endpoints object, authentication, capabilities as booleans
   *
   * The card includes legacy compatibility fields (name, version at root)
   * for backward compatibility with v1.0.0 consumers.
   */
  private generateMCPServerCard(composition: HoloComposition, targetName: string): MCPServerCard {
    const tools = this.extractMCPTools(composition, targetName);
    const sanitizedName = this.sanitizeServiceName(composition.name || 'holoscript-composition');
    const compositionTitle = composition.name || 'Untitled';
    const traitCount = this.extractTraits(composition).length;
    const objectCount = composition.objects?.length || 0;

    // Build the SEP-1960 endpoints object from transport type
    const endpoints: MCPEndpoints = {};
    const transportType = this.options.mcpTransportType;
    const mcpUrl = `${this.options.serviceUrl}/mcp`;

    // Map transport type to the canonical endpoint key
    if (transportType === 'streamable-http' || transportType === 'http') {
      endpoints.streamable_http = mcpUrl;
    } else if (transportType === 'sse') {
      endpoints.sse = mcpUrl;
    } else if (transportType === 'websocket' || transportType === 'ws') {
      endpoints.websocket = mcpUrl;
    } else {
      // Default: use streamable_http
      endpoints.streamable_http = mcpUrl;
    }

    // Also register common utility endpoints
    endpoints.health = `${this.options.serviceUrl}/health`;
    endpoints.render = `${this.options.serviceUrl}/api/render`;

    return {
      // SEP-1960 fields
      mcpVersion: '2025-03-26',

      // SEP-1649 fields
      protocolVersion: '2025-06-18',

      serverInfo: {
        name: sanitizedName,
        title: `HoloScript: ${compositionTitle}`,
        version: this.options.serviceVersion,
      },

      description: `HoloScript composition "${compositionTitle}" compiled for ${targetName} — ${objectCount} objects, ${traitCount} unique traits`,

      transport: {
        type: transportType,
        endpoint: mcpUrl,
        authentication: null,
      },

      capabilities: {
        tools: {
          count: tools.length,
        },
        resources: false,
        prompts: false,
        sampling: false,
        roots: false,
      },

      tools,

      endpoints,

      authentication: {
        required: false,
        methods: ['none'],
      },

      contact: {
        repository: this.options.contactRepository || undefined,
        documentation: this.options.contactDocumentation || undefined,
      },

      documentation: this.options.contactDocumentation || undefined,

      // Legacy compatibility (v1.0.0)
      name: sanitizedName,
      version: this.options.serviceVersion,
    };
  }

  /**
   * Extract MCP tool manifest from composition
   */
  private extractMCPTools(composition: HoloComposition, targetName: string): MCPToolManifest[] {
    const tools: MCPToolManifest[] = [];

    // Core compilation tool
    tools.push({
      name: 'compile_composition',
      description: `Compile this HoloScript composition to ${targetName} format`,
      inputSchema: {
        type: 'object',
        properties: {
          options: {
            type: 'object',
            description: 'Compiler options',
          },
        },
      },
    });

    // Render preview tool
    tools.push({
      name: 'render_preview',
      description: `Render a preview of this composition as PNG/JPEG`,
      inputSchema: {
        type: 'object',
        properties: {
          width: { type: 'number', description: 'Image width in pixels' },
          height: { type: 'number', description: 'Image height in pixels' },
          format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
        },
      },
    });

    // Template instantiation tools (one per template)
    if (composition.templates && composition.templates.length > 0) {
      for (const template of composition.templates.slice(0, 10)) {
        // Limit to first 10 templates
        tools.push({
          name: `instantiate_${this.sanitizeToolName(template.name)}`,
          description: `Instantiate the "${template.name}" template with custom properties`,
          inputSchema: {
            type: 'object',
            properties: {
              properties: {
                type: 'object',
                description: 'Template properties to override',
              },
              position: {
                type: 'object',
                description: 'Spatial position',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
              },
            },
          },
        });
      }
    }

    // State update tool
    if (composition.state) {
      tools.push({
        name: 'update_state',
        description: 'Update composition state properties',
        inputSchema: {
          type: 'object',
          properties: {
            updates: {
              type: 'object',
              description: 'State property updates',
            },
          },
        },
      });
    }

    // Trait list tool
    tools.push({
      name: 'list_traits',
      description: 'List all traits used in this composition with their configurations',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filter by trait category (visual, physics, audio, etc.)',
          },
        },
      },
    });

    // Object query tool
    if (composition.objects && composition.objects.length > 0) {
      tools.push({
        name: 'query_objects',
        description: `Query scene objects by name, type, or trait (${composition.objects.length} objects available)`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Filter by object name (glob pattern)' },
            trait: { type: 'string', description: 'Filter by trait name' },
          },
        },
      });
    }

    return tools;
  }

  // ===========================================================================
  // MARKDOWN DOCUMENTATION GENERATION
  // ===========================================================================

  /**
   * Generate comprehensive markdown documentation bundle
   *
   * Includes: composition metadata, scene graph, trait documentation,
   * state management, logic handlers, MCP tool manifests, and compilation output.
   */
  private generateMarkdownDocs(
    composition: HoloComposition,
    targetName: string,
    compiledCode: string | Record<string, string>
  ): string {
    const sections: string[] = [];

    // Title and metadata
    sections.push(`# ${composition.name || 'HoloScript Composition'}`);
    sections.push('');
    sections.push(`**Target:** ${targetName}`);
    sections.push(`**Generated:** ${new Date().toISOString()}`);
    sections.push(`**Version:** ${this.options.serviceVersion}`);
    sections.push('');

    // Table of contents
    sections.push('## Table of Contents');
    sections.push('');
    sections.push('- [Overview](#overview)');
    sections.push('- [Scene Graph](#scene-graph)');
    sections.push('- [Traits](#traits)');
    if (composition.state) {
      sections.push('- [State Management](#state-management)');
    }
    if (composition.logic) {
      sections.push('- [Logic Handlers](#logic-handlers)');
    }
    sections.push('- [MCP Tool Manifest](#mcp-tool-manifest)');
    sections.push('- [Compilation Output](#compilation-output)');
    sections.push('');

    // Overview
    sections.push('## Overview');
    sections.push('');
    sections.push(
      `This composition contains ${composition.objects?.length || 0} objects, ${composition.lights?.length || 0} lights, and ${composition.spatialGroups?.length || 0} spatial groups.`
    );
    sections.push('');

    // Composition metadata
    if (composition.templates && composition.templates.length > 0) {
      sections.push(`**Templates:** ${composition.templates.length}`);
    }
    if (composition.imports && composition.imports.length > 0) {
      sections.push(`**Imports:** ${composition.imports.length}`);
    }
    if (composition.traitDefinitions && composition.traitDefinitions.length > 0) {
      sections.push(`**Custom Traits:** ${composition.traitDefinitions.length}`);
    }
    sections.push('');

    // Scene graph
    sections.push('## Scene Graph');
    sections.push('');
    if (composition.objects && composition.objects.length > 0) {
      sections.push('### Objects');
      sections.push('');
      sections.push('| Name | Type | Position | Traits |');
      sections.push('|------|------|----------|--------|');
      for (const obj of composition.objects.slice(0, 20)) {
        // Limit to first 20
        const objRec = obj as unknown as Record<string, unknown>;
        const transform = objRec.transform as Record<string, unknown> | undefined;
        const pos = (objRec.position || transform?.position) as
          | { x: number; y: number; z: number }
          | undefined;
        const posStr = pos ? `(${pos.x}, ${pos.y}, ${pos.z})` : 'N/A';
        const traitNames = obj.traits
          ? this.extractTraitNames(obj.traits).join(', ') || 'none'
          : 'none';
        sections.push(`| ${obj.name} | ${this.getObjectType(obj)} | ${posStr} | ${traitNames} |`);
      }
      if (composition.objects.length > 20) {
        sections.push(`| ... | ... | ... | *${composition.objects.length - 20} more objects* |`);
      }
      sections.push('');
    }

    // Lights
    if (composition.lights && composition.lights.length > 0) {
      sections.push('### Lights');
      sections.push('');
      sections.push('| Name | Type |');
      sections.push('|------|------|');
      for (const light of composition.lights) {
        const lightRec = light as unknown as Record<string, unknown>;
        sections.push(
          `| ${light.name || 'unnamed'} | ${(lightRec.lightType as string) || 'unknown'} |`
        );
      }
      sections.push('');
    }

    // Traits
    const traits = this.extractTraits(composition);
    if (traits.length > 0) {
      sections.push('## Traits');
      sections.push('');
      sections.push(`This composition uses ${traits.length} unique traits:`);
      sections.push('');
      const traitsByCategory = this.groupTraitsByCategory(traits);
      for (const [category, categoryTraits] of Object.entries(traitsByCategory)) {
        sections.push(`### ${category}`);
        sections.push('');
        for (const trait of categoryTraits) {
          sections.push(`- **${trait}**`);
          if (this.options.includeTraitDocs) {
            const doc = this.getTraitDocumentation(trait);
            if (doc) {
              sections.push(`  ${doc}`);
            }
          }
        }
        sections.push('');
      }
    }

    // Custom trait definitions
    if (composition.traitDefinitions && composition.traitDefinitions.length > 0) {
      sections.push('### Custom Trait Definitions');
      sections.push('');
      for (const traitDef of composition.traitDefinitions) {
        const traitDefRec = traitDef as unknown as Record<string, unknown>;
        const extendsClause = traitDefRec.extends
          ? ` extends ${traitDefRec.extends as string}`
          : '';
        sections.push(`- **${traitDef.name}**${extendsClause}`);
      }
      sections.push('');
    }

    // State management
    if (composition.state) {
      sections.push('## State Management');
      sections.push('');
      sections.push('### State Properties');
      sections.push('');
      sections.push('| Property | Type | Default Value |');
      sections.push('|----------|------|---------------|');
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const stateObj = composition.state as Record<string, unknown>;
      if (stateObj.properties) {
        // HoloState with properties array (key-value pair entries)
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        for (const prop of stateObj.properties) {
          const typeOf = typeof prop.value;
          const defaultValue = JSON.stringify(prop.value).substring(0, 50);
          sections.push(`| ${prop.key} | ${typeOf} | ${defaultValue} |`);
        }
      } else {
        // Plain object
        for (const [key, value] of Object.entries(stateObj)) {
          const typeOf = typeof value;
          const defaultValue = JSON.stringify(value).substring(0, 50);
          sections.push(`| ${key} | ${typeOf} | ${defaultValue} |`);
        }
      }
      sections.push('');
    }

    // Logic handlers
    if (composition.logic) {
      sections.push('## Logic Handlers');
      sections.push('');
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const logic = composition.logic as Record<string, unknown>;
      if (logic.on_start) {
        sections.push('### on_start');
        sections.push('');
        sections.push('Executed when the composition initializes.');
        sections.push('');
      }
      if (logic.on_update) {
        sections.push('### on_update');
        sections.push('');
        sections.push('Executed every frame.');
        sections.push('');
      }
    }

    // MCP Tool Manifest documentation
    const mcpTools = this.extractMCPTools(composition, targetName);
    sections.push('## MCP Tool Manifest');
    sections.push('');
    sections.push(
      `This compilation exposes ${mcpTools.length} MCP tools for programmatic interaction:`
    );
    sections.push('');
    sections.push('| Tool | Description | Input Schema |');
    sections.push('|------|-------------|-------------|');
    for (const tool of mcpTools) {
      const schemaStr = tool.inputSchema
        ? '`' +
          JSON.stringify(
            Object.keys(
              ((tool.inputSchema as Record<string, unknown>).properties as Record<
                string,
                unknown
              >) || {}
            )
          ) +
          '`'
        : 'none';
      sections.push(`| \`${tool.name}\` | ${tool.description} | ${schemaStr} |`);
    }
    sections.push('');

    // MCP Discovery endpoint
    sections.push('### Discovery');
    sections.push('');
    sections.push(`Server card available at: \`${this.options.serviceUrl}/.well-known/mcp\``);
    sections.push('');
    sections.push('```json');
    sections.push(`{`);
    sections.push(`  "mcpVersion": "2025-03-26",`);
    sections.push(`  "protocolVersion": "2025-06-18",`);
    sections.push(`  "serverInfo": {`);
    sections.push(
      `    "name": "${this.sanitizeServiceName(composition.name || 'holoscript-composition')}",`
    );
    sections.push(`    "version": "${this.options.serviceVersion}"`);
    sections.push(`  }`);
    sections.push(`}`);
    sections.push('```');
    sections.push('');

    // Compilation output
    sections.push('## Compilation Output');
    sections.push('');
    if (typeof compiledCode === 'string') {
      const lineCount = compiledCode.split('\n').length;
      sections.push(`Generated ${lineCount} lines of ${targetName} code.`);
    } else {
      sections.push(`Generated ${Object.keys(compiledCode).length} files:`);
      sections.push('');
      for (const [filename, content] of Object.entries(compiledCode)) {
        const lineCount = content.split('\n').length;
        sections.push(`- **${filename}** (${lineCount} lines)`);
      }
    }
    sections.push('');

    // Footer
    sections.push('---');
    sections.push('');
    sections.push('*Generated by HoloScript Compiler Documentation Generator v2.0.0*');
    sections.push('');

    return sections.join('\n');
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Extract trait names from a traits field.
   *
   * Handles both formats:
   * - HoloObjectTrait[] (canonical parser output: array of { name, config })
   * - Map<string, unknown> (R3F compiler output: Map with trait names as keys)
   */
  private extractTraitNames(
    traits: HoloObjectDecl['traits'] | Map<string, unknown> | undefined
  ): string[] {
    if (!traits) return [];

    // Map format (R3FCompiler, some test mocks)
    if (traits instanceof Map) {
      return Array.from(traits.keys());
    }

    // Array format (canonical HoloObjectTrait[])
    if (Array.isArray(traits)) {
      return traits
        .map((t) => (typeof t === 'string' ? t : t?.name))
        .filter((name): name is string => typeof name === 'string');
    }

    return [];
  }

  /**
   * Extract all unique traits from a composition
   */
  private extractTraits(composition: HoloComposition): string[] {
    const traitSet = new Set<string>();

    // Extract from objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        for (const name of this.extractTraitNames(obj.traits)) {
          traitSet.add(name);
        }
      }
    }

    // Extract from templates
    if (composition.templates) {
      for (const template of composition.templates) {
        for (const name of this.extractTraitNames(template.traits)) {
          traitSet.add(name);
        }
      }
    }

    return Array.from(traitSet).sort();
  }

  /**
   * Group traits by category (visual, physics, audio, etc.)
   */
  private groupTraitsByCategory(traits: string[]): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      Visual: [],
      Physics: [],
      Audio: [],
      Interaction: [],
      AI: [],
      Animation: [],
      Network: [],
      Other: [],
    };

    for (const trait of traits) {
      const category = this.categorizeTrait(trait);
      categories[category].push(trait);
    }

    // Remove empty categories
    return Object.fromEntries(
      Object.entries(categories).filter(([_, traits]) => traits.length > 0)
    );
  }

  /**
   * Categorize a trait by name pattern
   */
  private categorizeTrait(trait: string): string {
    if (!trait) return 'Other';
    const lower = trait.toLowerCase();

    if (
      lower.includes('material') ||
      lower.includes('color') ||
      lower.includes('texture') ||
      lower.includes('glow') ||
      lower.includes('emissive') ||
      lower.includes('shader') ||
      lower.includes('pbr') ||
      lower.includes('light') ||
      lower.includes('shadow') ||
      lower.includes('fog') ||
      lower.includes('transparency') ||
      lower.includes('opacity')
    ) {
      return 'Visual';
    }
    if (
      lower.includes('physics') ||
      lower.includes('collider') ||
      lower.includes('rigidbody') ||
      lower.includes('gravity') ||
      lower.includes('fluid') ||
      lower.includes('constraint') ||
      lower.includes('joint')
    ) {
      return 'Physics';
    }
    if (
      lower.includes('audio') ||
      lower.includes('sound') ||
      lower.includes('music') ||
      lower.includes('spatial_audio')
    ) {
      return 'Audio';
    }
    if (
      lower.includes('clickable') ||
      lower.includes('draggable') ||
      lower.includes('interactive') ||
      lower.includes('hover') ||
      lower.includes('grab') ||
      lower.includes('pointer') ||
      lower.includes('selectable')
    ) {
      return 'Interaction';
    }
    if (
      lower.includes('ai') ||
      lower.includes('npc') ||
      lower.includes('behavior') ||
      lower.includes('pathfinding') ||
      lower.includes('agent') ||
      lower.includes('decision')
    ) {
      return 'AI';
    }
    if (
      lower.includes('anim') ||
      lower.includes('rotate') ||
      lower.includes('move') ||
      lower.includes('orbit') ||
      lower.includes('keyframe') ||
      lower.includes('tween') ||
      lower.includes('spring')
    ) {
      return 'Animation';
    }
    if (
      lower.includes('network') ||
      lower.includes('sync') ||
      lower.includes('multiplayer') ||
      lower.includes('replicated') ||
      lower.includes('authority') ||
      lower.includes('lobby')
    ) {
      return 'Network';
    }

    return 'Other';
  }

  /**
   * Get documentation string for a trait (stub - can be extended with trait metadata)
   */
  private getTraitDocumentation(_trait: string): string | null {
    // This is a stub. In a real implementation, this would query the trait
    // metadata system or trait registry for comprehensive documentation.
    // For now, return null to skip inline trait docs.
    return null;
  }

  /**
   * Sanitize composition name for use as a service name
   */
  private sanitizeServiceName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Sanitize template name for use as a tool name
   */
  private sanitizeToolName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
