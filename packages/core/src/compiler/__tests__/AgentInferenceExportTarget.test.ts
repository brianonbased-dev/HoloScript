import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentInferenceCompiler,
  createAgentInferenceCompiler,
  createPythonAgentInferenceCompiler,
} from '../AgentInferenceExportTarget';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { readJson } from '../../errors/safeJsonParse';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeComposition(overrides?: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestAgent',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  };
}

function makeAgentComposition(): HoloComposition {
  return makeComposition({
    name: 'SupportBot',
    objects: [
      {
        type: 'Object',
        name: 'MainAgent',
        properties: [],
        traits: [
          {
            type: 'ObjectTrait',
            name: 'agent',
            config: { role: 'customer_support' },
          },
          {
            type: 'ObjectTrait',
            name: 'model',
            config: {
              provider: 'anthropic',
              name: 'claude-sonnet-4-6',
              temperature: 0.5,
              max_tokens: 2048,
            },
          },
          {
            type: 'ObjectTrait',
            name: 'system_prompt',
            config: {
              text: 'You are a helpful customer support agent for Acme Corp.',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'tool',
            config: {
              name: 'lookup_order',
              description: 'Look up an order by its ID',
              parameters: [
                {
                  name: 'order_id',
                  type: 'string',
                  description: 'The order identifier',
                  required: true,
                },
              ],
              returns: 'object',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'tool',
            config: {
              name: 'process_refund',
              description: 'Process a refund for an order',
              parameters: [
                {
                  name: 'order_id',
                  type: 'string',
                  description: 'The order identifier',
                  required: true,
                },
                {
                  name: 'amount',
                  type: 'number',
                  description: 'Refund amount',
                  required: true,
                },
              ],
            },
          },
        ],
        state: {
          type: 'State',
          properties: [
            { type: 'StateProperty', key: 'conversationCount', value: 0 },
            { type: 'StateProperty', key: 'agentName', value: 'Support Bot' },
          ],
        },
      },
    ],
  });
}

function makeNPCComposition(): HoloComposition {
  return makeComposition({
    name: 'NPCWorld',
    npcs: [
      {
        type: 'NPC',
        name: 'Merchant',
        npcType: 'shopkeeper',
        properties: [{ type: 'NPCProperty', key: 'greeting', value: 'Welcome to my shop!' }],
        behaviors: [
          {
            type: 'Behavior',
            name: 'sell_item',
            trigger: 'on_interact',
            actions: [{ type: 'BehaviorAction', actionType: 'emit', config: {} }],
            priority: 1,
          },
        ],
        dialogueTree: 'MerchantDialogue',
      },
    ],
    dialogues: [
      {
        type: 'Dialogue',
        name: 'MerchantDialogue',
        nodes: [
          { type: 'DialogueNode', name: 'greeting', text: 'What can I help you with?' },
          { type: 'DialogueNode', name: 'farewell', text: 'Come back soon!' },
        ],
      } as unknown as HoloComposition['dialogues'][0],
    ],
  });
}

function makeMultiAgentComposition(): HoloComposition {
  return makeComposition({
    name: 'MultiAgentSystem',
    objects: [
      {
        type: 'Object',
        name: 'Researcher',
        properties: [],
        traits: [
          { type: 'ObjectTrait', name: 'agent', config: { role: 'researcher' } },
          {
            type: 'ObjectTrait',
            name: 'model',
            config: { provider: 'anthropic', name: 'claude-sonnet-4-6' },
          },
          {
            type: 'ObjectTrait',
            name: 'system_prompt',
            config: { text: 'You are a research agent.' },
          },
        ],
      },
      {
        type: 'Object',
        name: 'Writer',
        properties: [],
        traits: [
          { type: 'ObjectTrait', name: 'agent', config: { role: 'writer' } },
          {
            type: 'ObjectTrait',
            name: 'model',
            config: { provider: 'openai', name: 'gpt-4o', temperature: 0.9 },
          },
          {
            type: 'ObjectTrait',
            name: 'prompt',
            config: { content: 'You are a creative writer.' },
          },
        ],
      },
    ],
  });
}

// ─── Constructor & Defaults ───────────────────────────────────────────────────

describe('AgentInferenceCompiler — constructor', () => {
  it('creates an instance with default options', () => {
    const compiler = new AgentInferenceCompiler();
    expect(compiler).toBeInstanceOf(AgentInferenceCompiler);
  });

  it('accepts custom options', () => {
    const compiler = new AgentInferenceCompiler({
      language: 'python',
      defaultProvider: 'openai',
      defaultTemperature: 0.3,
    });
    expect(compiler).toBeInstanceOf(AgentInferenceCompiler);
  });
});

// ─── compile() — TypeScript output ──────────────────────────────────────────

describe('compile() — TypeScript output', () => {
  let compiler: AgentInferenceCompiler;

  beforeEach(() => {
    compiler = new AgentInferenceCompiler({ language: 'typescript' });
  });

  it('generates output files for an agent composition', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result).toHaveProperty('agent.ts');
    expect(result).toHaveProperty('tools.ts');
    expect(result).toHaveProperty('config.json');
    expect(result).toHaveProperty('package.json');
    expect(result).toHaveProperty('types.ts');
    expect(result).toHaveProperty('.env.example');
    expect(result).toHaveProperty('README.md');
  });

  it('agent.ts contains the agent class', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.ts']).toContain('class MainAgentAgent');
    expect(result['agent.ts']).toContain('SupportBot');
  });

  it('agent.ts contains model configuration', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.ts']).toContain('claude-sonnet-4-6');
    expect(result['agent.ts']).toContain('0.5');
    expect(result['agent.ts']).toContain('2048');
  });

  it('agent.ts contains system prompt', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.ts']).toContain('helpful customer support agent');
  });

  it('tools.ts contains tool definitions', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['tools.ts']).toContain('lookup_order');
    expect(result['tools.ts']).toContain('process_refund');
    expect(result['tools.ts']).toContain('order_id');
    expect(result['tools.ts']).toContain('Look up an order by its ID');
  });

  it('tools.ts has ToolName union type', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['tools.ts']).toContain("'lookup_order'");
    expect(result['tools.ts']).toContain("'process_refund'");
  });

  it('tools.ts has executeToolCall function', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['tools.ts']).toContain('executeToolCall');
  });

  it('config.json contains agent configuration', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    const config = readJson(result['config.json']);
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('MainAgent');
    expect(config.agents[0].role).toBe('customer_support');
    expect(config.agents[0].model.temperature).toBe(0.5);
    expect(config.agents[0].model.max_tokens).toBe(2048);
    expect(config.agents[0].tools).toContain('lookup_order');
  });

  it('package.json has anthropic SDK dependency', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    const pkg = readJson(result['package.json']);
    expect(pkg.dependencies['@anthropic-ai/sdk']).toBeDefined();
    expect(pkg.name).toBe('support-bot-agent');
  });

  it('.env.example has ANTHROPIC_API_KEY', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['.env.example']).toContain('ANTHROPIC_API_KEY');
  });

  it('agent.ts includes tool use loop when tools exist', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.ts']).toContain('tool_use');
    expect(result['agent.ts']).toContain('executeToolCall');
  });

  it('agent.ts has main entry point with readline', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.ts']).toContain('main()');
    expect(result['agent.ts']).toContain('readline');
  });
});

