# Evidence Envelope Manifests

Evidence envelopes are the paper-program calibration/setup/reproducibility
artifact. They bind the environment hash, hardware tier, seed, harness command,
artifact paths, and one-command rerun into a single hashable JSON file.

## Generate Paper 12

From the HoloScript repo root:

```bash
pnpm --filter @holoscript/hololand-platform run evidence-envelope -- \
  --preset paper-12-hololand \
  --out docs/public/evidence/paper-12-hololand-envelope.json
```

The public manifest is:

```text
docs/public/evidence/paper-12-hololand-envelope.json
```

The schema is:

```text
docs/public/evidence/evidence-envelope.schema.json
```

## Paper Citation Pattern

Papers should cite the manifest in a `Calibration/Setup/Reproducibility`
heading, then name the one-command rerun. The audit-matrix detector looks for
that heading plus an automation pointer such as `pnpm --filter`.

Example Paper 12 text:

```tex
\subsection{Calibration, Setup, and Reproducibility}
We publish a HoloScript evidence envelope at
\texttt{docs/public/evidence/paper-12-hololand-envelope.json}. The envelope
records the runtime environment hash, hardware tier, seed, harness command,
artifact paths, and one-command rerun for the HoloLand evaluation. Reviewers
can regenerate it from the repository root with
\texttt{pnpm --filter @holoscript/hololand-platform run evidence-envelope -- --preset paper-12-hololand --out docs/public/evidence/paper-12-hololand-envelope.json}.
```

## Minimum Fields

Every envelope must include:

- `environment.hash`: SHA-256 over runtime inventory and source revisions.
- `hardwareTier`: label for the hardware class used by the harness.
- `reproducibility.seed`: deterministic seed for the evaluation.
- `reproducibility.harnessCommand`: command that produced the evidence.
- `reproducibility.rerunCommand`: one-command manifest regeneration.
- `reproducibility.artifactPaths`: reviewer-visible source, schema, trace, or receipt paths.
- `artifacts[].sha256`: file hashes when the artifacts are present locally.

## HoloLand Consumption

Paper 12 consumes the HoloLand device-lab harness and the HoloLand CAEL trace
corpus. The envelope records both as artifacts so the paper cites a durable
manifest instead of prose-only setup notes.
