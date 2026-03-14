/**
 * TraitBehavioralContract -- Behavioral contract specification for HoloScript traits.
 *
 * Traits can declare pre-conditions (what must be true before applying the trait),
 * post-conditions (what must be true after), and invariants (what must remain
 * true throughout the trait's lifetime).
 *
 * This enables:
 * - Design-by-contract programming for spatial compositions
 * - Automatic runtime validation in debug builds
 * - Static analysis for the LSP/linter
 * - Confabulation detection (AI-generated configs that violate contracts)
 *
 * TARGET: packages/core/src/traits/TraitBehavioralContract.ts
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * A condition that can be evaluated against an object's state.
 */
export interface ContractCondition {
  /** Human-readable description of the condition */
  description: string;

  /**
   * Evaluate the condition against an object's property bag.
   * Returns true if the condition is satisfied.
   */
  evaluate: (props: Record<string, unknown>) => boolean;

  /** Error message when the condition fails */
  errorMessage?: string;

  /** Severity: 'error' blocks execution, 'warning' logs but continues */
  severity: 'error' | 'warning';
}

/**
 * A behavioral contract for a trait.
 */
export interface TraitContract {
  /** The trait this contract applies to */
  traitName: string;

  /** Pre-conditions: must be true BEFORE the trait is applied */
  preconditions: ContractCondition[];

  /** Post-conditions: must be true AFTER the trait is applied */
  postconditions: ContractCondition[];

  /** Invariants: must remain true throughout the trait's lifetime */
  invariants: ContractCondition[];

  /** Other traits that must be present (stronger than 'requires') */
  dependencies: string[];

  /** Other traits that must NOT be present */
  exclusions: string[];
}

/**
 * Result of contract validation.
 */
export interface ContractValidationResult {
  /** Whether all conditions passed */
  valid: boolean;
  /** Violations found */
  violations: ContractViolation[];
  /** Trait name being validated */
  traitName: string;
  /** Phase where validation occurred */
  phase: 'precondition' | 'postcondition' | 'invariant' | 'dependency';
}

export interface ContractViolation {
  /** Which condition was violated */
  condition: ContractCondition;
  /** Phase of the violation */
  phase: 'precondition' | 'postcondition' | 'invariant' | 'dependency';
  /** The trait name */
  traitName: string;
  /** Additional context */
  context?: string;
}

// =============================================================================
// CONTRACT BUILDER (Fluent API)
// =============================================================================

/**
 * Fluent builder for creating trait contracts.
 *
 * Usage:
 *   const contract = TraitContractBuilder.for('physics')
 *     .requires('collidable')
 *     .excludes('static')
 *     .pre('mass must be positive', props => (props.mass as number) > 0)
 *     .post('velocity initialized', props => props.velocity !== undefined)
 *     .invariant('mass never negative', props => (props.mass as number) >= 0)
 *     .build();
 */
export class TraitContractBuilder {
  private contract: TraitContract;

  private constructor(traitName: string) {
    this.contract = {
      traitName,
      preconditions: [],
      postconditions: [],
      invariants: [],
      dependencies: [],
      exclusions: [],
    };
  }

  /** Create a new contract builder for a trait. */
  static for(traitName: string): TraitContractBuilder {
    return new TraitContractBuilder(traitName);
  }

  /** Add a dependency on another trait. */
  requires(traitName: string): this {
    this.contract.dependencies.push(traitName);
    return this;
  }

  /** Add an exclusion (this trait cannot coexist with another). */
  excludes(traitName: string): this {
    this.contract.exclusions.push(traitName);
    return this;
  }

  /** Add a pre-condition. */
  pre(
    description: string,
    evaluate: (props: Record<string, unknown>) => boolean,
    severity: 'error' | 'warning' = 'error',
  ): this {
    this.contract.preconditions.push({
      description,
      evaluate,
      severity,
      errorMessage: `Pre-condition failed for @${this.contract.traitName}: ${description}`,
    });
    return this;
  }

  /** Add a post-condition. */
  post(
    description: string,
    evaluate: (props: Record<string, unknown>) => boolean,
    severity: 'error' | 'warning' = 'error',
  ): this {
    this.contract.postconditions.push({
      description,
      evaluate,
      severity,
      errorMessage: `Post-condition failed for @${this.contract.traitName}: ${description}`,
    });
    return this;
  }

  /** Add an invariant. */
  invariant(
    description: string,
    evaluate: (props: Record<string, unknown>) => boolean,
    severity: 'error' | 'warning' = 'error',
  ): this {
    this.contract.invariants.push({
      description,
      evaluate,
      severity,
      errorMessage: `Invariant violated for @${this.contract.traitName}: ${description}`,
    });
    return this;
  }

