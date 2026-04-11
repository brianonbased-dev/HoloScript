export { createMarketplaceListingHandler, type MarketplaceListingConfig, type ListingStatus, type PricingModel } from './traits/MarketplaceListingTrait';
export { createRoyaltyStreamHandler, type RoyaltyStreamConfig, type RoyaltySplit } from './traits/RoyaltyStreamTrait';
export { createAgentOwnedEntityHandler, type AgentOwnedEntityConfig } from './traits/AgentOwnedEntityTrait';
export { createFoundationDAOHandler, type FoundationDAOConfig, type FoundationDAOState, type Proposal } from './traits/FoundationDAOTrait';
export * from './traits/types';

import { createMarketplaceListingHandler } from './traits/MarketplaceListingTrait';
import { createRoyaltyStreamHandler } from './traits/RoyaltyStreamTrait';
import { createAgentOwnedEntityHandler } from './traits/AgentOwnedEntityTrait';
import { createFoundationDAOHandler } from './traits/FoundationDAOTrait';

export const pluginMeta = { name: '@holoscript/plugin-economic-primitives', version: '1.0.0', traits: ['marketplace_listing', 'royalty_stream', 'agent_owned_entity', 'foundation_dao'] };
export const traitHandlers = [createMarketplaceListingHandler(), createRoyaltyStreamHandler(), createAgentOwnedEntityHandler(), createFoundationDAOHandler()];