// ─── compile() — Python output ──────────────────────────────────────────────

describe('compile() — Python output', () => {
  let compiler: AgentInferenceCompiler;

  beforeEach(() => {
    compiler = new AgentInferenceCompiler({ language: 'python' });
  });

  it('generates Python files', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result).toHaveProperty('agent.py');
    expect(result).toHaveProperty('tools.py');
    expect(result).toHaveProperty('config.json');
    expect(result).toHaveProperty('requirements.txt');
  });

  it('agent.py contains Python class', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.py']).toContain('class MainAgentAgent:');
    expect(result['agent.py']).toContain('import anthropic');
  });

  it('agent.py has tool use loop', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['agent.py']).toContain("stop_reason == 'tool_use'");
    expect(result['agent.py']).toContain('execute_tool_call');
  });

  it('tools.py contains TOOLS list', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['tools.py']).toContain('TOOLS = [');
    expect(result['tools.py']).toContain('lookup_order');
    expect(result['tools.py']).toContain('def execute_tool_call');
  });

  it('requirements.txt has anthropic dependency', () => {
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result['requirements.txt']).toContain('anthropic>=0.39.0');
  });
});

// ─── NPC extraction ─────────────────────────────────────────────────────────

describe('NPC → agent extraction', () => {
  it('converts NPCs to agent definitions', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeNPCComposition(), '');
    const agents = compiler.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Merchant');
    expect(agents[0].role).toBe('shopkeeper');
  });

  it('NPC behaviors become tools', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeNPCComposition(), '');
    const agents = compiler.getAgents();
    expect(agents[0].tools).toHaveLength(1);
    expect(agents[0].tools[0].name).toBe('sell_item');
    expect(agents[0].tools[0].source).toBe('behavior');
  });

  it('NPC system prompt includes name and type', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeNPCComposition(), '');
    const agents = compiler.getAgents();
    expect(agents[0].modelConfig.systemPrompt).toContain('shopkeeper');
    expect(agents[0].modelConfig.systemPrompt).toContain('Merchant');
  });
});

