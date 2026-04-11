/**
 * Export — Data export layer for simulation results.
 *
 * Provides VTK, CSV, and JSON export for post-processing in
 * ParaView, MATLAB, Python, and other scientific tools.
 */

export {
  exportStructuredPoints,
  exportUnstructuredGrid,
  exportPolyData,
  type StructuredPointsOptions,
  type UnstructuredGridOptions,
} from './VTKExporter';

export {
  exportConvergenceHistory,
  exportScalarFieldCSV,
  exportTable,
  exportMaterialTable,
  type ScalarFieldCSVOptions,
  type MaterialRow,
} from './CSVExporter';

export {
  createMetadata,
  validateMetadata,
  serializeMetadata,
  deserializeMetadata,
  type SimulationMetadata,
} from './MetadataSchema';
