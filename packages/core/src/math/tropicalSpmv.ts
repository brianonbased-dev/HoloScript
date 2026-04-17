/**
 * Tropical (min-plus) sparse matrix–vector multiply on CSR graphs.
 *
 * Matches the semiring used in `@holoscript/snn-webgpu` / `TropicalShortestPaths`
 * (`INF = 1e30`). One SpMV step computes
 *   y_i = min_j (A_ij + x_j)
 * over stored entries only.
 *
 * Used for CPU reference checks, graph benchmarks (ER / scale-free / layered),
 * and comparison against the dense min-plus path.
 */

/** Same sentinel as `TropicalShortestPaths` / WGSL kernels. */
export const TROPICAL_INF = 1e30;

/** CSR adjacency (square n×n), row-major compressed sparse rows. */
export interface TropicalCsrMatrix {
  readonly n: number;
  readonly rowPtr: Uint32Array;
  readonly colIdx: Uint32Array;
  readonly values: Float32Array;
}

/** Deterministic PRNG (Mulberry32) for reproducible graph builds. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Min-plus SpMV: y_i = min_k (values[k] + x[colIdx[k]]) for entries in row i.
 * Rows with no entries get y_i = TROPICAL_INF.
 */
export function tropicalMinPlusSpmv(csr: TropicalCsrMatrix, x: Float32Array, y: Float32Array): void {
  const { n, rowPtr, colIdx, values } = csr;
  if (x.length < n || y.length < n) {
    throw new Error(`tropicalMinPlusSpmv: x and y must have length >= n (${n})`);
  }
  for (let i = 0; i < n; i++) {
    let best = TROPICAL_INF;
    const end = rowPtr[i + 1]!;
    for (let k = rowPtr[i]!; k < end; k++) {
      const j = colIdx[k]!;
      const aij = values[k]!;
      const xj = x[j]!;
      if (aij >= TROPICAL_INF || xj >= TROPICAL_INF) continue;
      const s = aij + xj;
      if (s < best) best = s;
    }
    y[i] = best;
  }
}

/** Dense min-plus SpMV (reference): y_i = min_j (A_ij + x_j). */
export function tropicalMinPlusSpmvDense(
  n: number,
  aRowMajor: Float32Array,
  x: Float32Array,
  y: Float32Array
): void {
  if (aRowMajor.length !== n * n) throw new Error('tropicalMinPlusSpmvDense: expected n*n matrix');
  for (let i = 0; i < n; i++) {
    let best = TROPICAL_INF;
    const row = i * n;
    for (let j = 0; j < n; j++) {
      const aij = aRowMajor[row + j]!;
      if (aij >= TROPICAL_INF) continue;
      const xj = x[j]!;
      if (xj >= TROPICAL_INF) continue;
      const s = aij + xj;
      if (s < best) best = s;
    }
    y[i] = best;
  }
}

/** Build CSR from dense matrix, storing only finite entries strictly below INF. */
export function csrFromDense(n: number, dense: Float32Array): TropicalCsrMatrix {
  if (dense.length !== n * n) throw new Error('csrFromDense: dense must be n*n');
  const rowCounts = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = 0; j < n; j++) {
      const v = dense[i * n + j]!;
      if (v < TROPICAL_INF && v === v) c++;
    }
    rowCounts[i] = c;
  }
  const rowPtr = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) rowPtr[i + 1] = rowPtr[i]! + rowCounts[i]!;
  const nnz = rowPtr[n]!;
  const colIdx = new Uint32Array(nnz);
  const values = new Float32Array(nnz);
  const write = new Uint32Array(rowPtr);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = dense[i * n + j]!;
      if (v < TROPICAL_INF && v === v) {
        const p = write[i]!;
        colIdx[p] = j;
        values[p] = v;
        write[i] = p + 1;
      }
    }
  }
  return { n, rowPtr, colIdx, values };
}

/** Directed Erdős–Rényi G(n,p): edge i→j with probability p, weight in (0,1]. */
export function erdosRenyiCsr(n: number, p: number, rng: () => number): TropicalCsrMatrix {
  const rows: number[][] = Array.from({ length: n }, () => []);
  const vals: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (rng() < p) {
        rows[i]!.push(j);
        vals[i]!.push(1e-6 + rng() * (1 - 1e-6));
      }
    }
  }
  return packCsr(n, rows, vals);
}

/**
 * Barabási–Albert–style directed graph: each new vertex adds up to `m` outgoing
 * edges to strictly older vertices; targets are chosen with probability
 * proportional to (indegree + 1).
 */
export function barabasiAlbertCsr(n: number, m: number, rng: () => number): TropicalCsrMatrix {
  if (n < 2 || m < 1) throw new Error('barabasiAlbertCsr: need n>=2, m>=1');
  const rows: number[][] = Array.from({ length: n }, () => []);
  const vals: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Uint32Array(n);

  const addEdge = (from: number, to: number, w: number) => {
    rows[from]!.push(to);
    vals[from]!.push(w);
    indeg[to]++;
  };

  const m0 = Math.min(m + 1, n);
  for (let i = 1; i < m0; i++) {
    addEdge(i, 0, 1e-6 + rng());
  }

  for (let v = m0; v < n; v++) {
    const chosen = new Set<number>();
    let guard = 0;
    while (chosen.size < Math.min(m, v) && guard < m * v * 5) {
      guard++;
      let tot = 0;
      for (let u = 0; u < v; u++) tot += indeg[u]! + 1;
      let r = rng() * tot;
      let acc = 0;
      let pick = 0;
      for (let u = 0; u < v; u++) {
        acc += indeg[u]! + 1;
        if (r <= acc) {
          pick = u;
          break;
        }
      }
      if (!chosen.has(pick)) {
        chosen.add(pick);
        addEdge(v, pick, 1e-6 + rng());
      }
    }
  }
  return packCsr(n, rows, vals);
}

/** Layered feedforward with random skip connections (neural-graph toy). */
export function layeredNeuralCsr(
  n: number,
  layers: number,
  skipProbability: number,
  rng: () => number
): TropicalCsrMatrix {
  if (layers < 2) throw new Error('layeredNeuralCsr: layers >= 2');
  const rows: number[][] = Array.from({ length: n }, () => []);
  const vals: number[][] = Array.from({ length: n }, () => []);
  const layerOf = (i: number) => Math.floor((i * layers) / n);
  for (let i = 0; i < n; i++) {
    const li = layerOf(i);
    for (let j = 0; j < n; j++) {
      const lj = layerOf(j);
      if (lj === li + 1 || (lj > li && rng() < skipProbability)) {
        rows[i]!.push(j);
        vals[i]!.push(1e-6 + rng());
      }
    }
  }
  return packCsr(n, rows, vals);
}

function packCsr(n: number, rows: number[][], vals: number[][]): TropicalCsrMatrix {
  const rowPtr = new Uint32Array(n + 1);
  let nnz = 0;
  for (let i = 0; i < n; i++) nnz += rows[i]!.length;
  for (let i = 0; i < n; i++) rowPtr[i + 1] = rowPtr[i]! + rows[i]!.length;
  const colIdx = new Uint32Array(nnz);
  const values = new Float32Array(nnz);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const rc = rows[i]!.length;
    for (let k = 0; k < rc; k++) {
      colIdx[w] = rows[i]![k]!;
      values[w] = vals[i]![k]!;
      w++;
    }
  }
  return { n, rowPtr, colIdx, values };
}

/** Max absolute difference between two vectors (skipping mutual INF). */
export function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = Math.abs(a[i]! - b[i]!);
    if (d > m) m = d;
  }
  return m;
}
