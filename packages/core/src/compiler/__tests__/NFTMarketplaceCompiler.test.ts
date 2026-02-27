/**
 * NFT Marketplace Compiler Test Suite
 *
 * Comprehensive tests for NFT marketplace DSL compilation to Solidity
 */

import { describe, it, expect } from 'vitest';
import { NFTMarketplaceCompiler } from '../NFTMarketplaceCompiler';
import { GasOptimizationAnalyzer, ANALYZER_PRESETS } from '../GasOptimizationAnalyzer';
import type { NFTMarketplaceAST } from '../../parser/NFTMarketplaceTypes';

describe('NFTMarketplaceCompiler', () => {
  describe('Basic Compilation', () => {
    it('should compile a basic ERC-1155 contract', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [
          {
            network: 'base',
            chainId: 8453,
            testnet: false,
          },
        ],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            maxSupply: 1000,
            mintable: true,
            burnable: true,
            pausable: true,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.contracts).toHaveLength(1);
      expect(output.contracts[0].name).toBe('TestNFT');
      expect(output.contracts[0].solidity).toContain('contract TestNFT');
      expect(output.contracts[0].solidity).toContain('ERC1155');
      expect(output.contracts[0].solidity).toContain('SPDX-License-Identifier: MIT');
    });

    it('should include ERC-2981 royalty support', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        royalties: {
          defaultRoyalty: {
            receiver: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            bps: 500,
          },
          perTokenRoyalty: true,
          maxRoyaltyBps: 1000,
          upgradeable: false,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      const solidity = output.contracts[0].solidity;
      expect(solidity).toContain('ERC2981');
      expect(solidity).toContain('royaltyInfo');
      expect(solidity).toContain('setTokenRoyalty');
      expect(solidity).toContain('_setDefaultRoyalty');
    });

    it('should generate lazy minting functions', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        lazyMinting: {
          enabled: true,
          voucherVersion: '1',
          signingDomain: 'TestNFT',
          expirationTime: 86400,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      const solidity = output.contracts[0].solidity;
      expect(solidity).toContain('struct NFTVoucher');
      expect(solidity).toContain('function redeem');
      expect(solidity).toContain('ECDSA.recover');
      expect(solidity).toContain('_usedVouchers');
      expect(solidity).toContain('VoucherRedeemed');
    });

    it('should implement access control', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            accessControl: {
              roles: [
                {
                  name: 'MINTER',
                  permissions: ['mint', 'setURI'],
                },
                {
                  name: 'ADMIN',
                  permissions: ['pause', 'withdraw'],
                },
              ],
              defaultAdmin: 'deployer',
            },
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      const solidity = output.contracts[0].solidity;
      expect(solidity).toContain('AccessControl');
      expect(solidity).toContain('MINTER_ROLE');
      expect(solidity).toContain('ADMIN_ROLE');
      expect(solidity).toContain('_grantRole');
      expect(solidity).toContain('hasRole');
    });
  });

  describe('Gas Optimization', () => {
    it('should use custom errors instead of require strings', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        gasOptimization: {
          storageOptimization: true,
          batchOperations: true,
          enableStaticAnalysis: true,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      const solidity = output.contracts[0].solidity;
      expect(solidity).toContain('error MaxSupplyReached');
      expect(solidity).toContain('error InvalidVoucher');
      expect(solidity).toContain('error Unauthorized');
      expect(solidity).toContain('revert');
    });

    it('should optimize storage layout with packed variables', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            maxSupply: 10000,
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        gasOptimization: {
          storageOptimization: true,
          batchOperations: true,
          enableStaticAnalysis: true,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      const solidity = output.contracts[0].solidity;
      expect(solidity).toContain('uint96 private _nextTokenId');
      expect(solidity).toContain('uint96 private _totalMinted');
      expect(solidity).toMatch(/Storage slot \d+-\d+: Packed state variables/);
    });

    it('should generate gas analysis report', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        gasOptimization: {
          storageOptimization: true,
          batchOperations: true,
          enableStaticAnalysis: true,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.gasAnalysis).toBeDefined();
      expect(output.gasAnalysis?.recommendations).toBeInstanceOf(Array);
      expect(output.gasAnalysis?.recommendations.length).toBeGreaterThan(0);
      expect(output.gasAnalysis?.storageLayout).toBeInstanceOf(Array);
    });
  });

  describe('Marketplace Integration', () => {
    it('should compile marketplace contract with royalty support', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        marketplace: {
          enableListing: true,
          enableAuction: true,
          enableOffers: true,
          platformFee: 250,
          feeRecipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        },
        royalties: {
          defaultRoyalty: {
            receiver: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            bps: 500,
          },
          upgradeable: false,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.contracts).toHaveLength(2);
      const marketplaceContract = output.contracts.find(c => c.name.includes('Marketplace'));
      expect(marketplaceContract).toBeDefined();

      const solidity = marketplaceContract!.solidity;
      expect(solidity).toContain('contract NFTMarketplace');
      expect(solidity).toContain('struct Listing');
      expect(solidity).toContain('function createListing');
      expect(solidity).toContain('function buy');
      expect(solidity).toContain('royaltyInfo');
      expect(solidity).toContain('platformFee');
    });
  });

  describe('Multi-Chain Deployment', () => {
    it('should generate deployment scripts for multiple chains', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [
          { network: 'base', chainId: 8453, testnet: false },
          { network: 'polygon', chainId: 137, testnet: false },
        ],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.deploymentScripts).toHaveLength(2);
      expect(output.deploymentScripts[0].chain).toBe('base');
      expect(output.deploymentScripts[1].chain).toBe('polygon');

      expect(output.deploymentScripts[0].script).toContain('hardhat');
      expect(output.deploymentScripts[0].script).toContain('ethers');
      expect(output.deploymentScripts[0].script).toContain('deploy');
    });

    it('should estimate deployment costs', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [
          { network: 'base', chainId: 8453, testnet: false },
          { network: 'polygon', chainId: 137, testnet: false },
        ],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.estimatedDeploymentCost).toBeDefined();
      expect(output.estimatedDeploymentCost?.base).toMatch(/\$[\d.]+/);
      expect(output.estimatedDeploymentCost?.polygon).toMatch(/\$[\d.]+/);
    });
  });

  describe('Warnings and Validation', () => {
    it('should warn when gas optimization is disabled', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.warnings).toBeDefined();
      expect(output.warnings?.some(w => w.includes('Gas optimization'))).toBe(true);
    });

    it('should warn when royalty exceeds 10%', () => {
      const marketplace: NFTMarketplaceAST = {
        type: 'NFTMarketplace',
        name: 'TestMarketplace',
        chains: [{ network: 'base', chainId: 8453 }],
        contracts: [
          {
            name: 'TestNFT',
            symbol: 'TEST',
            standard: 'ERC1155',
            mintable: true,
            burnable: false,
            pausable: false,
            upgradeable: false,
            metadata: {
              baseURI: 'ipfs://test/',
              dynamic: false,
            },
          },
        ],
        royalties: {
          defaultRoyalty: {
            receiver: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            bps: 1500, // 15%
          },
          upgradeable: false,
        },
      };

      const compiler = new NFTMarketplaceCompiler();
      const output = compiler.compile(marketplace);

      expect(output.warnings?.some(w => w.includes('Royalty exceeds'))).toBe(true);
    });
  });
});

