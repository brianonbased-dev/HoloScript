/**
 * Gas Estimation Utility
 *
 * Estimates gas costs for Zora Protocol transactions on Base L2.
 * Helps prevent transaction failures due to insufficient funds.
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

import type { PublicClient, Address, Hex } from 'viem';
import { parseGwei, formatEther, parseEther } from 'viem';

/**
 * Gas estimation result
 */
export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  totalGasCost: bigint;
  mintFee: bigint;
  totalCost: bigint;
}

/**
 * Formatted gas cost for display
 */
export interface FormattedGasEstimate extends GasEstimate {
  totalGasCostETH: string;
  mintFeeETH: string;
  totalCostETH: string;
  totalCostUSD?: string;
}

/**
 * Gas Estimator for Zora Protocol transactions
 */
export class GasEstimator {

  /**
   * Zora Protocol mint fee (0.000777 ETH per mint)
   */
  static readonly ZORA_MINT_FEE = parseEther('0.000777');

  /**
   * Estimate gas for a Zora mint transaction
   * @param publicClient - Viem public client
   * @param contractAddress - Zora contract address
   * @param quantity - Number of tokens to mint
   * @param calldata - Optional transaction calldata for more accurate estimation
   * @returns Gas estimate breakdown
   */
  static async estimateMintGas(
    publicClient: PublicClient,
    contractAddress: Address,
    quantity: bigint,
    calldata?: Hex
  ): Promise<GasEstimate> {

    // 1. Estimate gas limit
    let gasLimit: bigint;

    if (calldata) {
      // Use provided calldata for accurate estimation
      gasLimit = await publicClient.estimateGas({
        to: contractAddress,
        data: calldata
      });
    } else {
      // Conservative estimate for Zora mints (typically 150k-200k gas)
      gasLimit = BigInt(200000);
    }

    // Add 20% buffer for safety
    gasLimit = (gasLimit * BigInt(120)) / BigInt(100);

    // 2. Get current base fee from latest block
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas || parseGwei('0.001'); // Fallback to 0.001 gwei

    // 3. Calculate max fee per gas (Base L2 typically has very low fees)
    // Use 2x base fee + priority fee for fast confirmation
    const maxPriorityFeePerGas = parseGwei('0.001'); // 0.001 gwei priority on Base
    const maxFeePerGas = (baseFee * BigInt(2)) + maxPriorityFeePerGas;

    // 4. Calculate total gas cost
    const totalGasCost = gasLimit * maxFeePerGas;

    // 5. Calculate mint fee (0.000777 ETH × quantity)
    const mintFee = this.ZORA_MINT_FEE * quantity;

    // 6. Calculate total cost (gas + mint fee)
    const totalCost = totalGasCost + mintFee;

    return {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      totalGasCost,
      mintFee,
      totalCost
    };
  }

  /**
   * Format gas estimate for display
   * @param estimate - Raw gas estimate
   * @param ethPriceUSD - Optional ETH price in USD for conversion
   * @returns Formatted gas estimate with ETH and USD values
   */
  static formatEstimate(estimate: GasEstimate, ethPriceUSD?: number): FormattedGasEstimate {
    const totalGasCostETH = formatEther(estimate.totalGasCost);
    const mintFeeETH = formatEther(estimate.mintFee);
    const totalCostETH = formatEther(estimate.totalCost);

    const formatted: FormattedGasEstimate = {
      ...estimate,
      totalGasCostETH,
      mintFeeETH,
      totalCostETH
    };

    if (ethPriceUSD) {
      const totalCostFloat = parseFloat(totalCostETH);
      formatted.totalCostUSD = `$${(totalCostFloat * ethPriceUSD).toFixed(2)}`;
    }

    return formatted;
  }

  /**
   * Check if wallet has sufficient balance for transaction
   * @param publicClient - Viem public client
   * @param walletAddress - Wallet address to check
   * @param estimate - Gas estimate
   * @returns True if balance is sufficient
   */
  static async checkSufficientBalance(
    publicClient: PublicClient,
    walletAddress: Address,
    estimate: GasEstimate
  ): Promise<{ sufficient: boolean; balance: bigint; required: bigint; shortfall?: bigint }> {
    const balance = await publicClient.getBalance({ address: walletAddress });
    const required = estimate.totalCost;
    const sufficient = balance >= required;

    return {
      sufficient,
      balance,
      required,
      shortfall: sufficient ? undefined : required - balance
    };
  }

  /**
   * Format wei amount to ETH string
   * @param wei - Amount in wei
   * @returns Formatted ETH string
   */
  static formatCost(wei: bigint): string {
    return `${formatEther(wei)} ETH`;
  }

  /**
   * Get current Base L2 gas prices
   * @param publicClient - Viem public client
   * @returns Current gas price information
   */
  static async getCurrentGasPrices(publicClient: PublicClient): Promise<{
    baseFee: bigint;
    baseFeeGwei: string;
    maxFeePerGas: bigint;
    maxFeePerGasGwei: string;
    maxPriorityFeePerGas: bigint;
    maxPriorityFeePerGasGwei: string;
  }> {
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas || parseGwei('0.001');
    const maxPriorityFeePerGas = parseGwei('0.001');
    const maxFeePerGas = (baseFee * BigInt(2)) + maxPriorityFeePerGas;

    return {
      baseFee,
      baseFeeGwei: formatEther(baseFee, 'gwei'),
      maxFeePerGas,
      maxFeePerGasGwei: formatEther(maxFeePerGas, 'gwei'),
      maxPriorityFeePerGas,
      maxPriorityFeePerGasGwei: formatEther(maxPriorityFeePerGas, 'gwei')
    };
  }
}

/**
 * Helper function to estimate mint gas
 * @param publicClient - Viem public client
 * @param contractAddress - Contract address
 * @param quantity - Quantity to mint
 * @returns Gas estimate
 */
export async function estimateMintGas(
  publicClient: PublicClient,
  contractAddress: Address,
  quantity: bigint
): Promise<GasEstimate> {
  return GasEstimator.estimateMintGas(publicClient, contractAddress, quantity);
}
