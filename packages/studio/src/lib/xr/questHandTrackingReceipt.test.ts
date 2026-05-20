import { describe, expect, it } from 'vitest';

import {
  buildQuestHandTrackingReceipt,
  countQuestHandJoints,
  questHandReceiptKey,
  startQuestHandTrackingReceiptObserver,
  type QuestInputSourceLike,
  type QuestXRFrameLike,
  type QuestXRSessionLike,
} from './questHandTrackingReceipt';

describe('questHandTrackingReceipt', () => {
  it('counts XRHand-style joint maps', () => {
    const hand = new Map([
      ['wrist', { name: 'left-wrist' }],
      ['index-finger-tip', { name: 'left-index' }],
    ]);

    expect(countQuestHandJoints(hand)).toBe(2);
  });

  it('builds an in-session receipt from hand input sources', () => {
    const leftWrist = { name: 'left-wrist' };
    const rightWrist = { name: 'right-wrist' };
    const session: QuestXRSessionLike = {
      enabledFeatures: ['hand-tracking', 'local-floor'],
      inputSources: [
        {
          handedness: 'left',
          targetRayMode: 'tracked-pointer',
          profiles: ['generic-hand'],
          hand: new Map([['wrist', leftWrist]]),
        },
        {
          handedness: 'right',
          targetRayMode: 'tracked-pointer',
          profiles: ['generic-hand'],
          hand: new Map([['wrist', rightWrist]]),
        },
        {
          handedness: 'none',
          targetRayMode: 'gaze',
          profiles: ['generic-trigger'],
        },
      ],
    };
    const frame: QuestXRFrameLike = {
      getJointPose: (joint) => (joint === leftWrist ? { transform: {} } : null),
    };

    const receipt = buildQuestHandTrackingReceipt(session, {
      event: 'frame',
      frame,
      referenceSpace: { type: 'local-floor' },
      frameCount: 12,
      now: () => 42,
    });

    expect(receipt.label).toBe('In-session hand tracking');
    expect(receipt.source).toBe('active-xr-session');
    expect(receipt.autoEnd).toBe(false);
    expect(receipt.inputSourceCount).toBe(3);
    expect(receipt.trackedHandCount).toBe(2);
    expect(receipt.visibleHandCount).toBe(1);
    expect(receipt.posedJointCount).toBe(1);
    expect(receipt.status).toBe('OK');
    expect(receipt.detail).toContain('autoEnd=false');
    expect(receipt.detail).toContain('left:1 joints, 1 posed');
  });

  it('observes input source changes and session end without ending the session', () => {
    const events = new Map<string, Array<() => void>>();
    const frames: Array<(time: number, frame: QuestXRFrameLike) => void> = [];
    const inputSources: QuestInputSourceLike[] = [];
    let endCalled = false;
    const receipts: string[] = [];

    const session: QuestXRSessionLike & { end: () => Promise<void> } = {
      inputSources,
      addEventListener: (type, callback) => {
        events.set(type, [...(events.get(type) ?? []), callback]);
      },
      removeEventListener: (type, callback) => {
        events.set(
          type,
          (events.get(type) ?? []).filter((item) => item !== callback)
        );
      },
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: () => {},
      end: async () => {
        endCalled = true;
      },
    };

    const stop = startQuestHandTrackingReceiptObserver(session, {
      frameSampleIntervalMs: 0,
      maxFrames: 1,
      now: () => 100,
      onReceipt: (receipt) => receipts.push(`${receipt.event}:${questHandReceiptKey(receipt)}`),
    });

    inputSources.push({
      handedness: 'left',
      targetRayMode: 'tracked-pointer',
      hand: new Map([['wrist', { name: 'left-wrist' }]]),
    });
    events.get('inputsourceschange')?.forEach((callback) => callback());
    frames[0]?.(1, {});
    events.get('end')?.forEach((callback) => callback());
    stop();

    expect(endCalled).toBe(false);
    expect(receipts).toEqual([
      'session-start:0:0:0:0:active',
      'inputsourceschange:1:1:1:0:active',
      'frame:1:1:1:0:active',
      'end:1:1:1:0:end',
    ]);
  });
});
