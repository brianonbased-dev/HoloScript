export { createReservationHandler, type ReservationConfig, type ReservationStatus } from './traits/ReservationTrait';
export { createItineraryHandler, type ItineraryConfig, type ItineraryItem } from './traits/ItineraryTrait';
export { createRateManagementHandler, type RateManagementConfig, type RatePeriod } from './traits/RateManagementTrait';
export * from './traits/types';

import { createReservationHandler } from './traits/ReservationTrait';
import { createItineraryHandler } from './traits/ItineraryTrait';
import { createRateManagementHandler } from './traits/RateManagementTrait';

export * from './revenuemanagement';

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic RevPAR analytic solver into HoloScriptRuntime's dispatch. Closes
// the built-but-dead-wired gap for `revpar`, mirroring government-civic's
// `civic_decision` reference integration.
export {
  TRAVEL_HOSPITALITY_PLUGIN_ID,
  revparHandler,
  registerTravelHospitalityTraitHandlers,
  type RevparTraitConfig,
  type RevparSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';

export const pluginMeta = { name: '@holoscript/plugin-travel-hospitality', version: '1.0.0', traits: ['reservation', 'itinerary', 'rate_management', 'emsr_yield', 'revpar', 'overbooking', 'group_displacement', 'demand_forecast'] };
export const traitHandlers = [createReservationHandler(), createItineraryHandler(), createRateManagementHandler()];
