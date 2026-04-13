/**
 * AgentInferenceExportTarget — Compile HoloScript AST to runnable agent scripts
 *
 * Parses HoloScript compositions for agent-related traits (@agent, @tool,
 * @inference, @model, @prompt, @system_prompt, @temperature, @max_tokens,
 * NPC behaviors, dialogue trees, state machines) and generates a complete,
 * runnable agent inference script in TypeScript or Python.
 *
 * Output: Multi-file Record<string, string> with:
 *   - agent.ts / agent.py (main agent script)
 *   - tools.ts / tools.py (tool definitions extracted from traits)
 *   - config.json (model configuration)
 *   - README.md (usage instructions)
 *
 * @example
 * ```hsplus
 * composition "SupportBot" {
 *   object "Agent" {
 *     @agent { role: "customer_support" }
 *     @model { provider: "anthropic", name: "claude-sonnet-4-20250514", temperature: 0.7 }
 *     @system_prompt { text: "You are a helpful support agent." }
 *     @tool { name: "lookup_order", description: "Look up an order by ID" }
 *     @tool { name: "refund", description: "Process a refund" }
 *   }
 * }
 * ```
 *
 * @version 2.0.0
 * @module @holoscript/core/compiler/AgentInferenceExportTarget
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/platform';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloNPC,
  HoloBehavior,
  HoloBehaviorAction,
  HoloDialogue,
  HoloStateMachine,
  HoloDomainBlock,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

export type OutputLanguage = 'typescript' | 'python';
export type ModelProvider = 'anthropic' | 'openai' | 'local' | 'ollama' | 'custom';

export interface AgentInferenceCompilerOptions {
  /** Output language for generated agent script */
  language?: OutputLanguage;
  /** Default model provider when not specified in traits */
  defaultProvider?: ModelProvider;
  /** Default model name */
  defaultModel?: string;
  /** Default temperature */
  defaultTemperature?: number;
  /** Default max tokens */
  defaultMaxTokens?: number;
  /** Include type definitions in output */
  includeTypes?: boolean;
  /** Generate README with usage instructions */
  includeReadme?: boolean;
  /** Include environment variable template */
  includeEnvTemplate?: boolean;
}

export interface ModelConfig {
  provider: ModelProvider;
  name: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  systemPrompt: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  returnType: string;
  source: 'trait' | 'behavior' | 'npc' | 'domain-block';
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface AgentDefinition {
  name: string;
  role: string;
  modelConfig: ModelConfig;
  tools: ToolDefinition[];
  behaviors: AgentBehavior[];
  stateProperties: AgentStateProperty[];
  dialogueHandlers: DialogueHandler[];
}

export interface AgentBehavior {
  name: string;
  trigger: string;
  actions: string[];
  priority: number;
}

export interface AgentStateProperty {
  key: string;
  type: string;
  defaultValue: string;
}

export interface DialogueHandler {
  id: string;
  prompt: string;
  responses: string[];
}

export interface AgentInferenceResult {
  files: Record<string, string>;
  agents: AgentDefinition[];
  warnings: string[];
}

// =============================================================================
// DEFAULT CONSTANTS
// =============================================================================

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'anthropic',
  name: 'claude-sonnet-4-20250514',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9,
  topK: 40,
  systemPrompt: 'You are a helpful AI agent.',
};

const AGENT_TRAIT_NAMES = new Set([
  'agent',
  'model',
  'inference',
  'system_prompt',
  'prompt',
  'temperature',
  'max_tokens',
  'top_p',
  'top_k',
  'tool',
  'tool_use',
  'reasoning',
  'memory',
  'persona',
]);

// =============================================================================
// COMPILER
// =============================================================================

export class AgentInferenceCompiler extends CompilerBase {
  protected readonly compilerName = 'AgentInferenceCompiler';

  private options: Required<AgentInferenceCompilerOptions>;
  private agents: AgentDefinition[] = [];
  private warnings: string[] = [];

  constructor(options: AgentInferenceCompilerOptions = {}) {
    super();
    this.options = {
      language: options.language ?? 'typescript',
      defaultProvider: options.defaultProvider ?? 'anthropic',
      defaultModel: options.defaultModel ?? 'claude-sonnet-4-20250514',
      defaultTemperature: options.defaultTemperature ?? 0.7,
      defaultMaxTokens: options.defaultMaxTokens ?? 4096,
      includeTypes: options.includeTypes ?? true,
      includeReadme: options.includeReadme ?? true,
      includeEnvTemplate: options.includeEnvTemplate ?? true,
    };
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.AGENT_INFERENCE;
  }

