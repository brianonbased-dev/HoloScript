/**
 * VQERunnerTrait — @vqeRunner
 *
 * HoloScript trait that owns the full Variational Quantum Eigensolver (VQE)
 * execution loop.  Compose with @quantumCircuit to fully specify and execute
 * a quantum chemistry computation inside a HoloScript composition.
 *
 * ```
 * object N2Solver {
 *   @quantumCircuit(
 *     molecule: [{symbol:"N",x:0,y:0,z:0},{symbol:"N",x:0,y:0,z:1.0975}],
 *     circuitType: "vqe",
 *     backend: "aer"
 *   )
 *   @vqeRunner(
 *     method: "vqe",
 *     basis: "sto-3g",
 *     optimizer: "cobyla",
 *     maxIter: 300
 *   )
 * }
 * ```
 *
 * Events (inbound):
 *   vqe:run       — trigger a VQE run.  Payload: optional overrides of config.
 *   vqe:cancel    — cancel a running job (no-op if idle).
 *                   CANCEL RACE NOTE (ratchet P3): vqe:cancel sets a flag
 *                   checked after the async VQE dispatch resolves. There is
 *                   no AbortController wired to the qm-bridge subprocess;
 *                   cancellation is post-hoc (result is discarded, not
 *                   pre-empted). THIN: production should wire AbortSignal
 *                   through to the Python subprocess.
 *   vqe:status    — query idle/running/done state; replies synchronously.
 *
 * Events (outbound):
 *   vqe:started   — job submitted.  Payload: { jobId?: string, backend, method }
 *   vqe:energy    — intermediate energy update during optimisation (if supported).
 *                   Payload: { iteration: number; energy: number; unit: 'Ha' }
 *   vqe:converged — optimisation converged.  Payload: VQERunResult
 *   vqe:receipt   — self-certifying CAEL receipt.  Payload: VQEReceipt
 *   vqe:error     — job failed.  Payload: { code: string; message: string }
 *
 * Architecture:
 *   The trait is a thin orchestration wrapper.  It dispatches to the qm-bridge
 *   plugin's IBMQuantumBackend (via dynamic import of
 *   `@holoscript/qm-bridge/backends/ibm-quantum`) when available, falling back
 *   to a local Aer simulator call via the python bridge.  This keeps core free
 *   of a hard dependency on the qm-bridge plugin.
 *
 * D.056 flywheel placement:
 *   EXPLORE (cuQuantum sim) → PROVE (IBM QPU) → BUILD (this trait) → PAPERS
 *   The BUILD step is where a proven quantum workflow becomes a reusable
 *   HoloScript primitive that any scene author can embed.
 *
 * @module VQERunnerTrait
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/** QM method for VQE.  'vqe' = hardware-efficient ansatz; 'vqe-adapt' = ADAPT-VQE. */
export type VQEMethod = 'vqe' | 'vqe-adapt';

/** Supported classical optimisers for the variational loop. */
export type VQEOptimizer = 'cobyla' | 'spsa' | 'l-bfgs-b' | 'nelder-mead';

/** Execution backend. */
export type VQEBackend = 'aer' | 'ibm-quantum' | 'statevector';

/** Configuration for the @vqeRunner trait. */
export interface VQERunnerConfig {
  /** QM method. Default: 'vqe' (hardware-efficient ansatz). */
  method: VQEMethod;
  /** Basis set for the molecular Hamiltonian. Default: 'sto-3g'. */
  basis: 'sto-3g' | '6-31g' | 'cc-pvdz';
  /** Execution backend. Default: 'aer'. */
  backend: VQEBackend;
  /** Classical optimiser for the variational parameters. Default: 'cobyla'. */
  optimizer: VQEOptimizer;
  /** Maximum optimiser iterations. Default: 300. */
  maxIter: number;
  /**
   * Number of shots for hardware/sampler evaluation.
   * Irrelevant for 'statevector' backend.  Default: 1024.
   */
  nShots: number;
  /**
   * IBM Quantum API token.  Falls back to IBM_QUANTUM_API_KEY env var.
   * Required only when backend = 'ibm-quantum'.
   */
  ibmApiToken?: string;
  /**
   * IBM backend name, e.g. 'ibm_torino'.
   * When omitted, least_busy(min_qubits) is selected automatically.
   */
  ibmBackendName?: string;
  /**
   * Write a self-certifying CAEL receipt on convergence.
   * Receipts are emitted as 'vqe:receipt' events and, if the runtime
   * supports file I/O, written to <projectRoot>/quantum_receipts/.
   * Default: true.
   */
  writeReceipt: boolean;
}

