/**
 * IPFS Storage Module
 *
 * Export all IPFS-related types, services, and utilities.
 *
 * @module storage
 * @since 3.42.0
 */

// Core service
export { IPFSService } from './IPFSService.js';

// Provider implementations
export {
  PinataProvider,
  NFTStorageProvider,
  InfuraProvider,
} from './IPFSProviders.js';

// Types and interfaces
export type {
  IPFSProvider,
  IPFSServiceOptions,
  FallbackProvider,
  IPFSFile,
  UploadProgress,
  UploadOptions,
  UploadResult,
  PinStatus,
  PinInfo,
  IIPFSProvider,
} from './IPFSTypes.js';

// Error classes
export {
  IPFSUploadError,
  IPFSPinError,
  FileSizeExceededError,
} from './IPFSTypes.js';
