// HoloShell Legacy App Reconstruction data pipeline.
// Turns a captured legacy window reality snapshot into a dense HoloScript
// geometry scene with semantic control groups, witness placeholders, and
// low-confidence blocks. The shell can inspect controls without exposing
// raw screenshots as the primary model.

pipeline "HoloShellLegacyAppReconstructionPipeline" {
  schedule: "manual"
  timeout: 300s
  retry: { max: 0 }

  source LegacyWindowCapture {
    type: "filesystem"
    path: "${input.realitySnapshotPath}"
    format: "json"
    readOnly: true
  }

  source AccessibilityTreeCapture {
    type: "filesystem"
    path: "${input.accessibilityTreePath}"
    format: "json"
    readOnly: true
  }

  source OCRCapture {
    type: "filesystem"
    path: "${input.ocrCapturePath}"
    format: "json"
    readOnly: true
  }

  transform ParseAccessibilityTree {
    accessibilityTree -> rawNodes : flatten_tree()
    rawNodes -> typedNodes : classify_by_role()
    typedNodes -> geometryNodes : assign_bounds_and_semantics()
  }

  transform ExtractOCRRegions {
    ocrCapture -> ocrRegions : parse_ocr_blocks()
    ocrRegions -> ocrAnnotations : map_regions_to_nodes(geometryNodes)
    ocrAnnotations -> corroboratedNodes : cross_reference_with_accessibility(typedNodes)
  }

  transform BuildControlGroups {
    corroboratedNodes -> grouped : group_by_semantic_proximity()
    grouped -> groups : assign_group_semantics(["navigation", "toolbar", "sidebar", "content", "form", "status", "dialog", "decorative"])
    groups -> enrichedGroups : attach_group_confidence()
  }

  transform ClassifyConfidence {
    enrichedGroups -> classifiedNodes : classify_node_confidence()
    classifiedNodes -> contestedMarked : mark_contested_nodes()
    contestedMarked -> confidenceDistribution : compute_distribution(["high", "medium", "low", "inferred", "unresolved"])
  }

  transform GenerateWitnessPlaceholders {
    classifiedNodes -> witnessRefs : create_witness_placeholders(["screenshot_before", "screenshot_after", "ocr_text_extract", "accessibility_tree", "bounding_box_overlay", "semantic_label_overlay", "control_inspector_snapshot", "reconstruction_diff"])
    witnessRefs -> anchored : attach_witness_coverage(classifiedNodes)
  }

  transform BuildLowConfidenceBlocks {
    classifiedNodes -> lowConfNodes : filter_by_confidence(["low", "inferred", "unresolved"])
    lowConfNodes -> blocks : group_by_proximity_and_reason()
    blocks -> resolvedBlocks : assign_suggested_actions(["human_review", "re_capture", "re_parse", "accept_as_is"])
    resolvedBlocks -> blockingMarked : mark_blocking_if_unresolved()
  }

  transform GenerateReconstruction {
    enrichedGroups -> reconstruction : assemble_reconstruction({
      screenshotIsPrimaryModel: false,
      primaryModel: "geometry_nodes_with_semantics",
      screenshotRole: "evidence_anchor"
    })
    reconstruction -> validated : validate_reconstruction()
    validated -> hashed : stable_hash()
  }

  validate HoloShellLegacyAppReconstructionContract {
    reconstruction.schemaVersion : required, equals "hololand.holoshell.legacy-app-reconstruction.v0.1.0"
    reconstruction.summary.totalGeometryNodes : required, gte 1000
    reconstruction.summary.screenshotIsPrimaryModel : equals false
    reconstruction.redaction.screenshotRole : equals "evidence_anchor"
    reconstruction.redaction.primaryModel : equals "geometry_nodes_with_semantics"
    reconstruction.redaction.localOnly : equals true
    reconstruction.redaction.secretsRedacted : equals true
    reconstruction.receipt.mutationPerformed : equals false
    reconstruction.geometryNodes.every(node => node.screenshotIsPrimary === false) : required
    reconstruction.controlGroups.length : required, gte 1
    reconstruction.witnessPlaceholders.length : required, gte 1
  }

  sink ReconstructionSource {
    type: "filesystem"
    path: "experiments/holoshell-human-os-frontier/legacy-app-reconstruction-room.holo"
    method: "write"
    format: "holo"
    on_error: { action: "block_reconstruction", continue: false }
  }

  sink ReconstructionEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-21/legacy-app-reconstruction-evidence-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink BeforeAfterWitnessReceipt {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-21/legacy-app-reconstruction-witness-receipt.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "webhook"
    endpoint: "${env.HOLOMESH_BOARD_SEED_URL}"
    method: "POST"
    body: {
      source: "holoshell-human-os-frontier"
      workflow: "legacy-app-reconstruction"
      reconstruction_nodes: "${reconstruction.summary.totalGeometryNodes}"
      screenshot_is_primary: false
      primary_model: "geometry_nodes_with_semantics"
    }
    on_error: { action: "log", continue: true }
  }
}