/**
 * Plugin contract discipline bundle (H2).
 *
 * Three primitives that close the "freeform receipt" gap and give every plugin
 * solver the same proof-carrying guarantees the engine's ContractedSimulation
 * provides — without importing the engine or duplicating its machinery:
 *
 *   1. **PluginSolverContract** — declarative pre/inv/post clause declarations
 *      (JSON-safe data, not functions). The manifest references one by
 *      `manifest.solverContract: string`. Registered in `PluginSolverContractRegistry`.
 *
 *   2. **SolverReceiptSchemaRegistry** — maps receipt schema IDs to validator
 *      functions. A plugin registers a schema; the engine validates solver output
 *      before issuing a receipt. Without a registered schema the receipt is
 *      labeled `freeform: true` (honest) — no silent pass-through.
 *
 *   3. **wrapSolverInContract** — wraps a plugin solver function so that:
 *      - preconditions are checked before the solver runs,
 *      - postconditions are checked after,
 *      - output is validated against the registered receipt schema.
 *      Returns a `WrappedSolverResult` that carries all violations + the
 *      schema verdict — ready to feed into a `DomainSimulationReceipt`.
 *
 * ## Domain-neutrality
 *
 * No domain nouns appear here. Plugins supply their own clause IDs,
 * descriptions, and validator logic. Core only provides the skeleton.
 *
 * ## Design alignment
 *
 * - `PluginContractClause.severity` mirrors `ContractClause.severity` in engine.
 * - `PluginClauseViolation` mirrors `ClauseViolation` in engine.
 * - `PluginClauseContext` is simpler than engine's `ClauseContext` — no
 *   `getField`/`simTime` (those are engine-side FEM solver concepts). Plugin
 *   clauses observe `config` (pre-solve) and `result` (post-solve).
 */

// ── Plugin clause declaration (JSON-safe data) ────────────────────────────────

export type PluginClauseKind = 'precondition' | 'invariant' | 'postcondition';

/**
 * A single clause in a `PluginSolverContract`.
 *
 * Intentionally JSON-serializable: no function references. Evaluators
 * (the actual booleans) are registered separately via
 * `PluginSolverContractRegistry.registerEvaluator()`.
 */
export interface PluginContractClause {
  /** Stable identifier — appears in violation records and the receipt witness. */
  id: string;
  kind: PluginClauseKind;
  /** Human-readable description of what this clause asserts. */
  description: string;
  /** 'error' (default) blocks `contractVerified: true`; 'warning' does not. */
  severity?: 'error' | 'warning';
  /**
   * For `'invariant'` clauses: evaluate every N solver steps. Default: 1.
   * Ignored for preconditions / postconditions.
   */
  cadence?: number;
}

/**
 * Declarative plugin solver contract — the plugin-scope equivalent of
 * `ContractClause` sets in `SimulationContract`.
 *
 * JSON-serializable: `manifest.solverContract` references this by `id`.
 */
export interface PluginSolverContract {
  /**
   * Stable contract identifier. Must match `manifest.solverContract`.
   * Convention: `"<pluginId>-v<N>"` (e.g., `"retail-ecommerce-v1"`).
   */
  id: string;
  /** Plugin that owns this contract. Must match `manifest.id`. */
  pluginId: string;
  /** Optional human-readable summary of what this solver proves. */
  description?: string;
  /** Clauses checked before the solver runs. Failure aborts execution. */
  preconditions: PluginContractClause[];
  /** Clauses checked during each solver step. */
  invariants: PluginContractClause[];
  /** Clauses checked after the solver completes. */
  postconditions: PluginContractClause[];
}

// ── Plugin clause context ─────────────────────────────────────────────────────

/**
 * Read-only context supplied to a clause evaluator function.
 *
 * Simpler than engine's `ClauseContext` (no `getField`/`simTime`) — plugin
 * clauses observe configuration (pre-solve) and solver output (post-solve).
 */
export interface PluginClauseContext<TConfig = Record<string, unknown>, TResult = unknown> {
  /** Frozen solver configuration (always available). */
  readonly config: Readonly<TConfig>;
  /**
   * Solver result — `undefined` for preconditions, populated for postconditions.
   * Use optional chaining: `ctx.result?.fieldName`.
   */
  readonly result: Readonly<TResult> | undefined;
  /** The owning plugin's manifest id. */
  readonly pluginId: string;
}

