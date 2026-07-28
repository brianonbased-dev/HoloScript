# HoloScript To Google Agent Platform Deployment Note

This note maps a HoloScript-authored agent or world workflow onto Google's
current Gemini Enterprise Agent Platform vocabulary. It is a contract note, not
a Google Cloud deployment receipt.

No command in this document creates Google Cloud resources, spends cloud budget,
or proves accelerator usage. A live deployment task must add its own Google
project, region, IAM, billing, teardown, and artifact receipts.

## Scope

Use this note when a HoloScript agent needs to prepare a portable deployment
bundle for a Google operator surface while keeping HoloScript as the source of
truth for:

- `.holo`, `.hsplus`, and `.hs` source.
- HoloScript semantic IR.
- `validate_holoscript` and `compile_holoscript` receipts.
- CAEL trace and x402 settlement evidence.
- HoloSig identity evidence owned by the CG-099 contract.
- Cross-cloud replay boundaries.

Do not use this note to implement HoloSig. The identity boundary lives in the
CG-099 HoloSig contract in the ai-ecosystem repo.

## Current Google Vocabulary

Verified against official Google documentation on 2026-06-29:

| Google surface                                      | Current meaning                                                                                                                                                | HoloScript mapping                                                                               | Boundary                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Gemini Enterprise Agent Platform                    | Umbrella for building, deploying, governing, and optimizing agents.                                                                                            | Treat as a deployment/operator target for HoloScript bundles.                                    | Does not replace HoloScript source, CAEL, HoloMesh, or x402.                                                       |
| Agent Runtime                                       | Managed runtime for deploying, managing, scaling, observing, and governing agents. Google name-change docs map former Vertex AI Agent Engine to Agent Runtime. | Target a deployable agent wrapper plus HoloScript receipt sidecars.                              | No runtime deployment is implied until Google CLI/API receipts exist.                                              |
| Agent Garden                                        | Curated samples and templates inside Agent Platform.                                                                                                           | Use as an example surface for HoloScript starter agents or RAG samples.                          | Samples are not source-of-truth artifacts.                                                                         |
| Agent Search                                        | Search and RAG over websites, unstructured documents, and structured data.                                                                                     | Optional external retrieval backend for a generated Google-facing agent.                         | HoloScript Absorb/HoloEmbed remains the codebase-intelligence source unless a task explicitly delegates retrieval. |
| Agent Development Kit / Agents CLI                  | Code-first agent framework and CLI path for local testing and Google runtime deployment.                                                                       | A HoloScript adapter may emit an ADK-compatible wrapper around semantic IR and receipt sidecars. | ADK project creation is a later implementation task.                                                               |
| Cloud Run / GKE / container-friendly infrastructure | ADK deployment alternatives for containerized agents.                                                                                                          | Preserve portability: the same HoloScript bundle should be replayable outside Google.            | Cloud-specific deployment files must not become the canonical world source.                                        |
| Agent Identity / Agent Gateway                      | Google governance and identity layer for agents.                                                                                                               | Reference HoloSig/x402 evidence in the bundle.                                                   | Do not duplicate CG-099 or adopt Google identity as HoloScript's trust root.                                       |

Agent Runtime's deploy page currently states that Runtime deployment supports
Python. Non-Python HoloScript outputs should route through an adapter-generated
Python wrapper, Cloud Run, GKE, or another container-friendly path until a live
implementation task verifies a different Google-supported route.

Primary Google references:

