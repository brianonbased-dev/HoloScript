// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OptimizedGlbViewer } from '../viewer/OptimizedGlbViewer';

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ gl: {}, scene: {} }),
  useFrame: vi.fn(),
}));

vi.mock('@/lib/stores', () => ({
  useCharacterStore: vi.fn((selector: any) =>
    selector({
      setBoneNames: vi.fn(),
      setBuiltinAnimations: vi.fn(),
      selectedBoneIndex: null,
      showSkeleton: false,
      isRecording: false,
      setIsRecording: vi.fn(),
      addRecordedClip: vi.fn(),
      activeBuiltinAnimation: null,
      activeClipId: null,
      recordedClips: [],
    })
  ),
}));

vi.mock('@/lib/export/glbOptimizer', () => ({
  OptimizedGLBLoader: vi.fn().mockImplementation(function () {
    return {
      load: vi.fn().mockResolvedValue({
        gltf: { scene: { traverse: vi.fn() }, animations: [] },
        loadTime: 300,
        optimizations: [],
      }),
    };
  }),
}));

describe('OptimizedGlbViewer', () => {
  it('renders without crashing', () => {
    const { container } = render(<OptimizedGlbViewer url="https://example.invalid/model.glb" />);
    expect(container).toBeTruthy();
  });
});
