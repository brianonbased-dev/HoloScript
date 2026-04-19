/**
 * Optional reconstruction geometry passed through ExportManager.compilerOptions
 * so native exporters can embed HoloMap point samples (e.g. MCP holo_reconstruct_export).
 */
export interface HolomapPointCloudPayload {
  /** Base64 little-endian Float32 xyz triples (byte length = pointCount * 3 * 4). */
  positionsB64: string;
  /** Base64 uint8 rgb triples (byte length = pointCount * 3). */
  colorsB64: string;
  pointCount: number;
}
