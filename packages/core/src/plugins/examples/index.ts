/**
 * Hololand Plugin Examples
 *
 * Example implementations demonstrating how to extend Hololand Platform features
 * with custom providers and processors.
 *
 * @version 1.0.0
 */

export { WeatherGovProvider, weatherGovPluginManifest } from './WeatherGovProvider';
export { CustomAIProvider, customAIPluginManifest } from './CustomAIProvider';
export { StripePaymentProcessor, stripePaymentPluginManifest } from './StripePaymentProcessor';

/**
 * Example plugin registration
 *
 * @example
 * ```typescript
 * import { getHololandRegistry } from '@holoscript/core';
 * import {
 *   WeatherGovProvider,
 *   CustomAIProvider,
 *   StripePaymentProcessor
 * } from '@holoscript/core/plugins/examples';
 *
 * const registry = getHololandRegistry();
 *
 * // Register Weather.gov VRR provider
 * const weatherProvider = new WeatherGovProvider();
 * await weatherProvider.initialize({
 *   providerId: 'weather-gov',
 *   displayName: 'Weather.gov'
 * });
 * registry.registerWeatherProvider(weatherProvider);
 *
 * // Register Custom AI provider
 * const aiProvider = new CustomAIProvider();
 * await aiProvider.initialize({
 *   providerId: 'custom-ai',
 *   displayName: 'Custom LLM',
 *   apiKey: process.env.AI_API_KEY,
 *   model: 'gpt-4',
 *   apiEndpoint: 'https://api.openai.com/v1/chat/completions'
 * });
 * registry.registerAIProvider(aiProvider);
 *
 * // Register Stripe payment processor
 * const stripeProcessor = new StripePaymentProcessor();
 * await stripeProcessor.initialize({
 *   processorId: 'stripe',
 *   displayName: 'Stripe',
 *   apiKey: process.env.STRIPE_SECRET_KEY,
 *   simulationMode: false
 * });
 * registry.registerPaymentProcessor(stripeProcessor);
 * ```
 */
