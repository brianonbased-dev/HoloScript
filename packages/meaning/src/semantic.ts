// Stratum-② contract — defined in ./contract (this package IS the meaning home, §8.2 stage 2).
import {
  structuredGap,
  aleatoricGap,
  type UAALGapReason,
  type UAALEpistemicReason,
  type UAALStructuredGap,
  type UAALResolution,
} from './contract';

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
  baselineRate?: number;
  compositeRate?: number;
  bestSingle?: number;
  singleRates?: Record<string, number>;
}

export interface UAALSemanticBenchmarkRow<
  TCompletion = unknown,
  TMetadata = Record<string, unknown>,
> {
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
  body?: Record<string, number>;
  offers?: UAALAffordanceOffer[];
  blocks?: string[];
  /**
   * Modalities whose blocking by this entity is explicitly UNSTATED (A6 IR extension,
   * D.108). `blocks` stays closed-world (absence = definitely does not block); an author
   * who genuinely does not know whether a barrier passes a modality declares it here, and
   * `resolveAccess` abstains when such a container sits between agent and object. Visual
   * unknowns are conventionally expressed via `opaque` being absent (the field is already
   * three-valued); `blocks_unknown` is for audible+ modalities, which have no other
   * three-valued form. A modality must not appear in both `blocks` and `blocks_unknown`.
   */
  blocks_unknown?: string[];
  [key: string]: unknown;
}

