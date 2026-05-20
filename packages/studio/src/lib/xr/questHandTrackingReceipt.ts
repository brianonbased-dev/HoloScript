export type QuestHandReceiptStatus = 'OK' | 'WARN';

export interface QuestInputSourceLike {
  handedness?: string;
  targetRayMode?: string;
  profiles?: readonly string[];
  hand?: unknown;
}

export interface QuestXRFrameLike {
  getJointPose?: (jointSpace: unknown, referenceSpace: unknown) => unknown | null;
}

export interface QuestXRSessionLike {
  enabledFeatures?: readonly string[];
  inputSources?: Iterable<QuestInputSourceLike> | ArrayLike<QuestInputSourceLike>;
  addEventListener?: (type: string, callback: () => void) => void;
  removeEventListener?: (type: string, callback: () => void) => void;
  requestAnimationFrame?: (callback: (time: number, frame: QuestXRFrameLike) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  requestReferenceSpace?: (type: string) => Promise<unknown>;
}

export interface QuestHandInputSummary {
  handedness: string;
  targetRayMode: string | null;
  profileCount: number;
  hasHand: boolean;
  jointCount: number;
  posedJointCount: number;
  visible: boolean;
}

export interface QuestHandTrackingReceipt {
  label: 'In-session hand tracking';
  status: QuestHandReceiptStatus;
  source: 'active-xr-session';
  event: string;
  at: number;
  autoEnd: false;
  inputSourceCount: number;
  trackedHandCount: number;
  visibleHandCount: number;
  posedJointCount: number;
  frameCount: number;
  enabledFeatures: readonly string[];
  hands: QuestHandInputSummary[];
  detail: string;
}

export interface BuildQuestHandReceiptOptions {
  event?: string;
  frame?: QuestXRFrameLike | null;
  referenceSpace?: unknown;
  frameCount?: number;
  now?: () => number;
}

export interface QuestHandReceiptObserverOptions {
  onReceipt: (receipt: QuestHandTrackingReceipt) => void;
  now?: () => number;
  frameSampleIntervalMs?: number;
  maxFrames?: number;
}

function toArray<T>(value: Iterable<T> | ArrayLike<T> | undefined): T[] {
  if (!value) return [];
  if (typeof (value as Iterable<T>)[Symbol.iterator] === 'function') {
    return Array.from(value as Iterable<T>);
  }
  return Array.from(value as ArrayLike<T>);
}

function callIterableMethod(value: unknown, methodName: 'keys' | 'values'): unknown[] {
  const method = (value as { [K in typeof methodName]?: unknown } | null)?.[methodName];
  if (typeof method !== 'function') return [];
  try {
    return Array.from(method.call(value) as Iterable<unknown>);
  } catch {
    return [];
  }
}

function handEntries(hand: unknown): unknown[] {
  if (!hand) return [];

  const values = callIterableMethod(hand, 'values');
  if (values.length > 0) return values;

  if (typeof (hand as Iterable<unknown>)[Symbol.iterator] === 'function') {
    try {
      return Array.from(hand as Iterable<unknown>).map((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) return entry[1];
        return entry;
      });
    } catch {
      return [];
    }
  }

  return [];
}

export function countQuestHandJoints(hand: unknown): number {
  if (!hand) return 0;
  const size = (hand as { size?: unknown }).size;
  if (typeof size === 'number' && Number.isFinite(size)) return size;

  const keys = callIterableMethod(hand, 'keys');
  if (keys.length > 0) return keys.length;

  return handEntries(hand).length;
}

function countPosedJoints(frame: QuestXRFrameLike | null | undefined, referenceSpace: unknown, hand: unknown): number {
  if (!frame?.getJointPose || !referenceSpace || !hand) return 0;

  let count = 0;
  for (const jointSpace of handEntries(hand)) {
    try {
      if (frame.getJointPose(jointSpace, referenceSpace)) count += 1;
    } catch {
      // Some runtimes can expose a hand entry before the joint space is poseable.
    }
  }
  return count;
}

function summarizeInputSource(
  source: QuestInputSourceLike,
  frame: QuestXRFrameLike | null | undefined,
  referenceSpace: unknown
): QuestHandInputSummary {
  const hasHand = source.hand != null;
  const jointCount = countQuestHandJoints(source.hand);
  const posedJointCount = countPosedJoints(frame, referenceSpace, source.hand);
  const poseAware = Boolean(frame?.getJointPose && referenceSpace);

  return {
    handedness: source.handedness || 'unknown',
    targetRayMode: source.targetRayMode ?? null,
    profileCount: source.profiles?.length ?? 0,
    hasHand,
    jointCount,
    posedJointCount,
    visible: hasHand && (poseAware ? posedJointCount > 0 : true),
  };
}

