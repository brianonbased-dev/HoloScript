/**
 * Frozen equal-bandwidth protocol tournament for Paper 32 / uAAL.
 *
 * This is an experimental evaluation surface, not a public compiler API.
 * Every communicating arm receives exactly 64 bytes. Families A and B are
 * available during training; family C is evaluated without a pair adapter.
 *
 * The typed uAAL arm is deliberately modest: a versioned semantic frame with
 * SHA-256 payload binding, sender/recipient binding, and nonce replay defense.
 * It does not claim that Pillar coordinates are hidden cognitive coordinates.
 */

import type { PillarSlice } from './SemanticCollaborationContract';

export const TOURNAMENT_FRAME_BYTES = 64;
export const TOURNAMENT_BANDWIDTH_BITS = TOURNAMENT_FRAME_BYTES * 8;
export const TOURNAMENT_TRAIN_EPISODES_PER_FAMILY = 256;
export const TOURNAMENT_TEST_EPISODES = 512;
export const TOURNAMENT_OPTIMIZER_STEPS = 256;

export const TOURNAMENT_ARMS = [
  'no_comm',
  'text',
  'same_fields_json',
  'raw_hidden_kv',
  'identity_projection',
  'random_orthogonal',
  'pca_low_rank',
  'learned_alignment',
  'pillar_slice',
  'typed_uaal',
  'typed_uaal_residual',
] as const;

export type TournamentArm = (typeof TOURNAMENT_ARMS)[number];
export type ModelFamily = 'A' | 'B' | 'C';
export type WorldAction = 'hold' | 'advance' | 'reroute' | 'inspect';

interface WorldSample {
  family: ModelFamily;
  risk: number;
  opportunity: number;
  hidden: number[];
  action: WorldAction;
}

interface SemanticField {
  id: 'risk' | 'opportunity';
  value: number;
}

interface DecodedState {
  risk: number;
  opportunity: number;
}

interface AlignmentModel {
  weights: number[][];
  optimizerSteps: number;
}

export interface ProtocolArmResult {
  arm: TournamentArm;
  bandwidthBits: number;
  actionSuccess: number;
  recoverableTextRate: number;
  p50EncodeDecodeMicros: number;
  peakFrameBytes: number;
}

export interface TypedCustodyResult {
  tamperDetection: boolean;
  replayRejection: boolean;
  recipientBinding: boolean;
  schemaVersionRejection: boolean;
  actionPayloadConsistencyRejection: boolean;
  passed: number;
  total: 5;
}

export interface ProtocolInterventionResult {
  baselineSuccess: number;
  riskAblatedSuccess: number;
  opportunityAblatedSuccess: number;
  riskAblationDrop: number;
  opportunityAblationDrop: number;
  jointAxisValuePermutationSuccess: number;
  jointAxisValuePermutationDelta: number;
  positionPermutationWithIdsUnchangedSuccess: number;
  positionPermutationDrop: number;
}

export interface ProtocolTournamentVerdict {
  strongestTextOrJsonArm: 'text' | 'same_fields_json';
  strongestTextOrJsonSuccess: number;
  typedSuccess: number;
  learnedAlignmentSuccess: number;
  typedCognitivePromotionPassed: boolean;
  typedOutperformsLearnedAlignment: boolean;
  schemaReplayAbiAdmitted: boolean;
  cognitiveCoordinateClaimRetired: boolean;
  hiddenAlignmentClaimRetired: boolean;
}

export interface ProtocolTournamentReceipt {
  protocol: 'uaal-equal-bandwidth-tournament-v1';
  frozen: {
    trainFamilies: ['A', 'B'];
    testFamily: 'C';
    trainEpisodesPerFamily: number;
    testEpisodes: number;
    optimizerSteps: number;
    pairAdapterForC: false;
    communicatingFrameBytes: number;
    communicatingBandwidthBits: number;
  };
  arms: ProtocolArmResult[];
  custody: TypedCustodyResult;
  interventions: ProtocolInterventionResult;
  verdict: ProtocolTournamentVerdict;
  replay: {
    firstDigest: string;
    secondDigest: string;
    agreement: boolean;
  };
  deterministicDigest: string;
}

