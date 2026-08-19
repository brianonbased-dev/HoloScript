/**
 * sections.ts — the ensemble as independent players, addressed by attention.
 *
 * Founder direction (2026-08-14):
 *
 *   "it should be each instrument is independent and the specific ways of
 *    moving hands depends on solos and playing together. sometimes there are
 *    over 100 instruments."
 *
 * Three things follow from that sentence, and this module is those three things.
 *
 * 1. **Every section is an independent player.** Not a fixed pair of instruments
 *    wired to a fixed pair of hands. Each carries its own state and its own
 *    dynamic level, and one section changing must not disturb another.
 *
 * 2. **Addressing has to scale past the number of hands.** Two hands cannot
 *    select among a hundred sections. Attention can: you look at the section you
 *    are bringing in. Gaze is the conductor's real selector, and it costs
 *    nothing to add the hundred-and-first.
 *
 * 3. **The same gesture means different things depending on who is addressed.**
 *    A lift to one section swells one line and the rest yield under it — that is
 *    what a solo IS. The identical lift to the whole ensemble swells everything.
 *    Solo versus tutti is a property of the ADDRESS, not of the motion. Nothing
 *    here has a "solo gesture"; there is no such thing.
 *
 * Deliberately pure: no renderer, no audio node, no WebXR. Geometry is three
 * numbers per section. That is what makes a hundred sections cost nothing and
 * makes every rule below testable without a headset, a GPU, or a person.
 */

import { rayAngleTo, type Vec3 } from './cueing';
import type { Mat4 } from './math3';

// =============================================================================
// WHERE THE CONDUCTOR IS LOOKING
// =============================================================================

/**
 * The gaze ray, straight out of an XR view matrix.
 *
 * A view matrix V is the inverse of the camera's world transform, so its upper
 * 3x3 is R-transposed. The camera's world forward is -Z of R, which lands in V
 * at indices 2, 6 and 10 — NOT at 8, 9, 10, which is where the forward sits in
 * a model matrix (see `gripRay` in cueing.ts, which takes a model matrix and is
 * correct for that). Reading a view matrix as if it were a model matrix yields a
 * ray that is wrong by a transpose and points somewhere plausible, which is the
 * worst kind of wrong.
 */
export function gazeFromView(view: Mat4, camPos: Vec3): { origin: Vec3; dir: Vec3 } {
  const fx = -view[2];
  const fy = -view[6];
  const fz = -view[10];
  const len = Math.hypot(fx, fy, fz) || 1;
  return { origin: camPos, dir: [fx / len, fy / len, fz / len] };
}

// =============================================================================
// SECTIONS
// =============================================================================

export type SectionFamily =
  | 'strings'
  | 'woodwind'
  | 'brass'
  | 'percussion'
  | 'keyboard'
  | 'voice';

/**
 * What a section is doing right now.
 *
 * - `silent`   — not playing; waiting to be brought in.
 * - `following`— playing, following the beat.
 * - `soloing`  — playing, and everyone else has yielded under it.
 * - `held`     — frozen on a note, waiting for a cutoff or a release.
 */
export type SectionState = 'silent' | 'following' | 'soloing' | 'held';

export interface SectionSpec {
  readonly id: string;
  /** What a conductor would call it out loud: "second violins", "timpani". */
  readonly name: string;
  readonly family: SectionFamily;
  /** Where it sits in the room. This is the gaze target. */
  readonly at: Vec3;
}

export interface Section extends SectionSpec {
  state: SectionState;
  /** Dynamic, 0 (inaudible) to 1 (full). Meaningful only while playing. */
  level: number;
}

export type GestureKind = 'bring-in' | 'cut-off' | 'swell' | 'hush' | 'hold' | 'release';

/** Who a gesture is aimed at. */
export type Address =
  | { readonly kind: 'tutti' }
  | { readonly kind: 'section'; readonly id: string }
  | { readonly kind: 'family'; readonly family: SectionFamily };

export interface EnsembleEvent {
  readonly at: number;
  readonly gesture: GestureKind;
  readonly address: Address;
  /** Sections whose state or level actually changed. */
  readonly affected: readonly string[];
}

// =============================================================================
// TUNING
// =============================================================================

