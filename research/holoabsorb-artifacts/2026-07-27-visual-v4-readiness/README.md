# HoloAbsorb Paper 5 visual v4 readiness

Status: **implementation PASS; confirmatory execution BLOCKED**.

The frozen v4 design previously had no executable literal-pixel path: the
existing v1-v3 runner rejected its schema and could send text content only.
HoloAbsorb now has:

- a fail-closed external-dataset and annotation custody audit;
- a deterministic dependency-graph PNG renderer;
- SHA-256-bound actual-image content parts;
- four-arm packet preparation for `text`, `relations`, `pixels`, and
  `relations-pixels`;
- one identical rendered image bound to both pixel arms;
- independent vision-family, model-version receipt, and trial-count gates; and
- package commands `audit:paper5-visual-v4` and
  `prepare:paper5-visual-v4`.

Machine-readable receipt:
[`readiness.json`](./readiness.json)

- Evaluated commit: `c42705ef321d0a0cff9ba28ff0c2ecadb8802d52`
- Tracked worktree at audit start: clean
- Receipt SHA-256:
  `92e933e5ab3a4a0253c9470975a4f6d5013516d2e71fd212c8ccb1f907dd9207`
- Frozen protocol SHA-256:
  `ed76e7dba0143d5bab497f7cbf3f912c5577d25087d021ac90be1984b99d5953`

## Literal-pixel implementation proof

Both implementation checks passed. The deterministic renderer emitted a valid
1600×900 RGB PNG:

- bytes: 9,373;
- image SHA-256:
  `7f67c5e02af55e6ae698f1344deebfa37ce3869b2cc97200243558bc24e448a5`;
- eight candidate-alias node labels; and
- one typed directional import edge in the readiness fixture.

The image was also decoded independently with `sharp` as PNG, sRGB, three
channels, 8 bits per sample. The multimodal content receipt proves that the
OpenAI-compatible `image_url` content part contains actual base64 PNG bytes
with the same digest. Base64 text or alt-text-only substitution is not
accepted.

The automated suite includes a sealed miniature external-dataset fixture that
prepares a four-arm packet, writes a PNG, verifies the PNG signature, and
proves that both pixel arms reference the identical image digest.

## Exact remaining blockers

The receipt is `BLOCKED`, not `READY`, because no production v4 dataset or
execution plan was supplied:

1. `dataset-not-supplied`
2. `independent-vision-family-count`
3. `vision-and-version-receipts`
4. `trials-per-arm`

Clearing those gates requires at least three eligible external codebases, 90
independently annotated queries, two annotators per query plus adjudication,
sealed calibration/confirmatory splits, Krippendorff alpha at least 0.7, three
independent vision-capable model families with version receipts, and three
trials per arm.

Those are external data, human-annotation, and model-custody requirements.
They cannot be manufactured by the renderer or inferred from the earlier
outcome-exposed HoloScript corpus.

## Accuracy boundary

The v3 diagnostic result still supports one narrow engineering statement:
explicit structured relations improved Precision@5 on the known development
corpus. This new v4 artifact proves literal-image plumbing only. It contains
no external labels, model responses, scored outcomes, or visual-superiority
result, so no literal-pixel accuracy claim is made.
