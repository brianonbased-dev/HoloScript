import { describe, expect, it } from 'vitest';
import { InMemoryHoloDocumentStore, RefusableMutationController } from '../mutations.js';

describe('RefusableMutationController', () => {
  it('returns an edit_holo diff preview without applying until confirm', async () => {
    const store = new InMemoryHoloDocumentStore({
      scene: 'cube { @color(red) }\n',
    });
    const controller = new RefusableMutationController(store, {
      idFactory: () => 'preview_edit_1',
      now: () => new Date('2026-05-25T00:00:00.000Z'),
    });

    const preview = await controller.previewToolCall('edit_holo', {
      documentId: 'scene',
      nextSource: 'cube { @color(blue) }\n',
      reason: 'change material',
    });

    expect(preview).toMatchObject({
      type: 'mutation-preview',
      previewId: 'preview_edit_1',
      requiresConfirmation: true,
      status: 'pending',
      reason: 'change material',
    });
    expect(preview.diff).toContain('-cube { @color(red) }');
    expect(preview.diff).toContain('+cube { @color(blue) }');
    expect(store.read('scene')).toBe('cube { @color(red) }\n');

    const confirm = await controller.confirm(preview.previewId);

    expect(confirm).toMatchObject({ applied: true, status: 'applied' });
    expect(store.read('scene')).toBe('cube { @color(blue) }\n');
  });

  it('returns a trait_swap diff preview and leaves source untouched until confirm', async () => {
    const store = new InMemoryHoloDocumentStore({
      scene: 'cube { @grabbable @physics }\n',
    });
    const controller = new RefusableMutationController(store, {
      idFactory: () => 'preview_trait_1',
    });

    const preview = await controller.previewToolCall('trait_swap', {
      documentId: 'scene',
      fromTrait: 'grabbable',
      toTrait: 'static',
    });

    expect(preview.diff).toContain('-cube { @grabbable @physics }');
    expect(preview.diff).toContain('+cube { @static @physics }');
    expect(store.read('scene')).toBe('cube { @grabbable @physics }\n');

    await controller.confirm(preview.previewId);

    expect(store.read('scene')).toBe('cube { @static @physics }\n');
  });
});
