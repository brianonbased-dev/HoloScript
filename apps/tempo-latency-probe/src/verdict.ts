/**
 * verdict.ts — shared verdict logic for the probe and the Bravura room.
 *
 * Direction-aware bands. Slow-downs have a higher physical floor than
 * speed-ups under this metric: the evidence stroke arrives one NEW (slow)
 * period after the last old-tempo beat, and the ensemble's next possible
 * sound is a further slow period later (proven in the click log: click 83 ms
 * before the slow stroke, next click one slow period on, 52 ms off the
 * second stroke). Floor ≈ 2.0 beats; green sits just above it. Speed-ups
 * have no second-period cost: green ≤ 1.25.
 */

export interface TrialLike {
  fromBpm: number;
  toBpm: number;
  latencyBeats: number | null;
}

export const BANDS_NOTE =
  'per-direction design targets (no industry standard exists): speed-up green ≤1.25 beats / amber ≤2.5; slow-down green ≤2.2 / amber ≤3.0 (physical floor ≈2.0 — the ensemble has just played and its next sound is one slow period out; see clickLog)';

export function trialVerdict(tr: TrialLike): 'good' | 'warn' | 'bad' {
  const b = tr.latencyBeats as number;
  const slowdown = tr.toBpm < tr.fromBpm;
  const green = slowdown ? 2.2 : 1.25;
  const amber = slowdown ? 3.0 : 2.5;
  if (b <= green) return 'good';
  if (b <= amber) return 'warn';
  return 'bad';
}

export function verdictFor(trials: TrialLike[]): { text: string; cls: string } {
  const done = trials.filter((t) => t.latencyBeats !== null);
  if (done.length === 0)
    return {
      text: 'No tempo-change trials were completed — wave steadily, then clearly change speed.',
      cls: 'unknown',
    };
  const verdicts = done.map(trialVerdict);
  if (verdicts.every((v) => v === 'good'))
    return {
      text: 'The ensemble follows you — within about a beat speeding up, and as fast as physics allows slowing down. This will feel like conducting.',
      cls: 'good',
    };
  if (verdicts.some((v) => v === 'bad'))
    return {
      text: 'Too slow to feel like conducting. Engineering needed before the game is fun.',
      cls: 'bad',
    };
  return {
    text: 'The ensemble is a couple of beats behind. Playable, needs tightening.',
    cls: 'warn',
  };
}
