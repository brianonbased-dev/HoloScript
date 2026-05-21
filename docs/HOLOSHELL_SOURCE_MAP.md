# HoloShell Operator Room — Source Map

> Canonical index of every HoloShell operator room: the `.holo` scene source,
> its backing receipt contracts in `@holoscript/framework`, and the downstream
> HoloLand surfaces it targets.
>
> **Owner**: HoloScript Core (receipt vocabulary) + HoloLand (room rendering).
> **Source truth**: `experiments/holoshell-human-os-frontier/` for room sources;
> `packages/framework/src/board/holoshell-*.ts` for receipt contracts.
>
> Rule: A room promoted out of experiments to a HoloLand surface MUST have all
> its receipt validators passing in `@holoscript/framework` tests.

---

## Rooms

### Flagship Readiness Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/flagship-readiness-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/flagship-readiness-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/flagship-readiness-policy.hsplus` |
| Receipt contracts | `holoshell-readiness-receipt.ts` |
| Human job | Make this computer ready to build a HoloLand world, use local files, verify it works, and show what changed |
| Stations | Hardware reality · Local project · HoloScript source room · HoloMesh coordination |
| HoloLand target | Twin Earth setup flow |

---

### Permission Gate Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/permission-gate-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/permission-gate-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/permission-gate-policy.hsplus` |
| Receipt contracts | `holoshell-permission-gate-receipts.ts` |
| Human job | Connect the account, app, connector, or device permission HoloLand needs; grant the minimum scope; verify it; show the revoke path |
| Stations | Subject · Minimum scope · Fresh approval · Verify · Revoke |
| HoloLand target | World-tool permission unlock |

---

### Physical Actuation Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/physical-actuation-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/physical-actuation-safety-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/physical-actuation-safety-policy.hsplus` |
| Receipt contracts | `holoshell-physical-actuation-receipts.ts` · `holoshell-device-safety-receipts.ts` · `holoshell-permission-gate-receipts.ts` |
| Human job | Operate a real headset, robot, or device only after I can see the plan, simulate it, confirm it is fresh, approve it, and replay what happened |
| Upper stations | Actor inventory · Minimum permission · Simulation preview · Freshness gate · Safety envelope |
| Lower stations | Guarded execution · Safe stop · Rollback limit · Brittney operator |
| Token trail | DeviceInventoryReceipt → HoloShellPermissionGateReceiptPack → ActuationSimulationReceipt → SensorFreshnessReceipt → DeviceSafetyEnvelopeReceipt → DeviceActionReceipt\|SafeStopReceipt |
| HoloLand target | Twin Earth robot / device operator room |
| Task | `task_1779224072780_2x6m` |

**Pack hierarchy**

```
HoloShellPhysicalActuationReceiptPack
  ├── simulation   ActuationSimulationReceipt
  ├── freshness    SensorFreshnessReceipt
  ├── safeStop     SafeStopReceipt
  ├── rollback     PhysicalRollbackLimitReceipt
  ├── deviceSafety? HoloShellDeviceSafetyReceiptPack
  │     ├── inventory  DeviceInventoryReceipt
  │     ├── envelope   DeviceSafetyEnvelopeReceipt
  │     ├── consent    ConsentReceipt
  │     ├── action?    DeviceActionReceipt
  │     └── replay?    ReplayLessonReceipt
  └── permissionGate? HoloShellPermissionGateReceiptPack
```

**Execution gate**: `simulation.status === 'passed'` AND `freshness.sensorFresh && approvalFresh && adapterHealthy && ownerLaneFresh` AND `safeStop.status === 'armed'` must all be true before pack status can reach `ready` or `executed`.

---

### Install / Update Safe Wrapper Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/install-update-safe-wrapper-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/install-update-safe-wrapper-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/install-update-safe-wrapper-policy.hsplus` |
| Receipt contracts | `holoshell-package-mutation-receipt.ts` |
| Human job | Install or update a package with visible approval, hash verification, and rollback instructions |
| HoloLand target | Package mutation control surface |

---

### Asset Shard Intake Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/asset-shard-intake-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/asset-shard-intake-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/asset-shard-intake-policy.hsplus` |
| Receipt contracts | `holoshell-asset-shard-receipts.ts` |
| Human job | Import a local file or asset into HoloLand as a tracked, provenance-anchored shard |
| HoloLand target | Creator asset intake |

---

### Document / Spreadsheet Custody Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/document-spreadsheet-custody-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/document-spreadsheet-custody-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/document-spreadsheet-custody-policy.hsplus` |
| Receipt contracts | `holoshell-workfile-custody-receipt.ts` |
| Human job | Open, edit, and save a document or spreadsheet with audit trail and no credential extrusion |
| HoloLand target | HoloShell workfile operator |

---

### Failed Provider Export Repair Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/failed-provider-export-repair-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/failed-provider-export-repair-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/failed-provider-export-repair-policy.hsplus` |
| Receipt contracts | `holoshell-provider-export-repair-receipts.ts` |
| Human job | Retry or repair a broken cloud export without losing the original state |
| HoloLand target | Provider error recovery surface |

---

### Legacy App Reconstruction Room

