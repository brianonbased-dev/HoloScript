/**
 * The capability ladder — what the machine may claim, given what is plugged in.
 *
 * Every test here is about the same danger, from a different angle: a receipt
 * that says "proven on real hardware" for a run that quietly fell back to
 * simulation. Under-claiming is a nuisance. Over-claiming is a lie that a
 * non-developer has no way to catch, which is exactly the person these receipts
 * are written for.
 */
import { describe, it, expect } from 'vitest';
import {
  capabilityOf,
  requireTier,
  atLeast,
  describeCapability,
  SYNTHETIC_ONLY,
  TIER_ORDER,
  type HeadsetProbe,
} from '../capability';
import { SyntheticHeadset } from '../SyntheticHeadset';

describe('the ladder only climbs on evidence', () => {
  it('nothing plugged in means synthetic', () => {
    const cap = capabilityOf({ transport: 'none' });
    expect(cap.tier).toBe('synthetic');
    expect(cap.because).toContain('No headset is plugged in');
  });

  it('a device that is LISTED but never answered is still synthetic', () => {
    // The trap this exists for. `adb devices` lists units in `offline` and
    // `unauthorized` states, and a CLI that fails by exiting zero lists nothing
    // while looking healthy. Presence in a table is not reachability.
    const listed: HeadsetProbe = { transport: 'usb', serial: '1WMHH000X', model: 'Quest 3' };
    const cap = capabilityOf(listed);

    expect(cap.tier).toBe('synthetic');
    expect(cap.because).toContain('never answered');
    expect(cap.because).toContain('not a device you have');
  });

  it('a device that completed a round trip is attached', () => {
    const cap = capabilityOf({
      transport: 'usb',
      serial: '1WMHH000X',
      model: 'Quest 3',
      respondedAt: 1000,
    });
    expect(cap.tier).toBe('attached');
    expect(cap.because).toContain('Quest 3');
    expect(cap.because).toContain('answered');
  });

  it('worn requires proximity to say so, and unknown counts as not worn', () => {
    const base: HeadsetProbe = { transport: 'usb', model: 'Quest 3', respondedAt: 1 };

    expect(capabilityOf(base).tier).toBe('attached');
    expect(capabilityOf({ ...base, worn: false }).tier).toBe('attached');
    expect(capabilityOf({ ...base, worn: true }).tier).toBe('worn');
  });

  it('a truthy-but-not-true proximity reading does not count', () => {
    // `worn === true`, not `worn` — an undefined, a 1, or a "yes" from some
    // future probe must not silently promote a run to claiming a person was there.
    const sneaky = {
      transport: 'usb',
      respondedAt: 1,
      worn: 1 as unknown as boolean,
    } satisfies HeadsetProbe;
    expect(capabilityOf(sneaky).tier).toBe('attached');
  });
});

describe('what each rung buys', () => {
  it('the disclaimer list shrinks as the hardware earns it', () => {
    const synthetic = capabilityOf({ transport: 'none' });
    const attached = capabilityOf({ transport: 'usb', respondedAt: 1 });
    const worn = capabilityOf({ transport: 'usb', respondedAt: 1, worn: true });

    expect(synthetic.doesNotProve.length).toBeGreaterThan(attached.doesNotProve.length);
    expect(attached.doesNotProve.length).toBeGreaterThan(worn.doesNotProve.length);

    expect(synthetic.proves.length).toBeLessThan(attached.proves.length);
    expect(attached.proves.length).toBeLessThan(worn.proves.length);
  });

  it('only real hardware may claim pixels and speed', () => {
    const synthetic = capabilityOf({ transport: 'none' });
    expect(synthetic.doesNotProve.some((d) => d.includes('drawn correctly'))).toBe(true);
    expect(synthetic.doesNotProve.some((d) => d.includes('how fast'))).toBe(true);

    const attached = capabilityOf({ transport: 'usb', respondedAt: 1 });
    expect(attached.proves.some((p) => p.includes('actually drawn'))).toBe(true);
    expect(attached.proves.some((p) => p.includes('how fast it really runs'))).toBe(true);
  });

  it('never claims to know whether a person liked it, at any tier', () => {
    // A person saying it felt wrong is data. A machine deciding it felt right
    // is not, and no amount of hardware changes that.
    for (const probe of [
      { transport: 'none' } as HeadsetProbe,
      { transport: 'usb', respondedAt: 1 } as HeadsetProbe,
      { transport: 'usb', respondedAt: 1, worn: true } as HeadsetProbe,
    ]) {
      const cap = capabilityOf(probe);
      const disclaims = cap.doesNotProve.join(' ');
      expect(disclaims).toMatch(/comfortable|liked it|would find it/);
    }
  });

  it('describes the run in one sentence a person can read', () => {
    expect(describeCapability(capabilityOf({ transport: 'none' }))).toContain('simulated headset');
    expect(describeCapability(capabilityOf({ transport: 'usb', respondedAt: 1 }))).toContain(
      'real headset that was plugged in'
    );
    expect(
      describeCapability(capabilityOf({ transport: 'wifi', respondedAt: 1, worn: true }))
    ).toContain('while someone was wearing it');
  });
});

describe('guarding a claim', () => {
  it('refuses a hardware claim from a run that never reached hardware', () => {
    const cap = capabilityOf({ transport: 'usb', model: 'Quest 3' }); // listed, silent
    expect(() => requireTier(cap, 'attached', 'it holds 72 fps on the headset')).toThrow(
      /Cannot claim .* needs a attached headset and this run was synthetic/
    );
  });

  it('allows a claim the run actually earned', () => {
    const cap = capabilityOf({ transport: 'usb', respondedAt: 1 });
    expect(() => requireTier(cap, 'attached', 'it holds 72 fps')).not.toThrow();
    expect(() => requireTier(cap, 'synthetic', 'the panel opened')).not.toThrow();
    expect(() => requireTier(cap, 'worn', 'he looked at the drum')).toThrow(/worn headset/);
  });

  it('orders the tiers one way', () => {
    expect(TIER_ORDER).toEqual(['synthetic', 'attached', 'worn']);
    expect(atLeast('worn', 'synthetic')).toBe(true);
    expect(atLeast('synthetic', 'attached')).toBe(false);
    expect(atLeast('attached', 'attached')).toBe(true);
  });
});

describe('the synthetic device cannot promote itself', () => {
  it('always stamps its receipt synthetic, and says so in words', () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    headset.expect('the thing happens', () => true);

    const receipt = headset.witness();
    expect(receipt.ranOn).toBe('synthetic');
    expect(receipt.provenance).toContain('simulated headset');
  });

  it('carries the synthetic disclaimers, derived and not hand-written', () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const receipt = headset.witness();
    expect(receipt.doesNotProve).toEqual(SYNTHETIC_ONLY.doesNotProve);
  });

  it('offers no way to raise its own tier', () => {
    // The guarantee that makes elevated claims worth anything: there is no
    // argument, option or setter that makes this device report real hardware.
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    expect(headset.witness.length).toBe(0);

    const surface = [
      ...Object.getOwnPropertyNames(SyntheticHeadset.prototype),
      ...Object.keys(headset),
    ];
    expect(surface.filter((k) => /tier|attached|worn|elevat|promote/i.test(k))).toEqual([]);
  });
});
