/**
 * Triple-Output Compilation Documentation Generator
 *
 * Generates three additional outputs after standard compilation:
 * 1. llms.txt - Scene description, trait list, export targets, API surface (max 800 tokens)
 * 2. .well-known/mcp - MCP server card conforming to SEP-1649/SEP-1960 schema
 * 3. Markdown documentation bundle - Auto-generated from composition metadata
 *
 * @version 1.0.0
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
 * Conforms to Model Context Protocol specification for server discovery.
 * Published at /.well-known/mcp to enable automated MCP server detection.
 *
 * @see https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/servers/
 */
export interface MCPServerCard {
  /** MCP specification version (e.g., "2025-03-26") */
  mcpVersion: string;

  /** Server name (unique identifier) */
  name: string;

  /** Server version (semver) */
  version: string;

  /** Human-readable description */
  description: string;

  /** Transport configuration (SEP-1649) */
  transport: MCPTransportConfig;

  /** Server capabilities */
  capabilities: MCPCapabilities;

  /** Tool manifest (SEP-1960) */
  tools: MCPToolManifest[];

  /** Endpoint URLs for REST APIs */
  endpoints: Record<string, string>;

  /** Contact information */
  contact?: {
    repository?: string;
    documentation?: string;
    support?: string;
  };
}

/**
 * MCP Transport Configuration (SEP-1649)
 */
export interface MCPTransportConfig {
  /** Transport type (e.g., "streamable-http", "stdio", "sse") */
  type: string;

  /** Transport endpoint URL (for HTTP-based transports) */
  url?: string;

  /** Authentication requirements */
  authentication?: {
    type: 'bearer' | 'api-key' | 'none';
    header?: string;
  } | null;
}

/**
 * MCP Capabilities (SEP-1649)
 */
export interface MCPCapabilities {
  /** Tool support */
  tools?: {
    count: number;
  };

  /** Resource support */
  resources?: boolean;

  /** Prompt support */
  prompts?: boolean;

  /** Sampling support */
  sampling?: boolean;
}

