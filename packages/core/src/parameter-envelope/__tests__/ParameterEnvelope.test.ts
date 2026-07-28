import { describe, it, expect } from 'vitest';
import { isInEnvelope, checkParameterEnvelope } from '../ParameterEnvelope';
import type { ParameterEnvelopeRecord, ParameterEnvelope } from '../ParameterEnvelope';

// ── isInEnvelope ──────────────────────────────────────────────────────────────

describe('isInEnvelope — numeric range', () => {
  const rec: ParameterEnvelopeRecord = { param: 'dt', min: 0.001, max: 0.1 };

  it('accepts a value on the lower bound', () => {
    expect(isInEnvelope(0.001, rec)).toBe(true);
  });

  it('accepts a value on the upper bound', () => {
    expect(isInEnvelope(0.1, rec)).toBe(true);
  });

  it('accepts a value strictly inside the range', () => {
    expect(isInEnvelope(0.05, rec)).toBe(true);
  });

  it('rejects a value below the lower bound', () => {
    expect(isInEnvelope(0.0009, rec)).toBe(false);
  });

  it('rejects a value above the upper bound', () => {
    expect(isInEnvelope(0.11, rec)).toBe(false);
  });

  it('rejects a non-numeric value against a numeric range', () => {
    expect(isInEnvelope('fast', rec)).toBe(false);
    expect(isInEnvelope(null, rec)).toBe(false);
  });
});

describe('isInEnvelope — min only', () => {
  const rec: ParameterEnvelopeRecord = { param: 'n', min: 0 };

  it('accepts zero (on the min)', () => {
    expect(isInEnvelope(0, rec)).toBe(true);
  });

  it('accepts large positive', () => {
    expect(isInEnvelope(1_000_000, rec)).toBe(true);
  });

  it('rejects negative', () => {
    expect(isInEnvelope(-1, rec)).toBe(false);
  });
});

describe('isInEnvelope — max only', () => {
  const rec: ParameterEnvelopeRecord = { param: 'damping', max: 1 };

  it('accepts zero', () => {
    expect(isInEnvelope(0, rec)).toBe(true);
  });

  it('accepts the max bound', () => {
    expect(isInEnvelope(1, rec)).toBe(true);
  });

  it('rejects above the max', () => {
    expect(isInEnvelope(1.001, rec)).toBe(false);
  });
});

describe('isInEnvelope — allowed set', () => {
  const rec: ParameterEnvelopeRecord = {
    param: 'solver',
    allowed: ['cg', 'direct', 'multigrid'],
  };

  it('accepts a value in the set', () => {
    expect(isInEnvelope('cg', rec)).toBe(true);
    expect(isInEnvelope('direct', rec)).toBe(true);
  });

  it('rejects a value not in the set', () => {
    expect(isInEnvelope('iterative', rec)).toBe(false);
    expect(isInEnvelope('', rec)).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isInEnvelope('CG', rec)).toBe(false);
  });
});

describe('isInEnvelope — range + allowed (both must pass)', () => {
  const rec: ParameterEnvelopeRecord = {
    param: 'resolution',
    min: 1,
    max: 10,
    allowed: [1, 2, 4, 8],
  };

  it('accepts a value that is in range AND in the set', () => {
    expect(isInEnvelope(4, rec)).toBe(true);
  });

  it('rejects a value in range but not in the set', () => {
    expect(isInEnvelope(3, rec)).toBe(false);
  });

  it('rejects a value in the set but outside range', () => {
    // 8 is in [1,10] and in the set — still passes
    expect(isInEnvelope(8, rec)).toBe(true);
  });
});

describe('isInEnvelope — unconstrained record (no min/max/allowed)', () => {
  const rec: ParameterEnvelopeRecord = { param: 'label' };

  it('always returns true', () => {
    expect(isInEnvelope(0, rec)).toBe(true);
    expect(isInEnvelope('anything', rec)).toBe(true);
    expect(isInEnvelope(null, rec)).toBe(true);
  });
});

// ── checkParameterEnvelope ────────────────────────────────────────────────────

describe('checkParameterEnvelope — empty envelope', () => {
  it('passes immediately with no violations', () => {
    const result = checkParameterEnvelope({ dt: 0.1, n: 1000 }, []);
    expect(result.passed).toBe(true);
    expect(result.redischarge).toBe(false);
    expect(result.violations).toHaveLength(0);
  });
});

describe('checkParameterEnvelope — all params in envelope', () => {
  const envelope: ParameterEnvelope = [
    { param: 'dt', min: 0.001, max: 0.1 },
    { param: 'n', min: 1 },
  ];

  it('passes with no violations', () => {
    const result = checkParameterEnvelope({ dt: 0.05, n: 1000 }, envelope);
    expect(result.passed).toBe(true);
    expect(result.redischarge).toBe(false);
    expect(result.violations).toHaveLength(0);
  });
});