| Field | Value |
|---|---|
| Room source | `experiments/holoshell-human-os-frontier/legacy-app-reconstruction-room.holo` |
| Pipeline | `experiments/holoshell-human-os-frontier/legacy-app-reconstruction-pipeline.hs` |
| Policy | `experiments/holoshell-human-os-frontier/legacy-app-reconstruction-policy.hsplus` |
| Receipt contracts | `holoshell-legacy-app-reconstruction.ts` |
| Human job | Convert a captured legacy window into 1000+ inspectable geometry nodes where the shell can inspect controls without raw screenshots as the primary model |
| Stations | Source reality · Reconstruction engine · Dense geometry · Control groups · Low-confidence blocks · Witness anchors · Receipt trail |
| HoloLand target | Legacy app spatial reconstruction control room |
| Task | `task_1779358599518_1rwr` |

**Key invariant**: `screenshotIsPrimaryModel: false`. Screenshots are evidence anchors only; the primary model is `geometry_nodes_with_semantics`.

**Pack hierarchy**

```
HoloShellLegacyAppReconstruction
  ├── sourceAnchors          HoloShellReconstructionSourceAnchors
  ├── summary                HoloShellReconstructionSummary (confidence distribution)
  ├── geometryNodes          HoloShellGeometryNode[1000+]
  │     ├── nodeId, type, label, bounds
  │     ├── confidence       high | medium | low | inferred | unresolved
  │     ├── controlGroupId   links to ControlGroup
  │     ├── contested         bool — multiple interpretations exist
  │     ├── alternatives[]   alternative type/label/confidence
  │     └── screenshotIsPrimary  always false
  ├── controlGroups          HoloShellControlGroup[10]
  │     ├── groupId, semantic, label
  │     ├── nodeIds[]        references into geometryNodes
  │     └── confidence
  ├── witnessPlaceholders    HoloShellWitnessPlaceholder[8]
  │     ├── type             screenshot_before | screenshot_after | ocr_text_extract | ...
  │     ├── contentHash, contentRef
  │     └── coversNodeIds[]  which nodes this witness covers
  ├── lowConfidenceBlocks    HoloShellLowConfidenceBlock[]
  │     ├── nodeIds[]        low/inferred/unresolved nodes
  │     ├── reason, suggestedAction
  │     └── blocking         true for unresolved (blocks full reconstruction)
  ├── redaction              screenshotRole: evidence_anchor, primaryModel: geometry_nodes_with_semantics
  └── receipt                HoloShellReconstructionReceipt
```

---

## Receipt Contract Index

Verification: `pnpm --filter @holoscript/framework test`

| Contract file | Key pack / validator |
|---|---|
| `holoshell-readiness-receipt.ts` | `HoloShellReadinessReceipt` |
| `holoshell-permission-gate-receipts.ts` | `HoloShellPermissionGateReceiptPack` |
| `holoshell-device-safety-receipts.ts` | `HoloShellDeviceSafetyReceiptPack` · `HoloShellTargetDeviceProofPack` |
| `holoshell-physical-actuation-receipts.ts` | `HoloShellPhysicalActuationReceiptPack` |
| `holoshell-package-mutation-receipt.ts` | `HoloShellPackageMutationReceipt` |
| `holoshell-asset-shard-receipts.ts` | `HoloShellAssetShardReceipt` |
| `holoshell-workfile-custody-receipt.ts` | `HoloShellWorkfileCustodyReceipt` |
| `holoshell-provider-export-repair-receipts.ts` | `HoloShellProviderExportRepairReceipt` |
| `holoshell-brittney-action-receipts.ts` | `HoloShellBrittneyActionReceipt` |
| `holoshell-browser-receipts.ts` | `HoloShellBrowserReceipt` |
| `holoshell-cli-receipts.ts` | `HoloShellCliReceipt` |
| `holoshell-download-shelf-receipts.ts` | `HoloShellDownloadShelfReceipt` |
| `holoshell-downloads-shelf-receipts.ts` | `HoloShellDownloadsShelfReceipt` |
| `holoshell-legacy-app-reality.ts` | `HoloShellLegacyAppRealityReceipt` |
| `holoshell-legacy-app-reconstruction.ts` | `HoloShellLegacyAppReconstruction` · `HoloShellGeometryNode` · `HoloShellControlGroup` · `HoloShellWitnessPlaceholder` · `HoloShellLowConfidenceBlock` |
| `holoshell-account-export-receipts.ts` | `HoloShellAccountExportReceipt` |
| `holoshell-target-device-proof-receipts.ts` | `HoloShellTargetDeviceProofReceipt` |

---

## Promotion Checklist

A room experiment is ready for HoloLand promotion when all of the following hold:

- [ ] All referenced validators pass in `@holoscript/framework` tests
- [ ] Room `.holo` uses the flat `composition { object {} }` form (not nested `room {}`)
- [ ] Receipt pack has a passing `true` test case and at least two `false`-path tests
- [ ] `HOLOSHELL_SOURCE_MAP.md` entry created
- [ ] No absolute local paths in any receipt field
- [ ] `physicalUndoGuaranteed: false` enforced on all `PhysicalRollbackLimitReceipt` instances
- [ ] `credentialExtrusionAllowed: false` enforced on all `ConsentReceipt` instances
