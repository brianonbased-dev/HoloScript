import { describe, expect, it } from 'vitest';
import { HoloScriptSandbox, type VerifiedLogicData } from '../index';

// Inline .hs LOGIC oracles (same grammar as the verifiable-math oracles/*.hs). Each is a
// pure function in the .hs logic layer; executeVerifiedLogic runs it in the isolate and
// returns the computed result plus a CAEL receipt whose `verified` is DERIVED, not asserted.

const GCD = `function gcd(a, b) {
  let x = abs(a)
  let y = abs(b)
  while (y != 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}`;

const EULER = `function euler_ode(k, y0, dt, steps) {
  let y = y0
  for (let i = 0; i < steps; i++) {
    y = y + dt * (-k * y)
  }
  return y
}`;

const ARITH = `function compute_arith(nums, ops) {
  let terms = [nums[0]]
  let signs = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const next = nums[i + 1]
    if (op == "*") {
      terms[terms.length - 1] = terms[terms.length - 1] * next
    } else {
      signs.push(op)
      terms.push(next)
    }
  }
  let acc = terms[0]
  for (let j = 0; j < signs.length; j++) {
    if (signs[j] == "+") {
      acc = acc + terms[j + 1]
    } else {
      acc = acc - terms[j + 1]
    }
  }
  return acc
}`;

const MATMUL_TRACE = `function matmul_trace(A, B) {
  const n = A.length
  let trace = 0
  for (let i = 0; i < n; i++) {
    let cii = 0
    for (let kk = 0; kk < n; kk++) {
      cii = cii + A[i][kk] * B[kk][i]
    }
    trace = trace + cii
  }
  return trace
}`;

const DIJKSTRA = `function dijkstra(n, edges, src, dst) {
  const INF = 1e18
  let adj = []
  for (let i = 0; i < n; i++) {
    adj.push([])
  }
  for (let e = 0; e < edges.length; e++) {
    const u = edges[e][0]
    const v = edges[e][1]
    const w = edges[e][2]
    adj[u].push([v, w])
    adj[v].push([u, w])
  }
  let dist = []
  let done = []
  for (let i = 0; i < n; i++) {
    dist.push(INF)
    done.push(false)
  }
  dist[src] = 0
  for (let iter = 0; iter < n; iter++) {
    let u = -1
    let best = INF
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i]
        u = i
      }
    }
    if (u == -1) {
      break
    }
    done[u] = true
    for (let j = 0; j < adj[u].length; j++) {
      const v = adj[u][j][0]
      const w = adj[u][j][1]
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w
      }
    }
  }
  return dist[dst]
}`;

describe('HoloScriptSandbox.executeVerifiedLogic', () => {
  it('runs gcd (number theory, %) and emits a verifying CAEL receipt', async () => {
    const sandbox = new HoloScriptSandbox();
    const r = await sandbox.executeVerifiedLogic(GCD, 'gcd', [48, 36]);
    expect(r.success).toBe(true);
    const data = r.data as VerifiedLogicData;
    expect(data.result).toBe(12); // gcd(48, 36) = 12
    expect(data.verified).toBe(true); // hash chain intact -> DERIVED verified
    expect(data.cael.verify.valid).toBe(true);
    expect(data.cael.traceJSONL.length).toBeGreaterThan(0);
    expect(data.cael.traceId.startsWith('cael:')).toBe(true);
  });

  it('runs euler_ode (float loop) matching the reference numerics', async () => {
    const sandbox = new HoloScriptSandbox();
    const r = await sandbox.executeVerifiedLogic(EULER, 'euler_ode', [0.3, 50, 0.1, 5]);
    expect(r.success).toBe(true);
    const data = r.data as VerifiedLogicData;
    // each step y *= (1 - 0.1*0.3) = 0.97  ->  50 * 0.97^5
    expect(data.result as number).toBeCloseTo(50 * Math.pow(0.97, 5), 9);
    expect(data.verified).toBe(true);
  });

  it('runs arithmetic with * precedence (string compare + nested array args)', async () => {
    const sandbox = new HoloScriptSandbox();
    const r = await sandbox.executeVerifiedLogic(ARITH, 'compute_arith', [
      [11, 8, 6, 11],
      ['*', '+', '-'],
    ]);
    expect(r.success).toBe(true);
    const data = r.data as VerifiedLogicData;
    expect(data.result).toBe(83); // 11*8 + 6 - 11 = 83
    expect(data.verified).toBe(true);
  });

  it('runs matmul_trace (2D matrix args, nested loops)', async () => {
    const sandbox = new HoloScriptSandbox();
    const r = await sandbox.executeVerifiedLogic(MATMUL_TRACE, 'matmul_trace', [
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
    ]);
    expect(r.success).toBe(true);
    const data = r.data as VerifiedLogicData;
    expect(data.result).toBe(69); // trace(A·B) = C[0][0] + C[1][1] = 19 + 50
    expect(data.verified).toBe(true);
  });

  it('runs dijkstra (arrays of arrays, INF sentinel)', async () => {
    const sandbox = new HoloScriptSandbox();
    const r = await sandbox.executeVerifiedLogic(DIJKSTRA, 'dijkstra', [
      4,
      [
        [0, 1, 1],
        [1, 2, 2],
        [2, 3, 1],
        [0, 3, 5],
      ],
      0,
      3,
    ]);
    expect(r.success).toBe(true);
    const data = r.data as VerifiedLogicData;
    expect(data.result).toBe(4); // 0->1->2->3 = 1+2+1 < direct 0->3 = 5
    expect(data.verified).toBe(true);
  });

  it('is deterministic — same inputs produce the same result', async () => {
    const sandbox = new HoloScriptSandbox();
    const a = await sandbox.executeVerifiedLogic(GCD, 'gcd', [1071, 462]);
    const b = await sandbox.executeVerifiedLogic(GCD, 'gcd', [1071, 462]);
    expect(a.data?.result).toBe(21);
    expect(b.data?.result).toBe(21);
    expect(a.data?.verified && b.data?.verified).toBe(true);
  });

  it('rejects logic that references a blocked global (security gate holds)', async () => {
    const sandbox = new HoloScriptSandbox();
    const r = await sandbox.executeVerifiedLogic('function leak() { return process }', 'leak', []);
    expect(r.success).toBe(false);
    expect(r.error?.type).toBe('validation');
  });
});