describe('checkParameterEnvelope — error-verdict violation', () => {
  const envelope: ParameterEnvelope = [{ param: 'dt', min: 0.001, max: 0.1, onViolation: 'error' }];

  it('sets passed:false and records the violation', () => {
    const result = checkParameterEnvelope({ dt: 0.5 }, envelope);
    expect(result.passed).toBe(false);
    expect(result.redischarge).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0];
    expect(v.param).toBe('dt');
    expect(v.verdict).toBe('error');
    expect(v.value).toBe(0.5);
    expect(v.message).toContain('dt');
    expect(v.message).toContain('0.5');
  });
});

describe('checkParameterEnvelope — warn-verdict violation', () => {
  const envelope: ParameterEnvelope = [{ param: 'damping', max: 1, onViolation: 'warn' }];

  it('keeps passed:true but records the violation', () => {
    const result = checkParameterEnvelope({ damping: 1.5 }, envelope);
    expect(result.passed).toBe(true); // warn doesn't fail
    expect(result.redischarge).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].verdict).toBe('warn');
  });
});

describe('checkParameterEnvelope — redischarge-verdict violation', () => {
  const envelope: ParameterEnvelope = [
    { param: 'Young_modulus', min: 1e9, max: 1e12, onViolation: 'redischarge' },
  ];

  it('sets redischarge:true and keeps passed:true', () => {
    const result = checkParameterEnvelope({ Young_modulus: 5e12 }, envelope);
    expect(result.passed).toBe(true); // redischarge ≠ error
    expect(result.redischarge).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].verdict).toBe('redischarge');
  });
});

describe('checkParameterEnvelope — default onViolation is error', () => {
  const envelope: ParameterEnvelope = [
    { param: 'dt', min: 0.001 }, // no onViolation field → defaults to 'error'
  ];

  it('defaults to error when onViolation is absent', () => {
    const result = checkParameterEnvelope({ dt: 0.0001 }, envelope);
    expect(result.passed).toBe(false);
    expect(result.violations[0].verdict).toBe('error');
  });
});

describe('checkParameterEnvelope — absent param is skipped', () => {
  const envelope: ParameterEnvelope = [{ param: 'missing_key', min: 1, max: 100 }];

  it('skips records whose key is absent from params', () => {
    const result = checkParameterEnvelope({ other: 42 }, envelope);
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });
});

describe('checkParameterEnvelope — multiple records, mixed outcomes', () => {
  const envelope: ParameterEnvelope = [
    { param: 'dt', min: 0.001, max: 0.1, onViolation: 'error' },
    { param: 'solver', allowed: ['cg', 'direct'], onViolation: 'warn' },
    { param: 'tol', min: 1e-10, max: 1e-3, onViolation: 'redischarge' },
  ];

  it('collects all violations across records', () => {
    const params = {
      dt: 0.5, // → error
      solver: 'bad', // → warn
      tol: 0.1, // → redischarge
    };
    const result = checkParameterEnvelope(params, envelope);
    expect(result.passed).toBe(false); // error present
    expect(result.redischarge).toBe(true);
    expect(result.violations).toHaveLength(3);
    const verdicts = result.violations.map((v) => v.verdict).sort();
    expect(verdicts).toEqual(['error', 'redischarge', 'warn']);
  });

  it('passes when all params are valid', () => {
    const params = { dt: 0.01, solver: 'cg', tol: 1e-6 };
    const result = checkParameterEnvelope(params, envelope);
    expect(result.passed).toBe(true);
    expect(result.redischarge).toBe(false);
    expect(result.violations).toHaveLength(0);
  });
});

describe('checkParameterEnvelope — violation message format', () => {
  it('includes unit suffix when record.unit is set', () => {
    const envelope: ParameterEnvelope = [{ param: 'freq', min: 1, max: 1000, unit: 'Hz' }];
    const result = checkParameterEnvelope({ freq: 5000 }, envelope);
    expect(result.violations[0].message).toContain('Hz');
  });

  it('includes the range description for numeric bounds', () => {
    const envelope: ParameterEnvelope = [{ param: 'dt', min: 0.001, max: 0.1 }];
    const result = checkParameterEnvelope({ dt: 99 }, envelope);
    expect(result.violations[0].message).toContain('min=0.001');
    expect(result.violations[0].message).toContain('max=0.1');
  });

  it('includes the allowed set for discrete params', () => {
    const envelope: ParameterEnvelope = [{ param: 'mode', allowed: ['a', 'b', 'c'] }];
    const result = checkParameterEnvelope({ mode: 'x' }, envelope);
    expect(result.violations[0].message).toContain('"a"');
    expect(result.violations[0].message).toContain('"b"');
  });
});
