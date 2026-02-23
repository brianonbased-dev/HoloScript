/**
 * IPFS Service Integration Examples
 *
 * Real-world examples showing how to integrate the IPFS service
 * with CreatorMonetization for NFT minting.
 *
 * @module storage/examples
 * @since 3.42.0
 */

import { IPFSService } from './IPFSService.js';
import type { UploadProgress } from './IPFSTypes.js';
import * as fs from 'fs/promises';

// =============================================================================
// Example 1: Basic NFT Asset Upload
// =============================================================================

async function uploadBasicNFT() {
  // Initialize IPFS service
  const ipfs = new IPFSService({
    provider: 'pinata',
    apiKey: process.env.PINATA_API_KEY!,
    apiSecret: process.env.PINATA_API_SECRET,
    enableCDN: true,
  });

  // Prepare NFT metadata
  const metadata = {
    name: 'Phoenix VRR Twin',
    description: 'An AI-powered digital twin with unique personality and voice',
    image: 'ipfs://[CID]/thumbnail.png',
    animation_url: 'ipfs://[CID]/scene.glb',
    attributes: [
      { trait_type: 'Type', value: 'VRR Twin' },
      { trait_type: 'AI Model', value: 'GPT-4' },
      { trait_type: 'Voice', value: 'ElevenLabs' },
    ],
  };

  // Upload to IPFS
  const result = await ipfs.upload({
    name: 'phoenix_vrr_twin',
    files: [
      { path: 'scene.glb', content: await fs.readFile('./assets/phoenix.glb') },
      { path: 'thumbnail.png', content: await fs.readFile('./assets/thumb.png') },
      { path: 'metadata.json', content: JSON.stringify(metadata, null, 2) },
    ],
    metadata: {
      name: 'Phoenix VRR Twin Assets',
      keyvalues: {
        creator: 'alice.eth',
        collection: 'VRR Twins',
        version: '1.0.0',
      },
    },
  });

  console.log('Upload complete!');
  console.log('CID:', result.cid);
  console.log('IPFS URI:', result.uri);
  console.log('Gateway URL:', result.gatewayUrl);
  console.log('CDN URL:', result.cdnUrl);
  console.log('Size:', (result.size / 1024 / 1024).toFixed(2), 'MB');
  console.log('Duration:', result.duration, 'ms');

  return result;
}

// =============================================================================
// Example 2: Large File Upload with Progress Tracking
// =============================================================================

async function uploadLargeAsset() {
  const ipfs = new IPFSService({
    provider: 'nft.storage',
    apiKey: process.env.NFT_STORAGE_KEY!,
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    maxFileSize: 100 * 1024 * 1024, // 100MB max
  });

  // Track upload progress
  const result = await ipfs.upload({
    name: 'large_scene',
    files: [
      { path: 'scene.glb', content: await fs.readFile('./assets/large_scene.glb') },
    ],
    onProgress: (progress: UploadProgress) => {
      const bar = '='.repeat(Math.floor(progress.percentage / 2));
      const spaces = ' '.repeat(50 - bar.length);
      console.log(
        `[${bar}${spaces}] ${progress.percentage.toFixed(1)}% - ${progress.currentFile}`
      );
    },
  });

  console.log('Large file uploaded successfully!');
  return result;
}

// =============================================================================
// Example 3: Multi-Provider Fallback
// =============================================================================

async function uploadWithFallback() {
  const ipfs = new IPFSService({
    provider: 'pinata',
    apiKey: process.env.PINATA_API_KEY!,
    apiSecret: process.env.PINATA_API_SECRET,
    fallbackProviders: [
      {
        provider: 'nft.storage',
        apiKey: process.env.NFT_STORAGE_KEY!,
      },
      {
        provider: 'infura',
        apiKey: process.env.INFURA_PROJECT_ID!,
        apiSecret: process.env.INFURA_SECRET,
      },
    ],
    maxRetries: 3,
    retryDelay: 1000,
  });

  // Upload will automatically retry and fallback on failure
  const result = await ipfs.upload({
    name: 'resilient_upload',
    files: [
      { path: 'asset.glb', content: await fs.readFile('./assets/asset.glb') },
    ],
  });

  console.log('Upload succeeded with resilient fallback!');
  return result;
}

