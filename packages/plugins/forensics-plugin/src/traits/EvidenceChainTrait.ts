import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, EvidenceClassification } from './types';

export interface EvidenceChainConfig {
  evidenceId: string;
  classification: EvidenceClassification;
  sourceLocation?: string;
  collectorId?: string;
  integrityHash?: string;
  sealed: boolean;
}

const evidenceLedger = new Map<string, Array<{ ts: number; action: string; actor?: string }>>();

export const evidenceChainHandler: TraitHandler<EvidenceChainConfig> = {
  name: 'evidence_chain',
  defaultConfig: {
    evidenceId: '',
    classification: 'physical',
    sealed: false,
  },
  onAttach(node: HSPlusNode, config: EvidenceChainConfig, ctx: TraitContext): void {
    const id = node.id ?? config.evidenceId ?? 'unknown';
    evidenceLedger.set(id, [{ ts: Date.now(), action: 'attached', actor: config.collectorId }]);
    ctx.emit?.('evidence_chain:attached', { nodeId: id, evidenceId: config.evidenceId });
  },
  onDetach(node: HSPlusNode, config: EvidenceChainConfig, ctx: TraitContext): void {
    const id = node.id ?? config.evidenceId ?? 'unknown';
    ctx.emit?.('evidence_chain:detached', { nodeId: id, evidenceId: config.evidenceId });
  },
  onEvent(node: HSPlusNode, config: EvidenceChainConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? config.evidenceId ?? 'unknown';
    const logs = evidenceLedger.get(id) ?? [];

    if (event.type === 'evidence_chain:seal') {
      config.sealed = true;
      logs.push({ ts: Date.now(), action: 'sealed', actor: event.payload?.actor as string | undefined });
      evidenceLedger.set(id, logs);
      ctx.emit?.('evidence_chain:sealed', { nodeId: id, evidenceId: config.evidenceId });
    }

    if (event.type === 'evidence_chain:transfer') {
      logs.push({ ts: Date.now(), action: 'transfer', actor: event.payload?.actor as string | undefined });
      evidenceLedger.set(id, logs);
      ctx.emit?.('evidence_chain:transferred', {
        nodeId: id,
        evidenceId: config.evidenceId,
        to: event.payload?.to,
      });
    }

    if (event.type === 'evidence_chain:get_log') {
      ctx.emit?.('evidence_chain:log', { nodeId: id, evidenceId: config.evidenceId, entries: logs });
    }
  },
};

export const EVIDENCE_CHAIN_TRAIT = {
  name: 'evidence_chain',
  category: 'forensics',
  description: 'Evidence tracking with provenance and integrity metadata.',
};
