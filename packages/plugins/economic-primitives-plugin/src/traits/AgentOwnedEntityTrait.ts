/** @agent_owned_entity Trait — Agent-owned digital entity with autonomous economic rights. @trait agent_owned_entity */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface AgentOwnedEntityConfig {
  entityId: string;
  ownerAgentId: string;
  entityType: 'trait' | 'service' | 'dataset' | 'composition' | 'compute_node';
  walletAddress: string;
  revenueShare: number;
  autonomyLevel: 'none' | 'limited' | 'full';
  spendingLimitPerDay: number;
  allowedActions: string[];
}

export interface AgentOwnedEntityState {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  transactionCount: number;
  isActive: boolean;
}

const defaultConfig: AgentOwnedEntityConfig = { entityId: '', ownerAgentId: '', entityType: 'trait', walletAddress: '', revenueShare: 100, autonomyLevel: 'limited', spendingLimitPerDay: 10, allowedActions: ['list', 'price', 'respond'] };

export function createAgentOwnedEntityHandler(): TraitHandler<AgentOwnedEntityConfig> {
  return { name: 'agent_owned_entity', defaultConfig,
    onAttach(n: HSPlusNode, c: AgentOwnedEntityConfig, ctx: TraitContext) { n.__aoeState = { balance: 0, totalEarned: 0, totalSpent: 0, transactionCount: 0, isActive: true }; ctx.emit?.('aoe:registered', { entity: c.entityId, owner: c.ownerAgentId, autonomy: c.autonomyLevel }); },
    onDetach(n: HSPlusNode, _c: AgentOwnedEntityConfig, ctx: TraitContext) { delete n.__aoeState; ctx.emit?.('aoe:deregistered'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: AgentOwnedEntityConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__aoeState as AgentOwnedEntityState | undefined; if (!s || !s.isActive) return;
      if (e.type === 'aoe:earn') { const amt = (e.payload?.amount as number) ?? 0; s.balance += amt; s.totalEarned += amt; s.transactionCount++; ctx.emit?.('aoe:earned', { amount: amt, balance: s.balance }); }
      if (e.type === 'aoe:spend') {
        const amt = (e.payload?.amount as number) ?? 0;
        const action = (e.payload?.action as string) ?? '';
        if (amt > c.spendingLimitPerDay) { ctx.emit?.('aoe:spend_rejected', { amount: amt, limit: c.spendingLimitPerDay }); return; }
        if (!c.allowedActions.includes(action) && c.autonomyLevel !== 'full') { ctx.emit?.('aoe:action_denied', { action }); return; }
        if (s.balance >= amt) { s.balance -= amt; s.totalSpent += amt; s.transactionCount++; ctx.emit?.('aoe:spent', { amount: amt, action, balance: s.balance }); }
        else { ctx.emit?.('aoe:insufficient_balance', { requested: amt, available: s.balance }); }
      }
      if (e.type === 'aoe:deactivate') { s.isActive = false; ctx.emit?.('aoe:deactivated'); }
    },
  };
}
