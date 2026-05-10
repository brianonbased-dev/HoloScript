declare module '@holoscript/core/storage' {
  export type IPFSProvider = 'pinata' | 'nft.storage' | 'infura';

  export interface FallbackProvider {
    provider: IPFSProvider;
    apiKey: string;
    apiSecret?: string;
  }

  export interface IPFSFile {
    path: string;
    content: Buffer | Uint8Array | string;
  }

  export interface IPFSServiceOptions {
    provider: IPFSProvider;
    apiKey: string;
    apiSecret?: string;
    fallbackProviders?: FallbackProvider[];
    enableCDN?: boolean;
    maxFileSize?: number;
    chunkSize?: number;
    maxRetries?: number;
    retryDelay?: number;
    gatewayUrl?: string;
  }

  export interface UploadOptions {
    name: string;
    files: IPFSFile[];
    pin?: boolean;
    metadata?: {
      name?: string;
      keyvalues?: Record<string, string>;
    };
  }

  export interface UploadResult {
    cid: string;
    uri: string;
    gatewayUrl: string;
    cdnUrl?: string;
    pinned: boolean;
    size: number;
    duration: number;
  }

  export class IPFSService {
    constructor(options: IPFSServiceOptions);
    upload(options: UploadOptions): Promise<UploadResult>;
  }
}