// =============================================================================
// Example 4: Integration with CreatorMonetization
// =============================================================================

// This is a placeholder - actual CreatorMonetization integration
// would be imported from Agent 1's implementation
interface CreatorMonetization {
  mintNFT(params: {
    name: string;
    metadataUri: string;
    maxSupply: bigint;
    royaltyBps: number;
  }): Promise<{ tokenId: bigint; contractAddress: string; txHash: string }>;
}

async function uploadAndMintNFT(monetization: CreatorMonetization) {
  // Step 1: Initialize IPFS
  const ipfs = new IPFSService({
    provider: 'nft.storage',
    apiKey: process.env.NFT_STORAGE_KEY!,
    enableCDN: true,
  });

  // Step 2: Prepare assets
  const glbBuffer = await fs.readFile('./assets/phoenix.glb');
  const thumbnailBuffer = await fs.readFile('./assets/thumbnail.png');

  const metadata = {
    name: 'Phoenix VRR Twin',
    description: 'An AI-powered digital twin',
    image: '', // Will be updated after upload
    animation_url: '', // Will be updated after upload
    attributes: [
      { trait_type: 'Type', value: 'VRR Twin' },
      { trait_type: 'Rarity', value: 'Legendary' },
    ],
  };

  // Step 3: Upload to IPFS
  console.log('Uploading assets to IPFS...');
  const uploadResult = await ipfs.upload({
    name: 'phoenix_vrr_twin',
    files: [
      { path: 'scene.glb', content: glbBuffer },
      { path: 'thumbnail.png', content: thumbnailBuffer },
    ],
    onProgress: (p) => console.log(`Upload: ${p.percentage.toFixed(1)}%`),
  });

  // Step 4: Update metadata with IPFS URLs
  metadata.image = `${uploadResult.uri}/thumbnail.png`;
  metadata.animation_url = `${uploadResult.uri}/scene.glb`;

  // Step 5: Upload metadata
  const metadataResult = await ipfs.upload({
    name: 'phoenix_metadata',
    files: [{ path: 'metadata.json', content: JSON.stringify(metadata, null, 2) }],
  });

  console.log('Assets uploaded to IPFS!');
  console.log('CDN URL:', uploadResult.cdnUrl);
  console.log('Metadata URI:', metadataResult.uri);

  // Step 6: Mint NFT on blockchain
  console.log('Minting NFT on Zora...');
  const nftResult = await monetization.mintNFT({
    name: 'Phoenix VRR Twin',
    metadataUri: metadataResult.uri,
    maxSupply: 100n,
    royaltyBps: 1000, // 10%
  });

  console.log('NFT minted successfully!');
  console.log('Token ID:', nftResult.tokenId);
  console.log('Contract:', nftResult.contractAddress);
  console.log('Transaction:', nftResult.txHash);

  return {
    ipfs: uploadResult,
    metadata: metadataResult,
    nft: nftResult,
  };
}

// =============================================================================
// Example 5: Pin Management
// =============================================================================