/**
 * MCP Tool Manifest Entry (SEP-1960)
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
 * 2. .well-known/mcp - MCP server discovery card
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
      (property) => property.key === 'geometry' || property.key === 'shape' || property.key === 'type'
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
    sections.push('Compatible targets: unity, unreal, godot, r3f, webgpu, babylon, openxr, vrchat, wasm, gltf, usd');
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

    // State management
    if (composition.state) {
      const stateObj = composition.state as any;
      let stateProps: string[] = [];

      if (stateObj.properties && Array.isArray(stateObj.properties)) {
        // HoloState with properties array
        stateProps = stateObj.properties.map((p: any) => p.key);
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
      sections.push('## Environment');
      sections.push(`Background: ${(composition.environment as any).background || 'default'}`);
      if ((composition.environment as any).fog) {
        sections.push('Fog: enabled');
      }
      sections.push('');
    }

    const fullText = sections.join('\n');

    // Truncate to approximate token limit (rough estimate: 1 token ≈ 4 characters)
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
   */
  private generateMCPServerCard(
    composition: HoloComposition,
    targetName: string
  ): MCPServerCard {
    const tools = this.extractMCPTools(composition, targetName);

    return {
      mcpVersion: '2025-03-26',
      name: this.sanitizeServiceName(composition.name || 'holoscript-composition'),
      version: this.options.serviceVersion,
      description: `HoloScript composition "${composition.name || 'Untitled'}" compiled for ${targetName} — ${composition.objects?.length || 0} objects, ${this.extractTraits(composition).length} unique traits`,
      transport: {
        type: this.options.mcpTransportType,
        url: `${this.options.serviceUrl}/mcp`,
        authentication: null, // Can be extended to support auth
      },
      capabilities: {
        tools: {
          count: tools.length,
        },
        resources: false,
        prompts: false,
      },
      tools,
      endpoints: {
        mcp: `${this.options.serviceUrl}/mcp`,
        health: `${this.options.serviceUrl}/health`,
        render: `${this.options.serviceUrl}/api/render`,
      },
      contact: {
        repository: this.options.contactRepository || undefined,
        documentation: this.options.contactDocumentation || undefined,
      },
    };
  }

  /**
   * Extract MCP tool manifest from composition
   */
  private extractMCPTools(
    composition: HoloComposition,
    targetName: string
  ): MCPToolManifest[] {
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

    // Template instantiation tools (one per template)
    if (composition.templates && composition.templates.length > 0) {
      for (const template of composition.templates.slice(0, 10)) { // Limit to first 10 templates
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

    return tools;
  }

  // ===========================================================================
  // MARKDOWN DOCUMENTATION GENERATION
  // ===========================================================================

  /**
   * Generate comprehensive markdown documentation bundle
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
    sections.push('- [Compilation Output](#compilation-output)');
    sections.push('');

    // Overview
    sections.push('## Overview');
    sections.push('');
    sections.push(`This composition contains ${composition.objects?.length || 0} objects, ${composition.lights?.length || 0} lights, and ${composition.spatialGroups?.length || 0} spatial groups.`);
    sections.push('');

    // Scene graph
    sections.push('## Scene Graph');
    sections.push('');
    if (composition.objects && composition.objects.length > 0) {
      sections.push('### Objects');
      sections.push('');
      sections.push('| Name | Type | Position | Traits |');
      sections.push('|------|------|----------|--------|');
      for (const obj of composition.objects.slice(0, 20)) { // Limit to first 20
        const objAny = obj as any; // HoloObjectDecl position may be nested in properties
        const pos = objAny.position || objAny.transform?.position;
        const posStr = pos ? `(${pos.x}, ${pos.y}, ${pos.z})` : 'N/A';
        const traitNames = obj.traits ? Array.from(obj.traits.keys()).join(', ') : 'none';
        sections.push(`| ${obj.name} | ${this.getObjectType(obj)} | ${posStr} | ${traitNames} |`);
      }
      if (composition.objects.length > 20) {
        sections.push(`| ... | ... | ... | *${composition.objects.length - 20} more objects* |`);
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

    // State management
    if (composition.state) {
      sections.push('## State Management');
      sections.push('');
      sections.push('### State Properties');
      sections.push('');
      sections.push('| Property | Type | Default Value |');
      sections.push('|----------|------|---------------|');
      const stateObj = composition.state as any;
      if (stateObj.properties) {
        // HoloState with properties array
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
      const logic = composition.logic as any;
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
      // Add more logic handler documentation as needed
    }

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
    sections.push('*Generated by HoloScript Compiler Documentation Generator*');
    sections.push('');

    return sections.join('\n');
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Extract all unique traits from a composition
   */
  private extractTraits(composition: HoloComposition): string[] {
    const traitSet = new Set<string>();

    // Extract from objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        if (obj.traits) {
          for (const trait of obj.traits) {
            traitSet.add(trait.name);
          }
        }
      }
    }

    // Extract from templates
    if (composition.templates) {
      for (const template of composition.templates) {
        if (template.traits) {
          for (const trait of template.traits) {
            traitSet.add(trait.name);
          }
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
    const lower = trait.toLowerCase();

    if (lower.includes('material') || lower.includes('color') || lower.includes('texture') || lower.includes('glow')) {
      return 'Visual';
    }
    if (lower.includes('physics') || lower.includes('collider') || lower.includes('rigidbody')) {
      return 'Physics';
    }
    if (lower.includes('audio') || lower.includes('sound')) {
      return 'Audio';
    }
    if (lower.includes('clickable') || lower.includes('draggable') || lower.includes('interactive')) {
      return 'Interaction';
    }
    if (lower.includes('ai') || lower.includes('npc') || lower.includes('behavior')) {
      return 'AI';
    }
    if (lower.includes('anim') || lower.includes('rotate') || lower.includes('move')) {
      return 'Animation';
    }
    if (lower.includes('network') || lower.includes('sync') || lower.includes('multiplayer')) {
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
