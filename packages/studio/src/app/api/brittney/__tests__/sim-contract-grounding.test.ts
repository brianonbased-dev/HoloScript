/**
 * sim-contract-grounding — Paper 26 gate 1.
 *
 * Validates that the SimulationContract gate routes every Brittney scene
 * mutation through binary pass/fail verification before the route emits
 * a tool_call. Three cases the acceptance criteria call out:
 *
 *   1. Pass case        — contract resolves, mutation respects invariants.
 *   2. Fail case        — contract resolves, mutation violates an invariant.
 *   3. Unknown contract — scene declares a contract that does not resolve;
 *                          gate fails-closed per W.GOLD.193 threat-model
 *                          defaults.
 *
 * The route itself is a thin orchestration layer over `verifySceneMutation`;
 * driving the full Next.js streaming handler (Anthropic SDK + auth + rate
 * limit + credits) is out of scope for this gate test. Route-level coverage
 * lives in the route's existing integration suite — this file pins the gate
 * contract that the route depends on.
 */

import { describe, it, expect } from 'vitest';
import {
  BRITTNEY_MUTATION_TOOL_NAMES,
  BRITTNEY_READONLY_TOOL_NAMES,
  UNSCOPED_CONTRACT_ID,
  isSceneMutationTool,
  verifySceneMutation,
  type ContractResolver,
  type ResolvedContract,
} from '@/lib/brittney/SimContractGate';

// ── Test fixtures ────────────────────────────────────────────────────────────

const SCENE_WITH_CONTRACT_TRAIT = `
object "Bridge" {
  position: [0, 0, 0]
  @simulation_contract {
    id: "bridge-static-load-v1"
  }
  @structural {
    material: "steel"
  }
}
`;

const SCENE_WITH_TOP_LEVEL_CONTRACT = `
simulation_contract: "thermal-insulation-v2"

object "Furnace" {
  @thermal { material: "firebrick" }
}
`;

const SCENE_WITHOUT_CONTRACT = `
object "Cube" {
  position: [0, 0, 0]
}
`;

const BRIDGE_CONTRACT: ResolvedContract = {
  id: 'bridge-static-load-v1',
  requiredObjects: ['Bridge'],
  requiredTraits: { Bridge: ['structural'] },
  forbiddenTraits: ['glow'],
  propertyBounds: {
    structural: { load: { min: 0, max: 50000 } },
  },
};

const bridgeResolver: ContractResolver = (ref) =>
  ref === 'bridge-static-load-v1' ? BRIDGE_CONTRACT : null;

// ── Suite ────────────────────────────────────────────────────────────────────

describe('SimContractGate — tool classification', () => {
  it('identifies every BRITTNEY mutation tool as a scene mutation', () => {
    for (const name of BRITTNEY_MUTATION_TOOL_NAMES) {
      expect(isSceneMutationTool(name)).toBe(true);
    }
  });

  it('does not classify read-only tools as mutations', () => {
    for (const name of BRITTNEY_READONLY_TOOL_NAMES) {
      expect(isSceneMutationTool(name)).toBe(false);
    }
  });

  it('does not classify unrelated tool names as mutations', () => {
    expect(isSceneMutationTool('setup_simulation')).toBe(false);
    expect(isSceneMutationTool('list_objects')).toBe(false);
    expect(isSceneMutationTool('')).toBe(false);
  });
});

describe('SimContractGate — pass case (contract resolves, mutation respects invariants)', () => {
  it('passes a set_trait_property within bounds', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'set_trait_property',
        input: {
          object_name: 'Bridge',
          trait_name: 'structural',
          property_key: 'load',
          property_value: 25000,
        },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(true);
    expect(result.contractId).toBe('bridge-static-load-v1');
    expect(result.reason).toBeUndefined();
  });

  it('passes an add_trait that is not on the forbidden list', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'add_trait',
        input: { object_name: 'Bridge', trait_name: 'physics', properties: {} },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(true);
    expect(result.contractId).toBe('bridge-static-load-v1');
  });

  it('passes through unscoped when no contract is declared', () => {
    const result = verifySceneMutation(
      SCENE_WITHOUT_CONTRACT,
      { tool: 'create_object', input: { name: 'Sphere', type: 'mesh' } },
      bridgeResolver
    );
    expect(result.passed).toBe(true);
    expect(result.contractId).toBe(UNSCOPED_CONTRACT_ID);
  });

  it('passes through unscoped when sceneContext is undefined', () => {
    const result = verifySceneMutation(
      undefined,
      { tool: 'move_object', input: { object_name: 'Cube', position: [1, 0, 0] } },
      bridgeResolver
    );
    expect(result.passed).toBe(true);
    expect(result.contractId).toBe(UNSCOPED_CONTRACT_ID);
  });

  it('reads top-level simulation_contract: declarations', () => {
    const thermalResolver: ContractResolver = (ref) =>
      ref === 'thermal-insulation-v2'
        ? { id: ref, requiredObjects: ['Furnace'] }
        : null;
    const result = verifySceneMutation(
      SCENE_WITH_TOP_LEVEL_CONTRACT,
      { tool: 'add_trait', input: { object_name: 'Furnace', trait_name: 'glow' } },
      thermalResolver
    );
    expect(result.passed).toBe(true);
    expect(result.contractId).toBe('thermal-insulation-v2');
  });
});

