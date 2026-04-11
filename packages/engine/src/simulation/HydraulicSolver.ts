/**
 * HydraulicSolver — Pipe network solver using Hardy-Cross method.
 *
 * ## Mathematical Formulation
 *
 * **Governing equations** (steady-state incompressible pipe flow):
 *
 *   Continuity: Σ Q_in = Σ Q_out  (at each node)
 *   Energy: Σ h_f = 0  (around each closed loop)
 *
 * where:
 *   Q = volumetric flow rate [m³/s]
 *   h_f = friction head loss [m]
 *
 * **Darcy-Weisbach head loss**:
 *   h_f = f · (L/D) · (V²/2g) = f · (L/D) · (8Q²)/(π²gD⁴)
 *
 * where:
 *   f = Darcy friction factor [-]
 *   L = pipe length [m]
 *   D = pipe diameter [m]
 *   V = flow velocity [m/s]
 *   g = 9.81 m/s²
 *
 * **Friction factor** (Swamee-Jain approximation, turbulent Re > 2300):
 *   f = 0.25 / [log₁₀(ε/(3.7D) + 5.74/Re^0.9)]²
 *
 * **Laminar flow** (Re < 2300):
 *   f = 64/Re
 *
 * ## Hardy-Cross Iteration
 *
 * 1. Detect independent loops via spanning tree (BFS).
 * 2. Initialize flow rates satisfying continuity at each node.
 * 3. For each iteration:
 *    a. Compute h_f for each pipe in each loop.
 *    b. Compute correction: ΔQ = -Σh_f / Σ(2|h_f|/|Q|)
 *    c. Apply ΔQ to all pipes in the loop.
 * 4. Converge when max|ΔQ| < tolerance.
 * 5. Back-calculate node pressures via BFS from known-head nodes.
 *
 * **Tree-topology networks** (zero loops): Direct Bernoulli solve.
 * When the spanning tree has no independent loops, Hardy-Cross cannot
 * iterate. Flow rates are computed directly from continuity, and
 * pressures from Bernoulli along the tree branches.
 *
 * ## Valve Modeling
 *
 * Valves modify the effective pipe diameter:
 *   D_eff = D × opening_fraction
 * A fully closed valve (opening=0) sets D_eff to near-zero,
 * producing very high head loss.
 *
 * ## Convergence Characteristics
 *
 * - Hardy-Cross converges linearly (first-order) for well-conditioned networks.
 * - Convergence degrades for networks with very different pipe diameters.
 * - Typical convergence: 10-50 iterations for engineering accuracy.
 *
 * ## Known Limitations
 *
 * - Steady-state only (no water hammer / transient analysis)
 * - Incompressible flow only (no gas networks)
 * - No pump curves (fixed-head nodes only)
 * - No minor losses (fittings, bends, valves modeled only as diameter changes)
 * - Single fluid (uniform viscosity)
 *
 * ## References
 *
 * - Cross, H., "Analysis of Flow in Networks of Conduits or Conductors",
 *   Univ. of Illinois Bulletin No. 286, 1936
 * - Chadwick, Morfett & Borthwick, "Hydraulics in Civil and Environmental
 *   Engineering", 5th ed., CRC Press, 2013
 * - Swamee, P.K. & Jain, A.K., "Explicit equations for pipe-flow problems",
 *   J. Hydraulic Division, ASCE, 102(5), 657-664, 1976
 *
 * @see ConvergenceControl — convergence result type
 * @see MaterialDatabase — pipe roughness lookup
 */

import { type ConvergenceResult } from './ConvergenceControl';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HydraulicPipe {
  id: string;
  diameter: number; // m
  length: number; // m
  roughness: number; // Darcy-Weisbach absolute roughness (m) or Hazen-Williams C
  material?: string;
}

export interface HydraulicNode {
  id: string;
  type: 'reservoir' | 'junction';
  /** Pressure head for reservoirs (m) */
  head?: number;
  /** Demand flow rate for junctions (m³/s) */
  demand?: number;
  /** Elevation (m) */
  elevation?: number;
}

export interface HydraulicValve {
  id: string;
  pipe: string; // pipe ID
  position: number; // 0-1 along pipe
  opening: number; // 0=closed, 1=fully open
}

