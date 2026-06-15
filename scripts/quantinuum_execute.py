#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quantinuum_execute.py -- Python bridge for the qm-bridge Quantinuum backend.

Counterpart to scripts/quantum_execute.py (IBM): runs VQE on *logical* (error-
corrected) qubits and reports the QEC bookkeeping -- logical-vs-physical error and
the post-selection acceptance fraction -- that the TS `QuantinuumBackend` maps onto a
`cael-quantum-v1.qec` receipt.

Execution modes
---------------
- "sim" (default): a pure-stdlib CLASSICAL SURROGATE of logical-qubit behaviour. No
  credentials, no network, no spend. It models how logical error suppresses with code
  distance (the same code-capacity binomial-tail model the ai-ecosystem Tier-0 QEC
  simulator uses) and applies a heralding/post-selection model when the code family
  uses it. The ground-state ENERGY it returns is an explicit deterministic surrogate
  (flagged `energy_is_surrogate`), NOT a real chemistry result -- energy accuracy is
  the IBM/Psi4 leg's job; this leg's product is the QEC receipt pipeline.
- "quantinuum": real Quantinuum H-series hardware via qnexus/pytket. FOUNDER-GATED
  paid compute (D.080 / F.072). If the SDK is absent the bridge returns a clear error
  rather than faking a hardware result.

Usage
-----
    python3 quantinuum_execute.py '{"task":"logical_vqe","molecule":{"atoms":[...]},
        "execution_mode":"sim","code_family":"steane","code_distance":3,
        "physical_error_rate":1e-3}'
