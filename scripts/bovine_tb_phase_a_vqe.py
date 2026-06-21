#!/usr/bin/env python3
"""Bovine-TB Phase A1 InhA/INH active-space VQE receipt runner.

This is a research benchmark harness, not a clinical/veterinary claim. It
creates the first executable BTA-QA1 quantum slice: a fixed InhA/isoniazid
active-site fragment, exact diagonalization reference, deterministic VQE run,
and a hash-verifiable CAEL quantum receipt.

When PySCF is available, ``--reference-backend pyscf`` asks the existing
``quantum_execute.py`` PySCF/OpenFermion bridge to generate the Hamiltonian.
On this host PySCF is not installed, so the default ``auto`` mode falls back to
an explicitly labeled four-qubit active-space fixture. The fixture proves the
receipt/variational/evidence path without pretending to be ab initio chemistry.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import pathlib
import platform
import sys
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np
from scipy.optimize import minimize

VERSION = "0.1.0"
SCHEMA = "cael-quantum-v1.bovine-tb.phase-a"
DEFAULT_TASK_ID = "task_1782044782254_dicf"
CHEMICAL_ACCURACY_MHA = 1.6

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO_ROOT / ".scratch" / "bovine-tb-phase-a" / "inha-inh-vqe-receipt.json"

PAULI_MATRICES: dict[str, np.ndarray] = {
    "I": np.eye(2, dtype=complex),
    "X": np.array([[0, 1], [1, 0]], dtype=complex),
    "Y": np.array([[0, -1j], [1j, 0]], dtype=complex),
    "Z": np.array([[1, 0], [0, -1]], dtype=complex),
}

# Minimal fixed active-site geometry. Coordinates are a deterministic benchmark
# fragment, not a crystallographic claim. Roles preserve the chemistry intent:
# INH hydrazide donor pair, a NAD nicotinamide acceptor proxy, and an InhA
# Tyr/Ser hydrogen-bond proxy around the donor-acceptor axis.
FIXTURE_GEOMETRY = [
    {"symbol": "N", "x": 0.000, "y": 0.000, "z": 0.000, "role": "INH hydrazide donor N"},
    {"symbol": "N", "x": 1.330, "y": 0.000, "z": 0.000, "role": "INH hydrazide acceptor N"},
    {"symbol": "C", "x": 2.520, "y": 0.160, "z": 0.000, "role": "INH carbonyl C"},
    {"symbol": "O", "x": 3.190, "y": 1.140, "z": 0.000, "role": "INH carbonyl O"},
    {"symbol": "C", "x": -1.180, "y": -0.220, "z": 0.000, "role": "NAD nicotinamide C4 proxy"},
    {"symbol": "O", "x": 0.470, "y": 1.870, "z": 0.000, "role": "InhA Tyr/Ser H-bond proxy"},
]

# Four-qubit selected active-space fixture. It is deliberately small enough for
# exact diagonalization and a local statevector VQE, while still containing
# hopping terms (XX/YY) and cross-orbital ZZ coupling.
FIXTURE_HAMILTONIAN: list[tuple[str, float]] = [
    ("IIII", -4.1123),
    ("ZIII", -0.4123),
    ("IZII", 0.3651),
    ("IIZI", -0.2214),
    ("IIIZ", 0.1782),
    ("ZZII", 0.1135),
    ("IIZZ", 0.0872),
    ("IZZI", 0.0441),
    ("ZIIZ", -0.0310),
    ("XXII", 0.0713),
    ("YYII", 0.0713),
    ("IIXX", 0.0524),
    ("IIYY", 0.0524),
    ("IXXI", 0.0280),
    ("IYYI", 0.0280),
]


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def strip_hashes(receipt: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in receipt.items() if k not in {"hash", "payload_hash"}}


def pauli_matrix(label: str) -> np.ndarray:
    matrix = np.array([[1]], dtype=complex)
    for char in label:
        matrix = np.kron(matrix, PAULI_MATRICES[char])
    return matrix


def hamiltonian_matrix(terms: list[tuple[str, float]]) -> np.ndarray:
    matrix = np.zeros((2 ** len(terms[0][0]), 2 ** len(terms[0][0])), dtype=complex)
    for label, coefficient in terms:
        matrix += float(coefficient) * pauli_matrix(label)
    return matrix


def ry(theta: float) -> np.ndarray:
    return np.array(
        [
            [math.cos(theta / 2), -math.sin(theta / 2)],
            [math.sin(theta / 2), math.cos(theta / 2)],
        ],
        dtype=complex,
    )


def single_qubit_gate(num_qubits: int, qubit: int, gate: np.ndarray) -> np.ndarray:
    matrix = np.array([[1]], dtype=complex)
    for index in range(num_qubits):
        matrix = np.kron(matrix, gate if index == qubit else PAULI_MATRICES["I"])
    return matrix


def cnot_gate(num_qubits: int, control: int, target: int) -> np.ndarray:
    projector_0 = np.array([[1, 0], [0, 0]], dtype=complex)
    projector_1 = np.array([[0, 0], [0, 1]], dtype=complex)
    term_0 = np.array([[1]], dtype=complex)
    term_1 = np.array([[1]], dtype=complex)
    for index in range(num_qubits):
        term_0 = np.kron(term_0, projector_0 if index == control else PAULI_MATRICES["I"])
        term_1 = np.kron(
            term_1,
            projector_1
            if index == control
            else (PAULI_MATRICES["X"] if index == target else PAULI_MATRICES["I"]),
        )
    return term_0 + term_1


def ansatz_state(theta: np.ndarray, num_qubits: int, layers: int) -> np.ndarray:
    state = np.zeros(2 ** num_qubits, dtype=complex)
    state[0] = 1.0
    cursor = 0
    entanglers = [cnot_gate(num_qubits, q, q + 1) for q in range(num_qubits - 1)]
    for layer in range(layers + 1):
        for qubit in range(num_qubits):
            state = single_qubit_gate(num_qubits, qubit, ry(float(theta[cursor]))) @ state
            cursor += 1
        if layer < layers:
            for entangler in entanglers:
                state = entangler @ state
    return state


def qiskit_terms_to_list(hamiltonian: Any) -> list[tuple[str, float]]:
    terms = []
    for label, coefficient in hamiltonian.to_list():
        real = float(np.real(complex(coefficient)))
        if abs(real) > 1e-12:
            terms.append((str(label), real))
    if not terms:
        raise RuntimeError("PySCF bridge returned an empty Hamiltonian")
    return terms


def pyscf_available() -> bool:
    return importlib.util.find_spec("pyscf") is not None


def build_hamiltonian(args: argparse.Namespace) -> tuple[list[tuple[str, float]], dict[str, Any]]:
    backend = args.reference_backend
    fallback_reason = None
    if backend == "auto":
        backend = "pyscf" if pyscf_available() else "fixture"
        if backend == "fixture":
            fallback_reason = "PySCF is not installed in this Python environment"

    if backend == "fixture":
        descriptor = {
            "backend": "fixture-exact-diagonalization",
            "abInitioReference": False,
            "fallbackReason": fallback_reason,
            "honestScope": (
                "Deterministic four-qubit BTA-QA1 active-space fixture. "
                "It proves the receipt and variational workflow; it is not a PySCF/Psi4 energy."
            ),
        }
        return FIXTURE_HAMILTONIAN, descriptor

    if backend == "pyscf":
        if not pyscf_available():
            raise RuntimeError(
                "PySCF is not installed. Install PySCF/OpenFermion or run with "
                "--reference-backend fixture for deterministic receipt-path validation."
            )
        sys.path.insert(0, str(REPO_ROOT / "scripts"))
        from quantum_execute import _build_molecular_hamiltonian_pyscf  # type: ignore

        atoms = [
            {key: atom[key] for key in ("symbol", "x", "y", "z")}
            for atom in FIXTURE_GEOMETRY
        ]
        hamiltonian, _num_qubits = _build_molecular_hamiltonian_pyscf(
            atoms,
            charge=args.charge,
            spin=args.spin,
            basis=args.basis,
            freeze_core=True,
        )
        if hamiltonian is None:
            raise RuntimeError("PySCF/OpenFermion bridge failed to generate a Hamiltonian")
        descriptor = {
            "backend": "pyscf-openfermion-jordan-wigner",
            "abInitioReference": True,
            "basis": args.basis,
            "charge": args.charge,
            "spin": args.spin,
        }
        return qiskit_terms_to_list(hamiltonian), descriptor

    raise RuntimeError(f"Unsupported reference backend: {backend}")


def run_vqe(
    matrix: np.ndarray,
    *,
    ansatz: str,
    layers: int,
    max_iterations: int,
    restarts: int,
) -> dict[str, Any]:
    num_qubits = int(round(math.log2(matrix.shape[0])))
    parameter_count = (layers + 1) * num_qubits
    best_result = None
    trace = []
    started = time.monotonic()

    for seed in range(restarts):
        rng = np.random.default_rng(seed)
        theta0 = np.zeros(parameter_count) if seed == 0 else rng.normal(0, 0.35, parameter_count)
        best_for_seed = {"energy": float("inf")}

        def objective(theta: np.ndarray) -> float:
            state = ansatz_state(theta, num_qubits, layers)
            energy = float(np.real(np.vdot(state, matrix @ state)))
            if energy < best_for_seed["energy"]:
                best_for_seed["energy"] = energy
            return energy

        result = minimize(
            objective,
            theta0,
            method="COBYLA",
            options={"maxiter": max_iterations, "rhobeg": 0.7, "tol": 1e-8},
        )
        trace.append(
            {
                "seed": seed,
                "energy_Ha": round(float(result.fun), 12),
                "best_seen_Ha": round(float(best_for_seed["energy"]), 12),
                "evaluations": int(result.nfev),
                "success": bool(result.success),
            }
        )
        if best_result is None or float(result.fun) < float(best_result.fun):
            best_result = result

    if best_result is None:
        raise RuntimeError("VQE did not run")

    return {
        "energy_Ha": float(best_result.fun),
        "optimizer": "COBYLA",
        "ansatzRequested": ansatz,
        "ansatzImplemented": f"hardware-efficient-ry-cnot-{num_qubits}q-{layers}layers",
        "layers": layers,
        "parameterCount": parameter_count,
        "iterations": int(best_result.nfev),
        "restarts": restarts,
        "trace": trace,
        "traceHash": sha256_json(trace),
        "wallTimeSeconds": round(time.monotonic() - started, 3),
    }


def build_receipt(args: argparse.Namespace) -> dict[str, Any]:
    generated_at = args.now or datetime.now(timezone.utc).isoformat()
    terms, reference_descriptor = build_hamiltonian(args)
    matrix = hamiltonian_matrix(terms)
    exact_energy = float(np.linalg.eigvalsh(matrix)[0])
    vqe = run_vqe(
        matrix,
        ansatz=args.ansatz,
        layers=args.ansatz_layers,
        max_iterations=args.max_iterations,
        restarts=args.restarts,
    )
    error_ha = float(vqe["energy_Ha"] - exact_energy)
    error_mha = error_ha * 1000
    variational_ok = error_ha >= -1e-8
    chemical_accuracy = abs(error_mha) <= CHEMICAL_ACCURACY_MHA
    failed_gates = []
    if not variational_ok:
        failed_gates.append("variational-principle")
    if not np.isfinite(vqe["energy_Ha"]):
        failed_gates.append("finite-energy")

    hamiltonian = {
        "mapping": "jordan-wigner",
        "numQubits": len(terms[0][0]),
        "termCount": len(terms),
        "terms": [{"pauli": label, "coefficient": coefficient} for label, coefficient in terms],
        "termsHash": sha256_json(terms),
    }
    payload = {
        "target": args.target,
        "ligand": args.ligand,
        "fragment": args.fragment,
        "hamiltonianHash": hamiltonian["termsHash"],
        "referenceEnergyHa": round(exact_energy, 12),
        "vqeEnergyHa": round(float(vqe["energy_Ha"]), 12),
        "traceHash": vqe["traceHash"],
    }
    receipt: dict[str, Any] = {
        "schema": SCHEMA,
        "adapterVersion": VERSION,
        "generatedAt": generated_at,
        "taskId": args.task_id,
        "simulationOnlyNotClinical": True,
        "target": args.target,
        "ligand": args.ligand,
        "fragment": {
            "id": args.fragment,
            "scope": "InhA/INH active-site selected active space",
            "geometryAngstrom": FIXTURE_GEOMETRY,
            "provenance": (
                "BTA-QA1 deterministic benchmark fragment from "
                "research/2026-06-21_bovine-tb-phase-a-quantum-engine-dossier.md"
            ),
        },
        "basis": args.basis,
        "activeSpace": {
            "selector": args.active_space,
            "numQubits": hamiltonian["numQubits"],
            "electronPairModel": "donor-acceptor orbital-pair fixture",
        },
        "reference": {
            **reference_descriptor,
            "exactEnergyHa": exact_energy,
            "chemicalAccuracyThresholdMha": CHEMICAL_ACCURACY_MHA,
        },
        "vqe": {
            **vqe,
            "backend": args.backend,
            "errorVsExactHa": error_ha,
            "errorVsExactMha": error_mha,
            "withinChemicalAccuracy": chemical_accuracy,
        },
        "hamiltonian": hamiltonian,
        "gate": {
            "variationalPrincipleOk": variational_ok,
            "finiteEnergy": bool(np.isfinite(vqe["energy_Ha"])),
            "chemicalAccuracyReached": chemical_accuracy,
        },
        "failedGates": failed_gates,
        "status": "pass" if not failed_gates else "fail",
        "runner": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "script": "scripts/bovine_tb_phase_a_vqe.py",
        },
        "verificationCommands": [
            "python scripts/bovine_tb_phase_a_vqe.py --self-test",
            "python scripts/bovine_tb_phase_a_vqe.py verify --receipt <receipt.json>",
        ],
        "honestScope": (
            "Research benchmark quantum receipt only. Not clinical/veterinary guidance, "
            "not docking/free-energy evidence, and not a real-world cure claim."
        ),
        "payload": payload,
    }
    receipt["payload_hash"] = sha256_json(payload)
    receipt["hash"] = f"sha256:{sha256_json(strip_hashes(receipt))}"
    return receipt


def validate_receipt(receipt: dict[str, Any]) -> list[str]:
    errors = []
    if receipt.get("schema") != SCHEMA:
        errors.append("schema mismatch")
    expected_hash = f"sha256:{sha256_json(strip_hashes(receipt))}"
    if receipt.get("hash") != expected_hash:
        errors.append("hash mismatch")
    if receipt.get("payload_hash") != sha256_json(receipt.get("payload")):
        errors.append("payload_hash mismatch")
    reference_energy = receipt.get("reference", {}).get("exactEnergyHa")
    vqe_energy = receipt.get("vqe", {}).get("energy_Ha")
    if not isinstance(reference_energy, (int, float)) or not isinstance(vqe_energy, (int, float)):
        errors.append("missing numeric energies")
    else:
        if vqe_energy + 1e-8 < reference_energy:
            errors.append("variational principle violated")
        reported_mha = receipt.get("vqe", {}).get("errorVsExactMha")
        actual_mha = (vqe_energy - reference_energy) * 1000
        if not isinstance(reported_mha, (int, float)) or abs(reported_mha - actual_mha) > 1e-6:
            errors.append("errorVsExactMha mismatch")
    if receipt.get("simulationOnlyNotClinical") is not True:
        errors.append("simulationOnlyNotClinical must be true")
    if receipt.get("status") == "pass" and receipt.get("failedGates"):
        errors.append("pass receipt cannot have failed gates")
    return errors


def write_json(path: pathlib.Path, value: Any) -> pathlib.Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def read_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_args(argv: list[str]) -> argparse.Namespace:
    if argv and argv[0] in {"run", "verify", "self-test"}:
        command = argv.pop(0)
    elif "--self-test" in argv:
        argv.remove("--self-test")
        command = "self-test"
    else:
        command = "run"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="InhA")
    parser.add_argument("--ligand", default="isoniazid")
    parser.add_argument("--fragment", default="active-site-v0")
    parser.add_argument("--basis", default="sto-3g")
    parser.add_argument("--active-space", default="bta-qa1-small")
    parser.add_argument("--backend", default="statevector-cpu")
    parser.add_argument("--reference-backend", choices=["auto", "fixture", "pyscf"], default="auto")
    parser.add_argument("--ansatz", choices=["ry-cnot", "hardware-efficient", "uccsd"], default="ry-cnot")
    parser.add_argument("--charge", type=int, default=0)
    parser.add_argument("--spin", type=int, default=0)
    parser.add_argument("--ansatz-layers", type=int, default=2)
    parser.add_argument("--max-iterations", type=int, default=800)
    parser.add_argument("--restarts", type=int, default=6)
    parser.add_argument("--task-id", default=DEFAULT_TASK_ID)
    parser.add_argument("--now")
    parser.add_argument("--out", "--write-receipt", dest="out", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--receipt")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    args.command = command
    return args


def self_test() -> dict[str, Any]:
    args = parse_args(
        [
            "run",
            "--reference-backend",
            "fixture",
            "--now",
            "2026-06-21T00:00:00+00:00",
        ]
    )
    receipt = build_receipt(args)
    errors = validate_receipt(receipt)
    if errors:
        raise RuntimeError(f"self-test receipt invalid: {'; '.join(errors)}")
    if receipt["status"] != "pass":
        raise RuntimeError(f"expected pass receipt, got {receipt['status']}")
    if not receipt["gate"]["variationalPrincipleOk"]:
        raise RuntimeError("variational principle gate did not pass")
    if receipt["vqe"]["errorVsExactMha"] > CHEMICAL_ACCURACY_MHA:
        raise RuntimeError("fixture VQE missed chemical accuracy")

    tampered = json.loads(json.dumps(receipt))
    tampered["vqe"]["energy_Ha"] += 0.001
    if "hash mismatch" not in validate_receipt(tampered):
        raise RuntimeError("tampered energy did not fail hash validation")
    return receipt


def main() -> int:
    args = parse_args(sys.argv[1:])
    if args.command == "self-test":
        receipt = self_test()
        print(f"bovine-tb-phase-a-vqe self-test PASS {receipt['hash']}")
        return 0

    if args.command == "verify":
        if not args.receipt:
            raise RuntimeError("verify requires --receipt <path>")
        receipt_path = pathlib.Path(args.receipt)
        receipt = read_json(receipt_path if receipt_path.is_absolute() else REPO_ROOT / receipt_path)
        errors = validate_receipt(receipt)
        if errors:
            raise RuntimeError(f"receipt invalid: {'; '.join(errors)}")
        print(f"bovine-tb-phase-a-vqe verify PASS {receipt['hash']}")
        return 0

    receipt = build_receipt(args)
    errors = validate_receipt(receipt)
    if errors:
        raise RuntimeError(f"receipt invalid: {'; '.join(errors)}")
    out = pathlib.Path(args.out)
    out_path = write_json(out if out.is_absolute() else REPO_ROOT / out, receipt)
    summary = {
        "ok": True,
        "receiptPath": str(out_path),
        "hash": receipt["hash"],
        "schema": receipt["schema"],
        "referenceBackend": receipt["reference"]["backend"],
        "abInitioReference": receipt["reference"].get("abInitioReference"),
        "target": receipt["target"],
        "ligand": receipt["ligand"],
        "fragment": receipt["fragment"]["id"],
        "numQubits": receipt["activeSpace"]["numQubits"],
        "referenceEnergyHa": receipt["reference"]["exactEnergyHa"],
        "vqeEnergyHa": receipt["vqe"]["energy_Ha"],
        "errorVsExactMha": receipt["vqe"]["errorVsExactMha"],
        "variationalPrincipleOk": receipt["gate"]["variationalPrincipleOk"],
        "withinChemicalAccuracy": receipt["vqe"]["withinChemicalAccuracy"],
    }
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(f"pass {out_path} {receipt['hash']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"bovine-tb-phase-a-vqe FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