export interface HydraulicConfig {
  pipes: HydraulicPipe[];
  nodes: HydraulicNode[];
  /** [nodeA_id, pipe_id, nodeB_id] */
  connections: [string, string, string][];
  valves: HydraulicValve[];
  maxIterations: number;
  convergence: number;
  /** Fluid kinematic viscosity (m²/s), default water at 20°C */
  viscosity?: number;
  /** Fluid density (kg/m³), default 998 */
  density?: number;
}

export interface HydraulicStats {
  nodeCount: number;
  pipeCount: number;
  loopCount: number;
  maxPressure: number;
  minPressure: number;
  totalDemand: number;
  solveResult: ConvergenceResult | null;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface PipeInternal {
  index: number;
  config: HydraulicPipe;
  fromNode: number; // node index
  toNode: number;
  flowRate: number; // m³/s (positive = from → to)
  effectiveDiameter: number; // after valve adjustment
}

interface NodeInternal {
  index: number;
  config: HydraulicNode;
  head: number; // m
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class HydraulicSolver {
  private config: HydraulicConfig;
  private pipes: PipeInternal[];
  private nodes: NodeInternal[];
  private nodeMap: Map<string, number>;
  private pipeMap: Map<string, number>;
  private loops: number[][]; // arrays of pipe indices per loop
  private pressures: Float32Array;
  private flowRates: Float32Array;
  private solveResult: ConvergenceResult | null = null;
  private viscosity: number;

  constructor(config: HydraulicConfig) {
    this.config = config;
    this.viscosity = config.viscosity ?? 1.004e-6; // water at 20°C

    // Build node map
    this.nodeMap = new Map();
    this.nodes = config.nodes.map((n, i) => {
      this.nodeMap.set(n.id, i);
      return {
        index: i,
        config: n,
        head: n.type === 'reservoir' ? (n.head ?? 0) : (n.elevation ?? 0),
      };
    });

    // Build pipe map
    this.pipeMap = new Map();
    this.pipes = [];
    for (const conn of config.connections) {
      const [fromId, pipeId, toId] = conn;
      const pipeConfig = config.pipes.find((p) => p.id === pipeId);
      if (!pipeConfig) continue;

      const fromIdx = this.nodeMap.get(fromId);
      const toIdx = this.nodeMap.get(toId);
      if (fromIdx === undefined || toIdx === undefined) continue;

      const idx = this.pipes.length;
      this.pipeMap.set(pipeId, idx);

      // Check for valve on this pipe
      const valve = config.valves.find((v) => v.pipe === pipeId);
      const opening = valve?.opening ?? 1;
      const effectiveD = pipeConfig.diameter * Math.sqrt(Math.max(opening, 0.001));

      this.pipes.push({
        index: idx,
        config: pipeConfig,
        fromNode: fromIdx,
        toNode: toIdx,
        flowRate: 0.001, // initial guess
        effectiveDiameter: effectiveD,
      });
    }

    this.pressures = new Float32Array(this.nodes.length);
    this.flowRates = new Float32Array(this.pipes.length);

    // Find loops using DFS
    this.loops = this.findLoops();

    // Initial flow guess using demand balancing
    this.initialFlowGuess();
  }

  /**
   * Solve the pipe network for steady-state pressures and flow rates.
   */
  solve(): ConvergenceResult {
    // Direct Bernoulli (tree solve) if no loops
    if (this.loops.length === 0) {
      this.solveTreeFlows();
      this.computeNodePressures();
      this.updateOutputArrays();
      this.solveResult = { converged: true, iterations: 1, residual: 0, maxChange: 0 };
      return this.solveResult;
    }

    const maxIter = this.config.maxIterations;
    const tol = this.config.convergence;
    let maxCorrection = 0;
    let iter = 0;

    for (iter = 0; iter < maxIter; iter++) {
      maxCorrection = 0;

      for (const loop of this.loops) {
        // Hardy-Cross: ΔQ = -Σ(hf) / Σ(2|hf|/Q) for each loop
        let sumHf = 0;
        let sumDhf = 0;

        for (const pipeIdx of loop) {
          const pipe = this.pipes[pipeIdx];
          const hf = this.headLoss(pipe);
          const Q = pipe.flowRate;

          sumHf += hf;
          sumDhf += Math.abs(Q) > 1e-12 ? 2 * Math.abs(hf) / Math.abs(Q) : 0;
        }

        if (Math.abs(sumDhf) < 1e-20) continue;

        const dQ = -sumHf / sumDhf;
        maxCorrection = Math.max(maxCorrection, Math.abs(dQ));

        // Apply correction to all pipes in the loop
        for (const pipeIdx of loop) {
          this.pipes[pipeIdx].flowRate += dQ;
        }
      }

      if (maxCorrection < tol) {
        this.computeNodePressures();
        this.updateOutputArrays();
        this.solveResult = { converged: true, iterations: iter + 1, residual: maxCorrection, maxChange: maxCorrection };
        return this.solveResult;
      }
    }

    this.computeNodePressures();
    this.updateOutputArrays();
    this.solveResult = { converged: false, iterations: iter, residual: maxCorrection, maxChange: maxCorrection };
    return this.solveResult;
  }

  /**
   * Head loss in a pipe using Darcy-Weisbach: hf = f * (L/D) * (V²/2g)
   * Sign follows flow direction.
   */
  private headLoss(pipe: PipeInternal): number {
    const Q = pipe.flowRate;
    const D = pipe.effectiveDiameter;
    const L = pipe.config.length;
    const A = (Math.PI / 4) * D * D;
    const V = Q / A;
    const Re = (Math.abs(V) * D) / this.viscosity;

    let f: number;
    if (Re < 2300) {
      // Laminar
      f = Re > 0 ? 64 / Re : 0;
    } else {
      // Swamee-Jain approximation for turbulent Darcy friction factor
      const eD = pipe.config.roughness / D;
      const logArg = eD / 3.7 + 5.74 / Math.pow(Re, 0.9);
      const logVal = Math.log10(logArg);
      f = 0.25 / (logVal * logVal);
    }

    // hf = f * L/D * V|V| / (2g)  — sign preserving
    const g = 9.81;
    return (f * L * V * Math.abs(V)) / (D * 2 * g);
  }

  /**
   * Compute node pressures by walking from known-head nodes.
   */
  private computeNodePressures(): void {
    // Start from reservoirs (known head)
    const visited = new Set<number>();
    const queue: number[] = [];

    for (const node of this.nodes) {
      if (node.config.type === 'reservoir') {
        node.head = node.config.head ?? 0;
        visited.add(node.index);
        queue.push(node.index);
      }
    }

    while (queue.length > 0) {
      const nodeIdx = queue.shift()!;
      const nodeHead = this.nodes[nodeIdx].head;

      for (const pipe of this.pipes) {
        let neighborIdx: number | null = null;
        let sign = 1;

        if (pipe.fromNode === nodeIdx && !visited.has(pipe.toNode)) {
          neighborIdx = pipe.toNode;
          sign = 1;
        } else if (pipe.toNode === nodeIdx && !visited.has(pipe.fromNode)) {
          neighborIdx = pipe.fromNode;
          sign = -1;
        }

        if (neighborIdx !== null) {
          const hf = this.headLoss(pipe);
          this.nodes[neighborIdx].head = nodeHead - sign * hf;
          visited.add(neighborIdx);
          queue.push(neighborIdx);
        }
      }
    }
  }

  private initialFlowGuess(): void {
    const n = this.nodes.length;
    // We already have a spanning tree via findLoops!
    // Wait, let's just build a fresh spanning tree to satisfy continuity.
    const adj: [number, number, number][][] = Array.from({ length: n }, () => []);
    
    for (const pipe of this.pipes) {
      adj[pipe.fromNode].push([pipe.toNode, pipe.index, 1]); // 1 = flows out
      adj[pipe.toNode].push([pipe.fromNode, pipe.index, -1]); // -1 = flows in
      pipe.flowRate = 0; // initialize all to 0
    }

    const treeEdges = new Set<number>();
    const visited = new Set<number>();
    
    // BFS to find a spanning tree component by component
    for (let i = 0; i < n; i++) {
        if (!visited.has(i)) {
            const queue = [i];
            visited.add(i);
            while(queue.length > 0) {
                const u = queue.shift()!;
                for (const [v, pipeIdx] of adj[u]) {
                    if (!visited.has(v)) {
                        visited.add(v);
                        treeEdges.add(pipeIdx);
                        queue.push(v);
                    }
                }
            }
        }
    }

    // Now compute degree internally ONLY counting tree edges
    const degree = new Int32Array(n);
    for (const pipe of this.pipes) {
        if (treeEdges.has(pipe.index)) {
            degree[pipe.fromNode]++;
            degree[pipe.toNode]++;
        }
    }

    const demands = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        demands[i] = this.nodes[i].config.demand ?? 0;
    }

    // Process from leaves
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
        // Reservoirs are typically root. We push degree 1 junctions to peel them.
        if (degree[i] === 1 && this.nodes[i].config.type !== 'reservoir') {
            q.push(i);
        }
    }

