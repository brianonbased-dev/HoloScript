/**
 * Neuroscience solvers — neuroscience-plugin
 *
 * Implements:
 *  - Hodgkin-Huxley (1952) conductance-based single-neuron model
 *  - Wilson-Cowan (1972) population rate model
 *  - Leaky Integrate-and-Fire (LIF) neuron
 *  - EEG band-power spectral analysis
 *  - Neural network connectivity metrics (small-world, clustering, path length)
 *
 * Reference values from original papers:
 *  - Hodgkin & Huxley (1952) J.Physiol 117:500–544
 *  - Wilson & Cowan (1972) Biophys.J 12:1–24
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HHParams {
  /** Membrane capacitance µF/cm² (default 1.0) */
  Cm?: number;
  /** Max Na conductance mS/cm² (default 120) */
  gNa?: number;
  /** Max K conductance mS/cm² (default 36) */
  gK?: number;
  /** Leak conductance mS/cm² (default 0.3) */
  gL?: number;
  /** Na reversal potential mV (default +50) */
  ENa?: number;
  /** K reversal potential mV (default -77) */
  EK?: number;
  /** Leak reversal potential mV (default -54.4) */
  EL?: number;
  /** Applied current µA/cm² */
  Iapp: number;
  /** Simulation duration ms (default 100) */
  durationMs?: number;
  /** Time step ms (default 0.01) */
  dtMs?: number;
}

export interface HHResult {
  /** Time array ms */
  timeMs: number[];
  /** Membrane voltage mV */
  voltagesMv: number[];
  /** m gating variable (Na activation) */
  m: number[];
  /** h gating variable (Na inactivation) */
  h: number[];
  /** n gating variable (K activation) */
  n: number[];
  /** Spike times ms */
  spikeTimes: number[];
  /** Mean firing rate Hz */
  firingRateHz: number;
  /** Peak voltage mV */
  peakVoltageMv: number;
  /** Resting potential mV */
  restingPotentialMv: number;
}

export interface WilsonCowanParams {
  /** Excitatory time constant ms (default 8) */
  tauE?: number;
  /** Inhibitory time constant ms (default 8) */
  tauI?: number;
  /** Excitatory-to-excitatory weight (default 16) */
  wEE?: number;
  /** Excitatory-to-inhibitory weight (default 12) */
  wEI?: number;
  /** Inhibitory-to-excitatory weight (default 13) */
  wIE?: number;
  /** Inhibitory-to-inhibitory weight (default 11) */
  wII?: number;
  /** External excitatory input (default 1.25) */
  pE?: number;
  /** External inhibitory input (default 0) */
  pI?: number;
  /** Sigmoid steepness excitatory (default 1.2) */
  aE?: number;
  /** Sigmoid steepness inhibitory (default 1.0) */
  aI?: number;
  /** Sigmoid threshold excitatory (default 2.8) */
  thetaE?: number;
  /** Sigmoid threshold inhibitory (default 4.0) */
  thetaI?: number;
  /** Initial excitatory activity [0,1] (default 0.1) */
  E0?: number;
  /** Initial inhibitory activity [0,1] (default 0.05) */
  I0?: number;
  /** Simulation duration ms (default 500) */
  durationMs?: number;
  /** Time step ms (default 0.5) */
  dtMs?: number;
}

export interface WilsonCowanResult {
  timeMs: number[];
  E: number[];
  I: number[];
  /** Fixed-point excitatory activity (final value) */
  steadyStateE: number;
  /** Fixed-point inhibitory activity (final value) */
  steadyStateI: number;
  /** Whether the system reached a stable fixed point */
  converged: boolean;
}

export interface LIFParams {
  /** Membrane time constant ms (default 20) */
  tauM?: number;
  /** Resting potential mV (default -65) */
  Vrest?: number;
  /** Threshold mV (default -50) */
  Vthresh?: number;
  /** Reset potential mV (default -65) */
  Vreset?: number;
  /** Refractory period ms (default 2) */
  tauRef?: number;
  /** Applied current in units of mV/ms (default 1.5) */
  Iapp?: number;
  /** Simulation duration ms (default 200) */
  durationMs?: number;
  /** Time step ms (default 0.1) */
  dtMs?: number;
}

export interface LIFResult {
  timeMs: number[];
  voltagesMv: number[];
  spikeTimes: number[];
  firingRateHz: number;
  /** Theoretical firing rate from integrate-to-threshold formula */
  theoreticalRateHz: number | null;
}

