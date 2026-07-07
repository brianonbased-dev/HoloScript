export interface UAALRateTest {
  hits: number;
  total: number;
  rate: number;
  floor: number;
  pass: boolean;
}

export interface UAALEmergentBaselineTest {
  emergentRate: number;
  edge: number;
  floor: number;
  pass: boolean;
  flagRate?: number;
  naiveRate?: number;
  flatRate?: number;
}

export interface UAALSemanticBenchmarkRow<TCompletion = unknown, TMetadata = Record<string, unknown>> {
  completion: string | TCompletion;
  metadata?: TMetadata;
}

export interface UAALSemanticProposition {
  id: string;
  negates?: string | null;
  [key: string]: unknown;
}

export interface UAALSemanticBelief {
  id?: string;
  agent?: string;
  prop?: string;
  [key: string]: unknown;
}

export interface UAALSemanticCausalLink {
  from?: string;
  to?: string;
  effect?: string;
  mechanism?: string | null;
  [key: string]: unknown;
}

export interface UAALTheoryOfMindIR {
  propositions?: UAALSemanticProposition[];
  beliefs?: UAALSemanticBelief[];
  causal?: UAALSemanticCausalLink[];
  [key: string]: unknown;
}

export interface UAALTheoryOfMindMetadata extends Record<string, unknown> {
  id?: string;
  variant_id?: string;
  conflict_type?: string;
}

export interface FalseBeliefRecovery {
  holder: string;
  believedProp: string;
  truthProp: string;
  mechanism: string | null;
}

export interface UAALTheoryOfMindBenchmarkResult {
  n: number;
  tests: {
    t1_false_belief_recall: UAALRateTest;
    t2_mechanism_fidelity: UAALRateTest;
    t3_nested_theory_of_mind: UAALRateTest;
    t4_falsification_flip: UAALRateTest;
  };
  pass: boolean;
  t2miss: string[];
}

export interface UAALSemanticEntity {
  id: string;
  kind?: string;
  label?: string;
  opaque?: boolean;
  [key: string]: unknown;
}

