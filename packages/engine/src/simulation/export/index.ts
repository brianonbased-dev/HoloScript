/**
 * Export — Data export layer for simulation results.
 *
 * Provides VTK, CSV, JSON, and STL export for post-processing in
 * ParaView, MATLAB, Python, and other scientific tools, plus
 * manufacturing-grade STL for 3D printing / CAD workflows.
 */

export {
  exportSTLBinary,
  exportSTLAscii,
  type STLBinaryOptions,
  type STLAsciiOptions,
} from './STLExporter';

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
