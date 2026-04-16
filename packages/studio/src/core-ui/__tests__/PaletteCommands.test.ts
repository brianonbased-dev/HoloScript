import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HSPlusNode } from '@holoscript/core';
import {
  createAgentMarketplaceTemplateCommands,
  createLiveSwarmNodeViewerCommand,
} from '../PaletteCommands';
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

describe('createLiveSwarmNodeViewerCommand', () => {
  it('opens SSE stream and dispatches swarm topology event', async () => {
    const dispatchEvent = vi.fn();
    const appendChild = vi.fn();
    const getElementById = vi.fn().mockReturnValue(null);

    const container = {
      id: '',
      style: {},
      innerHTML: '',
      setAttribute: vi.fn(),
    } as unknown as HTMLElement;

    const createElement = vi.fn().mockReturnValue(container);

    vi.stubGlobal('document', {
      dispatchEvent,
      getElementById,
      createElement,
      body: { appendChild },
    });
    vi.stubGlobal('CustomEvent', TestCustomEvent);

    const source = {
      onmessage: undefined as ((event: MessageEvent<string>) => void) | undefined,
      onerror: undefined as (() => void) | undefined,
      close: vi.fn(),
    } as unknown as EventSource;

    const command = createLiveSwarmNodeViewerCommand({
      streamUrl: '/test/sse',
      eventSourceFactory: () => source,
    });

    await command.action();

    expect(createElement).toHaveBeenCalledWith('section');
    expect(appendChild).toHaveBeenCalled();
    expect(source.onmessage).toBeTypeOf('function');

    source.onmessage?.({
      data: JSON.stringify({
        roomId: 'room-alpha',
        updatedAt: '2026-04-16T06:00:00Z',
        nodes: [{ id: 'n1', label: 'Node 1', status: 'online', role: 'builder' }],
      }),
    } as MessageEvent<string>);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const eventArg = dispatchEvent.mock.calls[0]?.[0] as { type?: string; detail?: unknown };
    expect(eventArg.type).toBe('hs:swarm_topology');
    expect(eventArg.detail).toEqual(
      expect.objectContaining({
        roomId: 'room-alpha',
      })
    );
  });
});
