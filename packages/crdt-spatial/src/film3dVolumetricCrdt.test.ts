import { describe, expect, it } from 'vitest';
import {
  MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES,
  isWithinVolumetricWebRtcSyncBudget,
} from './film3dVolumetricCrdt.js';

describe('isWithinVolumetricWebRtcSyncBudget', () => {
  it('accepts empty and small payloads', () => {
    expect(isWithinVolumetricWebRtcSyncBudget(0)).toBe(true);
    expect(isWithinVolumetricWebRtcSyncBudget(1024)).toBe(true);
  });

  it('accepts byteLength exactly at cap', () => {
    expect(isWithinVolumetricWebRtcSyncBudget(MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES)).toBe(true);
  });

  it('rejects byteLength one over cap', () => {
    expect(isWithinVolumetricWebRtcSyncBudget(MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES + 1)).toBe(false);
  });
});