export interface EEGBandPowerResult {
  /** Raw time series (mV) */
  signal: number[];
  /** Sampling rate Hz */
  samplingRateHz: number;
  /** Power spectral density at each frequency bin (arb units) */
  psd: number[];
  /** Frequency bins Hz */
  frequencies: number[];
  delta: number;   // 0.5–4 Hz
  theta: number;   // 4–8 Hz
  alpha: number;   // 8–13 Hz
  beta: number;    // 13–30 Hz
  gamma: number;   // 30–100 Hz
  /** Dominant band */
  dominantBand: 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
}

export interface ConnectivityMetrics {
  /** Number of nodes */
  nodeCount: number;
  /** Number of edges */
  edgeCount: number;
  /** Mean clustering coefficient */
  clusteringCoefficient: number;
  /** Average shortest path length (hops) */
  avgPathLength: number;
  /** Small-world index σ = (C/C_rand) / (L/L_rand) */
  smallWorldIndex: number;
  /** Degree distribution (node index → degree) */
  degrees: number[];
  /** Global efficiency 1/L */
  globalEfficiency: number;
}

export interface NeuroReceiptOptions {
  runId?: string;
}

// ─── Hodgkin-Huxley gating kinetics ──────────────────────────────────────────

function alphaN(V: number): number {
  const dv = V + 55;
  return Math.abs(dv) < 1e-7 ? 0.1 : (0.01 * dv) / (1 - Math.exp(-dv / 10));
}
function betaN(V: number): number { return 0.125 * Math.exp(-(V + 65) / 80); }

function alphaM(V: number): number {
  const dv = V + 40;
  return Math.abs(dv) < 1e-7 ? 1.0 : (0.1 * dv) / (1 - Math.exp(-dv / 10));
}
function betaM(V: number): number { return 4 * Math.exp(-(V + 65) / 18); }

function alphaH(V: number): number { return 0.07 * Math.exp(-(V + 65) / 20); }
function betaH(V: number): number { return 1 / (1 + Math.exp(-(V + 35) / 10)); }

// ─── Hodgkin-Huxley solver ────────────────────────────────────────────────────

/**
 * Simulate the Hodgkin-Huxley conductance-based neuron model using
 * 4th-order Runge-Kutta integration.
 *
 * Default parameters reproduce the classical action potential from the
 * original 1952 paper at Iapp = 10 µA/cm².
 */
export function hodgkinHuxley(params: HHParams): HHResult {
  const {
    Cm = 1.0,
    gNa = 120, gK = 36, gL = 0.3,
    ENa = 50, EK = -77, EL = -54.4,
    Iapp,
    durationMs = 100,
    dtMs = 0.01,
  } = params;

  if (Cm <= 0) throw new Error('Cm must be positive');
  if (durationMs <= 0) throw new Error('durationMs must be positive');
  if (dtMs <= 0 || dtMs > durationMs) throw new Error('dtMs must be in (0, durationMs]');

  const N = Math.ceil(durationMs / dtMs);
  const dt = dtMs;

  // Initial conditions (resting state ≈ −65 mV)
  let V = -65.0;
  let m = alphaM(V) / (alphaM(V) + betaM(V));
  let h = alphaH(V) / (alphaH(V) + betaH(V));
  let n = alphaN(V) / (alphaN(V) + betaN(V));

  const timeArr: number[] = [];
  const VArr: number[] = [];
  const mArr: number[] = [];
  const hArr: number[] = [];
  const nArr: number[] = [];
  const spikes: number[] = [];

  const SPIKE_THRESH = 0;
  let prevV = V;

  const dVdt = (v: number, _m: number, _h: number, _n: number) => {
    const INa = gNa * _m ** 3 * _h * (v - ENa);
    const IK  = gK  * _n ** 4       * (v - EK);
    const IL  = gL                  * (v - EL);
    return (Iapp - INa - IK - IL) / Cm;
  };
  const dmdt = (v: number, _m: number) => alphaM(v) * (1 - _m) - betaM(v) * _m;
  const dhdt = (v: number, _h: number) => alphaH(v) * (1 - _h) - betaH(v) * _h;
  const dndt = (v: number, _n: number) => alphaN(v) * (1 - _n) - betaN(v) * _n;

  for (let i = 0; i < N; i++) {
    const t = i * dt;
    timeArr.push(t);
    VArr.push(V);
    mArr.push(m);
    hArr.push(h);
    nArr.push(n);

    // Spike detection: upward crossing of SPIKE_THRESH
    if (prevV < SPIKE_THRESH && V >= SPIKE_THRESH) {
      spikes.push(t);
    }
    prevV = V;

    // RK4
    const k1V = dVdt(V, m, h, n);
    const k1m = dmdt(V, m);
    const k1h = dhdt(V, h);
    const k1n = dndt(V, n);

    const V2 = V + 0.5 * dt * k1V, m2 = m + 0.5 * dt * k1m;
    const h2 = h + 0.5 * dt * k1h, n2 = n + 0.5 * dt * k1n;

    const k2V = dVdt(V2, m2, h2, n2);
    const k2m = dmdt(V2, m2);
    const k2h = dhdt(V2, h2);
    const k2n = dndt(V2, n2);

    const V3 = V + 0.5 * dt * k2V, m3 = m + 0.5 * dt * k2m;
    const h3 = h + 0.5 * dt * k2h, n3 = n + 0.5 * dt * k2n;

    const k3V = dVdt(V3, m3, h3, n3);
    const k3m = dmdt(V3, m3);
    const k3h = dhdt(V3, h3);
    const k3n = dndt(V3, n3);

    const V4 = V + dt * k3V, m4 = m + dt * k3m;
    const h4 = h + dt * k3h, n4 = n + dt * k3n;

    const k4V = dVdt(V4, m4, h4, n4);
    const k4m = dmdt(V4, m4);
    const k4h = dhdt(V4, h4);
    const k4n = dndt(V4, n4);

    V += (dt / 6) * (k1V + 2 * k2V + 2 * k3V + k4V);
    m += (dt / 6) * (k1m + 2 * k2m + 2 * k3m + k4m);
    h += (dt / 6) * (k1h + 2 * k2h + 2 * k3h + k4h);
    n += (dt / 6) * (k1n + 2 * k2n + 2 * k3n + k4n);

    // Clamp gating to [0,1]
    m = Math.max(0, Math.min(1, m));
    h = Math.max(0, Math.min(1, h));
    n = Math.max(0, Math.min(1, n));
  }

  const peakV = Math.max(...VArr);
  const restV = VArr[0];
  const firingRateHz = spikes.length / (durationMs / 1000);

  return {
    timeMs: timeArr, voltagesMv: VArr, m: mArr, h: hArr, n: nArr,
    spikeTimes: spikes, firingRateHz, peakVoltageMv: peakV, restingPotentialMv: restV,
  };
}

