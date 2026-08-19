/**
 * capability.ts — what the machine may claim, given what is actually plugged in.
 *
 * Founder, 2026-08-18: *"would be nice for machine to have elevated capabilities
 * when the headset is plugged in."*
 *
 * Right, and the important half is the word *earned*. A synthetic device proves
 * a great deal — that input arrives, that poses are shaped correctly, that the
 * thing the human asked for happened. It cannot prove a single pixel, a frame
 * time, or a moment of comfort. Plug a real headset in and some of those become
 * provable. Which ones, exactly, is what this file decides.
 *
 * The ladder runs one way and only one way: capability is **measured, never
 * assumed**. The dangerous direction is not under-claiming — it is a receipt
 * that says "proven on real hardware" for a run that quietly fell back to
 * simulation. That failure has a long history in this ecosystem (a route that
 * reports success and does nothing), so every rung here requires evidence that
 * the device answered, not evidence that it was listed.
 *
 * Pure by construction: this module performs no I/O. The caller does the
 * probing and passes in what it actually observed, so the rules below can be
 * tested exhaustively without a headset, and so nothing here can be fooled by
 * a shell command that exits zero having done nothing.
 */

// =============================================================================
// THE LADDER
// =============================================================================

/**
 * How much reality was behind a run.
 *
 * - `synthetic` — no hardware. A machine-worn device at `navigator.xr`.
 * - `attached`  — a real headset answered a round trip. Real silicon, real
 *                 tracking pipeline, real frames.
 * - `worn`      — a real headset that is on a person's head right now.
 */
export type HeadsetTier = 'synthetic' | 'attached' | 'worn';

export const TIER_ORDER: readonly HeadsetTier[] = ['synthetic', 'attached', 'worn'];

export function atLeast(tier: HeadsetTier, required: HeadsetTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(required);
}

/**
 * What a probe actually observed. Every field is an observation, not a belief.
 *
 * Note what is NOT here: "device is listed". A headset that appears in a device
 * list and never answers is not attached — it is a name in a table. `adb
 * devices` happily lists units in `offline` and `unauthorized` states, and a
 * CLI that fails by exiting zero will list nothing at all while looking healthy.
 */
export interface HeadsetProbe {
  /** How the device is reached. `none` means nothing answered. */
  readonly transport: 'none' | 'usb' | 'wifi';
  /**
   * Evidence the device completed a ROUND TRIP — a command sent and a reply
   * read. Absent means no reply was seen, whatever the device list said.
   */
  readonly respondedAt?: number;
  readonly serial?: string;
  /** Device model as the device reported it, never as we assumed it. */
  readonly model?: string;
  /**
   * Proximity: the headset is on a head right now. Absent means unknown, which
   * is treated as "not worn" — the safe direction.
   */
  readonly worn?: boolean;
  /** Why the probe concluded what it did, for the receipt. */
  readonly notes?: readonly string[];
}

export interface Capability {
  readonly tier: HeadsetTier;
  /** What a receipt from a run at this tier is entitled to claim. */
  readonly proves: readonly string[];
  /** What it must still disclaim, in the words a non-developer reads. */
  readonly doesNotProve: readonly string[];
  /** Why this tier and not a higher one. Always populated. */
  readonly because: string;
}

// =============================================================================
// WHAT EACH RUNG BUYS
// =============================================================================

const PROVES: Record<HeadsetTier, readonly string[]> = Object.freeze({
  synthetic: Object.freeze([
    'the build starts a headset session and does not fall over',
    'it receives head, hand and controller movement in the shape hardware sends',
    'the thing that was asked for did or did not happen',
  ]),
  attached: Object.freeze([
    'the build starts a headset session and does not fall over',
    'it receives head, hand and controller movement in the shape hardware sends',
    'the thing that was asked for did or did not happen',
    'it runs on the real headset, with its real graphics chip',
    'what was actually drawn on the screens',
    'how fast it really runs, and whether it stays fast',
    'that real hand tracking — including the moments it drops — feeds it correctly',
  ]),
  worn: Object.freeze([
    'the build starts a headset session and does not fall over',
    'it receives head, hand and controller movement in the shape hardware sends',
    'the thing that was asked for did or did not happen',
    'it runs on the real headset, with its real graphics chip',
    'what was actually drawn on the screens',
    'how fast it really runs, and whether it stays fast',
    'that real hand tracking — including the moments it drops — feeds it correctly',
    'where a real person actually looked, and how they really moved',
    'that it works at the height and reach of the person wearing it',
  ]),
});

