/**
 * World Portal Trait
 *
 * Declares "scan a QR → enter a HoloScript world" as DATA (F.126). A decoded QR whose text matches
 * one of `link_patterns` is a WORLD link (not a browser link): instead of opening the Quest browser,
 * the app immerses the user into that world (passthrough off + a themed world backdrop) while the
 * passthrough camera keeps decoding — so real QRs still scan inside the world (the Camera2 feed is
 * the physical cameras, independent of what is rendered). Scanning another world link hops worlds.
 *
 * The handler holds no platform code; the Quest compile target walks this trait and emits the native
 * Meta Spatial SDK portal logic (WorldPortal.kt + the IN_WORLD activity/panel paths).
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface WorldPortalTrustConfig {
  /** Admit bundled worlds, signed remote worlds, or both. */
  policy: 'bundled_only' | 'signed_only' | 'bundled_or_signed';
  /** Signature algorithm required for remote world manifests. */
  signature_algorithm: 'ed25519';
  /** Bundled worlds are trusted because their source is compiled into the APK. */
  allow_bundled: boolean;
  /** Fail closed when a remote world link lacks a valid trusted signature. */
  require_signature_for_remote: boolean;
  /** Base64 X.509 Ed25519 public keys admitted by the application declaration. */
  trusted_public_keys: string[];
}

export interface WorldPortalConfig {
  /** Decoded-QR prefixes that mark a world link (matched case-insensitively). */
  link_patterns: string[];
  /** Enter the world automatically on a world-link read (vs. showing an "Enter world" card). */
  auto_immerse: boolean;
  /** Keep the passthrough camera decoding inside a world (scan real QRs while immersed; hop worlds). */
  keep_scanning: boolean;
  /** Transient label shown while entering, e.g. "Entered {world}". */
  entering_label: string;
  /** Label for the in-world control that returns to passthrough scanning. */
  leave_action: string;
  /** Demo world link used by the tutorial / onboarding copy. */
  demo_world_url: string;
  /** Admission policy for bundled and remote world portals. */
  trust?: WorldPortalTrustConfig;
}

// =============================================================================
// HANDLER
// =============================================================================

export const worldPortalHandler: TraitHandler<WorldPortalConfig> = {
  name: 'world_portal',

  defaultConfig: {
    link_patterns: [
      'holoscript://world/',
      'https://holoscript.studio/w/',
      'https://hololand.holoscript.studio/',
    ],
    auto_immerse: false,
    keep_scanning: true,
    entering_label: 'Entered',
    leave_action: 'Leave world',
    demo_world_url: 'holoscript://world/hololand',
    trust: {
      policy: 'bundled_or_signed',
      signature_algorithm: 'ed25519',
      allow_bundled: true,
      require_signature_for_remote: true,
      trusted_public_keys: [],
    },
  },

  onAttach(node, _config, context) {
    context.emit?.('portal:mount', { node: node.id });
  },

  onEvent(node, _config, context, event) {
    if (event.type === 'qr:result') {
      context.emit?.('portal:maybe_enter', { node: node.id, text: event.payload?.text });
    }
  },
};

export default worldPortalHandler;