export interface UAALSemanticEvent {
  id: string;
  object?: string | null;
  t?: number;
  actor?: string;
  act?: string;
  predicate?: string;
  recipient?: string;
  on_behalf_of?: string;
  magnitude?: number;
  world_change?: boolean;
  fact?: string;
  sets?: boolean;
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

export interface UAALAffordanceOffer {
  action: string;
  requires?: Record<string, number>;
  preconditions?: string[];
  [key: string]: unknown;
}

export interface UAALAffordanceQuery {
  agent?: string;
  action?: string;
  object?: string;
  [key: string]: unknown;
}

export interface UAALAffordanceIR {
  entities?: UAALSemanticEntity[];
  propositions?: Array<UAALSemanticProposition & { holds?: boolean }>;
  beliefs?: UAALSemanticBelief[];
  query?: UAALAffordanceQuery;
  [key: string]: unknown;
}

export interface UAALAffordanceMetadata extends Record<string, unknown> {
  id?: string;
  affords?: boolean;
  block_reason?: string | null;
}

export interface AffordanceRecovery {
  affords: boolean;
  reason: string | null;
}

export interface UAALAffordanceBenchmarkResult {
  n: number;
  tests: {
    at1_discrimination: UAALRateTest;
    at2_block_fidelity: UAALRateTest;
    at3_mind_independence: UAALRateTest;
    at4_falsification_flip: UAALRateTest;
    emergent_beats_baseline: UAALEmergentBaselineTest & { baselineRate: number };
  };
  pass: boolean;
  misses: {
    at1: string[];
    at2: string[];
    at4: string[];
  };
}

export interface UAALTemporalFact {
  id: string;
  initial?: boolean;
  [key: string]: unknown;
}

export interface UAALTemporalBelief {
  id: string;
  prop?: boolean;
  t_formed?: number;
  [key: string]: unknown;
}

export interface UAALTemporalQuery {
  belief?: string;
  fact?: string;
  [key: string]: unknown;
}

export interface UAALTemporalIR {
  facts?: UAALTemporalFact[];
  events?: UAALSemanticEvent[];
  beliefs?: UAALTemporalBelief[];
  temporal_order?: string[];
  t_now?: number;
  query?: UAALTemporalQuery;
  [key: string]: unknown;
}

export type UAALBeliefStatus = 'fresh' | 'stale' | 'error' | 'unknown';

export interface UAALTemporalMetadata extends Record<string, unknown> {
  id?: string;
  belief_status?: UAALBeliefStatus;
  change_event?: string | null;
}

export interface BeliefStatusRecovery {
  status: UAALBeliefStatus;
  change_event?: string | null;
}

export interface UAALTemporalBenchmarkResult {
  n: number;
  tests: {
    tt1_discrimination: UAALRateTest;
    tt2_change_fidelity: UAALRateTest;
    tt3_order_sanity: UAALRateTest;
    tt4_falsification_flip: UAALRateTest;
    emergent_beats_naive: UAALEmergentBaselineTest & { naiveRate: number };
  };
  pass: boolean;
  misses: {
    tt1: string[];
    tt2: string[];
    tt4: string[];
  };
}

export type UAALDeonticForce = 'O' | 'P' | 'F';
export type UAALNormStatus = 'complied' | 'violated';

export interface UAALDeonticNorm {
  id: string;
  force?: UAALDeonticForce;
  authority?: string;
  addressee?: string;
  required_act?: string;
  active?: boolean;
  // A scarce resource this norm lays claim to. When two ACTIVE obligations (force 'O') name the same non-empty
  // `resource` with no precedence, they are jointly unsatisfiable (resource contention) — a genuine dilemma
  // distinct from the O-vs-F same-act case.
  resource?: string;
  [key: string]: unknown;
}

export interface UAALDeonticBelief {
  confidence?: number;
  [key: string]: unknown;
}

export interface UAALDeonticDesire {
  satisfied?: boolean;
  [key: string]: unknown;
}

export interface UAALDeonticIR {
  norms?: UAALDeonticNorm[];
  events?: UAALSemanticEvent[];
  beliefs?: UAALDeonticBelief[];
  desires?: UAALDeonticDesire[];
  query?: { norm?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface UAALDeonticMetadata extends Record<string, unknown> {
  id?: string;
  class?: string;
  norm_status?: UAALNormStatus;
}

export interface NormStatusRecovery {
  status: UAALNormStatus;
  force: UAALDeonticForce | null;
  fulfilledBy: string | null;
}

export interface UAALDeonticBenchmarkResult {
  n: number;
  tests: {
    dt1_discrimination: UAALRateTest;
    dt2_fulfillment_fidelity: UAALRateTest;
    dt3_norm_structural_sanity: UAALRateTest;
    dt4_falsification_flip: UAALRateTest;
    emergent_beats_naive: UAALEmergentBaselineTest & { naiveRate: number };
  };
  pass: boolean;
  misses: {
    dt1: string[];
    dt2: string[];
    dt4: string[];
  };
}

export type UAALCommitmentStatus = 'discharged' | 'broken' | 'open';

export interface UAALPledgedAct {
  type?: string;
  recipient?: string;
  magnitude?: number;
  [key: string]: unknown;
}

export interface UAALCommitment {
  id: string;
  promisor?: string;
  promisee?: string;
  pledged_act?: UAALPledgedAct;
  due_time?: number;
  [key: string]: unknown;
}

export interface UAALCommitmentClaim {
  commitment?: string;
  asserts_status?: UAALCommitmentStatus;
  [key: string]: unknown;
}

export interface UAALCommitmentIR {
  commitments?: UAALCommitment[];
  events?: UAALSemanticEvent[];
  claims?: UAALCommitmentClaim[];
  now?: number;
  query?: { commitment?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface UAALCommitmentMetadata extends Record<string, unknown> {
  id?: string;
  commitment_status?: UAALCommitmentStatus;
  fulfilling_recipient?: string | null;
}

export interface CommitmentStatusRecovery {
  status: UAALCommitmentStatus;
  fulfilling: UAALSemanticEvent | null;
}

export interface UAALCommitmentBenchmarkResult {
  n: number;
  tests: {
    cm1_discrimination: UAALRateTest;
    cm2_recipient_fidelity: UAALRateTest;
    cm3_structural_sanity: UAALRateTest;
    cm4_falsification_flip: UAALRateTest;
    emergent_beats_flag: UAALEmergentBaselineTest & { flagRate: number };
  };
  pass: boolean;
  misses: {
    cm1: string[];
    cm2: string[];
    cm4: string[];
  };
}

export interface UAALCounterfactualEffect {
  id: string;
  sufficientSets?: string[][];
  /**
   * The effect is produced by a genuinely stochastic process (a coin flip, a decay, an irreducibly
   * random draw). When the QUERIED effect declares this, counterfactual necessity ("was any cause
   * necessary?") has no determinate answer AND no additional information would supply one — the outcome
   * is irreducibly random. `resolveCounterfactual` abstains with the ALEATORIC class in that case,
   * distinct from an underdetermined (missing sufficient set) or cyclic (ungrounded) epistemic gap.
   * Absent/false ⇒ the ordinary deterministic production model; such an effect resolves normally.
   */
  stochastic?: boolean;
  [key: string]: unknown;
}

export interface UAALCounterfactualStandby {
  id: string;
  preemptedBy?: string;
  [key: string]: unknown;
}

export interface UAALCounterfactualIR {
  effects?: UAALCounterfactualEffect[];
  standby?: UAALCounterfactualStandby[];
  occurs?: string[];
  causal?: UAALSemanticCausalLink[];
  query?: { effect?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export type UAALNecessityMap = Record<string, Record<string, boolean>>;

export interface UAALCounterfactualMetadata extends Record<string, unknown> {
  id?: string;
  class?: string;
  necessary?: UAALNecessityMap;
}

export interface UAALCounterfactualBenchmarkResult {
  n: number;
  tests: {
    ct1_discrimination: UAALRateTest;
    ct2_fidelity: UAALRateTest;
    ct3_structural: UAALRateTest;
    ct4_falsification_flip: UAALRateTest;
    emergent_beats_naive: UAALEmergentBaselineTest & { naiveRate: number };
  };
  pass: boolean;
  misses: {
    ct1: string[];
    ct2: string[];
    ct4: string[];
  };
}

export type UAALAccessModality = 'visual' | 'audible';

export interface UAALAccessState {
  visual: boolean;
  audible: boolean;
}

export interface UAALAccessBlocker {
  visual: string | null;
  audible: string | null;
}

export interface UAALAccessRecovery {
  access: UAALAccessState;
  blocker: UAALAccessBlocker;
}

export interface UAALAccessMetadata extends Record<string, unknown> {
  id?: string;
  access?: UAALAccessState;
  blocker?: Partial<UAALAccessBlocker>;
}

export interface UAALAccessBenchmarkResult {
  n: number;
  tests: {
    ot1_access_discrimination: UAALRateTest;
    ot2_blocker_fidelity: UAALRateTest;
    ot3_subsumes_containment: UAALRateTest;
    ot4_falsification_flip: UAALRateTest;
    emergent_beats_containment: UAALEmergentBaselineTest & { baselineRate: number };
  };
  pass: boolean;
  misses: {
    ot1: string[];
    ot2: string[];
    ot4: string[];
  };
}

export type UAALCompositionDimension =
  | 'norm'
  | 'counterparty'
  | 'affordance'
  | 'occlusion'
  | 'deadline';

/**
 * A discharge-ordering edge: the obligation `after` may only be discharged once `before` has been. A set of
 * these can form a cycle (A after B, B after C, C after A) — the three-body case that has no consistent
 * discharge order. Optional; absent for the ordinary independent-checklist composition IR.
 */
export interface UAALDischargeDependency {
  before: string;
  after: string;
}

export interface UAALCompositionIR {
  entities?: UAALSemanticEntity[];
  containment?: UAALContainmentRelation[];
  propositions?: Array<UAALSemanticProposition & { holds?: boolean }>;
  norm?: { force?: string; [key: string]: unknown };
  commitment?: { promisee?: string; [key: string]: unknown };
  time?: { now?: number; deadline?: number; [key: string]: unknown };
  dependencies?: UAALDischargeDependency[];
  query?: UAALAffordanceQuery & { intended_recipient?: string };
  [key: string]: unknown;
}

export interface UAALCompositionMetadata extends Record<string, unknown> {
  id?: string;
  dischargeable?: boolean;
  block_reason?: UAALCompositionDimension;
}

export interface DischargeableRecovery {
  dischargeable: boolean;
  reasons: UAALCompositionDimension[];
}

export interface UAALCompositionBenchmarkResult {
  n: number;
  tests: {
    it1_discrimination: UAALRateTest;
    it2_block_fidelity: UAALRateTest;
    it3_composition_necessary: UAALEmergentBaselineTest & {
      compositeRate: number;
      singleRates: Record<UAALCompositionDimension, number>;
      bestSingle: number;
    };
    it4_falsification_flip: UAALRateTest;
    emergent_beats_best_single: UAALEmergentBaselineTest & {
      compositeRate: number;
      bestSingle: number;
    };
  };
  pass: boolean;
  misses: {
    it1: string[];
    it2: string[];
    it4: string[];
  };
}

export interface UAALMereologyPart {
  id: string;
  role?: string;
  essential?: boolean;
  [key: string]: unknown;
}

export interface UAALMereologyChange {
  op?: 'add' | 'remove' | string;
  part?: string;
  role?: string;
  essential?: boolean;
  [key: string]: unknown;
}

export interface UAALMereologyIR {
  parts?: UAALMereologyPart[];
  part_of?: UAALContainmentRelation[];
  changes?: UAALMereologyChange[];
  query?: { whole?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface UAALMereologyMetadata extends Record<string, unknown> {
  id?: string;
  persists?: boolean;
  dissolving_role?: string | null;
}

export interface PersistenceRecovery {
  persists: boolean;
  dissolving_role: string | null;
}

export interface UAALMereologyBenchmarkResult {
  n: number;
  tests: {
    mp1_discrimination: UAALRateTest;
    mp2_dissolving_role_fidelity: UAALRateTest;
    mp3_structural_sanity: UAALRateTest;
    mp4_falsification_flip: UAALRateTest;
    emergent_beats_essentialism: UAALEmergentBaselineTest & { essentialismRate: number };
  };
  pass: boolean;
  misses: {
    mp1: string[];
    mp2: string[];
    mp4: string[];
  };
}

export interface UAALTensionNode {
  id: string;
  label?: string;
  [key: string]: unknown;
}

export interface UAALTensionEdge {
  from?: string;
  to?: string;
  via?: string;
  [key: string]: unknown;
}

export interface UAALTensionTerminal {
  id: string;
  outcome?: 'goal' | 'antigoal' | string;
  [key: string]: unknown;
}

export interface UAALTensionIR {
  nodes?: UAALTensionNode[];
  terminals?: UAALTensionTerminal[];
  unfired?: UAALTensionEdge[];
  frontier?: string;
  query?: { frontier?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TensionRecovery {
  tension: boolean;
  contradiction: { goal: string; antigoal: string } | null;
  reachedCount: number;
}

export interface UAALTensionMetadata extends Record<string, unknown> {
  id?: string;
  class?: string;
  tension?: boolean;
  contradiction?: { goal?: string; antigoal?: string } | null;
}

export interface UAALTensionBenchmarkResult {
  n: number;
  tests: {
    nt1_discrimination: UAALRateTest;
    nt2_contradiction_fidelity: UAALRateTest;
    nt3_structural: UAALRateTest;
    nt4_falsification_flip: UAALRateTest;
    emergent_beats_branchcount: UAALEmergentBaselineTest & { baselineRate: number };
  };
  pass: boolean;
  misses: {
    nt1: string[];
    nt2: string[];
    nt4: string[];
  };
}

export interface UAALAnalogyEntity {
  id: string;
  role?: string;
  attrs?: string[];
  [key: string]: unknown;
}

export interface UAALAnalogyRelation {
  pred?: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
}

export interface UAALAnalogyGraph {
  label?: string;
  entities?: UAALAnalogyEntity[];
  relations?: UAALAnalogyRelation[];
  [key: string]: unknown;
}

export interface UAALAnalogyMapping {
  from: string;
  to: string;
  [key: string]: unknown;
}

export interface UAALAnalogyIR {
  source?: UAALAnalogyGraph;
  target?: UAALAnalogyGraph;
  mapping?: UAALAnalogyMapping[];
  query?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AnalogyValidityRecovery {
  valid: boolean;
  preserved: number;
  total: number;
  broken: string[];
  injective: boolean;
  endpointsCovered: boolean;
}

export interface UAALAnalogyMetadata extends Record<string, unknown> {
  id?: string;
  class?: string;
  valid?: boolean;
  preserved_relations?: number;
  required_relations?: number;
}

export interface UAALAnalogyBenchmarkResult {
  n: number;
  tests: {
    an1_discrimination: UAALRateTest;
    an2_relation_fidelity: UAALRateTest;
    an3_bijection_sanity: UAALRateTest;
    an4_falsification_flip: UAALRateTest;
    emergent_beats_surface: UAALEmergentBaselineTest & { surfaceRate: number };
  };
  pass: boolean;
  misses: {
    an1: string[];
    an2: string[];
    an3: string[];
    an4: string[];
  };
}

export interface UAALPresuppositionForm {
  form?: string;
  atoms?: string[];
  [key: string]: unknown;
}

export interface UAALPresuppositionIR {
  forms?: UAALPresuppositionForm[];
  query?: { atoms?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export type UAALAtomStatus = 'presupposed' | 'at_issue';

export interface AtomStatusRecovery {
  status: UAALAtomStatus;
}

export interface UAALPresuppositionMetadata extends Record<string, unknown> {
  id?: string;
  atom_status?: Record<string, UAALAtomStatus>;
}

export interface UAALPresuppositionBenchmarkResult {
  n: number;
  tests: {
    pt1_discrimination: UAALRateTest;
    pt2_projection_fidelity: UAALRateTest;
    pt3_structural_sanity: UAALRateTest;
    pt4_falsification_flip: UAALRateTest;
    emergent_beats_surface: UAALEmergentBaselineTest & { surfaceRate: number };
  };
  pass: boolean;
  misses: {
    pt1: string[];
    pt2: string[];
    pt4: string[];
  };
}

export interface UAALMotifNode {
  id: string;
  role?: string;
  label?: string;
  [key: string]: unknown;
}

export interface UAALMotifEdge {
  from?: string;
  to?: string;
  type?: string;
  [key: string]: unknown;
}

export interface UAALMotifComponent {
  id: string;
  nodes?: UAALMotifNode[];
  edges?: UAALMotifEdge[];
  [key: string]: unknown;
}

export interface UAALMotifIR {
  components?: UAALMotifComponent[];
  [key: string]: unknown;
}

export interface MotifRecovery {
  has_motif: boolean;
  recurrence_count: number;
  form: string | null;
  members: string[];
}

export interface UAALMotifMetadata extends Record<string, unknown> {
  id?: string;
  has_motif?: boolean;
  recurrence_count?: number;
}

export interface UAALMotifBenchmarkResult {
  n: number;
  tests: {
    tm1_discrimination: UAALRateTest;
    tm2_count_fidelity: UAALRateTest;
    tm3_structural: UAALRateTest;
    tm4_falsification_flip: UAALRateTest;
    emergent_beats_lexical: UAALEmergentBaselineTest & { lexicalRate: number };
  };
  pass: boolean;
  misses: {
    tm1: string[];
    tm2: string[];
    tm4: string[];
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

export const UAAL_AFFORDANCE_THRESHOLDS = {
  at1: 0.95,
  at2: 0.9,
  at3: 0.95,
  at4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_TEMPORAL_THRESHOLDS = {
  tt1: 0.95,
  tt2: 0.9,
  tt3: 0.95,
  tt4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_DEONTIC_THRESHOLDS = {
  dt1: 0.95,
  dt2: 0.9,
  dt3: 0.95,
  dt4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_COMMITMENT_THRESHOLDS = {
  cm1: 0.95,
  cm2: 0.9,
  cm3: 0.95,
  cm4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_COUNTERFACTUAL_THRESHOLDS = {
  ct1: 0.95,
  ct2: 0.9,
  ct3: 0.95,
  ct4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_ACCESS_THRESHOLDS = {
  ot1: 0.95,
  ot2: 0.9,
  ot3: 0.95,
  ot4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_COMPOSITION_THRESHOLDS = {
  it1: 0.95,
  it2: 0.9,
  it4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_MEREOLOGY_THRESHOLDS = {
  mp1: 0.95,
  mp2: 0.9,
  mp3: 0.95,
  mp4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_TENSION_THRESHOLDS = {
  nt1: 0.95,
  nt2: 0.9,
  nt3: 0.95,
  nt4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_ANALOGY_THRESHOLDS = {
  an1: 0.95,
  an2: 0.9,
  an3: 0.95,
  an4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_PRESUPPOSITION_THRESHOLDS = {
  pt1: 0.95,
  pt2: 0.9,
  pt3: 0.95,
  pt4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_MOTIF_THRESHOLDS = {
  tm1: 0.95,
  tm2: 0.9,
  tm3: 0.95,
  tm4: 0.95,
  emergentEdge: 0.05,
} as const;

export const UAAL_SEMANTIC_THRESHOLDS = {
  theoryOfMind: UAAL_THEORY_OF_MIND_THRESHOLDS,
  telos: UAAL_TELOS_THRESHOLDS,
  containment: UAAL_CONTAINMENT_THRESHOLDS,
  affordance: UAAL_AFFORDANCE_THRESHOLDS,
  temporal: UAAL_TEMPORAL_THRESHOLDS,
  deontic: UAAL_DEONTIC_THRESHOLDS,
  commitment: UAAL_COMMITMENT_THRESHOLDS,
  counterfactual: UAAL_COUNTERFACTUAL_THRESHOLDS,
  access: UAAL_ACCESS_THRESHOLDS,
  composition: UAAL_COMPOSITION_THRESHOLDS,
  mereology: UAAL_MEREOLOGY_THRESHOLDS,
  tension: UAAL_TENSION_THRESHOLDS,
  analogy: UAAL_ANALOGY_THRESHOLDS,
  presupposition: UAAL_PRESUPPOSITION_THRESHOLDS,
  motif: UAAL_MOTIF_THRESHOLDS,
} as const;

export function safeParseCompletion<T>(completion: string | T): T | null {
  if (typeof completion !== 'string') {
    return completion ?? null;
  }

  try {
    return JSON.parse(completion) as T;
  } catch {
    return null;
  }
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function rate(hits: number, total: number): number {
  return total ? hits / total : 0;
}

function norm(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
}

function declaredTheoryOfMindType(meta: UAALTheoryOfMindMetadata): string {
  return norm(
    meta.variant_id || String(meta.conflict_type || '').replace(/^false_belief_from_/, '')
  );
}

export function makeRateTest(hits: number, total: number, floor: number): UAALRateTest {
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
  return new Map(
    (ir.entities || [])
      .filter((entity) => truthyString(entity.id))
      .map((entity) => [entity.id, Boolean(entity.opaque)])
  );
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
  const props = new Map(
    (ir.propositions || []).filter((prop) => truthyString(prop.id)).map((prop) => [prop.id, prop])
  );
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
  rows: Array<UAALSemanticBenchmarkRow<UAALTheoryOfMindIR, UAALTheoryOfMindMetadata>>
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

    if (
      (ir.causal || []).some((causal) =>
        /theory.?of.?mind|models?|nest/i.test(causal.mechanism || '')
      )
    ) {
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
  const beneficiaries = new Set(
    (ir.entities || []).filter((entity) => entity.kind === 'beneficiary').map((entity) => entity.id)
  );
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
  rows: Array<UAALSemanticBenchmarkRow<UAALTelosIR, UAALTelosMetadata>>
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
        misses.tt2.push(
          `${groundTruth.id}: got ${recovered.beneficiary} want ${groundTruth.beneficiary}`
        );
      }
    }

    const outward = (ir.perspectives || []).find((perspective) => perspective.stance === 'outward');
    if (outward && Boolean(outward.telos_gap) === expectedGap) tt3++;

    const corrupt = cloneJson(ir);
    if (expectedGap) {
      corrupt.entities = [
        ...(corrupt.entities || []),
        { id: '__ben_injected', kind: 'beneficiary', label: 'injected' },
      ];
      if (corrupt.events?.[0]) {
        corrupt.events[0].telos = { beneficiary: '__ben_injected', goal: 'injected' };
      }
    } else {
      const beneficiaryIds = new Set(
        (corrupt.entities || [])
          .filter((entity) => entity.kind === 'beneficiary')
          .map((entity) => entity.id)
      );
      corrupt.entities = (corrupt.entities || []).filter((entity) => entity.kind !== 'beneficiary');
      for (const event of corrupt.events || []) event.telos = null;
      corrupt.causal = (corrupt.causal || []).filter(
        (causal) => !beneficiaryIds.has(causal.to || '')
      );
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

export function recoverOcclusion(
  ir: UAALContainmentIR,
  agent: string | undefined,
  object: string | undefined
): OcclusionRecovery {
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

export function naiveOpacityOcclusion(
  ir: UAALContainmentIR,
  object: string | undefined
): OcclusionRecovery {
  const opaque = opacityMap(ir);
  const occluded = enclosingChain(ir, object).some((container) => opaque.get(container));
  return { occluded };
}

export function benchmarkContainment(
  rows: Array<UAALSemanticBenchmarkRow<UAALContainmentIR, UAALContainmentMetadata>>
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
        misses.st2.push(
          `${groundTruth.id}: occluder ${recovered.occluder} want ${groundTruth.occluder}`
        );
      }
    }

    const perspective = (ir.perspectives || []).find((item) =>
      (item.claims_sees || []).includes(query.object || '')
    );
    if (perspective) {
      const claimInvalid = recovered.occluded;
      if (claimInvalid === expectedOccluded) st3++;
    }

    const corrupt = cloneJson(ir);
    if (expectedOccluded) {
      const entity = (corrupt.entities || []).find(
        (candidate) => candidate.id === groundTruth.occluder
      );
      if (entity) entity.opaque = false;
    } else {
      const opaque = opacityMap(ir);
      const objectChain = enclosingChain(ir, query.object);
      const agentEnclosures = new Set(enclosingChain(ir, query.agent));
      const sharedOpaque = objectChain.find(
        (container) => opaque.get(container) && agentEnclosures.has(container)
      );
      if (sharedOpaque) {
        corrupt.containment = (corrupt.containment || []).filter(
          (relation) => !(relation.inner === query.agent && relation.outer === sharedOpaque)
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

const UAAL_AFFORDANCE_REQUIREMENTS: Record<string, { attr: string; cmp: 'lte' | 'gte' }> = {
  aperture: { attr: 'width', cmp: 'lte' },
  reach: { attr: 'reach', cmp: 'gte' },
  mass: { attr: 'lift', cmp: 'gte' },
  grip: { attr: 'grip', cmp: 'gte' },
};

function requirementCheck(
  body: Record<string, number> | undefined,
  requires: Record<string, number> | undefined
): AffordanceRecovery {
  for (const [key, required] of Object.entries(requires || {})) {
    const spec = UAAL_AFFORDANCE_REQUIREMENTS[key];
    if (!spec) continue;
    const actual = body?.[spec.attr];
    if (actual == null) return { affords: false, reason: key };
    if (spec.cmp === 'lte' && !(actual <= required)) return { affords: false, reason: key };
    if (spec.cmp === 'gte' && !(actual >= required)) return { affords: false, reason: key };
  }
  return { affords: true, reason: null };
}

function ensureBody(entity: UAALSemanticEntity | undefined): Record<string, number> {
  if (!entity?.body) {
    if (entity) entity.body = {};
    return {};
  }
  return entity.body;
}

function setRequirementsSatisfied(
  body: Record<string, number>,
  requires: Record<string, number> | undefined
): void {
  for (const [key, required] of Object.entries(requires || {})) {
    const spec = UAAL_AFFORDANCE_REQUIREMENTS[key];
    if (!spec) continue;
    body[spec.attr] =
      spec.cmp === 'lte'
        ? required - Math.abs(required) * 0.5 - 0.01
        : required + Math.abs(required) * 0.5 + 0.01;
  }
}

function setRequirementViolated(
  body: Record<string, number>,
  requires: Record<string, number> | undefined
): void {
  for (const [key, required] of Object.entries(requires || {})) {
    const spec = UAAL_AFFORDANCE_REQUIREMENTS[key];
    if (!spec) continue;
    body[spec.attr] =
      spec.cmp === 'lte'
        ? required + Math.abs(required) * 0.5 + 0.01
        : required - Math.abs(required) * 0.5 - 0.01;
    return;
  }
}

export function recoverAffords(
  ir: UAALAffordanceIR,
  agent: string | undefined,
  action: string | undefined,
  object: string | undefined
): AffordanceRecovery {
  if (!truthyString(agent) || !truthyString(action) || !truthyString(object)) {
    return { affords: false, reason: 'invalid_query' };
  }

  const agentEntity = (ir.entities || []).find((entity) => entity.id === agent);
  const objectEntity = (ir.entities || []).find((entity) => entity.id === object);
  const offer = (objectEntity?.offers || []).find((candidate) => candidate.action === action);
  if (!offer) return { affords: false, reason: 'no_offer' };

  const capability = requirementCheck(agentEntity?.body, offer.requires);
  if (!capability.affords) return capability;

  const holds = new Map(
    (ir.propositions || []).map((proposition) => [proposition.id, Boolean(proposition.holds)])
  );
  for (const precondition of offer.preconditions || []) {
    if (!holds.get(precondition)) return { affords: false, reason: 'precondition' };
  }

  return { affords: true, reason: null };
}

export function objectOfferBaseline(
  ir: UAALAffordanceIR,
  action: string | undefined,
  object: string | undefined
): Pick<AffordanceRecovery, 'affords'> {
  if (!truthyString(action) || !truthyString(object)) return { affords: false };
  const objectEntity = (ir.entities || []).find((entity) => entity.id === object);
  return { affords: (objectEntity?.offers || []).some((offer) => offer.action === action) };
}

export function benchmarkAffordance(
  rows: Array<UAALSemanticBenchmarkRow<UAALAffordanceIR, UAALAffordanceMetadata>>
): UAALAffordanceBenchmarkResult {
  let n = 0;
  let at1 = 0;
  let at2 = 0;
  let at2denom = 0;
  let at3 = 0;
  let at4 = 0;
  let baseCorrect = 0;
  const misses = { at1: [] as string[], at2: [] as string[], at4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALAffordanceIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const query = ir.query || {};
    const expectedAffords = Boolean(groundTruth.affords);
    const recovered = recoverAffords(ir, query.agent, query.action, query.object);

    if (recovered.affords === expectedAffords) {
      at1++;
    } else if (misses.at1.length < 8) {
      misses.at1.push(`${groundTruth.id}: got ${recovered.affords} want ${expectedAffords}`);
    }
    if (objectOfferBaseline(ir, query.action, query.object).affords === expectedAffords)
      baseCorrect++;

    if (!expectedAffords) {
      at2denom++;
      if (recovered.reason === groundTruth.block_reason) {
        at2++;
      } else if (misses.at2.length < 8) {
        misses.at2.push(
          `${groundTruth.id}: reason ${recovered.reason} want ${groundTruth.block_reason}`
        );
      }
    }

    const withBelief = cloneJson(ir);
    withBelief.beliefs = [{ id: 'b_doubt', agent: query.agent, prop: 'p_cannot', confidence: 0.9 }];
    withBelief.propositions = [
      ...(withBelief.propositions || []),
      { id: 'p_cannot', text: 'the agent cannot do it', holds: false },
    ];
    if (
      recoverAffords(withBelief, query.agent, query.action, query.object).affords ===
      recovered.affords
    )
      at3++;

    const corrupt = cloneJson(ir);
    const objectEntity = (corrupt.entities || []).find((entity) => entity.id === query.object);
    const agentEntity = (corrupt.entities || []).find((entity) => entity.id === query.agent);
    const offer = (objectEntity?.offers || []).find(
      (candidate) => candidate.action === query.action
    );
    if (recovered.affords) {
      if (offer && Object.keys(offer.requires || {}).length) {
        setRequirementViolated(ensureBody(agentEntity), offer.requires);
      } else if (offer && (offer.preconditions || []).length) {
        const proposition = (corrupt.propositions || []).find(
          (candidate) => candidate.id === offer.preconditions?.[0]
        );
        if (proposition) proposition.holds = false;
      } else if (objectEntity) {
        objectEntity.offers = [];
      }
    } else if (recovered.reason === 'no_offer' && objectEntity) {
      objectEntity.offers = [
        ...(objectEntity.offers || []),
        { action: query.action || '__action', requires: {}, preconditions: [] },
      ];
    } else if (recovered.reason === 'precondition' && offer) {
      for (const precondition of offer.preconditions || []) {
        const proposition = (corrupt.propositions || []).find(
          (candidate) => candidate.id === precondition
        );
        if (proposition) proposition.holds = true;
      }
    } else if (offer) {
      setRequirementsSatisfied(ensureBody(agentEntity), offer.requires);
    }

    const corruptRecovered = recoverAffords(corrupt, query.agent, query.action, query.object);
    if (corruptRecovered.affords !== recovered.affords) {
      at4++;
    } else if (misses.at4.length < 8) {
      misses.at4.push(`${groundTruth.id}: stayed ${recovered.affords} after corruption`);
    }
  }

  const at1Rate = rate(at1, n);
  const baselineRate = rate(baseCorrect, n);
  const edge = at1Rate - baselineRate;
  const tests = {
    at1_discrimination: makeRateTest(at1, n, UAAL_AFFORDANCE_THRESHOLDS.at1),
    at2_block_fidelity: makeRateTest(at2, at2denom, UAAL_AFFORDANCE_THRESHOLDS.at2),
    at3_mind_independence: makeRateTest(at3, n, UAAL_AFFORDANCE_THRESHOLDS.at3),
    at4_falsification_flip: makeRateTest(at4, n, UAAL_AFFORDANCE_THRESHOLDS.at4),
    emergent_beats_baseline: {
      emergentRate: at1Rate,
      baselineRate,
      edge,
      floor: UAAL_AFFORDANCE_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_AFFORDANCE_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

export function factValueAt(ir: UAALTemporalIR, factId: string | undefined, at: number): boolean {
  const fact = (ir.facts || []).find((candidate) => candidate.id === factId);
  let value = typeof fact?.initial === 'boolean' ? fact.initial : true;
  const changes = (ir.events || [])
    .filter(
      (event) =>
        event.world_change &&
        event.fact === factId &&
        typeof event.t === 'number' &&
        event.t <= at &&
        typeof event.sets === 'boolean'
    )
    .sort((left, right) => (left.t || 0) - (right.t || 0));

  for (const change of changes) value = Boolean(change.sets);
  return value;
}

export function changeAfter(
  ir: UAALTemporalIR,
  factId: string | undefined,
  tFormed: number,
  tNow: number
): UAALSemanticEvent | null {
  return (
    (ir.events || [])
      .filter(
        (event) =>
          event.world_change &&
          event.fact === factId &&
          typeof event.t === 'number' &&
          event.t > tFormed &&
          event.t <= tNow
      )
      .sort((left, right) => (left.t || 0) - (right.t || 0))[0] || null
  );
}

export function recoverBeliefStatus(
  ir: UAALTemporalIR,
  beliefId: string | undefined,
  factId: string | undefined
): BeliefStatusRecovery {
  const belief = (ir.beliefs || []).find((candidate) => candidate.id === beliefId);
  if (!belief) return { status: 'unknown', change_event: null };

  const tNow = typeof ir.t_now === 'number' ? ir.t_now : Infinity;
  const tFormed = typeof belief.t_formed === 'number' ? belief.t_formed : -Infinity;
  const now = factValueAt(ir, factId, tNow);
  const atFormed = factValueAt(ir, factId, tFormed);

  if (belief.prop === now) return { status: 'fresh', change_event: null };
  if (belief.prop === atFormed) {
    const change = changeAfter(ir, factId, tFormed, tNow);
    return { status: 'stale', change_event: change?.id || null };
  }
  return { status: 'error', change_event: null };
}

export function naiveTimeBlindStatus(
  ir: UAALTemporalIR,
  beliefId: string | undefined,
  factId: string | undefined
): Pick<BeliefStatusRecovery, 'status'> {
  const belief = (ir.beliefs || []).find((candidate) => candidate.id === beliefId);
  if (!belief) return { status: 'unknown' };
  const tNow = typeof ir.t_now === 'number' ? ir.t_now : Infinity;
  const now = factValueAt(ir, factId, tNow);
  return { status: belief.prop === now ? 'fresh' : 'error' };
}

export function benchmarkTemporal(
  rows: Array<UAALSemanticBenchmarkRow<UAALTemporalIR, UAALTemporalMetadata>>
): UAALTemporalBenchmarkResult {
  let n = 0;
  let tt1 = 0;
  let tt2 = 0;
  let tt2denom = 0;
  let tt3 = 0;
  let tt4 = 0;
  let tt4denom = 0;
  let naiveCorrect = 0;
  const misses = { tt1: [] as string[], tt2: [] as string[], tt4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALTemporalIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const query = ir.query || {};
    const recovered = recoverBeliefStatus(ir, query.belief, query.fact);
    const naive = naiveTimeBlindStatus(ir, query.belief, query.fact);

    if (recovered.status === groundTruth.belief_status) {
      tt1++;
    } else if (misses.tt1.length < 8) {
      misses.tt1.push(
        `${groundTruth.id}: got ${recovered.status} want ${groundTruth.belief_status}`
      );
    }
    if (naive.status === groundTruth.belief_status) naiveCorrect++;

    if (groundTruth.belief_status === 'stale') {
      tt2denom++;
      if (recovered.change_event === groundTruth.change_event) {
        tt2++;
      } else if (misses.tt2.length < 8) {
        misses.tt2.push(
          `${groundTruth.id}: change ${recovered.change_event} want ${groundTruth.change_event}`
        );
      }
    }

    const order = ir.temporal_order || [];
    const eventById = new Map((ir.events || []).map((event) => [event.id, event]));
    const isPermutation =
      order.length === (ir.events || []).length && order.every((id) => eventById.has(id));
    let sorted = true;
    for (let index = 1; index < order.length; index++) {
      const before = eventById.get(order[index - 1]);
      const after = eventById.get(order[index]);
      if (
        before &&
        after &&
        typeof before.t === 'number' &&
        typeof after.t === 'number' &&
        before.t > after.t
      ) {
        sorted = false;
        break;
      }
    }
    if (isPermutation && sorted) tt3++;

    if (groundTruth.belief_status === 'stale') {
      tt4denom++;
      const corrupt = cloneJson(ir);
      const corruptBelief = (corrupt.beliefs || []).find((belief) => belief.id === query.belief);
      const tFormed = typeof corruptBelief?.t_formed === 'number' ? corruptBelief.t_formed : 0;
      const change = changeAfter(
        ir,
        query.fact,
        tFormed,
        typeof ir.t_now === 'number' ? ir.t_now : Infinity
      );
      if (corruptBelief && typeof change?.t === 'number') corruptBelief.t_formed = change.t + 1;
      const corruptRecovered = recoverBeliefStatus(corrupt, query.belief, query.fact);
      if (corruptRecovered.status === 'error' && corruptRecovered.status !== recovered.status) {
        tt4++;
      } else if (misses.tt4.length < 8) {
        misses.tt4.push(
          `${groundTruth.id}: ${recovered.status}->${corruptRecovered.status} after t_formed corruption`
        );
      }
    }
  }

  const tt1Rate = rate(tt1, n);
  const naiveRate = rate(naiveCorrect, n);
  const edge = tt1Rate - naiveRate;
  const tests = {
    tt1_discrimination: makeRateTest(tt1, n, UAAL_TEMPORAL_THRESHOLDS.tt1),
    tt2_change_fidelity: makeRateTest(tt2, tt2denom, UAAL_TEMPORAL_THRESHOLDS.tt2),
    tt3_order_sanity: makeRateTest(tt3, n, UAAL_TEMPORAL_THRESHOLDS.tt3),
    tt4_falsification_flip: makeRateTest(tt4, tt4denom, UAAL_TEMPORAL_THRESHOLDS.tt4),
    emergent_beats_naive: {
      emergentRate: tt1Rate,
      naiveRate,
      edge,
      floor: UAAL_TEMPORAL_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_TEMPORAL_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

function normById(ir: UAALDeonticIR, normId: string | undefined): UAALDeonticNorm | null {
  return (ir.norms || []).find((normItem) => normItem.id === normId) || (ir.norms || [])[0] || null;
}

function fulfillingEvent(
  ir: UAALDeonticIR,
  normItem: UAALDeonticNorm | null
): UAALSemanticEvent | null {
  if (!normItem) return null;
  return (
    (ir.events || []).find(
      (event) => event.act === normItem.required_act && event.on_behalf_of === normItem.addressee
    ) || null
  );
}

export function recoverNormStatus(
  ir: UAALDeonticIR,
  normId: string | undefined
): NormStatusRecovery {
  const normItem = normById(ir, normId);
  if (!normItem) return { status: 'complied', force: null, fulfilledBy: null };

  const active = normItem.active !== false;
  const event = fulfillingEvent(ir, normItem);
  if (normItem.force === 'O') {
    if (active && !event) return { status: 'violated', force: 'O', fulfilledBy: null };
    return { status: 'complied', force: 'O', fulfilledBy: event?.id || null };
  }
  if (normItem.force === 'F') {
    if (active && event) return { status: 'violated', force: 'F', fulfilledBy: event.id };
    return { status: 'complied', force: 'F', fulfilledBy: null };
  }
  return { status: 'complied', force: 'P', fulfilledBy: event?.id || null };
}

export function naivePersonalStatus(
  ir: UAALDeonticIR,
  normId: string | undefined
): Pick<NormStatusRecovery, 'status'> {
  const normItem = normById(ir, normId);
  if (!normItem) return { status: 'complied' };
  const personal = (ir.events || []).some(
    (event) => event.actor === normItem.addressee && event.act === normItem.required_act
  );
  return { status: personal ? 'complied' : 'violated' };
}

export function benchmarkDeontic(
  rows: Array<UAALSemanticBenchmarkRow<UAALDeonticIR, UAALDeonticMetadata>>
): UAALDeonticBenchmarkResult {
  let n = 0;
  let dt1 = 0;
  let dt2 = 0;
  let dt2denom = 0;
  let dt3 = 0;
  let dt4 = 0;
  let dt4denom = 0;
  let naiveCorrect = 0;
  const misses = { dt1: [] as string[], dt2: [] as string[], dt4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALDeonticIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const normId = ir.query?.norm;
    const recovered = recoverNormStatus(ir, normId);
    const naive = naivePersonalStatus(ir, normId);

    if (recovered.status === groundTruth.norm_status) {
      dt1++;
    } else if (misses.dt1.length < 8) {
      misses.dt1.push(`${groundTruth.id}: got ${recovered.status} want ${groundTruth.norm_status}`);
    }
    if (naive.status === groundTruth.norm_status) naiveCorrect++;

    const normItem = normById(ir, normId);
    const declaredFulfill = fulfillingEvent(ir, normItem);
    if (groundTruth.norm_status === 'complied' && declaredFulfill) {
      dt2denom++;
      if (recovered.fulfilledBy === declaredFulfill.id) {
        dt2++;
      } else if (misses.dt2.length < 8) {
        misses.dt2.push(
          `${groundTruth.id}: got ${recovered.fulfilledBy} want ${declaredFulfill.id}`
        );
      }
    }

    const wellFormed =
      normItem != null &&
      ['O', 'P', 'F'].includes(normItem.force || '') &&
      truthyString(normItem.authority) &&
      truthyString(normItem.addressee) &&
      truthyString(normItem.required_act);
    const beliefDesireCompliant =
      (ir.beliefs || []).every((belief) => (belief.confidence ?? 1) >= 1) &&
      (ir.desires || []).every((desire) => desire.satisfied !== false);
    if (wellFormed && beliefDesireCompliant) dt3++;

    if (groundTruth.class === 'complied_by_proxy') {
      dt4denom++;
      const corrupt = cloneJson(ir);
      const fulfillId = declaredFulfill?.id;
      corrupt.events = (corrupt.events || []).filter((event) => event.id !== fulfillId);
      const corruptRecovered = recoverNormStatus(corrupt, normId);
      if (corruptRecovered.status === 'violated' && recovered.status === 'complied') {
        dt4++;
      } else if (misses.dt4.length < 8) {
        misses.dt4.push(`${groundTruth.id}: proxy-delete stayed ${corruptRecovered.status}`);
      }
    } else if (groundTruth.class === 'violated') {
      dt4denom++;
      const corrupt = cloneJson(ir);
      const corruptNorm =
        (corrupt.norms || []).find((candidate) => candidate.id === normId) ||
        (corrupt.norms || [])[0];
      if (corruptNorm) corruptNorm.force = 'P';
      const corruptRecovered = recoverNormStatus(corrupt, normId);
      if (corruptRecovered.status === 'complied' && recovered.status === 'violated') {
        dt4++;
      } else if (misses.dt4.length < 8) {
        misses.dt4.push(`${groundTruth.id}: O->P stayed ${corruptRecovered.status}`);
      }
    }
  }

  const dt1Rate = rate(dt1, n);
  const naiveRate = rate(naiveCorrect, n);
  const edge = dt1Rate - naiveRate;
  const tests = {
    dt1_discrimination: makeRateTest(dt1, n, UAAL_DEONTIC_THRESHOLDS.dt1),
    dt2_fulfillment_fidelity: makeRateTest(dt2, dt2denom, UAAL_DEONTIC_THRESHOLDS.dt2),
    dt3_norm_structural_sanity: makeRateTest(dt3, n, UAAL_DEONTIC_THRESHOLDS.dt3),
    dt4_falsification_flip: makeRateTest(dt4, dt4denom, UAAL_DEONTIC_THRESHOLDS.dt4),
    emergent_beats_naive: {
      emergentRate: dt1Rate,
      naiveRate,
      edge,
      floor: UAAL_DEONTIC_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_DEONTIC_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

function commitmentById(
  ir: UAALCommitmentIR,
  commitmentId: string | undefined
): UAALCommitment | null {
  return (ir.commitments || []).find((commitment) => commitment.id === commitmentId) || null;
}

export function recoverCommitmentStatus(
  ir: UAALCommitmentIR,
  commitmentId: string | undefined
): CommitmentStatusRecovery {
  const commitment = commitmentById(ir, commitmentId);
  if (!commitment) return { status: 'open', fulfilling: null };

  const act = commitment.pledged_act || {};
  const now = typeof ir.now === 'number' ? ir.now : Infinity;
  const dueGiven = typeof commitment.due_time === 'number';
  const fulfilling =
    (ir.events || []).find(
      (event) =>
        event.predicate === act.type &&
        event.recipient === act.recipient &&
        (act.magnitude == null ||
          (typeof event.magnitude === 'number' && event.magnitude >= act.magnitude)) &&
        (!dueGiven || (typeof event.t === 'number' && event.t <= (commitment.due_time as number)))
    ) || null;

  if (fulfilling) return { status: 'discharged', fulfilling };
  return {
    status: dueGiven && now > (commitment.due_time as number) ? 'broken' : 'open',
    fulfilling: null,
  };
}

export function occurrenceFlagStatus(
  ir: UAALCommitmentIR,
  commitmentId: string | undefined
): Pick<CommitmentStatusRecovery, 'status'> {
  const commitment = commitmentById(ir, commitmentId);
  if (!commitment) return { status: 'open' };
  const act = commitment.pledged_act || {};
  const now = typeof ir.now === 'number' ? ir.now : Infinity;
  const dueGiven = typeof commitment.due_time === 'number';
  const occurred = (ir.events || []).some((event) => event.predicate === act.type);
  if (occurred) return { status: 'discharged' };
  return { status: dueGiven && now > (commitment.due_time as number) ? 'broken' : 'open' };
}

export function benchmarkCommitment(
  rows: Array<UAALSemanticBenchmarkRow<UAALCommitmentIR, UAALCommitmentMetadata>>
): UAALCommitmentBenchmarkResult {
  let n = 0;
  let cm1 = 0;
  let cm2 = 0;
  let cm2denom = 0;
  let cm3 = 0;
  let cm4 = 0;
  let flagCorrect = 0;
  const misses = { cm1: [] as string[], cm2: [] as string[], cm4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALCommitmentIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const commitmentId = ir.query?.commitment;
    const recovered = recoverCommitmentStatus(ir, commitmentId);
    const flag = occurrenceFlagStatus(ir, commitmentId);

    if (recovered.status === groundTruth.commitment_status) {
      cm1++;
    } else if (misses.cm1.length < 8) {
      misses.cm1.push(
        `${groundTruth.id}: recovered ${recovered.status} truth ${groundTruth.commitment_status}`
      );
    }
    if (flag.status === groundTruth.commitment_status) flagCorrect++;

    cm2denom++;
    const recoveredRecipient = recovered.fulfilling?.recipient || null;
    if (recoveredRecipient === groundTruth.fulfilling_recipient) {
      cm2++;
    } else if (misses.cm2.length < 8) {
      misses.cm2.push(
        `${groundTruth.id}: got ${recoveredRecipient} want ${groundTruth.fulfilling_recipient}`
      );
    }

    const validStatus = ['discharged', 'broken', 'open'].includes(recovered.status);
    const claim = (ir.claims || []).find((candidate) => candidate.commitment === commitmentId);
    const claimValid = recovered.status === 'discharged';
    const claimJudgedRight =
      !claim ||
      (claim.asserts_status === 'discharged'
        ? claimValid === (groundTruth.commitment_status === 'discharged')
        : true);
    if (validStatus && claimJudgedRight) cm3++;

    const corrupt = cloneJson(ir);
    const commitment = commitmentById(corrupt, commitmentId);
    const act = commitment?.pledged_act || {};
    const promisee = act.recipient;
    if (groundTruth.commitment_status === 'discharged') {
      const event = (corrupt.events || []).find(
        (candidate) => candidate.recipient === promisee && candidate.predicate === act.type
      );
      if (event) event.recipient = '__wrong_party_injected';
    } else {
      const event = (corrupt.events || []).find((candidate) => candidate.predicate === act.type);
      if (event) {
        event.recipient = promisee;
        event.magnitude = act.magnitude;
        event.t = (commitment?.due_time ?? 0) - 1;
      } else {
        corrupt.events = [
          ...(corrupt.events || []),
          {
            id: 'e_injected',
            predicate: act.type,
            actor: commitment?.promisor,
            recipient: promisee,
            magnitude: act.magnitude,
            t: (commitment?.due_time ?? 0) - 1,
          },
        ];
      }
    }
    const corruptRecovered = recoverCommitmentStatus(corrupt, commitmentId);
    if (corruptRecovered.status !== recovered.status) {
      cm4++;
    } else if (misses.cm4.length < 8) {
      misses.cm4.push(`${groundTruth.id}: stayed ${recovered.status} after retarget`);
    }
  }

  const cm1Rate = rate(cm1, n);
  const flagRate = rate(flagCorrect, n);
  const edge = cm1Rate - flagRate;
  const tests = {
    cm1_discrimination: makeRateTest(cm1, n, UAAL_COMMITMENT_THRESHOLDS.cm1),
    cm2_recipient_fidelity: makeRateTest(cm2, cm2denom, UAAL_COMMITMENT_THRESHOLDS.cm2),
    cm3_structural_sanity: makeRateTest(cm3, n, UAAL_COMMITMENT_THRESHOLDS.cm3),
    cm4_falsification_flip: makeRateTest(cm4, n, UAAL_COMMITMENT_THRESHOLDS.cm4),
    emergent_beats_flag: {
      emergentRate: cm1Rate,
      flagRate,
      edge,
      floor: UAAL_COMMITMENT_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_COMMITMENT_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

function counterfactualEffectMap(ir: UAALCounterfactualIR): Map<string, string[][]> {
  return new Map((ir.effects || []).map((effect) => [effect.id, effect.sufficientSets || []]));
}

function counterfactualStandbyMap(ir: UAALCounterfactualIR): Map<string, string | undefined> {
  return new Map((ir.standby || []).map((standby) => [standby.id, standby.preemptedBy]));
}

export function holds(
  id: string,
  occurring: Set<string>,
  effects: Map<string, string[][]>,
  standby: Map<string, string | undefined> = new Map(),
  guard: Set<string> = new Set()
): boolean {
  if (occurring.has(id)) return true;
  if (standby.has(id)) {
    const preemptor = standby.get(id);
    if (!preemptor || !holds(preemptor, occurring, effects, standby, guard)) return true;
  }

  const sets = effects.get(id);
  if (!sets) return false;
  if (guard.has(id)) return false;
  const nextGuard = new Set(guard).add(id);
  return sets.some((set) =>
    set.every((member) => holds(member, occurring, effects, standby, nextGuard))
  );
}

function maskEffects(effects: Map<string, string[][]>, cause: string): Map<string, string[][]> {
  if (!effects.has(cause)) return effects;
  const masked = new Map(effects);
  masked.set(cause, []);
  return masked;
}

function collectCounterfactualProducers(
  effects: Map<string, string[][]>,
  sufficientSets: string[][]
): Set<string> {
  const producers = new Set<string>();
  const collect = (sets: string[][]): void => {
    for (const set of sets) {
      for (const member of set) {
        // Visited guard: skip already-collected members so cyclic production
        // specs (a→b→a) terminate instead of overflowing the stack. The set
        // membership doubles as the visited marker — a member's sub-producers
        // are expanded exactly once.
        if (producers.has(member)) continue;
        producers.add(member);
        const sub = effects.get(member);
        if (sub) collect(sub);
      }
    }
  };
  collect(sufficientSets);
  return producers;
}

export function recoverNecessity(ir: UAALCounterfactualIR): UAALNecessityMap {
  const effects = counterfactualEffectMap(ir);
  const standby = counterfactualStandbyMap(ir);
  const occurring = new Set(ir.occurs || []);
  const output: UAALNecessityMap = {};

  for (const effect of ir.effects || []) {
    if (!ir.query?.effect || effect.id !== ir.query.effect) continue;
    const producers = collectCounterfactualProducers(effects, effect.sufficientSets || []);
    const judged: Record<string, boolean> = {};
    for (const cause of producers) {
      const world = new Set([...occurring].filter((candidate) => candidate !== cause));
      const masked = maskEffects(effects, cause);
      const standbyWorld = new Map([...standby].filter(([standbyId]) => standbyId !== cause));
      judged[cause] = !holds(effect.id, world, masked, standbyWorld);
    }
    output[effect.id] = judged;
  }

  return output;
}

function actualReach(ir: UAALCounterfactualIR, target: string): Set<string> {
  const reverse = new Map<string, Set<string>>();
  for (const causal of ir.causal || []) {
    if (!truthyString(causal.from) || !truthyString(causal.to)) continue;
    if (!reverse.has(causal.to)) reverse.set(causal.to, new Set());
    reverse.get(causal.to)?.add(causal.from);
  }

  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const parent of reverse.get(current) || []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        stack.push(parent);
      }
    }
  }
  return seen;
}

export function naiveParentNecessity(ir: UAALCounterfactualIR): UAALNecessityMap {
  const output: UAALNecessityMap = {};
  const effects = counterfactualEffectMap(ir);
  for (const effect of ir.effects || []) {
    if (!ir.query?.effect || effect.id !== ir.query.effect) continue;
    const producers = collectCounterfactualProducers(effects, effect.sufficientSets || []);
    const reaches = actualReach(ir, effect.id);
    const judged: Record<string, boolean> = {};
    for (const cause of producers) judged[cause] = reaches.has(cause);
    output[effect.id] = judged;
  }
  return output;
}

function necessityTriples(map: UAALNecessityMap): Array<[string, string, boolean]> {
  const output: Array<[string, string, boolean]> = [];
  for (const [effect, causes] of Object.entries(map)) {
    for (const [cause, value] of Object.entries(causes)) output.push([effect, cause, value]);
  }
  return output;
}

function counterfactualFidelity(
  ir: UAALCounterfactualIR,
  metadata: UAALCounterfactualMetadata
): boolean {
  const effectId = ir.query?.effect;
  const spec = (ir.effects || []).find((effect) => effect.id === effectId);
  if (!effectId || !spec) return false;

  const effects = counterfactualEffectMap(ir);
  const standby = counterfactualStandbyMap(ir);
  const occurring = new Set(ir.occurs || []);
  const directProducers = new Set((spec.sufficientSets || []).flat());
  const removable = [...directProducers].filter((producer) =>
    holds(producer, occurring, effects, standby)
  );
  const afterRemoving = (producer: string): boolean => {
    const world = new Set([...occurring].filter((candidate) => candidate !== producer));
    const masked = maskEffects(effects, producer);
    const standbyWorld = new Map([...standby].filter(([standbyId]) => standbyId !== producer));
    return holds(effectId, world, masked, standbyWorld);
  };

  const redundant = removable.some((producer) => afterRemoving(producer));
  const dependent = removable.some((producer) => !afterRemoving(producer));
  const setCount = (spec.sufficientSets || []).length;
  if (metadata.class === 'overdetermination') return setCount >= 2 && redundant;
  if (metadata.class === 'preemption')
    return setCount >= 2 && (ir.standby || []).length >= 1 && redundant;
  if (metadata.class === 'single_producer') return dependent && !redundant;
  if (metadata.class === 'chain') return dependent && !redundant;
  return false;
}

function counterfactualStructural(ir: UAALCounterfactualIR): boolean {
  const effectId = ir.query?.effect;
  const spec = (ir.effects || []).find((effect) => effect.id === effectId);
  if (!effectId || !spec) return false;
  const members = new Set((spec.sufficientSets || []).flat());
  const occurring = new Set(ir.occurs || []);
  const edgeParents = (ir.causal || [])
    .filter(
      (causal) => causal.to === effectId && truthyString(causal.from) && occurring.has(causal.from)
    )
    .map((causal) => causal.from as string);
  return (
    edgeParents.every((parent) => members.has(parent)) &&
    (spec.sufficientSets || []).every((set) => set.length > 0)
  );
}

function counterfactualFlip(
  ir: UAALCounterfactualIR,
  metadata: UAALCounterfactualMetadata,
  recovered: UAALNecessityMap
): boolean {
  const effectId = ir.query?.effect;
  if (!effectId) return false;
  const before = recovered[effectId] || {};
  const corrupt = cloneJson(ir);
  const spec = (corrupt.effects || []).find((effect) => effect.id === effectId);
  if (!spec || !spec.sufficientSets?.[0]?.[0]) return false;

  if (metadata.class === 'single_producer' || metadata.class === 'chain') {
    const target = spec.sufficientSets[0][0];
    spec.sufficientSets = [...spec.sufficientSets, ['__backup_injected']];
    corrupt.standby = [
      ...(corrupt.standby || []),
      { id: '__backup_injected', preemptedBy: target },
    ];
  } else {
    spec.sufficientSets = [spec.sufficientSets[0]];
    corrupt.standby = [];
    const survivor = spec.sufficientSets[0][0];
    if (!corrupt.occurs?.includes(survivor)) corrupt.occurs = [...(corrupt.occurs || []), survivor];
  }

  const after = recoverNecessity(corrupt)[effectId] || {};
  return Object.keys(before)
    .filter((key) => key in after)
    .some((key) => before[key] !== after[key]);
}

export function benchmarkCounterfactual(
  rows: Array<UAALSemanticBenchmarkRow<UAALCounterfactualIR, UAALCounterfactualMetadata>>
): UAALCounterfactualBenchmarkResult {
  let n = 0;
  let ct1hits = 0;
  let ct1total = 0;
  let ct2 = 0;
  let ct3 = 0;
  let ct4 = 0;
  let naiveHits = 0;
  const misses = { ct1: [] as string[], ct2: [] as string[], ct4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALCounterfactualIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const truth = groundTruth.necessary || {};
    const recovered = recoverNecessity(ir);
    const naive = naiveParentNecessity(ir);

    for (const [effect, cause, want] of necessityTriples(truth)) {
      ct1total++;
      const got = recovered[effect]?.[cause];
      if (got === want) {
        ct1hits++;
      } else if (misses.ct1.length < 8) {
        misses.ct1.push(`${groundTruth.id} ${effect}/${cause}: got ${got} want ${want}`);
      }
      if (naive[effect]?.[cause] === want) naiveHits++;
    }

    if (counterfactualFidelity(ir, groundTruth)) {
      ct2++;
    } else if (misses.ct2.length < 8) {
      misses.ct2.push(`${groundTruth.id}: fidelity mismatch (class ${groundTruth.class})`);
    }
    if (counterfactualStructural(ir)) ct3++;
    if (counterfactualFlip(ir, groundTruth, recovered)) {
      ct4++;
    } else if (misses.ct4.length < 8) {
      misses.ct4.push(`${groundTruth.id}: necessity did not flip under corruption`);
    }
  }

  const ct1Rate = rate(ct1hits, ct1total);
  const naiveRate = rate(naiveHits, ct1total);
  const edge = ct1Rate - naiveRate;
  const tests = {
    ct1_discrimination: makeRateTest(ct1hits, ct1total, UAAL_COUNTERFACTUAL_THRESHOLDS.ct1),
    ct2_fidelity: makeRateTest(ct2, n, UAAL_COUNTERFACTUAL_THRESHOLDS.ct2),
    ct3_structural: makeRateTest(ct3, n, UAAL_COUNTERFACTUAL_THRESHOLDS.ct3),
    ct4_falsification_flip: makeRateTest(ct4, n, UAAL_COUNTERFACTUAL_THRESHOLDS.ct4),
    emergent_beats_naive: {
      emergentRate: ct1Rate,
      naiveRate,
      edge,
      floor: UAAL_COUNTERFACTUAL_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_COUNTERFACTUAL_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

const UAAL_ACCESS_MODALITIES: UAALAccessModality[] = ['visual', 'audible'];

function isAccessModality(value: string): value is UAALAccessModality {
  return value === 'visual' || value === 'audible';
}

function equalAccess(
  left: UAALAccessState | undefined,
  right: UAALAccessState | undefined
): boolean {
  return Boolean(left && right && left.visual === right.visual && left.audible === right.audible);
}

export function recoverAccess(
  ir: UAALContainmentIR,
  agent: string | undefined,
  object: string | undefined
): UAALAccessRecovery {
  const blocksMap = new Map((ir.entities || []).map((entity) => [entity.id, entity.blocks || []]));
  const chain = enclosingChain(ir, object);
  const agentEnclosures = new Set(enclosingChain(ir, agent));
  const blocked: Record<UAALAccessModality, boolean> = { visual: false, audible: false };
  const blocker: UAALAccessBlocker = { visual: null, audible: null };

  for (const container of chain) {
    if (agentEnclosures.has(container)) break;
    for (const modality of blocksMap.get(container) || []) {
      if (isAccessModality(modality) && !blocked[modality]) {
        blocked[modality] = true;
        blocker[modality] = container;
      }
    }
  }

  return { access: { visual: !blocked.visual, audible: !blocked.audible }, blocker };
}

/**
 * Per-modality access, honest about UNSTATED blocking. recoverAccess reads `blocks` closed-world —
 * an entity with no `blocks` entry for a modality definitely passes it — which is correct for
 * stated-but-omitting arrays (W.825 per-element semantics) but silently coerces two genuinely
 * unknown states to "clear": (1) a container declaring `blocks_unknown: ['audible']` (the A6 IR
 * extension — the author states the barrier's audible behavior is unknown), and (2) for VISUAL, a
 * container whose `opaque` is absent — the same three-state read `resolveOcclusion` is built on,
 * reused here so the two resolvers can never contradict on one IR (`opaque:true` is likewise a
 * definite visual blocker even without `blocks:['visual']`). Per modality, walking object→agent:
 * a definite blocker settles the modality blocked (later unknowns are irrelevant); otherwise a
 * container with unstated behavior for that modality makes the query unresolvable; an all-clear
 * chain resolves open. No-false-gap holds BY CONSTRUCTION for `blocks_unknown` (a brand-new opt-in
 * field no legacy row carries) and by fixture check for the visual/`opaque` reuse (every access
 * fixture either states a definite `blocks` for the examined container or co-contains the agent —
 * verified 2026-07-13, see the A6 scoping memo §5).
 */
export function resolveAccess(
  ir: UAALContainmentIR,
  agent: string | undefined,
  object: string | undefined
): UAALResolution<UAALAccessRecovery> {
  const entityById = new Map((ir.entities || []).map((entity) => [entity.id, entity]));
  const chain = enclosingChain(ir, object);
  const agentEnclosures = new Set(enclosingChain(ir, agent));
  // Computed from the walk itself (resolveOcclusion precedent) — NOT delegated to recoverAccess,
  // whose blocks-only read would contradict an opaque:true visual verdict.
  const blocked: Record<UAALAccessModality, boolean> = { visual: false, audible: false };
  const blocker: UAALAccessBlocker = { visual: null, audible: null };

  for (const modality of UAAL_ACCESS_MODALITIES) {
    let unknownContainer: string | null = null;
    for (const container of chain) {
      if (agentEnclosures.has(container)) break;
      const entity = entityById.get(container);
      const blocks = (entity?.blocks || []).filter(isAccessModality);
      const blocksUnknown = ((entity?.blocks_unknown as string[] | undefined) || []).filter(
        isAccessModality
      );
      const definiteBlock =
        blocks.includes(modality) || (modality === 'visual' && entity?.opaque === true);
      if (definiteBlock) {
        blocked[modality] = true;
        blocker[modality] = container;
        break; // definitely blocked — unknowns further out cannot change this modality
      }
      // Missing entity record ⇒ opaque undefined ⇒ visual unknown — mirrors resolveOcclusion's
      // rawOpacity(), so the two resolvers stay verdict-consistent on every IR.
      const unknown =
        blocksUnknown.includes(modality) ||
        (modality === 'visual' && entity?.opaque === undefined && !blocks.includes('visual'));
      if (unknown && unknownContainer === null) unknownContainer = container;
    }
    if (!blocked[modality] && unknownContainer !== null) {
      return {
        query: 'access',
        status: 'unresolvable',
        reason: 'underdetermined',
        gap: structuredGap(
          'access',
          'access.underdetermined_modality',
          'underdetermined',
          `${modality}@${unknownContainer}`
        ),
        obstruction: `whether container "${unknownContainer}" blocks ${modality} between the agent and the object is unstated — ${modality} access could be open or blocked`,
      };
    }
  }
  return {
    query: 'access',
    status: 'resolved',
    answer: { access: { visual: !blocked.visual, audible: !blocked.audible }, blocker },
  };
}

export function containmentAccessBaseline(
  ir: UAALContainmentIR,
  agent: string | undefined,
  object: string | undefined
): Pick<UAALAccessRecovery, 'access'> {
  const blocksMap = new Map((ir.entities || []).map((entity) => [entity.id, entity.blocks || []]));
  const chain = enclosingChain(ir, object);
  const agentEnclosures = new Set(enclosingChain(ir, agent));
  let occluded = false;
  for (const container of chain) {
    if (agentEnclosures.has(container)) break;
    if ((blocksMap.get(container) || []).length) {
      occluded = true;
      break;
    }
  }
  return { access: { visual: !occluded, audible: !occluded } };
}

export const containmentBaseline = containmentAccessBaseline;

export function benchmarkOcclusionAccess(
  rows: Array<UAALSemanticBenchmarkRow<UAALContainmentIR, UAALAccessMetadata>>
): UAALAccessBenchmarkResult {
  let n = 0;
  let ot1 = 0;
  let ot2 = 0;
  let ot2denom = 0;
  let ot3 = 0;
  let ot3denom = 0;
  let ot4 = 0;
  let baseCorrect = 0;
  const misses = { ot1: [] as string[], ot2: [] as string[], ot4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALContainmentIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const query = ir.query || {};
    const recovered = recoverAccess(ir, query.agent, query.object);
    if (equalAccess(recovered.access, groundTruth.access)) {
      ot1++;
    } else if (misses.ot1.length < 8) {
      misses.ot1.push(
        `${groundTruth.id}: got ${JSON.stringify(recovered.access)} want ${JSON.stringify(groundTruth.access)}`
      );
    }
    if (
      equalAccess(
        containmentAccessBaseline(ir, query.agent, query.object).access,
        groundTruth.access
      )
    )
      baseCorrect++;

    for (const modality of UAAL_ACCESS_MODALITIES) {
      if (groundTruth.blocker?.[modality] != null) {
        ot2denom++;
        if (recovered.blocker[modality] === groundTruth.blocker[modality]) {
          ot2++;
        } else if (misses.ot2.length < 8) {
          misses.ot2.push(
            `${groundTruth.id}.${modality}: ${recovered.blocker[modality]} want ${groundTruth.blocker[modality]}`
          );
        }
      }
    }

    if (groundTruth.access && groundTruth.access.visual === groundTruth.access.audible) {
      ot3denom++;
      if (
        equalAccess(
          recovered.access,
          containmentAccessBaseline(ir, query.agent, query.object).access
        )
      )
        ot3++;
    }

    const corrupt = cloneJson(ir);
    const objectChain = enclosingChain(ir, query.object);
    const barrier = (corrupt.entities || []).find(
      (entity) => (entity.blocks || []).length && objectChain.includes(entity.id)
    );
    let flipped = false;
    if (barrier) {
      if ((barrier.blocks || []).includes('audible')) {
        barrier.blocks = (barrier.blocks || []).filter((modality) => modality !== 'audible');
      } else {
        barrier.blocks = [...(barrier.blocks || []), 'audible'];
      }
      const corruptRecovered = recoverAccess(corrupt, query.agent, query.object);
      flipped = corruptRecovered.access.audible !== recovered.access.audible;
    } else {
      const region = enclosingChain(ir, query.object)[0];
      if (region && query.object) {
        corrupt.entities = [
          ...(corrupt.entities || []),
          { id: '__occ_box', kind: 'container', label: 'injected', blocks: ['visual'] },
        ];
        corrupt.containment = (corrupt.containment || []).map((relation) =>
          relation.inner === query.object ? { inner: query.object, outer: '__occ_box' } : relation
        );
        corrupt.containment.push({ inner: '__occ_box', outer: region });
        const corruptRecovered = recoverAccess(corrupt, query.agent, query.object);
        flipped = corruptRecovered.access.visual !== recovered.access.visual;
      }
    }
    if (flipped) {
      ot4++;
    } else if (misses.ot4.length < 8) {
      misses.ot4.push(`${groundTruth.id}: no flip`);
    }
  }

  const ot1Rate = rate(ot1, n);
  const baselineRate = rate(baseCorrect, n);
  const edge = ot1Rate - baselineRate;
  const tests = {
    ot1_access_discrimination: makeRateTest(ot1, n, UAAL_ACCESS_THRESHOLDS.ot1),
    ot2_blocker_fidelity: makeRateTest(ot2, ot2denom, UAAL_ACCESS_THRESHOLDS.ot2),
    ot3_subsumes_containment: makeRateTest(ot3, ot3denom, UAAL_ACCESS_THRESHOLDS.ot3),
    ot4_falsification_flip: makeRateTest(ot4, n, UAAL_ACCESS_THRESHOLDS.ot4),
    emergent_beats_containment: {
      emergentRate: ot1Rate,
      baselineRate,
      edge,
      floor: UAAL_ACCESS_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_ACCESS_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

export const benchmarkAccess = benchmarkOcclusionAccess;
export const benchmarkOcclusion = benchmarkOcclusionAccess;

export const UAAL_COMPOSITION_CHECKS: Record<
  UAALCompositionDimension,
  (ir: UAALCompositionIR) => boolean
> = {
  norm: (ir) => ir.norm?.force === 'O',
  counterparty: (ir) =>
    truthyString(ir.query?.intended_recipient) &&
    ir.query?.intended_recipient === ir.commitment?.promisee,
  affordance: (ir) =>
    recoverAffords(ir, ir.query?.agent, ir.query?.action, ir.query?.object).affords,
  occlusion: (ir) => !recoverOcclusion(ir, ir.query?.agent, ir.query?.object).occluded,
  deadline: (ir) => (ir.time?.now ?? Infinity) <= (ir.time?.deadline ?? -Infinity),
};

export const CHECKS = UAAL_COMPOSITION_CHECKS;

const UAAL_COMPOSITION_DIMS: UAALCompositionDimension[] = [
  'norm',
  'counterparty',
  'affordance',
  'occlusion',
  'deadline',
];

export function recoverDischargeable(ir: UAALCompositionIR): DischargeableRecovery {
  const reasons = UAAL_COMPOSITION_DIMS.filter(
    (dimension) => !UAAL_COMPOSITION_CHECKS[dimension](ir)
  );
  return { dischargeable: reasons.length === 0, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution (gap-aware recovery) — the "three-body disposition" at the meaning layer.
//
// recoverOcclusion / recoverNormStatus / recoverDischargeable each COMMIT to a boolean/enum. On
// underdetermined input they silently coerce (missing `opaque` → "visible"; conflicting norms → the first
// norm's status; a discharge cycle → dischargeable=false), so a genuine gap is INEXPRESSIBLE — the layer
// cannot say "no answer follows from this IR." The resolve* functions DERIVE, from the IR structure alone,
// whether the query is answerable at all: UAALResolution = {status:'resolved', answer} | {status:'unresolvable',
// reason}. This is the verifier (V) for a model-emitted gap-object — given the IR, is the claimed gap real?
// See research/2026-07-10_three-body-disposition-gap-pilot.md. Determinate IRs still resolve; only genuine
// gaps flip to unresolvable (no false gaps — asserted by resolution.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Resolution contract (UAALGapReason / UAALStructuredGap / UAALResolution / structuredGap) ────
// Defined in ./contract (§8.2 stage 2: this package IS the meaning home) and re-exported here so
// sibling modules and the @holoscript/uaal shims keep their import shape.
// The definitions exist exactly once; `check:language-strata` fails any re-declaration.
export { structuredGap, aleatoricGap };
export type {
  UAALGapReason,
  UAALEpistemicReason,
  UAALAleatoricReason,
  UAALStructuredGap,
  UAALEpistemicGap,
  UAALAleatoricGap,
  UAALResolution,
} from './contract';

// Raw opacity: true | false | undefined (absent). Unlike opacityMap (which coerces absent → false via
// Boolean()), this preserves the crucial distinction between "explicitly transparent" and "unstated".
function rawOpacity(ir: UAALContainmentIR, id: string): boolean | undefined {
  const entity = (ir.entities || []).find((item) => item.id === id);
  return entity ? (entity.opaque as boolean | undefined) : undefined;
}

/**
 * Occlusion, honest about UNDERDETERMINED opacity. recoverOcclusion coerces a missing `opaque` field to false
 * ("visible") — indistinguishable from explicit opaque:false. resolveOcclusion walks the same object→agent
 * enclosing chain but reads three states per container: opaque:true (definite occluder → resolved occluded),
 * opaque:false (definitely transparent → keep looking), opaque absent (UNKNOWN). A container whose opacity is
 * unstated and could occlude makes the query unresolvable (underdetermined); an all-transparent chain resolves
 * occluded:false.
 */
export function resolveOcclusion(
  ir: UAALContainmentIR,
  agent: string | undefined,
  object: string | undefined
): UAALResolution<OcclusionRecovery> {
  const objectChain = enclosingChain(ir, object);
  const agentEnclosures = new Set(enclosingChain(ir, agent));
  let unknownContainer: string | null = null;
  for (const container of objectChain) {
    if (agentEnclosures.has(container)) break;
    const opaque = rawOpacity(ir, container);
    if (opaque === true) {
      return {
        query: 'occluded',
        status: 'resolved',
        answer: { occluded: true, occluder: container },
      };
    }
    if (opaque === undefined && unknownContainer === null) {
      unknownContainer = container;
    }
  }
  if (unknownContainer !== null) {
    return {
      query: 'occluded',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap: structuredGap(
        'occlusion',
        'occlusion.opacity_unstated',
        'underdetermined',
        unknownContainer
      ),
      obstruction: `the opacity of container "${unknownContainer}" between the agent and the object is unstated`,
    };
  }
  return { query: 'occluded', status: 'resolved', answer: { occluded: false, occluder: null } };
}

// A precedence/priority ranking that would break a norm conflict, declared on the IR or on either norm.
function hasPrecedence(ir: UAALDeonticIR, a: UAALDeonticNorm, b: UAALDeonticNorm): boolean {
  if ((ir as { precedence?: unknown }).precedence !== undefined) return true;
  if ((ir as { priority?: unknown }).priority !== undefined) return true;
  const rank = (norm: UAALDeonticNorm): boolean =>
    (norm as { priority?: unknown }).priority !== undefined ||
    (norm as { overrides?: unknown }).overrides !== undefined;
  return rank(a) || rank(b);
}

/**
 * Norm status, honest about an UNPRIORITIZED CONFLICT (a genuine deontic dilemma). recoverNormStatus evaluates
 * a single norm and never compares norms, so two jointly-unsatisfiable norms silently collapse to whichever is
 * queried. resolveNormStatus detects two crisp, expressible dilemma classes, either → unresolvable
 * (unprioritized_conflict):
 *   1. OPPOSING FORCE — two ACTIVE norms with opposing force (one O = must, one F = must-not) bearing on the
 *      SAME required_act, with no precedence declared.
 *   2. RESOURCE CONTENTION — two ACTIVE obligations (both force 'O') laying claim to the same non-empty
 *      `resource` (e.g. one ambulance owed to two emergencies), with no precedence declared. They can share a
 *      required_act or not — the scarce resource cannot satisfy both at once.
 * Precedence (via hasPrecedence) resolves either class.
 */
export function resolveNormStatus(
  ir: UAALDeonticIR,
  normId: string | undefined
): UAALResolution<NormStatusRecovery> {
  const active = (ir.norms || []).filter((norm) => norm.active !== false);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      const sameAct = truthyString(a.required_act) && a.required_act === b.required_act;
      const opposing = (a.force === 'O' && b.force === 'F') || (a.force === 'F' && b.force === 'O');
      if (sameAct && opposing && !hasPrecedence(ir, a, b)) {
        return {
          query: 'norm_status',
          status: 'unresolvable',
          reason: 'unprioritized_conflict',
          gap: structuredGap(
            'norm_status',
            'norm_status.opposing_force',
            'unprioritized_conflict',
            `${a.id}|${b.id}`
          ),
          obstruction: `norms "${a.id}" (${a.force}) and "${b.id}" (${b.force}) both bear on act "${String(a.required_act)}" with no precedence`,
        };
      }
      const sharedResource = truthyString(a.resource) && a.resource === b.resource;
      const bothObligations = a.force === 'O' && b.force === 'O';
      if (sharedResource && bothObligations && !hasPrecedence(ir, a, b)) {
        return {
          query: 'norm_status',
          status: 'unresolvable',
          reason: 'unprioritized_conflict',
          gap: structuredGap(
            'norm_status',
            'norm_status.resource_contention',
            'unprioritized_conflict',
            String(a.resource)
          ),
          obstruction: `obligations "${a.id}" and "${b.id}" both require the scarce resource "${String(a.resource)}" with no precedence`,
        };
      }
    }
  }
  return { query: 'norm_status', status: 'resolved', answer: recoverNormStatus(ir, normId) };
}

// Detect a cycle in the discharge-dependency graph (edge before → after). Returns the cycle path, else null.
function dischargeCycle(deps: UAALDischargeDependency[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const dep of deps) {
    if (!truthyString(dep.before) || !truthyString(dep.after)) continue;
    nodes.add(dep.before);
    nodes.add(dep.after);
    const list = adjacency.get(dep.before) || [];
    list.push(dep.after);
    adjacency.set(dep.before, list);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  let found: string[] | null = null;
  const visit = (node: string): boolean => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of adjacency.get(node) || []) {
      if (state.get(next) === 'visiting') {
        found = stack.slice(stack.indexOf(next)).concat(next);
        return true;
      }
      if (state.get(next) === undefined && visit(next)) return true;
    }
    stack.pop();
    state.set(node, 'done');
    return false;
  };
  for (const node of nodes) {
    if (state.get(node) === undefined && visit(node)) return found;
  }
  return null;
}

/**
 * An affordance bears on discharge but a required magnitude the capability check READS is absent from the IR,
 * so recoverAffords can only DEFAULT the capability to false rather than evaluate it — an inexpressible gap
 * masquerading as an ordinary affordance block. Returns the offending requirement descriptor, else null.
 *
 * Conservative on purpose: fires ONLY when the composition carries a full affordance query (agent, action,
 * object), the object exposes a matching offer with a non-empty `requires`, that requirement maps to a KNOWN
 * capability spec (UAAL_AFFORDANCE_REQUIREMENTS), and the agent's backing body attribute is genuinely unsupplied
 * (== null). A present-but-insufficient magnitude is a determinate block, NOT a gap, so it returns null.
 */
function affordanceMagnitudeMissing(
  ir: UAALCompositionIR
): { action: string; requirement: string; attr: string } | null {
  const query = ir.query || {};
  if (!truthyString(query.agent) || !truthyString(query.action) || !truthyString(query.object))
    return null;
  const objectEntity = (ir.entities || []).find((entity) => entity.id === query.object);
  const offer = (objectEntity?.offers || []).find((candidate) => candidate.action === query.action);
  if (!offer || !offer.requires) return null;
  const agentEntity = (ir.entities || []).find((entity) => entity.id === query.agent);
  const body = agentEntity?.body;
  for (const key of Object.keys(offer.requires)) {
    const spec = UAAL_AFFORDANCE_REQUIREMENTS[key];
    if (!spec) continue;
    if (body?.[spec.attr] == null) {
      return { action: query.action, requirement: key, attr: spec.attr };
    }
  }
  return null;
}

/**
 * Dischargeability, honest about a CYCLIC dependency (the three-body analog) and MISSING preconditions.
 * recoverDischargeable runs a fixed 5-dim checklist with no dependency model, so a discharge cycle
 * (A after B, B after C, C after A) silently collapses to dischargeable=false — reported as an ordinary block
 * rather than "no consistent order exists." resolveDischargeable inspects the optional `dependencies` edges for
 * a cycle → unresolvable (cyclic_dependency); flags a stated-but-empty time constraint → unresolvable
 * (missing_precondition); and flags an affordance whose required magnitude is unsupplied (so the capability
 * check can only be defaulted, not evaluated) → unresolvable (missing_precondition). Otherwise it defers to
 * recoverDischargeable.
 */
export function resolveDischargeable(ir: UAALCompositionIR): UAALResolution<DischargeableRecovery> {
  const deps = Array.isArray(ir.dependencies) ? ir.dependencies : [];
  const cycle = dischargeCycle(deps);
  if (cycle) {
    return {
      query: 'dischargeable',
      status: 'unresolvable',
      reason: 'cyclic_dependency',
      gap: structuredGap(
        'dischargeable',
        'dischargeable.cyclic_order',
        'cyclic_dependency',
        cycle.join('→')
      ),
      obstruction: `discharge order forms a cycle (${cycle.join(' → ')}); no obligation can act first`,
    };
  }
  if (ir.time !== undefined && ir.time.now === undefined && ir.time.deadline === undefined) {
    return {
      query: 'dischargeable',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap(
        'dischargeable',
        'dischargeable.unstated_deadline',
        'missing_precondition'
      ),
      obstruction:
        'a deadline constrains discharge but neither the current time nor the deadline is stated',
    };
  }
  const missingMagnitude = affordanceMagnitudeMissing(ir);
  if (missingMagnitude) {
    return {
      query: 'dischargeable',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap(
        'dischargeable',
        'dischargeable.unstated_magnitude',
        'missing_precondition',
        missingMagnitude.attr
      ),
      obstruction: `affordance "${missingMagnitude.action}" requires "${missingMagnitude.requirement}" but the agent's "${missingMagnitude.attr}" magnitude is unstated (capability can only be defaulted)`,
    };
  }
  return { query: 'dischargeable', status: 'resolved', answer: recoverDischargeable(ir) };
}

export function singleBaseline(
  ir: UAALCompositionIR,
  dimension: UAALCompositionDimension
): Pick<DischargeableRecovery, 'dischargeable'> {
  return { dischargeable: UAAL_COMPOSITION_CHECKS[dimension](ir) };
}

function compositionSingleRates(
  correct: Record<UAALCompositionDimension, number>,
  n: number
): Record<UAALCompositionDimension, number> {
  return {
    norm: rate(correct.norm, n),
    counterparty: rate(correct.counterparty, n),
    affordance: rate(correct.affordance, n),
    occlusion: rate(correct.occlusion, n),
    deadline: rate(correct.deadline, n),
  };
}

function repairCompositionBlock(
  ir: UAALCompositionIR,
  blockReason: UAALCompositionDimension | undefined
): void {
  if (blockReason === 'norm') {
    ir.norm = { ...(ir.norm || {}), force: 'O' };
  } else if (blockReason === 'counterparty') {
    ir.query = { ...(ir.query || {}), intended_recipient: ir.commitment?.promisee };
  } else if (blockReason === 'affordance') {
    const object = (ir.entities || []).find((entity) => entity.id === ir.query?.object);
    const agent = (ir.entities || []).find((entity) => entity.id === ir.query?.agent);
    const offer =
      object?.offers?.find((candidate) => candidate.action === ir.query?.action) ||
      object?.offers?.[0];
    if (offer) {
      setRequirementsSatisfied(ensureBody(agent), offer.requires);
      for (const precondition of offer.preconditions || []) {
        const proposition = (ir.propositions || []).find(
          (candidate) => candidate.id === precondition
        );
        if (proposition) proposition.holds = true;
      }
    }
  } else if (blockReason === 'occlusion') {
    for (const entity of ir.entities || []) {
      if (entity.opaque) entity.opaque = false;
    }
  } else if (blockReason === 'deadline') {
    ir.time = { ...(ir.time || {}), now: (ir.time?.deadline ?? 0) - 1 };
  }
}

export function benchmarkComposition(
  rows: Array<UAALSemanticBenchmarkRow<UAALCompositionIR, UAALCompositionMetadata>>
): UAALCompositionBenchmarkResult {
  let n = 0;
  let it1 = 0;
  let it2 = 0;
  let it2denom = 0;
  let it4 = 0;
  const singleCorrect: Record<UAALCompositionDimension, number> = {
    norm: 0,
    counterparty: 0,
    affordance: 0,
    occlusion: 0,
    deadline: 0,
  };
  const misses = { it1: [] as string[], it2: [] as string[], it4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALCompositionIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const expectedDischargeable = Boolean(groundTruth.dischargeable);
    const recovered = recoverDischargeable(ir);
    if (recovered.dischargeable === expectedDischargeable) {
      it1++;
    } else if (misses.it1.length < 8) {
      misses.it1.push(
        `${groundTruth.id}: got ${recovered.dischargeable} want ${expectedDischargeable}`
      );
    }

    for (const dimension of UAAL_COMPOSITION_DIMS) {
      if (singleBaseline(ir, dimension).dischargeable === expectedDischargeable)
        singleCorrect[dimension]++;
    }

    if (!expectedDischargeable) {
      it2denom++;
      if (recovered.reasons.length === 1 && recovered.reasons[0] === groundTruth.block_reason) {
        it2++;
      } else if (misses.it2.length < 8) {
        misses.it2.push(
          `${groundTruth.id}: reasons ${JSON.stringify(recovered.reasons)} want ${groundTruth.block_reason}`
        );
      }
    }

    const corrupt = cloneJson(ir);
    if (expectedDischargeable) {
      corrupt.time = { ...(corrupt.time || {}), now: (corrupt.time?.deadline ?? 0) + 5 };
    } else {
      repairCompositionBlock(corrupt, groundTruth.block_reason);
    }
    const corruptRecovered = recoverDischargeable(corrupt);
    if (corruptRecovered.dischargeable !== recovered.dischargeable) {
      it4++;
    } else if (misses.it4.length < 8) {
      misses.it4.push(`${groundTruth.id}: stayed ${recovered.dischargeable}`);
    }
  }

  const compositeRate = rate(it1, n);
  const singleRates = compositionSingleRates(singleCorrect, n);
  const bestSingle = Math.max(...Object.values(singleRates));
  const edge = compositeRate - bestSingle;
  const tests = {
    it1_discrimination: makeRateTest(it1, n, UAAL_COMPOSITION_THRESHOLDS.it1),
    it2_block_fidelity: makeRateTest(it2, it2denom, UAAL_COMPOSITION_THRESHOLDS.it2),
    it3_composition_necessary: {
      emergentRate: compositeRate,
      compositeRate,
      singleRates,
      bestSingle,
      edge,
      floor: 0,
      pass: UAAL_COMPOSITION_DIMS.every((dimension) => compositeRate > singleRates[dimension]),
    },
    it4_falsification_flip: makeRateTest(it4, n, UAAL_COMPOSITION_THRESHOLDS.it4),
    emergent_beats_best_single: {
      emergentRate: compositeRate,
      compositeRate,
      bestSingle,
      edge,
      floor: UAAL_COMPOSITION_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_COMPOSITION_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

/**
 * Affordance, honest about UNKNOWN physical preconditions (roadmap Wave 1.1 / 4.1 — the embodiment-
 * critical resolver). recoverAffords coerces an unstated precondition OR an unstated agent capability
 * to "does not afford", indistinguishable from an explicit block. resolveAffords reads three states
 * per offer, mirroring resolveOcclusion's opaque true/false/absent: a capability/precondition that is
 * explicitly unsatisfied → blocked; explicitly satisfied → keep checking; UNSTATED → unknown. A
 * confident "yes it affords" over an unstated precondition is the embodied-hallucination failure the
 * human-floor discipline forbids.
 */
export function resolveAffords(
  ir: UAALAffordanceIR,
  agent: string | undefined,
  action: string | undefined,
  object: string | undefined
): UAALResolution<AffordanceRecovery> {
  if (!truthyString(agent) || !truthyString(action) || !truthyString(object)) {
    return {
      query: 'affords',
      status: 'resolved',
      answer: { affords: false, reason: 'invalid_query' },
    };
  }
  const agentEntity = (ir.entities || []).find((entity) => entity.id === agent);
  const objectEntity = (ir.entities || []).find((entity) => entity.id === object);
  const offers = (objectEntity?.offers || []).filter((candidate) => candidate.action === action);
  if (offers.length === 0) {
    // The object simply does not offer this action — a determinate 'no', not a gap.
    return { query: 'affords', status: 'resolved', answer: { affords: false, reason: 'no_offer' } };
  }

  const stated = new Set((ir.propositions || []).map((proposition) => proposition.id));
  const holds = new Map(
    (ir.propositions || []).map((proposition) => [proposition.id, Boolean(proposition.holds)])
  );
  type Verdict =
    | { kind: 'affords' }
    | { kind: 'blocked'; reason: string }
    | { kind: 'unknown'; code: string; base: UAALEpistemicReason; evidence: string };

  const verdicts: Verdict[] = offers.map((offer): Verdict => {
    // Capability: a REQUIRED attribute the agent's body does not STATE is unknown, not a block.
    for (const key of Object.keys(offer.requires || {})) {
      if (!UAAL_AFFORDANCE_REQUIREMENTS[key]) continue;
      const spec = UAAL_AFFORDANCE_REQUIREMENTS[key];
      if (agentEntity?.body?.[spec.attr] == null) {
        return {
          kind: 'unknown',
          code: 'affordance.unstated_capability',
          base: 'missing_precondition',
          evidence: key,
        };
      }
    }
    const capability = requirementCheck(agentEntity?.body, offer.requires);
    if (!capability.affords) return { kind: 'blocked', reason: capability.reason || 'capability' };
    // Preconditions: an UNSTATED precondition proposition is unknown, not a block.
    for (const precondition of offer.preconditions || []) {
      if (!stated.has(precondition)) {
        return {
          kind: 'unknown',
          code: 'affordance.unstated_precondition',
          base: 'missing_precondition',
          evidence: precondition,
        };
      }
      if (!holds.get(precondition)) return { kind: 'blocked', reason: 'precondition' };
    }
    return { kind: 'affords' };
  });

  const anyAfford = verdicts.some((verdict) => verdict.kind === 'affords');
  const anyBlocked = verdicts.some((verdict) => verdict.kind === 'blocked');
  const unknowns = verdicts.filter(
    (verdict): verdict is Extract<Verdict, { kind: 'unknown' }> => verdict.kind === 'unknown'
  );

  // One offer affords, another blocks, no precedence → genuinely indeterminate.
  if (anyAfford && anyBlocked) {
    return {
      query: 'affords',
      status: 'unresolvable',
      reason: 'unprioritized_conflict',
      gap: structuredGap(
        'affordance',
        'affordance.conflicting_offers',
        'unprioritized_conflict',
        String(action)
      ),
      obstruction: `two offers for "${action}" on "${object}" disagree with no precedence`,
    };
  }
  // A determinate afford stands even if a different offer is unknown.
  if (anyAfford)
    return { query: 'affords', status: 'resolved', answer: { affords: true, reason: null } };
  // No offer determinately affords; if any path is merely UNKNOWN, the query is underdetermined.
  if (unknowns.length > 0) {
    const unknown = unknowns[0];
    return {
      query: 'affords',
      status: 'unresolvable',
      reason: unknown.base,
      gap: structuredGap('affordance', unknown.code, unknown.base, unknown.evidence),
      obstruction: `affordance of "${action}" is underdetermined: ${unknown.code.split('.').pop()} "${unknown.evidence}" is unstated`,
    };
  }
  // Every offer is determinately blocked → an honest 'no'.
  return {
    query: 'affords',
    status: 'resolved',
    answer: recoverAffords(ir, agent, action, object),
  };
}

/**
 * Belief-staleness, honest about UNKNOWN time (roadmap Wave 1.1). recoverBeliefStatus defaults an
 * absent t_now to Infinity and an absent t_formed to -Infinity, silently committing to fresh/stale/
 * error even when time is unstated. resolveTemporal abstains: current time unstated ⇒ cannot locate
 * "now"; and the load-bearing case — a belief that disagrees with the current fact is STALE (was
 * right at formation, the fact then changed) or ERROR (never right), and without the formation time
 * those two are indistinguishable.
 */
export function resolveTemporal(
  ir: UAALTemporalIR,
  beliefId: string | undefined,
  factId: string | undefined
): UAALResolution<BeliefStatusRecovery> {
  const belief = (ir.beliefs || []).find((candidate) => candidate.id === beliefId);
  if (!belief) {
    return {
      query: 'belief_status',
      status: 'resolved',
      answer: { status: 'unknown', change_event: null },
    };
  }
  if (typeof ir.t_now !== 'number') {
    return {
      query: 'belief_status',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('temporal', 'temporal.unstated_now', 'missing_precondition', 't_now'),
      obstruction: 'current time t_now is unstated — cannot locate the belief against "now"',
    };
  }
  const now = factValueAt(ir, factId, ir.t_now);
  if (belief.prop === now) {
    return {
      query: 'belief_status',
      status: 'resolved',
      answer: { status: 'fresh', change_event: null },
    };
  }
  // The belief disagrees with the current fact → stale or error, decidable only with the formation time.
  if (typeof belief.t_formed !== 'number') {
    return {
      query: 'belief_status',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap: structuredGap(
        'temporal',
        'temporal.unstated_formation_time',
        'underdetermined',
        beliefId || 'belief'
      ),
      obstruction:
        'belief formation time is unstated — stale (was right, fact changed) vs error (never right) is undecidable',
    };
  }
  return {
    query: 'belief_status',
    status: 'resolved',
    answer: recoverBeliefStatus(ir, beliefId, factId),
  };
}

/**
 * Commitment status, honest about UNKNOWN time (roadmap Wave 1.1). recoverCommitmentStatus defaults
 * an absent `now` to Infinity, so any commitment with a past deadline looks "broken" even when the
 * current time is unknown. resolveCommitment abstains on that open-vs-broken ambiguity: an
 * undischarged commitment with a stated deadline but an UNSTATED current time cannot be called broken
 * (deadline missed) or open (not yet due) — you cannot say a deadline was missed without a clock.
 */
export function resolveCommitment(
  ir: UAALCommitmentIR,
  commitmentId: string | undefined
): UAALResolution<CommitmentStatusRecovery> {
  const commitment = commitmentById(ir, commitmentId);
  if (!commitment) {
    return {
      query: 'commitment_status',
      status: 'resolved',
      answer: { status: 'open', fulfilling: null },
    };
  }
  const recovered = recoverCommitmentStatus(ir, commitmentId);
  if (recovered.status === 'discharged') {
    return { query: 'commitment_status', status: 'resolved', answer: recovered };
  }
  // Undischarged: open-vs-broken needs BOTH a deadline and the current time.
  if (typeof commitment.due_time === 'number' && typeof ir.now !== 'number') {
    return {
      query: 'commitment_status',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('commitment', 'commitment.unstated_now', 'missing_precondition', 'now'),
      obstruction:
        'current time is unstated — an undischarged commitment past a stated deadline cannot be called broken vs open',
    };
  }
  return { query: 'commitment_status', status: 'resolved', answer: recovered };
}

// Detect a production cycle reachable from `start`. Edge E → M iff M appears in one of E's sufficient
// sets AND M is itself an effect (has its own production rule). Cycles are detected over the full
// effect→effect reference graph (independent of `occurs`), because a cyclic production spec makes
// `holds()` guard-break arbitrarily — the recovered verdict is an arbitrary fixpoint the IR does not
// determine, regardless of what occurs. (collectCounterfactualProducers is visited-guarded and
// terminates on cycles; the abstention is semantic, not a crash guard.) Returns the cycle path
// (e.g. ['E','A','E']), else null. Mirrors dischargeCycle's DFS.
function productionCycle(effects: Map<string, string[][]>, start: string): string[] | null {
  const neighbors = (id: string): string[] => {
    const out: string[] = [];
    for (const set of effects.get(id) || []) {
      for (const member of set) {
        if (effects.has(member)) out.push(member);
      }
    }
    return out;
  };
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  let found: string[] | null = null;
  const visit = (node: string): boolean => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of neighbors(node)) {
      if (state.get(next) === 'visiting') {
        found = stack.slice(stack.indexOf(next)).concat(next);
        return true;
      }
      if (state.get(next) === undefined && visit(next)) return true;
    }
    stack.pop();
    state.set(node, 'done');
    return false;
  };
  visit(start);
  return found;
}

/**
 * Necessity, honest about a NON-IDENTIFIABLE causal cycle. recoverNecessity evaluates counterfactual
 * necessity over a closed-world production model whose `holds()` breaks cycles with an arbitrary guard
 * (returns false on revisit), so an effect that participates in a production cycle (A produces B, B
 * produces A) silently yields a definite necessity verdict for a fixpoint the IR does not determine.
 * (`collectCounterfactualProducers` is visited-guarded, so the recognizer terminates on cyclic input —
 * but the verdict it would return is still ungrounded.) resolveCounterfactual detects a production cycle
 * reachable from the queried effect and abstains (cyclic_dependency): necessity has no consistent grounding order.
 * An acyclic model resolves normally — the determinate single-producer / chain / overdetermination /
 * preemption cases are acyclic DAGs, so a determinate IR is never flipped to a false gap.
 */
export function resolveCounterfactual(ir: UAALCounterfactualIR): UAALResolution<UAALNecessityMap> {
  const effectId = ir.query?.effect;
  if (truthyString(effectId)) {
    // Aleatoric (irreducible): the queried effect is produced by a genuinely stochastic process.
    // Counterfactual necessity has no determinate answer, and — unlike an underdetermined (missing
    // sufficient set) or an ungrounded production cycle (cyclic_dependency) — NO additional information
    // resolves it: the outcome is irreducibly random. This is the one place the necessity resolver
    // returns an ALEATORIC gap rather than an epistemic one. Conservative: only the queried effect's
    // own explicit `stochastic` flag triggers it; a deterministic IR is never flipped to a false gap.
    const queried = (ir.effects || []).find((effect) => effect.id === effectId);
    if (queried?.stochastic === true) {
      return {
        query: 'necessity',
        status: 'unresolvable',
        reason: 'irreducible_stochastic',
        gap: aleatoricGap('counterfactual', 'counterfactual.irreducible_chance', String(effectId)),
        obstruction: `effect "${String(effectId)}" arises from an irreducibly stochastic process; counterfactual necessity has no determinate answer and no further information would resolve it`,
      };
    }
    const effects = counterfactualEffectMap(ir);
    const cycle = productionCycle(effects, effectId as string);
    if (cycle) {
      return {
        query: 'necessity',
        status: 'unresolvable',
        reason: 'cyclic_dependency',
        gap: structuredGap(
          'counterfactual',
          'counterfactual.non_identifiable_cycle',
          'cyclic_dependency',
          cycle.join(' → ')
        ),
        obstruction: `effect "${String(effectId)}" rests on an ungrounded production cycle (${cycle.join(' → ')}); necessity has no consistent grounding order`,
      };
    }
  }
  return { query: 'necessity', status: 'resolved', answer: recoverNecessity(ir) };
}

export function essentialRoles(ir: UAALMereologyIR): Set<string> {
  const roles = new Set<string>();
  for (const part of ir.parts || []) {
    if (part.essential && truthyString(part.role)) roles.add(part.role);
  }
  return roles;
}

export function partsTraceToWhole(ir: UAALMereologyIR): boolean {
  const whole = ir.query?.whole;
  const containmentView: UAALContainmentIR = { containment: ir.part_of || [] };
  return (ir.parts || []).every((part) =>
    enclosingChain(containmentView, part.id).includes(whole || '')
  );
}

export function recoverPersistence(ir: UAALMereologyIR): PersistenceRecovery {
  const removed = (ir.changes || []).filter((change) => change.op === 'remove');
  const added = (ir.changes || []).filter((change) => change.op === 'add');
  const addedRoles = new Set(added.map((change) => change.role).filter(truthyString));

  for (const removal of removed) {
    if (!removal.essential) continue;
    if (truthyString(removal.role) && addedRoles.has(removal.role)) continue;
    return { persists: false, dissolving_role: truthyString(removal.role) ? removal.role : null };
  }
  return { persists: true, dissolving_role: null };
}

/**
 * Persistence, honest about UNSTATED essentiality. recoverPersistence coerces a removed part's absent
 * `essential` flag to false (non-essential → the whole persists) — indistinguishable from an explicit
 * essential:false. resolveMereology reads three states per removed part: essential:true (a definite
 * dissolver → if unreplaced the whole does not persist), essential:false (definitely survivable → keep
 * looking), essential absent (UNKNOWN). When no stated-essential unreplaced removal already dissolves
 * the whole, an unreplaced removal whose essentiality is unstated makes persistence unresolvable
 * (missing_precondition): the whole survives if that part is inessential and dissolves if it is
 * essential, and the IR does not say which. A part removed and replaced in the same role, or a scene
 * whose removals all state essentiality, resolves normally — a determinate IR is never flipped to a
 * false gap.
 */
export function resolveMereology(ir: UAALMereologyIR): UAALResolution<PersistenceRecovery> {
  const changes = ir.changes || [];
  const removed = changes.filter((change) => change.op === 'remove');
  const addedRoles = new Set(
    changes
      .filter((change) => change.op === 'add')
      .map((change) => change.role)
      .filter(truthyString)
  );
  const unreplaced = (change: UAALMereologyChange): boolean =>
    !(truthyString(change.role) && addedRoles.has(change.role));

  // A stated-essential, unreplaced removal already dissolves the whole — determinate, resolve.
  const definiteDissolve = removed.some(
    (change) => change.essential === true && unreplaced(change)
  );
  if (!definiteDissolve) {
    const unknown = removed.find(
      (change) => typeof change.essential !== 'boolean' && unreplaced(change)
    );
    if (unknown) {
      const ref = truthyString(unknown.part) ? unknown.part : unknown.role;
      const label = truthyString(ref) ? (ref as string) : 'a removed part';
      return {
        query: 'persistence',
        status: 'unresolvable',
        reason: 'missing_precondition',
        gap: structuredGap(
          'mereology',
          'mereology.unstated_essentiality',
          'missing_precondition',
          truthyString(ref) ? (ref as string) : undefined
        ),
        obstruction: `${label} is removed without replacement and its essentiality is unstated — the whole persists if it is inessential and dissolves if it is essential`,
      };
    }
  }
  return { query: 'persistence', status: 'resolved', answer: recoverPersistence(ir) };
}

export function essentialismPersistence(
  ir: UAALMereologyIR
): Pick<PersistenceRecovery, 'persists'> {
  return { persists: !(ir.changes || []).some((change) => change.op === 'remove') };
}

function invertMereology(ir: UAALMereologyIR, metadata: UAALMereologyMetadata): UAALMereologyIR {
  const corrupt = cloneJson(ir);
  if (metadata.persists) {
    const removedEssential = (corrupt.changes || []).find(
      (change) => change.op === 'remove' && change.essential
    );
    if (removedEssential) {
      corrupt.changes = (corrupt.changes || []).filter(
        (change) => !(change.op === 'add' && change.role === removedEssential.role)
      );
    } else {
      const removal = (corrupt.changes || []).find((change) => change.op === 'remove');
      if (removal) {
        removal.essential = true;
        corrupt.changes = (corrupt.changes || []).filter(
          (change) => !(change.op === 'add' && change.role === removal.role)
        );
      }
    }
  } else {
    const removedEssential = (corrupt.changes || []).find(
      (change) => change.op === 'remove' && change.essential
    );
    if (removedEssential) {
      corrupt.changes = [
        ...(corrupt.changes || []),
        { op: 'add', part: '__repl_injected', role: removedEssential.role, essential: true },
      ];
    }
  }
  return corrupt;
}

export function benchmarkMereology(
  rows: Array<UAALSemanticBenchmarkRow<UAALMereologyIR, UAALMereologyMetadata>>
): UAALMereologyBenchmarkResult {
  let n = 0;
  let mp1 = 0;
  let mp2 = 0;
  let mp2denom = 0;
  let mp3 = 0;
  let mp4 = 0;
  let essentialismCorrect = 0;
  const misses = { mp1: [] as string[], mp2: [] as string[], mp4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALMereologyIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const recovered = recoverPersistence(ir);
    if (recovered.persists === Boolean(groundTruth.persists)) {
      mp1++;
    } else if (misses.mp1.length < 8) {
      misses.mp1.push(`${groundTruth.id}: got ${recovered.persists} want ${groundTruth.persists}`);
    }
    if (essentialismPersistence(ir).persists === Boolean(groundTruth.persists))
      essentialismCorrect++;

    if (groundTruth.persists === false) {
      mp2denom++;
      if (recovered.dissolving_role === groundTruth.dissolving_role) {
        mp2++;
      } else if (misses.mp2.length < 8) {
        misses.mp2.push(
          `${groundTruth.id}: role ${recovered.dissolving_role} want ${groundTruth.dissolving_role}`
        );
      }
    }

    if (partsTraceToWhole(ir) && essentialRoles(ir).size > 0) mp3++;

    const corrupt = invertMereology(ir, groundTruth);
    const corruptRecovered = recoverPersistence(corrupt);
    if (corruptRecovered.persists !== recovered.persists) {
      mp4++;
    } else if (misses.mp4.length < 8) {
      misses.mp4.push(`${groundTruth.id}: stayed ${recovered.persists} after inversion`);
    }
  }

  const mp1Rate = rate(mp1, n);
  const essentialismRate = rate(essentialismCorrect, n);
  const edge = mp1Rate - essentialismRate;
  const tests = {
    mp1_discrimination: makeRateTest(mp1, n, UAAL_MEREOLOGY_THRESHOLDS.mp1),
    mp2_dissolving_role_fidelity: makeRateTest(mp2, mp2denom, UAAL_MEREOLOGY_THRESHOLDS.mp2),
    mp3_structural_sanity: makeRateTest(mp3, n, UAAL_MEREOLOGY_THRESHOLDS.mp3),
    mp4_falsification_flip: makeRateTest(mp4, n, UAAL_MEREOLOGY_THRESHOLDS.mp4),
    emergent_beats_essentialism: {
      emergentRate: mp1Rate,
      essentialismRate,
      edge,
      floor: UAAL_MEREOLOGY_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_MEREOLOGY_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

export function reachableTerminals(
  ir: UAALTensionIR
): Array<{ id: string; outcome: string | undefined }> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of ir.unfired || []) {
    if (!truthyString(edge.from) || !truthyString(edge.to)) continue;
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    adjacency.get(edge.from)?.add(edge.to);
  }

  const terminalIds = new Set((ir.terminals || []).map((terminal) => terminal.id));
  const start = ir.query?.frontier || ir.frontier;
  const seen = new Set<string>();
  const stack = truthyString(start) ? [start] : [];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) stack.push(next);
    }
  }

  const outcomeOf = new Map(
    (ir.terminals || []).map((terminal) => [terminal.id, terminal.outcome])
  );
  return [...seen]
    .filter((id) => terminalIds.has(id) && id !== start)
    .map((id) => ({ id, outcome: outcomeOf.get(id) }));
}

export function recoverTension(ir: UAALTensionIR): TensionRecovery {
  const reached = reachableTerminals(ir);
  const goal = reached.find((terminal) => terminal.outcome === 'goal') || null;
  const antigoal = reached.find((terminal) => terminal.outcome === 'antigoal') || null;
  const tension = Boolean(goal && antigoal);
  return {
    tension,
    contradiction: tension && goal && antigoal ? { goal: goal.id, antigoal: antigoal.id } : null,
    reachedCount: reached.length,
  };
}

export function branchCountTension(ir: UAALTensionIR): Pick<TensionRecovery, 'tension'> {
  const start = ir.query?.frontier || ir.frontier;
  return { tension: (ir.unfired || []).filter((edge) => edge.from === start).length >= 2 };
}

/**
 * Tension, honest about an UNSTATED terminal outcome. recoverTension flags a goal↔antigoal contradiction
 * only when it reaches BOTH a terminal with outcome 'goal' and one with outcome 'antigoal'; a reached
 * terminal whose `outcome` is unstated is silently treated as neither, so a contradiction that hinges on
 * that terminal collapses to tension:false. resolveTension abstains when the stated terminals do not
 * already give both poles yet enough reachable terminals have an UNSTATED outcome to possibly supply the
 * missing pole(s) (missing_precondition): one unstated terminal reachable alongside a stated goal could be
 * the antigoal — the contradiction is undetermined. When both poles are already reached (determinate
 * tension) or too few unstated terminals remain to complete a pair, it resolves normally. Determinate
 * rows state every reachable terminal's outcome (the tt3 structural invariant), so a determinate IR is
 * never flipped to a false gap.
 */
export function resolveTension(ir: UAALTensionIR): UAALResolution<TensionRecovery> {
  const reached = reachableTerminals(ir);
  const hasGoal = reached.some((terminal) => terminal.outcome === 'goal');
  const hasAntigoal = reached.some((terminal) => terminal.outcome === 'antigoal');
  if (!(hasGoal && hasAntigoal)) {
    const unstated = reached.filter((terminal) => terminal.outcome == null);
    const need = (hasGoal ? 0 : 1) + (hasAntigoal ? 0 : 1);
    if (unstated.length >= need) {
      const ids = unstated.map((terminal) => terminal.id).join(', ');
      return {
        query: 'tension',
        status: 'unresolvable',
        reason: 'missing_precondition',
        gap: structuredGap('tension', 'tension.unstated_outcome', 'missing_precondition', ids),
        obstruction: `reachable terminal(s) ${ids} have an unstated outcome — they could resolve to goal or antigoal, so whether a goal↔antigoal contradiction exists is undetermined`,
      };
    }
  }
  return { query: 'tension', status: 'resolved', answer: recoverTension(ir) };
}

function tensionFidelity(recovered: TensionRecovery, metadata: UAALTensionMetadata): boolean {
  if (metadata.tension) {
    return (
      recovered.contradiction != null &&
      recovered.contradiction.goal === metadata.contradiction?.goal &&
      recovered.contradiction.antigoal === metadata.contradiction?.antigoal
    );
  }
  return recovered.contradiction === null;
}

function tensionStructural(ir: UAALTensionIR): boolean {
  const nodeIds = new Set((ir.nodes || []).map((node) => node.id));
  const start = ir.query?.frontier || ir.frontier;
  if (!truthyString(start) || !nodeIds.has(start)) return false;
  const terminalIds = new Set((ir.terminals || []).map((terminal) => terminal.id));
  return (
    reachableTerminals(ir).every(
      (terminal) => terminalIds.has(terminal.id) && terminal.outcome != null
    ) && (ir.unfired || []).every((edge) => edge.from != null && edge.to != null)
  );
}

function tensionFlip(
  ir: UAALTensionIR,
  metadata: UAALTensionMetadata,
  recovered: TensionRecovery
): boolean {
  const corrupt = cloneJson(ir);
  const start = corrupt.query?.frontier || corrupt.frontier;
  if (metadata.tension) {
    const antigoalId =
      recovered.contradiction?.antigoal ||
      (corrupt.terminals || []).find((terminal) => terminal.outcome === 'antigoal')?.id;
    corrupt.unfired = (corrupt.unfired || []).filter((edge) => edge.to !== antigoalId);
  } else {
    const reached = reachableTerminals(corrupt);
    const hasGoal = reached.some((terminal) => terminal.outcome === 'goal');
    const injectOutcome = hasGoal ? 'antigoal' : 'goal';
    corrupt.terminals = [
      ...(corrupt.terminals || []),
      { id: '__terminal_injected', outcome: injectOutcome },
    ];
    corrupt.nodes = [
      ...(corrupt.nodes || []),
      { id: '__terminal_injected', label: 'injected reversal' },
    ];
    corrupt.unfired = [
      ...(corrupt.unfired || []),
      { from: start, to: '__terminal_injected', via: 'injected reversal' },
    ];
  }
  return recoverTension(corrupt).tension !== recovered.tension;
}

export function benchmarkTension(
  rows: Array<UAALSemanticBenchmarkRow<UAALTensionIR, UAALTensionMetadata>>
): UAALTensionBenchmarkResult {
  let n = 0;
  let nt1 = 0;
  let nt2 = 0;
  let nt2denom = 0;
  let nt3 = 0;
  let nt4 = 0;
  let baselineCorrect = 0;
  const misses = { nt1: [] as string[], nt2: [] as string[], nt4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALTensionIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const recovered = recoverTension(ir);
    if (recovered.tension === Boolean(groundTruth.tension)) {
      nt1++;
    } else if (misses.nt1.length < 8) {
      misses.nt1.push(
        `${groundTruth.id}: recovered=${recovered.tension} truth=${groundTruth.tension}`
      );
    }
    if (branchCountTension(ir).tension === Boolean(groundTruth.tension)) baselineCorrect++;

    nt2denom++;
    if (tensionFidelity(recovered, groundTruth)) {
      nt2++;
    } else if (misses.nt2.length < 8) {
      misses.nt2.push(
        `${groundTruth.id}: contradiction ${JSON.stringify(recovered.contradiction)} vs ${JSON.stringify(groundTruth.contradiction)}`
      );
    }
    if (tensionStructural(ir)) nt3++;
    if (tensionFlip(ir, groundTruth, recovered)) {
      nt4++;
    } else if (misses.nt4.length < 8) {
      misses.nt4.push(`${groundTruth.id}: tension did not flip under corruption`);
    }
  }

  const nt1Rate = rate(nt1, n);
  const baselineRate = rate(baselineCorrect, n);
  const edge = nt1Rate - baselineRate;
  const tests = {
    nt1_discrimination: makeRateTest(nt1, n, UAAL_TENSION_THRESHOLDS.nt1),
    nt2_contradiction_fidelity: makeRateTest(nt2, nt2denom, UAAL_TENSION_THRESHOLDS.nt2),
    nt3_structural: makeRateTest(nt3, n, UAAL_TENSION_THRESHOLDS.nt3),
    nt4_falsification_flip: makeRateTest(nt4, n, UAAL_TENSION_THRESHOLDS.nt4),
    emergent_beats_branchcount: {
      emergentRate: nt1Rate,
      baselineRate,
      edge,
      floor: UAAL_TENSION_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_TENSION_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

function analogyBijection(ir: UAALAnalogyIR): Map<string, string> {
  return new Map((ir.mapping || []).map((mapping) => [mapping.from, mapping.to]));
}

function analogyRelationKey(pred: unknown, from: unknown, to: unknown): string {
  return `${String(pred)}::${String(from)}::${String(to)}`;
}

function analogyRelationSet(graph: UAALAnalogyGraph | undefined): Set<string> {
  return new Set(
    (graph?.relations || []).map((relation) =>
      analogyRelationKey(relation.pred, relation.from, relation.to)
    )
  );
}

function analogyAttrMap(graph: UAALAnalogyGraph | undefined): Map<string, Set<string>> {
  return new Map((graph?.entities || []).map((entity) => [entity.id, new Set(entity.attrs || [])]));
}

export function recoverValidity(ir: UAALAnalogyIR): AnalogyValidityRecovery {
  const map = analogyBijection(ir);
  const sourceRelations = ir.source?.relations || [];
  const targetRelations = analogyRelationSet(ir.target);
  let preserved = 0;
  const broken: string[] = [];

  for (const relation of sourceRelations) {
    const fromTarget = truthyString(relation.from) ? map.get(relation.from) : undefined;
    const toTarget = truthyString(relation.to) ? map.get(relation.to) : undefined;
    if (
      fromTarget != null &&
      toTarget != null &&
      targetRelations.has(analogyRelationKey(relation.pred, fromTarget, toTarget))
    ) {
      preserved++;
    } else {
      broken.push(String(relation.pred || ''));
    }
  }

  const images = [...map.values()];
  const injective = new Set(images).size === images.length;
  const endpointsCovered = sourceRelations.every(
    (relation) =>
      truthyString(relation.from) &&
      truthyString(relation.to) &&
      map.has(relation.from) &&
      map.has(relation.to)
  );
  const total = sourceRelations.length;
  return {
    valid: injective && endpointsCovered && total > 0 && preserved === total,
    preserved,
    total,
    broken,
    injective,
    endpointsCovered,
  };
}

/**
 * Analogy validity, honest about an EVIDENCE-FREE TARGET. recoverValidity grades validity by
 * relation preservation against the target's stated relation set; a target that states NO relations
 * yields preserved=0 and a coerced `valid:false` — indistinguishable from a genuinely broken
 * analogy, even though preservation (the family's only validity diagnostic) had no evidence to run
 * against. resolveValidity abstains exactly there (crisp trigger: the source states ≥1 relation
 * under a well-posed mapping — injective, all endpoints covered — AND the target states zero
 * relations). Everything else stays determinate: per-relation absence from a STATED target set is
 * closed-world non-preservation (the an4 break-one-relation flip is built on that semantics), and a
 * broken/unmapped mapping is determinately invalid (an3 structural + the an4 repair corruptor
 * recomputes mappings by permutation — a missing mapping is recoverable, not unknown). No-false-gap:
 * at an4 ≥ 0.95 a determinate row cannot carry an empty target relation set — valid rows need their
 * images present in it, and invalid rows flip via repairs that preserve against the stated set,
 * which no permutation can do against an empty one. Structural mirror of resolveAtomStatus
 * (zero embedded forms) with an4(0.95) playing pt4's role.
 */
export function resolveValidity(ir: UAALAnalogyIR): UAALResolution<AnalogyValidityRecovery> {
  const recovered = recoverValidity(ir);
  const targetRelations = analogyRelationSet(ir.target);
  if (
    recovered.total > 0 &&
    recovered.injective &&
    recovered.endpointsCovered &&
    targetRelations.size === 0
  ) {
    return {
      query: 'analogy_validity',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap: structuredGap(
        'analogy',
        'analogy.no_target_relations',
        'underdetermined',
        `${recovered.total} source relation(s)`
      ),
      obstruction: `the source states ${recovered.total} relation(s) under a total, injective mapping but the target states no relations — relation preservation is the only analogy-validity diagnostic, so valid vs invalid is undetermined`,
    };
  }
  return { query: 'analogy_validity', status: 'resolved', answer: recovered };
}

export function surfaceSimilarityValidity(ir: UAALAnalogyIR): {
  valid: boolean;
  shared: number;
  pairs: number;
} {
  const map = analogyBijection(ir);
  const sourceAttrs = analogyAttrMap(ir.source);
  const targetAttrs = analogyAttrMap(ir.target);
  let shared = 0;
  let pairs = 0;

  for (const [from, to] of map) {
    pairs++;
    const source = sourceAttrs.get(from) || new Set<string>();
    const target = targetAttrs.get(to) || new Set<string>();
    if ([...source].some((attr) => target.has(attr))) shared++;
  }
  return { valid: pairs > 0 && shared / pairs >= 0.5, shared, pairs };
}

function breakOneAnalogyRelation(ir: UAALAnalogyIR): UAALAnalogyIR {
  const corrupt = cloneJson(ir);
  const map = analogyBijection(corrupt);
  const relation = corrupt.source?.relations?.[0];
  if (!relation) return corrupt;
  const fromTarget = truthyString(relation.from) ? map.get(relation.from) : undefined;
  const toTarget = truthyString(relation.to) ? map.get(relation.to) : undefined;
  corrupt.target = {
    ...(corrupt.target || {}),
    relations: (corrupt.target?.relations || []).filter(
      (candidate) =>
        !(
          candidate.pred === relation.pred &&
          candidate.from === fromTarget &&
          candidate.to === toTarget
        )
    ),
  };
  return corrupt;
}

function repairAnalogyRelation(ir: UAALAnalogyIR): UAALAnalogyIR {
  const corrupt = cloneJson(ir);
  const map = analogyBijection(corrupt);
  const targetRelations = analogyRelationSet(corrupt.target);
  const repaired = [...(corrupt.target?.relations || [])];
  for (const relation of corrupt.source?.relations || []) {
    const fromTarget = truthyString(relation.from) ? map.get(relation.from) : undefined;
    const toTarget = truthyString(relation.to) ? map.get(relation.to) : undefined;
    const key = analogyRelationKey(relation.pred, fromTarget, toTarget);
    if (fromTarget != null && toTarget != null && !targetRelations.has(key)) {
      repaired.push({ pred: relation.pred, from: fromTarget, to: toTarget });
      targetRelations.add(key);
    }
  }
  corrupt.target = { ...(corrupt.target || {}), relations: repaired };
  return corrupt;
}

function permutations(items: string[]): string[][] {
  if (items.length <= 1) return [items];
  const output: string[][] = [];
  for (let index = 0; index < items.length; index++) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const permutation of permutations(rest)) output.push([items[index], ...permutation]);
  }
  return output;
}

function repairAnalogyMapping(ir: UAALAnalogyIR): UAALAnalogyIR {
  const corrupt = cloneJson(ir);
  const sourceEntities = corrupt.source?.entities || [];
  const targetEntities = corrupt.target?.entities || [];
  const targetRelations = analogyRelationSet(corrupt.target);
  for (const permutation of permutations(targetEntities.map((entity) => entity.id))) {
    const map = new Map(sourceEntities.map((entity, index) => [entity.id, permutation[index]]));
    const ok = (corrupt.source?.relations || []).every((relation) =>
      targetRelations.has(
        analogyRelationKey(relation.pred, map.get(relation.from || ''), map.get(relation.to || ''))
      )
    );
    if (ok) {
      corrupt.mapping = sourceEntities.map((entity, index) => ({
        from: entity.id,
        to: permutation[index],
      }));
      break;
    }
  }
  return corrupt;
}

export function benchmarkAnalogy(
  rows: Array<UAALSemanticBenchmarkRow<UAALAnalogyIR, UAALAnalogyMetadata>>
): UAALAnalogyBenchmarkResult {
  let n = 0;
  let an1 = 0;
  let an2 = 0;
  let an3 = 0;
  let an4 = 0;
  let surfaceCorrect = 0;
  const misses = {
    an1: [] as string[],
    an2: [] as string[],
    an3: [] as string[],
    an4: [] as string[],
  };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALAnalogyIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const recovered = recoverValidity(ir);
    if (recovered.valid === Boolean(groundTruth.valid)) {
      an1++;
    } else if (misses.an1.length < 8) {
      misses.an1.push(
        `${groundTruth.id}: recovered valid=${recovered.valid} truth=${groundTruth.valid}`
      );
    }
    if (surfaceSimilarityValidity(ir).valid === Boolean(groundTruth.valid)) surfaceCorrect++;

    if (
      recovered.preserved === groundTruth.preserved_relations &&
      recovered.total === groundTruth.required_relations
    ) {
      an2++;
    } else if (misses.an2.length < 8) {
      misses.an2.push(
        `${groundTruth.id}: recovered ${recovered.preserved}/${recovered.total} declared ${groundTruth.preserved_relations}/${groundTruth.required_relations}`
      );
    }

    if (recovered.injective && recovered.endpointsCovered) {
      an3++;
    } else if (misses.an3.length < 8) {
      misses.an3.push(
        `${groundTruth.id}: injective=${recovered.injective} endpointsCovered=${recovered.endpointsCovered}`
      );
    }

    const corrupt = groundTruth.valid
      ? breakOneAnalogyRelation(ir)
      : groundTruth.class === 'partial_break'
        ? repairAnalogyRelation(ir)
        : repairAnalogyMapping(ir);
    if (recoverValidity(corrupt).valid !== recovered.valid) {
      an4++;
    } else if (misses.an4.length < 8) {
      misses.an4.push(`${groundTruth.id}: no flip (class ${groundTruth.class})`);
    }
  }

  const an1Rate = rate(an1, n);
  const surfaceRate = rate(surfaceCorrect, n);
  const edge = an1Rate - surfaceRate;
  const tests = {
    an1_discrimination: makeRateTest(an1, n, UAAL_ANALOGY_THRESHOLDS.an1),
    an2_relation_fidelity: makeRateTest(an2, n, UAAL_ANALOGY_THRESHOLDS.an2),
    an3_bijection_sanity: makeRateTest(an3, n, UAAL_ANALOGY_THRESHOLDS.an3),
    an4_falsification_flip: makeRateTest(an4, n, UAAL_ANALOGY_THRESHOLDS.an4),
    emergent_beats_surface: {
      emergentRate: an1Rate,
      surfaceRate,
      edge,
      floor: UAAL_ANALOGY_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_ANALOGY_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

function presuppositionFormNamed(
  ir: UAALPresuppositionIR,
  name: string
): UAALPresuppositionForm | null {
  return (ir.forms || []).find((form) => form.form === name) || null;
}

function atomsOf(form: UAALPresuppositionForm | null): Set<string> {
  return new Set(form?.atoms || []);
}

function atomInForm(ir: UAALPresuppositionIR, formName: string, atom: string): boolean {
  return atomsOf(presuppositionFormNamed(ir, formName)).has(atom);
}

export function recoverAtomStatus(ir: UAALPresuppositionIR, atom: string): AtomStatusRecovery {
  const forms = ir.forms || [];
  const embedded = forms.filter((form) => form.form !== 'asserted');
  const inAsserted = atomInForm(ir, 'asserted', atom);
  const survivesAll =
    inAsserted && embedded.length > 0 && embedded.every((form) => atomsOf(form).has(atom));
  if (survivesAll) return { status: 'presupposed' };
  return { status: 'at_issue' };
}

/**
 * Atom projection status, honest about MISSING EMBEDDED FORMS. recoverAtomStatus marks an atom
 * `presupposed` iff it is asserted AND survives in every embedded (non-asserted) form; with ZERO
 * embedded forms it silently coerces the atom to `at_issue` — indistinguishable from genuinely
 * at-issue content — even though projection-under-embedding is the ONLY presupposition diagnostic
 * the family has, so an asserted atom with no embedded forms is genuinely undetermined.
 * resolveAtomStatus abstains exactly there (crisp trigger: atom stated in the asserted form AND no
 * embedded forms exist). Everything else stays determinate: per-form absence is closed-world (a
 * stated embedded form that omits the atom means non-survival — the pt4 falsification flip is built
 * on that semantics), and an atom absent from the asserted form resolves at_issue (unasserted
 * content is never presupposed content). No-false-gap: the pt4 invariant (threshold 0.95) forces
 * BOTH determinate classes to state ≥1 embedded form — a presupposed row cannot flip after the
 * negated-form strip without one, and an at_issue row cannot flip to projection without one — so
 * abstaining on the zero-embedded case provably never gaps a determinate corpus row.
 */
export function resolveAtomStatus(
  ir: UAALPresuppositionIR,
  atom: string | undefined
): UAALResolution<AtomStatusRecovery> {
  const atomId = String(atom ?? '');
  const embedded = (ir.forms || []).filter((form) => form.form !== 'asserted');
  if (atomInForm(ir, 'asserted', atomId) && embedded.length === 0) {
    return {
      query: 'atom_status',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap: structuredGap(
        'presupposition',
        'presupposition.no_embedded_forms',
        'underdetermined',
        atomId
      ),
      obstruction: `atom "${atomId}" is asserted but the IR states no embedded (negated/modal/question) forms — projection under embedding is the only presupposition diagnostic, so presupposed vs at_issue is undetermined`,
    };
  }
  return { query: 'atom_status', status: 'resolved', answer: recoverAtomStatus(ir, atomId) };
}

export function surfacePresenceStatus(ir: UAALPresuppositionIR, atom: string): AtomStatusRecovery {
  return { status: atomInForm(ir, 'asserted', atom) ? 'presupposed' : 'at_issue' };
}

export function benchmarkPresupposition(
  rows: Array<UAALSemanticBenchmarkRow<UAALPresuppositionIR, UAALPresuppositionMetadata>>
): UAALPresuppositionBenchmarkResult {
  let atomN = 0;
  let pt1 = 0;
  let pt2 = 0;
  let pt2denom = 0;
  let pt3 = 0;
  let pt3denom = 0;
  let pt4 = 0;
  let pt4denom = 0;
  let surfaceCorrect = 0;
  const misses = { pt1: [] as string[], pt2: [] as string[], pt4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALPresuppositionIR>(row.completion);
    if (!ir) continue;
    const groundTruth = row.metadata || {};
    const truth = groundTruth.atom_status || {};
    const queried = ir.query?.atoms || Object.keys(truth);

    for (const atom of queried) {
      atomN++;
      const recovered = recoverAtomStatus(ir, atom);
      const want = truth[atom];
      if (recovered.status === want) {
        pt1++;
      } else if (misses.pt1.length < 8) {
        misses.pt1.push(`${groundTruth.id}/${atom}: got ${recovered.status} want ${want}`);
      }
      if (surfacePresenceStatus(ir, atom).status === want) surfaceCorrect++;

      if (recovered.status === 'presupposed') {
        pt2denom++;
        if (atomInForm(ir, 'modal', atom) && atomInForm(ir, 'question', atom)) {
          pt2++;
        } else if (misses.pt2.length < 8) {
          misses.pt2.push(`${groundTruth.id}/${atom}: presupposed but missing from modal/question`);
        }
      }

      pt3denom++;
      if (presuppositionFormNamed(ir, 'asserted') && atomInForm(ir, 'asserted', atom)) pt3++;

      if (want === 'presupposed') {
        pt4denom++;
        const corrupt = cloneJson(ir);
        const negated = (corrupt.forms || []).find((form) => form.form === 'negated');
        if (negated)
          negated.atoms = (negated.atoms || []).filter((candidate) => candidate !== atom);
        if (
          recoverAtomStatus(corrupt, atom).status === 'at_issue' &&
          recovered.status === 'presupposed'
        ) {
          pt4++;
        } else if (misses.pt4.length < 8) {
          misses.pt4.push(
            `${groundTruth.id}/${atom}: presupposed did not flip after negated-form strip`
          );
        }
      } else if (want === 'at_issue') {
        pt4denom++;
        const corrupt = cloneJson(ir);
        for (const form of corrupt.forms || []) {
          if (!(form.atoms || []).includes(atom)) form.atoms = [...(form.atoms || []), atom];
        }
        if (
          recoverAtomStatus(corrupt, atom).status === 'presupposed' &&
          recovered.status === 'at_issue'
        ) {
          pt4++;
        } else if (misses.pt4.length < 8) {
          misses.pt4.push(`${groundTruth.id}/${atom}: at_issue did not flip after projection`);
        }
      }
    }
  }

  const pt1Rate = rate(pt1, atomN);
  const surfaceRate = rate(surfaceCorrect, atomN);
  const edge = pt1Rate - surfaceRate;
  const tests = {
    pt1_discrimination: makeRateTest(pt1, atomN, UAAL_PRESUPPOSITION_THRESHOLDS.pt1),
    pt2_projection_fidelity: makeRateTest(pt2, pt2denom, UAAL_PRESUPPOSITION_THRESHOLDS.pt2),
    pt3_structural_sanity: makeRateTest(pt3, pt3denom, UAAL_PRESUPPOSITION_THRESHOLDS.pt3),
    pt4_falsification_flip: makeRateTest(pt4, pt4denom, UAAL_PRESUPPOSITION_THRESHOLDS.pt4),
    emergent_beats_surface: {
      emergentRate: pt1Rate,
      surfaceRate,
      edge,
      floor: UAAL_PRESUPPOSITION_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_PRESUPPOSITION_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n: atomN,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}

export function canonicalForm(component: UAALMotifComponent): string {
  const roleOf = new Map((component.nodes || []).map((node) => [node.id, node.role]));
  return (component.edges || [])
    .map(
      (edge) =>
        `${roleOf.get(edge.from || '') ?? '?'}--${edge.type}-->${roleOf.get(edge.to || '') ?? '?'}`
    )
    .sort()
    .join('|');
}

export function recoverMotif(ir: UAALMotifIR): MotifRecovery {
  const groups = new Map<string, string[]>();
  for (const component of ir.components || []) {
    const key = canonicalForm(component);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(component.id);
  }

  let best: MotifRecovery = { has_motif: false, recurrence_count: 0, form: null, members: [] };
  for (const [form, members] of groups) {
    if (members.length >= 2 && members.length > best.recurrence_count) {
      best = { has_motif: true, recurrence_count: members.length, form, members };
    }
  }
  return best;
}

export function lexicalRecurrence(
  ir: UAALMotifIR
): Pick<MotifRecovery, 'has_motif' | 'recurrence_count'> {
  const labelToComponents = new Map<string, Set<string>>();
  for (const component of ir.components || []) {
    const labels = new Set(
      (component.nodes || []).map((node) => (node.label || '').trim().toLowerCase()).filter(Boolean)
    );
    for (const label of labels) {
      if (!labelToComponents.has(label)) labelToComponents.set(label, new Set());
      labelToComponents.get(label)?.add(component.id);
    }
  }
  let count = 0;
  for (const componentIds of labelToComponents.values()) {
    if (componentIds.size >= 2) count = Math.max(count, componentIds.size);
  }
  return { has_motif: count >= 2, recurrence_count: count };
}

function motifStructural(ir: UAALMotifIR): boolean {
  const components = ir.components || [];
  if (components.length < 2) return false;
  const seenIds = new Set<string>();
  for (const component of components) {
    const nodeIds = new Set((component.nodes || []).map((node) => node.id));
    if (nodeIds.size === 0 || (component.edges || []).length === 0) return false;
    for (const node of component.nodes || []) if (!truthyString(node.role)) return false;
    for (const edge of component.edges || []) {
      if (!truthyString(edge.from) || !truthyString(edge.to) || !truthyString(edge.type))
        return false;
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return false;
    }
    for (const id of nodeIds) {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
    }
  }
  return true;
}

function motifFlip(
  ir: UAALMotifIR,
  metadata: UAALMotifMetadata,
  recovered: MotifRecovery
): boolean {
  const corrupt = cloneJson(ir);
  if (metadata.has_motif) {
    const recurring = new Set(recovered.members);
    let broken = 0;
    const toBreak = recovered.members.length - 1;
    for (const component of corrupt.components || []) {
      if (recurring.has(component.id) && broken < toBreak && component.edges?.[0]) {
        component.edges[0] = {
          ...component.edges[0],
          type: `${component.edges[0].type}__broken_${broken}`,
        };
        broken++;
      }
    }
  } else {
    const components = corrupt.components || [];
    if (components.length >= 2) {
      const source = components[0];
      components[1] = {
        id: components[1].id,
        nodes: (source.nodes || []).map((node) => ({
          id: `${node.id}__iso`,
          role: node.role,
          label: `iso-${node.label || ''}`,
        })),
        edges: (source.edges || []).map((edge) => ({
          from: `${edge.from}__iso`,
          to: `${edge.to}__iso`,
          type: edge.type,
        })),
      };
    }
  }
  return recoverMotif(corrupt).has_motif !== recovered.has_motif;
}

export function benchmarkMotif(
  rows: Array<UAALSemanticBenchmarkRow<UAALMotifIR, UAALMotifMetadata>>
): UAALMotifBenchmarkResult {
  let n = 0;
  let tm1 = 0;
  let tm2 = 0;
  let tm3 = 0;
  let tm4 = 0;
  let lexicalCorrect = 0;
  const misses = { tm1: [] as string[], tm2: [] as string[], tm4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALMotifIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const recovered = recoverMotif(ir);
    if (recovered.has_motif === Boolean(groundTruth.has_motif)) {
      tm1++;
    } else if (misses.tm1.length < 8) {
      misses.tm1.push(
        `${groundTruth.id}: recovered=${recovered.has_motif} truth=${groundTruth.has_motif}`
      );
    }
    if (lexicalRecurrence(ir).has_motif === Boolean(groundTruth.has_motif)) lexicalCorrect++;

    if (recovered.recurrence_count === (groundTruth.recurrence_count ?? 0)) {
      tm2++;
    } else if (misses.tm2.length < 8) {
      misses.tm2.push(
        `${groundTruth.id}: recovered count=${recovered.recurrence_count} declared=${groundTruth.recurrence_count}`
      );
    }

    if (motifStructural(ir)) tm3++;
    if (motifFlip(ir, groundTruth, recovered)) {
      tm4++;
    } else if (misses.tm4.length < 8) {
      misses.tm4.push(
        `${groundTruth.id}: has_motif stayed ${recovered.has_motif} after corruption`
      );
    }
  }

  const tm1Rate = rate(tm1, n);
  const lexicalRate = rate(lexicalCorrect, n);
  const edge = tm1Rate - lexicalRate;
  const tests = {
    tm1_discrimination: makeRateTest(tm1, n, UAAL_MOTIF_THRESHOLDS.tm1),
    tm2_count_fidelity: makeRateTest(tm2, n, UAAL_MOTIF_THRESHOLDS.tm2),
    tm3_structural: makeRateTest(tm3, n, UAAL_MOTIF_THRESHOLDS.tm3),
    tm4_falsification_flip: makeRateTest(tm4, n, UAAL_MOTIF_THRESHOLDS.tm4),
    emergent_beats_lexical: {
      emergentRate: tm1Rate,
      lexicalRate,
      edge,
      floor: UAAL_MOTIF_THRESHOLDS.emergentEdge,
      pass: edge >= UAAL_MOTIF_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}
