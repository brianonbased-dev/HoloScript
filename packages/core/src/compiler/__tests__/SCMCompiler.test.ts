import { describe, it, expect, vi } from 'vitest';
import { SCMCompiler } from '../SCMCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../../parser/HoloCompositionTypes';
import { readJson } from '../../errors/safeJsonParse';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('SCMCompiler (Structural Causal Model)', () => {
  it('should compile HoloScript objects into a valid SCM-DAG format', () => {
    const composition: HoloComposition = {
      name: 'Test_Causal_Scene',
      environment: {
        skybox: 'day',
        lighting: 'bright',
        properties: [],
      },
      objects: [
        {
          name: 'Agent_1',
          traits: [{ name: 'ai_agent' }],
          properties: [{ key: 'health', value: 100 }],
        },
        {
          name: 'Potion_Heal',
          traits: [{ name: 'grabbable' }],
          properties: [
            { key: 'power', value: 50 },
            { key: 'color', value: 'red' },
          ],
        },
      ],
      spatialGroups: [
        {
          name: 'Room_A',
          properties: [],
          objects: [
            {
              name: 'Chest',
              traits: [{ name: 'interactive' }, { name: 'causal' }],
              properties: [{ key: 'locked', value: true }],
            },
          ],
        },
      ],
      templates: [],
    } as unknown as HoloComposition;

    const compiler = new SCMCompiler();
    const resultJson = compiler.compile(composition, 'test-token');
    const parsed = readJson(resultJson);

    // Validate Metadata
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.model_name).toBe('HoloScript_SCM_DAG');
    expect(parsed.metadata.generated_at).toBeDefined();

    // Validate Nodes
    expect(parsed.nodes).toHaveLength(3); // Agent_1, Potion_Heal, Chest

    const agentNode = parsed.nodes.find((n: any) => n.id === 'Agent_1');
    expect(agentNode).toBeDefined();
    expect(agentNode.type).toBe('mechanism_variable');
    expect(agentNode.do_capable).toBe(true);
    expect(agentNode.properties.health).toBe(100);
    expect(agentNode.properties.context_group).toBe('global');

    const potionNode = parsed.nodes.find((n: any) => n.id === 'Potion_Heal');
    expect(potionNode).toBeDefined();
    expect(potionNode.type).toBe('static_variable'); // Not causal/ai
    expect(potionNode.do_capable).toBe(false);
    expect(potionNode.properties.power).toBe(50);
    expect(potionNode.properties.color).toBe('red');

    const chestNode = parsed.nodes.find((n: any) => n.id === 'Chest');
    expect(chestNode).toBeDefined();
    expect(chestNode.type).toBe('mechanism_variable'); // Has 'causal' trait
    expect(chestNode.do_capable).toBe(true);
    expect(chestNode.properties.locked).toBe(true);
    expect(chestNode.properties.context_group).toBe('Room_A'); // Extracted from spatial group

    // Validate Edges
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].source).toBe('Room_A');
    expect(parsed.edges[0].target).toBe('Chest');
    expect(parsed.edges[0].relation).toBe('dictates_context');
    expect(parsed.edges[0].weight).toBe(1.0);
  });
});