function formatHandList(hands: QuestHandInputSummary[]): string {
  const tracked = hands.filter((hand) => hand.hasHand);
  if (tracked.length === 0) return 'no hand input sources';
  return tracked
    .map((hand) => {
      const posed = hand.posedJointCount > 0 ? `, ${hand.posedJointCount} posed` : '';
      return `${hand.handedness}:${hand.jointCount} joints${posed}`;
    })
    .join('; ');
}

export function buildQuestHandTrackingReceipt(
  session: QuestXRSessionLike,
  options: BuildQuestHandReceiptOptions = {}
): QuestHandTrackingReceipt {
  const inputSources = toArray(session.inputSources);
  const hands = inputSources.map((source) =>
    summarizeInputSource(source, options.frame, options.referenceSpace)
  );
  const trackedHandCount = hands.filter((hand) => hand.hasHand).length;
  const visibleHandCount = hands.filter((hand) => hand.visible).length;
  const posedJointCount = hands.reduce((sum, hand) => sum + hand.posedJointCount, 0);
  const status: QuestHandReceiptStatus = visibleHandCount > 0 ? 'OK' : 'WARN';
  const frameCount = options.frameCount ?? 0;
  const detail = [
    `${visibleHandCount}/${trackedHandCount} visible hands`,
    `inputSources=${inputSources.length}`,
    `posedJoints=${posedJointCount}`,
    `frame=${frameCount}`,
    'autoEnd=false',
    formatHandList(hands),
  ].join('; ');

  return {
    label: 'In-session hand tracking',
    status,
    source: 'active-xr-session',
    event: options.event ?? 'sample',
    at: options.now?.() ?? Date.now(),
    autoEnd: false,
    inputSourceCount: inputSources.length,
    trackedHandCount,
    visibleHandCount,
    posedJointCount,
    frameCount,
    enabledFeatures: session.enabledFeatures ?? [],
    hands,
    detail,
  };
}

export function questHandReceiptKey(receipt: QuestHandTrackingReceipt): string {
  return [
    receipt.visibleHandCount,
    receipt.trackedHandCount,
    receipt.inputSourceCount,
    receipt.posedJointCount,
    receipt.event === 'end' ? 'end' : 'active',
  ].join(':');
}

export function startQuestHandTrackingReceiptObserver(
  session: QuestXRSessionLike,
  options: QuestHandReceiptObserverOptions
): () => void {
  let disposed = false;
  let referenceSpace: unknown;
  let frameCount = 0;
  let lastFrameEmit = -Infinity;
  let rafHandle: number | undefined;

  const sampleInterval = options.frameSampleIntervalMs ?? 750;

  const emit = (event: string, frame?: QuestXRFrameLike | null, time?: number) => {
    if (disposed) return;
    if (event === 'frame' && time != null && time - lastFrameEmit < sampleInterval) return;
    if (event === 'frame' && time != null) lastFrameEmit = time;
    options.onReceipt(
      buildQuestHandTrackingReceipt(session, {
        event,
        frame,
        referenceSpace,
        frameCount,
        now: options.now,
      })
    );
  };

  const scheduleFrame = () => {
    if (disposed || !session.requestAnimationFrame) return;
    if (options.maxFrames != null && frameCount >= options.maxFrames) return;
    rafHandle = session.requestAnimationFrame((time, frame) => {
      if (disposed) return;
      frameCount += 1;
      emit('frame', frame, time);
      scheduleFrame();
    });
  };

  const cleanup = () => {
    disposed = true;
    if (rafHandle != null) session.cancelAnimationFrame?.(rafHandle);
    session.removeEventListener?.('inputsourceschange', onInputSourcesChange);
    session.removeEventListener?.('end', onEnd);
  };

  const onInputSourcesChange = () => emit('inputsourceschange');
  const onEnd = () => {
    emit('end');
    cleanup();
  };

  session.addEventListener?.('inputsourceschange', onInputSourcesChange);
  session.addEventListener?.('end', onEnd);

  if (session.requestReferenceSpace) {
    void session
      .requestReferenceSpace('local-floor')
      .catch(() => session.requestReferenceSpace?.('viewer'))
      .then((space) => {
        referenceSpace = space;
        emit('reference-space');
      })
      .catch(() => emit('reference-space-unavailable'));
  }

  emit('session-start');
  scheduleFrame();

  return cleanup;
}
