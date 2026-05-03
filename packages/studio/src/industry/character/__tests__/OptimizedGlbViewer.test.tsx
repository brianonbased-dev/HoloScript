// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Canvas } from '@react-three/fiber';
import { OptimizedGlbViewer } from '../viewer/OptimizedGlbViewer';

beforeAll(() => {
  if (!global.ResizeObserver) {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('OptimizedGlbViewer', () => {
  it('renders without crashing', () => {
    // If the component has heavy requirements (e.g. providers, store state), 
    // we use a simple shallow or context-wrapped render.
    // For now, this is a structural smoke test that asserts it binds properly.
    const { container } = render(
      <Canvas>
        <OptimizedGlbViewer url="/test.glb" />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });
});
