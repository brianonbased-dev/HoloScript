import { describe, expect, it } from 'vitest';

import {
  OmnigentAgentYamlCompiler,
  type OmnigentWarningCode,
} from '../OmnigentAgentYamlCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'BridgeBrain',
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
  } as HoloComposition;
}

function makeBridgeComposition(): HoloComposition {
  return makeComposition({
    objects: [
      {
        type: 'Object',
        name: 'planner_agent',
        properties: [],
        traits: [
          { type: 'ObjectTrait', name: 'agent', config: { role: 'planner' } },
          {
            type: 'ObjectTrait',
            name: 'model',
            config: { provider: 'openai', name: 'gpt-4o', api_key: 'sk-test-inline-secret' },
          },
          {
            type: 'ObjectTrait',
            name: 'system_prompt',
            config: { text: 'Plan safely with owned HoloScript receipts.' },
          },
          {
            type: 'ObjectTrait',
            name: 'tool',
            config: {
              name: 'lookup_order',
              description: 'Look up an order',
              parameters: [{ name: 'order_id', type: 'string', required: true }],
            },
          },
          {
            type: 'ObjectTrait',
            name: 'mcp_connector',
            config: { name: 'holoscript_mcp', server: 'mcp.holoscript.net' },
          },
          {
            type: 'ObjectTrait',
            name: 'child_agent',
            config: { name: 'reviewer_agent', description: 'Review projected plans' },
          },
          {
            type: 'ObjectTrait',
            name: 'policy_handler',
            config: { name: 'safety_gate', handler: 'checkSafety' },
          },
          {
            type: 'ObjectTrait',
            name: 'runtime',
            config: { os: 'windows', sandbox: true, terminal: 'powershell' },
          },
        ],
      },
    ],
  });
}

describe('OmnigentAgentYamlCompiler', () => {
  it('emits Omnigent agent YAML plus a deterministic projection receipt', () => {
    const compiler = new OmnigentAgentYamlCompiler({ source: 'agent.hsplus' });
    const result = compiler.compile(makeBridgeComposition(), '');

    expect(result.agentYaml).toContain('name: planner_agent');
    expect(result.agentYaml).toContain('harness: codex');
    expect(result.agentYaml).toContain('provider: openai');
    expect(result.agentYaml).toContain('name: gpt-4o');
    expect(result.agentYaml).toContain('name: lookup_order');
    expect(result.agentYaml).toContain('name: holoscript_mcp');
    expect(result.agentYaml).toContain('name: reviewer_agent');
    expect(result.agentYaml).not.toContain('sk-test-inline-secret');

    expect(result.receipt.source).toBe('agent.hsplus');
    expect(result.receipt.target).toBe('omnigent-agent-yaml');
    expect(result.receipt.sourceHash).toMatch(/^sha256:/);
    expect(result.receipt.projectionHash).toMatch(/^sha256:/);
    expect(result.receipt.emittedFiles).toEqual([
      'generated-agent.yaml',
      'omnigent-projection-receipt.json',
    ]);
  });

  it('records bridge warnings for secrets, Windows sandbox, tool schemas, and policy provenance', () => {
    const compiler = new OmnigentAgentYamlCompiler();
    const result = compiler.compile(makeBridgeComposition(), '');
    const codes = result.receipt.warnings.map((warning) => warning.code);

    expect(codes).toEqual(
      expect.arrayContaining<OmnigentWarningCode>([
        'inline_secret_auth',
        'windows_sandbox_degraded',
        'function_tool_unowned_schema',
        'policy_missing_holoscript_provenance',
      ])
    );
  });

  it('does not warn for HoloScript-owned function schemas and policy receipts', () => {
    const compiler = new OmnigentAgentYamlCompiler();
    const result = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'owned_agent',
            properties: [],
            traits: [
              { type: 'ObjectTrait', name: 'agent', config: { role: 'planner' } },
              {
                type: 'ObjectTrait',
                name: 'tool',
                config: {
                  name: 'owned_lookup',
                  schema_owner: 'holoscript:receipt:tool-schema-v1',
                  schema: { type: 'object', properties: {} },
                },
              },
              {
                type: 'ObjectTrait',
                name: 'policy_handler',
                config: {
                  name: 'owned_policy',
                  handler: 'checkPolicy',
                  receipt_ref: 'holoscript:receipt:policy-v1',
                },
              },
            ],
          },
        ],
      }),
      ''
    );

    expect(result.receipt.warnings.map((warning) => warning.code)).not.toContain(
      'function_tool_unowned_schema'
    );
    expect(result.receipt.warnings.map((warning) => warning.code)).not.toContain(
      'policy_missing_holoscript_provenance'
    );
  });

  it('wraps compile output as YAML and receipt files', () => {
    const compiler = new OmnigentAgentYamlCompiler();
    const files = compiler.compileToFiles(makeBridgeComposition(), '');

    expect(Object.keys(files)).toEqual([
      'generated-agent.yaml',
      'omnigent-projection-receipt.json',
    ]);
    expect(files['generated-agent.yaml']).toContain('target: omnigent-agent-yaml');
    const receipt = JSON.parse(files['omnigent-projection-receipt.json']);
    expect(receipt.target).toBe('omnigent-agent-yaml');
  });
});