/** Evaluator function type — returns true when the clause HOLDS. */
export type PluginClauseEvaluator<TConfig = Record<string, unknown>, TResult = unknown> = (
  ctx: PluginClauseContext<TConfig, TResult>
) => boolean;

// ── Clause violation ──────────────────────────────────────────────────────────

/** A single clause violation recorded by `wrapSolverInContract`. */
export interface PluginClauseViolation {
  clauseId: string;
  kind: PluginClauseKind;
  severity: 'error' | 'warning';
  message: string;
  pluginId: string;
}

// ── Solver receipt schema ─────────────────────────────────────────────────────

/** A single schema validation failure. */
export interface SchemaViolation {
  field: string;
  message: string;
}

/** Result of running a `ReceiptSchemaValidator`. */
export interface SchemaValidationResult {
  valid: boolean;
  violations: SchemaViolation[];
}

/** Validates a solver's raw result object against a declared output shape. */
export type ReceiptSchemaValidator = (result: unknown) => SchemaValidationResult;

/** A registered receipt schema entry. */
export interface SolverReceiptSchemaEntry {
  /** Stable schema identifier. Must match `manifest.receiptSchema`. */
  id: string;
  /** Plugin that registered this schema. */
  pluginId: string;
  /** Optional description of what fields the schema expects. */
  description?: string;
  validate: ReceiptSchemaValidator;
}

// ── Wrapped solver result ─────────────────────────────────────────────────────

/**
 * Return type of a solver wrapped by `wrapSolverInContract`.
 *
 * Carry this into `DomainSimulationReceipt.resultSummary` (or a subtype):
 * it records both the solver's native output AND the contract proof state.
 */
export interface WrappedSolverResult<TResult> {
  /** Raw solver output. */
  result: TResult;
  /**
   * True iff all error-severity preconditions and postconditions passed.
   * Warning-severity violations don't flip this to false.
   */
  contractVerified: boolean;
  /**
   * Result of schema validation.
   * - `true`  → schema registered and validation passed.
   * - `false` → schema registered but validation failed.
   * - `null`  → no schema registered (freeform; manifest.receiptSchema absent).
   */
  schemaValid: boolean | null;
  /** Schema ID that was used (null when freeform). */
  schemaId: string | null;
  /** All clause violations (error + warning). */
  clauseViolations: PluginClauseViolation[];
  /** Schema validation violations (empty when schemaValid !== false). */
  schemaViolations: SchemaViolation[];
  /** Contract ID applied to this result (null when no contract). Provenance for ComposedReceipt. */
  contractId: string | null;
  /** Plugin that owns the contract (null when no contract). Provenance for ComposedReceipt. */
  pluginId: string | null;
}

// ── PluginSolverContractRegistry ──────────────────────────────────────────────

/**
 * Registry of `PluginSolverContract` declarations and their associated
 * clause evaluators.
 *
 * Plugins call `registerContract()` during plugin registration (before scene
 * init) to declare what their solver proves. `wrapSolverInContract` consults
 * this registry at call time.
 */
export class PluginSolverContractRegistry {
  private readonly contracts = new Map<string, PluginSolverContract>();
  private readonly evaluators = new Map<string, Map<string, PluginClauseEvaluator>>();

  /**
   * Register a solver contract declaration.
   *
   * @throws If a contract with the same `id` is already registered by a
   *         different plugin.
   */
  registerContract(contract: PluginSolverContract): void {
    const existing = this.contracts.get(contract.id);
    if (existing) {
      if (existing.pluginId === contract.pluginId) return; // idempotent
      throw new Error(
        `[PluginSolverContractRegistry] Contract "${contract.id}" already registered ` +
          `by plugin "${existing.pluginId}". Cannot re-register from "${contract.pluginId}".`
      );
    }
    this.contracts.set(contract.id, contract);
  }

  /**
   * Register a clause evaluator function for a specific clause within a contract.
   *
   * @param contractId  The contract's `id`.
   * @param clauseId    The clause's `id` within that contract.
   * @param evaluator   Returns true when the clause holds.
   */
  registerEvaluator(contractId: string, clauseId: string, evaluator: PluginClauseEvaluator): void {
    if (!this.evaluators.has(contractId)) {
      this.evaluators.set(contractId, new Map());
    }
    this.evaluators.get(contractId)!.set(clauseId, evaluator);
  }

