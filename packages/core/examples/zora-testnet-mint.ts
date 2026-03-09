/**
 * Simple Zora Testnet Mint Example
 *
 * This example demonstrates a complete mint workflow on Base Goerli testnet.
 *
 * Prerequisites:
 * 1. Testnet ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
 * 2. Zora Collection: https://testnet.zora.co/create
 * 3. Environment variables set (see .env.example)
 *
 * Usage:
 *   TEST_WALLET_ADDRESS=0x... TEST_COLLECTION_ID=0x... pnpm tsx examples/zora-testnet-mint.ts
 *
 * @version 3.2.0
 */

import { WalletConnection } from '../src/traits/utils/WalletConnection';
import { GasEstimator } from '../src/traits/utils/GasEstimator';
import { zoraCreator1155ImplABI } from '@zoralabs/protocol-deployments';
import type { Address, Hex } from 'viem';

// Configuration
const WALLET_ADDRESS = process.env.TEST_WALLET_ADDRESS as Address;
const COLLECTION_ID = process.env.TEST_COLLECTION_ID as Address;
const MINT_QUANTITY = BigInt(1);

async function main() {
  console.log('🧪 Zora Testnet Mint Example\n');

  // Validate environment
  if (!WALLET_ADDRESS) {
    throw new Error('TEST_WALLET_ADDRESS not set. Add to .env or pass as environment variable.');
  }
  if (!COLLECTION_ID) {
    throw new Error(
      'TEST_COLLECTION_ID not set. Create collection at https://testnet.zora.co/create'
    );
  }

  console.log('Configuration:');
  console.log(`  Wallet: ${WALLET_ADDRESS}`);
  console.log(`  Collection: ${COLLECTION_ID}`);
  console.log(`  Quantity: ${MINT_QUANTITY}\n`);

  // Step 1: Initialize wallet connection
  console.log('📡 Connecting to Base Goerli...');
  const wallet = new WalletConnection({ chain: 'base-testnet' });
  await wallet.connect(WALLET_ADDRESS);

  const publicClient = wallet.getPublicClient();
  const walletClient = wallet.getWalletClient();

  console.log(`✅ Connected to chain ${wallet.getChainId()}\n`);

  // Step 2: Check wallet balance
  console.log('💰 Checking wallet balance...');
  const balance = await publicClient.getBalance({ address: WALLET_ADDRESS });
  const balanceETH = Number(balance) / 1e18;

  console.log(`  Balance: ${balanceETH.toFixed(6)} ETH`);

  if (balance === BigInt(0)) {
    throw new Error('Wallet has zero balance. Get testnet ETH from faucet.');
  }

  console.log('✅ Sufficient balance\n');

  // Step 3: Estimate gas
  console.log('⛽ Estimating gas costs...');
  const gasEstimate = await GasEstimator.estimateMintGas(
    publicClient,
    COLLECTION_ID,
    MINT_QUANTITY
  );

  const formatted = GasEstimator.formatEstimate(gasEstimate);

  console.log('  Gas Estimate:');
  console.log(`    Gas Limit: ${gasEstimate.gasLimit.toString()}`);
  console.log(`    Gas Cost: ${formatted.totalGasCostETH} ETH`);
  console.log(`    Mint Fee: ${formatted.mintFeeETH} ETH`);
  console.log(`    Total: ${formatted.totalCostETH} ETH`);

  // Step 4: Check balance sufficiency
  const balanceCheck = await GasEstimator.checkSufficientBalance(
    publicClient,
    WALLET_ADDRESS,
    gasEstimate
  );

  if (!balanceCheck.sufficient) {
    const shortfall = GasEstimator.formatCost(balanceCheck.shortfall!);
    throw new Error(
      `Insufficient balance.\n` +
        `  Required: ${GasEstimator.formatCost(balanceCheck.required)}\n` +
        `  Available: ${GasEstimator.formatCost(balanceCheck.balance)}\n` +
        `  Shortfall: ${shortfall}`
    );
  }

  console.log('✅ Sufficient balance for mint\n');

  // Step 5: Simulate transaction
  console.log('🔍 Simulating transaction...');
  const { request } = await publicClient.simulateContract({
    address: COLLECTION_ID,
    abi: zoraCreator1155ImplABI,
    functionName: 'mintWithRewards',
    args: [
      WALLET_ADDRESS, // minter (who receives the NFT)
      BigInt(0), // tokenId (0 for new token)
      MINT_QUANTITY, // quantity to mint
      '0x' as Hex, // minterArguments (empty)
      WALLET_ADDRESS, // mintReferral (self-referral)
    ],
    value: gasEstimate.mintFee,
    account: walletClient.account,
    gas: gasEstimate.gasLimit,
    maxFeePerGas: gasEstimate.maxFeePerGas,
    maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
  });

  console.log('✅ Simulation successful\n');

  // Step 6: Execute transaction
  console.log('📤 Sending transaction...');
  const txHash = await walletClient.writeContract(request);

  console.log(`✅ Transaction sent: ${txHash}\n`);

  // Step 7: Wait for confirmation
  console.log('⏳ Waiting for confirmation (this may take 10-30 seconds)...');
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    throw new Error(`Transaction reverted on-chain: ${txHash}`);
  }

  console.log('✅ Transaction confirmed!\n');

  // Step 8: Extract token ID from logs
  const mintLog = receipt.logs.find(
    (log) => log.topics[0] === '0x30385c845b448a36257a6a1716e6ad2e1bc2cbe333cde1e69fe849ad6511adfe'
  );

  let tokenId: number | undefined;
  if (mintLog && mintLog.topics[2]) {
    tokenId = Number(BigInt(mintLog.topics[2]));
  }

  // Step 9: Print results
  console.log('📊 Mint Results:');
  console.log(`  Transaction Hash: ${receipt.transactionHash}`);
  console.log(`  Block Number: ${receipt.blockNumber}`);
  console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
  if (tokenId !== undefined) {
    console.log(`  Token ID: ${tokenId}`);
  }

  console.log('\n🔗 View on BaseScan:');
  console.log(`  https://goerli.basescan.org/tx/${receipt.transactionHash}`);

  console.log('\n🎨 View NFT:');
  console.log(
    `  https://testnet.zora.co/collections/base-goerli:${COLLECTION_ID}${tokenId !== undefined ? `/token/${tokenId}` : ''}`
  );

  console.log('\n✅ Mint successful! NFT has been minted to your wallet.');
}

main().catch((error) => {
  console.error('\n❌ Mint failed:', error.message);
  process.exit(1);
});
