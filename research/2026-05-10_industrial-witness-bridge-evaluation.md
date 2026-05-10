# Industrial Witness Bridge Evaluation — OPC UA and IoT Twins

**Date:** 2026-05-10
**Task:** `task_1778320522960_sss7`
**Scope:** Evaluate whether HoloScript should build an "Industrial Witness Bridge" that connects OPC UA and IoT digital twin data to the existing provenance/witness stack. Output: architecture recommendation + gap analysis + next-step tasks.

---

## Executive Summary

**Verdict: BUILD — but as a WIRE (bridge existing pieces), not as greenfield code.**

HoloScript already owns the three load-bearing layers an Industrial Witness Bridge requires:

1. **Provenance anchoring** — Base L2 + Bitcoin via OpenTimestamps (`scripts/build-provenance-manifest.mjs:1-287`, `docs/public/provenance-manifest.json` consumed by `ProvenanceExplorer.vue:1-100`).
2. **Witness wire formats** — The `solverType` family (`impossibility.v1` at `packages/engine/src/simulation/impossibilityEvidence.ts:36-323`, `network.event.v1` at `packages/engine/src/simulation/networkEventRecord.ts:1-170`) provides canonicalized, hashable, multi-rater evidence records.
3. **ZK-ready circuits** — `ZkPrivateTrait.ts` (`packages/core/src/traits/ZKPrivateTrait.ts:1-1161`) ships spatial predicates, ownership proofs, and selective disclosure — all usable for "prove threshold exceeded without revealing exact reading" industrial scenarios.

What is **missing** is the **runtime adapter** between OPC UA telemetry streams and the witness wire format, plus a new `industrial.witness.v1` solver type. The trait vocabulary (`opc_ua`, `modbus`, `mqtt`) exists in `packages/core/src/traits/constants/robotics-industrial.ts:365-372`, but the roadmap explicitly flags "runtime bridge validation still needed" (`docs/research/ECOSYSTEM_EXPANSION_ROADMAP.md:77`).

Industry is converging on exactly this intersection: IEEE CCNC 2026 ("Dynamic Certification of Industrial Digital Twins via Blockchain"), Frontiers in Blockchain 2025 (Hyperledger Fabric + TPM attestation for IIoT twins), and AIBB 2025 (digital machine passports within Asset Administration Shells). HoloScript is not early — we are **on time** if we wire what we already have.

---

## 1. What "Industrial Witness Bridge" Means

An Industrial Witness Bridge is a **protocol adapter + wire format** that:

- **Ingests** telemetry from industrial fieldbuses (OPC UA PubSub/Client-Server, Modbus TCP, MQTT Sparkplug B).
- **Transforms** raw sensor readings into **canonical witness records** with file:line-grade attribution (`evidenceRefs` per `impossibilityEvidence.ts:116`).
- **Anchors** those records to the same Base + Bitcoin stack the research vault already uses (`build-provenance-manifest.mjs:126-140`).
- **Enables ZK proofs** over the data (e.g., prove a temperature exceeded a threshold for insurance/liability without revealing the full time-series).
- **Feeds** the Courtroom Evidence Engine (`packages/studio/src/lib/courtroomEvidence.ts:1-193`) for 3D accident reconstruction and jury-facing presentation.

This is **not** a new compiler target. It is a **runtime bridge** between external industrial state and HoloScript's existing witness primitives.

---

## 2. Current Capabilities (Evidence)

### 2.1 Provenance Stack — Production-Grade

The research vault already anchors every memo to Base L2 with SHA-256 drift detection and OpenTimestamps Bitcoin receipts. The same pipeline (`scripts/build-provenance-manifest.mjs:66-80`) can ingest any file-shaped artifact — a witness record is just a JSON file.

**Re-use path:** Point `build-provenance-manifest.mjs` at the industrial-witness output directory; no code change needed.

### 2.2 Witness Wire Formats — Mature Family

The `solverType` family has five instances. Adding a sixth (`industrial.witness.v1`) follows established canonicalization rules:

- `stableStringify` for deterministic hashing (`equivalenceRecord.ts`, imported by `impossibilityEvidence.ts:37` and `networkEventRecord.ts:29`).
- `wireKey` derivation for replay-equivalence (`impossibilityEvidence.ts:230-232`, `networkEventRecord.ts:139-141`).
- Multi-rater tolerance (`impossibilityEvidence.ts:264-322`) — critical for industrial settings where operator, maintainer, and insurer may file conflicting evidence.

### 2.3 ZK Circuits — Ready for Sensor Predicates

`ZkPrivateTrait.ts` already provides:

- `is_inside_zone` — prove spatial containment without exact position (`ZkPrivateTrait.ts:284-321`).
- `price_range_proof` — prove value-in-range without exact value (`ZkPrivateTrait.ts:226-237`).

**Industrial analog:** A `threshold_exceeded` circuit (prove `temperature > 85` without revealing `87.3`) is a direct mapping of `price_range_proof` to sensor domains.