- [Gemini Enterprise Agent Platform overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/overview)
- [Gemini Enterprise Agent Platform name changes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes)
- [Agent Runtime](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/runtime)
- [Deploy an agent on Agent Runtime](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/deploy-an-agent)
- [Agent Garden](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/agent-garden)
- [Agent Search](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/vertex-ai-search)
- [ADK deployment options](https://adk.dev/deploy/)
- [Agent Identity overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/agent-identity-overview)

## Portable Bundle Shape

A Google-facing handoff should be a directory or archive with this minimum
shape:

```text
google-agent-platform-bundle/
  source/
    workflow.holo
    behavior.hsplus
    pipeline.hs
  ir/
    holoscript-semantic-ir.json
  receipts/
    validate_holoscript.json
    compile_holoscript.<target>.json
    cael-trace.jsonl
    x402-receipt.json
  identity/
    holosig-envelope.json
  google/
    agent-platform-manifest.json
    deployment-boundary.md
```

The `google/` files are adapter metadata. The source, IR, and receipts remain
the portable truth.

Minimal manifest:

```json
{
  "schema": "holoscript.google-agent-platform-deployment.v1",
  "status": "contract_only",
  "googleCloudDeployment": "not_run",
  "googlePaidSpend": "not_run",
  "sourceTruth": ["source/", "ir/holoscript-semantic-ir.json", "receipts/"],
  "googleTargets": {
    "platform": "Gemini Enterprise Agent Platform",
    "runtime": "Agent Runtime",
    "legacyRuntimeName": "Vertex AI Agent Engine",
    "optionalRetrieval": "Agent Search",
    "optionalTemplateSurface": "Agent Garden"
  },
  "holoEvidence": {
    "validationReceipt": "receipts/validate_holoscript.json",
    "compileReceipt": "receipts/compile_holoscript.<target>.json",
    "caelTrace": "receipts/cael-trace.jsonl",
    "x402Receipt": "receipts/x402-receipt.json",
    "holosigEnvelope": "identity/holosig-envelope.json"
  },
  "boundaries": [
    "no_google_cloud_resource_created",
    "no_paid_cloud_spend",
    "no_accelerator_telemetry_claim",
    "no_google_identity_trust_root"
  ]
}
```

## Agent Workflow

1. Read the board task and identify the source files.
2. Run codebase context before editing:

   ```text
   holo_graph_status({})
   holo_query_codebase({"query":"where is the HoloScript Google Agent Platform deployment boundary?"})
   ```

3. Validate the HoloScript source:

   ```text
   validate_holoscript({ "code": "<source>", "format": "holo" })
   ```

4. Compile for the intended HoloScript target before any Google packaging:

   ```text
   compile_holoscript({ "code": "<source>", "target": "<target>" })
   ```

5. Write the bundle manifest and receipt sidecars.
6. If a Google deployment task exists, run it as a separate task with explicit
   Google project, region, IAM, billing, and teardown evidence.

Local CLI fallback:

```powershell
holoscript validate source\workflow.holo
holoscript compile source\workflow.holo --target threejs --output .scratch\google-agent-platform\threejs
```

## Cross-Cloud Boundary

The deployable HoloScript artifact must be replayable without Google:

- Keep `.holo` and `.hsplus` files outside generated Google scaffolding.
- Store CAEL and compile receipts next to the bundle, not inside a Google-only
  log stream.
- Record any Google API response as an external receipt, not as the canonical
  result.
- Prefer adapter manifests over handwritten cloud instructions when possible.
- If Agent Search is used, record the data-store identifier and retrieval policy
  separately from HoloScript Absorb/HoloEmbed receipts.

## Identity Boundary

Google Agent Identity is useful evidence for the Google-hosted side of a run,
but it does not replace HoloSig.

For HoloScript provenance:

- Carry the HoloSig envelope and signer fingerprint in the bundle.
- Carry the x402 receipt when the run paid, earned, or settled anything.
- Carry CAEL `toolName`, `teamId`, `agentId`, `seatId`, `signatureScheme`,
  `verificationStatus`, `policyDecision`, and `provenanceDigest` fields when
  available.
- Treat Google SPIFFE/IAM identity as an external runtime principal.

## Closeout Receipt

Use this when closing a docs-only or contract-only task:

```text
PASS: official Google docs checked on <date>
PASS: validate/compile receipt shape documented
PASS: git diff --check -- docs/guides/holoscript-to-google-agent-platform.md
NOT RUN: Google Cloud deployment
NOT RUN: paid cloud spend
NOT RUN: accelerator telemetry
boundary: CG-099 HoloSig identity work stays in the HoloSig contract
```

Use this only after a real Google deployment task:

```text
PASS: <Google project and region>
PASS: <deployment command and response artifact>
PASS: <agent invocation receipt>
PASS: <teardown or retained-resource approval>
PASS: <HoloScript validate/compile/CAEL/x402 receipts>
```

Anything else is a contract note, not a deployment.
