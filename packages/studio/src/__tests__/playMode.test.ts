/**
 * Play Mode Tests — playModeStore + GameHUD + useGameLoop
 *
 * Verifies the core play mode state machine, game state mutations,
 * scene snapshot/restore, and HUD rendering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayMode } from '../lib/stores/playModeStore';

// ─── playModeStore ────────────────────────────────────────────────────────────

describe('playModeStore', () => {
  const store = usePlayMode;

  beforeEach(() => {
    // Reset to initial state
    const s = store.getState();
    if (s.playState !== 'editing') s.stop();
    s.setShowHUD(true);
    s.setShowFPS(true);
    s.setBotCount(0);
  });

  describe('State Machine', () => {
    it('starts in editing state', () => {
      expect(store.getState().playState).toBe('editing');
    });

    it('transitions to playing on play()', () => {
      store.getState().play('scene code');
      expect(store.getState().playState).toBe('playing');
    });

    it('transitions to paused on pause()', () => {
      store.getState().play('code');
      store.getState().pause();
      expect(store.getState().playState).toBe('paused');
    });

    it('resumes from paused to playing', () => {
      store.getState().play('code');
      store.getState().pause();
      store.getState().resume();
      expect(store.getState().playState).toBe('playing');
    });

    it('stops and returns to editing', () => {
      store.getState().play('code');
      store.getState().stop();
      expect(store.getState().playState).toBe('editing');
    });

    it('pause does nothing when editing', () => {
      store.getState().pause();
      expect(store.getState().playState).toBe('editing');
    });

    it('resume does nothing when playing', () => {
      store.getState().play('code');
      store.getState().resume(); // already playing
      expect(store.getState().playState).toBe('playing');
    });
  });

  describe('Scene Snapshot', () => {
    it('saves scene code on play()', () => {
      store.getState().play('world "Test" { @mesh {} }');
      expect(store.getState().sceneSnapshot).toBe('world "Test" { @mesh {} }');
    });

    it('stop() returns the saved snapshot', () => {
      store.getState().play('original code');
      const snapshot = store.getState().stop();
      expect(snapshot).toBe('original code');
    });

    it('stop() clears the snapshot', () => {
      store.getState().play('code');
      store.getState().stop();
      expect(store.getState().sceneSnapshot).toBeNull();
    });
  });

  describe('Game State', () => {
    it('initializes with default game state', () => {
      store.getState().play('code');
      const gs = store.getState().gameState;
      expect(gs.score).toBe(0);
      expect(gs.lives).toBe(3);
      expect(gs.level).toBe(1);
      expect(gs.timer).toBe(0);
      expect(gs.inventory).toEqual({});
    });

    it('addScore() accumulates points', () => {
      store.getState().play('code');
      store.getState().addScore(100);
      store.getState().addScore(50);
      expect(store.getState().gameState.score).toBe(150);
    });

    it('setScore() sets exact score', () => {
      store.getState().play('code');
      store.getState().setScore(999);
      expect(store.getState().gameState.score).toBe(999);
    });

    it('loseLife() decrements lives', () => {
      store.getState().play('code');
      store.getState().loseLife();
      expect(store.getState().gameState.lives).toBe(2);
    });

    it('loseLife() clamps at 0', () => {
      store.getState().play('code');
      store.getState().setLives(1);
      store.getState().loseLife();
      store.getState().loseLife(); // should not go below 0
      expect(store.getState().gameState.lives).toBe(0);
    });

    it('nextLevel() increments level', () => {
      store.getState().play('code');
      store.getState().nextLevel();
      store.getState().nextLevel();
      expect(store.getState().gameState.level).toBe(3);
    });

    it('addItem() adds to inventory', () => {
      store.getState().play('code');
      store.getState().addItem('sword');
      store.getState().addItem('potion', 3);
      expect(store.getState().gameState.inventory).toEqual({
        sword: 1,
        potion: 3,
      });
    });

    it('addItem() stacks existing items', () => {
      store.getState().play('code');
      store.getState().addItem('coin', 10);
      store.getState().addItem('coin', 5);
      expect(store.getState().gameState.inventory.coin).toBe(15);
    });

    it('removeItem() decrements inventory', () => {
      store.getState().play('code');
      store.getState().addItem('potion', 3);
      store.getState().removeItem('potion', 1);
      expect(store.getState().gameState.inventory.potion).toBe(2);
    });

    it('removeItem() removes item at 0', () => {
      store.getState().play('code');
      store.getState().addItem('key', 1);
      store.getState().removeItem('key');
      expect(store.getState().gameState.inventory.key).toBeUndefined();
    });

    it('setVariable() and getVariable() work', () => {
      store.getState().play('code');
      store.getState().setVariable('gravity', 9.8);
      store.getState().setVariable('name', 'Player 1');
      expect(store.getState().getVariable('gravity')).toBe(9.8);
      expect(store.getState().getVariable('name')).toBe('Player 1');
    });
  });

  describe('Tick / Game Loop', () => {
    it('tick() increments elapsed time', () => {
      store.getState().play('code');
      store.getState().tick(0.016); // ~60fps
      store.getState().tick(0.016);
      expect(store.getState().elapsed).toBeCloseTo(0.032, 3);
    });

    it('tick() updates FPS', () => {
      store.getState().play('code');
      store.getState().tick(0.016);
      expect(store.getState().fps).toBe(63); // 1/0.016 ≈ 62.5 → 63
    });

    it('tick() does nothing when paused', () => {
      store.getState().play('code');
      store.getState().pause();
      store.getState().tick(0.016);
      expect(store.getState().elapsed).toBe(0);
    });

    it('tick() does nothing when editing', () => {
      store.getState().tick(0.016);
      expect(store.getState().elapsed).toBe(0);
    });

    it('tick() updates game timer (floored)', () => {
      store.getState().play('code');
      for (let i = 0; i < 60; i++) store.getState().tick(0.016);
      // ~0.96 seconds → timer should be 0
      expect(store.getState().gameState.timer).toBe(0);
      // Push past 1 second
      for (let i = 0; i < 10; i++) store.getState().tick(0.016);
      expect(store.getState().gameState.timer).toBe(1);
    });
  });

  describe('Reset', () => {
    it('reset() clears game state but keeps playing', () => {
      store.getState().play('code');
      store.getState().addScore(500);
      store.getState().addItem('sword');
      store.getState().reset();
      expect(store.getState().playState).toBe('playing'); // still playing
      expect(store.getState().gameState.score).toBe(0);
      expect(store.getState().gameState.inventory).toEqual({});
    });
  });

  describe('Config', () => {
    it('toggles HUD visibility', () => {
      expect(store.getState().showHUD).toBe(true);
      store.getState().setShowHUD(false);
      expect(store.getState().showHUD).toBe(false);
    });

    it('toggles FPS visibility', () => {
      expect(store.getState().showFPS).toBe(true);
      store.getState().setShowFPS(false);
      expect(store.getState().showFPS).toBe(false);
    });

    it('sets bot count', () => {
      store.getState().setBotCount(5);
      expect(store.getState().botCount).toBe(5);
    });
  });
});