interface TypedEnvelope {
  sender: string;
  recipient: string;
  nonce: number;
  residual?: number;
}

type TypedDecode =
  | { ok: true; state: DecodedState }
  | {
      ok: false;
      reason:
        | 'frame_length'
        | 'version'
        | 'digest'
        | 'sender'
        | 'recipient'
        | 'replay'
        | 'action_payload';
    };

function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function nextAwayFromBoundary(rng: () => number): number {
  for (;;) {
    const value = rng() * 2 - 1;
    if (Math.abs(value) >= 0.08) return value;
  }
}

function chooseAction(risk: number, opportunity: number): WorldAction {
  if (risk < 0 && opportunity < 0) return 'hold';
  if (risk < 0 && opportunity >= 0) return 'advance';
  if (risk >= 0 && opportunity < 0) return 'reroute';
  return 'inspect';
}

const ACTION_CODES: Record<WorldAction, number> = {
  hold: 0,
  advance: 1,
  reroute: 2,
  inspect: 3,
};

function hiddenFor(family: ModelFamily, risk: number, opportunity: number): number[] {
  const product = risk * opportunity;
  const energy = risk * risk - opportunity * opportunity;

  if (family === 'A') {
    return [risk, opportunity, product, risk + opportunity, risk * 2, opportunity * 2, 1, energy];
  }
  if (family === 'B') {
    return [
      opportunity,
      -risk,
      product,
      opportunity + risk,
      opportunity * 2,
      -risk * 2,
      1,
      -energy,
    ];
  }
  return [
    -risk,
    -opportunity,
    product,
    opportunity - risk,
    risk + opportunity,
    risk * 2,
    1,
    energy,
  ];
}

function makeSamples(family: ModelFamily, count: number, seed: number): WorldSample[] {
  const rng = makeLcg(seed);
  const samples: WorldSample[] = [];

  while (samples.length < count) {
    const risk = nextAwayFromBoundary(rng);
    const opportunity = nextAwayFromBoundary(rng);
    samples.push({
      family,
      risk,
      opportunity,
      hidden: hiddenFor(family, risk, opportunity),
      action: chooseAction(risk, opportunity),
    });
  }
  return samples;
}

function trainAlignment(a: WorldSample[], b: WorldSample[]): AlignmentModel {
  const weights = Array.from({ length: 2 }, () => new Array<number>(9).fill(0));
  const learningRate = 0.035;

  for (let step = 0; step < TOURNAMENT_OPTIMIZER_STEPS; step++) {
    const pair = [a[step % a.length], b[step % b.length]];
    const gradients = Array.from({ length: 2 }, () => new Array<number>(9).fill(0));

    for (const sample of pair) {
      const features = [...sample.hidden, 1];
      const targets = [sample.risk, sample.opportunity];
      for (let output = 0; output < 2; output++) {
        const prediction = dot(weights[output], features);
        const error = prediction - targets[output];
        for (let feature = 0; feature < features.length; feature++) {
          gradients[output][feature] += error * features[feature];
        }
      }
    }

    for (let output = 0; output < 2; output++) {
      for (let feature = 0; feature < weights[output].length; feature++) {
        weights[output][feature] -= (learningRate * gradients[output][feature]) / pair.length;
      }
    }
  }

  return { weights, optimizerSteps: TOURNAMENT_OPTIMIZER_STEPS };
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

function alignmentPrediction(model: AlignmentModel, hidden: number[]): DecodedState {
  const features = [...hidden, 1];
  return {
    risk: dot(model.weights[0], features),
    opportunity: dot(model.weights[1], features),
  };
}

function fixedTextFrame(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength > TOURNAMENT_FRAME_BYTES) {
    throw new Error(`Tournament frame overflow: ${encoded.byteLength} > ${TOURNAMENT_FRAME_BYTES}`);
  }
  const frame = new Uint8Array(TOURNAMENT_FRAME_BYTES);
  frame.set(encoded);
  return frame;
}