describe('GasOptimizationAnalyzer', () => {
  it('should detect storage packing opportunities', () => {
    const code = `
contract Test {
    uint256 public a;
    uint128 public b;
    uint128 public c;
}`;

    const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.development);
    const report = analyzer.analyze(code, 'Test.sol');

    expect(report.totalOptimizations).toBeGreaterThan(0);
    expect(report.optimizations.some(o => o.category === 'storage')).toBe(true);
  });

  it('should detect unchecked arithmetic opportunities', () => {
    const code = `
function test() public {
    for (uint256 i = 0; i < 10; i++) {
        // do something
    }
}`;

    const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.development);
    const report = analyzer.analyze(code, 'Test.sol');

    const uncheckedOpts = report.optimizations.filter(o => o.category === 'arithmetic');
    expect(uncheckedOpts.length).toBeGreaterThan(0);
  });

  it('should detect require string vs custom error', () => {
    const code = `
function mint() public {
    require(totalSupply < MAX_SUPPLY, "Max supply reached");
}`;

    const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.development);
    const report = analyzer.analyze(code, 'Test.sol');

    const errorOpts = report.optimizations.filter(o => o.category === 'errors');
    expect(errorOpts.length).toBeGreaterThan(0);
    expect(errorOpts[0].suggestion).toContain('custom error');
  });

  it('should detect memory vs calldata opportunities', () => {
    const code = `
function process(uint256[] memory data) external {
    uint256 sum = 0;
    for (uint256 i = 0; i < data.length; i++) {
        sum += data[i];
    }
}`;

    const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.development);
    const report = analyzer.analyze(code, 'Test.sol');

    const memoryOpts = report.optimizations.filter(o => o.category === 'memory');
    expect(memoryOpts.length).toBeGreaterThan(0);
    expect(memoryOpts[0].suggestion).toContain('calldata');
  });

  it('should apply auto-fixes', () => {
    const code = `
function test() public {
    for (uint256 i = 0; i < 10; i++) {
        // do something
    }
}`;

    const analyzer = new GasOptimizationAnalyzer({
      ...ANALYZER_PRESETS.development,
      enableAutoFix: true,
    });
    const report = analyzer.analyze(code, 'Test.sol');
    const { code: fixedCode, appliedCount } = analyzer.applyAutoFixes(code);

    expect(appliedCount).toBeGreaterThan(0);
    expect(fixedCode).toContain('unchecked');
  });

  it('should calculate total potential gas savings', () => {
    const code = `
contract Test {
    uint256 public a;
    uint128 public b;

    function mint() public {
        require(totalSupply < MAX_SUPPLY, "Max supply reached");
        for (uint256 i = 0; i < 10; i++) {
            _mint(i);
        }
    }

    function process(uint256[] memory data) external {
        for (uint256 i = 0; i < data.length; i++) {
            process(data[i]);
        }
    }
}`;

    const analyzer = new GasOptimizationAnalyzer(ANALYZER_PRESETS.production);
    const report = analyzer.analyze(code, 'Test.sol');

    expect(report.totalPotentialSavings).toBeGreaterThan(0);
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.summary[0]).toContain('optimization opportunities');
  });
});
