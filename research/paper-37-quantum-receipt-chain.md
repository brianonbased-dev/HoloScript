# Paper 37 - Quantum Receipt Chain

## 1. Claim Boundary

This paper does not claim quantum advantage. It records a receipt-backed
characterization of a near-term quantum workflow: an H2 VQE run whose
hardware result is traceable to IBM job IDs, payload hashes, and a committed
receipt, plus a separate CUDA-backed simulation receipt that is explicitly
labeled classical GPU simulation.

The IBM receipt names the experiment as an H2 VQE over a 2-qubit Z2-reduced
Hamiltonian in an STO-3G setting and stores the reference energy as
`-1.8573 Ha` (`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:4-5`).
The companion simulation receipt declares its boundary directly: "CUDA-backed
quantum simulation on classical GPUs, not quantum-native hardware execution"
(`quantum_receipts/h2-vqe-uccsd-cuquantum-2026-05-22.json:7`).

The contribution is therefore narrower and more useful than a performance
claim: a reproducible evidence chain for saying what happened, which backend
ran, which values were certified, which limit stopped the run, and why the
result belongs under NISQ-ceiling characterization rather than advantage
language.

## 2. Receipt Chain Model

The chain has layered evidence.

First, the hardware receipt records the experiment, simulator baseline,
hardware backend, optimizer trace, best hardware result, queue outcome, and
final honest conclusion in one JSON object
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:2-99`). Each trace
entry carries a `job_id`, `energy_ha`, and `payload_hash`; for example the
first hardware step stores job `d87fc5dg7okc73em97f0`, energy `-1.142571 Ha`,
standard deviation `0.0234`, and its hash
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:23-29`).
The final hardware step stores job `d87fdidg7okc73em99h0`, energy
`-1.537648 Ha`, standard deviation `0.012093`, and the terminal payload hash
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:79-85`).

Second, the verifier recomputes the certified hash from the recorded energy
and job ID (`scripts/quantum_receipt_verify.py:102-106`). It knows how to
normalize nested optimization traces from the IBM receipt
(`scripts/quantum_receipt_verify.py:64-97`), scans the committed receipt
locations (`scripts/quantum_receipt_verify.py:122-126`), and reports a failure
when a stored `payload_hash` no longer matches the recomputed value
(`scripts/quantum_receipt_verify.py:179-185`).

Third, online verification asks IBM Runtime for each job ID, checks that the
backend matches, and compares the runtime expectation value with the recorded
energy (`scripts/quantum_receipt_verify.py:13-17`,
`scripts/quantum_receipt_verify.py:146-199`). This matters because the local
hash proves tamper evidence over the file; the online check connects the file
back to IBM's job records.

## 3. Experimental Record

The simulator baseline in the receipt is a noiseless Aer result. It reports
energy `-1.857275 Ha`, gap `0.025 mHa`, optimizer `COBYLA`, and
`76` iterations (`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:6-10`).
The receipt itself describes that baseline as algorithm-correctness evidence,
not hardware advantage evidence
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:17`).

The hardware execution used backend `ibm_kingston`, method `COBYLA cold-start
(theta=0)`, and `resilience_level=0`
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:19-22`). The
optimization trace stores `9` completed steps
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:89`) and each step is
individually hash-certified by its own `payload_hash`
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:23-85`).

The best hardware energy recorded was `-1.537648 Ha`, with best gap
`319.5 mHa` (`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:87-88`).
The run stopped because of fair-share queue preemption at step `10`; the
receipt also records `2` warm-start attempts and queue waits longer than
`10 min` (`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:90-92`).

The separate simulation receipt records backend `cuquantum-gpu`, actual device
`GPU`, GPU `NVIDIA GeForce RTX 3060 Laptop GPU`, `5` qubits, `2048` shots,
and `0.44218` billable GPU wall seconds
(`quantum_receipts/h2-vqe-uccsd-cuquantum-2026-05-22.json:5-18`). Its versions
are also receipt-local: Qiskit `1.4.4`, Qiskit Aer `0.14.2`,
`cuquantum_python_cu13` `26.3.2`, and `cupy_cuda13x` `14.0.1`
(`quantum_receipts/h2-vqe-uccsd-cuquantum-2026-05-22.json:20-24`). The result
counts are `11111: 1026` and `00000: 1022`
(`quantum_receipts/h2-vqe-uccsd-cuquantum-2026-05-22.json:26-30`).

## 4. NISQ Ceiling Result

The receipt's own assessment is the cleanest result statement: the hardware
run moved from a `714.7 mHa` gap at step `1` to a `319.5 mHa` gap at step `9`,
but chemical accuracy of `1.6 mHa` was not achievable in this NISQ setting
without error correction
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:93`). The receipt's
honest conclusion says the infrastructure deliverable is provenance, while
hardware measurements confirm NISQ limits and IBM job provenance; it also
separately records the Aer correctness gap as `0.025 mHa`
(`quantum_receipts/h2-vqe-ibm-kingston-2026-05-21.json:94`).

That split is the paper's main scientific posture. The simulator lane can show
that the circuit/optimizer stack is coherent. The IBM lane can show that real
jobs existed on the claimed backend and produced the recorded expectation
values. Neither lane, alone or together, makes a speed, cost, accuracy, or
scale claim beyond classical alternatives. The defensible claim is that the
system can preserve receipt provenance through a NISQ-limited quantum run.

## 5. Reproducibility And Tamper Evidence

Reproduction starts with the committed receipts and the verifier:

```powershell
python scripts\quantum_receipt_verify.py
```

Offline verification recomputes every IBM trace hash from the recorded energy
and job ID. In this run it passed for the IBM trace and skipped the CUDA
simulation receipt because that receipt is not an IBM-backend artifact.

Online verification uses the same verifier with IBM Runtime enabled:

```powershell
$envPath = 'C:\Users\josep\.ai-ecosystem\.env'
$line = Get-Content -Path $envPath | Where-Object { $_ -match '^IBM_QUANTUM_API_KEY=' } | Select-Object -First 1
$env:IBM_QUANTUM_API_KEY = (($line -replace '^IBM_QUANTUM_API_KEY=', '').Trim().Trim('"').Trim("'"))
python scripts\quantum_receipt_verify.py --online
```

The online run passed: every IBM job ID was retrievable, every job reported
backend `ibm_kingston`, and each returned expectation value matched its
recorded receipt value within the verifier tolerance. This is not a secret
claim; the token is loaded only into the local process environment, and the
verifier's public behavior is defined in source
(`scripts/quantum_receipt_verify.py:131-199`).

Tamper evidence was checked without modifying the committed receipt. An
in-memory probe imported the verifier, changed the first recorded energy, and
confirmed that the stored hash no longer matched the recomputed hash. The
relevant invariant is the same one used by the verifier:
`payload_hash = sha256({"energy": value, "job_id": job_id})`
(`scripts/quantum_receipt_verify.py:102-106`,
`scripts/quantum_receipt_verify.py:179-185`).

The current limitation is equally important: these receipts are per-artifact
self-certifying records plus Git history, not yet a cross-receipt append-only
ledger. Paper 37 should keep that boundary visible. The chain proves that the
recorded IBM trace is locally tamper-evident and online-replayable against IBM
Runtime; it does not prove quantum advantage.
