/**
 * LobbyTrait — Production Test Suite
 *
 * LobbyTrait is a pure class with no external dependencies — no mocks needed.
 * createLobbyTrait is a factory function.
 *
 * Key behaviours:
 * 1. constructor defaults — visibility=public, maxPlayers=8, minPlayers=2, autoStart=false, hostMigration=true, matchmaking.mode=random
 * 2. addPlayer — returns true, emits player-joined, first player becomes host
 * 3. addPlayer — returns false when lobby is full
 * 4. addPlayer — returns false when in-progress + !allowMidGameJoin
 * 5. removePlayer — emits player-left; no-op for unknown id
 * 6. removePlayer — triggers host migration when host leaves (hostMigration=true)
 * 7. removePlayer — cancels countdown when players drop below minPlayers
 * 8. kickPlayer — only host can kick; emits kicked + removes player
 * 9. kickPlayer — returns false for non-host
 * 10. getPlayer / getPlayers / getPlayerCount / isFull / getHost
 * 11. isHost — true when localPlayerId === hostId
 * 12. transferHost — only host can transfer; updates isHost flags + emits host-changed
 * 13. setReady / toggleReady / allPlayersReady / getReadyCount
 * 14. allPlayersReady — false when players < minPlayers
 * 15. setTeam / getTeamPlayers / autoBalanceTeams
 * 16. startCountdown — sets state='starting', emits countdown-started; no-op if already running
 * 17. startCountdown — no-op when players < minPlayers
 * 18. cancelCountdown — sets state back to 'waiting', emits countdown-cancelled
 * 19. startGame — sets state='in-progress', emits game-starting
 * 20. endGame — sets state='finished', emits game-ended
 * 21. close — state='closed', clears players
 * 22. reset — state='waiting', all players isReady=false
 * 23. on / off event listeners
 * 24. setProperties / getProperty — merges props + emits properties-changed
 * 25. serialize — returns comprehensive snapshot
 * 26. createLobbyTrait factory
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LobbyTrait, createLobbyTrait } from '../LobbyTrait';

function makePlayer(id: string, name = `Player_${id}`) {
  return { id, name };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── constructor ──────────────────────────────────────────────────────────────
describe('LobbyTrait constructor', () => {
  it('default visibility=public', () =>
    expect(new LobbyTrait().getConfig().visibility).toBe('public'));
  it('default maxPlayers=8', () => expect(new LobbyTrait().getConfig().maxPlayers).toBe(8));
  it('default minPlayers=2', () => expect(new LobbyTrait().getConfig().minPlayers).toBe(2));
  it('default autoStart=false', () => expect(new LobbyTrait().getConfig().autoStart).toBe(false));
  it('default hostMigration=true', () =>
    expect(new LobbyTrait().getConfig().hostMigration).toBe(true));
  it('default matchmaking.mode=random', () =>
    expect(new LobbyTrait().getConfig().matchmaking?.mode).toBe('random'));
  it('initial state=waiting', () => expect(new LobbyTrait().getState()).toBe('waiting'));
});

// ─── addPlayer ────────────────────────────────────────────────────────────────
describe('LobbyTrait.addPlayer', () => {
  it('returns true and adds player', () => {
    const lobby = new LobbyTrait();
    expect(lobby.addPlayer(makePlayer('p1'))).toBe(true);
    expect(lobby.getPlayerCount()).toBe(1);
  });

  it('first player becomes host', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    expect(lobby.getHost()!.id).toBe('p1');
    expect(lobby.getPlayer('p1')!.isHost).toBe(true);
  });

  it('emits player-joined on add', () => {
    const lobby = new LobbyTrait();
    const cb = vi.fn();
    lobby.on('player-joined', cb);
    lobby.addPlayer(makePlayer('p1'));
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'player-joined', playerId: 'p1' })
    );
  });

  it('returns false when lobby is full', () => {
    const lobby = new LobbyTrait({ maxPlayers: 2 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    expect(lobby.addPlayer(makePlayer('p3'))).toBe(false);
    expect(lobby.getPlayerCount()).toBe(2);
  });

  it('returns false when in-progress and !allowMidGameJoin', () => {
    const lobby = new LobbyTrait({ allowMidGameJoin: false });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.startGame();
    expect(lobby.addPlayer(makePlayer('p3'))).toBe(false);
  });

  it('allows join mid-game when allowMidGameJoin=true', () => {
    const lobby = new LobbyTrait({ allowMidGameJoin: true });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.startGame();
    expect(lobby.addPlayer(makePlayer('p3'))).toBe(true);
  });
});

// ─── removePlayer ─────────────────────────────────────────────────────────────
describe('LobbyTrait.removePlayer', () => {
  it('removes player and emits player-left', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    const cb = vi.fn();
    lobby.on('player-left', cb);
    lobby.removePlayer('p1');
    expect(lobby.getPlayerCount()).toBe(0);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'p1' }));
  });

  it('no-op for unknown player id', () => {
    const lobby = new LobbyTrait();
    expect(() => lobby.removePlayer('unknown')).not.toThrow();
  });

  it('migrates host when host leaves (hostMigration=true)', () => {
    const lobby = new LobbyTrait({ hostMigration: true });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    const cb = vi.fn();
    lobby.on('host-changed', cb);
    lobby.removePlayer('p1'); // p1 was host
    expect(lobby.getHost()!.id).toBe('p2');
    expect(cb).toHaveBeenCalled();
  });

  it('does NOT migrate host when hostMigration=false', () => {
    const lobby = new LobbyTrait({ hostMigration: false });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    const cb = vi.fn();
    lobby.on('host-changed', cb);
    lobby.removePlayer('p1');
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── kickPlayer ──────────────────────────────────────────────────────────────
describe('LobbyTrait.kickPlayer', () => {
  it('host can kick another player', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p1');
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    const cb = vi.fn();
    lobby.on('kicked', cb);
    expect(lobby.kickPlayer('p2', 'cheating')).toBe(true);
    expect(lobby.getPlayer('p2')).toBeUndefined();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'p2' }));
  });

  it('non-host cannot kick', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p2');
    lobby.addPlayer(makePlayer('p1')); // p1 is host
    lobby.addPlayer(makePlayer('p2'));
    expect(lobby.kickPlayer('p1')).toBe(false);
  });

  it('returns false for unknown player', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p1');
    lobby.addPlayer(makePlayer('p1'));
    expect(lobby.kickPlayer('unknown')).toBe(false);
  });
});

// ─── getters ──────────────────────────────────────────────────────────────────
describe('LobbyTrait getters', () => {
  it('getPlayers() returns array of all players', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    expect(lobby.getPlayers()).toHaveLength(2);
  });

  it('isFull() = true when at maxPlayers', () => {
    const lobby = new LobbyTrait({ maxPlayers: 2 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    expect(lobby.isFull()).toBe(true);
  });

  it('isFull() = false when below maxPlayers', () => {
    const lobby = new LobbyTrait({ maxPlayers: 3 });
    lobby.addPlayer(makePlayer('p1'));
    expect(lobby.isFull()).toBe(false);
  });

  it('isHost() = true when localPlayerId === hostId', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p1');
    lobby.addPlayer(makePlayer('p1'));
    expect(lobby.isHost()).toBe(true);
  });

  it('isHost() = false for non-host', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p2');
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    expect(lobby.isHost()).toBe(false);
  });

  it('getLobbyId() returns null until set', () => {
    const lobby = new LobbyTrait();
    expect(lobby.getLobbyId()).toBeNull();
    lobby.setLobbyId('lobby_1');
    expect(lobby.getLobbyId()).toBe('lobby_1');
  });
});

// ─── transferHost ─────────────────────────────────────────────────────────────
describe('LobbyTrait.transferHost', () => {
  it('host can transfer to another player', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p1');
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    const cb = vi.fn();
    lobby.on('host-changed', cb);
    expect(lobby.transferHost('p2')).toBe(true);
    expect(lobby.getHost()!.id).toBe('p2');
    expect(lobby.getPlayer('p1')!.isHost).toBe(false);
    expect(lobby.getPlayer('p2')!.isHost).toBe(true);
    expect(cb).toHaveBeenCalled();
  });

  it('non-host cannot transfer', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p2');
    lobby.addPlayer(makePlayer('p1')); // p1 is host
    lobby.addPlayer(makePlayer('p2'));
    expect(lobby.transferHost('p2')).toBe(false);
  });

  it('returns false for unknown target player', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p1');
    lobby.addPlayer(makePlayer('p1'));
    expect(lobby.transferHost('unknown')).toBe(false);
  });
});

// ─── ready system ─────────────────────────────────────────────────────────────
describe('LobbyTrait ready system', () => {
  it('setReady(true) marks player ready + emits player-ready', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    const cb = vi.fn();
    lobby.on('player-ready', cb);
    lobby.setReady('p1', true);
    expect(lobby.getPlayer('p1')!.isReady).toBe(true);
    expect(cb).toHaveBeenCalled();
  });

  it('setReady(false) emits player-unready', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    lobby.setReady('p1', true);
    const cb = vi.fn();
    lobby.on('player-unready', cb);
    lobby.setReady('p1', false);
    expect(cb).toHaveBeenCalled();
  });

  it('toggleReady flips ready state', () => {
    const lobby = new LobbyTrait();
    lobby.setLocalPlayerId('p1');
    lobby.addPlayer(makePlayer('p1'));
    lobby.toggleReady();
    expect(lobby.getPlayer('p1')!.isReady).toBe(true);
    lobby.toggleReady();
    expect(lobby.getPlayer('p1')!.isReady).toBe(false);
  });

  it('allPlayersReady: false when players < minPlayers', () => {
    const lobby = new LobbyTrait({ minPlayers: 2 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.setReady('p1', true);
    expect(lobby.allPlayersReady()).toBe(false);
  });

  it('allPlayersReady: true when all ready + enough players', () => {
    const lobby = new LobbyTrait({ minPlayers: 2 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.setReady('p1', true);
    lobby.setReady('p2', true);
    expect(lobby.allPlayersReady()).toBe(true);
  });

  it('getReadyCount counts ready players', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.setReady('p1', true);
    expect(lobby.getReadyCount()).toBe(1);
  });
});

// ─── teams ────────────────────────────────────────────────────────────────────
describe('LobbyTrait teams', () => {
  it('setTeam assigns team to player + emits team-changed', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    const cb = vi.fn();
    lobby.on('team-changed', cb);
    lobby.setTeam('p1', 'red');
    expect(lobby.getPlayer('p1')!.team).toBe('red');
    expect(cb).toHaveBeenCalled();
  });

  it('getTeamPlayers returns only players on that team', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.addPlayer(makePlayer('p3'));
    lobby.setTeam('p1', 'red');
    lobby.setTeam('p2', 'blue');
    lobby.setTeam('p3', 'red');
    expect(lobby.getTeamPlayers('red').map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('autoBalanceTeams distributes players across teams', () => {
    const lobby = new LobbyTrait({
      teams: [
        { id: 'red', name: 'Red', maxPlayers: 4 },
        { id: 'blue', name: 'Blue', maxPlayers: 4 },
      ],
    });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.addPlayer(makePlayer('p3'));
    lobby.autoBalanceTeams();
    // Players distributed round-robin: p1=red, p2=blue, p3=red
    expect(lobby.getTeamPlayers('red').length).toBe(2);
    expect(lobby.getTeamPlayers('blue').length).toBe(1);
  });
});

// ─── game flow ────────────────────────────────────────────────────────────────
describe('LobbyTrait game flow', () => {
  it('startCountdown: sets state=starting + emits countdown-started', () => {
    const lobby = new LobbyTrait({ minPlayers: 2, autoStartDelay: 100 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    const cb = vi.fn();
    lobby.on('countdown-started', cb);
    lobby.startCountdown();
    expect(lobby.getState()).toBe('starting');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'countdown-started' }));
    lobby.cancelCountdown(); // cleanup
  });

  it('startCountdown: no-op when insufficient players', () => {
    const lobby = new LobbyTrait({ minPlayers: 2 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.startCountdown();
    expect(lobby.getState()).toBe('waiting');
  });

  it('startCountdown: no-op when already counting down', () => {
    const lobby = new LobbyTrait({ minPlayers: 2, autoStartDelay: 100 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    const cb = vi.fn();
    lobby.on('countdown-started', cb);
    lobby.startCountdown();
    lobby.startCountdown(); // second call = no-op
    expect(cb).toHaveBeenCalledTimes(1);
    lobby.cancelCountdown();
  });

  it('cancelCountdown: resets state to waiting + emits countdown-cancelled', () => {
    const lobby = new LobbyTrait({ minPlayers: 2, autoStartDelay: 100 });
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.startCountdown();
    const cb = vi.fn();
    lobby.on('countdown-cancelled', cb);
    lobby.cancelCountdown();
    expect(lobby.getState()).toBe('waiting');
    expect(cb).toHaveBeenCalled();
  });

  it('startGame: sets state=in-progress + emits game-starting', () => {
    const lobby = new LobbyTrait({ gameMode: 'deathmatch', map: 'map_01' });
    const cb = vi.fn();
    lobby.on('game-starting', cb);
    lobby.startGame();
    expect(lobby.getState()).toBe('in-progress');
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gameMode: 'deathmatch', map: 'map_01' }),
      })
    );
  });

  it('endGame: sets state=finished + emits game-ended', () => {
    const lobby = new LobbyTrait();
    lobby.startGame();
    const cb = vi.fn();
    lobby.on('game-ended', cb);
    lobby.endGame({ winner: 'p1' });
    expect(lobby.getState()).toBe('finished');
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ data: { results: { winner: 'p1' } } })
    );
  });

  it('close: state=closed + players cleared', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    lobby.close();
    expect(lobby.getState()).toBe('closed');
    expect(lobby.getPlayerCount()).toBe(0);
  });

  it('reset: state=waiting + all players isReady=false', () => {
    const lobby = new LobbyTrait();
    lobby.addPlayer(makePlayer('p1'));
    lobby.setReady('p1', true);
    lobby.startGame();
    lobby.reset();
    expect(lobby.getState()).toBe('waiting');
    expect(lobby.getPlayer('p1')!.isReady).toBe(false);
  });
});

// ─── autoStart ────────────────────────────────────────────────────────────────
describe('LobbyTrait autoStart', () => {
  it('triggers countdown when autoStart=true and all players ready', () => {
    const lobby = new LobbyTrait({ autoStart: true, minPlayers: 2, autoStartDelay: 500 });
    const cb = vi.fn();
    lobby.on('countdown-started', cb);
    lobby.addPlayer(makePlayer('p1'));
    lobby.addPlayer(makePlayer('p2'));
    lobby.setReady('p1', true);
    lobby.setReady('p2', true);
    expect(cb).toHaveBeenCalled();
    lobby.cancelCountdown();
  });
});

// ─── events ──────────────────────────────────────────────────────────────────
describe('LobbyTrait on / off', () => {
  it('on registers listener', () => {
    const lobby = new LobbyTrait();
    const cb = vi.fn();
    lobby.on('player-joined', cb);
    lobby.addPlayer(makePlayer('p1'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('off removes listener', () => {
    const lobby = new LobbyTrait();
    const cb = vi.fn();
    lobby.on('player-joined', cb);
    lobby.off('player-joined', cb);
    lobby.addPlayer(makePlayer('p1'));
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── properties ──────────────────────────────────────────────────────────────
describe('LobbyTrait properties', () => {
  it('setProperties merges and emits properties-changed', () => {
    const lobby = new LobbyTrait({ properties: { foo: 1 } });
    const cb = vi.fn();
    lobby.on('properties-changed', cb);
    lobby.setProperties({ bar: 2 });
    expect(lobby.getProperty('foo')).toBe(1);
    expect(lobby.getProperty('bar')).toBe(2);
    expect(cb).toHaveBeenCalled();
  });

  it('setGameMode / setMap update config', () => {
    const lobby = new LobbyTrait();
    lobby.setGameMode('tdm');
    lobby.setMap('valley');
    expect(lobby.getConfig().gameMode).toBe('tdm');
    expect(lobby.getConfig().map).toBe('valley');
  });
});

// ─── serialize ───────────────────────────────────────────────────────────────
describe('LobbyTrait.serialize', () => {
  it('returns comprehensive snapshot', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, gameMode: 'ctf' });
    lobby.setLobbyId('lobby_99');
    lobby.addPlayer(makePlayer('p1'));
    const snap = lobby.serialize();
    expect(snap.lobbyId).toBe('lobby_99');
    expect(snap.maxPlayers).toBe(4);
    expect(snap.gameMode).toBe('ctf');
    expect(snap.playerCount).toBe(1);
    expect(snap.hostId).toBe('p1');
    expect(Array.isArray(snap.players)).toBe(true);
  });
});

// ─── createLobbyTrait factory ─────────────────────────────────────────────────
describe('createLobbyTrait', () => {
  it('returns a LobbyTrait instance', () => {
    const lobby = createLobbyTrait({ maxPlayers: 10 });
    expect(lobby).toBeInstanceOf(LobbyTrait);
    expect(lobby.getConfig().maxPlayers).toBe(10);
  });
});
