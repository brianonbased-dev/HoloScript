import type { HSPlusNode } from '../../types/HoloScriptPlus';
import type { TraitContext } from '../TraitTypes';

export type V6RuntimeContractStatus = 'registered' | 'detached';

export interface V6RuntimeContract<TConfig = unknown> {
  version: 1;
  trait: string;
  kind: string;
  key: string;
  nodeId: string;
  runtime: 'contract-only';
  status: 'registered';
  config: TConfig;
  capabilities: string[];
  events: {
    attached: string;
    detached: string;
  };
}

export interface V6RuntimeContractReceipt<TConfig = unknown> {
  version: 1;
  trait: string;
  kind: string;
  key: string;
  nodeId: string;
  status: V6RuntimeContractStatus;
  found: boolean;
  contract?: V6RuntimeContract<TConfig>;
}

export interface V6RuntimeContractDescriptor<TConfig> {
  trait: string;
  kind: string;
  key: string;
  config: TConfig;
  capabilities: string[];
  events: {
    attached: string;
    detached: string;
  };
}

type V6RuntimeContractNode = HSPlusNode & {
  __v6RuntimeContracts?: V6RuntimeContract[];
};

export function attachV6RuntimeContract<TConfig>(
  node: HSPlusNode,
  context: TraitContext,
  descriptor: V6RuntimeContractDescriptor<TConfig>
): V6RuntimeContract<TConfig> {
  const contract: V6RuntimeContract<TConfig> = {
    version: 1,
    trait: descriptor.trait,
    kind: descriptor.kind,
    key: descriptor.key,
    nodeId: getNodeId(node),
    runtime: 'contract-only',
    status: 'registered',
    config: descriptor.config,
    capabilities: descriptor.capabilities,
    events: descriptor.events,
  };

  const contractNode = node as V6RuntimeContractNode;
  const contracts = contractNode.__v6RuntimeContracts ?? [];
  const existingIndex = contracts.findIndex(
    (candidate) => candidate.trait === contract.trait && candidate.key === contract.key
  );

  if (existingIndex >= 0) {
    contracts[existingIndex] = contract as V6RuntimeContract;
  } else {
    contracts.push(contract as V6RuntimeContract);
  }

  contractNode.__v6RuntimeContracts = contracts;
  context.emit?.('v6:runtime_contract_registered', contract);
  context.emit?.(descriptor.events.attached, contract);

  return contract;
}

export function detachV6RuntimeContract<TConfig>(
  node: HSPlusNode,
  context: TraitContext,
  descriptor: Pick<V6RuntimeContractDescriptor<TConfig>, 'trait' | 'kind' | 'key' | 'events'>
): V6RuntimeContractReceipt<TConfig> {
  const contractNode = node as V6RuntimeContractNode;
  const contracts = contractNode.__v6RuntimeContracts ?? [];
  const existingIndex = contracts.findIndex(
    (candidate) => candidate.trait === descriptor.trait && candidate.key === descriptor.key
  );
  const [contract] = existingIndex >= 0 ? contracts.splice(existingIndex, 1) : [];

  if (contracts.length > 0) {
    contractNode.__v6RuntimeContracts = contracts;
  } else {
    delete contractNode.__v6RuntimeContracts;
  }

  const receipt: V6RuntimeContractReceipt<TConfig> = {
    version: 1,
    trait: descriptor.trait,
    kind: descriptor.kind,
    key: descriptor.key,
    nodeId: getNodeId(node),
    status: 'detached',
    found: Boolean(contract),
    contract: contract as V6RuntimeContract<TConfig> | undefined,
  };

  context.emit?.('v6:runtime_contract_detached', receipt);
  context.emit?.(descriptor.events.detached, receipt);

  return receipt;
}

function getNodeId(node: HSPlusNode): string {
  return String(node.id ?? node.name ?? 'anonymous');
}
