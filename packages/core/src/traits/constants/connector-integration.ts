/**
 * Connector Integration Traits
 * 
 * Traits for connecting HoloScript compositions to external services,
 * managing environment variables, and defining deployment targets.
 */

export const CONNECTOR_INTEGRATION_TRAITS = [
  'connector',           // @connector(moltbook)
  'env',                 // @env(GITHUB_TOKEN, required: true)
  'deploy',              // @deploy(railway, service: "mcp-server")
  'on_connector_event',  // Event subscription for connector events
] as const;

export type ConnectorIntegrationTraitName = (typeof CONNECTOR_INTEGRATION_TRAITS)[number];

export const KNOWN_CONNECTORS = [
  'railway', 'github', 'moltbook', 'upstash', 'appstore', 'vscode',
] as const;

export type KnownConnector = (typeof KNOWN_CONNECTORS)[number];

/**
 * Required environment variables for each known connector.
 * Used for compile-time and startup validation.
 */
export const CONNECTOR_ENV_REQUIREMENTS: Record<KnownConnector, string[]> = {
  railway: ['RAILWAY_API_TOKEN'],
  github: ['GITHUB_TOKEN'],
  moltbook: ['MOLTBOOK_API_KEY'],
  upstash: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  appstore: [],
  vscode: [],
};

/**
 * Map of known connectors to their respective npm packages.
 */
export const CONNECTOR_PACKAGES: Record<KnownConnector, string> = {
  railway: '@holoscript/connector-railway',
  github: '@holoscript/connector-github',
  moltbook: '@holoscript/connector-moltbook',
  upstash: '@holoscript/connector-upstash',
  appstore: '@holoscript/connector-appstore',
  vscode: '@holoscript/connector-vscode',
};

/**
 * Map of known connectors to their exported class names.
 * Used by the compiler to generate import statements.
 */
export const CONNECTOR_CLASSES: Record<KnownConnector, string> = {
  railway: 'RailwayConnector',
  github: 'GitHubConnector',
  moltbook: 'MoltbookConnector',
  upstash: 'UpstashConnector',
  appstore: 'AppStoreConnector',
  vscode: 'VSCodeConnector',
};
