# GPU utility and delivery for users and enterprises

**Date:** 2026-08-01  
**Status:** Current-source research plus implementation program  
**Scope:** Why GPU acceleration matters, when it does not, which product forms users need, and how HoloScript should deliver local, owned-fleet, and managed capacity without turning provider telemetry into proof of reservation.

## Executive decision

HoloScript should sell **qualified outcomes**, not an undifferentiated bucket of GPU-hours. A request starts as a compiler-authored `@compute` WorkUnit with quality, deadline, placement, data-classification, fallback, and budget constraints. The control plane may place it on:

1. a user's local device;
2. sovereign owned fleet capacity; or
3. an explicitly admitted managed bridge.

Every remote execution needs fresh capacity evidence, authenticated placement, an atomic lease with fencing, a durable job transition, an execution receipt, measured quality, and cost reconciliation. HoloMesh already supplies the authenticated fleet-observation and coordination substrate. It must remain that substrate; the missing component is a compute-specific durable allocator, not a second fleet.

The default user promise is therefore:

> Run this bounded computation on the best permitted accelerator, meet its declared quality and deadline, stay inside its budget and data policy, and return evidence of what actually happened.

This is materially more useful than exposing a provider instance picker. It also lets local hardware compete fairly with owned fleet and paid capacity.

## Why a GPU is useful

GPUs devote substantially more of the chip to data processing and execute many threads in parallel. For highly parallel workloads, this can provide higher instruction throughput and memory bandwidth than a CPU in a similar price and power envelope. The CPU remains responsible for sequential control, orchestration, I/O, and portions that do not parallelize well. The best system is normally heterogeneous, not GPU-only. [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html)

| Utility | Workload shapes | User outcome | Qualification evidence |
|---|---|---|---|
| AI training and fine-tuning | Dense tensor operations, attention, gradient computation, distributed collectives | Train larger models or finish experiments sooner | samples/tokens per second, convergence/quality, GPU memory, interconnect, total cost |
| AI inference | Batched matrix operations, attention, embeddings, vision and speech models | Lower latency, higher throughput, larger models, private local inference | latency percentiles, tokens/requests per second, quality, cold-start and cost |
| Rendering and spatial computing | Rasterization, ray tracing, shading, splats, image generation, compositing | Interactive 3D, XR, digital twins, photoreal output, faster offline renders | frame time, resolution, visual/physics fidelity, dropped frames, encode latency |
| Simulation and engineering | CFD, thermal, structural, particle, molecular and Monte Carlo workloads | Higher-fidelity simulation or more design iterations within the same deadline | error against reference, cells/steps per second, stability, energy and cost |
| Scientific and HPC | Linear algebra, FFTs, stencils, genomics, climate, astronomy, numerical optimization | Shorter time to insight and larger tractable problems | validated numerical tolerance, throughput, scale efficiency, reproducibility |
| Data processing and analytics | Vectorized transforms, joins, scans, graph and geospatial operations | Faster large-data analysis and feature generation | end-to-end wall time including transfers, correctness, bytes/records per second |
| Video, imaging and media | Encode/decode, optical flow, denoise, upscaling, segmentation, reconstruction | More concurrent streams, lower turnaround, real-time media workflows | codec/quality settings, FPS, latency, visual metrics, stream count |
| Robotics and edge perception | Vision, sensor fusion, localization, policy inference, motion planning | Real-time perception and decisions near the device | end-to-end control latency, missed deadlines, accuracy, thermal/power envelope |
| Remote workstations and VDI | CAD, DCC, medical visualization, engineering applications | Secure access to GPU applications without workstation-class client hardware | interactive latency, frame quality, session density, isolation and application support |
| Cryptography and specialized search | Parallel hashing, proof generation, batch verification and bounded search | Higher throughput when algorithms map safely to parallel kernels | correct vectors, constant-time/security constraints, throughput, cost |

