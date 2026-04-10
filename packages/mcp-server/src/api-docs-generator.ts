/**
 * API Documentation Generator — MCP tool reference documentation
 *
 * Generates API reference from MCP tool definitions (100+ tools).
 * Outputs markdown and JSON, grouped by category.
 * Includes usage examples extracted from tool schemas.
 *
 * Part of HoloScript v5.9 "Developer Portal".
 *
 * @version 1.0.0
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A documented tool entry.
 */
export interface ToolDoc {
  /** Tool name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: string;
  /** Input parameters */
  parameters: ParameterDoc[];
  /** Whether the tool requires authentication */
  requiresAuth: boolean;
  /** Usage example (JSON) */
  example?: string;
}

/**
 * A documented parameter.
 */
export interface ParameterDoc {
  /** Parameter name */
  name: string;
  /** Type (string, number, boolean, object, array) */
  type: string;
  /** Description */
  description: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Default value if any */
  defaultValue?: unknown;
  /** Enum values if any */
  enumValues?: string[];
}

/**
 * API reference output.
 */
export interface APIReference {
  /** Generated at timestamp */
  generatedAt: string;
  /** Total tool count */
  totalTools: number;
  /** Categories with their tools */
  categories: CategoryDoc[];
  /** Version */
  version: string;
}

/**
 * A category of tools.
 */
export interface CategoryDoc {
  /** Category name */
  name: string;
  /** Category description */
  description: string;
  /** Tools in this category */
  tools: ToolDoc[];
}

/**
 * Generator configuration.
 */
export interface APIDocsGeneratorConfig {
  /** Version string */
  version?: string;
  /** Category rules: tool name prefix → category */
  categoryRules?: Record<string, string>;
}

// =============================================================================
// DEFAULT CATEGORY RULES
// =============================================================================

const DEFAULT_CATEGORY_RULES: Record<string, string> = {
  parse_: 'Parsing & Validation',
  validate_: 'Parsing & Validation',
  list_: 'Parsing & Validation',
  explain_: 'Code Intelligence',
  suggest_: 'Code Intelligence',
  generate_: 'Code Generation',
  render_: 'Rendering',
  create_share: 'Sharing',
  convert_: 'Conversion',
  analyze_: 'Analysis',
  graph_: 'Graph Analysis',
  get_graph: 'Graph Analysis',
  ide_: 'IDE Integration',
  brittney_: 'AI Assistant',
  text_to_: 'Content Creation',
  browser_: 'Browser Control',
  codebase_: 'Codebase',
  graphrag_: 'Knowledge Graph',
  self_improve: 'Self Improvement',
  gltf_: 'GLTF Import',
  edit_holo: 'Editing',
  absorb_: 'Absorb Service',
  service_contract: 'Service Contracts',
  discover_: 'Agent Orchestration',
  delegate_: 'Agent Orchestration',
  get_task_: 'Agent Orchestration',
  compose_: 'Agent Orchestration',
  execute_: 'Agent Orchestration',
  query_traces: 'Observability',
  export_traces: 'Observability',
  get_agent_health: 'Observability',
  get_metrics: 'Observability',
  install_plugin: 'Plugin Management',
  list_plugins: 'Plugin Management',
  manage_plugin: 'Plugin Management',
  check_agent_budget: 'Economy',
  get_usage_summary: 'Economy',
  get_creator_earnings: 'Economy',
  get_api_reference: 'Developer Tools',
  serve_preview: 'Developer Tools',
  get_workspace_info: 'Developer Tools',
  inspect_trace_waterfall: 'Developer Tools',
  get_dev_dashboard_state: 'Developer Tools',
};

// =============================================================================
// GENERATOR
// =============================================================================

export class APIDocsGenerator {
  private config: Required<APIDocsGeneratorConfig>;

  constructor(config?: APIDocsGeneratorConfig) {
    this.config = {
      version: config?.version ?? '5.9.0',
      categoryRules: config?.categoryRules ?? DEFAULT_CATEGORY_RULES,
    };
  }

  // ===========================================================================
  // GENERATE
  // ===========================================================================

