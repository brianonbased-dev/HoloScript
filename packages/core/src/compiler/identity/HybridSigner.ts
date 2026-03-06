/**
 * HybridSigner - Convenience wrapper over HybridCryptoProvider
 * for Ed25519 + ML-DSA dual-signing with a simplified API.
 * @version 1.0.0
 */
import {
  HybridCryptoProvider, Ed25519CryptoProvider, MLDSACryptoProvider,
  type HybridKeyPair, type CompositeSignature, type CompositeVerificationResult,
  isPostQuantumAvailable,
} from './HybridCryptoProvider';

export class HybridSigner {
  private provider: HybridCryptoProvider;
  private keyPair: HybridKeyPair | null = null;

  constructor(options: { enablePQ?: boolean } = {}) {
    const classical = new Ed25519CryptoProvider();
    const pq = options.enablePQ !== false ? new MLDSACryptoProvider() : undefined;
    this.provider = new HybridCryptoProvider(classical, pq);
  }

  async generateKeys(kid?: string): Promise<HybridKeyPair> {
    this.keyPair = await this.provider.generateHybridKeyPair(kid);
    return this.keyPair;
  }

  async sign(message: string | Uint8Array): Promise<CompositeSignature> {
    if (!this.keyPair) throw new Error('Call generateKeys() first');
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    return this.provider.signComposite(bytes, this.keyPair);
  }

  async verify(message: string | Uint8Array, signature: CompositeSignature, keyPair?: HybridKeyPair): Promise<CompositeVerificationResult> {
    const kp = keyPair ?? this.keyPair;
    if (!kp) throw new Error('No key pair available');
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    return this.provider.verifyComposite(bytes, signature, kp);
  }

  getKeyPair(): HybridKeyPair | null { return this.keyPair; }
  hasPQ(): boolean { return this.provider.hasPQProvider(); }
  static async isPQAvailable(): Promise<boolean> { return isPostQuantumAvailable(); }
}
