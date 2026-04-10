import { RADIO_ASTRONOMY_TRAITS, RadioAstronomyTraitName } from './constants/astronomy-traits';
import { PythonAstropyBridge, AstropyResult } from './bridge/python-runner';

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
