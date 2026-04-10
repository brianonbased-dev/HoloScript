/**
 * Production Smoke Test for ZoraCoinsTrait
 *
 * Moved from @holoscript/core to @holoscript/marketplace-api
 * (web3 dependencies live here now).
 *
 * Validates production environment configuration and connectivity
 * WITHOUT executing any transactions.
 *
 * Usage:
 *   PRODUCTION_COLLECTION_ID=0x... pnpm tsx scripts/production-smoke-test.ts
 *
 * @version 3.2.0
 */

import { WalletConnection } from '../src/web3/WalletConnection';
import { GasEstimator } from '../src/web3/GasEstimator';
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';

// Configuration
const PRODUCTION_COLLECTION_ID = process.env.PRODUCTION_COLLECTION_ID as Address;
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

interface SmokeTestResult {
  test: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  data?: any;
}

const results: SmokeTestResult[] = [];

function logTest(test: string, status: 'pass' | 'fail' | 'warn', message: string, data?: any) {
  const indicator = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'WARN';
  console.log(`[${indicator}] ${test}: ${message}`);
  results.push({ test, status, message, data });
}

async function main() {
  console.log('ZoraCoinsTrait Production Smoke Test\n');
  console.log('='.repeat(60));
  console.log('Environment: PRODUCTION (Base L2 Mainnet)');
  console.log('='.repeat(60));
  console.log('');

  // Test 1: Environment Variables
  console.log('Test 1: Environment Configuration');
  console.log('-'.repeat(60));

  if (!PRODUCTION_COLLECTION_ID) {
    logTest('Collection ID', 'fail', 'PRODUCTION_COLLECTION_ID not set.');
  } else {
    logTest('Collection ID', 'pass', PRODUCTION_COLLECTION_ID);
  }

  if (BASE_RPC_URL === 'https://mainnet.base.org') {
    logTest('RPC URL', 'warn', 'Using public RPC. Consider Alchemy/Infura for production.', {
      url: BASE_RPC_URL,
    });
  } else {
    logTest('RPC URL', 'pass', 'Custom RPC configured', { url: BASE_RPC_URL });
  }

  console.log('');

  // Test 2: Network Connectivity
  console.log('Test 2: Network Connectivity');
  console.log('-'.repeat(60));

  try {
    const wallet = new WalletConnection({ chain: 'base' });
    const publicClient = wallet.getPublicClient();

    const chainId = wallet.getChainId();
    if (chainId === 8453) {
      logTest('Chain ID', 'pass', `Connected to Base mainnet (${chainId})`);
    } else {
      logTest('Chain ID', 'fail', `Wrong chain! Expected 8453, got ${chainId}`);
    }

    const blockNumber = await publicClient.getBlockNumber();
    logTest('Latest Block', 'pass', `Block ${blockNumber.toString()}`);

    const block = await publicClient.getBlock({ blockNumber });
    const blockTime = Number(block.timestamp);
    const now = Math.floor(Date.now() / 1000);
    const lag = now - blockTime;

    if (lag < 60) {
      logTest('Block Recency', 'pass', `Latest block ${lag}s old`);
    } else {
      logTest('Block Recency', 'warn', `Latest block ${lag}s old (may be stale RPC)`);
    }
  } catch (error: unknown) {
    logTest(
      'RPC Connection',
      'fail',
      `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log('');

  // Test 3: Gas Prices
  console.log('Test 3: Gas Price Check');
  console.log('-'.repeat(60));

  try {
    const wallet = new WalletConnection({ chain: 'base' });
    const publicClient = wallet.getPublicClient();

    const gasPrices = await GasEstimator.getCurrentGasPrices(publicClient);

    console.log(`  Base Fee: ${gasPrices.baseFeeGwei} gwei`);
    console.log(`  Max Fee: ${gasPrices.maxFeePerGasGwei} gwei`);
    console.log(`  Priority Fee: ${gasPrices.maxPriorityFeePerGasGwei} gwei`);

    const baseFeeGwei = parseFloat(gasPrices.baseFeeGwei);

    if (baseFeeGwei < 0.01) {
      logTest('Gas Price', 'pass', `Base fee ${baseFeeGwei} gwei (very low)`);
    } else if (baseFeeGwei < 0.1) {
      logTest('Gas Price', 'pass', `Base fee ${baseFeeGwei} gwei (normal)`);
    } else {
      logTest('Gas Price', 'warn', `Base fee ${baseFeeGwei} gwei (high, may want to wait)`);
    }
  } catch (error: unknown) {
    logTest(
      'Gas Price',
      'fail',
      `Failed to get gas prices: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log('');

  // Test 4: Collection Contract
  if (PRODUCTION_COLLECTION_ID) {
    console.log('Test 4: Collection Contract Validation');
    console.log('-'.repeat(60));

    try {
      const wallet = new WalletConnection({ chain: 'base' });
      const publicClient = wallet.getPublicClient();

      const code = await publicClient.getBytecode({
        address: PRODUCTION_COLLECTION_ID,
      });

      if (code && code !== '0x') {
        logTest('Contract Exists', 'pass', 'Contract deployed at address');

        try {
          const name = await publicClient.readContract({
            address: PRODUCTION_COLLECTION_ID,
            abi: [
              {
                name: 'name',
                type: 'function',
                stateMutability: 'view',
                inputs: [],
                outputs: [{ type: 'string' }],
              },
            ],
            functionName: 'name',
          });

          logTest('Contract Name', 'pass', `Collection name: "${name}"`);
        } catch {
          logTest('Contract Name', 'warn', 'Unable to read contract name (may be non-standard)');
        }
      } else {
        logTest('Contract Exists', 'fail', 'No contract at this address!');
      }
    } catch (error: unknown) {
      logTest(
        'Contract Check',
        'fail',
        `Failed to check contract: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    console.log('');
  }

  // Test 5: Mint Cost Estimation
  if (PRODUCTION_COLLECTION_ID) {
    console.log('Test 5: Mint Cost Estimation');
    console.log('-'.repeat(60));

    try {
      const wallet = new WalletConnection({ chain: 'base' });
      const publicClient = wallet.getPublicClient();

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        PRODUCTION_COLLECTION_ID,
        BigInt(1)
      );

      const formatted = GasEstimator.formatEstimate(estimate);

      console.log(`  Gas Limit: ${estimate.gasLimit.toString()}`);
      console.log(`  Total Gas Cost: ${formatted.totalGasCostETH} ETH`);
      console.log(`  Mint Fee (0.000777 ETH): ${formatted.mintFeeETH} ETH`);
      console.log(`  TOTAL COST: ${formatted.totalCostETH} ETH`);

      const totalCostNum = parseFloat(formatted.totalCostETH);

      if (totalCostNum < 0.01) {
        logTest(
          'Mint Cost',
          'pass',
          `Total ${formatted.totalCostETH} ETH (~$${(totalCostNum * 2000).toFixed(2)} @ $2000/ETH)`
        );
      } else {
        logTest(
          'Mint Cost',
          'warn',
          `Total ${formatted.totalCostETH} ETH (seems high for Base L2)`
        );
      }
    } catch (error: unknown) {
      logTest(
        'Mint Estimation',
        'warn',
        `Unable to estimate: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    console.log('');
  }

  // Test 6: Security Checks
  console.log('Test 6: Security Checks');
  console.log('-'.repeat(60));

  if (process.env.WALLET_PRIVATE_KEY) {
    logTest(
      'Private Key Storage',
      'fail',
      'WALLET_PRIVATE_KEY found in environment! Use secure vault instead.'
    );
  } else {
    logTest('Private Key Storage', 'pass', 'No private keys in environment (use secure vault)');
  }

  if (process.env.NODE_ENV === 'production') {
    logTest('Environment Mode', 'pass', 'NODE_ENV=production');
  } else {
    logTest(
      'Environment Mode',
      'warn',
      `NODE_ENV=${process.env.NODE_ENV || 'not set'} (should be "production")`
    );
  }

  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('SMOKE TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;

  console.log(`Passed: ${passed}`);
  console.log(`Warnings: ${warned}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  if (failed === 0) {
    console.log('All critical checks passed!');
    if (warned > 0) {
      console.log(`Note: ${warned} warning(s) detected. Review recommendations above.`);
    }
    process.exit(0);
  } else {
    console.log('Some critical checks failed. Fix before deploying:');
    results
      .filter((r) => r.status === 'fail')
      .forEach((r) => {
        console.log(`   - ${r.test}: ${r.message}`);
      });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error.message);
  process.exit(1);
});
