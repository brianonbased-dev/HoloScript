/**
 * DimensionalTypeSystem — compile-time dimensional analysis for physical quantities.
 *
 * Layer 6 of CompilerSafetyPass. Validates that physical quantities in AST
 * nodes carry dimensional types that compose safely:
 *   - Nodes can annotate properties with unit strings ("kg", "m/s^2", "N", …)
 *   - The checker verifies assignments, operation outputs, and field-level
 *     dimension expectations
 *
 * This is the compile-time mirror of SimulationContract's runtime unit
 * validation: the contract guards at runtime, this guards at compile time.
 *
 * ## Scope (H1)
 *
 * H1 implements:
 *   1. Dimension parsing (SI unit string → `DimVector`)
 *   2. Assignment compatibility (`[m]` is not assignable to `[kg]`)
 *   3. Arithmetic composition rules (multiplication, division, addition, subtraction)
 *   4. Solver field dimension expectations (by well-known field name)
 *   5. Violation collection and pass/fail judgment
 *
 * ## DimVector
 *
 * Physical dimensions are represented as a 7-element integer exponent vector
 * over the SI base dimensions:
 *   [mass, length, time, current, temperature, amount, luminosity]
 *   i.e., M^a L^b T^c I^d θ^e N^f J^g
 *
 * A force [N] = kg·m·s⁻² → [1, 1, -2, 0, 0, 0, 0].
 * Dimensionless → [0, 0, 0, 0, 0, 0, 0].
 */

// ── DimVector ─────────────────────────────────────────────────────────────────

/**
 * 7-component SI exponent vector.
 * Indices: [M, L, T, I, θ, N, J].
 */
export type DimVector = [number, number, number, number, number, number, number];

/** Dimensionless quantity (pure number, ratio, count). */
export const DIM_DIMENSIONLESS: DimVector = [0, 0, 0, 0, 0, 0, 0];

/** Whether two DimVectors represent the same physical dimension. */
export function dimEqual(a: DimVector, b: DimVector): boolean {
  for (let i = 0; i < 7; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Multiply dimensions: a × b → component-wise addition of exponents. */
export function dimMul(a: DimVector, b: DimVector): DimVector {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
    a[3] + b[3],
    a[4] + b[4],
    a[5] + b[5],
    a[6] + b[6],
  ];
}

/** Divide dimensions: a / b → component-wise subtraction of exponents. */
export function dimDiv(a: DimVector, b: DimVector): DimVector {
  return [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
    a[3] - b[3],
    a[4] - b[4],
    a[5] - b[5],
    a[6] - b[6],
  ];
}

/** Raise dimension to an integer power. Adding 0 normalizes -0 → 0. */
export function dimPow(a: DimVector, exp: number): DimVector {
  return [
    a[0] * exp + 0,
    a[1] * exp + 0,
    a[2] * exp + 0,
    a[3] * exp + 0,
    a[4] * exp + 0,
    a[5] * exp + 0,
    a[6] * exp + 0,
  ] as DimVector;
}

/** Format a DimVector as a human-readable SI unit string. */
export function dimToString(d: DimVector): string {
  const names = ['M', 'L', 'T', 'I', 'θ', 'N', 'J'] as const;
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (d[i] === 0) continue;
    parts.push(d[i] === 1 ? names[i] : `${names[i]}^${d[i]}`);
  }
  return parts.length > 0 ? parts.join('·') : 'dimensionless';
}

// ── Unit Registry ─────────────────────────────────────────────────────────────

/** Known SI-derived unit strings → DimVector. Keys are lowercase. */
export const UNIT_REGISTRY: Record<string, DimVector> = {
  // Base units
  kg: [1, 0, 0, 0, 0, 0, 0],
  m: [0, 1, 0, 0, 0, 0, 0],
  s: [0, 0, 1, 0, 0, 0, 0],
  a: [0, 0, 0, 1, 0, 0, 0], // ampere
  k: [0, 0, 0, 0, 1, 0, 0], // kelvin
  mol: [0, 0, 0, 0, 0, 1, 0],
  cd: [0, 0, 0, 0, 0, 0, 1],

  // Derived units (SI coherent)
  n: [1, 1, -2, 0, 0, 0, 0], // Newton = kg·m·s⁻²
  pa: [1, -1, -2, 0, 0, 0, 0], // Pascal = kg·m⁻¹·s⁻²
  j: [1, 2, -2, 0, 0, 0, 0], // Joule = kg·m²·s⁻²
  w: [1, 2, -3, 0, 0, 0, 0], // Watt = kg·m²·s⁻³
  hz: [0, 0, -1, 0, 0, 0, 0], // Hertz = s⁻¹

  // Composite unit strings (common in simulation)
  'm/s': [0, 1, -1, 0, 0, 0, 0], // velocity
  'm/s^2': [0, 1, -2, 0, 0, 0, 0], // acceleration
  'kg/m^3': [1, -3, 0, 0, 0, 0, 0], // density
  'n/m^2': [1, -1, -2, 0, 0, 0, 0], // stress (alias for Pa)
  'kg*m/s': [1, 1, -1, 0, 0, 0, 0], // momentum

  // Dimensionless
  '': [0, 0, 0, 0, 0, 0, 0],
  dimensionless: [0, 0, 0, 0, 0, 0, 0],
  ratio: [0, 0, 0, 0, 0, 0, 0],
  count: [0, 0, 0, 0, 0, 0, 0],
  deg: [0, 0, 0, 0, 0, 0, 0], // degrees — dimensionless in SI
  rad: [0, 0, 0, 0, 0, 0, 0], // radians — dimensionless in SI
};

