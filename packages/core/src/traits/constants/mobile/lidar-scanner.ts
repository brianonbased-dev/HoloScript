/**
 * LiDAR Scanner Traits (M.010.02a)
 *
 * Traits for iOS LiDAR-based room scanning and mesh capture.
 * Converts ARKit SceneReconstruction mesh data into .holo digital twins.
 *
 * Categories:
 *   - Scanning (enable LiDAR, capture modes)
 *   - Mesh Processing (classification, point cloud, real-time updates)
 *   - Output (mesh-to-holo conversion, export formats)
 *   - Depth (per-frame depth buffer access)
 */
export const LIDAR_SCANNER_TRAITS = [
  // --- Scanning ---
  'lidar_scan', // enable LiDAR scanning session
  'lidar_mesh_capture', // capture raw triangle mesh from LiDAR
  'lidar_realtime_mesh', // live-updating mesh during scan (ARMeshAnchor stream)

  // --- Mesh Processing ---
  'lidar_mesh_classification', // ARKit mesh classification (floor, wall, ceiling, table, seat, window, door)
  'lidar_point_cloud', // raw point cloud access (ARPointCloud)
  'lidar_mesh_simplify', // reduce mesh complexity for performance
  'lidar_mesh_smooth', // smooth captured mesh normals

  // --- Output ---
  'lidar_mesh_to_holo', // convert mesh to .holo scene graph with semantic labels
  'lidar_mesh_export', // export mesh as USDZ/OBJ/GLB

  // --- Depth ---
  'lidar_depth_map', // per-frame depth buffer (ARFrame.sceneDepth)
  'lidar_depth_confidence', // per-pixel confidence map for depth data
] as const;

export type LiDARScannerTraitName = (typeof LIDAR_SCANNER_TRAITS)[number];
