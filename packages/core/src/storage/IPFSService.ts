/**
 * IPFS Integration Service
 *
 * Production-ready IPFS service for uploading NFT assets with multi-provider support,
 * retry logic, chunked uploads, and CDN caching.
 *
 * Features:
 * - Multi-provider support (Pinata, NFT.Storage, Infura)
 * - Automatic fallback to backup providers
 * - Chunked uploads for large files
 * - Retry logic with exponential backoff
 * - CDN integration via Cloudflare IPFS gateway
 * - Progress tracking
 * - CID verification
 *
 * @module storage/IPFSService
 * @since 3.42.0
 */

import type {
  IPFSServiceOptions,
  UploadOptions,
  UploadResult,
  UploadProgress,
  PinStatus,
  PinInfo,
  IPFSFile,
  IIPFSProvider,
  IPFSProvider,
} from './IPFSTypes.js';
import { IPFSUploadError, IPFSPinError, FileSizeExceededError } from './IPFSTypes.js';
import { PinataProvider, NFTStorageProvider, InfuraProvider } from './IPFSProviders.js';

/**
 * IPFS Service for NFT asset uploads
 *
 * @example
 * ```typescript
 * const ipfs = new IPFSService({
 *   provider: 'pinata',
 *   apiKey: process.env.PINATA_API_KEY,
 *   fallbackProviders: [
 *     { provider: 'nft.storage', apiKey: process.env.NFT_STORAGE_KEY }
 *   ],
 *   enableCDN: true
 * });
 *
 * const result = await ipfs.upload({
 *   name: 'phoenix_vrr_twin',
 *   files: [
 *     { path: 'scene.glb', content: glbBuffer },
 *     { path: 'thumbnail.png', content: pngBuffer },
 *     { path: 'metadata.json', content: JSON.stringify(metadata) }
 *   ],
 *   onProgress: (progress) => {
 *     console.log(`${progress.percentage}% - ${progress.currentFile}`);
 *   }
 * });
 * ```
 */
export class IPFSService {
  private readonly primaryProvider: IIPFSProvider;
  private readonly fallbackProviders: IIPFSProvider[] = [];
  private readonly options: Required<IPFSServiceOptions>;
  private readonly defaultGateway = 'https://ipfs.io/ipfs';
  private readonly cdnGateway = 'https://cloudflare-ipfs.com/ipfs';

  constructor(options: IPFSServiceOptions) {
    // Set default options
    this.options = {
      ...options,
      fallbackProviders: options.fallbackProviders || [],
      enableCDN: options.enableCDN ?? true,
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
      chunkSize: options.chunkSize || 5 * 1024 * 1024, // 5MB
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      gatewayUrl: options.gatewayUrl || this.defaultGateway,
      apiSecret: options.apiSecret,
    } as Required<IPFSServiceOptions>;

    // Initialize primary provider
    this.primaryProvider = this.createProvider(
      this.options.provider,
      this.options.apiKey,
      this.options.apiSecret
    );

    // Initialize fallback providers
    for (const fallback of this.options.fallbackProviders) {
      const provider = this.createProvider(
        fallback.provider,
        fallback.apiKey,
        fallback.apiSecret
      );
      this.fallbackProviders.push(provider);
    }
  }

  /**
   * Create provider instance
   */
  private createProvider(
    type: IPFSProvider,
    apiKey: string,
    apiSecret?: string
  ): IIPFSProvider {
    switch (type) {
      case 'pinata':
        return new PinataProvider(apiKey, apiSecret);
      case 'nft.storage':
        return new NFTStorageProvider(apiKey);
      case 'infura':
        return new InfuraProvider(apiKey, apiSecret);
      default:
        throw new Error(`Unknown IPFS provider: ${type}`);
    }
  }

