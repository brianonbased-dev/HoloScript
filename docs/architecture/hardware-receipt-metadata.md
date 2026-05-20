# Portable Hardware Receipt Metadata

CG-032 protects HoloScript's hardware differentiator: a receipt produced on a
Quest, Jetson, robot controller, browser WebGPU adapter, or embedded runtime
must retain the same semantic evidence fields after it moves between machines.
Vendor logs can remain attached as raw evidence, but HoloScript needs one
portable metadata contract for routing, replay, audit, and comparison.

## Required Shape

`@holoscript/core/world-model` exports
`PortableHardwareReceiptMetadata` and
`validatePortableHardwareReceiptMetadata`. A valid receipt records:

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Must equal `holoscript.hardware-receipt-metadata.v1`. |
| `target` | Stable target id, kind, architecture, and artifact kind. |
| `device` | Vendor, model, optional accelerator, optional redacted device hash, and optional driver versions. |
| `runtime` | Runtime name, runtime version, host OS, and optional adapter fingerprint. |
| `compilerVersion` | HoloScript compiler/runtime version that produced or interpreted the artifact. |
| `constraints` | Array of explicit constraints such as frame budget, power budget, memory limit, safety envelope, or thermal limit. |
| `measuredResults` | At least one measured metric with value, unit, and method. |
| `replayInputs` | At least one replay input with URI and SHA-256 content hash. |
| `provenance` | Capture time, source composition hash, and optional commit, command hash, TrustReceipt id, or SimulationContract id. |
| `owner` | Agent/team/contact responsible for the receipt. |

## Trust Integration

The hardware metadata is not a replacement for `TrustReceipt`. It is the
hardware evidence payload that a `TrustReceipt` can reference through
`evidence.hashes`, `links.commit`, and `algebraicTrust.layer3OracleRef`.
Simulation and digital-twin receipts should still point Layer 3 at
SimulationContract replay evidence when available. UI or device-observation
receipts may use visual witness or approval-bundle oracles, but they must not
claim physics replay without a SimulationContract id.

## Privacy Rules

Receipts must not publish raw serial numbers, private local paths, `.env`
content, wallet material, or browser auth state. Use `device.deviceHash` and
hashed replay inputs for identity. Store raw vendor logs in local/private
evidence storage and reference them by digest.

## Minimum Validation

Every hardware receipt producer should run:

```ts
import {
  validatePortableHardwareReceiptMetadata,
} from '@holoscript/core/world-model';

const validation = validatePortableHardwareReceiptMetadata(metadata);
if (!validation.valid) {
  throw new Error(validation.errors.join('; '));
}
```

That keeps hardware evidence comparable across vendor-specific lanes while
leaving room for richer raw measurements beside the portable core.