function decodeTextFrame(frame: Uint8Array): string {
  const end = frame.indexOf(0);
  return new TextDecoder().decode(end < 0 ? frame : frame.subarray(0, end));
}

function floatFrame(values: number[]): Uint8Array {
  const frame = new Uint8Array(TOURNAMENT_FRAME_BYTES);
  const view = new DataView(frame.buffer);
  values.slice(0, TOURNAMENT_FRAME_BYTES / 4).forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  return frame;
}

function readFloats(frame: Uint8Array, count: number): number[] {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  return Array.from({ length: count }, (_, index) => view.getFloat32(index * 4, true));
}

function rotateHidden(hidden: number[]): number[] {
  return hidden.map((_, index) => {
    const source = hidden[(index + 3) % hidden.length];
    return index % 2 === 0 ? source : -source;
  });
}

function unrotateHidden(rotated: number[]): number[] {
  const hidden = new Array<number>(rotated.length).fill(0);
  for (let index = 0; index < rotated.length; index++) {
    hidden[(index + 3) % rotated.length] = index % 2 === 0 ? rotated[index] : -rotated[index];
  }
  return hidden;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const input = bytes.slice().buffer as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function semanticFields(sample: WorldSample): SemanticField[] {
  return [
    { id: 'risk', value: sample.risk },
    { id: 'opportunity', value: sample.opportunity },
  ];
}

function valueFor(fields: SemanticField[], id: SemanticField['id']): number {
  return fields.find((field) => field.id === id)?.value ?? 0;
}

function tournamentPillarSlice(fields: SemanticField[]): PillarSlice {
  return {
    axis_1_id: fields[0]?.id ?? '',
    axis_2_id: fields[1]?.id ?? '',
    pos_1: fields[0]?.value ?? 0,
    pos_2: fields[1]?.value ?? 0,
    pillar_id: 'uaal-protocol-tournament',
    pillar_domain: 'coordination',
  };
}

function pillarFrame(fields: SemanticField[]): Uint8Array {
  const slice = tournamentPillarSlice(fields);
  const frame = new Uint8Array(TOURNAMENT_FRAME_BYTES);
  const view = new DataView(frame.buffer);
  view.setUint32(0, hash32(slice.axis_1_id), true);
  view.setFloat32(4, slice.pos_1, true);
  view.setUint32(8, hash32(slice.axis_2_id), true);
  view.setFloat32(12, slice.pos_2, true);
  return frame;
}

function decodePillarFrame(frame: Uint8Array): DecodedState {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const values = new Map<number, number>([
    [view.getUint32(0, true), view.getFloat32(4, true)],
    [view.getUint32(8, true), view.getFloat32(12, true)],
  ]);
  return {
    risk: values.get(hash32('risk')) ?? 0,
    opportunity: values.get(hash32('opportunity')) ?? 0,
  };
}

async function typedFrame(fields: SemanticField[], envelope: TypedEnvelope): Promise<Uint8Array> {
  const frame = new Uint8Array(TOURNAMENT_FRAME_BYTES);
  const header = frame.subarray(0, 32);
  const view = new DataView(frame.buffer);
  const risk = fields.find((field) => field.id === 'risk');
  const opportunity = fields.find((field) => field.id === 'opportunity');

  view.setUint8(0, 1);
  view.setUint8(1, envelope.residual === undefined ? 0 : 1);
  view.setInt8(2, Math.max(-127, Math.min(127, Math.round((envelope.residual ?? 0) * 127))));
  view.setUint8(3, ACTION_CODES[chooseAction(risk?.value ?? 0, opportunity?.value ?? 0)]);
  view.setUint32(4, envelope.nonce, true);
  view.setFloat32(8, risk?.value ?? 0, true);
  view.setFloat32(12, opportunity?.value ?? 0, true);
  view.setUint32(16, hash32(envelope.sender), true);
  view.setUint32(20, hash32(envelope.recipient), true);
  view.setUint32(24, risk ? hash32(risk.id) : 0, true);
  view.setUint32(28, opportunity ? hash32(opportunity.id) : 0, true);
  frame.set(await sha256(header), 32);
  return frame;
}

async function decodeTypedFrame(
  frame: Uint8Array,
  expectedSender: string,
  expectedRecipient: string,
  seenNonces: Set<number>
): Promise<TypedDecode> {
  if (frame.byteLength !== TOURNAMENT_FRAME_BYTES) return { ok: false, reason: 'frame_length' };
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (view.getUint8(0) !== 1) return { ok: false, reason: 'version' };

  const expectedDigest = await sha256(frame.subarray(0, 32));
  const actualDigest = frame.subarray(32);
  if (toHex(expectedDigest) !== toHex(actualDigest)) return { ok: false, reason: 'digest' };
  if (view.getUint32(16, true) !== hash32(expectedSender)) return { ok: false, reason: 'sender' };
  if (view.getUint32(20, true) !== hash32(expectedRecipient)) {
    return { ok: false, reason: 'recipient' };
  }

  const nonce = view.getUint32(4, true);
  if (seenNonces.has(nonce)) return { ok: false, reason: 'replay' };

  const state = {
    risk: view.getUint32(24, true) === hash32('risk') ? view.getFloat32(8, true) : 0,
    opportunity: view.getUint32(28, true) === hash32('opportunity') ? view.getFloat32(12, true) : 0,
  };
  if (view.getUint8(3) !== ACTION_CODES[chooseAction(state.risk, state.opportunity)]) {
    return { ok: false, reason: 'action_payload' };
  }
  seenNonces.add(nonce);

  return { ok: true, state };
}

async function encodeArm(
  arm: TournamentArm,
  sample: WorldSample,
  fields: SemanticField[],
  alignment: AlignmentModel,
  nonce: number
): Promise<Uint8Array | undefined> {
  switch (arm) {
    case 'no_comm':
      return undefined;
    case 'text':
      return fixedTextFrame(
        `risk=${sample.risk.toFixed(6)};opportunity=${sample.opportunity.toFixed(6)}`
      );
    case 'same_fields_json':
      return fixedTextFrame(
        `{"risk":${sample.risk.toFixed(6)},"opportunity":${sample.opportunity.toFixed(6)}}`
      );
    case 'raw_hidden_kv':
    case 'identity_projection':
      return floatFrame(sample.hidden);
    case 'random_orthogonal':
      return floatFrame(rotateHidden(sample.hidden));
    case 'pca_low_rank':
      return floatFrame(sample.hidden.slice(0, 2));
    case 'learned_alignment': {
      const prediction = alignmentPrediction(alignment, sample.hidden);
      return floatFrame([prediction.risk, prediction.opportunity]);
    }
    case 'pillar_slice':
      return pillarFrame(fields);
    case 'typed_uaal':
      return typedFrame(fields, { sender: 'family-C', recipient: 'receiver', nonce });
    case 'typed_uaal_residual':
      return typedFrame(fields, {
        sender: 'family-C',
        recipient: 'receiver',
        nonce,
        residual: sample.hidden[2],
      });
  }
}

async function decodeArm(
  arm: TournamentArm,
  frame: Uint8Array | undefined,
  seenNonces: Set<number>
): Promise<DecodedState | undefined> {
  if (arm === 'no_comm' || frame === undefined) return undefined;

  switch (arm) {
    case 'text': {
      const match = /^risk=(-?\d+\.\d+);opportunity=(-?\d+\.\d+)$/u.exec(decodeTextFrame(frame));
      return match ? { risk: Number(match[1]), opportunity: Number(match[2]) } : undefined;
    }
    case 'same_fields_json': {
      const parsed = JSON.parse(decodeTextFrame(frame)) as DecodedState;
      return { risk: parsed.risk, opportunity: parsed.opportunity };
    }
    case 'raw_hidden_kv':
    case 'identity_projection':
    case 'pca_low_rank': {
      const values = readFloats(frame, 2);
      return { risk: values[0], opportunity: values[1] };
    }
    case 'random_orthogonal': {
      const values = unrotateHidden(readFloats(frame, 8));
      return { risk: values[0], opportunity: values[1] };
    }
    case 'learned_alignment': {
      const values = readFloats(frame, 2);
      return { risk: values[0], opportunity: values[1] };
    }
    case 'pillar_slice':
      return decodePillarFrame(frame);
    case 'typed_uaal':
    case 'typed_uaal_residual': {
      const decoded = await decodeTypedFrame(frame, 'family-C', 'receiver', seenNonces);
      return decoded.ok ? decoded.state : undefined;
    }
  }
}

async function runArm(
  arm: TournamentArm,
  samples: WorldSample[],
  alignment: AlignmentModel
): Promise<ProtocolArmResult> {
  let correct = 0;
  let recoverable = 0;
  let peakFrameBytes = 0;
  const seenNonces = new Set<number>();
  const sampleMicros: number[] = [];

  for (let index = 0; index < samples.length; index++) {
    const start = performance.now();
    const sample = samples[index];
    const frame = await encodeArm(arm, sample, semanticFields(sample), alignment, index + 1);
    peakFrameBytes = Math.max(peakFrameBytes, frame?.byteLength ?? 0);
    const decoded = await decodeArm(arm, frame, seenNonces);
    sampleMicros.push((performance.now() - start) * 1000);
    const predicted = decoded ? chooseAction(decoded.risk, decoded.opportunity) : 'hold';
    if (predicted === sample.action) correct++;
    if (
      decoded &&
      Math.abs(decoded.risk - sample.risk) <= 0.000051 &&
      Math.abs(decoded.opportunity - sample.opportunity) <= 0.000051
    ) {
      recoverable++;
    }
  }

  sampleMicros.sort((a, b) => a - b);
  return {
    arm,
    bandwidthBits: arm === 'no_comm' ? 0 : TOURNAMENT_BANDWIDTH_BITS,
    actionSuccess: correct / samples.length,
    recoverableTextRate: recoverable / samples.length,
    p50EncodeDecodeMicros: sampleMicros[Math.floor(sampleMicros.length / 2)],
    peakFrameBytes,
  };
}

async function typedSuccess(
  samples: WorldSample[],
  transform: (sample: WorldSample) => SemanticField[]
): Promise<number> {
  let correct = 0;
  const seenNonces = new Set<number>();

  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const frame = await typedFrame(transform(sample), {
      sender: 'family-C',
      recipient: 'receiver',
      nonce: index + 1,
    });
    const decoded = await decodeTypedFrame(frame, 'family-C', 'receiver', seenNonces);
    if (
      decoded.ok &&
      chooseAction(decoded.state.risk, decoded.state.opportunity) === sample.action
    ) {
      correct++;
    }
  }
  return correct / samples.length;
}

