export { createReservationHandler, type ReservationConfig, type ReservationStatus } from './traits/ReservationTrait';
export { createItineraryHandler, type ItineraryConfig, type ItineraryItem } from './traits/ItineraryTrait';
export { createRateManagementHandler, type RateManagementConfig, type RatePeriod } from './traits/RateManagementTrait';
export * from './traits/types';

import { createReservationHandler } from './traits/ReservationTrait';
import { createItineraryHandler } from './traits/ItineraryTrait';
import { createRateManagementHandler } from './traits/RateManagementTrait';

export const pluginMeta = { name: '@holoscript/plugin-travel-hospitality', version: '1.0.0', traits: ['reservation', 'itinerary', 'rate_management'] };
export const traitHandlers = [createReservationHandler(), createItineraryHandler(), createRateManagementHandler()];