const DOES_NOT_PROVE: Record<HeadsetTier, readonly string[]> = Object.freeze({
  synthetic: Object.freeze([
    'that anything was drawn correctly — there is no graphics card in this test',
    'how fast or how hot it runs on a real headset',
    'that real hand tracking behaves the way this stood in for it',
    'that it is comfortable, or that a person would enjoy it',
  ]),
  attached: Object.freeze([
    'that a person would find it clear, comfortable or worth doing',
    'anything about where a real human looks or how they really move',
  ]),
  worn: Object.freeze([
    // Even here, one thing is never ours to say. A person telling you it felt
    // wrong is data; a machine deciding it felt right is not.
    'whether the person wearing it liked it — only they can say that',
  ]),
});

// =============================================================================
// DECIDING THE TIER
// =============================================================================

/**
 * Decide what a run may claim, from what the probe actually saw.
 *
 * The rules, in order, and each one exists because the opposite has bitten:
 *
 * - No transport → `synthetic`. Nothing to be clever about.
 * - Transport but **no round trip** → `synthetic`. A listed device is not a
 *   reachable one; `adb devices` lists `offline` and `unauthorized` units, and
 *   an ssh failure reads identically to the box being down.
 * - Round trip → `attached`.
 * - Round trip **and** proximity says it is on a head → `worn`. Unknown
 *   proximity is treated as not worn, because the cost of guessing wrong is a
 *   receipt claiming a person was there when nobody was.
 */
export function capabilityOf(probe: HeadsetProbe): Capability {
  const tier = tierOf(probe);
  return Object.freeze({
    tier,
    proves: PROVES[tier],
    doesNotProve: DOES_NOT_PROVE[tier],
    because: reasonFor(probe, tier),
  });
}

function tierOf(probe: HeadsetProbe): HeadsetTier {
  if (probe.transport === 'none') return 'synthetic';
  if (typeof probe.respondedAt !== 'number') return 'synthetic';
  return probe.worn === true ? 'worn' : 'attached';
}

function reasonFor(probe: HeadsetProbe, tier: HeadsetTier): string {
  if (tier === 'synthetic') {
    if (probe.transport === 'none') {
      return 'No headset is plugged in, so this ran on a machine-worn device.';
    }
    return (
      `A headset was listed over ${probe.transport} but never answered, so this ran ` +
      `on a machine-worn device. A device that does not reply is not a device you have.`
    );
  }

  const name = probe.model ?? 'a headset';
  if (tier === 'attached') {
    return `${name} answered over ${probe.transport}, so this ran on the real hardware.`;
  }
  return `${name} answered over ${probe.transport} and is on someone's head right now.`;
}

/** The capability of having nothing plugged in. */
export const SYNTHETIC_ONLY: Capability = capabilityOf({ transport: 'none' });

// =============================================================================
// GUARDING A CLAIM
// =============================================================================

/**
 * Throw unless the run reached the tier a claim requires.
 *
 * Call this at the point a receipt, a gate or a report is about to assert
 * something — not at the point the work starts. The failure that matters is a
 * claim made about hardware that was never there, and it is made at write time.
 */
export function requireTier(
  capability: Capability,
  required: HeadsetTier,
  claim: string
): void {
  if (atLeast(capability.tier, required)) return;
  throw new Error(
    `Cannot claim "${claim}": that needs a ${required} headset and this run was ` +
      `${capability.tier}. ${capability.because}`
  );
}

/**
 * A one-line, plain-language statement of what stood behind a run — the
 * sentence that belongs at the top of any receipt a person reads, so that
 * "proven" is never ambiguous about which kind of proven.
 */
export function describeCapability(capability: Capability): string {
  switch (capability.tier) {
    case 'synthetic':
      return `Run by a machine on a simulated headset. ${capability.because}`;
    case 'attached':
      return `Run on a real headset that was plugged in. ${capability.because}`;
    case 'worn':
      return `Run on a real headset while someone was wearing it. ${capability.because}`;
  }
}
