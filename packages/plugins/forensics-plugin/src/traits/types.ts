export interface HSPlusNode {
  id?: string;
  name?: string;
}

export interface TraitEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface TraitContext {
  emit?: (type: string, payload?: Record<string, unknown>) => void;
}

export interface TraitHandler<TConfig = unknown> {
  name: string;
  defaultConfig: TConfig;
  onAttach?: (node: HSPlusNode, config: TConfig, ctx: TraitContext) => void;
  onDetach?: (node: HSPlusNode, config: TConfig, ctx: TraitContext) => void;
  onUpdate?: (node: HSPlusNode, config: TConfig, ctx: TraitContext, delta: number) => void;
  onEvent?: (node: HSPlusNode, config: TConfig, ctx: TraitContext, event: TraitEvent) => void;
}

export type EvidenceClassification = 'physical' | 'digital' | 'biological' | 'trace' | 'documentary';
export type CustodyStatus = 'collected' | 'sealed' | 'in_transit' | 'in_storage' | 'released';
