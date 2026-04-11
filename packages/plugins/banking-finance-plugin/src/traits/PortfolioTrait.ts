/** @portfolio Trait — Investment portfolio management. @trait portfolio */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface Holding { symbol: string; quantity: number; avgCostBasis: number; currentPrice: number; assetClass: 'equity' | 'bond' | 'crypto' | 'commodity' | 'real_estate' | 'cash'; }
export interface PortfolioConfig { holdings: Holding[]; benchmarkIndex: string; riskTolerance: 'conservative' | 'moderate' | 'aggressive'; rebalanceThreshold: number; }
export interface PortfolioState { totalValue: number; totalCost: number; unrealizedPnL: number; dayChange: number; }

const defaultConfig: PortfolioConfig = { holdings: [], benchmarkIndex: 'SPY', riskTolerance: 'moderate', rebalanceThreshold: 5 };

export function createPortfolioHandler(): TraitHandler<PortfolioConfig> {
  return { name: 'portfolio', defaultConfig,
    onAttach(n: HSPlusNode, c: PortfolioConfig, ctx: TraitContext) {
      const totalValue = c.holdings.reduce((s, h) => s + h.currentPrice * h.quantity, 0);
      const totalCost = c.holdings.reduce((s, h) => s + h.avgCostBasis * h.quantity, 0);
      n.__portfolioState = { totalValue, totalCost, unrealizedPnL: totalValue - totalCost, dayChange: 0 };
      ctx.emit?.('portfolio:loaded', { holdings: c.holdings.length, totalValue });
    },
    onDetach(n: HSPlusNode, _c: PortfolioConfig, ctx: TraitContext) { delete n.__portfolioState; ctx.emit?.('portfolio:closed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: PortfolioConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__portfolioState as PortfolioState | undefined; if (!s) return;
      if (e.type === 'portfolio:price_update') {
        const sym = e.payload?.symbol as string; const price = e.payload?.price as number;
        const holding = c.holdings.find(h => h.symbol === sym);
        if (holding) { holding.currentPrice = price; s.totalValue = c.holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0); s.unrealizedPnL = s.totalValue - s.totalCost; ctx.emit?.('portfolio:updated', { totalValue: s.totalValue, pnl: s.unrealizedPnL }); }
      }
    },
  };
}
