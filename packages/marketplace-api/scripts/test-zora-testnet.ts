/**
 * Zora Testnet Integration Testing Script
 *
 * Moved from @holoscript/core to @holoscript/marketplace-api
 * (web3 dependencies live here now).
 *
 * Prerequisites:
 * 1. Testnet ETH in your wallet (get from https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
 * 2. Zora collection created on testnet (https://testnet.zora.co/create)
 * 3. Environment variables set (BASE_TESTNET_RPC_URL, TEST_WALLET_ADDRESS, TEST_COLLECTION_ID)
 *
 * Usage:
 *   pnpm tsx scripts/test-zora-testnet.ts --step [1|2|3|4|all]
 *
 * @version 3.2.0
 */

import { _WalletConnection } from '../src/web3/WalletConnection';
import { GasEstimator } from '../src/web3/GasEstimator';
import { createPublicClient, http, type Address } from 'viem';
import { baseGoerli } from 'viem/chains';

// Configuration from environment
const TEST_WALLET_ADDRESS = process.env.TEST_WALLET_ADDRESS as Address;
const TEST_COLLECTION_ID = process.env.TEST_COLLECTION_ID as Address;
const BASE_TESTNET_RPC_URL = process.env.BASE_TESTNET_RPC_URL || 'https://goerli.base.org';

// Test configuration
const TEST_MINT_QUANTITY = BigInt(1); // Mint 1 NFT for testing

interface TestResult {
  step: string;
  success: boolean;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

function logStep(step: string, message: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${step}] ${message}`);
  console.log('='.repeat(60));
}

function logSuccess(message: string) {
  console.log(`  ${message}`);
}

function logError(message: string) {
  console.error(`  ${message}`);
}

function logInfo(message: string) {
  console.log(`  ${message}`);
}

async function step1_checkBalance(): Promise<TestResult> {
  logStep('STEP 1', 'Checking Wallet Balance');

  try {
    if (!TEST_WALLET_ADDRESS) {
      throw new Error('TEST_WALLET_ADDRESS not set in environment');
    }

    logInfo(`Wallet Address: ${TEST_WALLET_ADDRESS}`);

    const publicClient = createPublicClient({
      chain: baseGoerli,
      transport: http(BASE_TESTNET_RPC_URL),
    });

    const balance = await publicClient.getBalance({
      address: TEST_WALLET_ADDRESS,
    });

    const balanceETH = Number(balance) / 1e18;

    logInfo(`Balance: ${balanceETH.toFixed(6)} ETH`);

    if (balance === BigInt(0)) {
      logError('Wallet has zero balance!');
      logInfo('Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet');
      return { step: 'step1', success: false, error: 'Zero balance' };
    }

    const minRequired = BigInt(1e15); // 0.001 ETH
    if (balance < minRequired) {
      logError(`Balance too low. Need at least 0.001 ETH, have ${balanceETH.toFixed(6)} ETH`);
      return { step: 'step1', success: false, error: 'Insufficient balance' };
    }

    logSuccess(`Wallet has sufficient balance: ${balanceETH.toFixed(6)} ETH`);

    return {
      step: 'step1',
      success: true,
      data: { balance: balanceETH, address: TEST_WALLET_ADDRESS },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Failed to check balance: ${msg}`);
    return { step: 'step1', success: false, error: msg };
  }
}

