#!/usr/bin/env node
/**
 * Print the honest HoloEmbed lane receipt (not a neural-model claim).
 * Requires a prior `pnpm --filter @holoscript/holoembed build`.
 */
import { describeHoloEmbedLane } from '../dist/index.js';

const lane = describeHoloEmbedLane();
if (lane.neuralModel !== false || lane.algorithm !== 'structural+char-trigram' || lane.dim !== 768) {
  console.error(JSON.stringify(lane, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(lane, null, 2));
