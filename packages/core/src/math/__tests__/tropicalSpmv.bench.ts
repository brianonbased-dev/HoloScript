/**
 * CSR tropical min-plus SpMV throughput (CPU, Node.js).
 * Run: npx vitest bench src/math/__tests__/tropicalSpmv.bench.ts
 */

import { bench, describe } from 'vitest';
import {
  barabasiAlbertCsr,
  erdosRenyiCsr,
  layeredNeuralCsr,
  mulberry32,
  tropicalMinPlusSpmv,
} from '../tropicalSpmv';

function benchSpmv(
  name: string,
  n: number,
  build: () => ReturnType<typeof erdosRenyiCsr>
): void {
  const csr = build();
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const rng = mulberry32(12345);
  for (let i = 0; i < n; i++) x[i] = rng() * 3;
  bench(`${name} (n=${n}, nnz=${csr.values.length})`, () => {
    tropicalMinPlusSpmv(csr, x, y);
  });
}

describe('Tropical CSR SpMV (min-plus)', () => {
  benchSpmv('ER p=0.02', 512, () => erdosRenyiCsr(512, 0.02, mulberry32(1)));
  benchSpmv('ER p=0.05', 512, () => erdosRenyiCsr(512, 0.05, mulberry32(2)));
  benchSpmv('BA m=4', 512, () => barabasiAlbertCsr(512, 4, mulberry32(3)));
  benchSpmv('Layered skips', 512, () => layeredNeuralCsr(512, 8, 0.12, mulberry32(4)));
});
