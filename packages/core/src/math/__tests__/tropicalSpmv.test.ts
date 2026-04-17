import { describe, expect, it } from 'vitest';
import {
  TROPICAL_INF,
  csrFromDense,
  erdosRenyiCsr,
  barabasiAlbertCsr,
  layeredNeuralCsr,
  maxAbsDiff,
  mulberry32,
  tropicalMinPlusSpmv,
  tropicalMinPlusSpmvDense,
} from '../tropicalSpmv';

describe('tropical min-plus SpMV (CSR)', () => {
  it('matches dense reference on random small matrices', () => {
    const rng = mulberry32(42);
    const n = 32;
    const dense = new Float32Array(n * n).fill(TROPICAL_INF);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (rng() < 0.15) dense[i * n + j] = rng() * 4;
      }
    }
    const csr = csrFromDense(n, dense);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = rng() * 2;
    const yCsr = new Float32Array(n);
    const yDense = new Float32Array(n);
    tropicalMinPlusSpmv(csr, x, yCsr);
    tropicalMinPlusSpmvDense(n, dense, x, yDense);
    expect(maxAbsDiff(yCsr, yDense)).toBeLessThan(1e-4);
  });

  it('builds ER / BA / layered graphs without throwing', () => {
    const rng = mulberry32(7);
    const er = erdosRenyiCsr(64, 0.05, rng);
    expect(er.rowPtr.length).toBe(65);
    const ba = barabasiAlbertCsr(48, 3, mulberry32(99));
    expect(ba.n).toBe(48);
    const ly = layeredNeuralCsr(40, 5, 0.08, mulberry32(3));
    expect(ly.values.length).toBeGreaterThan(0);
  });
});