"""
from __future__ import annotations

import json
import math
import sys
import time
from typing import Any


# ── Atomic numbers (electron counting for a crude active-space qubit estimate) ──

_Z = {
    "H": 1, "He": 2, "Li": 3, "Be": 4, "B": 5, "C": 6, "N": 7, "O": 8, "F": 9,
    "Ne": 10, "Na": 11, "Mg": 12, "Al": 13, "Si": 14, "P": 15, "S": 16, "Cl": 17,
    "Ar": 18, "K": 19, "Ca": 20, "Fe": 26, "Co": 27, "Ni": 28, "Cu": 29, "Zn": 30,
}


def _binomial_upper_tail(d: int, p: float) -> float:
    """P[#errors > d/2] over d Bernoulli(p) -- the failure probability of a
    distance-d code under code-capacity noise with an optimal lookup decoder.
    Decays exponentially in d for p below the 0.5 code-capacity threshold."""
    half = d / 2.0
    total = 0.0
    for k in range(d + 1):
        if k > half:
            total += math.comb(d, k) * (p ** k) * ((1 - p) ** (d - k))
    return total


def _physical_per_logical(code_family: str, d: int) -> int:
    """Surrogate encoding rate: physical qubits consumed per logical qubit.
    These are illustrative, clearly-labelled overheads -- not vendor-exact."""
    if code_family == "none":
        return 1
    if code_family == "steane":
        return 7  # the [[7,1,3]] colour code is fixed-size
    if code_family == "carbon":
        return max(7, 2 * d * d)  # rotated-surface-like overhead
    if code_family == "tesseract":
        return max(8, d * d)
    return 7


def _logical_qubits_for(molecule: dict[str, Any]) -> int:
    """Crude active-space qubit count from electron count (sto-3g ballpark)."""
    atoms = molecule.get("atoms", [])
    charge = int(molecule.get("charge", 0))
    n_elec = sum(_Z.get(a.get("symbol", "C"), 6) for a in atoms) - charge
    return max(2, min(8, n_elec))


def _surrogate_energy(molecule: dict[str, Any]) -> float:
    """Deterministic, clearly-flagged surrogate total energy (Hartree-scale).
    NOT a real VQE result; energy accuracy belongs to the IBM/Psi4 leg."""
    atoms = molecule.get("atoms", [])
    charge = int(molecule.get("charge", 0))
    n_elec = sum(_Z.get(a.get("symbol", "C"), 6) for a in atoms) - charge
    return round(-0.55 * n_elec, 6)


def run_logical_vqe_sim(params: dict[str, Any]) -> dict[str, Any]:
    """The classical surrogate path (default; free)."""
    t0 = time.monotonic()
    molecule = params.get("molecule", {})
    code_family = str(params.get("code_family", "steane"))
    d = int(params.get("code_distance", 3))
    rounds = int(params.get("rounds", 1))
    p = float(params.get("physical_error_rate", 1e-3))

    logical_qubits = _logical_qubits_for(molecule)
    per = _physical_per_logical(code_family, d)
    physical_qubits = logical_qubits * per

    if code_family == "none":
        d = 1
        raw_logical = p
    else:
        raw_logical = _binomial_upper_tail(d, p)

    # Heralding / post-selection model: carbon & tesseract logical-qubit demos accept
    # only shots whose syndrome shows no detected leakage. Accepted shots are cleaner,
    # so the logical error among them is further suppressed -- at the cost of throwing
    # shots away. This is exactly the trade the 800x headline does NOT foreground.
    post_selected = code_family in ("carbon", "tesseract")
    if post_selected:
        acceptance_fraction = round((1.0 - p) ** physical_qubits, 6)
        logical_error_rate = round(raw_logical * acceptance_fraction, 12)
    else:
        acceptance_fraction = 1.0
        logical_error_rate = round(raw_logical, 12)

    return {
        "ground_state_energy": _surrogate_energy(molecule),
        "energy_is_surrogate": True,
        "converged": True,
        "optimizer_iterations": int(params.get("max_iterations", 100)),
        "final_cost": _surrogate_energy(molecule),
        "num_qubits": physical_qubits,
        "logical_qubits": logical_qubits,
        "physical_qubits": physical_qubits,
        "code_family": code_family,
        "code_distance": d,
        "rounds": rounds,
        "physical_error_rate": p,
        "logical_error_rate": logical_error_rate,
        "post_selection_used": post_selected,
        "acceptance_fraction": acceptance_fraction,
        "circuit_depth": 4 * (params.get("ansatz_layers", 1) or 1) + rounds,
        "execution_backend": "quantinuum-sim",
        "wall_time_seconds": round(time.monotonic() - t0, 6),
        "note": (
            "Classical surrogate of logical-qubit error suppression (code-capacity "
            "binomial model + heralding). NOT hardware; energy is a deterministic "
            "placeholder. Set execution_mode='quantinuum' for a real H-series run."
        ),
    }


def run_logical_vqe_hardware(params: dict[str, Any]) -> dict[str, Any]:
    """Real H-series path. Gated paid compute; returns a clear error if the SDK is
    absent rather than fabricating a hardware result."""
    try:
        import qnexus  # type: ignore  # noqa: F401
        import pytket  # type: ignore  # noqa: F401
    except Exception as exc:  # SDK not installed
        return {
            "error": (
                "Quantinuum hardware mode requires the qnexus + pytket SDK "
                f"(import failed: {exc}). Install with `pip install qnexus pytket`, set "
                "QUANTINUUM_API_KEY, and note this is FOUNDER-GATED paid compute "
                "(D.080/F.072) — do not run without explicit authorization. Use "
                "execution_mode='sim' for the free pipeline/receipt path."
            )
        }
    # Implemented build: real circuit submission goes here (qnexus job → logical VQE).
    # Deliberately not wired to a live submission in this commit so no accidental spend.
    return {
        "error": (
            "Hardware submission is intentionally not wired in this build to prevent "
            "accidental spend. The qnexus SDK is present; enabling live submission is a "
            "founder-authorized follow-up. Use execution_mode='sim' meanwhile."
        )
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: quantinuum_execute.py '<json_input>'"}))
        return
    try:
        params: dict[str, Any] = json.loads(sys.argv[1])
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON input: {exc}"}))
        return

    task = params.get("task", "")
    mode = params.get("execution_mode", "sim")
    try:
        if task == "logical_vqe":
            if mode == "quantinuum":
                result = run_logical_vqe_hardware(params)
            else:
                result = run_logical_vqe_sim(params)
        else:
            result = {"error": f"Unknown task '{task}'. Supported: logical_vqe"}
    except Exception as exc:  # surface as JSON, never a bare traceback to the bridge
        result = {"error": f"quantinuum_execute failed: {exc}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
