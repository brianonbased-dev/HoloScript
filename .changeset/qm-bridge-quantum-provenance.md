---
'@holoscript/qm-bridge': minor
---

Add QuantumProvenance: the cael-quantum-v1 quantum-provenance discriminator (spec `quantum-provenance/v1`). Four classes — `qpu_measured` | `simulator` | `quantum_inspired_classical` | `analytic_reference` — with class-conditional requirements enforced by `validateQuantumProvenance`/`assertQuantumProvenance`: a QPU claim without backend identity and provider job id never validates; failed hardware runs are representable (null shots with a note, error-reference waiver with a reason); class↔`qpu_used` contradictions are caught both ways. This is the typed twin of the ai-ecosystem checker (`scripts/quantum_provenance_check.py`) that audits the whole receipt family; the point of the field is separating real QPU results from quantum-branded classical work, machine-checkably.
