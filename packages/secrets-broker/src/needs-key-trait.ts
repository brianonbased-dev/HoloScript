/**
 * `@needs_key` — HoloKey's HoloScript-native trait: secrets as composable capabilities.
 *
 * This is the differentiating piece of HoloKey (the custody axis of HoloGate). A
 * HoloScript object declares the keys it needs as a TRAIT — the source carries only
 * the audit-safe REF, never the value:
 *
 *   object "BrittneyCall" @needs_key { ref: "vault:OPENAI_API_KEY", purpose: "llm-call" }
 *
 * At runtime the trait resolves the secret AT USE-TIME through HoloKey's fail-closed,
 * owner-bound resolver (`secret-resolver.ts`) and stashes the plaintext TRANSIENTLY on
 * the in-memory node carrier (`node.__resolvedSecrets[ref]`) for sibling traits on the
 * same node to consume — it is NEVER written to durable runtime state and NEVER placed
 * in an emitted event payload.
 *
 * Wiring is the same `registerTrait(name, handler)` seam the domain-plugin traits use,
 * so a runtime that has registered `@needs_key` dispatches it like any other trait. The
 * app binds the resolver + the AUTHENTICATED OWNER (from a Studio session / Fleet seat)
 * when it registers the trait — so a runtime with no authenticated owner FAILS CLOSED:
 * the trait emits `needs_key_denied`, no secret is resolved.
 *
 * Events (none carry the value):
 *   - `needs_key_ready`  { nodeId, ref, purpose }   — secret resolved + stashed for siblings.
 *   - `needs_key_denied` { nodeId, ref, reason }    — fail-closed (unauthenticated / not_owner / not_found / decrypt_failed).
 *   - `needs_key_error`  { nodeId, error }          — malformed config (missing ref).
 *
 * @module secrets-broker/needs-key-trait
 */

import { DecryptError, OwnerMismatchError, SecretNotFoundError } from './secret-store';
import type { SecretRef } from './types';
import { AuthRequiredError, type SecretResolver } from './secret-resolver';

/** Config carried by an orb's `@needs_key` directive. `ref` is required (`vault:<name>`). */
export interface NeedsKeyConfig {
  ref?: SecretRef;
  /** Optional purpose recorded in the HoloKey resolve audit. */
  purpose?: string;
}

/**
 * The slice of the runtime trait-dispatch context `@needs_key` uses. `emit` is the
 * standard trait event sink; `provideSecret` (optional) lets the runtime route the
 * resolved value to sibling traits through a channel of its choosing — the trait also
 * always stashes it on `node.__resolvedSecrets` regardless.
 */
export interface NeedsKeyDispatchContext {
  emit(event: string, payload?: unknown): void;
  /** Optional: hand the resolved value to the runtime for same-node sibling use. */
  provideSecret?(ref: SecretRef, value: string): void;
}

/**
 * Binding the app supplies when registering the trait: the HoloKey resolver plus the
 * AUTHENTICATED owner for this runtime. `authenticatedOwnerId` MUST come from verified
 * server-side auth (Studio session subject / Fleet seat owner) — never user input. An
 * absent/empty owner makes every resolve fail closed.
 */
export interface NeedsKeyResolution {
  resolver: SecretResolver;
  authenticatedOwnerId?: string | null;
}

/** Structural trait handler shape (matches the domain-plugin trait handlers). */
export interface NeedsKeyTraitHandler {
  name: 'needs_key';
  onAttach(node: unknown, config: NeedsKeyConfig | undefined, context: NeedsKeyDispatchContext): Promise<void>;
  onUpdate(node: unknown, config: NeedsKeyConfig | undefined, context: NeedsKeyDispatchContext): Promise<void>;
}

/** In-memory node carrier for the transient resolved-secret slot. Never persisted. */
interface NeedsKeyNode {
  id?: string;
  name?: string;
  /** Transient, in-memory plaintext for sibling traits on this node. NEVER persisted/emitted. */
  __resolvedSecrets?: Record<string, string>;
}

/** Map a resolver error to an audit-safe, value-free denial reason. */
function denialReason(err: unknown): string {
  if (err instanceof AuthRequiredError) return 'unauthenticated';
  if (err instanceof OwnerMismatchError) return 'not_owner';
  if (err instanceof SecretNotFoundError) return 'not_found';
  if (err instanceof DecryptError) return 'decrypt_failed';
  return 'error';
}

/**
 * Create the `@needs_key` trait handler bound to a {@link NeedsKeyResolution}. The
 * handler resolves the declared ref through HoloKey at attach/update and stashes the
 * value transiently for sibling traits — fail-closed and value-free in all events.
 */
export function createNeedsKeyHandler(resolution: NeedsKeyResolution): NeedsKeyTraitHandler {
  async function resolveOnto(
    node: unknown,
    config: NeedsKeyConfig | undefined,
    context: NeedsKeyDispatchContext
  ): Promise<void> {
    const carrier = node as NeedsKeyNode;
    const nodeId = carrier.id ?? carrier.name ?? 'unknown';
    const ref = config?.ref;

    if (!ref) {
      context.emit('needs_key_error', {
        nodeId,
        error: 'needs_key trait requires config.ref (a vault:<name> SecretRef)',
      });
      return;
    }

    try {
      const { value } = await resolution.resolver.resolve({
        authenticatedOwnerId: resolution.authenticatedOwnerId,
        ref,
        purpose: config?.purpose,
      });
      // Transient, in-memory ONLY — for sibling traits on this node. Never persisted,
      // never emitted. The runtime's durable state never sees the plaintext.
      carrier.__resolvedSecrets = { ...(carrier.__resolvedSecrets ?? {}), [ref]: value };
      context.provideSecret?.(ref, value);
      // The "ready" signal carries the ref + purpose, NOT the value.
      context.emit('needs_key_ready', { nodeId, ref, purpose: config?.purpose ?? null });
    } catch (err) {
      // Fail closed: no value reached the node, and none is emitted.
      context.emit('needs_key_denied', { nodeId, ref, reason: denialReason(err) });
    }
  }

  return { name: 'needs_key', onAttach: resolveOnto, onUpdate: resolveOnto };
}

/** A runtime that can register behavioral trait handlers (e.g. HoloScriptRuntime). */
export interface TraitRegistrarTarget {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register the `@needs_key` trait into a runtime, bound to a resolver + authenticated
 * owner. After this, the runtime's directive dispatch resolves `@needs_key` orbs through
 * HoloKey at use-time. Mirrors the domain-plugin `register*TraitHandlers` shape.
 */
export function registerNeedsKeyTrait(
  registrar: TraitRegistrarTarget,
  resolution: NeedsKeyResolution
): void {
  registrar.registerTrait('needs_key', createNeedsKeyHandler(resolution));
}
