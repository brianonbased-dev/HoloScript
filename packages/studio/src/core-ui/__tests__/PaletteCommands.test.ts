import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HSPlusNode } from '@holoscript/core';
import { createAgentMarketplaceTemplateCommands } from '../PaletteCommands';
import type { SceneTemplate } from '../../data/sceneTemplates';

class TestCustomEvent {
  public readonly type: string;
  public readonly detail: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAgentMarketplaceTemplateCommands', () => {
  it('creates command shortcuts from marketplace template definitions', () => {
    const sceneRoot: HSPlusNode = {
      id: 'root',
      type: 'entity',
      properties: {},
      traits: new Map(),
      children: [],
    };

    const templates: SceneTemplate[] = [
      {
        id: 'alpha',
        name: 'Alpha',
        emoji: '🅰️',
        category: 'game',
        desc: 'First template',
        tags: ['a'],
        code: 'world "Alpha" {}',
      },
      {
        id: 'beta',
        name: 'Beta',
        emoji: '🅱️',
        category: 'social',
        desc: 'Second template',
        tags: ['b'],
        code: 'world "Beta" {}',
      },
    ];

    const commands = createAgentMarketplaceTemplateCommands(sceneRoot, templates);
    expect(commands).toHaveLength(2);
    expect(commands[0]?.id).toBe('cmd_template_alpha');
    expect(commands[0]?.shortcut).toEqual(['Cmd', 'Shift', '1']);
    expect(commands[1]?.shortcut).toEqual(['Cmd', 'Shift', '2']);
  });

  it('dispatches template apply event and appends node when command executes', async () => {
    const sceneRoot: HSPlusNode = {
      id: 'root',
      type: 'entity',
      properties: {},
      traits: new Map(),
      children: [],
    };

    const templates: SceneTemplate[] = [
      {
        id: 'alpha',
        name: 'Alpha',
        emoji: '🅰️',
        category: 'game',
        desc: 'First template',
        tags: ['a'],
        code: 'world "Alpha" {}',
      },
    ];

    const dispatchEvent = vi.fn();
    vi.stubGlobal('document', {
      dispatchEvent,
    });
    vi.stubGlobal('CustomEvent', TestCustomEvent);

    const [command] = createAgentMarketplaceTemplateCommands(sceneRoot, templates);
    await command?.action();

    expect(sceneRoot.children?.length).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const eventArg = dispatchEvent.mock.calls[0]?.[0] as { type?: string; detail?: unknown };
    expect(eventArg.type).toBe('hs:template_apply');
    expect(eventArg.detail).toEqual(
      expect.objectContaining({
        templateId: 'alpha',
        templateName: 'Alpha',
        source: 'palette-shortcut',
      })
    );
  });
});