export interface EnsembleOptions {
  /**
   * Half-angle of the gaze cone, in radians. A conductor's address is not a
   * laser; 0.26 rad is about 15°, roughly what "looking at" means to a person.
   */
  gazeConeRad?: number;
  /**
   * How long the eyes must rest on a section before it counts as addressed.
   * Below this, a glance across the orchestra would re-address on every frame.
   */
  dwellMs?: number;
  /**
   * How long after looking away the address falls back to the whole ensemble.
   * A conductor who looks down at the score has not stopped addressing everyone.
   */
  releaseMs?: number;
  /** How far the unaddressed yield under a solo, as a fraction of their level. */
  yieldTo?: number;
}

const DEFAULTS = {
  gazeConeRad: 0.26,
  dwellMs: 250,
  releaseMs: 1200,
  yieldTo: 0.45,
} as const;

// =============================================================================
// THE ENSEMBLE
// =============================================================================

/**
 * A conductor's ensemble: many independent sections, addressed by gaze,
 * responding to gestures whose meaning depends on who they were aimed at.
 *
 * ```ts
 * const ensemble = new Ensemble();
 * ensemble.add({ id: 'vln1', name: 'first violins', family: 'strings', at: [-2, 1.2, -3] });
 * ensemble.add({ id: 'timp', name: 'timpani',       family: 'percussion', at: [0, 1.0, -4] });
 *
 * ensemble.look([0, 1.6, 0], dirTowards('vln1'), tNow);   // eyes settle
 * ensemble.gesture('bring-in', tNow);                     // only the violins enter
 * ```
 */
export class Ensemble {
  private readonly sections = new Map<string, Section>();
  private readonly opts: Required<EnsembleOptions>;

  /** Where attention currently rests. Tutti until the eyes settle somewhere. */
  private address: Address = { kind: 'tutti' };
  private candidate: { id: string; since: number } | null = null;
  private lastOnSection = -Infinity;

  readonly log: EnsembleEvent[] = [];

