/**
 * Built-package declaration smoke fixture.
 *
 * Compile this file against @holoscript/core after `pnpm --filter
 * @holoscript/core build`; importing the source tree would not catch drift in
 * the hand-generated dist/index.d.ts surface.
 */

import {
  HoloContainmentPerceptionError,
  perceiveContainmentIR,
  type HoloContainmentPerceptionErrorCode,
  type HoloPerceivedContainmentIR,
} from '@holoscript/core';

const ir: HoloPerceivedContainmentIR = perceiveContainmentIR(
  'composition "TypedConsumer" { object "entity" {} }',
  {
    sourceId: 'typed-consumer.holo',
    query: { object: 'entity' },
  }
);

const digest: string = ir.perception.sourceDigest;
const entityId: string = ir.entities[0].id;

try {
  perceiveContainmentIR('not valid .holo');
} catch (error) {
  if (error instanceof HoloContainmentPerceptionError) {
    const code: HoloContainmentPerceptionErrorCode = error.code;
    void code;
  }
}

void digest;
void entityId;
