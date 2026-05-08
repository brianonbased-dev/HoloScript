# Lotus Reference Photos - CAEL Anchor Ingestion

This directory holds the three raw reference photos for the `BotanicalLotusTrait`
provenance contract.

## Expected images

| # | Role | Description | Anchor ID |
|---|------|-------------|-----------|
| 1 | `material` | Open pink lotus close-up | `lotus-reference-2026-05-06-01` |
| 2 | `silhouette` | Upright pink lotus silhouette | `lotus-reference-2026-05-06-02` |
| 3 | `leaf_context` | Pink lotus with leaves and water context | `lotus-reference-2026-05-06-03` |

## Supplemental local evidence

`lotus-reference-2026-05-06-04-supplemental.png` is an alternate founder-supplied
lotus side view retained for local review only. It is not part of the current
three-anchor CAEL manifest.

- SHA-256: `sha256:4eae593372914110f2a8290be5c55d2291789d2e3b657f2b3ebaa54e76022e98`

## How to ingest and sign

Phase 1 - copy, hash, and prepare unsigned Base anchor transactions:

```bash
cd examples/lotus-flower
node sign-lotus-references.mjs /path/to/photo1.jpg /path/to/photo2.jpg /path/to/photo3.jpg
```

This writes the images to `reference/` with canonical names, computes SHA-256
hashes, generates `.base-unsigned.json` sidecars for each file, and updates:

- `reference.anchors.json` - status: `content_hashed`
- `reference.material-extract.json` - `content_hash_status: complete`

Phase 2 - founder broadcasts the unsigned txs via Trezor/Rabby, then records the
tx hashes:

```bash
node sign-lotus-references.mjs --record 0x<tx1> 0x<tx2> 0x<tx3>
```

This updates both manifests to `wallet_signed` status and stores the Base tx
hash as the `wallet_signature` on each anchor.

## Check status

```bash
node sign-lotus-references.mjs --status
```

## Low-level manifest builder

If you only need hashing (no Base L2 signing), use the standalone helper:

```bash
node build-reference-manifest.mjs --out reference.anchors.json photo1.jpg photo2.jpg photo3.jpg
```

Add `--sign` to also emit `.base-unsigned.json` sidecars per file.