async function managePins() {
  const ipfs = new IPFSService({
    provider: 'pinata',
    apiKey: process.env.PINATA_API_KEY!,
    apiSecret: process.env.PINATA_API_SECRET,
  });

  // List all pins
  console.log('Fetching all pins...');
  const pins = await ipfs.listPins();

  console.log(`Found ${pins.length} pins:`);
  for (const pin of pins) {
    console.log(`- ${pin.name}: ${pin.cid} (${(pin.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // Pin existing CID
  const cidToPin = 'QmExampleCID123';
  console.log(`Pinning ${cidToPin}...`);
  await ipfs.pin(cidToPin, 'important-asset');

  // Check pin status
  const status = await ipfs.getPinStatus(cidToPin);
  console.log(`Pin status: ${status}`);

  // Verify CID
  const isAccessible = await ipfs.verifyCID(cidToPin);
  console.log(`CID accessible: ${isAccessible}`);

  // Unpin old content (use with caution!)
  // await ipfs.unpin('QmOldCID');
}

// =============================================================================
// Example 6: Batch Upload Multiple NFTs
// =============================================================================

async function batchUploadNFTs() {
  const ipfs = new IPFSService({
    provider: 'pinata',
    apiKey: process.env.PINATA_API_KEY!,
    enableCDN: true,
  });

  const nftAssets = [
    { name: 'Phoenix', glb: 'phoenix.glb', thumb: 'phoenix.png' },
    { name: 'Dragon', glb: 'dragon.glb', thumb: 'dragon.png' },
    { name: 'Griffin', glb: 'griffin.glb', thumb: 'griffin.png' },
  ];

  const results = [];

  for (const asset of nftAssets) {
    console.log(`Uploading ${asset.name}...`);

    const result = await ipfs.upload({
      name: `vrr_twin_${asset.name.toLowerCase()}`,
      files: [
        { path: 'scene.glb', content: await fs.readFile(`./assets/${asset.glb}`) },
        { path: 'thumbnail.png', content: await fs.readFile(`./assets/${asset.thumb}`) },
      ],
    });

    results.push({
      name: asset.name,
      cid: result.cid,
      uri: result.uri,
      cdnUrl: result.cdnUrl,
    });

    console.log(`✓ ${asset.name} uploaded: ${result.cid}`);
  }

  // Save results
  await fs.writeFile('./upload-results.json', JSON.stringify(results, null, 2));

  console.log(`Batch upload complete! ${results.length} NFTs uploaded.`);
  return results;
}

// =============================================================================
// Example 7: Error Handling
// =============================================================================

import { IPFSUploadError, FileSizeExceededError, IPFSPinError } from './IPFSTypes.js';

async function uploadWithErrorHandling() {
  const ipfs = new IPFSService({
    provider: 'pinata',
    apiKey: process.env.PINATA_API_KEY!,
    maxFileSize: 50 * 1024 * 1024, // 50MB limit
  });

  try {
    const result = await ipfs.upload({
      name: 'test_upload',
      files: [
        { path: 'asset.glb', content: await fs.readFile('./assets/asset.glb') },
      ],
    });

    console.log('Upload successful:', result.cid);
  } catch (error) {
    if (error instanceof FileSizeExceededError) {
      console.error(`File too large: ${error.fileSize} bytes exceeds ${error.maxSize} bytes`);
      console.error('Consider reducing file size or increasing maxFileSize');
    } else if (error instanceof IPFSUploadError) {
      console.error(`Upload failed on provider ${error.provider}:`, error.message);
      console.error('Original error:', error.originalError);
    } else if (error instanceof IPFSPinError) {
      console.error(`Pin operation failed for ${error.cid}:`, error.message);
    } else {
      console.error('Unexpected error:', error);
    }

    throw error;
  }
}

// =============================================================================
// Example 8: Environment-Specific Configuration
// =============================================================================

function createIPFSService(environment: 'development' | 'production') {
  if (environment === 'development') {
    // Development: Use free NFT.Storage with CDN disabled
    return new IPFSService({
      provider: 'nft.storage',
      apiKey: process.env.NFT_STORAGE_KEY!,
      enableCDN: false,
      maxRetries: 1,
    });
  } else {
    // Production: Use Pinata with fallbacks and CDN
    return new IPFSService({
      provider: 'pinata',
      apiKey: process.env.PINATA_API_KEY!,
      apiSecret: process.env.PINATA_API_SECRET,
      fallbackProviders: [
        {
          provider: 'nft.storage',
          apiKey: process.env.NFT_STORAGE_KEY!,
        },
      ],
      enableCDN: true,
      maxRetries: 3,
      retryDelay: 1000,
    });
  }
}

// =============================================================================
// Export examples
// =============================================================================

export {
  uploadBasicNFT,
  uploadLargeAsset,
  uploadWithFallback,
  uploadAndMintNFT,
  managePins,
  batchUploadNFTs,
  uploadWithErrorHandling,
  createIPFSService,
};
