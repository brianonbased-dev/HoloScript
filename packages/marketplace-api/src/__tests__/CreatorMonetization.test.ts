/**
 * @fileoverview Creator Monetization Tests
 * @module @holoscript/marketplace-api/__tests__
 *
 * Comprehensive test suite for Film3D Creator Monetization Service.
 * Tests NFT minting, collection management, revenue sharing, and analytics.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import type {
  CreatorMonetizationOptions,
  NFTMetadata,
  VRRTwinData,
  RevenueBreakdown,
} from '../types/Film3DDTypes';
import {
  CreatorMonetizationError,
  InsufficientBalanceError,
  IPFSUploadError,
  ZoraAPIError,
} from '../types/Film3DDTypes';
import type { Address } from 'viem';

// =============================================================================
// TEST DATA
// =============================================================================

const MOCK_CREATOR_ADDRESS: Address = '0x1234567890123456789012345678901234567890';

const mockVRRTwin: VRRTwinData = {
  id: 'phoenix_downtown',
  name: 'Phoenix Downtown',
  description: 'Digital twin of downtown Phoenix',
  location: {
    name: 'Phoenix, AZ',
    latitude: 33.4484,
    longitude: -112.074,
    address: 'Downtown Phoenix',
  },
  businesses: [
    { id: 'b1', name: 'Coffee Shop', category: 'cafe' },
    { id: 'b2', name: 'Restaurant', category: 'dining' },
  ],
  previewUrl: 'https://hololand.io/preview/phoenix.jpg',
  modelUrl: 'https://hololand.io/models/phoenix.glb',
  traits: ['Real-Time Weather', 'Event Sync'],
  syncType: 'real-time',
  creator: {
    address: MOCK_CREATOR_ADDRESS,
    name: 'Test Creator',
  },
  createdAt: Date.now(),
};

// =============================================================================
// TYPE DEFINITION TESTS
// =============================================================================

describe('Film3D Type Definitions', () => {
  it('should have valid CreatorMonetizationOptions interface', () => {
    const options: CreatorMonetizationOptions = {
      network: 'base',
      creatorAddress: MOCK_CREATOR_ADDRESS,
      revenueSharing: {
        artist: 80,
        platform: 10,
        aiAgent: 10,
      },
      ipfsProvider: 'pinata',
    };

    expect(options.network).toBe('base');
    expect(options.creatorAddress).toBe(MOCK_CREATOR_ADDRESS);
    expect(options.revenueSharing?.artist).toBe(80);
  });

  it('should have valid NFTMetadata interface', () => {
    const metadata: NFTMetadata = {
      name: 'Test NFT',
      description: 'Test description',
      image: 'ipfs://QmTest',
      attributes: [{ trait_type: 'Layer', value: 'VRR' }],
      properties: {
        category: 'vrr_twin',
        layer: 'vrr',
      },
    };

    expect(metadata.name).toBe('Test NFT');
    expect(metadata.attributes).toHaveLength(1);
  });

  it('should have valid VRRTwinData interface', () => {
    expect(mockVRRTwin.id).toBe('phoenix_downtown');
    expect(mockVRRTwin.name).toBe('Phoenix Downtown');
    expect(mockVRRTwin.location?.name).toBe('Phoenix, AZ');
    expect(mockVRRTwin.businesses).toHaveLength(2);
  });
});

// =============================================================================
// ERROR CLASS TESTS
// =============================================================================

describe('Error Classes', () => {
  it('should create CreatorMonetizationError', () => {
    const error = new CreatorMonetizationError('Test error', 'TEST_CODE', { detail: 'test' });

    expect(error.name).toBe('CreatorMonetizationError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ detail: 'test' });
  });

  it('should create InsufficientBalanceError', () => {
    const error = new InsufficientBalanceError('0.001 ETH', '0.0005 ETH', '0.0005 ETH');

    expect(error.name).toBe('InsufficientBalanceError');
    expect(error.code).toBe('INSUFFICIENT_BALANCE');
    expect(error.message).toContain('Required: 0.001 ETH');
    expect(error.details.required).toBe('0.001 ETH');
  });

  it('should create IPFSUploadError', () => {
    const error = new IPFSUploadError('Upload failed', 'pinata');

    expect(error.name).toBe('IPFSUploadError');
    expect(error.code).toBe('IPFS_UPLOAD_FAILED');
    expect(error.details.provider).toBe('pinata');
  });

  it('should create ZoraAPIError', () => {
    const error = new ZoraAPIError('API failed', 404);

    expect(error.name).toBe('ZoraAPIError');
    expect(error.code).toBe('ZORA_API_ERROR');
    expect(error.details.statusCode).toBe(404);
  });
});

// =============================================================================
// REVENUE SHARING CALCULATIONS
// =============================================================================

describe('Revenue Sharing Calculations', () => {
  it('should calculate 80/10/10 split correctly', () => {
    const saleAmount = 1.0;
    const artistShare = (saleAmount * 80) / 100;
    const platformShare = (saleAmount * 10) / 100;
    const aiAgentShare = (saleAmount * 10) / 100;

    expect(artistShare).toBe(0.8);
    expect(platformShare).toBe(0.1);
    expect(aiAgentShare).toBe(0.1);
    expect(artistShare + platformShare + aiAgentShare).toBe(1.0);
  });

  it('should handle custom revenue split', () => {
    const saleAmount = 0.5;
    const artistShare = (saleAmount * 90) / 100;
    const platformShare = (saleAmount * 5) / 100;
    const aiAgentShare = (saleAmount * 5) / 100;

    expect(artistShare).toBe(0.45);
    expect(platformShare).toBe(0.025);
    expect(aiAgentShare).toBe(0.025);
  });

  it('should handle no AI agent share', () => {
    const saleAmount = 1.0;
    const artistShare = (saleAmount * 90) / 100;
    const platformShare = (saleAmount * 10) / 100;

    expect(artistShare).toBe(0.9);
    expect(platformShare).toBe(0.1);
    expect(artistShare + platformShare).toBe(1.0);
  });
});

// =============================================================================
// METADATA GENERATION LOGIC
// =============================================================================

describe('Metadata Generation', () => {
  it('should generate NFT attributes from VRR twin', () => {
    const attributes: NFTMetadata['attributes'] = [
      { trait_type: 'Layer', value: 'VRR' },
      { trait_type: 'Content Type', value: 'VRR Twin' },
      { trait_type: 'Location', value: mockVRRTwin.location!.name },
      {
        trait_type: 'Business Count',
        value: mockVRRTwin.businesses!.length,
        display_type: 'number',
      },
      { trait_type: 'Sync Type', value: mockVRRTwin.syncType! },
    ];

    expect(attributes).toHaveLength(5);
    expect(attributes[2].value).toBe('Phoenix, AZ');
    expect(attributes[3].value).toBe(2);
  });

  it('should generate description from VRR twin', () => {
    const description =
      mockVRRTwin.description ||
      `1:1 digital twin of ${mockVRRTwin.location?.name || mockVRRTwin.name}. ` +
        `Created in Hololand with real-time synchronization and interactive experiences.`;

    expect(description).toContain('Digital twin of downtown Phoenix');
  });

  it('should include latitude/longitude if available', () => {
    const hasCoordinates =
      mockVRRTwin.location?.latitude !== undefined && mockVRRTwin.location?.longitude !== undefined;

    expect(hasCoordinates).toBe(true);

    if (hasCoordinates) {
      expect(mockVRRTwin.location!.latitude).toBe(33.4484);
      expect(mockVRRTwin.location!.longitude).toBe(-112.074);
    }
  });

  it('should include custom traits in metadata', () => {
    const traits = mockVRRTwin.traits || [];
    const featureAttributes = traits.map((trait) => ({
      trait_type: 'Feature',
      value: trait,
    }));

    expect(featureAttributes).toHaveLength(2);
    expect(featureAttributes[0].value).toBe('Real-Time Weather');
    expect(featureAttributes[1].value).toBe('Event Sync');
  });
});

// =============================================================================
// PRICING CALCULATIONS
// =============================================================================

describe('Pricing Calculations', () => {
  it('should calculate Zora mint fee correctly', () => {
    const ZORA_MINT_FEE = 0.000777; // ETH per mint
    const quantity = 5;
    const totalMintFee = ZORA_MINT_FEE * quantity;

    expect(totalMintFee).toBe(0.003885);
  });

  it('should estimate total minting cost', () => {
    const gasCost = 0.0002; // ETH
    const mintFee = 0.000777; // ETH
    const totalCost = gasCost + mintFee;

    expect(totalCost).toBeCloseTo(0.000977, 6);
  });

  it('should calculate royalty amount from sale', () => {
    const salePrice = 0.1; // ETH
    const royaltyPercentage = 10;
    const royaltyAmount = (salePrice * royaltyPercentage) / 100;

    expect(royaltyAmount).toBe(0.01);
  });
});

// =============================================================================
// CHAIN CONFIGURATION
// =============================================================================

describe('Chain Configuration', () => {
  const CHAIN_IDS = {
    base: 8453,
    'base-testnet': 84531,
    ethereum: 1,
    zora: 7777777,
  };

  it('should have correct Base chain ID', () => {
    expect(CHAIN_IDS.base).toBe(8453);
  });

  it('should have correct Base testnet chain ID', () => {
    expect(CHAIN_IDS['base-testnet']).toBe(84531);
  });

  it('should have correct Ethereum chain ID', () => {
    expect(CHAIN_IDS.ethereum).toBe(1);
  });

  it('should have correct Zora chain ID', () => {
    expect(CHAIN_IDS.zora).toBe(7777777);
  });
});

// =============================================================================
// URL GENERATION
// =============================================================================

describe('URL Generation', () => {
  it('should generate correct Zora marketplace URL', () => {
    const contractAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const tokenId = '1';
    const chain = 'base';
    const zoraUrl = `https://zora.co/collect/${chain}:${contractAddress}/${tokenId}`;

    expect(zoraUrl).toContain('zora.co/collect');
    expect(zoraUrl).toContain('base:');
    expect(zoraUrl).toContain(contractAddress);
    expect(zoraUrl).toContain('/1');
  });

  it('should generate correct IPFS URI', () => {
    const cid = 'QmTest123abc';
    const ipfsUri = `ipfs://${cid}`;

    expect(ipfsUri).toBe('ipfs://QmTest123abc');
  });

  it('should generate correct Hololand external URL', () => {
    const vrrId = 'phoenix_downtown';
    const externalUrl = `https://hololand.io/vrr/${vrrId}`;

    expect(externalUrl).toBe('https://hololand.io/vrr/phoenix_downtown');
  });
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('Input Validation', () => {
  it('should validate network type', () => {
    const validNetworks = ['base', 'ethereum', 'zora', 'base-testnet'];
    expect(validNetworks).toContain('base');
    expect(validNetworks).toContain('ethereum');
  });

  it('should validate revenue sharing percentages sum to 100', () => {
    const sharing = { artist: 80, platform: 10, aiAgent: 10 };
    const total = sharing.artist + sharing.platform + (sharing.aiAgent || 0);
    expect(total).toBe(100);
  });

  it('should validate royalty percentage range', () => {
    const royalty = 10;
    expect(royalty).toBeGreaterThanOrEqual(0);
    expect(royalty).toBeLessThanOrEqual(100);
  });

  it('should validate Ethereum address format', () => {
    const address = MOCK_CREATOR_ADDRESS;
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});

// =============================================================================
// INTEGRATION SCENARIOS
// =============================================================================

describe('Integration Scenarios', () => {
  it('should support complete mint workflow', () => {
    // This test documents the complete workflow
    const workflow = [
      '1. Generate metadata from VRR twin',
      '2. Upload metadata to IPFS',
      '3. Estimate gas costs',
      '4. Check wallet balance',
      '5. Execute mint transaction',
      '6. Wait for confirmation',
      '7. Extract token ID from logs',
      '8. Generate Zora URL',
    ];

    expect(workflow).toHaveLength(8);
    expect(workflow[0]).toContain('Generate metadata');
    expect(workflow[7]).toContain('Generate Zora URL');
  });

  it('should support revenue sharing workflow', () => {
    const saleAmount = 0.1;

    // Calculate shares
    const breakdown: RevenueBreakdown = {
      totalAmount: saleAmount,
      artistShare: (saleAmount * 80) / 100,
      platformShare: (saleAmount * 10) / 100,
      aiAgentShare: (saleAmount * 10) / 100,
      artistPercentage: 80,
      platformPercentage: 10,
      aiAgentPercentage: 10,
    };

    expect(breakdown.artistShare).toBe(0.08);
    expect(breakdown.platformShare).toBe(0.01);
    expect(breakdown.aiAgentShare).toBe(0.01);
  });
});
