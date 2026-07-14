import {
  RADIO_ASTRONOMY_TRAITS,
  type RadioAstronomyTraitName,
} from './constants/astronomy-traits.js';
import { PythonAstropyBridge, type AstropyResult } from './bridge/python-runner.js';

/**
 * @holoscript/radio-astronomy-plugin
 *
 * Domain plugin bridging Radio Astrophysics simulation concepts into the HoloScript Universal pipeline.
 * Extends standard traits without bloating core. Provides an astropy python bridge for logic evaluation.
 */

// Export vocabulary
export { RADIO_ASTRONOMY_TRAITS, type RadioAstronomyTraitName };

// Export Bridges
export { PythonAstropyBridge, type AstropyResult };

// Export FITS parsing. The React/R3F viewer is intentionally not a root export:
// cold consumers should not need browser UI peers to load the plugin vocabulary.
export { parseFITS, buildFITS, type FITSFile, type WCSInfo } from './fits/FITSParser.js';
export { fitsToGrid3D, extractChannel, fitsDataRange } from './fits/FITSToGrid.js';

/**
 * Metadata exposing domain capabilities to the Studio / Schema Mapper.
 */
export const DOMAIN_MANIFEST = {
  id: 'domain.science.astronomy.radio',
  name: 'Radio Astronomy Plugin',
  version: '1.0.0',
  description: 'Extends HoloScript spatial environments with radio astrophysics primitives.',
  keywords: ['interferometer', 'radio emitting', 'synchrotron radiation', 'pulsar'],
  traits: RADIO_ASTRONOMY_TRAITS,
};