  /**
   * Generate API reference from tool definitions.
   */
  generate(tools: Tool[]): APIReference {
    const toolDocs = tools.map((tool) => this.documentTool(tool));

    // Group by category
    const categoryMap = new Map<string, ToolDoc[]>();
    for (const doc of toolDocs) {
      if (!categoryMap.has(doc.category)) {
        categoryMap.set(doc.category, []);
      }
      categoryMap.get(doc.category)!.push(doc);
    }

    // Sort categories and tools
    const categories: CategoryDoc[] = [...categoryMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, tools]) => ({
        name,
        description: this.getCategoryDescription(name),
        tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      }));

    return {
      generatedAt: new Date().toISOString(),
      totalTools: tools.length,
      categories,
      version: this.config.version,
    };
  }

  // ===========================================================================
  // TOOL DOCUMENTATION
  // ===========================================================================

  private documentTool(tool: Tool): ToolDoc {
    const schema = tool.inputSchema as {
      properties?: Record<
        string,
        {
          type?: string;
          description?: string;
          default?: unknown;
          enum?: string[];
        }
      >;
      required?: string[];
    };

    const parameters: ParameterDoc[] = [];
    const required = new Set(schema.required || []);

    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        parameters.push({
          name,
          type: prop.type || 'unknown',
          description: prop.description || '',
          required: required.has(name),
          defaultValue: prop.default,
          enumValues: prop.enum,
        });
      }
    }

    return {
      name: tool.name,
      description: tool.description || '',
      category: this.categorize(tool.name),
      parameters,
      requiresAuth: tool.name.startsWith('absorb_') || tool.name.includes('payment'),
      example: this.generateExample(tool.name, parameters),
    };
  }

  private categorize(toolName: string): string {
    for (const [prefix, category] of Object.entries(this.config.categoryRules)) {
      if (toolName.startsWith(prefix)) {
        return category;
      }
    }
    return 'General';
  }

  private getCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      'Parsing & Validation': 'Parse and validate HoloScript compositions',
      'Code Intelligence': 'AI-powered code analysis and suggestions',
      'Code Generation': 'Generate HoloScript code and objects',
      Rendering: 'Preview and render compositions',
      Sharing: 'Share compositions via URL',
      Conversion: 'Convert between formats',
      Analysis: 'Analyze code structure and quality',
      'Graph Analysis': 'Scene graph traversal and analysis',
      'IDE Integration': 'LSP and IDE features',
      'AI Assistant': 'Brittney AI assistant capabilities',
      'Content Creation': 'Text-to-3D and content generation',
      'Browser Control': 'Browser automation and testing',
      Codebase: 'Codebase analysis and navigation',
      'Knowledge Graph': 'GraphRAG knowledge retrieval',
      'Self Improvement': 'Self-improvement pipeline',
      'GLTF Import': 'Import 3D models from GLTF',
      Editing: 'Edit compositions in-place',
      'Absorb Service': 'Convert external formats to HoloScript',
      'Service Contracts': 'Generate and validate service contracts',
      'Agent Orchestration': 'Multi-agent orchestration and delegation',
      Observability: 'Tracing, metrics, and health monitoring',
      'Plugin Management': 'Install and manage plugins',
      Economy: 'Budget, usage, and revenue management',
      'Developer Tools': 'Development server and workspace tools',
      General: 'General-purpose tools',
    };
    return descriptions[category] || '';
  }

  private generateExample(toolName: string, params: ParameterDoc[]): string {
    const args: Record<string, unknown> = {};
    for (const param of params) {
      if (param.required) {
        args[param.name] = this.exampleValue(param);
      }
    }

    return JSON.stringify({ tool: toolName, args }, null, 2);
  }

  private exampleValue(param: ParameterDoc): unknown {
    if (param.defaultValue !== undefined) return param.defaultValue;
    if (param.enumValues && param.enumValues.length > 0) return param.enumValues[0];

    switch (param.type) {
      case 'string':
        return `example-${param.name}`;
      case 'number':
        return 1;
      case 'boolean':
        return true;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return '';
    }
  }

  // ===========================================================================
  // MARKDOWN OUTPUT
  // ===========================================================================

  /**
   * Generate markdown documentation.
   */
  toMarkdown(ref: APIReference): string {
    const lines: string[] = [
      `# HoloScript MCP API Reference`,
      '',
      `> Generated: ${ref.generatedAt} | Version: ${ref.version} | ${ref.totalTools} tools`,
      '',
      '## Table of Contents',
      '',
    ];

    // TOC
    for (const cat of ref.categories) {
      const anchor = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      lines.push(`- [${cat.name}](#${anchor}) (${cat.tools.length})`);
    }
    lines.push('');

    // Categories
    for (const cat of ref.categories) {
      lines.push(`## ${cat.name}`);
      if (cat.description) {
        lines.push('', cat.description, '');
      }

      for (const tool of cat.tools) {
        lines.push(`### \`${tool.name}\``);
        lines.push('', tool.description, '');

        if (tool.parameters.length > 0) {
          lines.push('| Parameter | Type | Required | Description |');
          lines.push('|-----------|------|----------|-------------|');
          for (const param of tool.parameters) {
            const req = param.required ? 'Yes' : 'No';
            lines.push(`| \`${param.name}\` | ${param.type} | ${req} | ${param.description} |`);
          }
          lines.push('');
        }

        if (tool.example) {
          lines.push('```json', tool.example, '```', '');
        }
      }
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // JSON OUTPUT
  // ===========================================================================

  /**
   * Generate JSON documentation.
   */
  toJSON(ref: APIReference): string {
    return JSON.stringify(ref, null, 2);
  }
}