async function step2_estimateGas(): Promise<TestResult> {
  logStep('STEP 2', 'Estimating Gas Costs');

  try {
    if (!TEST_COLLECTION_ID) {
      throw new Error('TEST_COLLECTION_ID not set in environment');
    }

    logInfo(`Collection Address: ${TEST_COLLECTION_ID}`);
    logInfo(`Mint Quantity: ${TEST_MINT_QUANTITY}`);

    const publicClient = createPublicClient({
      chain: baseGoerli,
      transport: http(BASE_TESTNET_RPC_URL),
    });

    const gasEstimate = await GasEstimator.estimateMintGas(
      publicClient,
      TEST_COLLECTION_ID,
      TEST_MINT_QUANTITY
    );

    const formatted = GasEstimator.formatEstimate(gasEstimate);

    logInfo('Gas Estimate:');
    console.log(`  Gas Limit: ${gasEstimate.gasLimit.toString()}`);
    console.log(`  Max Fee Per Gas: ${gasEstimate.maxFeePerGas.toString()} wei`);
    console.log(`  Total Gas Cost: ${formatted.totalGasCostETH} ETH`);
    console.log(`  Mint Fee (0.000777 x ${TEST_MINT_QUANTITY}): ${formatted.mintFeeETH} ETH`);
    console.log(`  Total Cost: ${formatted.totalCostETH} ETH`);

    const balanceCheck = await GasEstimator.checkSufficientBalance(
      publicClient,
      TEST_WALLET_ADDRESS,
      gasEstimate
    );

    if (!balanceCheck.sufficient) {
      const shortfall = GasEstimator.formatCost(balanceCheck.shortfall!);
      logError(`Insufficient balance for mint!`);
      console.log(`  Required: ${GasEstimator.formatCost(balanceCheck.required)}`);
      console.log(`  Available: ${GasEstimator.formatCost(balanceCheck.balance)}`);
      console.log(`  Shortfall: ${shortfall}`);
      return { step: 'step2', success: false, error: `Insufficient balance: ${shortfall}` };
    }

    logSuccess('Wallet has sufficient balance for mint');

    return {
      step: 'step2',
      success: true,
      data: { estimate: formatted, sufficient: true },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Failed to estimate gas: ${msg}`);
    return { step: 'step2', success: false, error: msg };
  }
}

async function step3_executeMint(): Promise<TestResult> {
  logStep('STEP 3', 'Executing Test Mint');

  logError('MANUAL STEP REQUIRED');
  logInfo('This step requires manual execution due to wallet signing.');
  logInfo('');
  logInfo('To execute the mint:');
  logInfo('1. Use the HoloScript runtime or a custom script');
  logInfo('2. Connect your wallet with TEST_WALLET_ADDRESS');
  logInfo('3. Trigger a mint event with the following config:');
  console.log(`
  context.emit('wallet_connected', {
    address: '${TEST_WALLET_ADDRESS}'
  });

  context.emit('zora_mint', {
    mintConfig: {
      initialSupply: 1,
      maxSupply: 10,
      priceETH: '0',
      name: 'HoloScript Test Coin',
      description: 'Testnet validation for ZoraCoinsTrait blockchain integration',
      tags: ['test', 'holoscript', 'zora']
    }
  });
  `);

  logInfo('4. Wait for transaction confirmation (check events)');
  logInfo('5. Copy the transaction hash for Step 4 verification');

  return { step: 'step3', success: false, error: 'Manual execution required' };
}

async function step4_verifyTransaction(): Promise<TestResult> {
  logStep('STEP 4', 'Verifying Transaction');

  const txHash = process.env.TEST_TX_HASH;

  if (!txHash) {
    logError('No transaction hash provided');
    logInfo('Set TEST_TX_HASH environment variable or pass as --tx-hash argument');
    return { step: 'step4', success: false, error: 'No transaction hash' };
  }

  logInfo(`Transaction Hash: ${txHash}`);

  try {
    const publicClient = createPublicClient({
      chain: baseGoerli,
      transport: http(BASE_TESTNET_RPC_URL),
    });

    logInfo('Fetching transaction receipt...');

    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    console.log('\nTransaction Receipt:');
    console.log(`  Status: ${receipt.status}`);
    console.log(`  Block Number: ${receipt.blockNumber}`);
    console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`  Transaction Hash: ${receipt.transactionHash}`);

    if (receipt.status === 'success') {
      logSuccess('Transaction confirmed successfully!');

      const mintLog = receipt.logs.find(
        (log) =>
          log.topics[0] === '0x30385c845b448a36257a6a1716e6ad2e1bc2cbe333cde1e69fe849ad6511adfe'
      );

      if (mintLog && mintLog.topics[2]) {
        const tokenId = Number(BigInt(mintLog.topics[2]));
        console.log(`  Token ID: ${tokenId}`);
      }

      console.log(`\nView on BaseScan:`);
      console.log(`  https://goerli.basescan.org/tx/${receipt.transactionHash}`);

      return {
        step: 'step4',
        success: true,
        data: {
          status: receipt.status,
          blockNumber: Number(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString(),
          txHash: receipt.transactionHash,
        },
      };
    } else {
      logError('Transaction reverted on-chain');
      console.log(`\nView on BaseScan:`);
      console.log(`  https://goerli.basescan.org/tx/${receipt.transactionHash}`);

      return { step: 'step4', success: false, error: 'Transaction reverted' };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Failed to verify transaction: ${msg}`);
    return { step: 'step4', success: false, error: msg };
  }
}

async function runAllSteps() {
  logStep('TESTNET VALIDATION', 'Running All Steps');

  results.push(await step1_checkBalance());
  if (!results[0].success) {
    logError('Step 1 failed. Fix balance issues before continuing.');
    return;
  }

  results.push(await step2_estimateGas());
  if (!results[1].success) {
    logError('Step 2 failed. Fix gas estimation issues before continuing.');
    return;
  }

  results.push(await step3_executeMint());
  logInfo('Complete Step 3 manually, then run Step 4 with transaction hash.');
}

async function main() {
  const args = process.argv.slice(2);
  const stepArg = args.find((arg) => arg.startsWith('--step='));
  const step = stepArg ? stepArg.split('=')[1] : 'all';

  console.log('\nZoraCoinsTrait Testnet Validation Script');
  console.log('============================================\n');

  if (!TEST_WALLET_ADDRESS) {
    logError('TEST_WALLET_ADDRESS not set in environment');
    logInfo('Add to .env: TEST_WALLET_ADDRESS=0xYourTestnetWallet');
    process.exit(1);
  }

  if (!TEST_COLLECTION_ID && step !== '1') {
    logError('TEST_COLLECTION_ID not set in environment');
    logInfo('Add to .env: TEST_COLLECTION_ID=0xYourTestnetCollectionAddress');
    process.exit(1);
  }

  switch (step) {
    case '1':
      results.push(await step1_checkBalance());
      break;
    case '2':
      results.push(await step2_estimateGas());
      break;
    case '3':
      results.push(await step3_executeMint());
      break;
    case '4':
      results.push(await step4_verifyTransaction());
      break;
    case 'all':
      await runAllSteps();
      break;
    default:
      logError(`Unknown step: ${step}`);
      logInfo('Valid steps: 1, 2, 3, 4, all');
      process.exit(1);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  results.forEach((result) => {
    const status = result.success ? 'PASS' : 'FAIL';
    console.log(`${status} - ${result.step}: ${result.error || 'Success'}`);
  });

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\nAll validation steps passed!');
  } else {
    console.log('\nSome validation steps failed.');
  }
}

main().catch(console.error);