async function runInterventions(samples: WorldSample[]): Promise<ProtocolInterventionResult> {
  const baselineSuccess = await typedSuccess(samples, semanticFields);
  const riskAblatedSuccess = await typedSuccess(samples, (sample) => [
    { id: 'opportunity', value: sample.opportunity },
  ]);
  const opportunityAblatedSuccess = await typedSuccess(samples, (sample) => [
    { id: 'risk', value: sample.risk },
  ]);
  const jointAxisValuePermutationSuccess = await typedSuccess(samples, (sample) =>
    semanticFields(sample).reverse()
  );
  const positionPermutationWithIdsUnchangedSuccess = await typedSuccess(samples, (sample) => [
    { id: 'risk', value: sample.opportunity },
    { id: 'opportunity', value: sample.risk },
  ]);

  return {
    baselineSuccess,
    riskAblatedSuccess,
    opportunityAblatedSuccess,
    riskAblationDrop: baselineSuccess - riskAblatedSuccess,
    opportunityAblationDrop: baselineSuccess - opportunityAblatedSuccess,
    jointAxisValuePermutationSuccess,
    jointAxisValuePermutationDelta: Math.abs(baselineSuccess - jointAxisValuePermutationSuccess),
    positionPermutationWithIdsUnchangedSuccess,
    positionPermutationDrop: baselineSuccess - positionPermutationWithIdsUnchangedSuccess,
  };
}