### 2.4 Digital Twin Traits — Vocabulary Shipped, Runtime Gap

`@digital_twin`, `@data_binding`, `@telemetry`, and `@opc_ua` traits exist:

- `DIGITAL_TWINS.md:51-58` shows `@data_binding` with OPC UA source URLs.
- `robotics-industrial.ts:365` lists `opc_ua` as a protocol trait.
- `ECOSYSTEM_EXPANSION_ROADMAP.md:77` flags the gap: "runtime bridge validation still needed."

---

## 3. Industry Landscape (2025–2026)

Recent research validates the market need and technical feasibility:

| Paper / Framework | Key Claim | HoloScript Parity |
|---|---|---|
| Pietri et al., IEEE CCNC 2026 | Blockchain dynamic certification for industrial DT lifecycle | We have Base anchoring + drift detection; they use generic blockchain |
| Lutz & Reich, AIBB 2025 | Digital machine passport in AAS with tamper-proof audit trail | Our provenance manifest is the passport; AAS mapping is the gap |
| Ali et al., Frontiers 2025 | Hyperledger + TPM attestation for IIoT DT access control | ZKPrivateTrait circuits + selective disclosure match the access-control need |
| Rinieri et al., arXiv 2511.10248 | IOTA + programmable data plane for OPC UA certificate validation | Our bridge would sit at the application layer, not the certificate layer |
| Siemens/NVIDIA industrial metaverse | OpenUSD as universal exchange | HoloScript's `@usd` trait (`ECOSYSTEM_EXPANSION_ROADMAP.md:222`) aligns |

**Signal strength:** 4+ peer-reviewed venues in 6 months covering blockchain + OPC UA + digital twins. This is not a speculative idea — it is an **emerging standard** that HoloScript can define the reference implementation for.

---

## 4. Proposed Architecture

```text
Physical Device (OPC UA / Modbus / MQTT)
      |
      v
┌─────────────────────────────────────────┐
│  Industrial Witness Adapter (new)         │
│  - OPC UA client (node-opcua or native) │
│  - Modbus TCP bridge                      │
│  - MQTT Sparkplug B decoder             │
│  - Telemetry → canonical witness record │
└─────────────────────────────────────────┘
      |
      v
┌─────────────────────────────────────────┐
│  industrial.witness.v1 (new solverType)   │
│  - sensorId, timestamp, reading, unit   │
│  - threshold, alertState, evidenceRefs    │
│  - wireKey via stableStringify          │
└─────────────────────────────────────────┘
      |
      v
┌─────────────────────────────────────────┐
│  Provenance Pipeline (existing)         │
│  - Base L2 anchor receipt               │
│  - OpenTimestamps Bitcoin receipt       │
│  - Drift detection via sha256OfFile     │
└─────────────────────────────────────────┘
      |
      v
┌─────────────────────────────────────────┐
│  ZK Proof Layer (existing circuits)     │
│  - threshold_exceeded circuit (new)     │
│  - selective disclosure policy          │
└─────────────────────────────────────────┘
      |
      v
┌─────────────────────────────────────────┐
│  Courtroom Evidence / 3D Replay         │
│  - timeline events from sensor data     │
│  - heatmap_3d from temperature fields   │
│  - jury perspective camera              │
└─────────────────────────────────────────┘
```

### 4.1 New Components

| Component | Location | Size Estimate | Risk |
|---|---|---|---|
| `IndustrialWitnessAdapter` | `packages/engine/src/simulation/industrialWitnessAdapter.ts` | ~300 LOC | Medium — depends on `node-opcua` availability |
| `industrial.witness.v1` wire format | `packages/engine/src/simulation/industrialWitnessRecord.ts` | ~150 LOC | Low — follows `network.event.v1` pattern |
| `threshold_exceeded` ZK circuit | `packages/core/src/traits/ZKPrivateTrait.ts` | ~30 LOC | Low — direct `price_range_proof` analog |
| Smart-factory scenario update | `packages/studio/src/__tests__/scenarios/industrial-plant-designer.scenario.ts` | ~100 LOC | Low — extends existing scenario |

### 4.2 Re-used Components (No New Code)

| Component | Evidence |
|---|---|
| `stableStringify` / wire key | `equivalenceRecord.ts` |
| Base L2 anchoring | `scripts/build-provenance-manifest.mjs` |
| Provenance explorer UI | `docs/.vitepress/theme/ProvenanceExplorer.vue` |
| Courtroom evidence engine | `packages/studio/src/lib/courtroomEvidence.ts` |
| Selective disclosure | `ZkPrivateTrait.ts:458-489` |
| Digital twin trait | `packages/core/src/traits/DigitalTwinTrait.ts` |

---

## 5. Gap Analysis

