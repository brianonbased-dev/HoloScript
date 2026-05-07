/**
 * Creator module — HoloLand playable-template pipeline + kiosk surface.
 *
 * task_1778186605462_muzd
 */

export {
  // Compiler/runtime hooks
  compileTemplateToChallenge,
  submitForReview,
  approveChallenge,
  rejectChallenge,
  resetCreatorRegistry,
  getCreatorRegistry,
  listPublishedChallenges,
  getPublishedChallenge,
  getKioskSlice,
} from './template-pipeline';

export type {
  CompileOptions,
  KioskSlice,
} from './template-pipeline';

export {
  // Kiosk presentation
  buildKioskCard,
  paginateKioskCards,
  kioskSearch,
  kioskFeatured,
} from './kiosk';

export type {
  KioskCard,
  KioskGrid,
} from './kiosk';