async function runCustodyProbes(): Promise<TypedCustodyResult> {
  const fields: SemanticField[] = [
    { id: 'risk', value: 0.75 },
    { id: 'opportunity', value: -0.5 },
  ];
  const frame = await typedFrame(fields, {
    sender: 'family-C',
    recipient: 'receiver',
    nonce: 77,
  });

  const valid = await decodeTypedFrame(frame, 'family-C', 'receiver', new Set());
  const tampered = frame.slice();
  tampered[8] ^= 0x01;
  const tamper = await decodeTypedFrame(tampered, 'family-C', 'receiver', new Set());

  const replaySet = new Set<number>();
  const replayFirst = await decodeTypedFrame(frame, 'family-C', 'receiver', replaySet);
  const replaySecond = await decodeTypedFrame(frame, 'family-C', 'receiver', replaySet);
  const wrongRecipient = await decodeTypedFrame(frame, 'family-C', 'other-receiver', new Set());
  const wrongVersion = frame.slice();
  wrongVersion[0] = 2;
  wrongVersion.set(await sha256(wrongVersion.subarray(0, 32)), 32);
  const schema = await decodeTypedFrame(wrongVersion, 'family-C', 'receiver', new Set());
  const inconsistentAction = frame.slice();
  inconsistentAction[3] = (inconsistentAction[3] + 1) % 4;
  inconsistentAction.set(await sha256(inconsistentAction.subarray(0, 32)), 32);
  const actionPayload = await decodeTypedFrame(
    inconsistentAction,
    'family-C',
    'receiver',
    new Set()
  );

  const probes = {
    tamperDetection: !tamper.ok && tamper.reason === 'digest',
    replayRejection: replayFirst.ok && !replaySecond.ok && replaySecond.reason === 'replay',
    recipientBinding: valid.ok && !wrongRecipient.ok && wrongRecipient.reason === 'recipient',
    schemaVersionRejection: !schema.ok && schema.reason === 'version',
    actionPayloadConsistencyRejection:
      !actionPayload.ok && actionPayload.reason === 'action_payload',
  };
  return {
    ...probes,
    passed: Object.values(probes).filter(Boolean).length,
    total: 5,
  };
}