  /** Look up a registered contract by id. Returns undefined if not found. */
  getContract(id: string): PluginSolverContract | undefined {
    return this.contracts.get(id);
  }

  /** Look up a clause evaluator. Returns undefined if not registered. */
  getEvaluator(contractId: string, clauseId: string): PluginClauseEvaluator | undefined {
    return this.evaluators.get(contractId)?.get(clauseId);
  }

  /** All registered contracts (for introspection). */
  allContracts(): ReadonlyArray<PluginSolverContract> {
    return [...this.contracts.values()];
  }

  /** Count of registered contracts. */
  get size(): number {
    return this.contracts.size;
  }
}

// ── SolverReceiptSchemaRegistry ───────────────────────────────────────────────

/**
 * Registry of receipt schema validators.
 *
 * Plugins call `registerSchema()` to declare the expected shape of their
 * solver output. The engine validates `result` against the schema before
 * issuing a receipt. A solver without a registered schema emits a receipt
 * marked `freeform: true` — no silent pass.
 */
export class SolverReceiptSchemaRegistry {
  private readonly schemas = new Map<string, SolverReceiptSchemaEntry>();

  /**
   * Register a receipt schema.
   *
   * @throws If a schema with the same `id` is registered by a different plugin.
   */
  registerSchema(entry: SolverReceiptSchemaEntry): void {
    const existing = this.schemas.get(entry.id);
    if (existing) {
      if (existing.pluginId === entry.pluginId) return; // idempotent
      throw new Error(
        `[SolverReceiptSchemaRegistry] Schema "${entry.id}" already registered by ` +
          `"${existing.pluginId}". Cannot re-register from "${entry.pluginId}".`
      );
    }
    this.schemas.set(entry.id, entry);
  }

  /** Look up a schema by id. Returns undefined → caller labels receipt freeform. */
  getSchema(id: string): SolverReceiptSchemaEntry | undefined {
    return this.schemas.get(id);
  }

  /**
   * Validate `result` against the schema registered under `schemaId`.
   * Returns `null` if no schema is registered (freeform).
   */
  validate(schemaId: string, result: unknown): SchemaValidationResult | null {
    const schema = this.schemas.get(schemaId);
    if (!schema) return null;
    return schema.validate(result);
  }

  /** All registered schemas (for introspection). */
  allSchemas(): ReadonlyArray<SolverReceiptSchemaEntry> {
    return [...this.schemas.values()];
  }

  /** Count of registered schemas. */
  get size(): number {
    return this.schemas.size;
  }
}

// ── Singletons ────────────────────────────────────────────────────────────────

/** Global contract registry — one table per process. */
export const globalContractRegistry = new PluginSolverContractRegistry();

/** Global schema registry — one table per process. */
export const globalSchemaRegistry = new SolverReceiptSchemaRegistry();

// ── Plugin registration API ───────────────────────────────────────────────────

/**
 * Register a plugin solver contract into the global registry.
 *
 * Call during plugin registration alongside `registerPluginTraits`.
 */
export function registerPluginContract(contract: PluginSolverContract): void {
  globalContractRegistry.registerContract(contract);
}

/**
 * Register a clause evaluator for a contract clause into the global registry.
 *
 * @example
 * ```ts
 * registerContractClauseEvaluator('retail-ecommerce-v1', 'positive_demand', (ctx) => {
 *   const cfg = ctx.config as { annualDemand?: number };
 *   return typeof cfg.annualDemand === 'number' && cfg.annualDemand > 0;
 * });
 * ```
 */
export function registerContractClauseEvaluator(
  contractId: string,
  clauseId: string,
  evaluator: PluginClauseEvaluator
): void {
  globalContractRegistry.registerEvaluator(contractId, clauseId, evaluator);
}

/**
 * Register a receipt schema into the global schema registry.
 *
 * @example
 * ```ts
 * registerReceiptSchema({
 *   id: 'retail-ecommerce-receipt-v1',
 *   pluginId: 'retail-ecommerce',
 *   description: 'EOQ result shape',
 *   validate: (result) => {
 *     const r = result as Record<string, unknown>;
 *     const violations = [];
 *     if (typeof r?.eoq !== 'number' || r.eoq <= 0)
 *       violations.push({ field: 'eoq', message: 'must be a positive number' });
 *     return { valid: violations.length === 0, violations };
 *   },
 * });
 * ```
 */
export function registerReceiptSchema(entry: SolverReceiptSchemaEntry): void {
  globalSchemaRegistry.registerSchema(entry);
}