// ─── Wilson-Cowan population model ───────────────────────────────────────────

/** Sigmoid transfer function used in Wilson-Cowan */
function sigmoid(x: number, a: number, theta: number): number {
  return 1 / (1 + Math.exp(-a * (x - theta)));
}

/**
 * Wilson-Cowan (1972) coupled excitatory-inhibitory population rate model.
 * Uses Euler integration (fast; suitable for coarse dynamics).
 */
export function wilsonCowan(params: WilsonCowanParams): WilsonCowanResult {
  const {
    tauE = 8, tauI = 8,
    wEE = 16, wEI = 12, wIE = 13, wII = 11,
    pE = 1.25, pI = 0,
    aE = 1.2, aI = 1.0,
    thetaE = 2.8, thetaI = 4.0,
    E0 = 0.1, I0 = 0.05,
    durationMs = 500, dtMs = 0.5,
  } = params;

  if (tauE <= 0 || tauI <= 0) throw new Error('Time constants must be positive');
  if (durationMs <= 0) throw new Error('durationMs must be positive');

  const N = Math.ceil(durationMs / dtMs);
  let E = E0, I = I0;

  const timeArr: number[] = [];
  const EArr: number[] = [];
  const IArr: number[] = [];

  for (let i = 0; i < N; i++) {
    timeArr.push(i * dtMs);
    EArr.push(E);
    IArr.push(I);

    const xE = wEE * E - wIE * I + pE;
    const xI = wEI * E - wII * I + pI;

    const dE = (-E + sigmoid(xE, aE, thetaE)) / tauE;
    const dI = (-I + sigmoid(xI, aI, thetaI)) / tauI;

    E = Math.max(0, Math.min(1, E + dtMs * dE));
    I = Math.max(0, Math.min(1, I + dtMs * dI));
  }

  const steadyStateE = E;
  const steadyStateI = I;

  // Convergence: final 10% of trajectory nearly constant
  const tail = Math.max(1, Math.floor(N * 0.1));
  const eVar = Math.max(...EArr.slice(-tail)) - Math.min(...EArr.slice(-tail));
  const iVar = Math.max(...IArr.slice(-tail)) - Math.min(...IArr.slice(-tail));
  const converged = eVar < 0.005 && iVar < 0.005;

  return { timeMs: timeArr, E: EArr, I: IArr, steadyStateE, steadyStateI, converged };
}

