/**
 * API Gateway Traits
 * @version 1.0.0
 */
export const API_GATEWAY_TRAITS = [
  'graphql',            // GraphQL schema/resolver management
  'rest_endpoint',      // REST API endpoint definition
  'rpc',                // Remote procedure call handler
] as const;

export type ApiGatewayTraitName = (typeof API_GATEWAY_TRAITS)[number];
