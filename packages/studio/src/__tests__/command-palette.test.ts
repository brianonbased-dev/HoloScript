import { describe, it, expect, beforeEach, vi } from 'vitest';
import { commandRegistry, type CommandEntry } from '../components/command-palette/CommandRegistry';

function makeCommand(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: `test.cmd.${Math.random().toString(36).slice(2)}`,
    label: 'Test Command',
    category: 'panel',
    execute: vi.fn(),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  beforeEach(() => {
    commandRegistry.clear();
  });

  it('registers and retrieves a command', () => {
    const cmd = makeCommand({ id: 'test.alpha' });
    commandRegistry.register(cmd);
    expect(commandRegistry.get('test.alpha')).toBe(cmd);
    expect(commandRegistry.size).toBe(1);
  });

  it('overwrites a command with the same id', () => {
    const cmd1 = makeCommand({ id: 'test.dup', label: 'First' });
    const cmd2 = makeCommand({ id: 'test.dup', label: 'Second' });
    commandRegistry.register(cmd1);
    commandRegistry.register(cmd2);
    expect(commandRegistry.get('test.dup')?.label).toBe('Second');
    expect(commandRegistry.size).toBe(1);
  });

  it('unregisters a command', () => {
    const cmd = makeCommand({ id: 'test.remove' });
    commandRegistry.register(cmd);
    expect(commandRegistry.unregister('test.remove')).toBe(true);
    expect(commandRegistry.get('test.remove')).toBeUndefined();
    expect(commandRegistry.unregister('nonexistent')).toBe(false);
  });

  it('registerAll adds multiple commands', () => {
    const cmds = [
      makeCommand({ id: 'test.a' }),
      makeCommand({ id: 'test.b' }),
      makeCommand({ id: 'test.c' }),
    ];
    commandRegistry.registerAll(cmds);
    expect(commandRegistry.size).toBe(3);
  });

  it('executes a command by id', async () => {
    const executeFn = vi.fn();
    commandRegistry.register(makeCommand({ id: 'test.exec', execute: executeFn }));
    const result = await commandRegistry.execute('test.exec');
    expect(result).toBe(true);
    expect(executeFn).toHaveBeenCalledOnce();
  });

  it('returns false when executing unknown command', async () => {
    const result = await commandRegistry.execute('nonexistent');
    expect(result).toBe(false);
  });

  it('getAll respects when() predicate', () => {
    commandRegistry.register(makeCommand({ id: 'test.visible', when: () => true }));
    commandRegistry.register(makeCommand({ id: 'test.hidden', when: () => false }));
    commandRegistry.register(makeCommand({ id: 'test.always' }));
    const all = commandRegistry.getAll();
    expect(all.length).toBe(2);
    expect(all.map((c) => c.id)).toContain('test.visible');
    expect(all.map((c) => c.id)).toContain('test.always');
    expect(all.map((c) => c.id)).not.toContain('test.hidden');
  });

  describe('search', () => {
    beforeEach(() => {
      commandRegistry.registerAll([
        makeCommand({
          id: 'nav.home',
          label: 'Go Home',
          category: 'navigation',
          keywords: ['start', 'landing'],
        }),
        makeCommand({
          id: 'panel.chat',
          label: 'Open Chat Panel',
          category: 'panel',
          keywords: ['ai', 'conversation'],
        }),
        makeCommand({
          id: 'scene.save',
          label: 'Save Scene',
          category: 'scene',
          description: 'Save the current scene to disk',
        }),
        makeCommand({ id: 'shader.new', label: 'New Shader', category: 'shader' }),
      ]);
    });

    it('returns all commands for empty query', () => {
      expect(commandRegistry.search('').length).toBe(4);
    });

    it('finds commands by label', () => {
      const results = commandRegistry.search('chat');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('panel.chat');
    });

    it('finds commands by keyword', () => {
      const results = commandRegistry.search('conversation');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('panel.chat');
    });

    it('finds commands by description', () => {
      const results = commandRegistry.search('disk');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('scene.save');
    });

    it('finds commands by category', () => {
      const results = commandRegistry.search('shader');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.id === 'shader.new')).toBe(true);
    });

    it('returns empty for nonsense query', () => {
      expect(commandRegistry.search('zzzzxyz').length).toBe(0);
    });

    it('ranks exact match higher than partial', () => {
      const results = commandRegistry.search('Save Scene');
      expect(results[0].id).toBe('scene.save');
    });
  });

  describe('subscription', () => {
    it('notifies listeners on register', () => {
      const listener = vi.fn();
      const unsub = commandRegistry.subscribe(listener);
      commandRegistry.register(makeCommand({ id: 'test.sub' }));
      expect(listener).toHaveBeenCalledOnce();
      unsub();
    });

    it('notifies listeners on unregister', () => {
      commandRegistry.register(makeCommand({ id: 'test.sub2' }));
      const listener = vi.fn();
      const unsub = commandRegistry.subscribe(listener);
      commandRegistry.unregister('test.sub2');
      expect(listener).toHaveBeenCalledOnce();
      unsub();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsub = commandRegistry.subscribe(listener);
      unsub();
      commandRegistry.register(makeCommand({ id: 'test.after' }));
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getGrouped', () => {
    it('groups commands by category in order', () => {
      commandRegistry.registerAll([
        makeCommand({ id: 'a', category: 'shader' }),
        makeCommand({ id: 'b', category: 'navigation' }),
        makeCommand({ id: 'c', category: 'shader' }),
      ]);
      const grouped = commandRegistry.getGrouped();
      const keys = Array.from(grouped.keys());
      expect(keys[0]).toBe('navigation');
      expect(keys[1]).toBe('shader');
      expect(grouped.get('shader')?.length).toBe(2);
    });
  });
});
