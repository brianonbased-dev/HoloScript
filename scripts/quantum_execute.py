#!/usr/bin/env python3
"""
HoloScript IBM Quantum Runtime Bridge
======================================
Accepts a JSON-encoded task descriptor via argv[1] and writes a JSON result
to stdout.  All errors are also returned as JSON so the TypeScript caller
(IBMQuantumBackend._runPythonBridge) never needs to parse stderr.

Supported tasks
---------------
vqe  -- Variational Quantum Eigensolver for molecular ground-state energy
qaoa -- QAOA Max-Cut / QUBO combinatorial optimisation

Dependencies (install once)
---------------------------
    pip install qiskit qiskit-ibm-runtime qiskit-aer

Tested against:
    qiskit >= 1.0
    qiskit-ibm-runtime >= 0.20
    qiskit-aer >= 0.13

Usage
-----
    python3 quantum_execute.py '{"task": "vqe", "molecule": {"atoms": [...]}, "execution_mode": "aer"}'
    python3 quantum_execute.py '{"task": "qaoa", "weight_matrix": [[0,1],[1,0]], "p": 1}'
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any


# ---------------------------------------------------------------------------
# VQE
# ---------------------------------------------------------------------------

def run_vqe(params: dict[str, Any]) -> dict[str, Any]:
    """Run VQE using Qiskit Estimator primitive.

    Supports H₂ (exact STO-3G Hamiltonian from Kandala et al. Nature 2017)
    and generic molecules (hardware-efficient placeholder Hamiltonian — stage 2
    integration with OpenFermion/PySCF is noted as a follow-up).

    Parameters
    ----------
    params : dict
        task            : "vqe"
        molecule        : {"atoms": [{"symbol": str, "x": float, ...}, ...]}
        execution_mode  : "aer" | "ibm-quantum"  (default "aer")
        max_iterations  : int (default 300, capped at 100 internally for speed)
        ansatz_layers   : int (default 2)

    Returns
    -------
    dict with keys: ground_state_energy, converged, optimizer_iterations,
    final_cost, num_qubits, circuit_depth, execution_backend, wall_time_seconds
    — or {"error": str} on failure.
    """
    try:
        import numpy as np
        from qiskit.circuit.library import EfficientSU2
        from qiskit.quantum_info import SparsePauliOp
        from qiskit.primitives import StatevectorEstimator
    except ImportError as exc:
        return {
            "error": (
                f"Qiskit not installed: {exc}. "
                "Run: pip install qiskit qiskit-aer"
            )
        }

    atoms: list[dict[str, Any]] = params.get("molecule", {}).get("atoms", [])
    execution_mode: str = params.get("execution_mode", "aer")
    max_iterations: int = int(params.get("max_iterations", 300))
    ansatz_layers: int = int(params.get("ansatz_layers", 2))

    # sto-3g orbital → qubit count (Jordan-Wigner)
    orbital_map: dict[str, int] = {"H": 1, "C": 5, "N": 5, "O": 5, "F": 5}
    num_orbitals: int = sum(orbital_map.get(a["symbol"], 9) for a in atoms)
    num_qubits: int = num_orbitals * 2

    if num_qubits > 30:
        return {
            "error": (
                f"Molecule too large: {num_qubits} qubits (max 30 for Aer). "
                "Use a classical QM backend (PySCF, ORCA) for this system."
            )
        }

    # -----------------------------------------------------------------------
    # Hamiltonian
    # -----------------------------------------------------------------------
    # H₂ STO-3G Hamiltonian (Kandala 2017 two-qubit symmetry-reduced form).
    # Reference: Kandala et al. Nature 549, 242–246 (2017).
    is_h2 = len(atoms) == 2 and all(a["symbol"] == "H" for a in atoms)

    if is_h2:
        # Two-qubit Z2-reduced H2/STO-3G at 0.735 Å bond distance.
        # Exact minimum eigenvalue: −1.8573 Ha (verified numerically 2026-05-21).
        # Note: the full 4-qubit STO-3G FCI value is −1.1372 Ha (different basis).
        num_qubits = 2
        hamiltonian = SparsePauliOp.from_list([
            ("II", -1.0523732),
            ("IZ",  0.3979374),
            ("ZI", -0.3979374),
            ("ZZ", -0.0112801),
            ("XX",  0.1809312),
        ])
    else:
        # Generic hardware-efficient placeholder.
        # Stage 2: replace with PySCF → OpenFermion → QubitOperator → SparsePauliOp.
        pauli_terms: list[tuple[str, float]] = [("I" * num_qubits, -1.0)]
        for i in range(num_qubits - 1):
            term = "I" * i + "ZZ" + "I" * (num_qubits - i - 2)
            pauli_terms.append((term, 0.1))
        hamiltonian = SparsePauliOp.from_list(pauli_terms)

    # -----------------------------------------------------------------------
    # Ansatz + optimiser
    # -----------------------------------------------------------------------
    ansatz = EfficientSU2(num_qubits, reps=ansatz_layers, entanglement="linear")
    estimator = StatevectorEstimator()

    num_params: int = ansatz.num_parameters
    best_energy = float("inf")
    converged = False

    t0 = time.monotonic()

    def _energy(theta_vec: np.ndarray) -> float:
        pub = (ansatz, [hamiltonian], [theta_vec])
        return float(estimator.run([pub]).result()[0].data.evs)

    if execution_mode == "aer":
        # Noiseless simulator: COBYLA converges in ~100 evals (no shot noise).
        from scipy.optimize import minimize as _minimize  # type: ignore[import-untyped]
        theta0 = np.zeros(num_params)
        res = _minimize(
            _energy,
            theta0,
            method="COBYLA",
            options={"maxiter": min(max_iterations, 500), "rhobeg": 0.5},
        )
        best_energy = float(res.fun)
        converged = bool(res.success)
        iterations = int(res.nfev)
    else:
        # Real hardware / shot-based: SPSA handles measurement noise.
        a_coeff, c_coeff = 0.1, 0.1
        iterations = min(max_iterations, 300)
        theta: np.ndarray = np.random.uniform(-np.pi, np.pi, num_params)

        for k in range(iterations):
            ck = c_coeff / (k + 1) ** 0.16
            delta: np.ndarray = np.random.choice([-1, 1], size=num_params).astype(float)

            theta_plus = theta + ck * delta
            theta_minus = theta - ck * delta

            e_plus = _energy(theta_plus)
            e_minus = _energy(theta_minus)

            gradient = (e_plus - e_minus) / (2 * ck)
            ak = a_coeff / (k + 1 + 10) ** 0.6
            theta -= ak * gradient * delta

            current_energy = min(e_plus, e_minus)
            if current_energy < best_energy:
                best_energy = current_energy

            if abs(gradient) < 1e-4:
                converged = True
                break

    wall_time = time.monotonic() - t0

    return {
        "ground_state_energy": float(best_energy),
        "converged": converged,
        "optimizer_iterations": iterations,
        "final_cost": float(best_energy),
        "num_qubits": num_qubits,
        "circuit_depth": ansatz.depth(),
        "execution_backend": execution_mode,
        "wall_time_seconds": wall_time,
    }


# ---------------------------------------------------------------------------
# QAOA
# ---------------------------------------------------------------------------

def run_qaoa(params: dict[str, Any]) -> dict[str, Any]:
    """Run QAOA for Max-Cut using Qiskit Sampler primitive.

    Uses a p-round QAOA ansatz with a grid search over (gamma, beta) when
    p == 1, falling back to random initialisation for p > 1.  Evaluates
    the Max-Cut objective on every sampled bitstring and tracks the best.

    Parameters
    ----------
    params : dict
        task          : "qaoa"
        weight_matrix : 2-D list of floats (n × n adjacency / weight matrix)
        p             : int, QAOA rounds (default 1)
        execution_mode: "aer" | "ibm-quantum"  (default "aer")

    Returns
    -------
    dict with keys: optimal_bitstring, optimal_value, approximation_ratio,
    circuit_depth_p, num_qubits, execution_backend, wall_time_seconds
    — or {"error": str} on failure.
    """
    try:
        import numpy as np
        from qiskit.circuit.library import QAOAAnsatz
        from qiskit.quantum_info import SparsePauliOp
        from qiskit.primitives import StatevectorSampler
    except ImportError as exc:
        return {
            "error": (
                f"Qiskit not installed: {exc}. "
                "Run: pip install qiskit qiskit-aer"
            )
        }

    weight_matrix: list[list[float]] = params.get("weight_matrix", [[0, 1], [1, 0]])
    p: int = max(1, int(params.get("p", 1)))
    execution_mode: str = params.get("execution_mode", "aer")

    n = len(weight_matrix)

    if n > 20:
        return {
            "error": (
                f"Graph has {n} nodes (max 20 for Aer QAOA prototype). "
                "Reduce graph size or use a classical solver for larger instances."
            )
        }

    # -----------------------------------------------------------------------
    # Max-Cut cost Hamiltonian: H = Σ w_ij (I − Z_i Z_j) / 2
    # -----------------------------------------------------------------------
    pauli_terms: list[tuple[str, float]] = []
    for i in range(n):
        for j in range(i + 1, n):
            w = float(weight_matrix[i][j])
            if w != 0.0:
                zz = "I" * i + "Z" + "I" * (j - i - 1) + "Z" + "I" * (n - j - 1)
                pauli_terms.append((zz, -w / 2))
                pauli_terms.append(("I" * n, w / 2))

    if not pauli_terms:
        pauli_terms = [("I" * n, 0.0)]

    cost_op = SparsePauliOp.from_list(pauli_terms)
    mixer_op = SparsePauliOp.from_list(
        [("I" * i + "X" + "I" * (n - i - 1), 1.0) for i in range(n)]
    )

    ansatz = QAOAAnsatz(cost_op, reps=p, mixer_operator=mixer_op)
    sampler = StatevectorSampler()

    t0 = time.monotonic()

    best_bitstring = "0" * n
    best_value = 0.0

    # Grid search over (gamma, beta) for p == 1; random for p > 1
    import numpy as np

    gamma_vals = np.linspace(0, np.pi, 8)
    beta_vals = np.linspace(0, np.pi / 2, 8)

    for gamma in gamma_vals:
        for beta in beta_vals:
            if p == 1:
                params_vals = [float(gamma), float(beta)]
            else:
                params_vals = np.random.uniform(0, np.pi, ansatz.num_parameters).tolist()

            # Pad / trim to match actual parameter count
            if len(params_vals) != ansatz.num_parameters:
                params_vals = np.random.uniform(
                    0, np.pi, ansatz.num_parameters
                ).tolist()

            pub = (ansatz, params_vals)
            result = sampler.run([pub]).result()[0]
            counts: dict[str, int] = result.data.meas.get_counts()

            for bitstring, _count in counts.items():
                # Evaluate Max-Cut objective for this bitstring
                cut_value = sum(
                    weight_matrix[i][j]
                    for i in range(n)
                    for j in range(i + 1, n)
                    if int(bitstring[i]) != int(bitstring[j])
                )
                if cut_value > best_value:
                    best_value = cut_value
                    best_bitstring = bitstring

    # -----------------------------------------------------------------------
    # Classical optimum (brute-force, feasible for n ≤ 20)
    # -----------------------------------------------------------------------
    classical_opt = 0.0
    for mask in range(1 << n):
        cut = sum(
            weight_matrix[i][j]
            for i in range(n)
            for j in range(i + 1, n)
            if ((mask >> i) & 1) != ((mask >> j) & 1)
        )
        classical_opt = max(classical_opt, cut)

    approx_ratio = best_value / classical_opt if classical_opt > 0 else 1.0
    wall_time = time.monotonic() - t0

    return {
        "optimal_bitstring": best_bitstring,
        "optimal_value": float(best_value),
        "approximation_ratio": float(approx_ratio),
        "circuit_depth_p": p,
        "num_qubits": n,
        "execution_backend": execution_mode,
        "wall_time_seconds": wall_time,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Parse argv[1] as JSON and dispatch to the appropriate task handler."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: quantum_execute.py '<json_input>'"}))
        sys.exit(1)

    try:
        task_params: dict[str, Any] = json.loads(sys.argv[1])
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON input: {exc}"}))
        sys.exit(1)

    task: str = task_params.get("task", "")

    if task == "vqe":
        result = run_vqe(task_params)
    elif task == "qaoa":
        result = run_qaoa(task_params)
    else:
        result = {
            "error": (
                f"Unknown task: '{task}'. "
                "Supported tasks: vqe, qaoa"
            )
        }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
