import { describe, it, expect } from 'vitest';
import {
  dimEqual,
  dimMul,
  dimDiv,
  dimPow,
  dimToString,
  DIM_DIMENSIONLESS,
  UNIT_REGISTRY,
  SOLVER_FIELD_DIMENSIONS,
  parseUnit,
  checkDimensions,
} from '../DimensionalTypeSystem';
import type { DimVector, DimensionalASTNode } from '../DimensionalTypeSystem';

// ── DimVector utilities ───────────────────────────────────────────────────────

describe('dimEqual', () => {
  it('returns true for identical vectors', () => {
    expect(dimEqual([1, 1, -2, 0, 0, 0, 0], [1, 1, -2, 0, 0, 0, 0])).toBe(true);
  });

  it('returns false when any component differs', () => {
    expect(dimEqual([1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(dimEqual([0, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(dimEqual([0, 0, -1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0])).toBe(false);
  });

  it('DIM_DIMENSIONLESS equals itself', () => {
    expect(dimEqual(DIM_DIMENSIONLESS, [0, 0, 0, 0, 0, 0, 0])).toBe(true);
  });
});

describe('dimMul', () => {
  it('adds exponents component-wise (velocity × time = length)', () => {
    const velocity: DimVector = [0, 1, -1, 0, 0, 0, 0]; // m/s
    const time: DimVector = [0, 0, 1, 0, 0, 0, 0]; // s
    const result = dimMul(velocity, time);
    expect(result).toEqual([0, 1, 0, 0, 0, 0, 0]); // m
  });

  it('force × distance = energy (N·m = J)', () => {
    const force: DimVector = [1, 1, -2, 0, 0, 0, 0]; // N
    const length: DimVector = [0, 1, 0, 0, 0, 0, 0]; // m
    expect(dimMul(force, length)).toEqual([1, 2, -2, 0, 0, 0, 0]); // J
  });

  it('dimensionless × anything = anything', () => {
    const mass: DimVector = [1, 0, 0, 0, 0, 0, 0];
    expect(dimMul(DIM_DIMENSIONLESS, mass)).toEqual(mass);
  });
});

describe('dimDiv', () => {
  it('subtracts exponents component-wise (length ÷ time = velocity)', () => {
    const length: DimVector = [0, 1, 0, 0, 0, 0, 0];
    const time: DimVector = [0, 0, 1, 0, 0, 0, 0];
    expect(dimDiv(length, time)).toEqual([0, 1, -1, 0, 0, 0, 0]); // m/s
  });

  it('quantity ÷ itself = dimensionless', () => {
    const force: DimVector = [1, 1, -2, 0, 0, 0, 0];
    expect(dimDiv(force, force)).toEqual(DIM_DIMENSIONLESS);
  });
});

describe('dimPow', () => {
  it('scales all exponents by the power', () => {
    const length: DimVector = [0, 1, 0, 0, 0, 0, 0];
    expect(dimPow(length, 3)).toEqual([0, 3, 0, 0, 0, 0, 0]); // m³
  });

  it('power 0 → dimensionless', () => {
    const mass: DimVector = [1, 0, 0, 0, 0, 0, 0];
    expect(dimPow(mass, 0)).toEqual(DIM_DIMENSIONLESS);
  });

  it('power -1 → reciprocal (s → Hz)', () => {
    const time: DimVector = [0, 0, 1, 0, 0, 0, 0];
    expect(dimPow(time, -1)).toEqual([0, 0, -1, 0, 0, 0, 0]);
  });
});

describe('dimToString', () => {
  it('formats dimensionless as "dimensionless"', () => {
    expect(dimToString(DIM_DIMENSIONLESS)).toBe('dimensionless');
  });

  it('formats a single base dimension', () => {
    expect(dimToString([1, 0, 0, 0, 0, 0, 0])).toBe('M');
    expect(dimToString([0, 1, 0, 0, 0, 0, 0])).toBe('L');
    expect(dimToString([0, 0, 1, 0, 0, 0, 0])).toBe('T');
  });

  it('formats exponents > 1 with caret', () => {
    expect(dimToString([0, 3, 0, 0, 0, 0, 0])).toBe('L^3');
  });

  it('formats composite dimensions with dots', () => {
    const force: DimVector = [1, 1, -2, 0, 0, 0, 0]; // N
    expect(dimToString(force)).toBe('M·L·T^-2');
  });
});

// ── Unit Registry ─────────────────────────────────────────────────────────────

describe('UNIT_REGISTRY', () => {
  it('has correct DimVector for kg (mass)', () => {
    expect(UNIT_REGISTRY['kg']).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it('has correct DimVector for N (force = kg·m·s⁻²)', () => {
    expect(UNIT_REGISTRY['n']).toEqual([1, 1, -2, 0, 0, 0, 0]);
  });

  it('has correct DimVector for Pa (pressure = kg·m⁻¹·s⁻²)', () => {
    expect(UNIT_REGISTRY['pa']).toEqual([1, -1, -2, 0, 0, 0, 0]);
  });

  it('has correct DimVector for J (energy = kg·m²·s⁻²)', () => {
    expect(UNIT_REGISTRY['j']).toEqual([1, 2, -2, 0, 0, 0, 0]);
  });

  it('dimensionless units map to zero vector', () => {
    expect(UNIT_REGISTRY['dimensionless']).toEqual(DIM_DIMENSIONLESS);
    expect(UNIT_REGISTRY['rad']).toEqual(DIM_DIMENSIONLESS);
    expect(UNIT_REGISTRY['deg']).toEqual(DIM_DIMENSIONLESS);
  });
});

describe('parseUnit', () => {
  it('returns the DimVector for a known unit (case-insensitive)', () => {
    expect(parseUnit('kg')).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(parseUnit('KG')).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(parseUnit('  m  ')).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });

  it('returns the DimVector for composite unit strings', () => {
    expect(parseUnit('m/s')).toEqual([0, 1, -1, 0, 0, 0, 0]);
    expect(parseUnit('m/s^2')).toEqual([0, 1, -2, 0, 0, 0, 0]);
    expect(parseUnit('kg/m^3')).toEqual([1, -3, 0, 0, 0, 0, 0]);
  });

  it('returns null for unknown units', () => {
    expect(parseUnit('furlong')).toBeNull();
    expect(parseUnit('PSI')).toBeNull();
    expect(parseUnit('unknown_unit')).toBeNull();
  });

  it('returns DIM_DIMENSIONLESS for empty string', () => {
    expect(parseUnit('')).toEqual(DIM_DIMENSIONLESS);
  });
});

// ── SOLVER_FIELD_DIMENSIONS ───────────────────────────────────────────────────

describe('SOLVER_FIELD_DIMENSIONS', () => {
  it('velocity maps to m/s', () => {
    expect(SOLVER_FIELD_DIMENSIONS['velocity']).toEqual(UNIT_REGISTRY['m/s']);
  });

  it('force maps to N', () => {
    expect(SOLVER_FIELD_DIMENSIONS['force']).toEqual(UNIT_REGISTRY['n']);
  });

  it('von_mises_stress and pressure both map to Pa', () => {
    expect(SOLVER_FIELD_DIMENSIONS['von_mises_stress']).toEqual(UNIT_REGISTRY['pa']);
    expect(SOLVER_FIELD_DIMENSIONS['pressure']).toEqual(UNIT_REGISTRY['pa']);
  });

  it('strain is dimensionless', () => {
    expect(SOLVER_FIELD_DIMENSIONS['strain']).toEqual(DIM_DIMENSIONLESS);
  });
});

// ── checkDimensions ───────────────────────────────────────────────────────────

describe('checkDimensions — empty input', () => {
  it('passes with no violations for an empty node list', () => {
    const result = checkDimensions([]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.inferredFieldDimensions).toEqual({});
  });
});

describe('checkDimensions — field assignments', () => {
  it('accepts a correct field assignment (velocity → m/s)', () => {
    const nodes: DimensionalASTNode[] = [
      { name: 'FluidSolver', assigns: [{ field: 'velocity', unit: 'm/s' }] },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.inferredFieldDimensions['velocity']).toEqual(UNIT_REGISTRY['m/s']);
  });

  it('emits DIM-E001 for a mismatched assignment (velocity ← kg)', () => {
    const nodes: DimensionalASTNode[] = [
      { name: 'BadSolver', assigns: [{ field: 'velocity', unit: 'kg' }] },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(false);
    const err = result.violations.find((v) => v.code === 'DIM-E001');
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
    expect(err!.message).toContain('velocity');
    expect(err!.message).toContain('kg');
  });

  it('emits DIM-W001 for an unknown unit on a known field', () => {
    const nodes: DimensionalASTNode[] = [
      { name: 'WeirdSolver', assigns: [{ field: 'force', unit: 'furlong/fortnight' }] },
    ];
    const result = checkDimensions(nodes);
    const warn = result.violations.find((v) => v.code === 'DIM-W001');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(result.passed).toBe(true); // warnings don't fail
  });

  it('infers dimension for unknown field with known unit', () => {
    const nodes: DimensionalASTNode[] = [
      { name: 'Custom', assigns: [{ field: 'custom_flux', unit: 'w' }] },
    ];
    const result = checkDimensions(nodes);
    expect(result.violations).toHaveLength(0);
    expect(result.inferredFieldDimensions['custom_flux']).toEqual(UNIT_REGISTRY['w']);
  });

  it('ignores unknown field with unknown unit (no violation, no inference)', () => {
    const nodes: DimensionalASTNode[] = [
      { name: 'X', assigns: [{ field: 'mystery_field', unit: 'zorgon' }] },
    ];
    const result = checkDimensions(nodes);
    expect(result.violations).toHaveLength(0);
    expect(result.inferredFieldDimensions['mystery_field']).toBeUndefined();
  });
});

describe('checkDimensions — arithmetic operations', () => {
  it('add: emits DIM-E002 when operands have different dimensions', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'BadAdd',
        operations: [{ op: 'add', lhsUnit: 'kg', rhsUnit: 'm' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(false);
    const err = result.violations.find((v) => v.code === 'DIM-E002');
    expect(err).toBeDefined();
    expect(err!.kind).toBe('add_mismatch');
  });

  it('add: passes when both operands are same dimension', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'GoodAdd',
        operations: [{ op: 'add', lhsUnit: 'kg', rhsUnit: 'kg' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('sub: emits DIM-E002 for mismatched subtraction', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'BadSub',
        operations: [{ op: 'sub', lhsUnit: 'n', rhsUnit: 'pa' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(false);
    const err = result.violations.find((v) => v.code === 'DIM-E002');
    expect(err).toBeDefined();
  });

  it('mul: computes force × length = energy (N × m → J)', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'Work',
        operations: [{ op: 'mul', lhsUnit: 'n', rhsUnit: 'm', expectedUnit: 'j' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('mul: emits DIM-E004 when computed output mismatches expectedUnit', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'WrongWork',
        operations: [{ op: 'mul', lhsUnit: 'n', rhsUnit: 'm', expectedUnit: 'kg' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(false);
    const err = result.violations.find((v) => v.code === 'DIM-E004');
    expect(err).toBeDefined();
    expect(err!.kind).toBe('operation_mismatch');
  });

  it('div: length ÷ time → velocity (m ÷ s → m/s)', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'Velocity',
        operations: [{ op: 'div', lhsUnit: 'm', rhsUnit: 's', expectedUnit: 'm/s' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('assign: emits DIM-E003 when LHS and RHS dimensions differ', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'BadAssign',
        operations: [{ op: 'assign', lhsUnit: 'kg', rhsUnit: 'm/s' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(false);
    const err = result.violations.find((v) => v.code === 'DIM-E003');
    expect(err).toBeDefined();
  });

  it('assign: passes when LHS and RHS have same dimension', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'GoodAssign',
        operations: [{ op: 'assign', lhsUnit: 'n', rhsUnit: 'n' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('emits DIM-W002 for unknown LHS unit', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'UnkLHS',
        operations: [{ op: 'mul', lhsUnit: 'zorgon', rhsUnit: 'kg' }],
      },
    ];
    const result = checkDimensions(nodes);
    const warn = result.violations.find((v) => v.code === 'DIM-W002');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(result.passed).toBe(true);
  });

  it('emits DIM-W003 for unknown RHS unit', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'UnkRHS',
        operations: [{ op: 'mul', lhsUnit: 'kg', rhsUnit: 'zorgon' }],
      },
    ];
    const result = checkDimensions(nodes);
    const warn = result.violations.find((v) => v.code === 'DIM-W003');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
  });

  it('emits DIM-W004 for unknown expectedUnit', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'UnkOut',
        operations: [{ op: 'mul', lhsUnit: 'kg', rhsUnit: 'm', expectedUnit: 'zorgon' }],
      },
    ];
    const result = checkDimensions(nodes);
    const warn = result.violations.find((v) => v.code === 'DIM-W004');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
  });

  it('mul without expectedUnit records result without violation', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'FreeProduct',
        operations: [{ op: 'mul', lhsUnit: 'n', rhsUnit: 'm' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe('checkDimensions — multi-node and mixed', () => {
  it('collects violations across multiple nodes', () => {
    const nodes: DimensionalASTNode[] = [
      { name: 'A', assigns: [{ field: 'velocity', unit: 'kg' }] }, // DIM-E001
      { name: 'B', assigns: [{ field: 'force', unit: 'pa' }] }, // DIM-E001
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(false);
    expect(result.violations.filter((v) => v.code === 'DIM-E001')).toHaveLength(2);
  });

  it('passes when all assignments and operations are correct', () => {
    const nodes: DimensionalASTNode[] = [
      {
        name: 'Physics',
        assigns: [
          { field: 'velocity', unit: 'm/s' },
          { field: 'acceleration', unit: 'm/s^2' },
          { field: 'mass', unit: 'kg' },
        ],
        operations: [{ op: 'mul', lhsUnit: 'kg', rhsUnit: 'm/s^2', expectedUnit: 'n' }],
      },
    ];
    const result = checkDimensions(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('node without name uses <anonymous> in violation messages', () => {
    const nodes: DimensionalASTNode[] = [
      { assigns: [{ field: 'force', unit: 'kg/m^3' }] }, // wrong unit
    ];
    const result = checkDimensions(nodes);
    expect(result.violations[0].node).toBe('<anonymous>');
  });
});
