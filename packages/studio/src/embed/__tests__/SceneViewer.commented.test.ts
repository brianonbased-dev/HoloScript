// @vitest-environment jsdom
/**
 * The share viewer (SceneViewer, also used by StudioWidget and Brittney's build
 * pane) kept its own copy of the parse step, with the same "starts with
 * composition" check, so a composition that opens with a comment reached the
 * .hsplus parser there as well. It now uses useScenePipeline. The real hook and
 * the real core run here; only the 3D canvas is stubbed, so the test reads the
 * object count the viewer prints under the scene.
 */
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useFrame: vi.fn() }));
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  Stars: () => null,
  Environment: () => null,
  Text: () => null,
  Sparkles: () => null,
}));
vi.mock('@holoscript/r3f-renderer', () => ({
  HolomapPointCloudViewer: () => null,
  WebSurfaceRenderer: () => null,
  resolveWebSurfaceConfig: () => null,
}));

import { SceneViewer } from '../SceneViewer';

const COMMENTED_ROOM = `// A room with one lamp, lit by the sun.
composition "CommentedRoom" {
  directional_light "Sun" {
    intensity: 1.2
    position: [5, 10, 5]
  }

  object "Lamp" {
    geometry: "sphere"
    position: [0, 2, 0]
  }
}
`;

describe('SceneViewer — a composition that opens with a comment', () => {
  it('shows both objects and reports no error', () => {
    const onErrors = vi.fn();
    render(createElement(SceneViewer, { code: COMMENTED_ROOM, onErrors }));

    expect(onErrors).not.toHaveBeenCalled();
    expect(screen.getByText('2 objects')).toBeTruthy();
  });
});
