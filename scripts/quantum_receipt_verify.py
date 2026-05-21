#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quantum_receipt_verify.py -- independent verifier for HoloScript quantum receipts.

Receipts emitted by scripts/quantum_execute.py for real IBM backend runs must be
independently re-verifiable by anyone, not just the agent that produced them.

  offline (default): recompute payload_hash = sha256({"energy": <value>, "job_id": <id>})
                     and confirm it matches the value stored in the receipt
                     (tamper-evidence on the local file).

  online (--online): query IBM Runtime for each job_id; confirm the job exists and
                     ran on the claimed backend. For VQE energy receipts, also
                     confirm the job result expectation value matches the recorded
                     energy to <tol>. (QAOA optimal_value is derived classically
                     from sampled counts, so only job existence + backend are
                     checked online for QAOA.) Requires IBM_QUANTUM_API_KEY.

The hashed/certified value is the first present of:
    ibm_zne_opt_energy_Ha | zne_energy_Ha | ibm_energy_Ha   (VQE — also EV-checked online)
    optimal_value                                            (QAOA — existence-checked only)

Usage:
    python3 scripts/quantum_receipt_verify.py
    python3 scripts/quantum_receipt_verify.py --online
    IBM_QUANTUM_API_KEY=<token> python3 scripts/quantum_receipt_verify.py --online
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ENERGY_KEYS = ("ibm_zne_opt_energy_Ha", "zne_energy_Ha", "ibm_energy_Ha")
ENV_NAME = "IBM_QUANTUM_API_KEY"
ENV_FILE = REPO_ROOT / ".env"


def is_ibm_receipt(r: dict) -> bool:
    return r.get("execution_mode") == "ibm-quantum" or str(r.get("backend", "")).startswith("ibm_")


def certified_value(r: dict):
    """Return (key, value, is_energy). is_energy gates the online EV equality check."""
    for k in ENERGY_KEYS:
        if k in r:
            return k, r[k], True
    if "optimal_value" in r:
        return "optimal_value", r["optimal_value"], False
    return None, None, False


def expected_hash(value: float, job_id: str) -> str:
    return hashlib.sha256(
        json.dumps({"energy": value, "job_id": job_id}, sort_keys=True).encode()
    ).hexdigest()


def load_ibm_key() -> str | None:
    key = os.environ.get(ENV_NAME)
    if key:
        return key
    try:
        if ENV_FILE.exists():
            for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
                if line.startswith(ENV_NAME):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def find_receipts() -> list[pathlib.Path]:
    paths = set()
    for pat in ("quantum_receipts/*_receipt.json", "quantum*_receipt.json"):
        paths.update(REPO_ROOT.glob(pat))
    return sorted(paths)


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify HoloScript quantum receipts.")
    ap.add_argument("--online", action="store_true", help="cross-check job IDs against IBM Runtime")
    ap.add_argument("--tol", type=float, default=1e-6, help="energy match tolerance (Ha)")
    args = ap.parse_args()

    receipts = find_receipts()
    if not receipts:
        print("no receipts found")
        return 0

    svc = None
    if args.online:
        key = load_ibm_key()
        if not key:
            print(f"FAIL --online requested but {ENV_NAME} not found")
            return 2
        from qiskit_ibm_runtime import QiskitRuntimeService
        svc = QiskitRuntimeService(channel="ibm_quantum_platform", token=key)

    import numpy as np

    failures = 0
    for path in receipts:
        r = json.loads(path.read_text(encoding="utf-8"))
        name = path.name
        if not is_ibm_receipt(r):
            print(f"SKIP  {name}  (not an IBM-backend receipt)")
            continue

        key, value, is_energy = certified_value(r)
        job_id = r.get("job_id")
        backend = r.get("backend")
        stored = r.get("payload_hash")
        if value is None or not job_id:
            print(f"FAIL  {name}  missing certified value or job_id")
            failures += 1
            continue

        want = expected_hash(value, job_id)
        if stored is None:
            print(f"FAIL  {name}  no payload_hash (not self-certifying)")
            failures += 1
        elif stored != want:
            print(f"FAIL  {name}  payload_hash mismatch over {key}={value}+job_id")
            failures += 1
        else:
            print(f"OK    {name}  hash verifies ({key}={value}, job={job_id})")

        if svc is not None:
            try:
                j = svc.job(job_id)
                jbackend = j.backend().name
                ok_be = (jbackend == backend)
                if is_energy:
                    ev = float(np.asarray(j.result()[0].data.evs))
                    ok_ev = abs(ev - value) <= args.tol
                    ok = ok_be and ok_ev
                    print(f"  {'OK   ' if ok else 'FAIL '}IBM {job_id}: backend={jbackend} "
                          f"(match={ok_be}) evs={ev:+.12f} vs {value:+.12f} (match={ok_ev})")
                else:
                    ok = ok_be and str(j.status()) in ("DONE", "JobStatus.DONE")
                    print(f"  {'OK   ' if ok else 'FAIL '}IBM {job_id}: backend={jbackend} "
                          f"(match={ok_be}) status={j.status()} [QAOA: existence-checked only]")
                if not ok:
                    failures += 1
            except Exception as e:
                print(f"  FAIL IBM {job_id} not retrievable: {type(e).__name__}: {str(e)[:140]}")
                failures += 1

    print()
    print(f"{'PASS' if failures == 0 else 'FAIL'}: {len(receipts)} receipt(s) scanned, {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
