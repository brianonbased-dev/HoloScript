/**
 * fashion-runway.scenario.ts — LIVING-SPEC: Fashion Runway Choreographer
 *
 * Persona: Valentina — fashion show director who choreographs model walks,
 * camera cuts, and garment physics for high-end runway shows.
 */

import { describe, it, expect } from 'vitest';
import {
  pathLength, walkDuration, modelPositionAtTime,
  cameraSequenceDuration, activeCameraAtTime, cutCountByAngle,
  fabricSwayFactor, trainDragAdjustment, showTotalDuration,
  type ModelProfile, type RunwayPath, type CameraCut, type ShowSegment,
} from '@/lib/fashionRunway';

describe('Scenario: Fashion Runway — Walk Path', () => {
  const model: ModelProfile = { id: 'm1', name: 'Elena', walkStyle: 'editorial', walkSpeedMPS: 1.2, heightCm: 180, outfitIds: ['o1'] };
  const path: RunwayPath = {
    id: 'p1', waypoints: [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 0 }],
    pausePoints: [{ x: 0, y: 20 }], pauseDurationSec: 3, totalLengthM: 40,
  };

  it('pathLength() sums waypoint distances', () => {
    expect(pathLength(path.waypoints)).toBe(40);
  });

  it('walkDuration() includes walk time + pauses', () => {
    const dur = walkDuration(path, model);
    expect(dur).toBeCloseTo(40 / 1.2 + 3, 1); // 33.3 + 3 = ~36.3s
  });

  it('modelPositionAtTime() interpolates along path', () => {
    const pos = modelPositionAtTime(path, model, 5);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.y).toBeLessThan(20);
  });

  it('modelPositionAtTime() returns end at completion', () => {
    const pos = modelPositionAtTime(path, model, 999);
    expect(pos).toEqual({ x: 0, y: 0 }); // back to start
  });
});

describe('Scenario: Fashion Runway — Camera', () => {
  const cuts: CameraCut[] = [
    { id: 'c1', angle: 'front', startTimeSec: 0, durationSec: 5, targetModelId: 'm1', zoom: 1, transition: 'cut' },
    { id: 'c2', angle: 'close-up', startTimeSec: 5, durationSec: 3, targetModelId: 'm1', zoom: 2.5, transition: 'dissolve' },
    { id: 'c3', angle: 'side', startTimeSec: 8, durationSec: 4, targetModelId: 'm1', zoom: 1.5, transition: 'pan' },
  ];

  it('cameraSequenceDuration() returns total length', () => {
    expect(cameraSequenceDuration(cuts)).toBe(12);
  });

  it('activeCameraAtTime() returns correct cut', () => {
    expect(activeCameraAtTime(cuts, 2)!.angle).toBe('front');
    expect(activeCameraAtTime(cuts, 6)!.angle).toBe('close-up');
    expect(activeCameraAtTime(cuts, 10)!.angle).toBe('side');
  });

  it('activeCameraAtTime() returns null outside sequence', () => {
    expect(activeCameraAtTime(cuts, 15)).toBeNull();
  });

  it('cutCountByAngle() tallies each angle', () => {
    const counts = cutCountByAngle(cuts);
    expect(counts.front).toBe(1);
    expect(counts['close-up']).toBe(1);
    expect(counts.side).toBe(1);
    expect(counts.overhead).toBe(0);
  });
});

describe('Scenario: Fashion Runway — Garment Physics', () => {
  it('flowing fabric has highest sway (0.8)', () => {
    expect(fabricSwayFactor('flowing')).toBe(0.8);
  });

  it('rigid fabric has minimal sway (0.05)', () => {
    expect(fabricSwayFactor('rigid')).toBe(0.05);
  });

  it('trainDragAdjustment() increases with length and speed', () => {
    const short = trainDragAdjustment(0.5, 1.2);
    const long = trainDragAdjustment(2.0, 1.5);
    expect(long).toBeGreaterThan(short);
  });

  it('showTotalDuration() sums all segments', () => {
    const segments: ShowSegment[] = [
      { id: 's1', name: 'Opening', models: [], musicTrack: '', bpm: 120, durationSec: 180, lightingCue: '' },
      { id: 's2', name: 'Finale', models: [], musicTrack: '', bpm: 130, durationSec: 120, lightingCue: '' },
    ];
    expect(showTotalDuration(segments)).toBe(300);
  });

  it.todo('cloth simulation — real-time fabric draping on walking model');
  it.todo('audience reaction heatmap — track visual attention zones');
});