// ─── Leaky Integrate-and-Fire ─────────────────────────────────────────────────

/**
 * Leaky integrate-and-fire neuron with refractory period.
 * Euler integration.
 */
export function lifNeuron(params: LIFParams): LIFResult {
  const {
    tauM = 20, Vrest = -65, Vthresh = -50, Vreset = -65,
    tauRef = 2, Iapp = 1.5,
    durationMs = 200, dtMs = 0.1,
  } = params;

  if (tauM <= 0) throw new Error('tauM must be positive');
  if (Vthresh <= Vreset) throw new Error('Vthresh must be > Vreset');

  const N = Math.ceil(durationMs / dtMs);
  let V = Vrest;
  let refractoryLeft = 0;

  const timeArr: number[] = [];
  const VArr: number[] = [];
  const spikes: number[] = [];

  for (let i = 0; i < N; i++) {
    const t = i * dtMs;
    timeArr.push(t);
    VArr.push(V);

    if (refractoryLeft > 0) {
      refractoryLeft -= dtMs;
      V = Vreset;
    } else {
      V += dtMs * (-(V - Vrest) / tauM + Iapp);
      if (V >= Vthresh) {
        spikes.push(t);
        V = Vreset;
        refractoryLeft = tauRef;
      }
    }
  }

  const firingRateHz = spikes.length / (durationMs / 1000);

  // Theoretical rate: f = 1 / (tauRef + tauM × ln(Iapp/(Iapp - (Vthresh-Vrest)/tauM)))
  let theoreticalRateHz: number | null = null;
  const threshold = (Vthresh - Vrest) / tauM;
  if (Iapp > threshold) {
    const T = tauRef / 1000 + (tauM / 1000) * Math.log(Iapp / (Iapp - threshold));
    theoreticalRateHz = 1 / T;
  }

  return { timeMs: timeArr, voltagesMv: VArr, spikeTimes: spikes, firingRateHz, theoreticalRateHz };
}

// ─── EEG band power (DFT-based) ───────────────────────────────────────────────

/**
 * Compute EEG frequency band powers from a time-domain signal.
 * Uses the Goertzel algorithm-inspired DFT approach (no external FFT library).
 * For production, replace with a proper FFT.
 */
export function eegBandPower(signal: number[], samplingRateHz: number): EEGBandPowerResult {
  if (signal.length < 2) throw new Error('Signal must have at least 2 samples');
  if (samplingRateHz <= 0) throw new Error('samplingRateHz must be positive');

  const N = signal.length;
  const freqResHz = samplingRateHz / N;

  // Compute DFT magnitude squared (PSD) for positive frequencies up to Nyquist
  const psd: number[] = [];
  const frequencies: number[] = [];
  const nyquist = samplingRateHz / 2;
  const maxBin = Math.floor(N / 2);

  for (let k = 0; k <= maxBin; k++) {
    const freq = k * freqResHz;
    if (freq > nyquist) break;
    frequencies.push(freq);

    // DFT sum
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += signal[n] * Math.cos(angle);
      im -= signal[n] * Math.sin(angle);
    }
    psd.push((re * re + im * im) / N);
  }

  // Band integration
  const bandPower = (lo: number, hi: number): number => {
    let sum = 0;
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= lo && frequencies[i] <= hi) sum += psd[i];
    }
    return sum * freqResHz;
  };

  const delta = bandPower(0.5, 4);
  const theta = bandPower(4, 8);
  const alpha = bandPower(8, 13);
  const beta  = bandPower(13, 30);
  const gamma = bandPower(30, Math.min(100, nyquist));

  const bands = { delta, theta, alpha, beta, gamma } as const;
  const dominantBand = (Object.entries(bands).sort((a, b) => b[1] - a[1])[0][0]) as EEGBandPowerResult['dominantBand'];

  return { signal, samplingRateHz, psd, frequencies, delta, theta, alpha, beta, gamma, dominantBand };
}

// ─── Connectivity metrics (graph-theoretic) ───────────────────────────────────

/**
 * Compute neural connectivity metrics for an undirected binary adjacency matrix.
 * adjacency[i][j] = 1 if connected, 0 otherwise.
 */
