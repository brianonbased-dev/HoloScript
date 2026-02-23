/**
 * IPFS Provider Implementations
 *
 * Multi-provider support for IPFS uploads with Pinata, NFT.Storage, and Infura.
 * Each provider implements the IIPFSProvider interface for consistent usage.
 *
 * @module storage/IPFSProviders
 * @since 3.42.0
 */

import type {
  IIPFSProvider,
  IPFSFile,
  UploadOptions,
  PinStatus,
  PinInfo,
  IPFSUploadError,
  IPFSPinError,
} from './IPFSTypes.js';

/**
 * Pinata IPFS Provider
 *
 * Uses Pinata Cloud API for IPFS pinning and storage.
 * Docs: https://docs.pinata.cloud/api-pinning/pin-file
 */
export class PinataProvider implements IIPFSProvider {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl = 'https://api.pinata.cloud';

  constructor(apiKey: string, apiSecret?: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret || '';
  }

  async upload(files: IPFSFile[], options: UploadOptions): Promise<{ cid: string; size: number }> {
    const formData = new FormData();

    // Add files to form data
    for (const file of files) {
      const blob = new Blob([file.content]);
      formData.append('file', blob, file.path);
    }

    // Add metadata
    const metadata = {
      name: options.metadata?.name || options.name,
      keyvalues: options.metadata?.keyvalues || {},
    };
    formData.append('pinataMetadata', JSON.stringify(metadata));

    // Add pinning options
    const pinataOptions = {
      cidVersion: 1,
    };
    formData.append('pinataOptions', JSON.stringify(pinataOptions));

    const response = await fetch(`${this.baseUrl}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        'pinata_api_key': this.apiKey,
        'pinata_secret_api_key': this.apiSecret,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const data = await response.json();
    return {
      cid: data.IpfsHash,
      size: data.PinSize,
    };
  }

  async pin(cid: string, name?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pinning/pinByHash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pinata_api_key': this.apiKey,
        'pinata_secret_api_key': this.apiSecret,
      },
      body: JSON.stringify({
        hashToPin: cid,
        pinataMetadata: {
          name: name || cid,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata pin failed: ${error}`);
    }
  }

  async unpin(cid: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pinning/unpin/${cid}`, {
      method: 'DELETE',
      headers: {
        'pinata_api_key': this.apiKey,
        'pinata_secret_api_key': this.apiSecret,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata unpin failed: ${error}`);
    }
  }

  async getPinStatus(cid: string): Promise<PinStatus> {
    const response = await fetch(
      `${this.baseUrl}/data/pinList?hashContains=${cid}&status=pinned,pinning`,
      {
        headers: {
          'pinata_api_key': this.apiKey,
          'pinata_secret_api_key': this.apiSecret,
        },
      }
    );

    if (!response.ok) {
      return 'unpinned';
    }

    const data = await response.json();
    if (data.count === 0) {
      return 'unpinned';
    }

    const pin = data.rows[0];
    return pin.status === 'pinned' ? 'pinned' : 'pinning';
  }

  async listPins(): Promise<PinInfo[]> {
    const response = await fetch(`${this.baseUrl}/data/pinList?status=pinned`, {
      headers: {
        'pinata_api_key': this.apiKey,
        'pinata_secret_api_key': this.apiSecret,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list pins');
    }

    const data = await response.json();
    return data.rows.map((pin: any) => ({
      cid: pin.ipfs_pin_hash,
      name: pin.metadata?.name || pin.ipfs_pin_hash,
      size: pin.size,
      status: pin.status,
      created: new Date(pin.date_pinned),
    }));
  }

  async verifyCID(cid: string): Promise<boolean> {
    try {
      const status = await this.getPinStatus(cid);
      return status === 'pinned' || status === 'pinning';
    } catch {
      return false;
    }
  }
}

/**
 * NFT.Storage IPFS Provider
 *
 * Uses NFT.Storage API for free IPFS storage optimized for NFTs.
 * Docs: https://nft.storage/docs/client/js/
 */
export class NFTStorageProvider implements IIPFSProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.nft.storage';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async upload(files: IPFSFile[], options: UploadOptions): Promise<{ cid: string; size: number }> {
    const formData = new FormData();

    // Add files to form data
    for (const file of files) {
      const blob = new Blob([file.content]);
      formData.append('file', blob, file.path);
    }

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NFT.Storage upload failed: ${error}`);
    }

    const data = await response.json();
    return {
      cid: data.value.cid,
      size: data.value.size,
    };
  }

  async pin(cid: string, name?: string): Promise<void> {
    // NFT.Storage automatically pins all uploaded content
    // This is a no-op for compatibility
  }

  async unpin(cid: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${cid}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NFT.Storage unpin failed: ${error}`);
    }
  }

  async getPinStatus(cid: string): Promise<PinStatus> {
    const response = await fetch(`${this.baseUrl}/${cid}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      return 'unpinned';
    }

    const data = await response.json();
    return data.pin?.status === 'pinned' ? 'pinned' : 'pinning';
  }

  async listPins(): Promise<PinInfo[]> {
    const response = await fetch(`${this.baseUrl}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list pins');
    }

    const data = await response.json();
    return data.value.map((item: any) => ({
      cid: item.cid,
      name: item.name || item.cid,
      size: item.size,
      status: item.pin?.status || 'pinned',
      created: new Date(item.created),
    }));
  }

  async verifyCID(cid: string): Promise<boolean> {
    try {
      const status = await this.getPinStatus(cid);
      return status === 'pinned' || status === 'pinning';
    } catch {
      return false;
    }
  }
}

