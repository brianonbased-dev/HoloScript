import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { R3FNode } from '@holoscript/core';
import { clearTimelineValue, getTimelineValue } from '../timelineRuntime';

const frameMock = vi.hoisted(() => ({
  callbacks: [] as Array<(state: { clock: { elapsedTime: number } }) => void>,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: { clock: { elapsedTime: number } }) => void) => {
    frameMock.callbacks.push(callback);
  },
}));

import { TimelineDriver } from '../TimelineDriver';

function timelineNode(children: R3FNode[]): R3FNode {
  return {
    id: 'timeline',
    type: 'Timeline',
    props: { autoplay: true, loop: false },
    children,
    traits: new Map(),
  } as R3FNode;
}

function entry(target: string, time: number, value: number, easing?: string): R3FNode {
  return {
    id: `${target}-${time}`,
    type: 'TimelineEntry',
    props: {
      time,
      actionKind: 'animate',
      target,
      properties: { value },
      ...(easing ? { easing } : {}),
    },
    children: [],
    traits: new Map(),
  } as R3FNode;
}

function tick(elapsedTime: number): void {
  frameMock.callbacks.at(-1)?.({ clock: { elapsedTime } });
}

afterEach(() => {
  frameMock.callbacks.length = 0;
  clearTimelineValue('scaleUniform');
  clearTimelineValue('legacySmooth');
});

describe('TimelineDriver easing consumption', () => {
  it('honors per-keyframe spring easing from compiler-emitted TimelineEntry props', () => {
    renderToStaticMarkup(
      <TimelineDriver node={timelineNode([entry('scaleUniform', 0, 0), entry('scaleUniform', 1, 1, 'spring')])} />
    );

    tick(0);
    tick(0.4);

    expect(getTimelineValue('scaleUniform', 0)).toBeGreaterThan(1);
  });

  it('keeps smoothstep as the legacy default when a keyframe has no easing', () => {
    renderToStaticMarkup(
      <TimelineDriver node={timelineNode([entry('legacySmooth', 0, 0), entry('legacySmooth', 1, 1)])} />
    );

    tick(0);
    tick(0.25);

    expect(getTimelineValue('legacySmooth', 0)).toBeCloseTo(0.15625);
  });
});
