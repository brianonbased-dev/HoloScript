// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CharacterCreationModal } from '../creation/CharacterCreationModal';

describe('CharacterCreationModal', () => {
  it('renders without crashing', () => {
    // If the component has heavy requirements (e.g. providers, store state),
    // we use a simple shallow or context-wrapped render.
    // For now, this is a structural smoke test that asserts it binds properly.
    const { container } = render(<CharacterCreationModal />);
    expect(container).toBeTruthy();
  });

  it('exposes face scan as the seventh creation path', () => {
    render(<CharacterCreationModal isOpen onClose={vi.fn()} onCharacterCreated={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Face Scan/i })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('button')
        .filter((button) =>
          button.textContent?.match(
            /Meme Templates|Face Scan|AI Generate|Mixamo|VRoid Import|Sketchfab|Upload File/
          )
        )
    ).toHaveLength(7);
  });
});
