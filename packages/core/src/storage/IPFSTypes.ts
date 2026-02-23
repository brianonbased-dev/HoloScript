/**
 * IPFS Service Type Definitions
 *
 * Type definitions for IPFS integration service with multi-provider support,
 * retry logic, and CDN caching for NFT asset uploads.
 *
 * @module storage/IPFSTypes
 * @since 3.42.0
 */

/**
 * Supported IPFS providers
 */
export type IPFSProvider = 'pinata' | 'nft.storage' | 'infura';

/**
 * Fallback provider configuration
 */
export interface FallbackProvider {
  /** Provider type */
  provider: IPFSProvider;
  /** API key for provider */
  apiKey: string;
  /** API secret (if required) */
  apiSecret?: string;
}

/**
 * IPFS service configuration options
 */
export interface IPFSServiceOptions {
  /** Primary provider */
  provider: IPFSProvider;
  /** API key for provider */
  apiKey: string;
  /** API secret (if required) */
  apiSecret?: string;
  /** Fallback providers */
  fallbackProviders?: FallbackProvider[];
  /** Enable CDN caching via Cloudflare */
  enableCDN?: boolean;
  /** Max file size (bytes) - default 100MB */
  maxFileSize?: number;
  /** Chunk size for large uploads (bytes) - default 5MB */
  chunkSize?: number;
  /** Max retry attempts - default 3 */
  maxRetries?: number;
  /** Initial retry delay (ms) - default 1000 */
  retryDelay?: number;
  /** Gateway URL override */
  gatewayUrl?: string;
}

/**
 * File to upload
 */
export interface IPFSFile {
  /** File path (e.g., 'scene.glb', 'thumbnail.png', 'metadata.json') */
  path: string;
  /** File content */
  content: Buffer | Uint8Array | string;
}

/**
 * Upload progress information
 */
export interface UploadProgress {
  /** Bytes uploaded so far */
  uploadedBytes: number;
  /** Total bytes to upload */
  totalBytes: number;
  /** Upload percentage (0-100) */
  percentage: number;
  /** Current file being uploaded */
  currentFile: string;
}

/**
 * Upload options
 */
export interface UploadOptions {
  /** Directory name */
  name: string;
  /** Files to upload */
  files: IPFSFile[];
  /** Pin to IPFS (permanent storage) - default true */
  pin?: boolean;
  /** Metadata for pinning */
  metadata?: {
    name?: string;
    keyvalues?: Record<string, string>;
  };
  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Upload result
 */
export interface UploadResult {
  /** IPFS CID (Content Identifier) */
  cid: string;
  /** IPFS URI (ipfs://...) */
  uri: string;
  /** IPFS Gateway URL (https://...) */
  gatewayUrl: string;
  /** CDN URL (if enabled) */
  cdnUrl?: string;
  /** Pin status */
  pinned: boolean;
  /** Upload size (bytes) */
  size: number;
  /** Upload duration (ms) */
  duration: number;
}

/**
 * Pin status
 */
export type PinStatus = 'pinned' | 'pinning' | 'unpinned';

/**
 * Pin information
 */
export interface PinInfo {
  /** IPFS CID */
  cid: string;
  /** Pin name */
  name: string;
  /** Size in bytes */
  size: number;
  /** Pin status */
  status: PinStatus;
  /** Creation timestamp */
  created?: Date;
}

/**
 * IPFS provider interface
 *
 * All provider implementations must conform to this interface
 */
export interface IIPFSProvider {
  /**
   * Upload files to IPFS
   */
  upload(files: IPFSFile[], options: UploadOptions): Promise<{ cid: string; size: number }>;

  /**
   * Pin existing CID
   */
  pin(cid: string, name?: string): Promise<void>;

  /**
   * Unpin CID
   */
  unpin(cid: string): Promise<void>;

  /**
   * Get pin status
   */
  getPinStatus(cid: string): Promise<PinStatus>;

  /**
   * List all pins
   */
  listPins(): Promise<PinInfo[]>;

  /**
   * Verify CID exists and is accessible
   */
  verifyCID(cid: string): Promise<boolean>;
}

/**
 * Error thrown when upload fails
 */
export class IPFSUploadError extends Error {
  constructor(
    message: string,
    public readonly provider: IPFSProvider,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'IPFSUploadError';
  }
}

/**
 * Error thrown when pin operation fails
 */
export class IPFSPinError extends Error {
  constructor(
    message: string,
    public readonly cid: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'IPFSPinError';
  }
}

/**
 * Error thrown when file size exceeds limit
 */
export class FileSizeExceededError extends Error {
  constructor(
    public readonly fileSize: number,
    public readonly maxSize: number
  ) {
    super(`File size ${fileSize} bytes exceeds maximum ${maxSize} bytes`);
    this.name = 'FileSizeExceededError';
  }
}
