/**
 * SimContractGate — SimulationContract grounding for Brittney scene mutations.
 *
 * Every BRITTNEY scene-mutation tool call routes through binary pass/fail
 * verification before the mutation is emitted to the client. This is the
 * application-side seam of Algebraic Trust (W.GOLD.188 + W.GOLD.189): the
 * algebra layer is `@holoscript/engine/simulation/SimulationContract`; this
 * gate is how user-facing scene operations get pre-checked against it.
 *
 * Resolution policy:
 *   • Scene declares no contract  → pass through with contractId='unscoped'.
 *   • Scene declares a contract X → look it up via the resolver:
 *       - resolved   → run schema invariants, return pass/fail.
 *       - unresolved → fail-closed (W.GOLD.193 threat-model-driven defaults).
 *
 * The gate is intentionally agnostic of the live `ContractedSimulation`
 * runtime in @holoscript/engine — the route is stateless and never owns a
 * solver. The contract referenced by a scene is a static schema; runtime
 * SimulationContract enforcement happens elsewhere (engine, replay).
 */

export const BRITTNEY_MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'add_trait',
  'remove_trait',
  'set_trait_property',
  'create_object',
  'compose_traits',
  'mount_scenario_panel',
  'delete_object',
  'move_object',
  'rotate_object',
  'scale_object',
  'rename_object',
  'duplicate_object',
]);

export const BRITTNEY_READONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'list_objects',
  'get_object',
]);

export const UNSCOPED_CONTRACT_ID = 'unscoped';

export interface SceneMutation {
  tool: string;
  input: Record<string, unknown>;
}

export interface SimContractCheckResult {
  passed: boolean;
  contractId: string;
  mutation: SceneMutation;
  reason?: string;
}

export interface ResolvedContract {
  id: string;
  /** Object names the contract requires to remain in the scene. */
  requiredObjects?: string[];
  /** Per-object trait names the contract requires to remain attached. */
  requiredTraits?: Record<string, string[]>;
  /** Trait names the contract forbids from being attached. */
  forbiddenTraits?: string[];
  /** Per-trait property bounds. Numeric only; string/bool properties skip bounds. */
  propertyBounds?: Record<string, Record<string, { min?: number; max?: number }>>;
}

/**
 * Resolves a contract reference to a definition. Default is a no-op that
 * always returns null, which forces fail-closed at the caller. Tests and
 * upstream registration code inject populated resolvers.
 */
export type ContractResolver = (ref: string) => ResolvedContract | null;

const defaultResolver: ContractResolver = () => null;

export function isSceneMutationTool(toolName: string): boolean {
  return BRITTNEY_MUTATION_TOOL_NAMES.has(toolName);
}

/**
 * Pre-validate a scene mutation against the SimulationContract declared by
 * the scene. Returns binary pass/fail with the contractId carried through
 * for SSE/CAEL audit trails.
 */
export function verifySceneMutation(
  sceneContext: string | undefined,
  mutation: SceneMutation,
  resolver: ContractResolver = defaultResolver
): SimContractCheckResult {
  const declared = parseDeclaredContractRef(sceneContext);

  if (!declared) {
    return { passed: true, contractId: UNSCOPED_CONTRACT_ID, mutation };
  }

  const contract = resolver(declared);
  if (!contract) {
    return {
      passed: false,
      contractId: declared,
      mutation,
      reason: `Scene references SimulationContract "${declared}" but it cannot be resolved (fail-closed per W.GOLD.193)`,
    };
  }

  return checkInvariants(contract, mutation);
}

/**
 * Extract a SimulationContract reference from HoloScript-flavoured scene
 * context. Recognises two forms:
 *   1. A `@simulation_contract { id: "ref" }` trait block on any object.
 *   2. A top-level `simulation_contract: "ref"` declaration.
 */
function parseDeclaredContractRef(sceneContext: string | undefined): string | null {
  if (!sceneContext) return null;
  const traitMatch = sceneContext.match(
    /@simulation_contract\s*\{[^}]*id\s*:\s*"([^"]+)"/
  );
  if (traitMatch) return traitMatch[1];
  const topMatch = sceneContext.match(/^\s*simulation_contract\s*:\s*"([^"]+)"/m);
  if (topMatch) return topMatch[1];
  return null;
}

function checkInvariants(
  contract: ResolvedContract,
  mutation: SceneMutation
): SimContractCheckResult {
  const { tool, input } = mutation;
  const objName = typeof input.object_name === 'string' ? input.object_name : '';
  const traitName = typeof input.trait_name === 'string' ? input.trait_name : '';

  if (tool === 'delete_object' || tool === 'rename_object') {
    if (objName && contract.requiredObjects?.includes(objName)) {
      return {
        passed: false,
        contractId: contract.id,
        mutation,
        reason: `${tool} on "${objName}" violates contract: object is required`,
      };
    }
  }

  if (tool === 'remove_trait') {
    const required = contract.requiredTraits?.[objName] ?? [];
    if (traitName && required.includes(traitName)) {
      return {
        passed: false,
        contractId: contract.id,
        mutation,
        reason: `remove_trait "${traitName}" on "${objName}" violates contract: trait is required`,
      };
    }
  }

  if (tool === 'add_trait' || tool === 'compose_traits') {
    const forbidden = contract.forbiddenTraits ?? [];
    const candidates =
      tool === 'compose_traits'
        ? Array.isArray(input.trait_names)
          ? (input.trait_names as unknown[]).filter((t): t is string => typeof t === 'string')
          : []
        : traitName
          ? [traitName]
          : [];
    const violation = candidates.find((t) => forbidden.includes(t));
    if (violation) {
      return {
        passed: false,
        contractId: contract.id,
        mutation,
        reason: `${tool} "${violation}" violates contract: trait is forbidden`,
      };
    }
  }

  if (tool === 'set_trait_property') {
    const key = typeof input.property_key === 'string' ? input.property_key : '';
    const value = input.property_value;
    const bounds = contract.propertyBounds?.[traitName]?.[key];
    if (bounds && typeof value === 'number') {
      if (bounds.min !== undefined && value < bounds.min) {
        return {
          passed: false,
          contractId: contract.id,
          mutation,
          reason: `${traitName}.${key}=${value} violates contract: below minimum ${bounds.min}`,
        };
      }
      if (bounds.max !== undefined && value > bounds.max) {
        return {
          passed: false,
          contractId: contract.id,
          mutation,
          reason: `${traitName}.${key}=${value} violates contract: above maximum ${bounds.max}`,
        };
      }
    }
  }

  return { passed: true, contractId: contract.id, mutation };
}
