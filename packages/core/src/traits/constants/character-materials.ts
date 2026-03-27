/**
 * Character Material Traits
 *
 * Subsurface scattering skin, refractive eyes, Marschner hair,
 * and cloth material models for realistic character rendering.
 *
 * @see W.241: SSS is the single biggest jump in character realism
 * @see G.CHAR.002: SSS needs Jimenez separable blur
 * @see G.CHAR.003: Eye IOR = 1.376 (not 1.5)
 */
export const CHARACTER_MATERIAL_TRAITS = [
  // Subsurface Scattering — Skin
  'skin_subsurface',
  'skin_scatter_distance',
  'skin_scatter_color',
  'skin_pore_detail',
  'skin_wrinkle_normal',
  'skin_blood_flow',
  'skin_oiliness',
  'skin_melanin',

  // Refractive Eye
  'eye_refractive',
  'eye_cornea',
  'eye_iris',
  'eye_pupil_dilation',
  'eye_sclera',
  'eye_wet_layer',
  'eye_micro_saccade',
  'eye_parallax',

  // Hair — Marschner Shading
  'hair_marschner',
  'hair_primary_specular',
  'hair_secondary_specular',
  'hair_melanin',
  'hair_melanin_redness',
  'hair_scatter',
  'hair_root_darkening',
  'hair_tip_lightening',
  'hair_anisotropy',

  // Cloth Materials
  'cloth_material_silk',
  'cloth_material_cotton',
  'cloth_material_denim',
  'cloth_material_leather',
  'cloth_material_velvet',
  'cloth_material_chainmail',
  'cloth_material_fur',

  // Tooth & Nail
  'tooth_enamel',
  'nail_keratin',
] as const;

export type CharacterMaterialTraitName = (typeof CHARACTER_MATERIAL_TRAITS)[number];