  constructor(options: EnsembleOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  add(spec: SectionSpec): Section {
    if (this.sections.has(spec.id)) {
      throw new Error(`Section "${spec.id}" is already in the ensemble.`);
    }
    const section: Section = { ...spec, state: 'silent', level: 0 };
    this.sections.set(spec.id, section);
    return section;
  }

  get(id: string): Section | undefined {
    return this.sections.get(id);
  }

  all(): Section[] {
    return [...this.sections.values()];
  }

  get size(): number {
    return this.sections.size;
  }

  /** Everyone currently making a sound. */
  playing(): Section[] {
    return this.all().filter((s) => s.state !== 'silent');
  }

  // ---------------------------------------------------------------------------
  // Addressing — where the conductor is looking
  // ---------------------------------------------------------------------------

  /**
   * Point the conductor's attention along a ray. Called every frame with the
   * head pose; the address only changes once the eyes have rested (`dwellMs`),
   * so sweeping a glance across the orchestra addresses nobody in passing.
   */
  look(origin: Vec3, direction: Vec3, atMs: number): Address {
    let nearest: { id: string; angle: number } | null = null;

    for (const section of this.sections.values()) {
      const angle = rayAngleTo(origin, direction, section.at);
      if (angle <= this.opts.gazeConeRad && (!nearest || angle < nearest.angle)) {
        nearest = { id: section.id, angle };
      }
    }

    if (!nearest) {
      // Looking at no one in particular. Attention widens back to everyone once
      // the eyes have been away long enough to mean it.
      this.candidate = null;
      if (atMs - this.lastOnSection >= this.opts.releaseMs) {
        this.address = { kind: 'tutti' };
      }
      return this.address;
    }

    this.lastOnSection = atMs;
    if (!this.candidate || this.candidate.id !== nearest.id) {
      this.candidate = { id: nearest.id, since: atMs };
    } else if (atMs - this.candidate.since >= this.opts.dwellMs) {
      this.address = { kind: 'section', id: nearest.id };
    }
    return this.address;
  }

  /**
   * Address a whole family — the gesture a conductor makes with an open hand
   * swept across the strings rather than a look at one desk.
   */
  addressFamily(family: SectionFamily): Address {
    this.address = { kind: 'family', family };
    this.candidate = null;
    return this.address;
  }

  /** Address everyone. */
  addressTutti(): Address {
    this.address = { kind: 'tutti' };
    this.candidate = null;
    return this.address;
  }

  /** Who the next gesture will reach. */
  addressed(): Address {
    return this.address;
  }

  /** The sections the next gesture will reach. */
  addressedSections(): Section[] {
    return this.resolve(this.address);
  }

  private resolve(address: Address): Section[] {
    switch (address.kind) {
      case 'tutti':
        return this.all();
      case 'family':
        return this.all().filter((s) => s.family === address.family);
      case 'section': {
        const one = this.sections.get(address.id);
        return one ? [one] : [];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Gestures — the same motion, different meaning per address
  // ---------------------------------------------------------------------------

  /**
   * Perform a gesture at whoever is currently addressed.
   *
   * The gesture argument carries no notion of solo or tutti, and it must not:
   * the conductor makes one lift, and whether it swells one line or the whole
   * orchestra is decided by where they were looking when they made it.
   *
   * @param magnitude 0..1 — how big the motion was. Beginners conduct big.
   */
  gesture(kind: GestureKind, atMs: number, magnitude = 1): EnsembleEvent {
    const targets = this.resolve(this.address);
    const affected: string[] = [];
    const amount = Math.max(0, Math.min(1, magnitude));

    switch (kind) {
      case 'bring-in':
        for (const s of targets) {
          if (s.state === 'silent') {
            s.state = 'following';
            s.level = Math.max(0.35, amount * 0.8);
            affected.push(s.id);
          }
        }
        break;

      case 'cut-off':
        for (const s of targets) {
          if (s.state !== 'silent') {
            s.state = 'silent';
            s.level = 0;
            affected.push(s.id);
          }
        }
        break;

      case 'swell': {
        // The whole point of this module. Aimed at everyone, it lifts everyone
        // and nobody solos. Aimed at fewer than everyone, the addressed rise and
        // the rest yield under them — which is what the word solo describes.
        const isPartial = targets.length > 0 && targets.length < this.playingOrAll().length;
        for (const s of targets) {
          if (s.state === 'silent') continue;
          s.level = Math.min(1, s.level + amount * 0.4);
          s.state = isPartial ? 'soloing' : 'following';
          affected.push(s.id);
        }
        if (isPartial) {
          const addressedIds = new Set(targets.map((s) => s.id));
          for (const other of this.playing()) {
            if (addressedIds.has(other.id)) continue;
            other.level = Math.max(0.05, other.level * this.opts.yieldTo);
            if (other.state === 'soloing') other.state = 'following';
            affected.push(other.id);
          }
        }
        break;
      }

      case 'hush':
        for (const s of targets) {
          if (s.state === 'silent') continue;
          s.level = Math.max(0.05, s.level - amount * 0.4);
          if (s.state === 'soloing') s.state = 'following';
          affected.push(s.id);
        }
        break;

      case 'hold':
        for (const s of targets) {
          if (s.state === 'following' || s.state === 'soloing') {
            s.state = 'held';
            affected.push(s.id);
          }
        }
        break;

      case 'release':
        for (const s of targets) {
          if (s.state === 'held') {
            s.state = 'following';
            affected.push(s.id);
          }
        }
        break;
    }

    const event: EnsembleEvent = {
      at: atMs,
      gesture: kind,
      address: this.address,
      affected: Object.freeze([...affected]),
    };
    this.log.push(event);
    return event;
  }

  /** Playing sections, or all of them when nobody has entered yet. */
  private playingOrAll(): Section[] {
    const playing = this.playing();
    return playing.length > 0 ? playing : this.all();
  }

  // ---------------------------------------------------------------------------
  // Reading back
  // ---------------------------------------------------------------------------

  /** True when exactly one section is raised above the others. */
  soloist(): Section | null {
    const soloing = this.all().filter((s) => s.state === 'soloing');
    return soloing.length === 1 ? soloing[0] : null;
  }

  /**
   * What the room is doing, in the words a person would use — for the HUD,
   * which field report 2 established must say the next MOTION and must never
   * be able to lie about a state it is no longer in.
   */
  describe(): string {
    const playing = this.playing();
    if (playing.length === 0) return 'Everyone is waiting for you to bring them in';

    const held = playing.filter((s) => s.state === 'held');
    if (held.length === playing.length) {
      return held.length === 1
        ? `The ${held[0].name} are holding for you`
        : 'They are all holding for you';
    }

    const solo = this.soloist();
    if (solo) return `The ${solo.name} are out in front`;

    return playing.length === this.size
      ? 'Everyone is playing together'
      : `${playing.length} of ${this.size} sections are playing`;
  }
}
