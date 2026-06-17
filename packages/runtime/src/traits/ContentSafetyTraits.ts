import * as THREE from 'three';
import { TraitHandler, TraitContext } from './TraitSystem';

// ============================================================================
// Moderation Trait
// Server-gated content moderation with client-side violation escalation.
// ============================================================================

export const ModerationTrait: TraitHandler = {
  name: 'moderation',
  onApply: (context: TraitContext) => {
    context.data.violationCount = 0;
    context.data.cooldownExpiry = 0;
    context.data.isMuted = false;
    context.object.userData.moderated = true;
    context.object.userData.moderationAction = context.config.default_action ?? 'warn';
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.moderated;
    delete context.object.userData.moderationAction;
  },
};

// ============================================================================
// AntiGrief Trait
// Per-frame grief score accumulation with shield expiry and auto-report.
// ============================================================================

export const AntiGriefTrait: TraitHandler = {
  name: 'anti_grief',
  onApply: (context: TraitContext) => {
    context.data.griefScore = 0;
    context.data.killTimestamps = [] as number[];
    context.data.destructionTimestamps = [] as number[];
    context.data.reportTimestamps = [] as number[];
    context.data.shieldExpiry = 0;
    context.data.isShielded = false;
    context.object.userData.antiGrief = true;
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    const threshold = (context.config.threshold as number) ?? 10;
    const window = (context.config.time_window as number) ?? 30000;
    const now = Date.now();

    // Trim timestamps outside rolling window
    const prune = (arr: number[]) => arr.filter((t) => now - t < window);
    context.data.killTimestamps = prune(context.data.killTimestamps as number[]);
    context.data.destructionTimestamps = prune(context.data.destructionTimestamps as number[]);
    context.data.reportTimestamps = prune(context.data.reportTimestamps as number[]);

    const kills = (context.data.killTimestamps as number[]).length;
    const destructions = (context.data.destructionTimestamps as number[]).length;
    const reports = (context.data.reportTimestamps as number[]).length;
    context.data.griefScore = kills + destructions + reports * 2;

    // Expire shield
    const expiry = context.data.shieldExpiry as number;
    if (expiry > 0 && now > expiry) {
      context.data.shieldExpiry = 0;
      context.data.isShielded = false;
      context.object.userData.antiGriefShielded = false;
    }

    // Auto-report if threshold crossed
    if ((context.data.griefScore as number) >= threshold && context.config.auto_report) {
      context.object.userData.antiGriefAutoReported = true;
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.antiGrief;
    delete context.object.userData.antiGriefShielded;
    delete context.object.userData.antiGriefAutoReported;
  },
};

// ============================================================================
// TokenGated Trait
// Hide/blur/lock content until a bearer token or NFT balance is verified.
// ============================================================================

function applyTokenFallback(context: TraitContext, lock: boolean): void {
  const fallback = (context.config.fallback_behavior as string) ?? 'hide';
  if (fallback === 'hide') {
    context.object.visible = !lock;
  } else if (fallback === 'blur' || fallback === 'lock') {
    const mesh = context.object as THREE.Mesh;
    if (mesh.material && 'opacity' in mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (lock) {
        context.data.originalOpacity = mat.opacity ?? 1;
        mat.transparent = true;
        mat.opacity = 0.15;
      } else {
        mat.opacity = (context.data.originalOpacity as number) ?? 1;
      }
    }
  }
  context.object.userData.tokenGated = lock;
}

export const TokenGatedTrait: TraitHandler = {
  name: 'token_gated',
  onApply: (context: TraitContext) => {
    context.data.isVerified = false;
    context.data.hasAccess = false;
    context.data.lastVerifyTime = 0;
    // Apply fallback immediately until verified
    applyTokenFallback(context, true);
    // Signal external verifier
    context.object.userData.tokenGateNeedsVerify = true;
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    if (!(context.data.hasAccess as boolean)) return;
    const interval = (context.config.verify_interval as number) ?? 0;
    if (interval <= 0) return;
    const now = Date.now();
    if (now - (context.data.lastVerifyTime as number) > interval * 1000) {
      context.data.lastVerifyTime = now;
      context.object.userData.tokenGateNeedsVerify = true;
    }
  },
  onRemove: (context: TraitContext) => {
    // Restore visibility on detach
    applyTokenFallback(context, false);
    delete context.object.userData.tokenGateNeedsVerify;
  },
};