/**
 * Parse a unit string into a DimVector.
 * Returns null if the unit is unrecognized.
 */
export function parseUnit(unit: string): DimVector | null {
  const key = unit.trim().toLowerCase();
  if (key in UNIT_REGISTRY) return UNIT_REGISTRY[key];
  return null;
}

// ── Solver Field Dimension Expectations ───────────────────────────────────────

/**
 * Well-known solver field names → expected DimVector.
 * Used by the DimensionalTypeChecker to validate field assignments against
 * their physical meaning without requiring every solver to annotate fields.
 */
export const SOLVER_FIELD_DIMENSIONS: Record<string, DimVector> = {
  von_mises_stress: UNIT_REGISTRY['pa'],
  pressure: UNIT_REGISTRY['pa'],
  displacement: UNIT_REGISTRY['m'],
  velocity: UNIT_REGISTRY['m/s'],
  acceleration: UNIT_REGISTRY['m/s^2'],
  force: UNIT_REGISTRY['n'],
  density: UNIT_REGISTRY['kg/m^3'],
  temperature: UNIT_REGISTRY['k'],
  energy: UNIT_REGISTRY['j'],
  power: UNIT_REGISTRY['w'],
  mass: UNIT_REGISTRY['kg'],
  frequency: UNIT_REGISTRY['hz'],
  stress: UNIT_REGISTRY['pa'],
  strain: DIM_DIMENSIONLESS,
  heat_flux: UNIT_REGISTRY['w'],
};

// ── AST Node interface ─────────────────────────────────────────────────────────

/**
 * An AST node annotated with dimensional information.
 * Fields:
 *   - `name`: node/variable identifier
 *   - `unit`: SI unit string for the node's value (absent → dimensionless)
 *   - `assigns`: list of (field, unit) pairs — field assignments this node makes
 *   - `operations`: arithmetic operations to validate
 */
export interface DimensionalASTNode {
  name?: string;
  /** Unit of this node's value, e.g. "kg", "m/s^2". Absent → dimensionless. */
  unit?: string;
  /** Field assignments: `{ field, unit }` — the unit the node assigns to `field`. */
  assigns?: Array<{ field: string; unit: string }>;
  /** Arithmetic operations to validate. */
  operations?: DimensionalOperation[];
}

/** An arithmetic operation with dimensional inputs and expected output. */
export interface DimensionalOperation {
  /** Operation kind. */
  op: 'add' | 'sub' | 'mul' | 'div' | 'assign';
  /** Left-hand dimension (unit string). */
  lhsUnit: string;
  /** Right-hand dimension (unit string). */
  rhsUnit: string;
  /**
   * Expected output unit (optional).
   * If provided, the checker verifies the computed output matches.
   * If absent, the computed output is recorded but not validated.
   */
  expectedUnit?: string;
  /** Source location label for error messages. */
  label?: string;
}

// ── Violation ─────────────────────────────────────────────────────────────────

export interface DimensionalViolation {
  node: string;
  kind: 'assignment_mismatch' | 'operation_mismatch' | 'unknown_unit' | 'add_mismatch';
  message: string;
  severity: 'error' | 'warning';
  /** CAEL reason code. */
  code: string;
}

// ── Checker ───────────────────────────────────────────────────────────────────

export interface DimensionalCheckResult {
  passed: boolean;
  violations: DimensionalViolation[];
  /** All field-assignment dimensions inferred during the check. */
  inferredFieldDimensions: Record<string, DimVector>;
}