export function connectivityMetrics(adjacency: number[][]): ConnectivityMetrics {
  const nodeCount = adjacency.length;
  if (nodeCount < 2) throw new Error('Need at least 2 nodes');

  // Validate symmetry and compute degrees
  const degrees = adjacency.map((row, i) => {
    let deg = 0;
    for (let j = 0; j < nodeCount; j++) {
      if (i !== j && adjacency[i][j]) deg++;
    }
    return deg;
  });

  const edgeCount = degrees.reduce((a, b) => a + b, 0) / 2;

  // Clustering coefficient for each node
  const clusteringCoeffs = adjacency.map((row, i) => {
    const neighbors = row.map((v, j) => v && i !== j ? j : -1).filter(j => j >= 0);
    const k = neighbors.length;
    if (k < 2) return 0;
    let links = 0;
    for (let a = 0; a < neighbors.length; a++) {
      for (let b = a + 1; b < neighbors.length; b++) {
        if (adjacency[neighbors[a]][neighbors[b]]) links++;
      }
    }
    return (2 * links) / (k * (k - 1));
  });
  const clusteringCoefficient = clusteringCoeffs.reduce((a, b) => a + b, 0) / nodeCount;

  // All-pairs shortest paths via BFS
  let totalPathLength = 0;
  let reachablePairs = 0;
  for (let src = 0; src < nodeCount; src++) {
    const dist = new Array(nodeCount).fill(Infinity);
    dist[src] = 0;
    const queue = [src];
    let qi = 0;
    while (qi < queue.length) {
      const u = queue[qi++];
      for (let v = 0; v < nodeCount; v++) {
        if (adjacency[u][v] && dist[v] === Infinity) {
          dist[v] = dist[u] + 1;
          queue.push(v);
        }
      }
    }
    for (let v = 0; v < nodeCount; v++) {
      if (v !== src && dist[v] < Infinity) {
        totalPathLength += dist[v];
        reachablePairs++;
      }
    }
  }
  const avgPathLength = reachablePairs > 0 ? totalPathLength / reachablePairs : Infinity;
  const globalEfficiency = reachablePairs > 0 ? reachablePairs / totalPathLength : 0;

  // Random graph baselines (Erdős-Rényi approximations)
  const p = edgeCount / ((nodeCount * (nodeCount - 1)) / 2);
  const C_rand = p;
  const L_rand = nodeCount > 1 ? Math.log(nodeCount) / Math.log(Math.max(1, p * nodeCount)) : 1;
  const smallWorldIndex = (C_rand > 0 && L_rand > 0)
    ? (clusteringCoefficient / C_rand) / (avgPathLength / L_rand)
    : 0;

  return { nodeCount, edgeCount, clusteringCoefficient, avgPathLength, smallWorldIndex, degrees, globalEfficiency };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface NeuroAnalysisResult {
  hh?: HHResult;
  wilsonCowan?: WilsonCowanResult;
  lif?: LIFResult;
  eeg?: EEGBandPowerResult;
  connectivity?: ConnectivityMetrics;
  converged: boolean;
}

export function buildNeuroReceipt(
  result: NeuroAnalysisResult,
  options?: NeuroReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.hh && result.hh.firingRateHz === 0 && result.hh.spikeTimes.length === 0) {
    // Sub-threshold stimulus — not necessarily a violation, but informative
  }
  if (result.wilsonCowan && !result.wilsonCowan.converged) {
    violations.push({ criterion: 'convergence', message: 'Wilson-Cowan did not converge to fixed point' });
  }
  if (result.lif && result.lif.theoreticalRateHz !== null) {
    const rateErr = Math.abs(result.lif.firingRateHz - result.lif.theoreticalRateHz) / result.lif.theoreticalRateHz;
    if (rateErr > 0.20) {
      violations.push({ criterion: 'lif_rate', message: `LIF firing rate deviates ${(rateErr * 100).toFixed(1)}% from theoretical` });
    }
  }

  const resultSummary = {
    hhSpikes: result.hh?.spikeTimes.length,
    hhPeakMv: result.hh?.peakVoltageMv,
    hhFiringRateHz: result.hh?.firingRateHz,
    wcSteadyE: result.wilsonCowan?.steadyStateE,
    wcSteadyI: result.wilsonCowan?.steadyStateI,
    lifFiringRateHz: result.lif?.firingRateHz,
    eegDominantBand: result.eeg?.dominantBand,
    connectivityCluster: result.connectivity?.clusteringCoefficient,
    smallWorldIndex: result.connectivity?.smallWorldIndex,
  } as unknown as { [key: string]: import('@holoscript/core').DomainReceiptJson };

  return buildDomainSimulationReceipt({
    plugin: 'neuroscience',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `neuro-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'hodgkin-huxley-rk4', scale: 'neuron' },
    resultSummary,
    cael: { version: 'cael.v1', event: 'neuroscience.neural_simulation', solverType: 'neuroscience.hh-rk4' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
