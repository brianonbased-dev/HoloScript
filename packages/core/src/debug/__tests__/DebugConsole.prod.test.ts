/**
 * DebugConsole Production Tests
 *
 * REPL: commands, execute, autocomplete, history, variable watch, builtins.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DebugConsole } from '../DebugConsole';

describe('DebugConsole — Production', () => {
  let console_: DebugConsole;

  beforeEach(() => {
    console_ = new DebugConsole();
  });

  describe('builtins', () => {
    it('help lists commands', () => {
      const result = console_.execute('help');
      expect(result).toContain('help');
      expect(result).toContain('clear');
      expect(result).toContain('watch');
    });

    it('clear resets history then adds output', () => {
      console_.execute('test');
      const result = console_.execute('clear');
      expect(result).toBe('Console cleared');
      // clear handler empties history[], then execute() adds the output entry
      expect(console_.getHistory()).toHaveLength(1);
      expect(console_.getHistory()[0].type).toBe('output');
    });
  });

  describe('registerCommand / execute', () => {
    it('executes custom command', () => {
      console_.registerCommand({ name: 'ping', description: 'Ping', handler: () => 'pong' });
      expect(console_.execute('ping')).toBe('pong');
    });

    it('passes args', () => {
      console_.registerCommand({
        name: 'echo',
        description: 'Echo',
        handler: (args) => args.join(' '),
      });
      expect(console_.execute('echo hello world')).toBe('hello world');
    });

    it('unknown command returns error', () => {
      const result = console_.execute('nonexistent');
      expect(result).toContain('Unknown command');
    });

    it('handler error caught', () => {
      console_.registerCommand({
        name: 'boom',
        description: 'Error',
        handler: () => {
          throw new Error('fail');
        },
      });
      const result = console_.execute('boom');
      expect(result).toContain('Error');
    });
  });

  describe('autocomplete', () => {
    it('suggests matching commands', () => {
      console_.registerCommand({ name: 'player_health', description: 'H', handler: () => '' });
      console_.registerCommand({ name: 'player_score', description: 'S', handler: () => '' });
      const suggestions = console_.autocomplete('player');
      expect(suggestions).toContain('player_health');
      expect(suggestions).toContain('player_score');
    });
  });

  describe('command history', () => {
    it('historyUp/Down navigates', () => {
      console_.execute('cmd1');
      console_.execute('cmd2');
      expect(console_.historyUp()).toBe('cmd2');
      expect(console_.historyUp()).toBe('cmd1');
      expect(console_.historyDown()).toBe('cmd2');
    });
  });

  describe('variable watch', () => {
    it('watches and reads variable', () => {
      let hp = 100;
      console_.watchVariable('hp', () => hp);
      expect(console_.getWatchedValues().hp).toBe(100);
      hp = 50;
      expect(console_.getWatchedValues().hp).toBe(50);
    });

    it('unwatch removes variable', () => {
      console_.watchVariable('x', () => 1);
      expect(console_.unwatchVariable('x')).toBe(true);
      expect(console_.getWatchedValues().x).toBeUndefined();
    });
  });

  describe('toggle / isOpen', () => {
    it('toggles open state', () => {
      expect(console_.isOpen()).toBe(false);
      console_.toggle();
      expect(console_.isOpen()).toBe(true);
    });
  });

  describe('getCommandCount', () => {
    it('counts builtins + custom', () => {
      expect(console_.getCommandCount()).toBe(3); // help, clear, watch
      console_.registerCommand({ name: 'custom', description: 'C', handler: () => '' });
      expect(console_.getCommandCount()).toBe(4);
    });
  });
});
