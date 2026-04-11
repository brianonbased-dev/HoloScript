/** @royalty_stream Trait — Revenue sharing and royalty distribution. @trait royalty_stream */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface RoyaltySplit { recipientId: string; percent: number; walletAddress?: string; }
export interface RoyaltyStreamConfig { assetId: string; splits: RoyaltySplit[]; currency: string; minimumPayout: number; payoutFrequency: 'instant' | 'daily' | 'weekly' | 'monthly'; }
export interface RoyaltyStreamState { totalCollected: number; totalDistributed: number; pendingPayout: number; distributionCount: number; }

const defaultConfig: RoyaltyStreamConfig = { assetId: '', splits: [], currency: 'USDC', minimumPayout: 1, payoutFrequency: 'instant' };

export function createRoyaltyStreamHandler(): TraitHandler<RoyaltyStreamConfig> {
  return { name: 'royalty_stream', defaultConfig,
    onAttach(n: HSPlusNode, _c: RoyaltyStreamConfig, ctx: TraitContext) { n.__royaltyState = { totalCollected: 0, totalDistributed: 0, pendingPayout: 0, distributionCount: 0 }; ctx.emit?.('royalty:stream_created'); },
    onDetach(n: HSPlusNode, _c: RoyaltyStreamConfig, ctx: TraitContext) { delete n.__royaltyState; ctx.emit?.('royalty:stream_closed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: RoyaltyStreamConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__royaltyState as RoyaltyStreamState | undefined; if (!s) return;
      if (e.type === 'royalty:collect') {
        const amount = (e.payload?.amount as number) ?? 0;
        s.totalCollected += amount; s.pendingPayout += amount;
        if (c.payoutFrequency === 'instant' && s.pendingPayout >= c.minimumPayout) {
          const distributions = c.splits.map(split => ({ recipient: split.recipientId, amount: s.pendingPayout * split.percent / 100 }));
          s.totalDistributed += s.pendingPayout; s.pendingPayout = 0; s.distributionCount++;
          ctx.emit?.('royalty:distributed', { distributions, total: s.totalDistributed });
        } else { ctx.emit?.('royalty:collected', { pending: s.pendingPayout }); }
      }
      if (e.type === 'royalty:flush') {
        if (s.pendingPayout > 0) {
          s.totalDistributed += s.pendingPayout; s.pendingPayout = 0; s.distributionCount++;
          ctx.emit?.('royalty:flushed', { totalDistributed: s.totalDistributed });
        }
      }
    },
  };
}