  /** Build the final contract. */
  build(): TraitContract {
    return { ...this.contract };
  }
}

// =============================================================================
// CONTRACT REGISTRY
// =============================================================================

/**
 * Registry of behavioral contracts for traits.
 */
export class TraitContractRegistry {
  private contracts = new Map<string, TraitContract>();

  /** Register a contract. */
  register(contract: TraitContract): void {
    this.contracts.set(contract.traitName, contract);
  }

  /** Get a contract by trait name. */
  get(traitName: string): TraitContract | undefined {
    return this.contracts.get(traitName);
  }

  /** Check if a contract exists. */
  has(traitName: string): boolean {
    return this.contracts.has(traitName);
  }

  /** Get all registered contracts. */
  getAll(): TraitContract[] {
    return Array.from(this.contracts.values());
  }

  /** Remove a contract. */
  remove(traitName: string): boolean {
    return this.contracts.delete(traitName);
  }

  /** Get the number of registered contracts. */
  get size(): number {
    return this.contracts.size;
  }
}

// =============================================================================
// CONTRACT VALIDATOR
// =============================================================================

/**
 * Validates trait contracts against object state.
 */
export class ContractValidator {
  private registry: TraitContractRegistry;

  constructor(registry: TraitContractRegistry) {
    this.registry = registry;
  }

  /**
   * Validate pre-conditions for a trait before it is applied.
   */
  validatePreconditions(
    traitName: string,
    props: Record<string, unknown>,
    appliedTraits: string[] = [],
  ): ContractValidationResult {
    const contract = this.registry.get(traitName);
    if (!contract) {
      return { valid: true, violations: [], traitName, phase: 'precondition' };
    }

    const violations: ContractViolation[] = [];

    // Check dependencies
    for (const dep of contract.dependencies) {
      if (!appliedTraits.includes(dep)) {
        violations.push({
          condition: {
            description: `Requires trait @${dep}`,
            evaluate: () => false,
            severity: 'error',
          },
          phase: 'dependency',
          traitName,
          context: `@${traitName} requires @${dep} but it is not applied`,
        });
      }
    }

    // Check exclusions
    for (const excl of contract.exclusions) {
      if (appliedTraits.includes(excl)) {
        violations.push({
          condition: {
            description: `Conflicts with trait @${excl}`,
            evaluate: () => false,
            severity: 'error',
          },
          phase: 'dependency',
          traitName,
          context: `@${traitName} conflicts with @${excl} which is already applied`,
        });
      }
    }

    // Check pre-conditions
    for (const condition of contract.preconditions) {
      try {
        if (!condition.evaluate(props)) {
          violations.push({ condition, phase: 'precondition', traitName });
        }
      } catch (e) {
        violations.push({
          condition,
          phase: 'precondition',
          traitName,
          context: `Evaluation threw: ${(e as Error).message}`,
        });
      }
    }

    const hasErrors = violations.some(v => v.condition.severity === 'error');
    return { valid: !hasErrors, violations, traitName, phase: 'precondition' };
  }

  /**
   * Validate post-conditions after a trait has been applied.
   */
  validatePostconditions(
    traitName: string,
    props: Record<string, unknown>,
  ): ContractValidationResult {
    const contract = this.registry.get(traitName);
    if (!contract) {
      return { valid: true, violations: [], traitName, phase: 'postcondition' };
    }

    const violations: ContractViolation[] = [];

    for (const condition of contract.postconditions) {
      try {
        if (!condition.evaluate(props)) {
          violations.push({ condition, phase: 'postcondition', traitName });
        }
      } catch (e) {
        violations.push({
          condition,
          phase: 'postcondition',
          traitName,
          context: `Evaluation threw: ${(e as Error).message}`,
        });
      }
    }

    const hasErrors = violations.some(v => v.condition.severity === 'error');
    return { valid: !hasErrors, violations, traitName, phase: 'postcondition' };
  }

  /**
   * Validate invariants during the trait's lifetime.
   */
  validateInvariants(
    traitName: string,
    props: Record<string, unknown>,
  ): ContractValidationResult {
    const contract = this.registry.get(traitName);
    if (!contract) {
      return { valid: true, violations: [], traitName, phase: 'invariant' };
    }

    const violations: ContractViolation[] = [];

    for (const condition of contract.invariants) {
      try {
        if (!condition.evaluate(props)) {
          violations.push({ condition, phase: 'invariant', traitName });
        }
      } catch (e) {
        violations.push({
          condition,
          phase: 'invariant',
          traitName,
          context: `Evaluation threw: ${(e as Error).message}`,
        });
      }
    }

    const hasErrors = violations.some(v => v.condition.severity === 'error');
    return { valid: !hasErrors, violations, traitName, phase: 'invariant' };
  }