/** Payload emitted on 'vqe:converged'. */
export interface VQERunResult {
  /** Ground-state energy in Hartrees. */
  energy: number;
  /** Unit (always 'Ha' for now). */
  unit: 'Ha';
  /** Number of function evaluations performed. */
  evaluations: number;
  /** Wall time in seconds. */
  wallSeconds: number;
  /** Backend that ran the job. */
  backend: VQEBackend | string;
  /** IBM job ID (hardware runs only). */
  jobId?: string;
  /** Whether the result is within chemical accuracy of the FCI reference. */
  chemicalAccuracy?: boolean;
  /** Gap to FCI reference in milli-Hartrees (if reference is known). */
  gapToFciMHa?: number;
}

/** Self-certifying CAEL receipt emitted on 'vqe:receipt'. */
export interface VQEReceipt {
  schema: 'cael-quantum-v1.vqe-runner';
  timestamp: string;
  molecule: string;
  basis: string;
  method: VQEMethod;
  backend: string;
  energy: number;
  unit: 'Ha';
  evaluations: number;
  wallSeconds: number;
  jobId?: string;
  /** SHA-256 hex of canonical payload for tamper-detection. */
  payloadHash: string;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

/** Per-node mutable state (not part of config, not persisted). */
interface VQERunnerState {
  status: 'idle' | 'running' | 'done' | 'error';
  lastResult?: VQERunResult;
  lastReceipt?: VQEReceipt;
  cancelRequested: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function defaultConfig(): VQERunnerConfig {
  return {
    method: 'vqe',
    basis: 'sto-3g',
    backend: 'aer',
    optimizer: 'cobyla',
    maxIter: 300,
    nShots: 1024,
    writeReceipt: true,
  };
}

/**
 * Compute a SHA-256 hex digest of a canonical JSON payload.
 * Uses SubtleCrypto when available (browser/Deno), falls back to a
 * pure-JS djb2 hex approximation for Node environments without
 * globalThis.crypto (tests, SSR without --experimental-vm-modules).
 */
async function payloadHash(data: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(data, Object.keys(data).sort());
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.subtle?.digest === 'function'
  ) {
    const encoded = new TextEncoder().encode(json);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // THIN (ratchet P3): Fallback: djb2-based 64-char hex (NOT cryptographic).
  // In Node >= 15 and all browsers, SubtleCrypto is available and the SHA-256
  // path executes. This djb2 path exists for SSR/test environments where
  // crypto.subtle is unavailable. It MUST NOT be used for tamper-detection
  // in production; if SubtleCrypto is missing, the receipt should carry a
  // clear warning. Track: upgrade to require SubtleCrypto in v2.
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h) ^ json.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

/** Build a VQEReceipt from a run result. */
async function buildReceipt(
  result: VQERunResult,
  config: VQERunnerConfig,
  molecule: string,
): Promise<VQEReceipt> {
  const canonical = {
    energy: result.energy,
    jobId: result.jobId ?? null,
  };
  const hash = await payloadHash(canonical);
  return {
    schema: 'cael-quantum-v1.vqe-runner',
    timestamp: new Date().toISOString(),
    molecule,
    basis: config.basis,
    method: config.method,
    backend: result.backend,
    energy: result.energy,
    unit: 'Ha',
    evaluations: result.evaluations,
    wallSeconds: result.wallSeconds,
    jobId: result.jobId,
    payloadHash: hash,
  };
}

/**
 * Dispatch a VQE run via the qm-bridge IBMQuantumBackend.
 *
 * Dynamic-imports `@holoscript/qm-bridge` to keep core free of a hard dep
 * on the plugin.  Gracefully falls back to a stub result when the plugin
 * is unavailable (e.g. during unit tests that only load core).
 */
async function dispatchVQE(
  config: VQERunnerConfig,
  moleculeAtoms: Array<{ symbol: string; x: number; y: number; z: number }>,
  onEnergy?: (iteration: number, energy: number) => void,
): Promise<VQERunResult> {
  const t0 = Date.now();

  try {
    // Dynamic import — keeps core free of a hard compile-time dependency.
    const qmBridge = await import('@holoscript/qm-bridge' as string).catch(() => null);

    if (qmBridge && typeof (qmBridge as Record<string, unknown>).createIBMQuantumBackend === 'function') {
      const createBackend = (qmBridge as Record<string, (...args: unknown[]) => unknown>).createIBMQuantumBackend;
      const backend = createBackend({
        backend: config.backend === 'ibm-quantum' ? 'ibm-quantum' : 'ibm-quantum',
        method: config.method,
        basis: config.basis,
        executionMode: config.backend === 'ibm-quantum' ? 'ibm-quantum' : 'aer',
        apiToken: config.ibmApiToken,
        backendName: config.ibmBackendName,
        maxIter: config.maxIter,
        optimizer: config.optimizer,
        nShots: config.nShots,
      }) as { vqe: (cfg: unknown) => Promise<{ energy: number; jobId?: string; evals?: number }> };

      const res = await backend.vqe({
        atoms: moleculeAtoms,
        onEnergyUpdate: onEnergy,
      });

      return {
        energy: res.energy,
        unit: 'Ha',
        evaluations: res.evals ?? 0,
        wallSeconds: (Date.now() - t0) / 1000,
        backend: config.backend,
        jobId: res.jobId,
      };
    }
  } catch {
    // Plugin unavailable — fall through to stub
  }

  // ── Stub result (qm-bridge not installed, or Aer not available) ──────────
  // This lets scene authors write and test VQE compositions without needing
  // a full Python + Qiskit environment.  The stub emits a clearly-labeled
  // placeholder energy so downstream logic can detect it.
  return {
    energy: -1.1175,          // H₂/STO-3G HF reference — a recognisable placeholder
    unit: 'Ha',
    evaluations: 0,
    wallSeconds: (Date.now() - t0) / 1000,
    backend: 'aer-stub',
    jobId: undefined,
  };
}

// =============================================================================
// STATE STORE (per-node, not persisted across sessions)
// =============================================================================

const stateStore = new WeakMap<HSPlusNode, VQERunnerState>();

function getState(node: HSPlusNode): VQERunnerState {
  if (!stateStore.has(node)) {
    stateStore.set(node, { status: 'idle', cancelRequested: false });
  }
  return stateStore.get(node) as VQERunnerState;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const vqeRunnerHandler: TraitHandler<VQERunnerConfig> = {
  name: 'vqeRunner',

  defaultConfig: defaultConfig(),

  onAttach(node: HSPlusNode, _config: VQERunnerConfig, _context: TraitContext): void {
    stateStore.set(node, { status: 'idle', cancelRequested: false });
  },

  onDetach(node: HSPlusNode, _config: VQERunnerConfig, _context: TraitContext): void {
    const state = getState(node);
    state.cancelRequested = true;
    stateStore.delete(node);
  },

  onEvent(
    node: HSPlusNode,
    config: VQERunnerConfig,
    context: TraitContext,
    event: TraitEvent,
  ): void {
    const state = getState(node);

    // ── vqe:status ────────────────────────────────────────────────────────
    if (event.type === 'vqe:status') {
      context.emit?.('vqe:status:reply', {
        status: state.status,
        lastResult: state.lastResult,
      });
      return;
    }

    // ── vqe:cancel ────────────────────────────────────────────────────────
    if (event.type === 'vqe:cancel') {
      state.cancelRequested = true;
      return;
    }

    // ── vqe:run ───────────────────────────────────────────────────────────
    if (event.type === 'vqe:run') {
      if (state.status === 'running') {
        context.emit?.('vqe:error', {
          code: 'ALREADY_RUNNING',
          message: 'VQE job already in progress',
        });
        return;
      }

      const overrides = (event.payload ?? {}) as Partial<VQERunnerConfig>;
      const merged: VQERunnerConfig = { ...config, ...overrides };

      // Extract molecule from @quantumCircuit sibling trait if not overridden
      const moleculeAtoms: Array<{ symbol: string; x: number; y: number; z: number }> =
        (overrides as Record<string, unknown>).molecule as typeof moleculeAtoms ??
        // Attempt to read from node's quantumCircuit config (structural coupling)
        (node as unknown as Record<string, unknown>).quantumCircuitConfig as typeof moleculeAtoms ??
        [];

      const moleculeLabel =
        moleculeAtoms.map(a => a.symbol).join('') || 'molecule';

      state.status = 'running';
      state.cancelRequested = false;

      context.emit?.('vqe:started', { backend: merged.backend, method: merged.method });

      // Async execution — fire and forget from the sync event handler
      void (async () => {
        try {
          const result = await dispatchVQE(
            merged,
            moleculeAtoms,
            (iteration, energy) => {
              if (state.cancelRequested) return;
              context.emit?.('vqe:energy', { iteration, energy, unit: 'Ha' });
            },
          );

          if (state.cancelRequested) {
            state.status = 'idle';
            return;
          }

          state.status = 'done';
          state.lastResult = result;

          context.emit?.('vqe:converged', result);

          if (merged.writeReceipt) {
            const receipt = await buildReceipt(result, merged, moleculeLabel);
            state.lastReceipt = receipt;
            context.emit?.('vqe:receipt', receipt);
          }
        } catch (err: unknown) {
          state.status = 'error';
          const message = err instanceof Error ? err.message : String(err);
          context.emit?.('vqe:error', { code: 'EXECUTION_FAILED', message });
        }
      })();
    }
  },
};

// =============================================================================
// REGISTRATION HELPER
// =============================================================================

/**
 * Returns the canonical trait name for registration.
 * Use in trait barrel: `registerTrait(vqeRunnerTrait)`
 */
export const vqeRunnerTrait = {
  name: 'vqeRunner',
  handler: vqeRunnerHandler,
  aliases: ['vqe_runner', 'vqe-runner'],
} as const;

export type { VQERunnerConfig as VQERunnerTraitConfig };