export interface UAALSemanticEvent {
  id: string;
  object?: string | null;
  telos?: {
    beneficiary?: string | null;
    goal?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface UAALSemanticPerspective {
  stance?: string;
  telos_gap?: boolean;
  claims_sees?: string[];
  [key: string]: unknown;
}

export interface UAALTelosIR {
  entities?: UAALSemanticEntity[];
  events?: UAALSemanticEvent[];
  causal?: UAALSemanticCausalLink[];
  perspectives?: UAALSemanticPerspective[];
  [key: string]: unknown;
}

export interface UAALTelosMetadata extends Record<string, unknown> {
  id?: string;
  telos_gap?: boolean;
  beneficiary?: string | null;
}

export interface TelosRecovery {
  gap: boolean;
  beneficiary?: string | null;
}

export interface UAALTelosBenchmarkResult {
  n: number;
  tests: {
    tt1_discrimination: UAALRateTest;
    tt2_beneficiary_fidelity: UAALRateTest;
    tt3_outward_stance: UAALRateTest;
    tt4_falsification_flip: UAALRateTest;
    emergent_beats_flag: UAALEmergentBaselineTest & { flagRate: number };
  };
  pass: boolean;
  misses: {
    tt1: string[];
    tt2: string[];
    tt4: string[];
  };
}

export interface UAALContainmentRelation {
  inner: string;
  outer: string;
  [key: string]: unknown;
}

export interface UAALContainmentQuery {
  agent?: string;
  object?: string;
  [key: string]: unknown;
}

export interface UAALContainmentIR {
  entities?: UAALSemanticEntity[];
  containment?: UAALContainmentRelation[];
  perspectives?: UAALSemanticPerspective[];
  query?: UAALContainmentQuery;
  [key: string]: unknown;
}

export interface UAALContainmentMetadata extends Record<string, unknown> {
  id?: string;
  occluded?: boolean;
  occluder?: string | null;
}

export interface OcclusionRecovery {
  occluded: boolean;
  occluder?: string | null;
}

export interface UAALContainmentBenchmarkResult {
  n: number;
  tests: {
    st1_discrimination: UAALRateTest;
    st2_occluder_fidelity: UAALRateTest;
    st3_perception_grounding: UAALRateTest;
    st4_falsification_flip: UAALRateTest;
    emergent_beats_naive: UAALEmergentBaselineTest & { naiveRate: number; flatRate: number };
  };
  pass: boolean;
  misses: {
    st1: string[];
    st2: string[];
    st4: string[];
  };
}

export const UAAL_THEORY_OF_MIND_THRESHOLDS = {
  t1: 0.98,
  t2: 0.8,
  t3: 0.9,
  t4: 0.98,
} as const;

export const UAAL_TELOS_THRESHOLDS = {
  tt1: 0.95,
  tt2: 0.9,
  tt3: 0.95,
  tt4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_CONTAINMENT_THRESHOLDS = {
  st1: 0.95,
  st2: 0.9,
  st3: 0.95,
  st4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_SEMANTIC_THRESHOLDS = {
  theoryOfMind: UAAL_THEORY_OF_MIND_THRESHOLDS,
  telos: UAAL_TELOS_THRESHOLDS,
  containment: UAAL_CONTAINMENT_THRESHOLDS,
} as const;

function safeParseCompletion<T>(completion: string | T): T | null {
  if (typeof completion !== 'string') {
    return completion ?? null;
  }

  try {
    return JSON.parse(completion) as T;
  } catch {
    return null;
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rate(hits: number, total: number): number {
  return total ? hits / total : 0;
}

function norm(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
}

function declaredTheoryOfMindType(meta: UAALTheoryOfMindMetadata): string {
  return norm(meta.variant_id || String(meta.conflict_type || '').replace(/^false_belief_from_/, ''));
}

function makeRateTest(hits: number, total: number, floor: number): UAALRateTest {
  const hitRate = rate(hits, total);
  return {
    hits,
    total,
    rate: hitRate,
    floor,
    pass: hitRate >= floor,
  };
}

function truthyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function opacityMap(ir: UAALContainmentIR): Map<string, boolean> {
  return new Map((ir.entities || []).filter((entity) => truthyString(entity.id)).map((entity) => [entity.id, Boolean(entity.opaque)]));
}

function outerOf(ir: UAALContainmentIR): Map<string, string> {
  const map = new Map<string, string>();
  for (const relation of ir.containment || []) {
    if (truthyString(relation.inner) && truthyString(relation.outer)) {
      map.set(relation.inner, relation.outer);
    }
  }
  return map;
}

export function recoverFalseBelief(ir: UAALTheoryOfMindIR): FalseBeliefRecovery | null {
  const props = new Map((ir.propositions || []).filter((prop) => truthyString(prop.id)).map((prop) => [prop.id, prop]));
  const believed = new Map<string, string>();
  for (const belief of ir.beliefs || []) {
    if (truthyString(belief.prop) && truthyString(belief.agent)) {
      believed.set(belief.prop, belief.agent);
    }
  }

  const pairs: Array<[string, string]> = [];
  for (const prop of ir.propositions || []) {
    if (truthyString(prop.id) && truthyString(prop.negates) && props.has(prop.negates)) {
      pairs.push([prop.id, prop.negates]);
    }
  }

  for (const [believedProp, truthProp] of pairs) {
    const holder = believed.get(believedProp);
    if (!holder) continue;
    const cause = (ir.causal || []).find((causal) => {
      const belief = (ir.beliefs || []).find((candidate) => candidate.prop === believedProp);
      return Boolean(belief && (causal.effect === belief.id || causal.effect === believedProp));
    });
    return {
      holder,
      believedProp,
      truthProp,
      mechanism: cause?.mechanism || null,
    };
  }

  return null;
}

export function benchmarkTheoryOfMind(
  rows: Array<UAALSemanticBenchmarkRow<UAALTheoryOfMindIR, UAALTheoryOfMindMetadata>>,
): UAALTheoryOfMindBenchmarkResult {
  let n = 0;
  let t1 = 0;
  let t2 = 0;
  let t2denom = 0;
  let t3 = 0;
  let t4flip = 0;
  const t2miss: string[] = [];

  for (const row of rows) {
    const ir = safeParseCompletion<UAALTheoryOfMindIR>(row.completion);
    if (!ir) continue;
    n++;

    const falseBelief = recoverFalseBelief(ir);
    if (falseBelief) t1++;

    const declared = declaredTheoryOfMindType(row.metadata || {});
    if (falseBelief?.mechanism && declared) {
      t2denom++;
      const mechanism = norm(falseBelief.mechanism);
      const hit = declared.includes(mechanism) || mechanism.includes(declared);
      if (hit) {
        t2++;
      } else if (t2miss.length < 6) {
        t2miss.push(`decl='${declared}' vs mech='${mechanism}'`);
      }
    }

    if ((ir.causal || []).some((causal) => /theory.?of.?mind|models?|nest/i.test(causal.mechanism || ''))) {
      t3++;
    }

    const corrupt = cloneJson(ir);
    for (const prop of corrupt.propositions || []) {
      delete prop.negates;
    }
    if (!recoverFalseBelief(corrupt)) t4flip++;
  }

  const tests = {
    t1_false_belief_recall: makeRateTest(t1, n, UAAL_THEORY_OF_MIND_THRESHOLDS.t1),
    t2_mechanism_fidelity: makeRateTest(t2, t2denom, UAAL_THEORY_OF_MIND_THRESHOLDS.t2),
    t3_nested_theory_of_mind: makeRateTest(t3, n, UAAL_THEORY_OF_MIND_THRESHOLDS.t3),
    t4_falsification_flip: makeRateTest(t4flip, n, UAAL_THEORY_OF_MIND_THRESHOLDS.t4),
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    t2miss,
  };
}

export const benchmarkUaal = benchmarkTheoryOfMind;

export function recoverTelosGap(ir: UAALTelosIR): TelosRecovery {
  const beneficiaries = new Set((ir.entities || []).filter((entity) => entity.kind === 'beneficiary').map((entity) => entity.id));
  if (beneficiaries.size === 0) {
    return { gap: true, beneficiary: null };
  }

  const adjacency = new Map<string, Set<string>>();
  const edge = (from: unknown, to: unknown): void => {
    if (!truthyString(from) || !truthyString(to)) return;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)?.add(to);
  };

  const seeds: string[] = [];
  for (const event of ir.events || []) {
    if (!truthyString(event.id)) continue;
    seeds.push(event.id);
    edge(event.id, event.object);
    edge(event.id, event.telos?.beneficiary);
  }

  for (const causal of ir.causal || []) {
    edge(causal.from, causal.to);
  }

  const seen = new Set<string>();
  const stack = [...seeds];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) stack.push(next);
    }
  }

  const beneficiary = [...beneficiaries].find((candidate) => seen.has(candidate)) || null;
  return { gap: beneficiary === null, beneficiary };
}

export function flagOnlyTelosGap(ir: UAALTelosIR): TelosRecovery {
  const events = ir.events || [];
  if (events.length === 0) {
    return { gap: true };
  }

  const anyTelos = events.some((event) => truthyString(event.telos?.beneficiary));
  return { gap: !anyTelos };
}

export const flagOnlyGap = flagOnlyTelosGap;

export function benchmarkTelos(
  rows: Array<UAALSemanticBenchmarkRow<UAALTelosIR, UAALTelosMetadata>>,
): UAALTelosBenchmarkResult {
  let n = 0;
  let tt1 = 0;
  let tt2 = 0;
  let tt2denom = 0;
  let tt3 = 0;
  let tt4 = 0;
  let flagCorrect = 0;
  const misses = { tt1: [] as string[], tt2: [] as string[], tt4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALTelosIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const expectedGap = Boolean(groundTruth.telos_gap);
    const recovered = recoverTelosGap(ir);
    const flag = flagOnlyTelosGap(ir);

    if (recovered.gap === expectedGap) {
      tt1++;
    } else if (misses.tt1.length < 8) {
      misses.tt1.push(`${groundTruth.id}: recovered gap=${recovered.gap} truth=${expectedGap}`);
    }
    if (flag.gap === expectedGap) flagCorrect++;

    if (!expectedGap) {
      tt2denom++;
      if (recovered.beneficiary === groundTruth.beneficiary) {
        tt2++;
      } else if (misses.tt2.length < 8) {
        misses.tt2.push(`${groundTruth.id}: got ${recovered.beneficiary} want ${groundTruth.beneficiary}`);
      }
    }

    const outward = (ir.perspectives || []).find((perspective) => perspective.stance === 'outward');
    if (outward && Boolean(outward.telos_gap) === expectedGap) tt3++;

    const corrupt = cloneJson(ir);
    if (expectedGap) {
      corrupt.entities = [...(corrupt.entities || []), { id: '__ben_injected', kind: 'beneficiary', label: 'injected' }];
      if (corrupt.events?.[0]) {
        corrupt.events[0].telos = { beneficiary: '__ben_injected', goal: 'injected' };
      }
    } else {
      const beneficiaryIds = new Set((corrupt.entities || []).filter((entity) => entity.kind === 'beneficiary').map((entity) => entity.id));
      corrupt.entities = (corrupt.entities || []).filter((entity) => entity.kind !== 'beneficiary');
      for (const event of corrupt.events || []) event.telos = null;
      corrupt.causal = (corrupt.causal || []).filter((causal) => !beneficiaryIds.has(causal.to || ''));
    }

    const corruptRecovered = recoverTelosGap(corrupt);
    if (corruptRecovered.gap !== recovered.gap) {
      tt4++;
    } else if (misses.tt4.length < 8) {
      misses.tt4.push(`${groundTruth.id}: gap stayed ${recovered.gap} after corruption`);
    }
  }

  const tt1Rate = rate(tt1, n);
  const flagRate = rate(flagCorrect, n);
  const emergentEdge = tt1Rate - flagRate;
  const tests = {
    tt1_discrimination: makeRateTest(tt1, n, UAAL_TELOS_THRESHOLDS.tt1),
    tt2_beneficiary_fidelity: makeRateTest(tt2, tt2denom, UAAL_TELOS_THRESHOLDS.tt2),
    tt3_outward_stance: makeRateTest(tt3, n, UAAL_TELOS_THRESHOLDS.tt3),
    tt4_falsification_flip: makeRateTest(tt4, n, UAAL_TELOS_THRESHOLDS.tt4),
    emergent_beats_flag: {
      emergentRate: tt1Rate,
      flagRate,
      edge: emergentEdge,
      floor: UAAL_TELOS_THRESHOLDS.emergentEdge,
      pass: emergentEdge >= UAAL_TELOS_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

export function enclosingChain(ir: UAALContainmentIR, id: string | undefined): string[] {
  if (!id) return [];
  const outer = outerOf(ir);
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = outer.get(id);
  while (current != null && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = outer.get(current);
  }
  return chain;
}

export function recoverOcclusion(ir: UAALContainmentIR, agent: string | undefined, object: string | undefined): OcclusionRecovery {
  const opaque = opacityMap(ir);
  const objectChain = enclosingChain(ir, object);
  const agentEnclosures = new Set(enclosingChain(ir, agent));

  for (const container of objectChain) {
    if (agentEnclosures.has(container)) break;
    if (opaque.get(container)) return { occluded: true, occluder: container };
  }

  return { occluded: false, occluder: null };
}

export function flatSeesOcclusion(): OcclusionRecovery {
  return { occluded: false };
}

export function naiveOpacityOcclusion(ir: UAALContainmentIR, object: string | undefined): OcclusionRecovery {
  const opaque = opacityMap(ir);
  const occluded = enclosingChain(ir, object).some((container) => opaque.get(container));
  return { occluded };
}

export function benchmarkContainment(
  rows: Array<UAALSemanticBenchmarkRow<UAALContainmentIR, UAALContainmentMetadata>>,
): UAALContainmentBenchmarkResult {
  let n = 0;
  let st1 = 0;
  let st2 = 0;
  let st2denom = 0;
  let st3 = 0;
  let st4 = 0;
  let flatCorrect = 0;
  let naiveCorrect = 0;
  const misses = { st1: [] as string[], st2: [] as string[], st4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALContainmentIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const query = ir.query || {};
    const expectedOccluded = Boolean(groundTruth.occluded);
    const recovered = recoverOcclusion(ir, query.agent, query.object);

    if (recovered.occluded === expectedOccluded) {
      st1++;
    } else if (misses.st1.length < 8) {
      misses.st1.push(`${groundTruth.id}: got ${recovered.occluded} want ${expectedOccluded}`);
    }
    if (flatSeesOcclusion().occluded === expectedOccluded) flatCorrect++;
    if (naiveOpacityOcclusion(ir, query.object).occluded === expectedOccluded) naiveCorrect++;

    if (expectedOccluded) {
      st2denom++;
      if (recovered.occluder === groundTruth.occluder) {
        st2++;
      } else if (misses.st2.length < 8) {
        misses.st2.push(`${groundTruth.id}: occluder ${recovered.occluder} want ${groundTruth.occluder}`);
      }
    }

    const perspective = (ir.perspectives || []).find((item) => (item.claims_sees || []).includes(query.object || ''));
    if (perspective) {
      const claimInvalid = recovered.occluded;
      if (claimInvalid === expectedOccluded) st3++;
    }

    const corrupt = cloneJson(ir);
    if (expectedOccluded) {
      const entity = (corrupt.entities || []).find((candidate) => candidate.id === groundTruth.occluder);
      if (entity) entity.opaque = false;
    } else {
      const opaque = opacityMap(ir);
      const objectChain = enclosingChain(ir, query.object);
      const agentEnclosures = new Set(enclosingChain(ir, query.agent));
      const sharedOpaque = objectChain.find((container) => opaque.get(container) && agentEnclosures.has(container));
      if (sharedOpaque) {
        corrupt.containment = (corrupt.containment || []).filter(
          (relation) => !(relation.inner === query.agent && relation.outer === sharedOpaque),
        );
        const region = enclosingChain(ir, sharedOpaque).slice(-1)[0] || sharedOpaque;
        if (region !== sharedOpaque) {
          corrupt.containment.push({ inner: query.agent || '', outer: region });
        }
      } else {
        const immediate = objectChain[0];
        const entity = (corrupt.entities || []).find((candidate) => candidate.id === immediate);
        if (entity) entity.opaque = true;
      }
    }

    const corruptRecovered = recoverOcclusion(corrupt, query.agent, query.object);
    if (corruptRecovered.occluded !== recovered.occluded) {
      st4++;
    } else if (misses.st4.length < 8) {
      misses.st4.push(`${groundTruth.id}: stayed ${recovered.occluded} after corruption`);
    }
  }

  const st1Rate = rate(st1, n);
  const naiveRate = rate(naiveCorrect, n);
  const flatRate = rate(flatCorrect, n);
  const emergentEdge = st1Rate - naiveRate;
  const tests = {
    st1_discrimination: makeRateTest(st1, n, UAAL_CONTAINMENT_THRESHOLDS.st1),
    st2_occluder_fidelity: makeRateTest(st2, st2denom, UAAL_CONTAINMENT_THRESHOLDS.st2),
    st3_perception_grounding: makeRateTest(st3, n, UAAL_CONTAINMENT_THRESHOLDS.st3),
    st4_falsification_flip: makeRateTest(st4, n, UAAL_CONTAINMENT_THRESHOLDS.st4),
    emergent_beats_naive: {
      emergentRate: st1Rate,
      naiveRate,
      flatRate,
      edge: emergentEdge,
      floor: UAAL_CONTAINMENT_THRESHOLDS.emergentEdge,
      pass: emergentEdge >= UAAL_CONTAINMENT_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}
