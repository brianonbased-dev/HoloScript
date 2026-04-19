# Modality weights decision (Q4)

**Question:** Do `npu_depth` (mobile capture) and HoloMap (desktop WebGPU) share the same checkpoint, or stay separate?

**Decision (2026-04-19):** **Separate weight families** for v1 — aligns with `RFC-HoloMap.md` §7 Q4 initial stance.

| Surface | Weight stack | Rationale |
|---------|--------------|-----------|
| Mobile `npu_depth` | Platform / NPU-optimized depth priors (existing trait routing) | Latency, thermal, and vendor NPU ops differ from desktop WebGPU kernels. |
| Desktop HoloMap | `weightCid` blobs tuned for WebGPU transformer path (`RFC-HoloMap.md` §5.1) | Different graph, different numerical backend; merging would couple release trains. |

**UX implication:** `ModalitySelector` (or product equivalent) should **not** promise “same room model everywhere” until a future **distilled mobile student** is chartered.

**Revisit when:** HoloLand demands a **single** user-visible reconstruction identity across Quest + browser, *and* benchmarks show acceptable drift — then open an ADR for a shared **teacher** + two **students**.
