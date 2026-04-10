import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyTrait } from '../LobbyTrait';

describe('LobbyTrait', () => {
  let lobby: LobbyTrait;

  beforeEach(() => {
    lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 2, autoStart: false });
  });

  it('initializes with config', () => {
    const cfg = lobby.getConfig();
    expect(cfg.maxPlayers).toBe(4);
    expect(cfg.minPlayers).toBe(2);
  });

  it('initial state is waiting', () => {
    expect(lobby.getState()).toBe('waiting');
  });

  it('addPlayer adds player', () => {
    const added = lobby.addPlayer({ id: 'p1', name: 'Alice' });
    expect(added).toBe(true);
    expect(lobby.getPlayerCount()).toBe(1);
  });

  it('addPlayer rejects when full', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.addPlayer({ id: 'p2', name: 'B' });
    lobby.addPlayer({ id: 'p3', name: 'C' });
    lobby.addPlayer({ id: 'p4', name: 'D' });
    const added = lobby.addPlayer({ id: 'p5', name: 'E' });
    expect(added).toBe(false);
    expect(lobby.getPlayerCount()).toBe(4);
  });

  it('isFull returns true at capacity', () => {
    for (let i = 0; i < 4; i++) lobby.addPlayer({ id: `p${i}`, name: `P${i}` });
    expect(lobby.isFull()).toBe(true);
  });

  it('removePlayer removes player', () => {
    lobby.addPlayer({ id: 'p1', name: 'Alice' });
    lobby.removePlayer('p1');
    expect(lobby.getPlayerCount()).toBe(0);
  });

  it('getPlayer returns player by id', () => {
    lobby.addPlayer({ id: 'p1', name: 'Alice' });
    expect(lobby.getPlayer('p1')?.name).toBe('Alice');
    expect(lobby.getPlayer('p99')).toBeUndefined();
  });

  it('setReady updates player ready state', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.setLocalPlayerId('p1');
    lobby.setReady('p1', true);
    expect(lobby.getPlayer('p1')?.isReady).toBe(true);
  });

  it('allPlayersReady returns correct state', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.addPlayer({ id: 'p2', name: 'B' });
    expect(lobby.allPlayersReady()).toBe(false);
    lobby.setReady('p1', true);
    lobby.setReady('p2', true);
    expect(lobby.allPlayersReady()).toBe(true);
  });

  it('setTeam assigns team', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.setTeam('p1', 'blue');
    expect(lobby.getPlayer('p1')?.team).toBe('blue');
  });

  it('getTeamPlayers filters by team', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.addPlayer({ id: 'p2', name: 'B' });
    lobby.setTeam('p1', 'red');
    lobby.setTeam('p2', 'blue');
    expect(lobby.getTeamPlayers('red')).toHaveLength(1);
  });

  it('setLobbyId and getLobbyId', () => {
    expect(lobby.getLobbyId()).toBeNull();
    lobby.setLobbyId('lobby-123');
    expect(lobby.getLobbyId()).toBe('lobby-123');
  });

  it('setProperties and getProperty', () => {
    lobby.setProperties({ mode: 'deathmatch' });
    expect(lobby.getProperty('mode')).toBe('deathmatch');
  });

  it('serialize returns snapshot', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    const s = lobby.serialize();
    expect(s.state).toBe('waiting');
    expect((s.players as any[]).length).toBe(1);
  });

  it('reset resets ready states', () => {
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.setReady('p1', true);
    lobby.reset();
    expect(lobby.getState()).toBe('waiting');
    expect(lobby.getPlayer('p1')?.isReady).toBe(false);
    expect(lobby.getPlayerCount()).toBe(1);
  });
});