/**
 * Run dimensional type checking on a set of AST nodes.
 *
 * Validates:
 *   1. Field assignments — does the assigned unit match the expected dimension
 *      for that field name (per SOLVER_FIELD_DIMENSIONS)?
 *   2. Operations — for add/sub: do LHS and RHS have the same dimension?
 *      For mul/div: is the computed output dimension correct?
 *   3. Unknown units — produces a warning (not error) so tooling failures
 *      don't block the build on units we don't yet know.
 */
export function checkDimensions(nodes: DimensionalASTNode[]): DimensionalCheckResult {
  const violations: DimensionalViolation[] = [];
  const inferredFieldDimensions: Record<string, DimVector> = {};

  for (const node of nodes) {
    const nodeLabel = node.name ?? '<anonymous>';

    // ── 1. Field assignments ──
    for (const assignment of node.assigns ?? []) {
      const expectedDim = SOLVER_FIELD_DIMENSIONS[assignment.field];
      if (expectedDim === undefined) {
        // Unknown field — no expectation to check. Record inferred dim.
        const parsed = parseUnit(assignment.unit);
        if (parsed !== null) {
          inferredFieldDimensions[assignment.field] = parsed;
        }
        continue;
      }

      const assignedDim = parseUnit(assignment.unit);
      if (assignedDim === null) {
        violations.push({
          node: nodeLabel,
          kind: 'unknown_unit',
          message: `Unknown unit "${assignment.unit}" assigned to field "${assignment.field}"`,
          severity: 'warning',
          code: 'DIM-W001',
        });
        continue;
      }

      if (!dimEqual(assignedDim, expectedDim)) {
        violations.push({
          node: nodeLabel,
          kind: 'assignment_mismatch',
          message:
            `Field "${assignment.field}" expects dimension ${dimToString(expectedDim)} ` +
            `but was assigned ${dimToString(assignedDim)} (unit "${assignment.unit}")`,
          severity: 'error',
          code: 'DIM-E001',
        });
      } else {
        inferredFieldDimensions[assignment.field] = assignedDim;
      }
    }

    // ── 2. Operations ──
    for (const op of node.operations ?? []) {
      const lhs = parseUnit(op.lhsUnit);
      const rhs = parseUnit(op.rhsUnit);
      const label = op.label ?? `${nodeLabel}.${op.op}`;

      if (lhs === null) {
        violations.push({
          node: nodeLabel,
          kind: 'unknown_unit',
          message: `Unknown LHS unit "${op.lhsUnit}" in ${op.op} operation at "${label}"`,
          severity: 'warning',
          code: 'DIM-W002',
        });
        continue;
      }
      if (rhs === null) {
        violations.push({
          node: nodeLabel,
          kind: 'unknown_unit',
          message: `Unknown RHS unit "${op.rhsUnit}" in ${op.op} operation at "${label}"`,
          severity: 'warning',
          code: 'DIM-W003',
        });
        continue;
      }

      let resultDim: DimVector;
      if (op.op === 'add' || op.op === 'sub') {
        if (!dimEqual(lhs, rhs)) {
          violations.push({
            node: nodeLabel,
            kind: 'add_mismatch',
            message:
              `Cannot ${op.op} ${dimToString(lhs)} and ${dimToString(rhs)} at "${label}" — ` +
              `operands must have the same dimension`,
            severity: 'error',
            code: 'DIM-E002',
          });
          continue;
        }
        resultDim = lhs;
      } else if (op.op === 'mul') {
        resultDim = dimMul(lhs, rhs);
      } else if (op.op === 'div') {
        resultDim = dimDiv(lhs, rhs);
      } else {
        // assign
        if (!dimEqual(lhs, rhs)) {
          violations.push({
            node: nodeLabel,
            kind: 'operation_mismatch',
            message: `Assignment type mismatch at "${label}": cannot assign ${dimToString(rhs)} to ${dimToString(lhs)}`,
            severity: 'error',
            code: 'DIM-E003',
          });
        }
        continue;
      }

      if (op.expectedUnit !== undefined) {
        const expectedOut = parseUnit(op.expectedUnit);
        if (expectedOut === null) {
          violations.push({
            node: nodeLabel,
            kind: 'unknown_unit',
            message: `Unknown expected output unit "${op.expectedUnit}" at "${label}"`,
            severity: 'warning',
            code: 'DIM-W004',
          });
        } else if (!dimEqual(resultDim, expectedOut)) {
          violations.push({
            node: nodeLabel,
            kind: 'operation_mismatch',
            message:
              `Operation ${op.op}(${op.lhsUnit}, ${op.rhsUnit}) at "${label}" produces ` +
              `${dimToString(resultDim)} but expected ${dimToString(expectedOut)}`,
            severity: 'error',
            code: 'DIM-E004',
          });
        }
      }
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  return {
    passed: errorCount === 0,
    violations,
    inferredFieldDimensions,
  };
}
