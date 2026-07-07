export const UAAL_SEMANTIC_GATE_VERSION = 'uaal-v2-semantic-gate.v1' as const;

export interface UAALSemanticGateEntity {
  id: string;
  [key: string]: unknown;
}

export interface UAALSemanticGateProposition {
  id: string;
  negates?: string | null;
  [key: string]: unknown;
}

export interface UAALSemanticGateEvent {
  id: string;
  facts?: string[];
  multiPerspective?: boolean;
  [key: string]: unknown;
}

export interface UAALSemanticGateBelief {
  id?: string;
  agent?: string;
  prop?: string;
  about?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface UAALSemanticGatePerspective {
  id?: string;
  agent?: string;
  event?: string;
  sees?: string[];
  frames?: string;
  feels?: string[];
  [key: string]: unknown;
}

export interface UAALSemanticGateCausalLink {
  cause?: string;
  from?: string;
  effect?: string;
  to?: string;
  [key: string]: unknown;
}

export interface UAALSemanticGateDesire {
  id?: string;
  agent?: string;
  prop?: string;
  [key: string]: unknown;
}

export interface UAALSemanticGateIntent {
  id?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface UAALSemanticGateEmotion {
  id?: string;
  agent?: string;
  cause?: string;
  [key: string]: unknown;
}

export interface UAALSemanticGateIR {
  entities?: UAALSemanticGateEntity[];
  propositions?: UAALSemanticGateProposition[];
  events?: UAALSemanticGateEvent[];
  beliefs?: UAALSemanticGateBelief[];
  desires?: UAALSemanticGateDesire[];
  intents?: UAALSemanticGateIntent[];
  perspectives?: UAALSemanticGatePerspective[];
  causal?: UAALSemanticGateCausalLink[];
  emotions?: UAALSemanticGateEmotion[];
  [key: string]: unknown;
}

export interface UAALSemanticGateMetrics {
  entities: number;
  propositions: number;
  events: number;
  beliefs: number;
  nestedToM: number;
  falseBeliefs: number;
  perspectives: number;
  perspectiveEvents: number;
  causalLinks: number;
  emotions: number;
}

export interface UAALSemanticGateResult {
  schema: typeof UAAL_SEMANTIC_GATE_VERSION;
  pass: boolean;
  errors: string[];
  richness: string[];
  metrics: UAALSemanticGateMetrics;
}

function ids(values: Array<{ id?: string }>): Set<string> {
  return new Set(values.map((value) => value.id).filter((id): id is string => typeof id === 'string' && id.length > 0));
}

function label(prefix: string, id: unknown, index: number): string {
  return typeof id === 'string' && id.length > 0 ? `${prefix} ${id}` : `${prefix}[${index}]`;
}

function has(set: Set<string>, id: unknown, context: string, errors: string[]): void {
  if (id == null) return;
  if (typeof id !== 'string' || id.length === 0) {
    errors.push(`${context}: invalid ref ${JSON.stringify(id)}`);
  } else if (!set.has(id)) {
    errors.push(`${context}: unresolved ref '${id}'`);
  }
}

function edgeSource(edge: UAALSemanticGateCausalLink): string | null {
  return typeof edge.cause === 'string' ? edge.cause : typeof edge.from === 'string' ? edge.from : null;
}

function edgeTarget(edge: UAALSemanticGateCausalLink): string | null {
  return typeof edge.effect === 'string' ? edge.effect : typeof edge.to === 'string' ? edge.to : null;
}

function hasCycle(adjacency: Map<string, string[]>): string | null {
  const seen = new Set<string>();
  const stack = new Set<string>();

  const visit = (node: string): string | null => {
    if (stack.has(node)) return node;
    if (seen.has(node)) return null;
    seen.add(node);
    stack.add(node);
    for (const next of adjacency.get(node) || []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.delete(node);
    return null;
  };

  for (const node of adjacency.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function interiorityKey(perspective: UAALSemanticGatePerspective): string {
  return JSON.stringify({
    frames: perspective.frames ?? null,
    feels: perspective.feels ?? [],
  });
}

export function semanticGate(ir: UAALSemanticGateIR): UAALSemanticGateResult {
  const errors: string[] = [];
  const richness: string[] = [];

  const entityIds = ids(ir.entities || []);
  const propositionIds = ids(ir.propositions || []);
  const eventIds = ids(ir.events || []);
  const beliefIds = ids(ir.beliefs || []);
  const desireIds = ids(ir.desires || []);
  const intentIds = ids(ir.intents || []);
  const emotionIds = ids(ir.emotions || []);
  const semanticIds = new Set([
    ...entityIds,
    ...propositionIds,
    ...eventIds,
    ...beliefIds,
    ...desireIds,
    ...intentIds,
    ...emotionIds,
  ]);

  for (const [index, proposition] of (ir.propositions || []).entries()) {
    has(propositionIds, proposition.negates, `${label('proposition', proposition.id, index)}.negates`, errors);
  }

  for (const [index, event] of (ir.events || []).entries()) {
    for (const fact of event.facts || []) {
      has(propositionIds, fact, `${label('event', event.id, index)}.facts`, errors);
    }
  }

  for (const [index, belief] of (ir.beliefs || []).entries()) {
    const prefix = label('belief', belief.id, index);
    has(entityIds, belief.agent, `${prefix}.agent`, errors);
    has(propositionIds, belief.prop, `${prefix}.prop`, errors);
    has(beliefIds, belief.about, `${prefix}.about`, errors);
    if (belief.confidence != null && (belief.confidence < 0 || belief.confidence > 1)) {
      errors.push(`${prefix}: confidence out of [0,1]`);
    }
  }

  for (const [index, desire] of (ir.desires || []).entries()) {
    const prefix = label('desire', desire.id, index);
    has(entityIds, desire.agent, `${prefix}.agent`, errors);
    has(propositionIds, desire.prop, `${prefix}.prop`, errors);
  }

  for (const [index, intent] of (ir.intents || []).entries()) {
    has(entityIds, intent.agent, `${label('intent', intent.id, index)}.agent`, errors);
  }

  for (const [index, emotion] of (ir.emotions || []).entries()) {
    const prefix = label('emotion', emotion.id, index);
    has(entityIds, emotion.agent, `${prefix}.agent`, errors);
    if (!emotion.cause) {
      errors.push(`${prefix}: ungrounded (no cause)`);
    } else {
      has(semanticIds, emotion.cause, `${prefix}.cause`, errors);
    }
  }

  const eventFacts = new Map((ir.events || []).map((event) => [event.id, new Set(event.facts || [])]));
  for (const [index, perspective] of (ir.perspectives || []).entries()) {
    const prefix = label('perspective', perspective.id, index);
    has(entityIds, perspective.agent, `${prefix}.agent`, errors);
    has(eventIds, perspective.event, `${prefix}.event`, errors);
    const facts = typeof perspective.event === 'string' ? eventFacts.get(perspective.event) || new Set<string>() : new Set<string>();
    for (const fact of perspective.sees || []) {
      if (!facts.has(fact)) {
        errors.push(`${prefix}: SEES '${fact}' not in event '${String(perspective.event)}' facts - perception ungrounded`);
      }
    }
  }

  for (const event of (ir.events || []).filter((candidate) => candidate.multiPerspective)) {
    const perspectives = (ir.perspectives || []).filter((perspective) => perspective.event === event.id);
    if (perspectives.length < 2) {
      errors.push(`event ${event.id}: multiPerspective but <2 perspectives`);
    } else if (new Set(perspectives.map(interiorityKey)).size < 2) {
      errors.push(`event ${event.id}: perspectives share identical interiority (not multi-perspective)`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const [index, causal] of (ir.causal || []).entries()) {
    const source = edgeSource(causal);
    const target = edgeTarget(causal);
    const prefix = label('causal', `${source ?? '?'}->${target ?? '?'}`, index);
    if (!source || !target) {
      errors.push(`${prefix}: missing cause/effect endpoint`);
      continue;
    }
    has(semanticIds, source, `${prefix}.cause`, errors);
    has(semanticIds, target, `${prefix}.effect`, errors);
    adjacency.set(source, [...(adjacency.get(source) || []), target]);
  }
  const cycle = hasCycle(adjacency);
  if (cycle) errors.push(`causal graph has a cycle at '${cycle}'`);

  const falseBeliefs = (ir.beliefs || []).filter((belief) => {
    const prop = belief.prop;
    if (typeof prop !== 'string') return false;
    const objectivelyTrue = (ir.events || []).some((event) => (event.facts || []).includes(prop));
    const contradicts = (ir.propositions || []).find((proposition) => proposition.id === prop)?.negates;
    return !objectivelyTrue || (typeof contradicts === 'string' && (ir.events || []).some((event) => (event.facts || []).includes(contradicts)));
  });
  const nestedToM = (ir.beliefs || []).filter((belief) => belief.about);
  if (falseBeliefs.length > 0) {
    richness.push(`${falseBeliefs.length} false belief(s): ${falseBeliefs.map((belief) => belief.id || '?').join(', ')}`);
  }
  if (nestedToM.length > 0) {
    richness.push(`${nestedToM.length} nested belief(s): ${nestedToM.map((belief) => belief.id || '?').join(', ')}`);
  }

  return {
    schema: UAAL_SEMANTIC_GATE_VERSION,
    pass: errors.length === 0,
    errors,
    richness,
    metrics: {
      entities: entityIds.size,
      propositions: propositionIds.size,
      events: eventIds.size,
      beliefs: beliefIds.size,
      nestedToM: nestedToM.length,
      falseBeliefs: falseBeliefs.length,
      perspectives: (ir.perspectives || []).length,
      perspectiveEvents: new Set((ir.perspectives || []).map((perspective) => perspective.event).filter(Boolean)).size,
      causalLinks: (ir.causal || []).length,
      emotions: (ir.emotions || []).length,
    },
  };
}
