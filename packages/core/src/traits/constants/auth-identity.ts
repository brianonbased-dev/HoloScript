/**
 * Auth / Identity Traits
 *
 * Authentication and authorization primitives — JWT, OAuth, API keys,
 * sessions, permissions, and multi-factor authentication.
 *
 * @version 1.0.0
 */
export const AUTH_IDENTITY_TRAITS = [
  // ─── Token Authentication ─────────────────────────────────────────
  'jwt', // JWT issue / verify / refresh
  'oauth', // OAuth 2.0 authorization code / token flow
  'api_key', // API key generation and validation

  // ─── Session & Access ─────────────────────────────────────────────
  'session', // Session create / destroy / refresh
  'permission', // Role-based permission checks
  'mfa', // Multi-factor authentication (TOTP / SMS / WebAuthn)
] as const;

export type AuthIdentityTraitName = (typeof AUTH_IDENTITY_TRAITS)[number];
