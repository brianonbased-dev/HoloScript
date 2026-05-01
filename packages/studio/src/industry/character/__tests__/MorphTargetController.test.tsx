// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MorphTargetController } from '../customizer/MorphTargetController';

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ scene: { traverse: vi.fn() } }),
  useFrame: vi.fn(),
}));

describe('MorphTargetController', () => {
  it('renders without crashing', () => {
    const { container } = render(<MorphTargetController />);
    expect(container).toBeTruthy();
  });
});
