/**
 * The ensemble as independent players, addressed by attention.
 *
 * These test the founder's sentence directly:
 *   "each instrument is independent and the specific ways of moving hands
 *    depends on solos and playing together. sometimes there are over 100
 *    instruments."
 *
 * Three claims, each with a test that fails if it stops being true:
 *   1. sections are independent — one changing does not disturb another
 *   2. addressing scales past the number of hands — 100 sections, gaze selects
 *   3. the same gesture means different things depending on WHO is addressed
 */
import { describe, it, expect } from 'vitest';
import { Ensemble, type SectionFamily } from '../sections';
import type { Vec3 } from '../cueing';

const HEAD: Vec3 = [0, 1.6, 0];

/** A unit ray from the conductor's head towards a point. */
function towards(target: Vec3): Vec3 {
  const d: Vec3 = [target[0] - HEAD[0], target[1] - HEAD[1], target[2] - HEAD[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / len, d[1] / len, d[2] / len];
}

/** Look somewhere long enough that the eyes have settled. */
function settleOn(ensemble: Ensemble, target: Vec3, from = 0) {
  ensemble.look(HEAD, towards(target), from);
  ensemble.look(HEAD, towards(target), from + 300);
  return from + 300;
}

function orchestra(count: number): Ensemble {
  const families: SectionFamily[] = [
    'strings',
    'woodwind',
    'brass',
    'percussion',
    'keyboard',
    'voice',
  ];
  const ensemble = new Ensemble();
  for (let i = 0; i < count; i++) {
    // Laid out on an arc in front of the conductor.
    const angle = -1.0 + (2.0 * i) / Math.max(1, count - 1);
    ensemble.add({
      id: `s${i}`,
      name: `section ${i}`,
      family: families[i % families.length],
      at: [Math.sin(angle) * 6, 1.2, -Math.cos(angle) * 6],
    });
  }
  return ensemble;
}

describe('sections are independent players', () => {
  it('brings in one section without touching any other', () => {
    const e = orchestra(8);
    const target = e.get('s3')!;

    const t = settleOn(e, target.at);
    e.gesture('bring-in', t);

    expect(target.state).toBe('following');
    expect(e.playing().map((s) => s.id)).toEqual(['s3']);
    for (const other of e.all()) {
      if (other.id === 's3') continue;
      expect(other.state).toBe('silent');
      expect(other.level).toBe(0);
    }
  });

  it('cuts one section off and leaves the rest playing', () => {
    const e = orchestra(6);
    e.addressTutti();
    e.gesture('bring-in', 0);
    expect(e.playing().length).toBe(6);

    const t = settleOn(e, e.get('s2')!.at, 1000);
    e.gesture('cut-off', t);

    expect(e.get('s2')!.state).toBe('silent');
    expect(e.playing().length).toBe(5);
  });

  it('holds one section while the others keep going', () => {
    const e = orchestra(4);
    e.addressTutti();
    e.gesture('bring-in', 0);

    const t = settleOn(e, e.get('s1')!.at, 1000);
    e.gesture('hold', t);

    expect(e.get('s1')!.state).toBe('held');
    expect(e.all().filter((s) => s.state === 'following').length).toBe(3);

    e.gesture('release', t + 500);
    expect(e.get('s1')!.state).toBe('following');
  });
});

describe('addressing scales past the number of hands', () => {
  it('selects among 120 sections by looking, with two hands', () => {
    // The whole reason gaze is the selector: hands do not scale, attention does.
    const e = orchestra(120);
    expect(e.size).toBe(120);

    const target = e.get('s77')!;
    const t = settleOn(e, target.at);

    const address = e.addressed();
    expect(address.kind).toBe('section');
    expect(address.kind === 'section' && address.id).toBe('s77');

    e.gesture('bring-in', t);
    expect(e.playing().map((s) => s.id)).toEqual(['s77']);
  });

  it('does not address anyone while the eyes are only sweeping past', () => {
    const e = orchestra(12);
    // A glance that never rests: each look lands on a different section.
    for (let i = 0; i < 12; i++) {
      e.look(HEAD, towards(e.get(`s${i}`)!.at), i * 50);
    }
    expect(e.addressed().kind).toBe('tutti');
  });

  it('widens back to everyone after the eyes leave, but not immediately', () => {
    const e = orchestra(5);
    const t = settleOn(e, e.get('s0')!.at);
    expect(e.addressed().kind).toBe('section');

    // Looking up and away, briefly — a conductor glancing at the score has not
    // stopped addressing the section.
    const away: Vec3 = [0, 1, 0];
    e.look(HEAD, away, t + 200);
    expect(e.addressed().kind).toBe('section');

    e.look(HEAD, away, t + 2000);
    expect(e.addressed().kind).toBe('tutti');
  });

  it('addresses a whole family at once', () => {
    const e = orchestra(12);
    e.addressTutti();
    e.gesture('bring-in', 0);

    e.addressFamily('brass');
    const brass = e.addressedSections();
    expect(brass.length).toBeGreaterThan(0);
    expect(brass.every((s) => s.family === 'brass')).toBe(true);

    e.gesture('cut-off', 100);
    expect(e.all().filter((s) => s.family === 'brass').every((s) => s.state === 'silent')).toBe(
      true
    );
    expect(e.playing().every((s) => s.family !== 'brass')).toBe(true);
  });
});

describe('the same gesture means different things depending on who is addressed', () => {
  it('one lift at ONE section makes a solo — the rest yield under it', () => {
    const e = orchestra(6);
    e.addressTutti();
    e.gesture('bring-in', 0);
    const levelsBefore = e.all().map((s) => s.level);

    const t = settleOn(e, e.get('s4')!.at, 1000);
    e.gesture('swell', t, 1);

    const soloist = e.soloist();
    expect(soloist?.id).toBe('s4');
    expect(soloist!.level).toBeGreaterThan(levelsBefore[4]);

    // Everyone else dropped under it. That IS the solo; there is no solo gesture.
    for (const other of e.all()) {
      if (other.id === 's4') continue;
      expect(other.level).toBeLessThan(levelsBefore[0]);
      expect(other.state).toBe('following');
    }
  });

  it('the IDENTICAL lift at everyone swells everyone, and nobody solos', () => {
    const e = orchestra(6);
    e.addressTutti();
    e.gesture('bring-in', 0);
    const levelsBefore = e.all().map((s) => s.level);

    e.addressTutti();
    e.gesture('swell', 1000, 1);

    expect(e.soloist()).toBeNull();
    e.all().forEach((s, i) => {
      expect(s.level).toBeGreaterThan(levelsBefore[i]);
      expect(s.state).toBe('following');
    });
  });

  it('a lift at a family raises that family and the rest yield', () => {
    const e = orchestra(12);
    e.addressTutti();
    e.gesture('bring-in', 0);

    e.addressFamily('strings');
    e.gesture('swell', 500, 1);

    const strings = e.all().filter((s) => s.family === 'strings');
    const rest = e.all().filter((s) => s.family !== 'strings');
    const quietest = Math.min(...strings.map((s) => s.level));
    const loudestOther = Math.max(...rest.map((s) => s.level));
    expect(quietest).toBeGreaterThan(loudestOther);
  });

  it('hushing a soloist returns it to the ensemble', () => {
    const e = orchestra(4);
    e.addressTutti();
    e.gesture('bring-in', 0);

    const t = settleOn(e, e.get('s1')!.at, 1000);
    e.gesture('swell', t, 1);
    expect(e.soloist()?.id).toBe('s1');

    e.gesture('hush', t + 500, 1);
    expect(e.soloist()).toBeNull();
    expect(e.get('s1')!.state).toBe('following');
  });
});

describe('the room can say what it is doing, in words', () => {
  it('never reports a state it is not in', () => {
    // Field report 3: the panel read "HOLD — frozen" while the drum was playing.
    // Status must be DERIVED, never a one-shot event that outlives its state.
    const e = orchestra(3);
    expect(e.describe()).toContain('waiting for you');

    e.addressTutti();
    e.gesture('bring-in', 0);
    expect(e.describe()).toContain('playing together');
    expect(e.describe()).not.toContain('holding');

    e.gesture('hold', 100);
    expect(e.describe()).toContain('holding');

    e.gesture('release', 200);
    expect(e.describe()).not.toContain('holding');
  });

  it('names the soloist the way a person would say it', () => {
    const e = new Ensemble();
    e.add({ id: 'ob', name: 'oboe', family: 'woodwind', at: [1, 1.2, -3] });
    e.add({ id: 'vc', name: 'cellos', family: 'strings', at: [-1, 1.2, -3] });

    e.addressTutti();
    e.gesture('bring-in', 0);
    const t = settleOn(e, [1, 1.2, -3], 1000);
    e.gesture('swell', t, 1);

    expect(e.describe()).toBe('The oboe are out in front');
    // No identifiers, no state names, no numbers a person would have to decode.
    expect(e.describe()).not.toMatch(/soloing|following|\bob\b|level/);
  });
});

describe('the ensemble refuses nonsense', () => {
  it('will not admit the same section twice', () => {
    const e = new Ensemble();
    e.add({ id: 'timp', name: 'timpani', family: 'percussion', at: [0, 1, -4] });
    expect(() => e.add({ id: 'timp', name: 'timpani', family: 'percussion', at: [0, 1, -4] })).toThrow(
      /already in the ensemble/
    );
  });

  it('bringing in an already-playing section changes nothing', () => {
    const e = orchestra(3);
    e.addressTutti();
    e.gesture('bring-in', 0);
    const levels = e.all().map((s) => s.level);

    const again = e.gesture('bring-in', 100);
    expect(again.affected.length).toBe(0);
    expect(e.all().map((s) => s.level)).toEqual(levels);
  });
});
