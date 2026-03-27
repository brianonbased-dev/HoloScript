/**
 * Facial Expression Traits — FACS 52 Action Units
 *
 * Apple ARKit / MetaHuman / VTuber compatible facial animation.
 * Each AU is an individual morph target trait.
 *
 * @see W.240: FACS 52 AUs are the universal facial expression standard
 * @see P.CHAR.001: Shape-Sculpt-to-Morph-Target pipeline
 * @see G.CHAR.001: Sparse morph targets to reduce 31MB → 3MB
 */
export const FACIAL_EXPRESSION_TRAITS = [
  // Upper Face — Brow & Forehead
  'facs_au01_inner_brow_raise',
  'facs_au02_outer_brow_raise',
  'facs_au04_brow_lowerer',

  // Upper Face — Eyes
  'facs_au05_upper_lid_raise',
  'facs_au06_cheek_raise',
  'facs_au07_lid_tightener',
  'facs_au43_eyes_closed',
  'facs_au45_blink',
  'facs_au46_wink',

  // Nose
  'facs_au09_nose_wrinkler',
  'facs_au10_upper_lip_raise',
  'facs_au11_nasolabial_deepen',

  // Mouth — Lip Position
  'facs_au12_lip_corner_pull',
  'facs_au13_sharp_lip_pull',
  'facs_au14_dimpler',
  'facs_au15_lip_corner_depress',
  'facs_au16_lower_lip_depress',
  'facs_au17_chin_raise',
  'facs_au18_lip_pucker',
  'facs_au20_lip_stretch',
  'facs_au22_lip_funnel',
  'facs_au23_lip_tighten',
  'facs_au24_lip_press',
  'facs_au25_lips_part',
  'facs_au26_jaw_drop',
  'facs_au27_mouth_stretch',
  'facs_au28_lip_suck',

  // Tongue & Cheeks
  'facs_au19_tongue_show',
  'facs_au21_neck_tighten',
  'facs_au29_jaw_thrust',
  'facs_au30_jaw_sideways',
  'facs_au31_jaw_clench',
  'facs_au32_lip_bite',
  'facs_au33_cheek_blow',
  'facs_au34_cheek_puff',
  'facs_au35_cheek_suck',
  'facs_au36_tongue_bulge',
  'facs_au37_lip_wipe',
  'facs_au38_nostril_dilate',
  'facs_au39_nostril_compress',

  // Head & Eye Position
  'facs_au51_head_turn_left',
  'facs_au52_head_turn_right',
  'facs_au53_head_up',
  'facs_au54_head_down',
  'facs_au55_head_tilt_left',
  'facs_au56_head_tilt_right',
  'facs_au57_head_forward',
  'facs_au58_head_back',
  'facs_au61_eyes_turn_left',
  'facs_au62_eyes_turn_right',
  'facs_au63_eyes_up',
  'facs_au64_eyes_down',

  // Compound Expressions
  'expression_happy',
  'expression_sad',
  'expression_angry',
  'expression_surprised',
  'expression_disgusted',
  'expression_fearful',
  'expression_neutral',
  'expression_thinking',

  // Visemes (15 standard)
  'viseme_sil',
  'viseme_aa',
  'viseme_ee',
  'viseme_ih',
  'viseme_oh',
  'viseme_oo',
  'viseme_pp',
  'viseme_ff',
  'viseme_th',
  'viseme_dd',
  'viseme_kk',
  'viseme_ch',
  'viseme_ss',
  'viseme_nn',
  'viseme_rr',
] as const;

export type FacialExpressionTraitName = (typeof FACIAL_EXPRESSION_TRAITS)[number];