function stableReceiptPayload(
  arms: ProtocolArmResult[],
  custody: TypedCustodyResult,
  interventions: ProtocolInterventionResult,
  verdict: ProtocolTournamentVerdict
): string {
  return JSON.stringify({
    protocol: 'uaal-equal-bandwidth-tournament-v1',
    arms: arms.map(({ p50EncodeDecodeMicros: _timing, ...arm }) => arm),
    custody,
    interventions,
    verdict,
  });
}

async function evaluateTournament(testC: WorldSample[], alignment: AlignmentModel) {
  const arms: ProtocolArmResult[] = [];
  for (const arm of TOURNAMENT_ARMS) {
    arms.push(await runArm(arm, testC, alignment));
  }

  const custody = await runCustodyProbes();
  const interventions = await runInterventions(testC);
  const byArm = new Map(arms.map((arm) => [arm.arm, arm]));
  const text = byArm.get('text')!;
  const json = byArm.get('same_fields_json')!;
  const typed = byArm.get('typed_uaal')!;
  const learned = byArm.get('learned_alignment')!;
  const pillar = byArm.get('pillar_slice')!;
  const identity = byArm.get('identity_projection')!;
  const random = byArm.get('random_orthogonal')!;
  const strongestTextOrJsonArm =
    text.actionSuccess >= json.actionSuccess ? ('text' as const) : ('same_fields_json' as const);
  const strongestTextOrJsonSuccess = Math.max(text.actionSuccess, json.actionSuccess);

  const verdict: ProtocolTournamentVerdict = {
    strongestTextOrJsonArm,
    strongestTextOrJsonSuccess,
    typedSuccess: typed.actionSuccess,
    learnedAlignmentSuccess: learned.actionSuccess,
    typedCognitivePromotionPassed:
      typed.actionSuccess - strongestTextOrJsonSuccess >= 0.05 &&
      typed.actionSuccess - learned.actionSuccess >= 0.1 &&
      interventions.riskAblationDrop >= 0.2 &&
      interventions.opportunityAblationDrop >= 0.2 &&
      interventions.jointAxisValuePermutationDelta <= 0.02 &&
      interventions.positionPermutationDrop >= 0.2 &&
      custody.passed === custody.total,
    typedOutperformsLearnedAlignment: typed.actionSuccess - learned.actionSuccess >= 0.1,
    schemaReplayAbiAdmitted:
      Math.abs(typed.actionSuccess - strongestTextOrJsonSuccess) <= 0.02 &&
      custody.passed === custody.total,
    cognitiveCoordinateClaimRetired:
      Math.abs(pillar.actionSuccess - strongestTextOrJsonSuccess) <= 0.02 &&
      Math.abs(typed.actionSuccess - strongestTextOrJsonSuccess) <= 0.02,
    hiddenAlignmentClaimRetired: Math.abs(identity.actionSuccess - random.actionSuccess) <= 0.02,
  };

  return { arms, custody, interventions, verdict };
}

