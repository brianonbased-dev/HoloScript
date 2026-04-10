/**
 * iOS Object Capture Traits (M.010.10)
 *
 * Photogrammetry walk-around scanning to textured .holo 3D model.
 * Apple Object Capture API. iPhone 12+ with LiDAR for guided capture.
 *
 * Categories:
 *   - Capture (scan, guide overlay, feedback)
 *   - Processing (mesh, textures, PBR materials)
 *   - Output (export to .holo, USDZ)
 */
export const IOS_OBJECT_CAPTURE_TRAITS = [
  'object_capture', // enable Object Capture session
  'object_capture_guide', // guided capture overlay (orbit path, coverage indicator)
  'object_capture_feedback', // real-time quality feedback during scan
  'photogrammetry_scan', // photogrammetry reconstruction pipeline
  'pbr_texture_extract', // extract PBR materials (diffuse, normal, roughness, metallic)
  'object_capture_lod', // generate LOD levels (preview, reduced, medium, full, raw)
  'object_capture_to_holo', // convert captured object to .holo asset
  'object_capture_export_usdz', // export as USDZ for Quick Look
] as const;

export type IOSObjectCaptureTraitName = (typeof IOS_OBJECT_CAPTURE_TRAITS)[number];
