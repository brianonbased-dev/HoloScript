# Spatial sovereignty (positioning brief)

**Audience:** Founders, buyers, and technical reviewers comparing HoloScript + HoloMap to cloud-reconstruction APIs or CUDA-only research stacks.

**One-liner:** HoloMap adds **perception sovereignty** — the same way HoloScript argues for source, runtime, agent, and verification sovereignty, HoloMap keeps **3D perception** on a path you own: **browser WebGPU**, **deterministic replay**, and **no mandatory cloud round-trip** for the core feed-forward recon pass.

## What it is not

- A claim that every pixel beats a datacenter-scale foundation model on day one.
- A promise that zero external services exist (anchors, CDNs, and optional compatibility ingest remain).

## What it is

- **No PyTorch/CUDA in the user loop** for the native path — the demo story is “open tab, run.”
- **No competitor API key** as the gate to turn RGB into a structured scene you can compile to your targets.
- **Replay fingerprint + manifest contract** so “same inputs → same bytes” is a product property, not a blog post.

## Proof hooks (ship with narrative)

- `RFC-HoloMap.md` — determinism + provenance fields.
- `WGSL_GAPS.md` + `holoMapMicroEncoder.ts` — native operator chain in-repo.
- `docs/holomap/CHARTER.md` — v1 guarantees.

**Use:** Pull quotes into website, README callouts, and paper introductions — keep numbers out unless tied to `docs/NUMBERS.md` or a dated harness artifact.