async function receiptDigest(
  arms: ProtocolArmResult[],
  custody: TypedCustodyResult,
  interventions: ProtocolInterventionResult,
  verdict: ProtocolTournamentVerdict
): Promise<string> {
  const digest = await sha256(
    new TextEncoder().encode(stableReceiptPayload(arms, custody, interventions, verdict))
  );
  return `sha256:${toHex(digest)}`;
}

/**
 * Runs the frozen tournament twice. Timings are observational; both replay
 * digests exclude them and bind every decision-bearing result.
 */
export async function runUAALProtocolTournament(): Promise<ProtocolTournamentReceipt> {
  const trainA = makeSamples('A', TOURNAMENT_TRAIN_EPISODES_PER_FAMILY, 0xa11ce);
  const trainB = makeSamples('B', TOURNAMENT_TRAIN_EPISODES_PER_FAMILY, 0xb11ce);
  const testC = makeSamples('C', TOURNAMENT_TEST_EPISODES, 0xc11ce);
  const alignment = trainAlignment(trainA, trainB);
  const first = await evaluateTournament(testC, alignment);
  const second = await evaluateTournament(testC, alignment);
  const firstDigest = await receiptDigest(
    first.arms,
    first.custody,
    first.interventions,
    first.verdict
  );
  const secondDigest = await receiptDigest(
    second.arms,
    second.custody,
    second.interventions,
    second.verdict
  );

  return {
    protocol: 'uaal-equal-bandwidth-tournament-v1',
    frozen: {
      trainFamilies: ['A', 'B'],
      testFamily: 'C',
      trainEpisodesPerFamily: TOURNAMENT_TRAIN_EPISODES_PER_FAMILY,
      testEpisodes: TOURNAMENT_TEST_EPISODES,
      optimizerSteps: alignment.optimizerSteps,
      pairAdapterForC: false,
      communicatingFrameBytes: TOURNAMENT_FRAME_BYTES,
      communicatingBandwidthBits: TOURNAMENT_BANDWIDTH_BITS,
    },
    arms: first.arms,
    custody: first.custody,
    interventions: first.interventions,
    verdict: first.verdict,
    replay: {
      firstDigest,
      secondDigest,
      agreement: firstDigest === secondDigest,
    },
    deterministicDigest: firstDigest,
  };
}
