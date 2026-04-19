# DepthAnything v2 — import path for HoloMap (RFC path 3)

**Purpose:** Shortest permissive-licensed route to **production-shaped depth priors** for HoloMap demos. This is **not** a full training guide; it names the integration contract HoloMap expects.

## Target artifact

- **On-disk / CDN:** single binary blob (or small set) referenced by `HoloMapConfig.weightUrl` + `weightCid` (`sha256:…` per `holoMapWeightLoader.ts`).
- **Runtime:** loader **verifies** digest after fetch; mismatches fail closed.

## Recommended pipeline (high level)

1. **Obtain** DepthAnything v2 weights under a license compatible with your ship mode (verify project LICENSE / model card).
2. **Convert** to a HoloMap-loadable layout:
   - **Preferred for WebGPU v1:** ONNX export (or flat float32 shard) + a thin manifest JSON listing tensor names ↔ byte ranges (follow-on: `HoloMapWeightManifest` type).
   - **Trainer-side:** fine-tune on indoor acceptance clips; export **same** layout so `weightCid` changes are the only replay fingerprint delta.
3. **Host** the blob on HTTPS or IPFS gateway; set `weightUrl` + `weightCid` in Studio / MCP session config.
4. **Wire GPU upload** (next increment): map manifest slices into `GPUBuffer` bindings for the transformer path — today’s loader proves fetch + verify; buffer bind is Sprint 2 continuation.

## Out of scope here

- Exact ONNX op fuse list (depends on exported graph).
- Dataset hygiene for path **B** (from-scratch) — see RFC §5 path 2.

**Code:** `packages/core/src/reconstruction/holoMapWeightLoader.ts`, `HoloMapRuntime.init` (`weightUrl` / `weightCid`).
