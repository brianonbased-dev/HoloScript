/**
 * LobbyTrait Tests
 *
 * Tests for multiplayer lobby/session management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyTrait, createLobbyTrait } from './LobbyTrait';

describe('LobbyTrait', () => {
  let trait: LobbyTrait;

  beforeEach(() => {
    trait = createLobbyTrait();
  });

  describe('factory function', () => {
    it('should create lobby trait with factory', () => {
      expect(trait).toBeInstanceOf(LobbyTrait);
    });

    it('should create with custom config', () => {
      const custom = createLobbyTrait({
        name: 'Test Lobby',
        maxPlayers: 10,
        visibility: 'private',
      });
      expect(custom.getConfig().name).toBe('Test Lobby');
      expect(custom.getConfig().maxPlayers).toBe(10);
      expect(custom.getConfig().visibility).toBe('private');
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.maxPlayers).toBeDefined();
    });

    it('should have default visibility as public', () => {
      expect(trait.getConfig().visibility).toBe('public');
    });

    it('should have default max players of 8', () => {
      expect(trait.getConfig().maxPlayers).toBe(8);
    });
  });

  describe('lobby visibility', () => {
    it('should support public visibility', () => {
      const pub = createLobbyTrait({ visibility: 'public' });
      expect(pub.getConfig().visibility).toBe('public');
    });

    it('should support private visibility', () => {
      const priv = createLobbyTrait({ visibility: 'private' });
      expect(priv.getConfig().visibility).toBe('private');
    });

    it('should support friends-only visibility', () => {
      const friends = createLobbyTrait({ visibility: 'friends-only' });
      expect(friends.getConfig().visibility).toBe('friends-only');
    });
  });

  describe('lobby state', () => {
    it('should start in waiting state', () => {
      expect(trait.getState()).toBe('waiting');
    });

    it('should transition to in-progress state', () => {
      trait.startGame();
      expect(trait.getState()).toBe('in-progress');
    });

    it('should transition to finished state', () => {
      trait.startGame();
      trait.endGame();
      expect(trait.getState()).toBe('finished');
    });

    it('should close lobby', () => {
      trait.close();
      expect(trait.getState()).toBe('closed');
    });
  });

  describe('player management', () => {
    it('should add player', () => {
      trait.addPlayer({
        id: 'player1',
        name: 'TestPlayer',
        isReady: false,
      });
      expect(trait.getPlayers().length).toBe(1);
    });

    it('should remove player', () => {
      trait.addPlayer({ id: 'p1', name: 'Player1' });
      expect(trait.getPlayers().length).toBe(1);
      trait.removePlayer('p1');
      expect(trait.getPlayers().length).toBe(0);
    });

    it('should get player by id', () => {
      trait.addPlayer({ id: 'p2', name: 'Player2' });
      const player = trait.getPlayer('p2');
      expect(player?.name).toBe('Player2');
    });

    it('should enforce max players limit', () => {
      const small = createLobbyTrait({ maxPlayers: 2 });
      small.addPlayer({ id: 'p1', name: 'P1' });
      small.addPlayer({ id: 'p2', name: 'P2' });
      expect(small.isFull()).toBe(true);
    });

    it('should get player count', () => {
      trait.addPlayer({ id: 'p1', name: 'P1' });
      trait.addPlayer({ id: 'p2', name: 'P2' });
      expect(trait.getPlayerCount()).toBe(2);
    });
  });

  describe('ready system', () => {
    it('should update player ready state', () => {
      trait.addPlayer({ id: 'p1', name: 'P1', isReady: false, isHost: false });
      trait.setReady('p1', true);
      expect(trait.getPlayer('p1')?.isReady).toBe(true);
    });

    it('should check all ready', () => {
      trait.addPlayer({ id: 'p1', name: 'P1', isReady: true });
      trait.addPlayer({ id: 'p2', name: 'P2', isReady: true });
      expect(trait.allPlayersReady()).toBe(true);
    });

    it('should return false if not all players ready', () => {
      trait.addPlayer({ id: 'p1', name: 'P1', isReady: true });
      trait.addPlayer({ id: 'p2', name: 'P2', isReady: false });
      expect(trait.allPlayersReady()).toBe(false);
    });
  });

  describe('teams', () => {
    it('should get team players', () => {
      const teamed = createLobbyTrait({
        teams: [{ id: 'red', name: 'Red', maxPlayers: 4 }],
      });
      teamed.addPlayer({ id: 'p1', name: 'P1', team: 'red', isReady: false, isHost: false });
      expect(teamed.getTeamPlayers('red').length).toBe(1);
    });
  });

  describe('host management', () => {
    it('should get host', () => {
      trait.addPlayer({ id: 'p1', name: 'P1', isReady: false, isHost: false });
      // First player becomes host - getHost returns PlayerInfo
      expect(trait.getHost()?.id).toBe('p1');
    });

    it('should check if local player is host', () => {
      trait.addPlayer({ id: 'p1', name: 'P1', isReady: false, isHost: false });
      trait.setLocalPlayerId('p1');
      expect(trait.isHost()).toBe(true);
      trait.setLocalPlayerId('p2');
      expect(trait.isHost()).toBe(false);
    });
  });

  describe('matchmaking', () => {
    it('should configure matchmaking', () => {
      const mm = createLobbyTrait({
        matchmaking: {
          mode: 'skill',
          skillRange: 100,
        },
      });
      expect(mm.getConfig().matchmaking?.mode).toBe('skill');
    });

    it('should support region-based matchmaking', () => {
      const regional = createLobbyTrait({
        matchmaking: {
          mode: 'region',
          region: 'us-west',
        },
      });
      expect(regional.getConfig().matchmaking?.mode).toBe('region');
    });
  });

  describe('lobby id', () => {
    it('should set lobby id', () => {
      trait.setLobbyId('lobby-123');
      expect(trait.getLobbyId()).toBe('lobby-123');
    });
  });

  describe('local player', () => {
    it('should set local player id', () => {
      trait.setLocalPlayerId('player-me');
      expect(trait.getLocalPlayerId()).toBe('player-me');
    });
  });

  describe('properties', () => {
    it('should set properties', () => {
      trait.setProperties({ gameMode: 'deathmatch', mapName: 'arena' });
      expect(trait.getProperty('gameMode')).toBe('deathmatch');
    });

    it('should get property', () => {
      trait.setProperties({ score: 100 });
      expect(trait.getProperty('score')).toBe(100);
    });
  });

  describe('game mode and map', () => {
    it('should set game mode', () => {
      trait.setGameMode('capture-the-flag');
      expect(trait.getConfig().gameMode).toBe('capture-the-flag');
    });

    it('should set map', () => {
      trait.setMap('battlefield');
      expect(trait.getConfig().map).toBe('battlefield');
    });
  });

  describe('events', () => {
    it('should emit player joined event', () => {
      let eventFired = false;
      trait.on('player-joined', () => {
        eventFired = true;
      });
      trait.addPlayer({ id: 'p1', name: 'P1' });
      expect(eventFired).toBe(true);
    });

    it('should emit player left event', () => {
      let eventFired = false;
      trait.addPlayer({ id: 'p1', name: 'P1' });
      trait.on('player-left', () => {
        eventFired = true;
      });
      trait.removePlayer('p1');
      expect(eventFired).toBe(true);
    });
  });

  describe('countdown', () => {
    it('should get countdown remaining', () => {
      expect(typeof trait.getCountdownRemaining()).toBe('number');
    });
  });

  describe('kick player', () => {
    it('should kick player', () => {
      trait.addPlayer({ id: 'p1', name: 'Host' });
      trait.addPlayer({ id: 'p2', name: 'Player2' });
      trait.setLocalPlayerId('p1');
      const kicked = trait.kickPlayer('p2', 'cheating');
      expect(kicked).toBe(true);
      expect(trait.getPlayer('p2')).toBeUndefined();
    });
  });
});
