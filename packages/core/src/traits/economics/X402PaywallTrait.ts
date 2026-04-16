import { EventEmitter } from 'events';
import {
  HSPlusNode,
  TraitHandler,
  TraitContext,
  TraitEvent,
} from '../TraitTypes';

export interface X402PaywallConfig {
  price: number;
  asset: 'USDC' | 'ETH' | 'SOL';
  network: 'base' | 'ethereum' | 'solana';
  facilitator?: string;
  fallback?: 'hide' | 'lock' | 'blur';
  contentId?: string;
}

/**
 * X402PaywallTrait
 * Handles the runtime gating logic for @x402_paywall traits.
 */
export class X402PaywallTrait extends EventEmitter {
  private isPaid: boolean = false;
  private config: X402PaywallConfig;
  private node: HSPlusNode | null = null;

  constructor(config: X402PaywallConfig) {
    super();
    this.config = {
      fallback: 'lock',
      ...config,
    };
  }

  onAttach(node: HSPlusNode, ctx: TraitContext): void {
    this.node = node;
    this.applyFallback();
    
    // Register interest in payment events
    ctx.on('payment_verified', (event: TraitEvent) => {
      if (event.payload?.contentId === this.config.contentId || event.payload?.paymentId) {
        this.unlock();
      }
    });

    this.emit('attached', { node, config: this.config });
  }

  private applyFallback(): void {
    if (this.isPaid || !this.node) return;

    switch (this.config.fallback) {
      case 'hide':
        this.node.visible = false;
        break;
      case 'blur':
        // Implementation-specific: apply blur shader or filter
        if (this.node.material) {
          (this.node.material as any).opacity = 0.5;
          (this.node.material as any).transparent = true;
        }
        break;
      case 'lock':
      default:
        this.node.userData = this.node.userData || {};
        this.node.userData.locked = true;
        this.node.userData.lockReason = 'Payment Required (x402)';
        break;
    }
  }

  unlock(): void {
    this.isPaid = true;
    if (!this.node) return;

    this.node.visible = true;
    if (this.node.material) {
      (this.node.material as any).opacity = 1.0;
    }
    if (this.node.userData) {
      delete this.node.userData.locked;
      delete this.node.userData.lockReason;
    }

    this.emit('unlocked', { node: this.node });
  }

  isUnlocked(): boolean {
    return this.isPaid;
  }

  getConfig(): X402PaywallConfig {
    return { ...this.config };
  }
}

export const x402PaywallHandler: TraitHandler = {
  name: 'x402_paywall',
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new X402PaywallTrait(config);
    (node as any).__x402_paywall_instance = instance;
    instance.onAttach(node, ctx);
  },
  onDetach(node: HSPlusNode): void {
    delete (node as any).__x402_paywall_instance;
  },
  onEvent(node: HSPlusNode, _config: any, _ctx: TraitContext, event: TraitEvent): void {
    const instance = (node as any).__x402_paywall_instance as X402PaywallTrait;
    if (instance && event.type === 'payment_verified') {
      instance.unlock();
    }
  }
};
