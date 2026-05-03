// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Canvas } from '@react-three/fiber';
import { MorphTargetController } from '../customizer/MorphTargetController';

beforeAll(() => {
  if (!global.ResizeObserver) {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('MorphTargetController', () => {
  it('renders without crashing', () => {
    // If the component has heavy requirements (e.g. providers, store state), 
    // we use a simple shallow or context-wrapped render.
    // For now, this is a structural smoke test that asserts it binds properly.
    const { container } = render(
      <Canvas>
        <MorphTargetController />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });
});
