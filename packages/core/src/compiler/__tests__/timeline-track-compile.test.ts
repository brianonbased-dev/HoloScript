/**
 * Compile-bridge tests for the keyframe-track timeline (Theatre.js harvest S4a).
 *
 * A `.hsplus` `timeline { track "<target>" { key <t> { <v> } [easing <e>] } }`
 * (HoloScriptPlusParser shape) must compile to the SAME `Timeline` +
 * `TimelineEntry` R3F node shape the existing `<TimelineDriver>` already plays —
 * one animate-entry per keyframe, grouped by the track target — so a keyframe
 * track actually DRIVES animation end-to-end.
 *
 * **See**: packages/core/src/compiler/SceneIRCompiler.ts (compileHsplusTimelineNode)
 */

import { describe, it, expect } from 'vitest';
import { SceneIRCompiler } from '../SceneIRCompiler';

function compileTimeline() {
  const node = {
    type: 'timeline',
    name: 'intro',
    properties: { autoplay: true, loop: false },
    children: [
      {
        type: 'track',
        target: 'scaleUniform',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 1, easing: 'spring' },
        ],
      },
    ],
  };
  // compileNode is the .hsplus recursion entry; it special-cases 'timeline'.
  return new SceneIRCompiler().compileNode(node as never);
}

describe('compileNode — .hsplus keyframe-track timeline', () => {
  it('produces a Timeline node the existing TimelineDriver consumes', () => {
    const tl = compileTimeline();
    expect(tl.type).toBe('Timeline');
    expect(tl.props.autoplay).toBe(true);
    expect(tl.children).toHaveLength(2); // one TimelineEntry per keyframe
  });

  it('emits one animate TimelineEntry per keyframe, grouped by track target', () => {
    const entries = compileTimeline().children ?? [];
    for (const e of entries) {
      expect(e.type).toBe('TimelineEntry');
      expect(e.props.actionKind).toBe('animate');
      expect(e.props.target).toBe('scaleUniform');
    }
    expect(entries[0].props.time).toBe(0);
    expect((entries[0].props.properties as { value: number }).value).toBe(0);
    expect(entries[1].props.time).toBe(1);
    expect((entries[1].props.properties as { value: number }).value).toBe(1);
  });

  it('carries per-keyframe easing onto the entry (driver honors it in S4b)', () => {
    const entries = compileTimeline().children ?? [];
    expect(entries[0].props.easing).toBeUndefined();
    expect(entries[1].props.easing).toBe('spring');
  });
});