/**
 * Infura IPFS Provider
 *
 * Uses Infura IPFS API for enterprise-grade IPFS infrastructure.
 * Docs: https://docs.infura.io/infura/networks/ipfs
 */
export class InfuraProvider implements IIPFSProvider {
  private readonly projectId: string;
  private readonly projectSecret: string;
  private readonly baseUrl = 'https://ipfs.infura.io:5001/api/v0';

  constructor(projectId: string, projectSecret?: string) {
    this.projectId = projectId;
    this.projectSecret = projectSecret || '';
  }

  private getAuthHeader(): string {
    const auth = Buffer.from(`${this.projectId}:${this.projectSecret}`).toString('base64');
    return `Basic ${auth}`;
  }

  async upload(files: IPFSFile[], options: UploadOptions): Promise<{ cid: string; size: number }> {
    const formData = new FormData();

    // Add files to form data
    for (const file of files) {
      const blob = new Blob([file.content]);
      formData.append('file', blob, file.path);
    }

    const response = await fetch(`${this.baseUrl}/add?wrap-with-directory=true`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Infura upload failed: ${error}`);
    }

    // Infura returns newline-delimited JSON
    const text = await response.text();
    const lines = text.trim().split('\n');
    const lastLine = JSON.parse(lines[lines.length - 1]);

    let totalSize = 0;
    for (const line of lines) {
      const data = JSON.parse(line);
      totalSize += data.Size || 0;
    }

    return {
      cid: lastLine.Hash,
      size: totalSize,
    };
  }

  async pin(cid: string, name?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pin/add?arg=${cid}`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Infura pin failed: ${error}`);
    }
  }

  async unpin(cid: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pin/rm?arg=${cid}`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Infura unpin failed: ${error}`);
    }
  }

  async getPinStatus(cid: string): Promise<PinStatus> {
    const response = await fetch(`${this.baseUrl}/pin/ls?arg=${cid}`, {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      return 'unpinned';
    }

    const data = await response.json();
    return data.Keys && data.Keys[cid] ? 'pinned' : 'unpinned';
  }

  async listPins(): Promise<PinInfo[]> {
    const response = await fetch(`${this.baseUrl}/pin/ls`, {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list pins');
    }

    const data = await response.json();
    return Object.entries(data.Keys || {}).map(([cid, info]: [string, any]) => ({
      cid,
      name: cid,
      size: 0, // Infura doesn't provide size in pin list
      status: 'pinned' as PinStatus,
    }));
  }

  async verifyCID(cid: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/cat?arg=${cid}`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
