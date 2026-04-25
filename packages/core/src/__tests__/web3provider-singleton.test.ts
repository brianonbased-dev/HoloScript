/**
 * Sprint 21 Acceptance Tests â€” Web3 Provider + Orbital Mechanics
 *
 * Covers:
 *   - packages/core/src/web3/Web3Provider.ts
 *     Web3Provider singleton: getInstance, connect, disconnect, getMyAssets, mint
 *
 *   - packages/core/src/orbital/KeplerianCalculator.ts
 *     calculatePosition, dateToJulian, julianToDate, generateOrbitalPath, toDegrees
 *
 *   - packages/core/src/orbital/TimeManager.ts
 *     TimeManager: constructor, start/stop, advance, pause/play/togglePause,
 *     setTimeScale/getTimeScale, setDate/getDate/getJulianDate, onUpdate/offUpdate, getState
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Web3Provider, type NFTAsset } from '@holoscript/platform';
import {
  calculatePosition,
  dateToJulian,
  julianToDate,
  generateOrbitalPath,
  toDegrees,
  type OrbitalElements,
  type Position3D,
} from '@holoscript/engine/orbital';
import { TimeManager } from '@holoscript/engine/orbital';

// ---------------------------------------------------------------------------
// Earth's orbital elements (well-known test values)
// ---------------------------------------------------------------------------
const EARTH_ELEMENTS: OrbitalElements = {
  semiMajorAxis: 1.0, // 1 AU
  eccentricity: 0.0167,
  inclination: 0.0,
  longitudeAscending: 174.9,
  argumentPeriapsis: 288.1,
  meanAnomalyEpoch: 357.5,
  orbitalPeriod: 365.25,
};

// Circular orbit (eccentricity = 0) for deterministic tests
const CIRCULAR_ORBIT: OrbitalElements = {
  semiMajorAxis: 2.0,
  eccentricity: 0.0,
  inclination: 0.0,
  longitudeAscending: 0.0,
  argumentPeriapsis: 0.0,
  meanAnomalyEpoch: 0.0,
  orbitalPeriod: 100.0,
};

// =============================================================================
// Feature 1A: Web3Provider â€” singleton pattern
// =============================================================================

describe('Feature 1A: Web3Provider â€” singleton', () => {
  it('getInstance() returns an instance', () => {
    expect(Web3Provider.getInstance()).toBeDefined();
  });

  it('getInstance() returns the same instance each time', () => {
    const a = Web3Provider.getInstance();
    const b = Web3Provider.getInstance();
    expect(a).toBe(b);
  });

  it('isConnected starts as false', () => {
    expect(Web3Provider.getInstance().isConnected).toBe(false);
  });

  it('walletAddress starts as null', () => {
    expect(Web3Provider.getInstance().walletAddress).toBeNull();
  });

  it('chainId is 8453 (Base Mainnet)', () => {
    expect(Web3Provider.getInstance().chainId).toBe(8453);
  });
});

// =============================================================================
// Feature 1B: Web3Provider â€” connect / disconnect
// =============================================================================

describe('Feature 1B: Web3Provider â€” connect/disconnect', () => {
  let provider: Web3Provider;

  beforeEach(async () => {
    provider = Web3Provider.getInstance();
    // ensure clean state
    await provider.disconnect();
  });

  it('connect() returns a Promise', () => {
    const p = provider.connect();
    expect(p).toBeInstanceOf(Promise);
    p.then(() => {}); // consume promise
  });

  it('connect() resolves to a wallet address string', async () => {
    const addr = await provider.connect();
    expect(typeof addr).toBe('string');
    expect(addr.length).toBeGreaterThan(0);
    await provider.disconnect();
  }, 10000);

  it('after connect(), isConnected is true', async () => {
    await provider.connect();
    expect(provider.isConnected).toBe(true);
    await provider.disconnect();
  }, 10000);

  it('after connect(), walletAddress is not null', async () => {
    await provider.connect();
    expect(provider.walletAddress).not.toBeNull();
    await provider.disconnect();
  }, 10000);

  it('after disconnect(), isConnected is false', async () => {
    await provider.connect();
    await provider.disconnect();
    expect(provider.isConnected).toBe(false);
  }, 10000);

  it('after disconnect(), walletAddress is null', async () => {
    await provider.connect();
    await provider.disconnect();
    expect(provider.walletAddress).toBeNull();
  }, 10000);
});

// =============================================================================
// Feature 1C: Web3Provider â€” getMyAssets
// =============================================================================

describe('Feature 1C: Web3Provider â€” getMyAssets()', () => {
  let provider: Web3Provider;

  beforeEach(async () => {
    provider = Web3Provider.getInstance();
    await provider.disconnect();
  });

  it('getMyAssets() returns empty array when not connected', async () => {
    const assets = await provider.getMyAssets();
    expect(assets).toHaveLength(0);
  }, 5000);

  it('getMyAssets() returns array when connected', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    expect(Array.isArray(assets)).toBe(true);
    await provider.disconnect();
  }, 10000);

  it('each asset has contractAddress', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    for (const a of assets) {
      expect(typeof a.contractAddress).toBe('string');
    }
    await provider.disconnect();
  }, 10000);

  it('each asset has tokenId', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    for (const a of assets) {
      expect(typeof a.tokenId).toBe('string');
    }
    await provider.disconnect();
  }, 10000);

  it('each asset has chainId 8453', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    for (const a of assets) {
      expect(a.chainId).toBe(8453);
    }
    await provider.disconnect();
  }, 10000);

  it('each asset has name', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    for (const a of assets) {
      expect(typeof a.name).toBe('string');
    }
    await provider.disconnect();
  }, 10000);

  it('each asset has imageUrl', async () => {
    await provider.connect();
    const assets = await provider.getMyAssets();
    for (const a of assets) {
      expect(typeof a.imageUrl).toBe('string');
    }
    await provider.disconnect();
  }, 10000);
});

// =============================================================================
// Feature 1D: Web3Provider â€” mint
// =============================================================================

describe('Feature 1D: Web3Provider â€” mint()', () => {
  let provider: Web3Provider;

  beforeEach(async () => {
    provider = Web3Provider.getInstance();
    await provider.disconnect();
  });

  it('mint() throws when not connected', async () => {
    await expect(provider.mint({ name: 'Test NFT' })).rejects.toThrow();
  }, 5000);

  it('mint() resolves with transactionHash when connected', async () => {
    await provider.connect();
    const result = await provider.mint({ name: 'Test' });
    expect(typeof result.transactionHash).toBe('string');
    await provider.disconnect();
  }, 15000);

  it('mint() resolves with tokenId string', async () => {
    await provider.connect();
    const result = await provider.mint({ name: 'Test' });
    expect(typeof result.tokenId).toBe('string');
    await provider.disconnect();
  }, 15000);
});

// =============================================================================
// Feature 2A: KeplerianCalculator â€” toDegrees
// =============================================================================

describe('Feature 2A: KeplerianCalculator â€” toDegrees()', () => {
  it('0 radians â†’ 0 degrees', () => {
    expect(toDegrees(0)).toBe(0);
  });

  it('Ï€ radians â†’ 180 degrees', () => {
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 5);
  });

  it('2Ï€ radians â†’ 360 degrees', () => {
    expect(toDegrees(2 * Math.PI)).toBeCloseTo(360, 5);
  });

  it('Ï€/2 radians â†’ 90 degrees', () => {
    expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 5);
  });
});

// =============================================================================
// Feature 2B: KeplerianCalculator â€” dateToJulian / julianToDate
// =============================================================================

describe('Feature 2B: KeplerianCalculator â€” dateToJulian / julianToDate', () => {
  it('J2000 epoch â†’ julianDate 0', () => {
    const j2000 = new Date('2000-01-01T12:00:00Z');
    expect(dateToJulian(j2000)).toBeCloseTo(0, 5);
  });

  it('one day after J2000 â†’ julianDate 1', () => {
    const dayAfter = new Date('2000-01-02T12:00:00Z');
    expect(dateToJulian(dayAfter)).toBeCloseTo(1, 5);
  });

  it('julianToDate(0) â†’ J2000 epoch', () => {
    const date = julianToDate(0);
    expect(date.getFullYear()).toBe(2000);
    expect(date.getMonth()).toBe(0); // January
  });

  it('round-trip: date â†’ julian â†’ date', () => {
    const original = new Date('2024-06-15T12:00:00Z');
    const julian = dateToJulian(original);
    const recovered = julianToDate(julian);
    expect(recovered.getTime()).toBeCloseTo(original.getTime(), -3); // within ~1s
  });

  it('past date â†’ negative julian', () => {
    const past = new Date('1999-01-01T12:00:00Z');
    expect(dateToJulian(past)).toBeLessThan(0);
  });

  it('future date â†’ positive julian', () => {
    const future = new Date('2030-01-01T12:00:00Z');
    expect(dateToJulian(future)).toBeGreaterThan(0);
  });
});

// =============================================================================
// Feature 2C: KeplerianCalculator â€” calculatePosition
// =============================================================================

describe('Feature 2C: KeplerianCalculator â€” calculatePosition()', () => {
  it('returns a Position3D with x, y, z', () => {
    const pos = calculatePosition(EARTH_ELEMENTS, 0);
    expect(typeof pos[0]).toBe('number');
    expect(typeof pos[1]).toBe('number');
    expect(typeof pos[2]).toBe('number');
  });

  it('circular orbit: z â‰ˆ 0 (inclination=0)', () => {
    const pos = calculatePosition(CIRCULAR_ORBIT, 0);
    expect(Math.abs(pos[2])).toBeLessThan(1e-6);
  });

  it('circular orbit: distance from origin â‰ˆ semiMajorAxis', () => {
    const pos = calculatePosition(CIRCULAR_ORBIT, 0);
    const r = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
    expect(r).toBeCloseTo(CIRCULAR_ORBIT.semiMajorAxis, 3);
  });

  it('returns different positions at different times', () => {
    const pos0 = calculatePosition(EARTH_ELEMENTS, 0);
    const pos90 = calculatePosition(EARTH_ELEMENTS, EARTH_ELEMENTS.orbitalPeriod / 4);
    // Should be at different orbital positions
    expect(pos0[0]).not.toBeCloseTo(pos90[0], 1);
  });

  it('after one full period, returns to same position', () => {
    const pos0 = calculatePosition(CIRCULAR_ORBIT, 0);
    const pos1 = calculatePosition(CIRCULAR_ORBIT, CIRCULAR_ORBIT.orbitalPeriod);
    expect(pos0[0]).toBeCloseTo(pos1[0], 3);
    expect(pos0[1]).toBeCloseTo(pos1[1], 3);
  });

  it('Earth at J2000: x is approximately 1 AU', () => {
    const pos = calculatePosition(EARTH_ELEMENTS, 0);
    const r = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
    // Earth's distance from Sun â‰ˆ 0.98 to 1.02 AU
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThan(1.1);
  });
});

// =============================================================================
// Feature 2D: KeplerianCalculator â€” generateOrbitalPath
// =============================================================================

describe('Feature 2D: KeplerianCalculator â€” generateOrbitalPath()', () => {
  it('returns an array', () => {
    expect(Array.isArray(generateOrbitalPath(CIRCULAR_ORBIT))).toBe(true);
  });

  it('default numPoints returns 101 points (100 + closing point)', () => {
    expect(generateOrbitalPath(CIRCULAR_ORBIT)).toHaveLength(101);
  });

  it('custom numPoints respected', () => {
    expect(generateOrbitalPath(CIRCULAR_ORBIT, 20)).toHaveLength(21); // 20 + closing
  });

  it('each point has x, y, z', () => {
    const path = generateOrbitalPath(CIRCULAR_ORBIT, 10);
    for (const pt of path) {
      expect(typeof pt[0]).toBe('number');
      expect(typeof pt[1]).toBe('number');
      expect(typeof pt[2]).toBe('number');
    }
  });

  it('first and last point are identical (closed loop)', () => {
    const path = generateOrbitalPath(CIRCULAR_ORBIT, 50);
    expect(path[0][0]).toBeCloseTo(path[path.length - 1][0], 5);
    expect(path[0][1]).toBeCloseTo(path[path.length - 1][1], 5);
  });

  it('circular orbit: all points equidistant from origin', () => {
    const path = generateOrbitalPath(CIRCULAR_ORBIT, 20);
    const distances = path.map((p) => Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2));
    const target = CIRCULAR_ORBIT.semiMajorAxis;
    for (const d of distances) {
      expect(d).toBeCloseTo(target, 3);
    }
  });
});

// =============================================================================
// Feature 3A: TimeManager â€” instantiation + initial state
// =============================================================================

describe('Feature 3A: TimeManager â€” instantiation', () => {
  it('can be instantiated with no args', () => {
    expect(new TimeManager()).toBeDefined();
  });

  it('can be instantiated with a start date', () => {
    const tm = new TimeManager(new Date('2000-01-01T12:00:00Z'));
    expect(tm).toBeDefined();
  });

  it('getTimeScale() defaults to 1', () => {
    expect(new TimeManager().getTimeScale()).toBe(1);
  });

  it('getIsPaused() defaults to false', () => {
    expect(new TimeManager().getIsPaused()).toBe(false);
  });

  it('getJulianDate() returns a number', () => {
    expect(typeof new TimeManager().getJulianDate()).toBe('number');
  });

  it('getDate() returns a Date object', () => {
    expect(new TimeManager().getDate()).toBeInstanceOf(Date);
  });

  it('initializing with J2000 epoch gives julianDate â‰ˆ 0', () => {
    const tm = new TimeManager(new Date('2000-01-01T12:00:00Z'));
    expect(tm.getJulianDate()).toBeCloseTo(0, 3);
  });
});

// =============================================================================
// Feature 3B: TimeManager â€” setDate / getDate / getJulianDate
// =============================================================================

describe('Feature 3B: TimeManager â€” date management', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager();
  });

  it('setDate() updates julianDate', () => {
    const before = tm.getJulianDate();
    tm.setDate(new Date('2010-06-15T12:00:00Z'));
    expect(tm.getJulianDate()).not.toBe(before);
  });

  it('setDate() and getDate() round-trip', () => {
    const target = new Date('2020-03-20T12:00:00Z');
    tm.setDate(target);
    const recovered = tm.getDate();
    expect(Math.abs(recovered.getTime() - target.getTime())).toBeLessThan(1000);
  });

  it('getJulianDate() for J2000+1 day â‰ˆ 1', () => {
    tm.setDate(new Date('2000-01-02T12:00:00Z'));
    expect(tm.getJulianDate()).toBeCloseTo(1, 3);
  });
});

// =============================================================================
// Feature 3C: TimeManager â€” pause / play / togglePause
// =============================================================================

describe('Feature 3C: TimeManager â€” pause/play/toggle', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager();
  });

  it('pause() sets isPaused to true', () => {
    tm.pause();
    expect(tm.getIsPaused()).toBe(true);
  });

  it('play() sets isPaused to false', () => {
    tm.pause();
    tm.play();
    expect(tm.getIsPaused()).toBe(false);
  });

  it('togglePause() pauses when playing', () => {
    tm.togglePause();
    expect(tm.getIsPaused()).toBe(true);
  });

  it('togglePause() plays when paused', () => {
    tm.pause();
    tm.togglePause();
    expect(tm.getIsPaused()).toBe(false);
  });

  it('advance() does not change julianDate when paused', () => {
    tm.pause();
    const before = tm.getJulianDate();
    tm.advance(86400000); // 1 day in ms
    expect(tm.getJulianDate()).toBe(before);
  });
});

// =============================================================================
// Feature 3D: TimeManager â€” advance() and setTimeScale
// =============================================================================

describe('Feature 3D: TimeManager â€” advance() and timeScale', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager(new Date('2000-01-01T12:00:00Z'));
  });

  it('advance(ms) increases julianDate', () => {
    const before = tm.getJulianDate();
    tm.advance(86400000); // 1 day in real ms
    expect(tm.getJulianDate()).toBeGreaterThan(before);
  });

  it('advance(1 day in ms) at scale=1 adds â‰ˆ1 day', () => {
    tm.advance(86400000);
    expect(tm.getJulianDate()).toBeCloseTo(1, 5);
  });

  it('setTimeScale(10) â†’ advance 1 day adds â‰ˆ10 julian days', () => {
    tm.setTimeScale(10);
    tm.advance(86400000); // 1 real day
    expect(tm.getJulianDate()).toBeCloseTo(10, 3);
  });

  it('setTimeScale(0) clamps to 0.1', () => {
    tm.setTimeScale(0);
    expect(tm.getTimeScale()).toBe(0.1);
  });

  it('setTimeScale(365) sets 365x speed', () => {
    tm.setTimeScale(365);
    expect(tm.getTimeScale()).toBe(365);
  });
});

// =============================================================================
// Feature 3E: TimeManager â€” onUpdate / offUpdate callbacks
// =============================================================================

describe('Feature 3E: TimeManager â€” onUpdate/offUpdate', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager(new Date('2000-01-01T12:00:00Z'));
  });

  it('onUpdate() callback is called when advance() is called', () => {
    let called = false;
    const cb = () => {
      called = true;
    };
    tm.onUpdate(cb);
    tm.advance(1000);
    expect(called).toBe(true);
  });

  it('callback receives julianDate as first arg', () => {
    let receivedJulian: number | undefined;
    tm.onUpdate((jd) => {
      receivedJulian = jd;
    });
    tm.advance(86400000);
    expect(typeof receivedJulian).toBe('number');
  });

  it('callback receives Date as second arg', () => {
    let receivedDate: Date | undefined;
    tm.onUpdate((_jd, date) => {
      receivedDate = date;
    });
    tm.advance(1000);
    expect(receivedDate).toBeInstanceOf(Date);
  });

  it('offUpdate() stops calling callback', () => {
    let count = 0;
    const cb = () => {
      count++;
    };
    tm.onUpdate(cb);
    tm.advance(1000);
    tm.offUpdate(cb);
    tm.advance(1000);
    expect(count).toBe(1);
  });

  it('setDate() also fires callbacks', () => {
    let called = false;
    tm.onUpdate(() => {
      called = true;
    });
    tm.setDate(new Date('2010-01-01T12:00:00Z'));
    expect(called).toBe(true);
  });
});

// =============================================================================
// Feature 3F: TimeManager â€” getState()
// =============================================================================

describe('Feature 3F: TimeManager â€” getState()', () => {
  let tm: TimeManager;

  beforeEach(() => {
    tm = new TimeManager(new Date('2000-01-01T12:00:00Z'));
  });

  it('getState() returns an object', () => {
    expect(typeof tm.getState()).toBe('object');
  });

  it('state.julianDate is a number', () => {
    expect(typeof tm.getState().julianDate).toBe('number');
  });

  it('state.timeScale is a number', () => {
    expect(typeof tm.getState().timeScale).toBe('number');
  });

  it('state.isPaused is a boolean', () => {
    expect(typeof tm.getState().isPaused).toBe('boolean');
  });

  it('state.date is an ISO string', () => {
    expect(tm.getState().date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('state.julianDate matches getJulianDate()', () => {
    expect(tm.getState().julianDate).toBe(tm.getJulianDate());
  });
});

// =============================================================================
// Feature 3G: TimeManager â€” start/stop
// =============================================================================

describe('Feature 3G: TimeManager â€” start/stop', () => {
  it('start() and stop() do not throw', () => {
    const tm = new TimeManager();
    expect(() => {
      tm.start();
      tm.stop();
    }).not.toThrow();
  });

  it('calling start() twice does not throw', () => {
    const tm = new TimeManager();
    tm.start();
    expect(() => tm.start()).not.toThrow();
    tm.stop();
  });

  it('calling stop() when not started does not throw', () => {
    expect(() => new TimeManager().stop()).not.toThrow();
  });
});