  /**
   * Compile a HoloScript composition to runnable agent inference scripts.
   *
   * Extracts agent definitions from objects with @agent/@model/@tool traits,
   * NPCs, dialogue trees, state machines, and domain blocks, then generates
   * a complete multi-file agent project.
   */
  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): Record<string, string> {
    this.validateCompilerAccess(agentToken, outputPath);

    // Reset state
    this.agents = [];
    this.warnings = [];

    // Phase 1: Extract agent definitions from AST
    this.extractAgentsFromObjects(composition);
    this.extractAgentsFromNPCs(composition);
    this.extractAgentsFromDomainBlocks(composition);

    // If no agents found, create default from composition
    if (this.agents.length === 0) {
      this.agents.push(this.createDefaultAgent(composition));
      this.warnings.push(
        'No @agent traits found in composition. Created default agent from composition name.'
      );
    }

    // Phase 2: Generate output files
    const output: Record<string, string> = {};
    const ext = this.options.language === 'typescript' ? 'ts' : 'py';

    // Main agent script
    output[`agent.${ext}`] = this.emitAgentScript(composition.name);

    // Tool definitions
    const allTools = this.agents.flatMap((a) => a.tools);
    if (allTools.length > 0) {
      output[`tools.${ext}`] = this.emitToolDefinitions(allTools);
    }

    // Model configuration
    output['config.json'] = this.emitConfigJson();

    // Package / dependency file
    if (this.options.language === 'typescript') {
      output['package.json'] = this.emitPackageJson(composition.name);
      if (this.options.includeTypes) {
        output['types.ts'] = this.emitTypeDefinitions();
      }
    } else {
      output['requirements.txt'] = this.emitRequirementsTxt();
    }

    // Environment variable template
    if (this.options.includeEnvTemplate) {
      output['.env.example'] = this.emitEnvTemplate();
    }

    // README
    if (this.options.includeReadme) {
      output['README.md'] = this.emitReadme(composition.name);
    }

    return output;
  }

  /** Get extracted agents (for inspection/testing). */
  getAgents(): readonly AgentDefinition[] {
    return this.agents;
  }

  /** Get warnings from last compilation. */
  getWarnings(): readonly string[] {
    return this.warnings;
  }

  // ─── AST Extraction ─────────────────────────────────────────────────

  private extractAgentsFromObjects(composition: HoloComposition): void {
    for (const obj of composition.objects) {
      if (this.hasAgentTraits(obj)) {
        this.agents.push(this.parseAgentObject(obj));
      }
      // Recurse into children
      if (obj.children) {
        for (const child of obj.children) {
          if (this.hasAgentTraits(child)) {
            this.agents.push(this.parseAgentObject(child));
          }
        }
      }
    }
  }

  private extractAgentsFromNPCs(composition: HoloComposition): void {
    for (const npc of composition.npcs) {
      this.agents.push(this.parseNPCAsAgent(npc, composition));
    }
  }

  private extractAgentsFromDomainBlocks(composition: HoloComposition): void {
    if (!composition.domainBlocks) return;
    for (const block of composition.domainBlocks) {
      if (this.isAgentDomainBlock(block)) {
        this.agents.push(this.parseDomainBlockAsAgent(block));
      }
    }
  }

  private hasAgentTraits(obj: HoloObjectDecl): boolean {
    return obj.traits.some((t) => AGENT_TRAIT_NAMES.has(t.name));
  }

  private parseAgentObject(obj: HoloObjectDecl): AgentDefinition {
    const modelConfig = { ...DEFAULT_MODEL_CONFIG };
    modelConfig.provider = this.options.defaultProvider;
    modelConfig.name = this.options.defaultModel;
    modelConfig.temperature = this.options.defaultTemperature;
    modelConfig.maxTokens = this.options.defaultMaxTokens;

    const tools: ToolDefinition[] = [];
    const behaviors: AgentBehavior[] = [];
    const stateProperties: AgentStateProperty[] = [];
    let role = 'assistant';

    for (const trait of obj.traits) {
      switch (trait.name) {
        case 'agent':
          role = this.extractStringValue(trait.config['role']) ?? role;
          break;
        case 'model':
          this.applyModelConfig(trait, modelConfig);
          break;
        case 'inference':
          this.applyModelConfig(trait, modelConfig);
          break;
        case 'system_prompt':
        case 'prompt':
          modelConfig.systemPrompt =
            this.extractStringValue(trait.config['text']) ??
            this.extractStringValue(trait.config['content']) ??
            modelConfig.systemPrompt;
          break;
        case 'temperature':
          modelConfig.temperature =
            this.extractNumberValue(trait.config['value']) ?? modelConfig.temperature;
          break;
        case 'max_tokens':
          modelConfig.maxTokens =
            this.extractNumberValue(trait.config['value']) ?? modelConfig.maxTokens;
          break;
        case 'top_p':
          modelConfig.topP = this.extractNumberValue(trait.config['value']) ?? modelConfig.topP;
          break;
        case 'top_k':
          modelConfig.topK = this.extractNumberValue(trait.config['value']) ?? modelConfig.topK;
          break;
        case 'tool':
        case 'tool_use':
          tools.push(this.parseToolTrait(trait));
          break;
        case 'persona':
          modelConfig.systemPrompt =
            this.extractStringValue(trait.config['description']) ?? modelConfig.systemPrompt;
          break;
        default:
          break;
      }
    }

    // Extract state properties from object state
    if (obj.state) {
      for (const prop of obj.state.properties) {
        stateProperties.push({
          key: prop.key,
          type:
            typeof prop.value === 'number'
              ? 'number'
              : typeof prop.value === 'boolean'
                ? 'boolean'
                : 'string',
          defaultValue: String(prop.value ?? ''),
        });
      }
    }

    return {
      name: obj.name,
      role,
      modelConfig,
      tools,
      behaviors,
      stateProperties,
      dialogueHandlers: [],
    };
  }

  private parseNPCAsAgent(npc: HoloNPC, composition: HoloComposition): AgentDefinition {
    const modelConfig = { ...DEFAULT_MODEL_CONFIG };
    modelConfig.provider = this.options.defaultProvider;
    modelConfig.name = this.options.defaultModel;
    modelConfig.temperature = this.options.defaultTemperature;
    modelConfig.maxTokens = this.options.defaultMaxTokens;

    // Build system prompt from NPC properties
    const npcType = npc.npcType ?? 'assistant';
    const npcProps = npc.properties.map((p) => `${p.key}: ${String(p.value)}`).join(', ');
    modelConfig.systemPrompt = `You are a ${npcType} named ${npc.name}. ${npcProps}`;

    // Extract behaviors as tools
    const tools: ToolDefinition[] = npc.behaviors.map((b) => this.parseBehaviorAsTool(b));

    // Extract behaviors
    const behaviors: AgentBehavior[] = npc.behaviors.map((b) => ({
      name: b.name,
      trigger: b.trigger,
      actions: b.actions.map((a) => a.actionType),
      priority: b.priority ?? 0,
    }));

    // Extract dialogues
    const dialogueHandlers: DialogueHandler[] = [];
    if (npc.dialogueTree) {
      const dialogue = composition.dialogues.find(
        // @ts-expect-error During migration
        (d) => d.name === npc.dialogueTree
      );
      if (dialogue) {
        dialogueHandlers.push({
          // @ts-expect-error During migration
          id: dialogue.name,
          // @ts-expect-error During migration
          prompt: `Dialogue tree: ${dialogue.name}`,
          // @ts-expect-error During migration
          responses: dialogue.nodes?.map((n) => n.text ?? n.name ?? '') ?? [],
        });
      }
    }

    return {
      name: npc.name,
      role: npcType,
      modelConfig,
      tools,
      behaviors,
      stateProperties: [],
      dialogueHandlers,
    };
  }

  private parseDomainBlockAsAgent(block: HoloDomainBlock): AgentDefinition {
    const modelConfig = { ...DEFAULT_MODEL_CONFIG };
    modelConfig.provider = this.options.defaultProvider;
    modelConfig.name = this.options.defaultModel;

    // @ts-expect-error During migration
    const name = block.name ?? block.blockType ?? 'DomainAgent';
    const tools: ToolDefinition[] = [];

    // Extract objects within domain block as tools
    // @ts-expect-error During migration
    if (block.objects) {
      // @ts-expect-error During migration
      for (const obj of block.objects) {
        tools.push({
          name: this.toSnakeCase(obj.name),
          description: `Domain operation: ${obj.name}`,
          // @ts-expect-error During migration
          parameters: obj.properties.map((p) => ({
            name: p.key,
            type: typeof p.value === 'number' ? 'number' : 'string',
            description: `Parameter: ${p.key}`,
            required: true,
          })),
          returnType: 'unknown',
          source: 'domain-block',
        });
      }
    }

    return {
      name,
      role: 'domain-specialist',
      modelConfig,
      tools,
      behaviors: [],
      stateProperties: [],
      dialogueHandlers: [],
    };
  }

  private isAgentDomainBlock(block: HoloDomainBlock): boolean {
    const agentBlockTypes = ['agent_block', 'inference_block', 'ai_block'];
    // @ts-expect-error During migration
    return agentBlockTypes.includes(block.blockType ?? '');
  }

  private parseToolTrait(trait: HoloObjectTrait): ToolDefinition {
    const name = this.extractStringValue(trait.config['name']) ?? 'unnamed_tool';
    const description = this.extractStringValue(trait.config['description']) ?? '';
    const parameters: ToolParameter[] = [];

    // Extract parameters from trait config
    const paramsValue = trait.config['parameters'];
    if (Array.isArray(paramsValue)) {
      for (const param of paramsValue) {
        if (param && typeof param === 'object' && !Array.isArray(param)) {
          const paramObj = param as Record<string, HoloValue>;
          parameters.push({
            name: this.extractStringValue(paramObj['name']) ?? 'param',
            type: this.extractStringValue(paramObj['type']) ?? 'string',
            description: this.extractStringValue(paramObj['description']) ?? '',
            required: paramObj['required'] === true,
            defaultValue: paramObj['default'] != null ? String(paramObj['default']) : undefined,
          });
        }
      }
    }

    return {
      name,
      description,
      parameters,
      returnType: this.extractStringValue(trait.config['returns']) ?? 'string',
      source: 'trait',
    };
  }

  private parseBehaviorAsTool(behavior: HoloBehavior): ToolDefinition {
    return {
      name: this.toSnakeCase(behavior.name),
      description: `Behavior: ${behavior.name} (triggered by: ${behavior.trigger})`,
      parameters: behavior.actions.map((a) => ({
        name: a.actionType,
        type: 'string',
        description: `Action: ${a.actionType}`,
        required: false,
      })),
      returnType: 'void',
      source: 'behavior',
    };
  }

  private createDefaultAgent(composition: HoloComposition): AgentDefinition {
    return {
      name: composition.name,
      role: 'assistant',
      modelConfig: {
        ...DEFAULT_MODEL_CONFIG,
        provider: this.options.defaultProvider,
        name: this.options.defaultModel,
        temperature: this.options.defaultTemperature,
        maxTokens: this.options.defaultMaxTokens,
        systemPrompt: `You are an AI agent for ${composition.name}.`,
      },
      tools: [],
      behaviors: [],
      stateProperties: [],
      dialogueHandlers: [],
    };
  }

  private applyModelConfig(trait: HoloObjectTrait, config: ModelConfig): void {
    const provider = this.extractStringValue(trait.config['provider']);
    if (provider && this.isModelProvider(provider)) {
      config.provider = provider;
    }
    config.name = this.extractStringValue(trait.config['name']) ?? config.name;
    config.temperature = this.extractNumberValue(trait.config['temperature']) ?? config.temperature;
    config.maxTokens =
      this.extractNumberValue(trait.config['max_tokens']) ??
      this.extractNumberValue(trait.config['maxTokens']) ??
      config.maxTokens;
    config.topP = this.extractNumberValue(trait.config['top_p']) ?? config.topP;
    config.topK = this.extractNumberValue(trait.config['top_k']) ?? config.topK;
    const systemPrompt = this.extractStringValue(trait.config['system_prompt']);
    if (systemPrompt) {
      config.systemPrompt = systemPrompt;
    }
  }

  // ─── Code Generation (TypeScript) ───────────────────────────────────

  private emitAgentScript(compositionName: string): string {
    if (this.options.language === 'python') {
      return this.emitAgentScriptPython(compositionName);
    }
    return this.emitAgentScriptTypeScript(compositionName);
  }

  private emitAgentScriptTypeScript(compositionName: string): string {
    const lines: string[] = [];
    lines.push('/**');
    lines.push(` * ${compositionName} — Agent Inference Script`);
    lines.push(' * Generated by HoloScript AgentInferenceCompiler');
    lines.push(' */');
    lines.push('');
    lines.push("import Anthropic from '@anthropic-ai/sdk';");
    lines.push("import { tools, type ToolName, executeToolCall } from './tools';");
    lines.push("import config from './config.json';");
    if (this.options.includeTypes) {
      lines.push("import type { AgentConfig, AgentState, Message } from './types';");
    }
    lines.push('');

    // Agent class for each agent
    for (const agent of this.agents) {
      lines.push(`// ─── ${agent.name} ─────────────────────────────────────`);
      lines.push('');
      lines.push(`export class ${this.toPascalCase(agent.name)}Agent {`);
      lines.push('  private client: Anthropic;');
      lines.push('  private messages: Anthropic.MessageParam[] = [];');
      lines.push(`  private systemPrompt: string;`);
      lines.push('');

      // State properties
      if (agent.stateProperties.length > 0) {
        lines.push('  // Agent state');
        for (const prop of agent.stateProperties) {
          const tsType =
            prop.type === 'number' ? 'number' : prop.type === 'boolean' ? 'boolean' : 'string';
          lines.push(`  private ${prop.key}: ${tsType} = ${JSON.stringify(prop.defaultValue)};`);
        }
        lines.push('');
      }

      // Constructor
      lines.push('  constructor(apiKey?: string) {');
      lines.push(
        "    this.client = new Anthropic({ apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] });"
      );
      lines.push(`    this.systemPrompt = ${JSON.stringify(agent.modelConfig.systemPrompt)};`);
      lines.push('  }');
      lines.push('');

      // Run method
      lines.push('  async run(userMessage: string): Promise<string> {');
      lines.push("    this.messages.push({ role: 'user', content: userMessage });");
      lines.push('');
      lines.push('    const response = await this.client.messages.create({');
      lines.push(`      model: ${JSON.stringify(agent.modelConfig.name)},`);
      lines.push(`      max_tokens: ${agent.modelConfig.maxTokens},`);
      lines.push(`      temperature: ${agent.modelConfig.temperature},`);
      lines.push(`      top_p: ${agent.modelConfig.topP},`);
      lines.push('      system: this.systemPrompt,');
      lines.push('      messages: this.messages,');
      if (agent.tools.length > 0) {
        lines.push('      tools,');
      }
      lines.push('    });');
      lines.push('');

      // Tool use loop
      if (agent.tools.length > 0) {
        lines.push('    // Handle tool use loop');
        lines.push('    let currentResponse = response;');
        lines.push("    while (currentResponse.stop_reason === 'tool_use') {");
        lines.push('      const toolUseBlocks = currentResponse.content.filter(');
        lines.push("        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'");
        lines.push('      );');
        lines.push('');
        lines.push('      const toolResults: Anthropic.ToolResultBlockParam[] = [];');
        lines.push('      for (const toolUse of toolUseBlocks) {');
        lines.push('        const result = await executeToolCall(');
        lines.push('          toolUse.name as ToolName,');
        lines.push('          toolUse.input as Record<string, unknown>');
        lines.push('        );');
        lines.push('        toolResults.push({');
        lines.push("          type: 'tool_result',");
        lines.push('          tool_use_id: toolUse.id,');
        lines.push(
          "          content: typeof result === 'string' ? result : JSON.stringify(result),"
        );
        lines.push('        });');
        lines.push('      }');
        lines.push('');
        lines.push(
          "      this.messages.push({ role: 'assistant', content: currentResponse.content });"
        );
        lines.push("      this.messages.push({ role: 'user', content: toolResults });");
        lines.push('');
        lines.push('      currentResponse = await this.client.messages.create({');
        lines.push(`        model: ${JSON.stringify(agent.modelConfig.name)},`);
        lines.push(`        max_tokens: ${agent.modelConfig.maxTokens},`);
        lines.push(`        temperature: ${agent.modelConfig.temperature},`);
        lines.push('        system: this.systemPrompt,');
        lines.push('        messages: this.messages,');
        lines.push('        tools,');
        lines.push('      });');
        lines.push('    }');
        lines.push('');
        lines.push(
          "    this.messages.push({ role: 'assistant', content: currentResponse.content });"
        );
        lines.push('    const textBlocks = currentResponse.content.filter(');
        lines.push("      (block): block is Anthropic.TextBlock => block.type === 'text'");
        lines.push('    );');
        lines.push("    return textBlocks.map((b) => b.text).join('\\n');");
      } else {
        lines.push("    this.messages.push({ role: 'assistant', content: response.content });");
        lines.push('    const textBlocks = response.content.filter(');
        lines.push("      (block): block is Anthropic.TextBlock => block.type === 'text'");
        lines.push('    );');
        lines.push("    return textBlocks.map((b) => b.text).join('\\n');");
      }
      lines.push('  }');
      lines.push('');

      // Reset method
      lines.push('  reset(): void {');
      lines.push('    this.messages = [];');
      lines.push('  }');
      lines.push('}');
      lines.push('');
    }

    // Main entry point
    lines.push('// ─── Main ─────────────────────────────────────────────');
    lines.push('');
    const primaryAgent = this.agents[0];
    lines.push('async function main(): Promise<void> {');
    lines.push(`  const agent = new ${this.toPascalCase(primaryAgent.name)}Agent();`);
    lines.push('');
    lines.push('  // Interactive loop (stdin/stdout)');
    lines.push("  const readline = await import('readline');");
    lines.push('  const rl = readline.createInterface({');
    lines.push('    input: process.stdin,');
    lines.push('    output: process.stdout,');
    lines.push('  });');
    lines.push('');
    lines.push(
      `  console.log('${this.escapeStringValue(compositionName, 'TypeScript')} agent ready. Type a message or "quit" to exit.');`
    );
    lines.push('');
    lines.push('  const ask = (): void => {');
    lines.push("    rl.question('> ', async (input: string) => {");
    lines.push("      if (input.trim().toLowerCase() === 'quit') {");
    lines.push('        rl.close();');
    lines.push('        return;');
    lines.push('      }');
    lines.push('      try {');
    lines.push('        const response = await agent.run(input);');
    lines.push('        console.log(response);');
    lines.push('      } catch (err) {');
    lines.push("        console.error('Error:', err);");
    lines.push('      }');
    lines.push('      ask();');
    lines.push('    });');
    lines.push('  };');
    lines.push('  ask();');
    lines.push('}');
    lines.push('');
    lines.push('main().catch(console.error);');

    return lines.join('\n');
  }

  // ─── Code Generation (Python) ───────────────────────────────────────

  private emitAgentScriptPython(compositionName: string): string {
    const lines: string[] = [];
    lines.push('"""');
    lines.push(`${compositionName} — Agent Inference Script`);
    lines.push('Generated by HoloScript AgentInferenceCompiler');
    lines.push('"""');
    lines.push('');
    lines.push('import os');
    lines.push('import json');
    lines.push('import anthropic');
    lines.push('from tools import TOOLS, execute_tool_call');
    lines.push('');

    for (const agent of this.agents) {
      const className = this.toPascalCase(agent.name);
      lines.push('');
      lines.push(`class ${className}Agent:`);
      lines.push(`    """${agent.role} agent."""`);
      lines.push('');
      lines.push('    def __init__(self, api_key: str | None = None):');
      lines.push('        self.client = anthropic.Anthropic(');
      lines.push("            api_key=api_key or os.environ.get('ANTHROPIC_API_KEY')");
      lines.push('        )');
      lines.push(`        self.system_prompt = ${JSON.stringify(agent.modelConfig.systemPrompt)}`);
      lines.push('        self.messages: list[dict] = []');

      // State properties
      for (const prop of agent.stateProperties) {
        lines.push(`        self.${prop.key} = ${JSON.stringify(prop.defaultValue)}`);
      }

      lines.push('');
      lines.push('    def run(self, user_message: str) -> str:');
      lines.push("        self.messages.append({'role': 'user', 'content': user_message})");
      lines.push('');
      lines.push('        response = self.client.messages.create(');
      lines.push(`            model=${JSON.stringify(agent.modelConfig.name)},`);
      lines.push(`            max_tokens=${agent.modelConfig.maxTokens},`);
      lines.push(`            temperature=${agent.modelConfig.temperature},`);
      lines.push('            system=self.system_prompt,');
      lines.push('            messages=self.messages,');
      if (agent.tools.length > 0) {
        lines.push('            tools=TOOLS,');
      }
      lines.push('        )');
      lines.push('');

      if (agent.tools.length > 0) {
        lines.push("        while response.stop_reason == 'tool_use':");
        lines.push('            tool_results = []');
        lines.push('            for block in response.content:');
        lines.push("                if block.type == 'tool_use':");
        lines.push('                    result = execute_tool_call(block.name, block.input)');
        lines.push('                    tool_results.append({');
        lines.push("                        'type': 'tool_result',");
        lines.push("                        'tool_use_id': block.id,");
        lines.push("                        'content': str(result),");
        lines.push('                    })');
        lines.push('');
        lines.push(
          "            self.messages.append({'role': 'assistant', 'content': response.content})"
        );
        lines.push("            self.messages.append({'role': 'user', 'content': tool_results})");
        lines.push('');
        lines.push('            response = self.client.messages.create(');
        lines.push(`                model=${JSON.stringify(agent.modelConfig.name)},`);
        lines.push(`                max_tokens=${agent.modelConfig.maxTokens},`);
        lines.push(`                temperature=${agent.modelConfig.temperature},`);
        lines.push('                system=self.system_prompt,');
        lines.push('                messages=self.messages,');
        lines.push('                tools=TOOLS,');
        lines.push('            )');
        lines.push('');
      }

      lines.push(
        "        self.messages.append({'role': 'assistant', 'content': response.content})"
      );
      lines.push("        text_blocks = [b.text for b in response.content if b.type == 'text']");
      lines.push("        return '\\n'.join(text_blocks)");
      lines.push('');
      lines.push('    def reset(self):');
      lines.push('        self.messages = []');
      lines.push('');
    }

    // Main
    const primaryAgent = this.agents[0];
    lines.push('');
    lines.push("if __name__ == '__main__':");
    lines.push(`    agent = ${this.toPascalCase(primaryAgent.name)}Agent()`);
    lines.push(
      `    print('${this.escapeStringValue(compositionName, 'Python')} agent ready. Type a message or "quit" to exit.')`
    );
    lines.push('    while True:');
    lines.push("        user_input = input('> ')");
    lines.push("        if user_input.strip().lower() == 'quit':");
    lines.push('            break');
    lines.push('        try:');
    lines.push('            print(agent.run(user_input))');
    lines.push('        except Exception as e:');
    lines.push("            print(f'Error: {e}')");

    return lines.join('\n');
  }

  // ─── Tool Definitions ───────────────────────────────────────────────

  private emitToolDefinitions(allTools: ToolDefinition[]): string {
    if (this.options.language === 'python') {
      return this.emitToolDefinitionsPython(allTools);
    }
    return this.emitToolDefinitionsTypeScript(allTools);
  }

  private emitToolDefinitionsTypeScript(allTools: ToolDefinition[]): string {
    const lines: string[] = [];
    lines.push('/**');
    lines.push(' * Tool definitions for agent inference');
    lines.push(' * Generated by HoloScript AgentInferenceCompiler');
    lines.push(' */');
    lines.push('');
    lines.push("import Anthropic from '@anthropic-ai/sdk';");
    lines.push('');

    // Tool name union type
    const toolNames = allTools.map((t) => `'${t.name}'`);
    lines.push(`export type ToolName = ${toolNames.join(' | ')};`);
    lines.push('');

    // Tool definitions array
    lines.push('export const tools: Anthropic.Tool[] = [');
    for (const tool of allTools) {
      lines.push('  {');
      lines.push(`    name: ${JSON.stringify(tool.name)},`);
      lines.push(`    description: ${JSON.stringify(tool.description)},`);
      lines.push('    input_schema: {');
      lines.push("      type: 'object' as const,");
      lines.push('      properties: {');
      for (const param of tool.parameters) {
        lines.push(`        ${param.name}: {`);
        lines.push(`          type: ${JSON.stringify(this.toJsonSchemaType(param.type))},`);
        lines.push(`          description: ${JSON.stringify(param.description)},`);
        lines.push('        },');
      }
      lines.push('      },');
      const required = tool.parameters.filter((p) => p.required).map((p) => `'${p.name}'`);
      if (required.length > 0) {
        lines.push(`      required: [${required.join(', ')}],`);
      }
      lines.push('    },');
      lines.push('  },');
    }
    lines.push('];');
    lines.push('');

    // Tool execution dispatcher
    lines.push('export async function executeToolCall(');
    lines.push('  name: ToolName,');
    lines.push('  input: Record<string, unknown>');
    lines.push('): Promise<unknown> {');
    lines.push('  switch (name) {');
    for (const tool of allTools) {
      lines.push(`    case ${JSON.stringify(tool.name)}:`);
      lines.push(`      // TODO: Implement ${tool.name}`);
      lines.push(`      return \`[${tool.name}] called with: \${JSON.stringify(input)}\`;`);
    }
    lines.push('    default:');
    lines.push('      return `Unknown tool: ${name}`;');
    lines.push('  }');
    lines.push('}');

    return lines.join('\n');
  }

  private emitToolDefinitionsPython(allTools: ToolDefinition[]): string {
    const lines: string[] = [];
    lines.push('"""');
    lines.push('Tool definitions for agent inference');
    lines.push('Generated by HoloScript AgentInferenceCompiler');
    lines.push('"""');
    lines.push('');
    lines.push('');
    lines.push('TOOLS = [');
    for (const tool of allTools) {
      lines.push('    {');
      lines.push(`        "name": ${JSON.stringify(tool.name)},`);
      lines.push(`        "description": ${JSON.stringify(tool.description)},`);
      lines.push('        "input_schema": {');
      lines.push('            "type": "object",');
      lines.push('            "properties": {');
      for (const param of tool.parameters) {
        lines.push(`                ${JSON.stringify(param.name)}: {`);
        lines.push(
          `                    "type": ${JSON.stringify(this.toJsonSchemaType(param.type))},`
        );
        lines.push(`                    "description": ${JSON.stringify(param.description)},`);
        lines.push('                },');
      }
      lines.push('            },');
      const required = tool.parameters.filter((p) => p.required).map((p) => JSON.stringify(p.name));
      if (required.length > 0) {
        lines.push(`            "required": [${required.join(', ')}],`);
      }
      lines.push('        },');
      lines.push('    },');
    }
    lines.push(']');
    lines.push('');
    lines.push('');
    lines.push('def execute_tool_call(name: str, tool_input: dict) -> str:');
    for (const tool of allTools) {
      lines.push(`    if name == ${JSON.stringify(tool.name)}:`);
      lines.push(`        # TODO: Implement ${tool.name}`);
      lines.push(`        return f"[${tool.name}] called with: {tool_input}"`);
    }
    lines.push(`    return f"Unknown tool: {name}"`);

    return lines.join('\n');
  }

  // ─── Config & Package Files ─────────────────────────────────────────

  private emitConfigJson(): string {
    const configs = this.agents.map((a) => ({
      name: a.name,
      role: a.role,
      model: {
        provider: a.modelConfig.provider,
        name: a.modelConfig.name,
        temperature: a.modelConfig.temperature,
        max_tokens: a.modelConfig.maxTokens,
        top_p: a.modelConfig.topP,
        top_k: a.modelConfig.topK,
      },
      system_prompt: a.modelConfig.systemPrompt,
      tools: a.tools.map((t) => t.name),
    }));

    return JSON.stringify({ agents: configs }, null, 2);
  }

  private emitPackageJson(compositionName: string): string {
    const pkg = {
      name: this.toKebabCase(compositionName) + '-agent',
      version: '1.0.0',
      description: `Agent inference script for ${compositionName}`,
      type: 'module',
      scripts: {
        start: 'tsx agent.ts',
        build: 'tsc',
      },
      dependencies: {
        '@anthropic-ai/sdk': '^0.39.0',
      },
      devDependencies: {
        tsx: '^4.0.0',
        typescript: '^5.5.0',
        '@types/node': '^20.0.0',
      },
    };

    // Add provider-specific dependencies
    const providers = new Set(this.agents.map((a) => a.modelConfig.provider));
    if (providers.has('openai')) {
      // @ts-expect-error During migration
      pkg.dependencies = { ...pkg.dependencies, openai: '^4.0.0' } as Record<string, string>;
    }

    return JSON.stringify(pkg, null, 2);
  }

  private emitRequirementsTxt(): string {
    const deps = ['anthropic>=0.39.0'];
    const providers = new Set(this.agents.map((a) => a.modelConfig.provider));
    if (providers.has('openai')) {
      deps.push('openai>=1.0.0');
    }
    return deps.join('\n') + '\n';
  }

  private emitEnvTemplate(): string {
    const lines: string[] = [];
    lines.push('# Agent API Keys');
    const providers = new Set(this.agents.map((a) => a.modelConfig.provider));
    if (providers.has('anthropic')) {
      lines.push('ANTHROPIC_API_KEY=sk-ant-...');
    }
    if (providers.has('openai')) {
      lines.push('OPENAI_API_KEY=sk-...');
    }
    if (providers.has('ollama')) {
      lines.push('OLLAMA_HOST=http://localhost:11434');
    }
    return lines.join('\n') + '\n';
  }

  private emitTypeDefinitions(): string {
    return `/**
 * Type definitions for agent inference
 * Generated by HoloScript AgentInferenceCompiler
 */

export interface AgentConfig {
  name: string;
  role: string;
  model: {
    provider: string;
    name: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    top_k: number;
  };
  system_prompt: string;
  tools: string[];
}

export interface AgentState {
  [key: string]: string | number | boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}
`;
  }

  private emitReadme(compositionName: string): string {
    const ext = this.options.language === 'typescript' ? 'ts' : 'py';
    const lines: string[] = [];
    lines.push(`# ${compositionName} Agent`);
    lines.push('');
    lines.push('Generated by HoloScript AgentInferenceCompiler.');
    lines.push('');
    lines.push('## Setup');
    lines.push('');

    if (this.options.language === 'typescript') {
      lines.push('```bash');
      lines.push('npm install');
      lines.push('cp .env.example .env');
      lines.push('# Edit .env with your API key');
      lines.push('npm start');
      lines.push('```');
    } else {
      lines.push('```bash');
      lines.push('pip install -r requirements.txt');
      lines.push('cp .env.example .env');
      lines.push('# Edit .env with your API key');
      lines.push(`python agent.py`);
      lines.push('```');
    }

    lines.push('');
    lines.push('## Agents');
    lines.push('');
    for (const agent of this.agents) {
      lines.push(`### ${agent.name}`);
      lines.push(`- **Role**: ${agent.role}`);
      lines.push(`- **Model**: ${agent.modelConfig.name}`);
      lines.push(
        `- **Tools**: ${agent.tools.length > 0 ? agent.tools.map((t) => t.name).join(', ') : 'none'}`
      );
      lines.push('');
    }

    return lines.join('\n');
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private extractStringValue(value: HoloValue | undefined): string | null {
    if (typeof value === 'string') return value;
    return null;
  }

  private extractNumberValue(value: HoloValue | undefined): number | null {
    if (typeof value === 'number') return value;
    return null;
  }

  private isModelProvider(value: string): value is ModelProvider {
    return ['anthropic', 'openai', 'local', 'ollama', 'custom'].includes(value);
  }

  private toJsonSchemaType(type: string): string {
    switch (type.toLowerCase()) {
      case 'number':
      case 'float':
      case 'int':
      case 'integer':
        return 'number';
      case 'boolean':
      case 'bool':
        return 'boolean';
      case 'array':
      case 'list':
        return 'array';
      case 'object':
      case 'dict':
      case 'map':
        return 'object';
      default:
        return 'string';
    }
  }

  private toPascalCase(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^(.)/, (_, c: string) => c.toUpperCase());
  }

  private toSnakeCase(name: string): string {
    return name
      .replace(/([A-Z])/g, '_$1')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_/, '')
      .toLowerCase();
  }

  private toKebabCase(name: string): string {
    return name
      .replace(/([A-Z])/g, '-$1')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-/, '')
      .toLowerCase();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/** Create an agent inference compiler with TypeScript output. */
export function createAgentInferenceCompiler(
  options?: AgentInferenceCompilerOptions
): AgentInferenceCompiler {
  return new AgentInferenceCompiler(options);
}

/** Create an agent inference compiler with Python output. */
export function createPythonAgentInferenceCompiler(
  options?: Omit<AgentInferenceCompilerOptions, 'language'>
): AgentInferenceCompiler {
  return new AgentInferenceCompiler({ ...options, language: 'python' });
}

export default AgentInferenceCompiler;
