import { describe, expect, it } from 'vitest';
import {
  classifyCreatorAsset,
  detectCreatorAssetFormat,
  formatCreatorAssetSize,
} from '../creatorAssets';

describe('creator asset helpers', () => {
  it('detects supported creator asset formats case-insensitively', () => {
    expect(detectCreatorAssetFormat('room.GLB')).toBe('glb');
    expect(detectCreatorAssetFormat('cut.MP4')).toBe('mp4');
    expect(detectCreatorAssetFormat('plate.usdz')).toBe('usdz');
    expect(detectCreatorAssetFormat('notes.txt')).toBe('unknown');
  });

  it('maps formats to faceplate asset kinds', () => {
    expect(classifyCreatorAsset('glb')).toBe('model');
    expect(classifyCreatorAsset('mp4')).toBe('video');
    expect(classifyCreatorAsset('png')).toBe('image');
    expect(classifyCreatorAsset('wav')).toBe('audio');
    expect(classifyCreatorAsset('unknown')).toBe('unsupported');
  });

  it('formats byte sizes for compact asset rows', () => {
    expect(formatCreatorAssetSize(512)).toBe('512 B');
    expect(formatCreatorAssetSize(2048)).toBe('2 KB');
    expect(formatCreatorAssetSize(1_572_864)).toBe('1.5 MB');
  });
});
