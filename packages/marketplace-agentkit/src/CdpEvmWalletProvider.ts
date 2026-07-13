import { CdpClient } from '@coinbase/cdp-sdk';

type TransferResult = {
  transactionHash?: string;
  userOpHash?: string;
};

type TransferCapableAccount = {
  address: string;
  signMessage(parameters: { message: string }): Promise<string>;
  useNetwork(network: string): Promise<{
    transfer(options: { to: string; amount: bigint; token: string }): Promise<TransferResult>;
  }>;
};

export interface ConfigureWalletOptions {
  apiKeyId?: string;
  apiKeySecret?: string;
  walletSecret?: string;
  walletName?: string;
  networkId?: string;
}

export interface Erc20TransferOptions {
  tokenAddress: string;
  destinationAddress: string;
  amount: string | bigint;
}

function parseAtomicAmount(amount: string | bigint): bigint {
  if (typeof amount === 'bigint') {
    return amount;
  }

  if (!/^\d+$/.test(amount)) {
    throw new Error(`ERC20 transfer amount must be an integer atomic-unit string, got "${amount}"`);
  }

  return BigInt(amount);
}

export class CdpEvmWalletProvider {
  constructor(
    private readonly account: TransferCapableAccount,
    private readonly networkId: string,
  ) {}

  static async configureWithWallet(options: ConfigureWalletOptions = {}): Promise<CdpEvmWalletProvider> {
    const apiKeyId = options.apiKeyId ?? process.env.CDP_API_KEY_ID ?? process.env.CDP_API_KEY_NAME;
    const apiKeySecret = options.apiKeySecret ?? process.env.CDP_API_KEY_SECRET;
    const walletSecret = options.walletSecret ?? process.env.CDP_WALLET_SECRET;

    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      throw new Error(
        'Coinbase CDP configuration requires apiKeyId, apiKeySecret, and walletSecret.',
      );
    }

    const cdp = new CdpClient({
      apiKeyId,
      apiKeySecret,
      walletSecret,
    });

    const networkId = options.networkId ?? 'base-sepolia';
    const walletName =
      options.walletName ?? process.env.CDP_WALLET_NAME ?? `holoscript-marketplace-${networkId}`;

    const account = await cdp.evm.getOrCreateAccount({
      name: walletName,
    });

    return new CdpEvmWalletProvider(account as TransferCapableAccount, networkId);
  }

  getAddress(): string {
    return this.account.address;
  }

  async signMessage(message: string): Promise<string> {
    return this.account.signMessage({ message });
  }

  getName(): string {
    return 'CdpEvmWalletProvider';
  }

  getNetwork(): { networkId: string } {
    return { networkId: this.networkId };
  }

  async transfer(options: Erc20TransferOptions): Promise<TransferResult> {
    const account = await this.account.useNetwork(this.networkId);
    return account.transfer({
      to: options.destinationAddress,
      amount: parseAtomicAmount(options.amount),
      token: options.tokenAddress,
    });
  }
}

export function erc20ActionProvider() {
  return {
    async transfer(
      walletProvider: CdpEvmWalletProvider,
      options: Erc20TransferOptions,
    ): Promise<string> {
      const result = await walletProvider.transfer(options);
      return result.transactionHash ?? result.userOpHash ?? 'transfer_submitted';
    },
  };
}
