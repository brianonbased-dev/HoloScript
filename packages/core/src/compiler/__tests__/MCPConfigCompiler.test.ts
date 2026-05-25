import { describe, expect, it } from 'vitest';
import { MCPConfigCompiler } from '../MCPConfigCompiler';
import type {
  HoloComposition,
  HoloDomainBlock,
  HoloObjectDecl,
  HoloObjectProperty,
  HoloObjectTrait,
  HoloValue,
} from '../../parser/HoloCompositionTypes';

interface MCPClientConfigOutput {
  _configKind: string;
  _limitations: string[];
  mcpServers: Record<string, Record<string, unknown>>;
}

function parseConfig(output: string): MCPClientConfigOutput {
  return JSON.parse(output) as MCPClientConfigOutput;
}

function prop(key: string, value: HoloValue): HoloObjectProperty {
  return { type: 'ObjectProperty', key, value };
}

function trait(name: string, config: HoloObjectTrait['config']): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

function server(
  name: string,
  properties: HoloObjectProperty[],
  traits: HoloObjectTrait[]
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties,
    traits,
    children: [],
  };
}

function makeComposition(): HoloComposition {
  const block: HoloDomainBlock = {
    type: 'DomainBlock',
    domain: 'mcp_servers',
    keyword: 'mcp_servers',
    name: 'mcp_servers',
    traits: [],
    properties: {},
    children: [
      server(
        'holoscript_remote',
        [
          prop('url', 'https://mcp.holoscript.net/mcp'),
          prop('description', 'HoloScript MCP client connection'),
        ],
        [
          trait('connector', { _arg0: 'holoscript', transport: 'http' }),
          trait('env', {
            _arg0: 'HOLOSCRIPT_API_KEY',
            header: 'Authorization: Bearer',
          }),
        ]
      ),
      server(
        'local_tools',
        [prop('command', 'npx'), prop('args', ['-y', '@example/server'])],
        [
          trait('connector', { _arg0: 'local_tools', transport: 'stdio' }),
          trait('env', { _arg0: 'LOCAL_API_KEY' }),
        ]
      ),
    ],
  };

  return {
    type: 'Composition',
    name: 'MCPConfigFidelity',
    objects: [],
    templates: [],
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
    domainBlocks: [block],
  };
}

describe('MCPConfigCompiler fidelity', () => {
  it('emits IDE client mcpServers entries, not an MCP server manifest', () => {
    const output = new MCPConfigCompiler({ target: 'generic' }).compile(makeComposition(), '');
    const config = parseConfig(output);

    expect(config._configKind).toBe('mcp-client-connection-config');
    expect(config._limitations).toContain(
      'does not emit MCP server manifests, tools, input schemas, or resources'
    );
    expect(config.mcpServers).toEqual({
      holoscript_remote: {
        url: 'https://mcp.holoscript.net/mcp',
        headers: {
          Authorization: 'Bearer ${HOLOSCRIPT_API_KEY}',
        },
        description: 'HoloScript MCP client connection',
      },
      local_tools: {
        command: 'npx',
        args: ['-y', '@example/server'],
        env: {
          LOCAL_API_KEY: '${LOCAL_API_KEY}',
        },
      },
    });
    expect(config).not.toHaveProperty('tools');
    expect(config).not.toHaveProperty('resources');
    expect(config.mcpServers.holoscript_remote).not.toHaveProperty('inputSchema');
  });

  it('injects literal credential values for Antigravity client config output', () => {
    const output = new MCPConfigCompiler({
      target: 'antigravity',
      envValues: { HOLOSCRIPT_API_KEY: 'literal-test-key' },
    }).compile(makeComposition(), '');
    const config = parseConfig(output);

    expect(config.mcpServers.holoscript_remote).toMatchObject({
      serverURL: 'https://mcp.holoscript.net/mcp',
      headers: {
        Authorization: 'Bearer literal-test-key',
      },
    });
  });
});
