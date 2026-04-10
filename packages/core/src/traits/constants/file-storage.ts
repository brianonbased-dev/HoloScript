/**
 * File Storage Traits
 * @version 1.0.0
 */
export const FILE_STORAGE_TRAITS = [
  's3_upload', // S3-compatible object storage upload
  'file_system', // Local/remote file system operations
  'blob_store', // Binary large object storage
] as const;

export type FileStorageTraitName = (typeof FILE_STORAGE_TRAITS)[number];