  /**
   * Upload files to IPFS
   *
   * Returns CID and gateway URLs. Automatically retries on failure and falls back
   * to backup providers if primary fails.
   *
   * @param options Upload options
   * @returns Upload result with CID and URLs
   * @throws {FileSizeExceededError} If file size exceeds maximum
   * @throws {IPFSUploadError} If upload fails on all providers
   */
  async upload(options: UploadOptions): Promise<UploadResult> {
    const startTime = Date.now();

    // Validate file sizes
    const totalSize = options.files.reduce((sum, file) => {
      const size = file.content instanceof Buffer || file.content instanceof Uint8Array
        ? file.content.length
        : Buffer.from(file.content).length;
      return sum + size;
    }, 0);

    if (totalSize > this.options.maxFileSize) {
      throw new FileSizeExceededError(totalSize, this.options.maxFileSize);
    }

    // Determine if chunked upload is needed
    const needsChunking = totalSize > this.options.chunkSize;

    try {
      // Try primary provider first
      const result = await this.uploadWithRetry(
        this.primaryProvider,
        this.options.provider,
        options,
        needsChunking
      );

      return this.buildUploadResult(result.cid, result.size, startTime, options.pin ?? true);
    } catch (primaryError) {
      console.warn(`Primary provider ${this.options.provider} failed:`, primaryError);

      // Try fallback providers
      for (let i = 0; i < this.fallbackProviders.length; i++) {
        const provider = this.fallbackProviders[i];
        const providerType = this.options.fallbackProviders[i].provider;

        try {
          console.log(`Trying fallback provider: ${providerType}`);
          const result = await this.uploadWithRetry(provider, providerType, options, needsChunking);
          return this.buildUploadResult(result.cid, result.size, startTime, options.pin ?? true);
        } catch (error) {
          console.warn(`Fallback provider ${providerType} failed:`, error);
          continue;
        }
      }

      // All providers failed
      throw new IPFSUploadError(
        'Upload failed on all providers',
        this.options.provider,
        primaryError as Error
      );
    }
  }