The utility spans AI, HPC, industrial digitalization, robotics, analytics, graphics, digital twins, healthcare, finance, manufacturing, media, and scientific research. These are representative categories rather than a claim that every application in them benefits. [NVIDIA accelerated-computing use cases](https://www.nvidia.com/en-us/solutions/), [industrial workloads](https://www.nvidia.com/en-us/industries/industrial-sector/), and [AMD GPU application catalog](https://www.amd.com/content/dam/amd/en/documents/resources/gpu-accelerated-applications-catalog.pdf) document the breadth of production workloads.

## When a GPU is not the right answer

GPU placement should be rejected or fall back to CPU when one or more of these dominate:

- the task is sequential, branch-heavy, tiny, or invoked too infrequently to amortize setup;
- data transfer, serialization, network, storage, or compilation costs exceed kernel savings;
- the working set cannot fit the selected accelerator memory and partitioning would erase the gain;
- the required numeric behavior, library, driver, operating system, or device feature is unsupported;
- deadline or queue delay makes an otherwise fast accelerator slower end to end;
- a local CPU/NPU is cheaper, more available, or more private for the required quality;
- external placement conflicts with data classification, residency, licensing, or tenant policy;
- paid acceleration does not meet the WorkUnit's cost ceiling;
- the runtime cannot produce trustworthy execution and quality evidence.

GPU utilization is not reservation evidence. NVIDIA defines the commonly reported GPU-utilization value as the fraction of a recent sample period during which one or more kernels executed; the sampling period may be only a fraction of a second to one second. A zero or old point sample cannot prove that an exclusive slot is free. [NVIDIA System Management Interface](https://docs.nvidia.com/deploy/nvidia-smi/index.html)

## Product forms users actually need

### 1. Local acceleration

**Audience:** every user with a capable browser, workstation, laptop, or edge device.  
**Experience:** click Run; HoloScript probes permitted local capabilities and executes locally when the quality and deadline can be met.  
**Benefits:** lowest data movement, privacy, offline operation, no cloud GPU charge, instant interactivity, and use of already-owned hardware.  
**Technology:** WebGPU/WGSL in the browser; native WebGPU/Vulkan/DirectML/Metal/CUDA/ROCm paths as supported; CPU fallback only when authored policy allows it. WebGPU compute shaders expose controllable parallel dispatch over buffers and images, making browser-local compute a genuine product lane rather than a preview-only renderer. [W3C WGSL](https://www.w3.org/TR/WGSL/) and [WebGPU compute example](https://developer.chrome.com/docs/capabilities/web-apis/gpu-compute)

### 2. Sovereign queued jobs

**Audience:** creators, developers, researchers, and small teams.  
**Experience:** submit a bounded job, receive a quote/placement, follow state and logs, cancel safely, and download outputs plus receipts.  
**Capacity:** owned machines and explicitly enrolled fleet nodes.  
**Best for:** rendering, reconstruction, training, simulation, batch inference, asset processing, and benchmarks.  
**Commercial form:** usage credits, job-total quote, or project allowance.

### 3. Elastic managed bridge

**Audience:** users whose job exceeds local/owned capacity or needs a specific accelerator.  
**Experience:** the same WorkUnit and receipts; the provider is an implementation detail unless the customer requests a named provider or region.  
**Capacity:** current bridge begins with the existing Vast-backed HoloMesh resource flow; hyperscaler and specialist adapters may be added behind the same contract.  
**Guard:** external placement is never implicit. It requires bridge admission, fresh cost and capacity evidence, a trusted spend verdict, data-policy compatibility, and an atomic lease.

### 4. Interactive endpoints and sessions

**Audience:** applications, agents, games, 3D collaboration, notebook users, and real-time inference.  
**Experience:** warm endpoint or session with declared latency/throughput SLO, autoscaling boundaries, concurrency limits, and idle shutdown.  
**Difference from a job:** session admission reserves an explicit time/concurrency envelope; individual requests still receive attributable usage and quality evidence.

### 5. Dedicated enterprise capacity

**Audience:** regulated, high-volume, latency-sensitive, or predictable production workloads.  
**Forms:** reserved blocks, dedicated nodes, MIG/vGPU slices where supported, private clusters, on-premises deployment, or bring-your-own-cloud/account.  
**Why:** capacity assurance, stable performance, tenant isolation, network/data control, and predictable commercial terms. Cloud vendors themselves expose multiple consumption modes because on-demand capacity alone is not sufficient; for example, AWS Capacity Blocks reserve GPU capacity for bounded future windows, while Google documents reservations, Spot, and flex-start options for accelerator families. [AWS Capacity Blocks](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-capacity-blocks.html) and [Google accelerator-optimized machines](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines)

### 6. Virtual workstations and application streaming

**Audience:** CAD/DCC, medical imaging, architecture, simulation, and media teams.  
**Experience:** secure browser/native remote workspace with an assigned graphics profile and session evidence.  
**Isolation:** dedicated GPU, hardware partition, or licensed vGPU profile. NVIDIA documents vGPU for remote desktops/applications and MIG-backed vGPU for isolated compute/graphics partitions. [NVIDIA vGPU](https://www.nvidia.com/en-us/data-center/virtualization/) and [MIG-backed vGPU](https://docs.nvidia.com/ai-enterprise/release-8/latest/infra-software/vgpu/features/mig-backed-vgpu.html)

## One portable HoloScript contract

The public API should not make a user choose between local laptop syntax, an owned node syntax, and a provider syntax. The compiler-authored unit carries portable intent:

```holo
orb Reconstruction @compute(
  intent: "Reconstruct a bounded scene from the uploaded capture",
  allowed_accelerators: ["gpu", "cpu"],
  placement_policy: "external_bridge_requested",
  data_classification: "confidential",
  quality_metric: "reprojection_error",
  quality_operator: "lte",
  quality_threshold: 0.02,
  quality_reference: "cpu_reference",
  deadline_ms: 900000,
  budget_currency: "USD",
  max_cost_minor_units: 500,
  allow_fallback: false
) {}
```

The compiler/runtime then binds this source to:

```text
WorkUnit
  -> authenticated capacity observation
  -> authenticated placement plan
  -> durable allocation CAS + fenced lease
  -> durable job lifecycle
  -> execution + quality + hardware receipt
  -> cost reconciliation
  -> privacy-preserving utility aggregate
```

This separates three facts that are often collapsed incorrectly:

- **observed:** a resource appeared healthy and eligible at a measured time;
- **logical slot reserved:** the HoloScript allocator atomically changed its exact slot from available to leased; this is not provider-side possession unless separate provider evidence proves that fact;
- **executed:** authenticated terminal evidence matches the WorkUnit, plan, lease, hardware, quality, and cost.

## What already exists in HoloMesh fleet

The current source was inspected directly in both repositories.

### Fleet control plane already built

- `Team.fleetSnapshot` stores a publisher, source, snapshot and recomputed health.
- `GET /api/holomesh/team/:id/fleet` requires `board:read`; POST requires `board:write` plus request-signature verification and signer/caller binding rules.
- The v2 Vast resource-flow contract validates aggregate counts, spend arithmetic, evidence visibility, gaps, duplicate bindings, and trusted under-cap state.
- The live producer reports per-resource lifecycle, GPU name/count/VRAM, utilization, effective hourly compute/storage/total cost, capacity bindings, spend accounting, and visibility/evidence sources.
- GET recomputes health instead of trusting persisted health.

### Deliberate boundary

That fleet state is an **observation**. It does not currently provide:

- an exclusive capacity-slot registry;
- an atomic compare-and-swap allocation;
- a fencing token that rejects stale executors;
- durable job and transition records;
- idempotent submit/transition responses;
- an explicit capacity data-class policy;
- a WorkUnit-total quote;
- a provider-neutral user/enterprise response.

The existing in-memory vault lease and stores with memory fallback cannot establish those facts. GPU allocation must use Postgres without an in-memory fallback. Commit plus immutable-journal read-back may prove only that the HoloScript logical slot was leased; it cannot by itself prove provider reservation, active possession, or execution.

### Normalization rules

The Vast-backed HoloMesh observation is normalized as `managed_bridge`, never `owned_fleet`. A provider-local mapping supplies a random, stable, tenant-scoped `sha256:` capacity reference. Portable evidence never includes provider name, account, instance ID, endpoint, IP, SSH port, raw GPU model, credential reference, or fencing token.

The initial normalizer fails closed unless:

- the record is current v2 with the exact expected resource-flow schema;
- capture is not in the future and is less than 60 seconds old;
- recomputed health is `ok`, with no unresolved visibility/spend/capacity gaps;
- the selected row is unique, running, GPU-shaped, and explicitly registered as eligible;
- spend is still fresh, monetary/provenance complete, cap-applicable, and under cap;
- an operator-attested data policy admits the WorkUnit classification;
- runtime is bounded and the job-total estimate fits both WorkUnit budget and trusted headroom;
- the durable allocation cursor matches the opaque capacity reference.

`availableSlots` is derived only from that durable cursor. It is never inferred from utilization, running counts, resource-flow consumers, or fleet health.

Fresh spend and headroom evidence is admission telemetry, not an atomic budget hold. Concurrent jobs can each observe the same remaining headroom. A.GPU.007 therefore requires a durable team/rail budget ledger that compare-and-swaps an integer-minor-unit hold in the same transaction as the logical-slot lease, then reconciles or releases that hold from measured cost. Until that exists, the normalizer may reject work above observed headroom but must not claim a global spend cap is concurrency-safe.

## Durable lifecycle and concurrency model

The first job state machine is intentionally small:

```text
preflighted -> queued -> leased -> starting -> running -> succeeded
       |          |         |          |          |
       +----------+---------+----------+----------+-> failed | cancelled
```

`starting` means executor setup may occur, but workload kernels may not start until the `starting -> running` state and the same lease/fence have committed. Terminal records never resurrect; a retry creates a new attempt.

The allocation transaction must atomically:

1. resolve the principal-scoped idempotency key;
2. lock and compare the expected job receipt/version;
3. lock and compare the expected allocation cursor;
4. persist the exact lease and evidence;
5. update job and allocation state;
6. persist transition and allocator projection receipts;
7. enqueue an outbox event;
8. commit; and
9. read back the exact committed bytes before returning success.

The same key and same request returns the exact stored public response. The same key with different request bytes is a conflict. No plaintext idempotency key, fencing token, provider credential, or endpoint is stored in portable receipts or outbox events.

## Enterprise control requirements

| Control area | Required behavior |
|---|---|
| Identity | SSO/OIDC for people, workload identities for services, short-lived credentials, server-derived tenant/principal |
| Authorization | Least-privilege `compute:read`, `compute:submit`, `compute:operate`, `fleet:publish`, policy and billing roles; no client-supplied principal |
| Tenant isolation | Dedicated capacity or verifiable hardware/VM/container partition; explicit sharing profile; tenant-scoped opaque capacity references |
| Data protection | Classification, residency, egress allowlist, encryption in transit/at rest, provider policy, retention/deletion policy, optional customer-managed keys |
| Confidential workloads | Hardware/VM attestation where supported; treat confidentiality as a capability with evidence, never a GPU-model assumption |
| Supply chain | Pinned images and dependencies, signed artifacts, vulnerability policy, source/WorkUnit binding, reproducible or attributable build evidence |
| Capacity | Admission control, quotas, fair queueing, reservations, priorities, preemption rules, concurrency and deadline policy |
| Reliability | Fenced leases, heartbeats, expiry cleanup, retry policy, checkpointing, zone/provider failure handling, disaster recovery |
| Observability | Per-job logs/metrics/traces, GPU telemetry, queue latency, health and diagnostics, SLO burn alerts, audit trail |
| Financial control | Preflight estimate, observed cap/headroom admission, atomic integer-minor-unit budget hold, rate lock or expiry, real usage, markup/tax separation, refunds/reconciliation, anomaly guard |
| Evidence | Source, placement, lease, transition, execution, quality, hardware, cost and aggregate receipts with explicit verification scope |
| Governance | Retention and export, policy versions, reviewer/auditor access, incident workflow, deletion receipts, legal/compliance mappings |

Hardware partitioning can increase utilization while providing dedicated memory/compute resources and stronger QoS/fault isolation. NVIDIA MIG supports multiple isolated GPU instances on supported devices; it is appropriate only after the allocator models real partitions instead of multiplying a physical-GPU count. [NVIDIA MIG](https://www.nvidia.com/en-us/technologies/multi-instance-gpu/)

For sensitive workloads, supported GPU confidential-computing configurations can protect code, models, and data in use with a hardware-rooted TEE and attestation. This must be admitted from exact platform evidence because support varies by GPU, topology, host CPU, virtualization mode, and software version. [NVIDIA Confidential Computing](https://www.nvidia.com/en-us/glossary/confidential-computing/) and [supported confidential-container platforms](https://docs.nvidia.com/datacenter/cloud-native/confidential-containers/latest/supported-platforms.html)

## Scheduling and operations

Kubernetes is an adapter, not the public semantics. The existing HoloScript lease/job contract remains authoritative while an enterprise adapter may project leases into Kubernetes ResourceClaims or GPU resource requests. Current EKS documentation recommends NVIDIA Dynamic Resource Allocation for new supported Kubernetes deployments and notes richer attribute selection and sharing than the classic integer device plugin. [Amazon EKS GPU device management](https://docs.aws.amazon.com/eks/latest/userguide/device-management-nvidia.html)

The NVIDIA GPU Operator is a practical on-prem/cloud cluster component because it manages drivers, container toolkit, device plugin, node discovery, MIG management, DCGM monitoring and validation. Its installation and license requirements remain deployment-specific. [NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/)

Telemetry and active proof must remain distinct. DCGM passive health watches summarize retained telemetry but do not apply workload load; active diagnostics execute dedicated tests and can require exclusive access. Placement can use fresh passive evidence, while onboarding, incident recovery, and return-to-service gates should use the appropriate active diagnostic. [DCGM health monitoring](https://docs.nvidia.com/datacenter/dcgm/latest/learn/modules/health-monitoring.html) and [DCGM diagnostics](https://docs.nvidia.com/datacenter/dcgm/latest/learn/modules/dcgm-diagnostics.html)

## User and administrator experiences

### Individual user

1. Author or select a GPU-capable task.
2. See local/owned/managed options expressed as privacy, expected completion, quality and price—not raw instances.
3. Submit once with an idempotency key.
4. Watch `preflighted`, `queued`, `leased`, `starting`, `running`, and terminal state.
5. Cancel safely; an honest pre-start cancellation does not fabricate an execution receipt.
6. Receive artifacts, quality comparison, actual placement, measured hardware evidence, cost, and verification state.

### Team administrator

1. Enroll owned capacity or enable selected managed bridges.
2. Define data classification, budget, priority, residency, sharing, and retention policies.
3. Set quotas and alerts by team/project/principal/workload.
4. View qualified utilization: useful outcomes, quality-pass rate, queue and execution latency, failure causes, and cost—not utilization alone.
5. Drain/quarantine capacity and require active validation before return to service.

### Enterprise platform operator

1. Connect identity, billing/cost center, policy, secret custody, artifact storage and observability systems.
2. Choose shared, partitioned, dedicated, BYOC or on-prem capacity classes.
3. Establish SLOs per workload class and region.
4. Export signed audit/evidence bundles without provider credentials or raw tenant data.
5. Reconcile invoices against admitted quotes, allocation windows, and execution receipts.

## Commercial packaging

Recommended packaging keeps the same technical contract across tiers:

- **Local:** free/no infrastructure charge; device qualification and evidence included.
- **Creator:** credits or per-job price for queued owned/managed execution.
- **Team:** pooled budget, concurrency, shared artifacts, policy and role controls.
- **Enterprise shared:** committed spend/concurrency plus SLO, audit export and support.
- **Enterprise dedicated/BYOC:** reservation or management fee, dedicated capacity, networking/security integration and negotiated SLO.

Price should separate:

```text
infrastructure cost
+ HoloScript orchestration/verification/service charge
+ optional storage and network egress
+ taxes or contractual adjustments
- credits/refunds
= customer total
```

Never claim a GPU-hour alone is value. Measure utility as quality-qualified completions, time saved against the admitted baseline, deadline success, avoided external spend, cost per accepted output, and user/tenant retention. Privacy-preserving aggregates need minimum cohort sizes and suppression so enterprise usage is not exposed.

## Delivery roadmap and current boundary

| Work unit | Deliverable | Status at report time |
|---|---|---|
| A.GPU.001 | Compiler-native `@compute` WorkUnit | Implemented and committed |
| A.GPU.002 | Content-addressed execution receipts | Implemented and committed |
| A.GPU.003 | Live thermal GPU execution evidence | Implemented and committed on the measured local path |
| A.GPU.009 | Privacy-preserving utility observations/aggregates | Implemented and committed |
| A.GPU.004 | Authenticated snapshot, bridge admission, plan, lease proposal and execution attestation | Implemented and committed; proposal is not a reservation |
| A.GPU.005 | Durable job lifecycle, HoloMesh normalizer, Postgres CAS/fencing/read-back | In progress |
| A.GPU.006 | User submit/status/cancel/result surface | Not yet shipped |
| A.GPU.007 | Enterprise capacity/policy/budget/audit surface | Not yet shipped |
| A.GPU.008 | Cross-backend conformance and benchmark corpus | Not yet shipped |

Until A.GPU.005 is complete and tested against a real durable store, the system may say **observed**, **admitted**, or **prepared lease proposal**. It must not say **reserved**, **active possession**, or **authorized execution**. Until A.GPU.006-.008 are complete, it is not an end-user or enterprise GPU service.

## Acceptance gates

The service is ready for a bounded beta only when all of the following are independently verifiable:

- the language/compiler produces the WorkUnit used by the service;
- local, owned, and managed lanes use the same portable job/evidence model;
- a two-job race for one expected cursor yields exactly one committed lease;
- stale/wrong fencing tokens cannot start or continue work;
- submit and transition retries are byte-stable and conflict on key reuse with different requests;
- database loss makes reservation unavailable instead of falling back to memory;
- terminal cleanup cannot release a newer job's lease;
- fleet utilization never creates availability;
- provider and credential fields cannot appear in portable responses;
- pre-start cancellation/failure is represented without fabricated execution;
- actual GPU execution evidence binds the exact WorkUnit, plan and lease;
- job-total quote and actual cost reconcile inside admitted policy;
- confidential/restricted jobs fail closed without explicit policy/evidence;
- user and enterprise surfaces expose verification scope and incomplete evidence honestly;
- conformance tests run across at least local GPU, owned-fleet adapter, managed bridge test double, CPU fallback and failure paths;
- live deployment proves authenticated submit, durable state, executor fencing, terminal evidence, and read-back.

## Primary references

- [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-programming-guide/contents.html)
- [W3C WebGPU Shading Language](https://www.w3.org/TR/WGSL/)
- [NVIDIA Multi-Instance GPU](https://www.nvidia.com/en-us/technologies/multi-instance-gpu/)
- [NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/)
- [NVIDIA GPU telemetry](https://docs.nvidia.com/datacenter/cloud-native/gpu-telemetry/latest/index.html)
- [NVIDIA DCGM](https://docs.nvidia.com/datacenter/dcgm/latest/learn/index.html)
- [AWS accelerated-computing instances](https://docs.aws.amazon.com/ec2/latest/instancetypes/instance-types.html)
- [AWS Capacity Blocks](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-capacity-blocks.html)
- [Google accelerator-optimized machines](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines)
- [Azure GPU-optimized VM families](https://learn.microsoft.com/en-sg/azure/virtual-machines/sizes/overview)
