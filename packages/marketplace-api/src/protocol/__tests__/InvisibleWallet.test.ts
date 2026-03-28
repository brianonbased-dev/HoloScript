import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InvisibleWallet,
  InvisibleWalletError,
  createKeystore,
} from '../InvisibleWallet';
import { base, baseGoerli } from 'viem/chains';

// =============================================================================
// Mock viem account creation
// =============================================================================

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn((key: string) => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const,
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
    type: 'local' as const,
    source: 'privateKey' as const,
    publicKey: '0x' as `0x${string}`,
    nonceManager: undefined,
  })),
}));

// =============================================================================
// fromEnvironment
// =============================================================================

describe('InvisibleWallet.fromEnvironment', () => {
  const originalEnv = process.env.HOLOSCRIPT_WALLET_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.HOLOSCRIPT_WALLET_KEY = originalEnv;
    } else {
      delete process.env.HOLOSCRIPT_WALLET_KEY;
    }
  });

  it('throws when env var not set', () => {
    delete process.env.HOLOSCRIPT_WALLET_KEY;
    expect(() => InvisibleWallet.fromEnvironment()).toThrow(InvisibleWalletError);
    expect(() => InvisibleWallet.fromEnvironment()).toThrow('HOLOSCRIPT_WALLET_KEY');
  });

  it('creates wallet from env var', () => {
    process.env.HOLOSCRIPT_WALLET_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const wallet = InvisibleWallet.fromEnvironment();

    expect(wallet.getAddress()).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(wallet.getChainId()).toBe(base.id); // mainnet by default
  });

  it('uses testnet when configured', () => {
    process.env.HOLOSCRIPT_WALLET_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const wallet = InvisibleWallet.fromEnvironment({ testnet: true });

    expect(wallet.getChainId()).toBe(baseGoerli.id);
  });
});

// =============================================================================
// fromPrivateKey
// =============================================================================

describe('InvisibleWallet.fromPrivateKey', () => {
  it('accepts 0x-prefixed key', () => {
    const wallet = InvisibleWallet.fromPrivateKey(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    expect(wallet.getAddress()).toBeDefined();
    expect(wallet.getWalletClient()).toBeDefined();
    expect(wallet.getPublicClient()).toBeDefined();
  });

  it('accepts key without 0x prefix', () => {
    const wallet = InvisibleWallet.fromPrivateKey(
      'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    expect(wallet.getAddress()).toBeDefined();
  });

  it('creates mainnet wallet by default', () => {
    const wallet = InvisibleWallet.fromPrivateKey(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    expect(wallet.getChain().id).toBe(base.id);
  });

  it('creates testnet wallet when configured', () => {
    const wallet = InvisibleWallet.fromPrivateKey(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      { testnet: true },
    );
    expect(wallet.getChain().id).toBe(baseGoerli.id);
  });
});

// =============================================================================
// toWalletConnection
// =============================================================================

describe('InvisibleWallet.toWalletConnection', () => {
  it('converts to WalletConnection', () => {
    const wallet = InvisibleWallet.fromPrivateKey(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    const connection = wallet.toWalletConnection();
    expect(connection).toBeDefined();
    expect(connection.getPublicClient()).toBeDefined();
  });
});

// =============================================================================
// createKeystore + fromKeystore roundtrip
// =============================================================================

describe('createKeystore', () => {
  it('creates a v1 keystore', async () => {
    const keystore = await createKeystore(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      'test-passphrase',
    );

    expect(keystore.version).toBe(1);
    expect(keystore.encrypted).toBeTruthy();
    expect(keystore.salt).toBeTruthy();
    expect(keystore.iv).toBeTruthy();
    // Encrypted data should be base64
    expect(keystore.encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('produces different output for different passphrases', async () => {
    const ks1 = await createKeystore('0xabc', 'pass1');
    const ks2 = await createKeystore('0xabc', 'pass2');

    expect(ks1.encrypted).not.toBe(ks2.encrypted);
  });

  it('produces different salt each time', async () => {
    const ks1 = await createKeystore('0xabc', 'pass');
    const ks2 = await createKeystore('0xabc', 'pass');

    expect(ks1.salt).not.toBe(ks2.salt);
  });
});

// =============================================================================
// InvisibleWalletError
// =============================================================================

describe('InvisibleWalletError', () => {
  it('has correct name and code', () => {
    const err = new InvisibleWalletError('test msg', 'TEST_CODE');
    expect(err.name).toBe('InvisibleWalletError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test msg');
  });
});
