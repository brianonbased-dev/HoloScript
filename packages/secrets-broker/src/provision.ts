/**
 * Device-flow provisioning + broker integration.
 *
 * Generalises the per-brain `HOLOMESH_API_KEY_<HANDLE>_X402` pattern into
 * a public service: pair once, server holds wallets/bearers, any surface
 * gets short-lived scoped capabilities per session.
 *
 * This module defines the **interface** for x402+broker provisioning.
 * A concrete adapter (e.g. `@holoscript/holoscript-agent/provision` or
 * a cloud HSM wrapper) implements the async `provisionAgent` call.
 *
 * @module secrets-broker/provision
 */

import { type DeviceFlowProvisionResult } from './types';

/**
 * Parameters for provisioning a new AI surface (mobile, desktop, headless).
 */
export interface ProvisionSurfaceInput {
  handle: string;
  surface: 'mobile' | 'desktop' | 'headless' | 'web' | string;
  meshApiBase?: string;
  founderBearer: string;
  autoJoinTeamId?: string;
}

/**
 * Provisioning adapter interface. Implementations may use:
 *   - `@holoscript/holoscript-agent` (local file-based wallets)
 *   - Cloud HSM (AWS KMS, GCP Cloud KMS)
 *   - Hardware wallet (Trezor, Ledger)
 *
 * The broker primitive does NOT mandate the storage backend.
 */
export interface ProvisionAdapter {
  provisionAgent(
    input: ProvisionSurfaceInput,
    opts: { execute: boolean; force?: boolean }
  ): Promise<DeviceFlowProvisionResult>;
}

/**
 * Create a brokered session after provisioning.
 *
 * 1. Provisions the surface (wallet + x402 bearer) via the adapter.
 * 2. Issues a brokered secret grant scoped to the surface's namespace.
 * 3. Returns both the provision result and the grant receipt.
 *
 * The secret material (private key, bearer token) NEVER leaves the
 * provision adapter. Only handles and receipts surface here.
 */
export async function provisionBrokeredSession(
  input: ProvisionSurfaceInput,
  opts: { execute: boolean; force?: boolean },
  adapter: ProvisionAdapter
): Promise<{
  provision: DeviceFlowProvisionResult;
}> {
  const provision = await adapter.provisionAgent(input, opts);
  if (provision.status !== 'executed' && provision.status !== 'reused') {
    throw new Error(`Provisioning failed for handle=${input.handle}`);
  }
  return { provision };
}

/**
 * Convenience builder for a local-file-based provision adapter.
 * Wraps the same shape as `@holoscript/holoscript-agent/src/provision.ts`
 * without creating a runtime dependency on that package.
 */
export function localFileProvisionAdapter(
  impl: (input: ProvisionSurfaceInput, opts: { execute: boolean; force?: boolean }) => Promise<DeviceFlowProvisionResult>
): ProvisionAdapter {
  return { provisionAgent: impl };
}
