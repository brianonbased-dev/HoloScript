/**
 * Generic semiring interface and numeric semiring strategies.
 *
 * This reveals the algebra already implicit in ProvenanceSemiring's
 * strategy-driven conflict resolution, and adds explicit tropical variants.
 */
export interface Semiring<T> {
  /** Additive identity. */
  readonly zero: T;
  /** Multiplicative identity. */
  readonly one: T;
  /** Additive operator (⊕). */
  add(a: T, b: T): T;
  /** Multiplicative operator (⊗). */
  mul(a: T, b: T): T;
}

function minPlusMul(a: number, b: number): number {
  return !Number.isFinite(a) || !Number.isFinite(b) ? Number.POSITIVE_INFINITY : a + b;
}

function maxPlusMul(a: number, b: number): number {
  return !Number.isFinite(a) || !Number.isFinite(b) ? Number.NEGATIVE_INFINITY : a + b;
}

export const MinPlusSemiring: Semiring<number> = {
  zero: Number.POSITIVE_INFINITY,
  one: 0,
  add: (a, b) => Math.min(a, b),
  mul: minPlusMul,
};

export const MaxPlusSemiring: Semiring<number> = {
  zero: Number.NEGATIVE_INFINITY,
  one: 0,
  add: (a, b) => Math.max(a, b),
  mul: maxPlusMul,
};

export const SumProductSemiring: Semiring<number> = {
  zero: 0,
  one: 1,
  add: (a, b) => a + b,
  mul: (a, b) => a * b,
};

export type NumericStrategySemiringName =
  | 'sum'
  | 'multiply'
  | 'tropical-min-plus'
  | 'tropical-max-plus';

/**
 * Adapter from existing string strategies to explicit semiring instances.
 * Returns null for strategies that are precedence/authority/error policies
 * rather than closed numeric semiring operations.
 */
export function strategyToSemiring(strategy: string): Semiring<number> | null {
  switch (strategy) {
    case 'sum':
    case 'multiply':
      return SumProductSemiring;
    case 'tropical-min-plus':
      return MinPlusSemiring;
    case 'tropical-max-plus':
      return MaxPlusSemiring;
    default:
      return null;
  }
}