  /**
   * Upload with retry logic
   */
  private async uploadWithRetry(
    provider: IIPFSProvider,
    providerType: IPFSProvider,
    options: UploadOptions,
    needsChunking: boolean
  ): Promise<{ cid: string; size: number }> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        if (needsChunking) {
          return await this.uploadChunked(provider, options);
        } else {
          // Call progress callback for small uploads too
          if (options.onProgress) {
            const totalSize = options.files.reduce((sum, file) => {
              const size = file.content instanceof Buffer || file.content instanceof Uint8Array
                ? file.content.length
                : Buffer.from(file.content).length;
              return sum + size;
            }, 0);

            let uploadedBytes = 0;
            for (const file of options.files) {
              const size = file.content instanceof Buffer || file.content instanceof Uint8Array
                ? file.content.length
                : Buffer.from(file.content).length;
              uploadedBytes += size;

              options.onProgress({
                uploadedBytes,
                totalBytes: totalSize,
                percentage: (uploadedBytes / totalSize) * 100,
                currentFile: file.path,
              });
            }
          }

          return await provider.upload(options.files, options);
        }
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s, ...
          const delay = this.options.retryDelay * Math.pow(2, attempt);
          console.log(`Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    throw new IPFSUploadError(
      `Upload failed after ${this.options.maxRetries} attempts`,
      providerType,
      lastError
    );
  }

  /**
   * Upload large files in chunks
   *
   * Breaks large files into smaller chunks, uploads them separately,
   * and combines them into a single IPFS directory.
   */
  private async uploadChunked(
    provider: IIPFSProvider,
    options: UploadOptions
  ): Promise<{ cid: string; size: number }> {
    const chunks: IPFSFile[] = [];
    let totalSize = 0;
    let uploadedBytes = 0;

    // Process each file
    for (const file of options.files) {
      const content =
        file.content instanceof Buffer || file.content instanceof Uint8Array
          ? file.content
          : Buffer.from(file.content);

      const fileSize = content.length;
      totalSize += fileSize;

      // Split into chunks if needed
      if (fileSize > this.options.chunkSize) {
        const numChunks = Math.ceil(fileSize / this.options.chunkSize);

        for (let i = 0; i < numChunks; i++) {
          const start = i * this.options.chunkSize;
          const end = Math.min(start + this.options.chunkSize, fileSize);
          const chunk = content.slice(start, end);

          chunks.push({
            path: `${file.path}.chunk${i}`,
            content: chunk,
          });

          // Report progress
          uploadedBytes += chunk.length;
          if (options.onProgress) {
            options.onProgress({
              uploadedBytes,
              totalBytes: totalSize,
              percentage: (uploadedBytes / totalSize) * 100,
              currentFile: file.path,
            });
          }
        }
      } else {
        chunks.push(file);
        uploadedBytes += fileSize;

        if (options.onProgress) {
          options.onProgress({
            uploadedBytes,
            totalBytes: totalSize,
            percentage: (uploadedBytes / totalSize) * 100,
            currentFile: file.path,
          });
        }
      }
    }

    // Upload all chunks
    return await provider.upload(chunks, options);
  }

  /**
   * Build upload result
   */
  private buildUploadResult(
    cid: string,
    size: number,
    startTime: number,
    pinned: boolean
  ): UploadResult {
    const gatewayUrl = `${this.options.gatewayUrl}/${cid}`;
    const cdnUrl = this.options.enableCDN ? `${this.cdnGateway}/${cid}` : undefined;

    return {
      cid,
      uri: `ipfs://${cid}`,
      gatewayUrl,
      cdnUrl,
      pinned,
      size,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Pin existing CID to IPFS
   *
   * @param cid IPFS CID to pin
   * @param name Optional name for the pin
   * @throws {IPFSPinError} If pin operation fails
   */
  async pin(cid: string, name?: string): Promise<void> {
    try {
      await this.primaryProvider.pin(cid, name);
    } catch (error) {
      throw new IPFSPinError(`Failed to pin CID ${cid}`, cid, error as Error);
    }
  }

  /**
   * Unpin CID from IPFS
   *
   * @param cid IPFS CID to unpin
   * @throws {IPFSPinError} If unpin operation fails
   */
  async unpin(cid: string): Promise<void> {
    try {
      await this.primaryProvider.unpin(cid);
    } catch (error) {
      throw new IPFSPinError(`Failed to unpin CID ${cid}`, cid, error as Error);
    }
  }

  /**
   * Get pin status for CID
   *
   * @param cid IPFS CID to check
   * @returns Pin status ('pinned', 'pinning', or 'unpinned')
   */
  async getPinStatus(cid: string): Promise<PinStatus> {
    return await this.primaryProvider.getPinStatus(cid);
  }

  /**
   * Verify CID exists and is accessible
   *
   * @param cid IPFS CID to verify
   * @returns True if CID is accessible
   */
  async verifyCID(cid: string): Promise<boolean> {
    return await this.primaryProvider.verifyCID(cid);
  }

  /**
   * Get file from IPFS
   *
   * @param cid IPFS CID
   * @param path Optional path within directory
   * @returns File content as Uint8Array
   */
  async get(cid: string, path?: string): Promise<Uint8Array> {
    const url = path ? `${this.options.gatewayUrl}/${cid}/${path}` : `${this.options.gatewayUrl}/${cid}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CID ${cid}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * List all pins for account
   *
   * @returns Array of pin information
   */
  async listPins(): Promise<PinInfo[]> {
    return await this.primaryProvider.listPins();
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get CDN URL for CID
   *
   * @param cid IPFS CID
   * @returns CDN URL if enabled, otherwise gateway URL
   */
  getCDNUrl(cid: string): string {
    return this.options.enableCDN
      ? `${this.cdnGateway}/${cid}`
      : `${this.options.gatewayUrl}/${cid}`;
  }

  /**
   * Get gateway URL for CID
   *
   * @param cid IPFS CID
   * @returns Gateway URL
   */
  getGatewayUrl(cid: string): string {
    return `${this.options.gatewayUrl}/${cid}`;
  }

  /**
   * Get IPFS URI for CID
   *
   * @param cid IPFS CID
   * @returns IPFS URI (ipfs://...)
   */
  getIPFSUri(cid: string): string {
    return `ipfs://${cid}`;
  }
}