describe('SimContractGate — fail case (contract resolves, mutation violates invariants)', () => {
  it('rejects delete_object on a required object', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      { tool: 'delete_object', input: { object_name: 'Bridge' } },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.contractId).toBe('bridge-static-load-v1');
    expect(result.reason).toMatch(/required/i);
    expect(result.reason).toContain('Bridge');
  });

  it('rejects rename_object on a required object', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'rename_object',
        input: { object_name: 'Bridge', new_name: 'Catwalk' },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/required/i);
  });

  it('rejects remove_trait on a required trait', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'remove_trait',
        input: { object_name: 'Bridge', trait_name: 'structural' },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/required/i);
    expect(result.reason).toContain('structural');
  });

  it('rejects add_trait on a forbidden trait', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      { tool: 'add_trait', input: { object_name: 'Bridge', trait_name: 'glow' } },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/forbidden/i);
  });

  it('rejects compose_traits when one of the names is forbidden', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'compose_traits',
        input: { object_name: 'Bridge', trait_names: ['physics', 'glow'] },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('glow');
  });

  it('rejects set_trait_property below the contract minimum', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'set_trait_property',
        input: {
          object_name: 'Bridge',
          trait_name: 'structural',
          property_key: 'load',
          property_value: -10,
        },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/minimum/i);
  });

  it('rejects set_trait_property above the contract maximum', () => {
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'set_trait_property',
        input: {
          object_name: 'Bridge',
          trait_name: 'structural',
          property_key: 'load',
          property_value: 100000,
        },
      },
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/maximum/i);
  });

  it('preserves the rejected mutation in the result so the route can audit it', () => {
    const mutation = {
      tool: 'delete_object' as const,
      input: { object_name: 'Bridge' },
    };
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      mutation,
      bridgeResolver
    );
    expect(result.passed).toBe(false);
    expect(result.mutation).toEqual(mutation);
  });
});

describe('SimContractGate — unknown contract (fail-closed per W.GOLD.193)', () => {
  it('fails-closed when scene declares a contract that the resolver cannot find', () => {
    const emptyResolver: ContractResolver = () => null;
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      {
        tool: 'set_trait_property',
        input: {
          object_name: 'Bridge',
          trait_name: 'structural',
          property_key: 'load',
          property_value: 100,
        },
      },
      emptyResolver
    );
    expect(result.passed).toBe(false);
    expect(result.contractId).toBe('bridge-static-load-v1');
    expect(result.reason).toContain('cannot be resolved');
    expect(result.reason).toContain('W.GOLD.193');
  });

  it('uses the default (empty) resolver when none is supplied — fail-closed', () => {
    const result = verifySceneMutation(SCENE_WITH_CONTRACT_TRAIT, {
      tool: 'create_object',
      input: { name: 'Pylon', type: 'mesh' },
    });
    expect(result.passed).toBe(false);
    expect(result.contractId).toBe('bridge-static-load-v1');
    expect(result.reason).toMatch(/fail-closed/i);
  });

  it('returns the unresolved contractId — not "unscoped" — so the SSE event traces the violation', () => {
    const result = verifySceneMutation(
      SCENE_WITH_TOP_LEVEL_CONTRACT,
      { tool: 'delete_object', input: { object_name: 'Furnace' } },
      () => null
    );
    expect(result.passed).toBe(false);
    expect(result.contractId).toBe('thermal-insulation-v2');
    expect(result.contractId).not.toBe(UNSCOPED_CONTRACT_ID);
  });
});

describe('SimContractGate — SSE event shape contract', () => {
  it('returns a result whose fields match the simContractCheck SSE payload shape', () => {
    // Pin the result fields as the route SSE payload is constructed from them.
    // Acceptance criteria: { passed, contractId, mutation, reason? }.
    const mutation = {
      tool: 'add_trait' as const,
      input: { object_name: 'Bridge', trait_name: 'glow' },
    };
    const result = verifySceneMutation(
      SCENE_WITH_CONTRACT_TRAIT,
      mutation,
      bridgeResolver
    );
    expect(result).toMatchObject({
      passed: false,
      contractId: 'bridge-static-load-v1',
      mutation,
      reason: expect.any(String),
    });
  });

  it('omits reason on pass results so SSE payload stays clean', () => {
    const result = verifySceneMutation(
      SCENE_WITHOUT_CONTRACT,
      { tool: 'create_object', input: { name: 'Plate', type: 'mesh' } }
    );
    expect(result.passed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
