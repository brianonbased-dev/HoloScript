/**
 * Deploy HoloScript Protocol Collection (ERC-1155) on Base L2
 *
 * Creates a shared Zora 1155 collection that serves as the on-chain anchor
 * for all HoloScript protocol publications. Each published composition becomes
 * a token in this collection.
 *
 * Prerequisites:
 *   1. Funded wallet on Base (mainnet) or Base Sepolia (testnet)
 *   2. HOLOSCRIPT_WALLET_KEY env var set (64-char hex private key)
 *
 * Usage:
 *   # Testnet (Base Sepolia) — use this first:
 *   HOLOSCRIPT_WALLET_KEY=0x... pnpm tsx scripts/deploy-protocol-collection.ts --testnet
 *
 *   # Mainnet (Base):
 *   HOLOSCRIPT_WALLET_KEY=0x... pnpm tsx scripts/deploy-protocol-collection.ts
 *
 * Output:
 *   Prints the deployed collection address. Set it as:
 *     HOLOSCRIPT_COLLECTION_ADDRESS=0x...
 *
 * Faucet (testnet): https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import {
  zoraCreator1155FactoryImplABI,
  zoraCreator1155FactoryImplAddress,
} from '@zoralabs/protocol-deployments';

// =============================================================================
// CONFIG
// =============================================================================

const COLLECTION_NAME = 'HoloScript Protocol';
const COLLECTION_URI = JSON.stringify({
  name: 'HoloScript Protocol',
  description:
    'Shared ERC-1155 collection for the HoloScript Publishing Protocol. ' +
    'Each token represents a published 3D composition with provenance, ' +
    'import-chain royalties, and composable licensing.',
  image: 'https://mcp.holoscript.net/protocol-collection.png',
  external_link: 'https://holoscript.net',
});

// 2.5% default royalty to platform
const DEFAULT_ROYALTY_BPS = 250;

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const isTestnet = process.argv.includes('--testnet');
  const chain = isTestnet ? baseSepolia : base;
  const chainLabel = isTestnet ? 'Base Sepolia (testnet)' : 'Base (mainnet)';

  console.log(`\nHoloScript Protocol Collection Deployment`);
  console.log(`Chain: ${chainLabel} (${chain.id})\n`);

  // Validate wallet key
  const rawKey = process.env.HOLOSCRIPT_WALLET_KEY;
  if (!rawKey) {
    console.error('ERROR: HOLOSCRIPT_WALLET_KEY not set.');
    console.error('  Export your private key: export HOLOSCRIPT_WALLET_KEY=0x...');
    process.exit(1);
  }

  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  console.log(`Deployer: ${account.address}`);

  // Create clients
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceETH = Number(balance) / 1e18;
  console.log(`Balance: ${balanceETH.toFixed(6)} ETH`);

  if (balance === 0n) {
    console.error('\nERROR: Wallet has zero balance.');
    if (isTestnet) {
      console.error('Get testnet ETH: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet');
    }
    process.exit(1);
  }

  // Factory address — same on all chains
  const factoryAddress = zoraCreator1155FactoryImplAddress[chain.id as keyof typeof zoraCreator1155FactoryImplAddress];
  console.log(`Factory: ${factoryAddress}\n`);

  // Deploy collection
  console.log('Deploying collection...');

  const { request } = await publicClient.simulateContract({
    address: factoryAddress,
    abi: zoraCreator1155FactoryImplABI,
    functionName: 'createContract',
    args: [
      COLLECTION_URI,                                   // contractURI
      COLLECTION_NAME,                                  // name
      {                                                 // defaultRoyaltyConfiguration
        royaltyMintSchedule: 0,
        royaltyBPS: DEFAULT_ROYALTY_BPS,
        royaltyRecipient: account.address,
      },
      account.address,                                  // defaultAdmin
      [],                                               // setupActions (none)
    ],
    account,
  });

  const txHash = await walletClient.writeContract(request);
  console.log(`TX sent: ${txHash}`);

  // Wait for confirmation
  console.log('Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    console.error(`\nERROR: Transaction reverted: ${txHash}`);
    process.exit(1);
  }

  // Extract collection address from ContractCreated event logs
  // The factory emits SetupNewContract(address indexed newContract, ...)
  // Topic[0] of SetupNewContract
  const SETUP_NEW_CONTRACT_TOPIC =
    '0xfcbe395180cd2cf58e51cc32aa86e5dd0e9e7a40dbc3ee6c9ed04b58ca09178d';

  let collectionAddress: string | undefined;
  for (const log of receipt.logs) {
    if (log.topics[0] === SETUP_NEW_CONTRACT_TOPIC && log.topics[1]) {
      // topics[1] = indexed newContract address (padded to 32 bytes)
      collectionAddress = `0x${log.topics[1].slice(26)}`;
      break;
    }
  }

  // Fallback: check contractCreated events from receipt
  if (!collectionAddress && receipt.contractAddress) {
    collectionAddress = receipt.contractAddress;
  }

  // Fallback: look for any new contract creation in internal txs
  if (!collectionAddress) {
    // The created contract is typically the last log emitter
    for (const log of receipt.logs) {
      if (log.address !== factoryAddress) {
        collectionAddress = log.address;
        break;
      }
    }
  }

  console.log(`\nCollection deployed!`);
  console.log(`  TX: ${receipt.transactionHash}`);
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);

  if (collectionAddress) {
    console.log(`\n  COLLECTION ADDRESS: ${collectionAddress}`);
    console.log(`\nSet this in your environment:`);
    console.log(`  export HOLOSCRIPT_COLLECTION_ADDRESS=${collectionAddress}`);
    console.log(`\nView on ${isTestnet ? 'Sepolia BaseScan' : 'BaseScan'}:`);
    const basescanUrl = isTestnet
      ? `https://sepolia.basescan.org/address/${collectionAddress}`
      : `https://basescan.org/address/${collectionAddress}`;
    console.log(`  ${basescanUrl}`);
    console.log(`\nView on Zora:`);
    const zoraUrl = isTestnet
      ? `https://testnet.zora.co/collections/base-sepolia:${collectionAddress}`
      : `https://zora.co/collect/base:${collectionAddress}`;
    console.log(`  ${zoraUrl}`);
  } else {
    console.log(`\n  Could not extract collection address from logs.`);
    console.log(`  Check the transaction on BaseScan to find the created contract.`);
    const basescanUrl = isTestnet
      ? `https://sepolia.basescan.org/tx/${receipt.transactionHash}`
      : `https://basescan.org/tx/${receipt.transactionHash}`;
    console.log(`  ${basescanUrl}`);
  }
}

main().catch((err) => {
  console.error('\nDeployment failed:', err.message || err);
  process.exit(1);
});