// ── wrapSolverInContract ──────────────────────────────────────────────────────

/**
 * Wrap a plugin solver function with contract + schema enforcement.
 *
 * The returned function:
 *   1. Checks registered preconditions against `config`. Aborts with a
 *      `WrappedSolverResult` (result: undefined, contractVerified: false) if
 *      any error-severity precondition fires — the solver never runs.
 *   2. Runs the solver.
 *   3. Checks registered postconditions against `{ config, result }`.
 *   4. Validates `result` against the registered receipt schema (if any).
 *   5. Returns `WrappedSolverResult` carrying all violations + the schema verdict.
 *
 * @param solver      The raw plugin solver function.
 * @param contractId  Contract id to look up in `globalContractRegistry`.
 *                    If not registered the solver runs unguarded (no clauses).
 * @param schemaId    Receipt schema id to look up in `globalSchemaRegistry`.
 *                    If omitted or unregistered, `schemaValid: null` (freeform).
 * @param registry    Contract registry to use (defaults to `globalContractRegistry`).
 * @param schemaReg   Schema registry to use (defaults to `globalSchemaRegistry`).
 */
export function wrapSolverInContract<TConfig extends Record<string, unknown>, TResult>(
  solver: (config: TConfig) => TResult,
  contractId: string | undefined,
  schemaId: string | undefined,
  registry: PluginSolverContractRegistry = globalContractRegistry,
  schemaReg: SolverReceiptSchemaRegistry = globalSchemaRegistry
): (config: TConfig) => WrappedSolverResult<TResult> {
  return (config: TConfig): WrappedSolverResult<TResult> => {
    const contract = contractId ? registry.getContract(contractId) : undefined;
    const clauseViolations: PluginClauseViolation[] = [];

    // 1. Preconditions
    if (contract) {
      for (const clause of contract.preconditions) {
        const evaluator = registry.getEvaluator(contract.id, clause.id);
        if (!evaluator) continue; // declaration without evaluator — skip
        const ctx: PluginClauseContext<TConfig, TResult> = {
          config,
          result: undefined,
          pluginId: contract.pluginId,
        };
        const holds = evaluator(ctx as PluginClauseContext);
        if (!holds) {
          clauseViolations.push({
            clauseId: clause.id,
            kind: 'precondition',
            severity: clause.severity ?? 'error',
            message: `Precondition "${clause.id}" violated: ${clause.description}`,
            pluginId: contract.pluginId,
          });
          if ((clause.severity ?? 'error') === 'error') {
            // Abort before running the solver
            return {
              result: undefined as unknown as TResult,
              contractVerified: false,
              schemaValid: null,
              schemaId: schemaId ?? null,
              clauseViolations,
              schemaViolations: [],
              contractId: contractId ?? null,
              pluginId: contract.pluginId,
            };
          }
        }
      }
    }

    // 2. Run solver
    const result = solver(config);

    // 3. Postconditions
    if (contract) {
      for (const clause of contract.postconditions) {
        const evaluator = registry.getEvaluator(contract.id, clause.id);
        if (!evaluator) continue;
        const ctx: PluginClauseContext<TConfig, TResult> = {
          config,
          result,
          pluginId: contract.pluginId,
        };
        const holds = evaluator(ctx as PluginClauseContext);
        if (!holds) {
          clauseViolations.push({
            clauseId: clause.id,
            kind: 'postcondition',
            severity: clause.severity ?? 'error',
            message: `Postcondition "${clause.id}" violated: ${clause.description}`,
            pluginId: contract.pluginId,
          });
        }
      }
    }

    const hasErrorViolation = clauseViolations.some((v) => v.severity === 'error');
    const contractVerified = !hasErrorViolation;

    // 4. Schema validation
    let schemaValid: boolean | null = null;
    let schemaViolations: SchemaViolation[] = [];
    if (schemaId) {
      const schemaResult = schemaReg.validate(schemaId, result);
      if (schemaResult !== null) {
        schemaValid = schemaResult.valid;
        schemaViolations = schemaResult.violations;
      }
      // schemaResult === null → schemaId provided but not registered → still freeform
    }

    return {
      result,
      contractVerified,
      schemaValid,
      schemaId: schemaId ?? null,
      clauseViolations,
      schemaViolations,
      contractId: contractId ?? null,
      pluginId: contract?.pluginId ?? null,
    };
  };
}
