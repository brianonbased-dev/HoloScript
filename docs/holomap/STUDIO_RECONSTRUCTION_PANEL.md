# Studio — ReconstructionPanel copy (OA3)

Use when surfacing HoloMap native runs next to compatibility ingest.

**Badge line (recommended):**

`HoloMap native · replay hash 0x{shortFingerprint} · anchor: OTS ✓ · Base L2 ✓`

**Tooltip:** Link `opentimestampsProof` and `baseCalldataTx` from `ReconstructionManifest.provenance`. If fields absent, show `Self-attested (no external anchor)` per RFC §4.5.

**Fixture:** `packages/core/src/reconstruction/__fixtures__/ANCHORED_MANIFEST_EXAMPLE.json`  
**Merge helper:** `mergeAnchoredProvenance` in `holoMapAnchoredManifest.ts`