| Gap | Severity | Blocker For | Resolution |
|---|---|---|---|
| OPC UA runtime handler missing | **High** | Ingestion from real PLCs | Validate `node-opcua` or native adapter; fallback to MQTT Sparkplug B |
| No `industrial.witness.v1` solverType | **Medium** | Canonical witness records | Follow `network.event.v1` pattern; ~1 session |
| No `threshold_exceeded` ZK circuit | **Low** | Privacy-preserving compliance | Copy `price_range_proof` structure; ~1 session |
| No AAS (Asset Administration Shell) mapping | **Medium** | Siemens/Industry 4.0 interoperability | Research task; map AAS submodel to `@dtdl_interface` |
| No TPM attestation integration | **Low** | Hardware-rooted trust | Defer; Ali et al. 2025 shows this is research-grade, not production-ready |

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `node-opcua` dependency breaks WASM edge target | Medium | High | Use MQTT Sparkplug B as primary protocol for edge; OPC UA for cloud/factory-floor |
| Sensor data volume overwhelms Base L2 anchor cadence | Medium | Medium | Batch witness records (batch interval + batch size, mirroring `DIGITAL_TWINS.md:317-322`); anchor batches, not individual readings |
| ZK proof latency too high for real-time safety systems | Low | High | ZK is for **audit/post-hoc liability**, not real-time control. Keep control loops in OPC UA; witness bridge is asynchronous. |
| Legal admissibility of blockchain-anchored sensor data untested | Medium | Medium | Partner with legal-tech pilot; document chain-of-custody rigorously. Courtroom evidence engine (`courtroomEvidence.ts`) is the right UX layer. |

---

## 7. Recommendation

### 7.1 Immediate (This Sprint)

1. **Add `industrial.witness.v1` wire format** — `packages/engine/src/simulation/industrialWitnessRecord.ts`. Mirror `network.event.v1` exactly. File as board task.
2. **Validate OPC UA ingestion path** — spike `node-opcua` client reading a simulated server; confirm witness record generation. If `node-opcua` is too heavy, pivot to MQTT Sparkplug B (already supported by Azure IoT Hub and AWS IoT Core).
3. **Add `threshold_exceeded` ZK circuit** — extend `ZkPrivateTrait.ts` circuits array. Trivial mapping from `price_range_proof`.

### 7.2 Next (Next Sprint)

4. **Wire the smart-factory scenario** — extend `industrial-plant-designer.scenario.ts` to emit `industrial.witness.v1` records and anchor them via the provenance pipeline.
5. **Update `ECOSYSTEM_EXPANSION_ROADMAP.md`** — change `@opc_ua` status from "runtime bridge validation still needed" to validated or partially validated.

### 7.3 Defer

- TPM attestation integration — wait for hardware partner.
- AAS submodel mapping — wait for DTDL v3 spec to stabilize (Microsoft/Siemens alignment still active).
- Real-time ZK proofs for safety — out of scope; witness bridge is audit-layer, not control-layer.

---

## 8. Conclusion

The Industrial Witness Bridge is **not a new product** — it is the **wiring of three existing HoloScript capabilities** (provenance anchoring, witness wire formats, ZK circuits) to an external protocol (OPC UA) that the industry is already converging on. The risk is low because every load-bearing primitive is shipped. The reward is high because it positions HoloScript as the reference implementation for blockchain-witnessed industrial digital twins, a niche that is empty in the 2025–2026 literature (existing papers use generic Hyperledger/Ethereum; none combine OPC UA + ZK + 3D courtroom evidence).

**Decision: Approve for BUILD as a WIRE task, not a greenfield project.**

---

## References

- HoloScript provenance pipeline: `scripts/build-provenance-manifest.mjs:1-287`
- Impossibility evidence wire format: `packages/engine/src/simulation/impossibilityEvidence.ts:36-323`
- Network event wire format: `packages/engine/src/simulation/networkEventRecord.ts:1-170`
- ZK circuits: `packages/core/src/traits/ZKPrivateTrait.ts:1-1161`
- Courtroom evidence engine: `packages/studio/src/lib/courtroomEvidence.ts:1-193`
- Robotics/industrial trait vocabulary: `packages/core/src/traits/constants/robotics-industrial.ts:1-462`
- Digital twin guide: `docs/ecosystem/DIGITAL_TWINS.md:1-344`
- Ecosystem expansion roadmap: `docs/research/ECOSYSTEM_EXPANSION_ROADMAP.md:1-282`
- IoT smart-factory example: `examples/specialized/iot/README.md:1-312`
- Industrial plant scenario: `packages/studio/src/__tests__/scenarios/industrial-plant-designer.scenario.ts`
- Industry papers (web search 2026-05-10):
  - [Pietri et al., IEEE CCNC 2026](https://iris.unimore.it/handle/11380/1395689)
  - [Lutz & Reich, AIBB 2025](https://link.springer.com/chapter/10.1007/978-3-032-04728-1_4)
  - [Ali et al., Frontiers in Blockchain 2025](https://www.frontiersin.org/articles/10.3389/fbloc.2025.1693926)
  - [Rinieri et al., arXiv 2511.10248](https://arxiv.org/abs/2511.10248)
