// @vitest-environment jsdom

/**
 * A command that fails must say so where the person who ran it is looking.
 *
 * The palette closes itself BEFORE awaiting the command's action, and the app
 * registers no `unhandledrejection` handler. So a command that threw used to
 * reach nothing at all: the overlay vanished and the screen was otherwise
 * identical to the command having worked. A refused mesh publish and a
 * successful one looked the same.
 *
 * A console line did not fix that — nobody outside a devtools panel can read
 * it. These cases drive the real path a user takes (open, press Enter) and
 * assert the reason is on the page. Deleting the backstop in `executeSelected`
 * turns this file red rather than leaving it green, which is the specific
 * complaint the review raised against the console-only version.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UXCommandPalette } from '../UXCommandPalette';

const FAILURE_SELECTOR = '.command-palette-error';

function pressEnter() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

/** Let the palette's un-awaited async handler run to completion. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('UXCommandPalette — a failed command is visible, not just logged', () => {
  let palette: UXCommandPalette | undefined;

  afterEach(() => {
    palette?.destroy();
    palette = undefined;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('puts the command and the reason on screen when the action rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    palette = new UXCommandPalette();
    palette.registerCommands([
      {
        id: 'cmd_publish',
        label: 'HoloMesh: Publish current editor AST as template',
        action: async () => {
          throw new Error('Sign in to use this — publishing to the mesh needs an account.');
        },
      },
    ]);

    palette.toggle();
    pressEnter();

    const banner = await vi.waitFor(() => {
      const found = document.querySelector(FAILURE_SELECTOR);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    // Which command, and why — both, or the user cannot act on it.
    expect(banner.textContent).toContain('HoloMesh: Publish current editor AST as template');
    expect(banner.textContent).toContain('needs an account');
    expect(banner.style.display).not.toBe('none');
  });

  it('announces the failure to a screen reader as well as to the screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    palette = new UXCommandPalette();
    palette.registerCommands([
      { id: 'cmd_boom', label: 'Boom', action: async () => Promise.reject(new Error('nope')) },
    ]);

    palette.toggle();
    pressEnter();

    const banner = await vi.waitFor(() => {
      const found = document.querySelector(FAILURE_SELECTOR);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('carries a non-Error rejection through instead of swallowing it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    palette = new UXCommandPalette();
    palette.registerCommands([
      { id: 'cmd_string', label: 'Throws a string', action: async () => Promise.reject('offline') },
    ]);

    palette.toggle();
    pressEnter();

    const banner = await vi.waitFor(() => {
      const found = document.querySelector(FAILURE_SELECTOR);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    expect(banner.textContent).toContain('offline');
  });

  it('shows nothing when the command succeeds', async () => {
    palette = new UXCommandPalette();
    const ran = vi.fn();
    palette.registerCommands([{ id: 'cmd_ok', label: 'Works fine', action: ran }]);

    palette.toggle();
    pressEnter();
    await settle();

    expect(ran).toHaveBeenCalledTimes(1);
    // A banner that appears on success would train people to ignore it.
    expect(document.querySelector(FAILURE_SELECTOR)).toBeNull();
  });

  it('replaces the previous reason rather than stacking banners', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    palette = new UXCommandPalette();
    palette.registerCommands([
      { id: 'cmd_a', label: 'First', action: async () => Promise.reject(new Error('first reason')) },
    ]);

    palette.toggle();
    pressEnter();
    await vi.waitFor(() => expect(document.querySelector(FAILURE_SELECTOR)).not.toBeNull());

    palette.replaceCommands([
      {
        id: 'cmd_b',
        label: 'Second',
        action: async () => Promise.reject(new Error('second reason')),
      },
    ]);
    palette.toggle();
    pressEnter();

    await vi.waitFor(() => {
      const banner = document.querySelector(FAILURE_SELECTOR);
      expect(banner?.textContent).toContain('second reason');
    });

    expect(document.querySelectorAll(FAILURE_SELECTOR)).toHaveLength(1);
  });
});
