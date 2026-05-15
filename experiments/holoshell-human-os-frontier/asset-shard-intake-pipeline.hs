// HoloShell asset shard intake data pipeline.
// Turns a local asset folder into a deterministic, replayable shard evidence
// pack before any HoloLand runtime mutation is allowed.

pipeline "HoloShellAssetShardIntakePipeline" {
  schedule: "manual"
  timeout: 180s
  retry: { max: 0 }

  source FolderSnapshot {
    type: "filesystem"
    path: "${input.assetFolder}"
    format: "directory"
    readOnly: true
  }

  transform NormalizeAssetEntries {
    fileEntries -> normalizedEntries : redact_paths() : classify_assets() : hash_content()
  }

  transform BuildAssetManifest {
    normalizedEntries -> sortedEntries : sort_by_path_alias()
    sortedEntries -> manifestHash : stable_hash()
  }

  validate LocalAssetManifestContract {
    manifestHash : required, string
    manifest.sortedEntries : required
    manifest.entries.contentHash : required
    manifest.entries.pathAlias : required
    sourceAssetsMutated : equals false
    privatePathsRedacted : equals true
  }

  transform GenerateShardPreviewSource {
    manifestHash -> shardId : derive_shard_id()
    sortedEntries -> previewObjects : make_preview_objects()
    previewObjects -> previewHoloSource : render_holo_source()
  }

  validate PreviewSourceContract {
    previewHoloSource : required
    shardId : required, string
    previewObjects : required
  }

  sink PreviewSource {
    type: "filesystem"
    path: ".tmp/holoshell/shard-preview.holo"
    method: "write"
    format: "holo"
    on_error: { action: "block_import", continue: false }
  }

  sink AssetIntakeEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-14/asset-shard-evidence-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "webhook"
    endpoint: "${env.HOLOMESH_BOARD_SEED_URL}"
    method: "POST"
    body: {
      source: "holoshell-human-os-frontier",
      workflow: "folder-to-playable-hololand-shard",
      manifest_hash: "${manifestHash}",
      import_allowed: false
    }
    on_error: { action: "log", continue: true }
  }
}
