import { describe, it, expect, vi } from 'vitest';
import { SCMCompiler } from '../SCMCompiler';
import type { HoloComposition } from '../../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('SCMCompiler - Privacy-Preserving Causal Discovery', () => {
  const mockComposition = {
    name: 'Sensitive_User_Session',
    environment: { skybox: 'day', lighting: 'bright', properties: [] },
    objects: [
      {
        name: 'User_Bank_Account_Button',
        traits: [{ name: 'ai_agent' }, { name: 'causal' }],
        properties: [{ key: 'account_balance', value: 50000 }],
      },
      {
        name: 'Credit_Card_Input',
        traits: [],
        properties: [{ key: 'last_four', value: '4242' }],
      },
    ],
    spatialGroups: [
      {
        name: 'Private_Payment_Window',
        properties: [],
        objects: [
          {
            name: 'Submit_Payment',
            traits: [{ name: 'causal' }],
            properties: [{ key: 'enabled', value: true }],
          },
        ],
      },
    ],
    templates: [],
  } as unknown as HoloComposition;

  it('should explicitly retain full mechanism strings and properties when the privacy mask is off', () => {
    const compiler = new SCMCompiler({ privacyMask: false });

    const resultJson = compiler.compile(mockComposition, 'test-token');
    const parsed = JSON.parse(resultJson);

    // Assert actual strings exist
    expect(resultJson).toContain('User_Bank_Account_Button');
    expect(resultJson).toContain('account_balance');
    expect(resultJson).toContain('50000');
    expect(resultJson).toContain('Private_Payment_Window');

    // Validate edge correlations directly matching raw spatial domains
    expect(parsed.edges[0].source).toBe('Private_Payment_Window');
    expect(parsed.edges[0].target).toBe('Submit_Payment');
  });

  it('should scrub all properties and hash all specific string identifiers when the privacy mask is on', () => {
    const compiler = new SCMCompiler({ privacyMask: true });

    const resultJson = compiler.compile(mockComposition, 'test-token');
    const parsed = JSON.parse(resultJson);

    // Negative assertions confirming raw logic was pruned mapping successfully securely
    expect(resultJson).not.toContain('User_Bank_Account_Button');
    expect(resultJson).not.toContain('account_balance');
    expect(resultJson).not.toContain('50000');
    expect(resultJson).not.toContain('Private_Payment_Window');
    expect(resultJson).not.toContain('Credit_Card_Input');

    // Evaluate anonymized Node ID mapping
    for (const node of parsed.nodes) {
      expect(node.id).toMatch(/^NODE_\d+$/); // Has to be a generic integer abstraction
      expect(Object.keys(node.properties)).toHaveLength(0); // Properties must be completely empty
    }

    // Evaluate anonymized edges
    // Edge targets reference object names (which ARE nodes and get anonymized).
    // Edge sources reference spatial group names (which are NOT nodes), so they
    // get the UNKNOWN_ fallback in the privacy mask. This is expected behavior:
    // group names used as edge sources don't exist in the node idMap.
    for (const edge of parsed.edges) {
      // Target is always an object name -> anonymized to NODE_\d+
      expect(edge.target).toMatch(/^NODE_\d+$/);
      // Source is a spatial group name -> falls through to UNKNOWN_ prefix
      expect(edge.source).toMatch(/^(NODE_\d+|UNKNOWN_.+)$/);
      expect(edge.weight).toBeGreaterThan(0.0);
    }

    // Mechanism (do_capable) traits should still survive allowing for logic paths!
    const doCapableNodes = parsed.nodes.filter((n: any) => n.do_capable);
    expect(doCapableNodes).toHaveLength(2); // The Bank Button and Submit Payment were `causal` explicitly.
  });
});
