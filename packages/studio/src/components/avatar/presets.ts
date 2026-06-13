'use client';

/**
 * Avatar-mode presets for /create?mode=avatar.
 *
 * Mirrors the SimSci / Game presets contract (presets + per-preset headline
 * params), but the "solver" is the avatar-rig derivation: each preset is a
 * HoloScript composition source that POST /api/avatar/compile parses and
 * derives a VRM-1.0-shaped humanoid rig from — humanoid bone coverage,
 * expression presets, and a clothing/accessory layer count.
 *
 * The trait -> rig mapping is GENERIC (the humanoid-avatar trait vocabulary in
 * @holoscript/core: skeleton/body/face/expressive/hair/clothing/hands/...):
 *   @skeleton            -> declares the humanoid bone chain (rig root)
 *   @body / @hands       -> body + limb bones
 *   @face / @expressive  -> expression presets
 *   @hair / @clothing    -> surface layers
 * Bone coverage is scored against the VRM 1.0 required-humanoid bone set
 * (the @holoscript/vrm-avatar-plugin REQUIRED_BONES contract).
 *
 * Headline params (scale, expressionCount) override the compiled options — they
 * are passed as the `options` body field to /api/avatar/compile.
 *
 * No @holoscript/core or /engine import here — derivation is server-side.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface AvatarPreset {
  id: string;
  label: string;
  description: string;
  /** HoloScript composition source the avatar rig is derived from. */
  source: string;
}

export interface AvatarPresetParam {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  format: (v: number) => string;
}

// ── Preset sources ────────────────────────────────────────────────────────────
// Minimal, parse-clean HoloScript avatar compositions. Each declares humanoid
// rig templates with the core humanoid-avatar trait vocabulary so the route
// derives a bone chain + expressions + surface layers without a hardcoded mesh.

const FULL_HUMANOID_SOURCE = `composition "Full Humanoid" {
  metadata {
    name: 'Full Humanoid'
    category: 'avatar'
  }
  template "Rig" {
    @skeleton
    @poseable
    geometry: "humanoid"
  }
  template "Body" {
    @body
    @hands
    geometry: "humanoid"
  }
  template "Face" {
    @face
    @expressive
    @morph
    geometry: "head"
  }
  template "Hair" {
    @hair
    geometry: "hair"
  }
  template "Outfit" {
    @clothing
    geometry: "shirt"
  }
  object "Avatar" using "Rig" {
    position: [0, 0, 0]
    object "AvatarBody" using "Body" { position: [0, 0, 0] }
    object "AvatarFace" using "Face" { position: [0, 1.6, 0] }
    object "AvatarHair" using "Hair" { position: [0, 1.75, 0] }
    object "AvatarOutfit" using "Outfit" { position: [0, 0.9, 0] }
  }
}`;

const UPPER_BODY_SOURCE = `composition "Upper-Body VTuber" {
  metadata {
    name: 'Upper-Body VTuber'
    category: 'avatar'
  }
  template "Rig" {
    @skeleton
    geometry: "humanoid"
  }
  template "Torso" {
    @body
    @hands
    geometry: "humanoid"
  }
  template "Face" {
    @face
    @expressive
    @morph
    @eye_tracked
    geometry: "head"
  }
  object "Avatar" using "Rig" {
    position: [0, 0, 0]
    object "AvatarTorso" using "Torso" { position: [0, 0, 0] }
    object "AvatarFace" using "Face" { position: [0, 1.6, 0] }
  }
}`;

const STYLIZED_SOURCE = `composition "Stylized Character" {
  metadata {
    name: 'Stylized Character'
    category: 'avatar'
  }
  template "Rig" {
    @skeleton
    @poseable
    geometry: "humanoid"
  }
  template "Body" {
    @body
    geometry: "humanoid"
  }
  template "Face" {
    @face
    @expressive
    geometry: "head"
  }
  template "Outfit" {
    @clothing
    geometry: "robe"
  }
  template "Accessory" {
    @clothing
    geometry: "hat"
  }
  object "Avatar" using "Rig" {
    position: [0, 0, 0]
    object "AvatarBody" using "Body" { position: [0, 0, 0] }
    object "AvatarFace" using "Face" { position: [0, 1.6, 0] }
    object "AvatarOutfit" using "Outfit" { position: [0, 0.9, 0] }
    object "AvatarHat" using "Accessory" { position: [0, 1.8, 0] }
  }
}`;

// ── Preset catalog ──────────────────────────────────────────────────────────────

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'full-humanoid',
    label: 'Full Humanoid',
    description:
      'Complete VRM-style humanoid: full skeleton, body + hands, expressive face, hair, and an outfit layer.',
    source: FULL_HUMANOID_SOURCE,
  },
  {
    id: 'upper-body-vtuber',
    label: 'Upper-Body VTuber',
    description:
      'Upper-body avatar tuned for face/eye tracking — torso rig + an eye-tracked expressive face.',
    source: UPPER_BODY_SOURCE,
  },
  {
    id: 'stylized-character',
    label: 'Stylized Character',
    description:
      'Poseable stylized character with a robe + hat clothing/accessory layer and an expressive face.',
    source: STYLIZED_SOURCE,
  },
];

// ── Headline params per preset ──────────────────────────────────────────────────
// Shared across presets — scale (avatar root uniform scale) and the target
// number of expression presets to derive from face/@expressive templates.

const SHARED_PARAMS: AvatarPresetParam[] = [
  {
    name: 'scale',
    label: 'Avatar scale',
    min: 0.5,
    max: 2.0,
    step: 0.05,
    value: 1.0,
    unit: '×',
    format: (v) => v.toFixed(2),
  },
  {
    name: 'expressionCount',
    label: 'Expression presets',
    min: 1,
    max: 10,
    step: 1,
    value: 5,
    unit: '',
    format: (v) => String(Math.round(v)),
  },
];

const PRESET_PARAMS: Record<string, AvatarPresetParam[]> = {
  'full-humanoid': SHARED_PARAMS,
  'upper-body-vtuber': SHARED_PARAMS,
  'stylized-character': SHARED_PARAMS,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAvatarPresetById(id: string): AvatarPreset | undefined {
  return AVATAR_PRESETS.find((p) => p.id === id);
}

export function getAvatarPresetParams(id: string): AvatarPresetParam[] {
  return PRESET_PARAMS[id] ?? SHARED_PARAMS;
}
