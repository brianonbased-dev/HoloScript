/**
 * Data Pipeline / ETL Traits
 * @version 1.0.0
 */
export const DATA_PIPELINE_TRAITS = [
  'etl',                // Extract-Transform-Load pipeline
  'batch_job',          // Batch processing job runner
  'data_transform',     // Data transformation / mapping
  'schema_migrate',     // Schema migration versioning
  'data_quality',       // Data quality validation rules
] as const;

export type DataPipelineTraitName = (typeof DATA_PIPELINE_TRAITS)[number];