  /**
   * Validate all contract phases for a trait (pre, post, invariants).
   */
  validateAll(
    traitName: string,
    props: Record<string, unknown>,
    appliedTraits: string[] = [],
  ): ContractValidationResult[] {
    return [
      this.validatePreconditions(traitName, props, appliedTraits),
      this.validatePostconditions(traitName, props),
      this.validateInvariants(traitName, props),
    ];
  }
}

// =============================================================================
// BUILT-IN CONTRACTS
// =============================================================================

/**
 * Create the default contract registry with built-in contracts for core traits.
 */
export function createDefaultContractRegistry(): TraitContractRegistry {
  const registry = new TraitContractRegistry();

  // Physics contracts
  registry.register(
    TraitContractBuilder.for('physics')
      .requires('collidable')
      .pre('mass must be non-negative', p => (p.mass as number ?? 1) >= 0)
      .pre('restitution must be 0-1', p => {
        const r = p.restitution as number ?? 0.5;
        return r >= 0 && r <= 1;
      })
      .pre('friction must be 0-1', p => {
        const f = p.friction as number ?? 0.5;
        return f >= 0 && f <= 1;
      })
      .invariant('mass remains non-negative', p => (p.mass as number ?? 1) >= 0)
      .build()
  );

  // Throwable requires grabbable
  registry.register(
    TraitContractBuilder.for('throwable')
      .requires('grabbable')
      .pre('velocity_multiplier non-negative', p => (p.velocity_multiplier as number ?? 1) >= 0)
      .pre('max_velocity positive', p => (p.max_velocity as number ?? 50) > 0)
      .build()
  );

  // Holdable requires grabbable
  registry.register(
    TraitContractBuilder.for('holdable')
      .requires('grabbable')
      .build()
  );

  // Networked trait contracts
  registry.register(
    TraitContractBuilder.for('networked')
      .pre('sync_rate must be positive', p => (p.sync_rate as number ?? 20) > 0)
      .pre('interpolation must be valid', p => {
        const interp = p.interpolation as string ?? 'linear';
        return ['linear', 'hermite', 'none'].includes(interp);
      })
      .invariant('ownership is valid', p => {
        const owner = p.owner as string;
        return !owner || typeof owner === 'string';
      })
      .build()
  );

  // Material trait contracts
  registry.register(
    TraitContractBuilder.for('material')
      .pre('metallic must be 0-1', p => {
        const m = p.metallic as number ?? 0;
        return m >= 0 && m <= 1;
      })
      .pre('roughness must be 0-1', p => {
        const r = p.roughness as number ?? 0.5;
        return r >= 0 && r <= 1;
      })
      .pre('opacity must be 0-1', p => {
        const o = p.opacity as number ?? 1;
        return o >= 0 && o <= 1;
      })
      .invariant('metallic stays 0-1', p => {
        const m = p.metallic as number ?? 0;
        return m >= 0 && m <= 1;
      })
      .build()
  );

  // Transparent excludes opaque rendering
  registry.register(
    TraitContractBuilder.for('transparent')
      .pre('opacity must be 0-1', p => {
        const o = p.opacity as number ?? 0.5;
        return o >= 0 && o <= 1;
      })
      .build()
  );

  // Animated trait contracts
  registry.register(
    TraitContractBuilder.for('animated')
      .pre('speed must be non-negative', p => (p.speed as number ?? 1) >= 0)
      .build()
  );

  // Scalable contracts
  registry.register(
    TraitContractBuilder.for('scalable')
      .pre('min_scale must be positive', p => (p.min_scale as number ?? 0.1) > 0)
      .pre('max_scale must exceed min_scale', p => {
        const min = p.min_scale as number ?? 0.1;
        const max = p.max_scale as number ?? 10;
        return max > min;
      })
      .build()
  );

  return registry;
}

// =============================================================================
// SINGLETON
// =============================================================================

let _globalRegistry: TraitContractRegistry | null = null;

export function getContractRegistry(): TraitContractRegistry {
  if (!_globalRegistry) {
    _globalRegistry = createDefaultContractRegistry();
  }
  return _globalRegistry;
}

export function resetContractRegistry(): void {
  _globalRegistry = null;
}