// ─── Multi-agent ────────────────────────────────────────────────────────────

describe('multi-agent compositions', () => {
  it('extracts multiple agents', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeMultiAgentComposition(), '');
    const agents = compiler.getAgents();
    expect(agents).toHaveLength(2);
    expect(agents[0].name).toBe('Researcher');
    expect(agents[1].name).toBe('Writer');
  });

  it('different agents can have different providers', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeMultiAgentComposition(), '');
    const agents = compiler.getAgents();
    expect(agents[0].modelConfig.provider).toBe('anthropic');
    expect(agents[1].modelConfig.provider).toBe('openai');
  });

  it('generates agent classes for each agent', () => {
    const compiler = new AgentInferenceCompiler();
    const result = compiler.compile(makeMultiAgentComposition(), '');
    expect(result['agent.ts']).toContain('class ResearcherAgent');
    expect(result['agent.ts']).toContain('class WriterAgent');
  });

  it('config.json has all agents', () => {
    const compiler = new AgentInferenceCompiler();
    const result = compiler.compile(makeMultiAgentComposition(), '');
    const config = readJson(result['config.json']);
    expect(config.agents).toHaveLength(2);
  });
});

// ─── Default agent fallback ─────────────────────────────────────────────────

describe('default agent fallback', () => {
  it('creates a default agent when no @agent traits exist', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeComposition({ name: 'EmptyScene' }), '');
    const agents = compiler.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('EmptyScene');
  });

  it('warns when falling back to default agent', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeComposition(), '');
    const warnings = compiler.getWarnings();
    expect(warnings.some((w) => w.includes('No @agent traits found'))).toBe(true);
  });

  it('default agent still generates valid output', () => {
    const compiler = new AgentInferenceCompiler();
    const result = compiler.compile(makeComposition({ name: 'EmptyScene' }), '');
    expect(result['agent.ts']).toContain('class EmptySceneAgent');
    expect(result['config.json']).toBeDefined();
  });
});

// ─── Model config ───────────────────────────────────────────────────────────