    while (q.length > 0) {
        const u = q.shift()!;
        degree[u]--;

        for (const [v, pipeIdx, dir] of adj[u]) {
            if (treeEdges.has(pipeIdx) && degree[v] > 0) {
                const reqFlow = demands[u];
                // if dir=1, u -> v. Node u has demand reqFlow, so flow must enter u.
                // Flow entering u via pipe is -pipeFlow. So -pipeFlow = reqFlow => pipeFlow = -reqFlow.
                const pipeFlow = dir === 1 ? -reqFlow : reqFlow;
                this.pipes[pipeIdx].flowRate = pipeFlow;
                
                demands[v] += reqFlow; // passed demand up the tree
                degree[v]--;
                
                if (degree[v] === 1 && this.nodes[v].config.type !== 'reservoir') {
                    q.push(v);
                }
                break;
            }
        }
    }
  }

  /**
   * Exact flow calculation for tree-topology networks (no loops).
   * Propagates demand from leaf nodes up to reservoirs.
   */
  private solveTreeFlows(): void {
    const n = this.nodes.length;
    const adj: [number, number][][] = Array.from({ length: n }, () => []);
    const degree = new Int32Array(n);
    
    for (const pipe of this.pipes) {
      adj[pipe.fromNode].push([pipe.toNode, pipe.index]);
      adj[pipe.toNode].push([pipe.fromNode, pipe.index]);
      degree[pipe.fromNode]++;
      degree[pipe.toNode]++;
    }

    const demands = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        demands[i] = this.nodes[i].config.demand ?? 0;
    }

