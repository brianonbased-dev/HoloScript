/**
 * Strict root-export declaration canary.
 *
 * This consumer intentionally imports only the package root and is compiled
 * with `skipLibCheck: false`. It catches duplicate declarations in the
 * hand-generated root bundle as well as drift from the parser's public value
 * and platform-constraint contracts.
 */

import type { HoloValue, PlatformConstraint } from '@holoscript/core';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type HoloValueMustRemainTyped = AssertFalse<IsAny<HoloValue>>;

const platformConstraint: PlatformConstraint = {
  include: ['quest3', 'desktop'],
  exclude: ['automotive'],
};

const value: HoloValue = {
  enabled: true,
  samples: [1, 2, null],
  source: {
    __bind: true,
    source: 'state.telemetry',
  },
};

void (null as unknown as HoloValueMustRemainTyped);
void platformConstraint;
void value;
