# HoloMap — Operator glossary (non-developer)

| Plain language | Technical | When to use |
|----------------|-----------|-------------|
| **Compatibility scene (Marble)** | `ingest-path=marble` | Default for deadlines; matches legacy Marble / manifest-style ingest. Safe for comparing to prior paper numbers. |
| **Native scene (HoloMap)** | `ingest-path=holomap` | Native WebGPU reconstruction path; emits manifest under SimulationContract binding. |
| **Compare both** | `ingest-path=both` | Runs compatibility + native probes and prints a **comparison table** for reviewers (extra time). |
| **Reconstruction profile** | JSON preset in `packages/holomap/profiles/` | Pick a named profile instead of remembering flags. |
| **Replay fingerprint** | Hash of model + seed + weight strategy + optional video hash | Proves deterministic identity of a reconstruction run for a given build. |

**WorldModelBootstrap:** The **compatibility** ingest entry point. Do not treat it as deprecated; it remains the incumbent bridge for external manifests.