    const queue: number[] = [];
    for (let i = 0; i < n; i++) {
        if (degree[i] === 1 && this.nodes[i].config.type !== 'reservoir') {
            queue.push(i);
        }
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        degree[curr]--;

        for (const [neighbor, pipeIdx] of adj[curr]) {
            if (degree[neighbor] > 0) {
                const pipe = this.pipes[pipeIdx];
                const requiredFlow = demands[curr];
                
                if (pipe.toNode === curr) {
                    pipe.flowRate = requiredFlow;
                } else {
                    pipe.flowRate = -requiredFlow;
                }

                demands[neighbor] += requiredFlow;
                degree[neighbor]--;

                if (degree[neighbor] === 1 && this.nodes[neighbor].config.type !== 'reservoir') {
                    queue.push(neighbor);
                }
                break;
            }
        }
    }
  }

  /**
   * Find independent loops using spanning tree fundamental cycles.
   *
   * Uses BFS to build a spanning tree, then each non-tree edge defines
   * exactly one fundamental cycle. This guarantees independent loops
   * (no duplicates or overlaps) which Hardy-Cross requires.
   */
  private findLoops(): number[][] {
    const loops: number[][] = [];
    const n = this.nodes.length;
    if (n === 0) return loops;

    // Build adjacency list: node → [(neighborNode, pipeIndex)]
    const adj: [number, number][][] = Array.from({ length: n }, () => []);
    for (const pipe of this.pipes) {
      adj[pipe.fromNode].push([pipe.toNode, pipe.index]);
      adj[pipe.toNode].push([pipe.fromNode, pipe.index]);
    }

    // BFS spanning tree
    const treeParent = new Map<number, { node: number; pipe: number }>();
    const visited = new Set<number>();
    const treeEdges = new Set<number>(); // pipe indices in spanning tree

    const bfs = (start: number): void => {
      const queue: number[] = [start];
      visited.add(start);

      while (queue.length > 0) {
        const node = queue.shift()!;
        for (const [neighbor, pipeIdx] of adj[node]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            treeParent.set(neighbor, { node, pipe: pipeIdx });
            treeEdges.add(pipeIdx);
            queue.push(neighbor);
          }
        }
      }
    };

    // BFS from all components
    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) bfs(i);
    }

    // Each non-tree edge creates one fundamental cycle
    for (const pipe of this.pipes) {
      if (treeEdges.has(pipe.index)) continue;

      // Trace paths from both endpoints to their LCA via spanning tree
      const pathA = this.traceToRoot(pipe.fromNode, treeParent);
      const pathB = this.traceToRoot(pipe.toNode, treeParent);

      // Find LCA (lowest common ancestor)
      const setA = new Set(pathA.map((p) => p.node));
      let lcaIdx = 0;
      for (let i = 0; i < pathB.length; i++) {
        if (setA.has(pathB[i].node)) {
          lcaIdx = i;
          break;
        }
      }
      const lcaNode = pathB[lcaIdx].node;

      // Collect pipe indices along the cycle
      const loopPipes: number[] = [pipe.index];
      for (const entry of pathA) {
        if (entry.node === lcaNode) break;
        if (entry.pipe >= 0) loopPipes.push(entry.pipe);
      }
      for (let i = 0; i < lcaIdx; i++) {
        if (pathB[i].pipe >= 0) loopPipes.push(pathB[i].pipe);
      }

      if (loopPipes.length > 1) loops.push(loopPipes);
    }

    return loops;
  }

  /** Trace a node to root of spanning tree, returning (node, pipe) pairs */
  private traceToRoot(
    start: number,
    treeParent: Map<number, { node: number; pipe: number }>
  ): { node: number; pipe: number }[] {
    const path: { node: number; pipe: number }[] = [{ node: start, pipe: -1 }];
    let current = start;
    while (treeParent.has(current)) {
      const parent = treeParent.get(current)!;
      path.push({ node: parent.node, pipe: parent.pipe });
      current = parent.node;
    }
    return path;
  }


  private updateOutputArrays(): void {
    for (const node of this.nodes) {
      this.pressures[node.index] = node.head;
    }
    for (const pipe of this.pipes) {
      this.flowRates[pipe.index] = pipe.flowRate;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getPressureField(): Float32Array {
    return this.pressures;
  }

  getFlowRates(): Float32Array {
    return this.flowRates;
  }

  setValveOpening(id: string, opening: number): void {
    const valve = this.config.valves.find((v) => v.id === id);
    if (valve) {
      valve.opening = opening;
      const pipeIdx = this.pipeMap.get(valve.pipe);
      if (pipeIdx !== undefined) {
        const pipe = this.pipes[pipeIdx];
        pipe.effectiveDiameter = pipe.config.diameter * Math.sqrt(Math.max(opening, 0.001));
      }
    }
  }

  setDemand(nodeId: string, demand: number): void {
    const idx = this.nodeMap.get(nodeId);
    if (idx !== undefined) {
      this.nodes[idx].config.demand = demand;
    }
  }

  setPumpPressure(nodeId: string, head: number): void {
    const idx = this.nodeMap.get(nodeId);
    if (idx !== undefined && this.nodes[idx].config.type === 'reservoir') {
      this.nodes[idx].config.head = head;
      this.nodes[idx].head = head;
    }
  }

  getStats(): HydraulicStats {
    let maxP = -Infinity, minP = Infinity, totalD = 0;
    for (const node of this.nodes) {
      if (node.head > maxP) maxP = node.head;
      if (node.head < minP) minP = node.head;
      totalD += node.config.demand ?? 0;
    }
    return {
      nodeCount: this.nodes.length,
      pipeCount: this.pipes.length,
      loopCount: this.loops.length,
      maxPressure: maxP,
      minPressure: minP,
      totalDemand: totalD,
      solveResult: this.solveResult,
    };
  }

  dispose(): void {
    this.pipes = [];
    this.nodes = [];
  }
}