describe('model configuration extraction', () => {
  it('extracts temperature from @model trait', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeAgentComposition(), '');
    const agents = compiler.getAgents();
    expect(agents[0].modelConfig.temperature).toBe(0.5);
  });

  it('extracts max_tokens from @model trait', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeAgentComposition(), '');
    const agents = compiler.getAgents();
    expect(agents[0].modelConfig.maxTokens).toBe(2048);
  });

  it('uses default values when traits do not specify them', () => {
    const compiler = new AgentInferenceCompiler({
      defaultTemperature: 0.3,
      defaultMaxTokens: 1024,
    });
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'MinimalAgent',
          properties: [],
          traits: [{ type: 'ObjectTrait', name: 'agent', config: { role: 'helper' } }],
        },
      ],
    });
    compiler.compile(comp, '');
    const agents = compiler.getAgents();
    expect(agents[0].modelConfig.temperature).toBe(0.3);
    expect(agents[0].modelConfig.maxTokens).toBe(1024);
  });
});

// ─── State properties ───────────────────────────────────────────────────────

describe('state property extraction', () => {
  it('extracts state properties from objects', () => {
    const compiler = new AgentInferenceCompiler();
    compiler.compile(makeAgentComposition(), '');
    const agents = compiler.getAgents();
    expect(agents[0].stateProperties).toHaveLength(2);
    expect(agents[0].stateProperties[0].key).toBe('conversationCount');
    expect(agents[0].stateProperties[1].key).toBe('agentName');
  });
});

// ─── Factory functions ──────────────────────────────────────────────────────

describe('factory functions', () => {
  it('createAgentInferenceCompiler returns an instance', () => {
    const compiler = createAgentInferenceCompiler();
    expect(compiler).toBeInstanceOf(AgentInferenceCompiler);
  });

  it('createPythonAgentInferenceCompiler generates Python output', () => {
    const compiler = createPythonAgentInferenceCompiler();
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result).toHaveProperty('agent.py');
    expect(result).not.toHaveProperty('agent.ts');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles objects with no traits gracefully', () => {
    const compiler = new AgentInferenceCompiler();
    const comp = makeComposition({
      objects: [{ type: 'Object', name: 'Cube', properties: [], traits: [] }],
    });
    const result = compiler.compile(comp, '');
    expect(result['agent.ts']).toBeDefined();
  });

  it('handles empty composition', () => {
    const compiler = new AgentInferenceCompiler();
    const result = compiler.compile(makeComposition(), '');
    expect(result['agent.ts']).toBeDefined();
    expect(result['config.json']).toBeDefined();
  });

  it('skips tools.ts when no tools exist', () => {
    const compiler = new AgentInferenceCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'SimpleAgent',
          properties: [],
          traits: [{ type: 'ObjectTrait', name: 'agent', config: { role: 'simple' } }],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    expect(result).not.toHaveProperty('tools.ts');
  });

  it('handles child objects with agent traits', () => {
    const compiler = new AgentInferenceCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'Parent',
          properties: [],
          traits: [],
          children: [
            {
              type: 'Object',
              name: 'ChildAgent',
              properties: [],
              traits: [{ type: 'ObjectTrait', name: 'agent', config: { role: 'child' } }],
            },
          ],
        },
      ],
    });
    compiler.compile(comp, '');
    const agents = compiler.getAgents();
    expect(agents.some((a) => a.name === 'ChildAgent')).toBe(true);
  });

  it('does not include types.ts when includeTypes is false', () => {
    const compiler = new AgentInferenceCompiler({ includeTypes: false });
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result).not.toHaveProperty('types.ts');
  });

  it('does not include README.md when includeReadme is false', () => {
    const compiler = new AgentInferenceCompiler({ includeReadme: false });
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result).not.toHaveProperty('README.md');
  });

  it('does not include .env.example when includeEnvTemplate is false', () => {
    const compiler = new AgentInferenceCompiler({ includeEnvTemplate: false });
    const result = compiler.compile(makeAgentComposition(), '');
    expect(result).not.toHaveProperty('.env.example');
  });
});
