import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, CustodyStatus } from './types';

export interface ChainOfCustodyConfig {
  itemId: string;
  currentHolder: string;
  status: CustodyStatus;
  location?: string;
}

const custodyTimeline = new Map<string, Array<{ ts: number; holder: string; status: CustodyStatus }>>();

export const chainOfCustodyHandler: TraitHandler<ChainOfCustodyConfig> = {
  name: 'chain_of_custody',
  defaultConfig: {
    itemId: '',
    currentHolder: 'unknown',
    status: 'collected',
  },
  onAttach(node: HSPlusNode, config: ChainOfCustodyConfig, ctx: TraitContext): void {
    const id = node.id ?? config.itemId ?? 'unknown';
    custodyTimeline.set(id, [{ ts: Date.now(), holder: config.currentHolder, status: config.status }]);
    ctx.emit?.('chain_of_custody:attached', { nodeId: id, itemId: config.itemId });
  },
  onEvent(node: HSPlusNode, config: ChainOfCustodyConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? config.itemId ?? 'unknown';
    const entries = custodyTimeline.get(id) ?? [];

    if (event.type === 'chain_of_custody:handoff') {
      const holder = (event.payload?.holder as string) || config.currentHolder;
      const status = (event.payload?.status as CustodyStatus) || 'in_transit';
      config.currentHolder = holder;
      config.status = status;
      entries.push({ ts: Date.now(), holder, status });
      custodyTimeline.set(id, entries);
      ctx.emit?.('chain_of_custody:handoff_recorded', { nodeId: id, itemId: config.itemId, holder, status });
    }

    if (event.type === 'chain_of_custody:get_timeline') {
      ctx.emit?.('chain_of_custody:timeline', { nodeId: id, itemId: config.itemId, entries });
    }
  },
};

export const CHAIN_OF_CUSTODY_TRAIT = {
  name: 'chain_of_custody',
  category: 'forensics',
  description: 'Custody handoff timeline for evidentiary integrity.',
};
