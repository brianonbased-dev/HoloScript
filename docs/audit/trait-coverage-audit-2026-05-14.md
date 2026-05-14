# HoloScript Trait Coverage Audit
**Generated:** 2026-05-14
**Command:** `node scripts/refresh-trait-coverage-audit.mjs`

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Traits | 2,316 |
| Covered Traits | 1,280 (55.27%) |
| Zero-Coverage Traits | 1,036 |

> **Coverage definition:** a trait is "covered" if it has at least one of: a handler implementation (`*Trait.ts`), a test file (`*.test.ts`), an example usage (`.holo`/`.hsplus`), or documentation (`.md`).

## Coverage by Category (zero-coverage descending)

| Category | Total | Covered | Zero | Handler | Test | Example | Doc |
|----------|-------|---------|------|---------|------|---------|-----|
| facial-expression | 75 | 2 | 73 | 0 | 0 | 1 | 1 |
| security-crypto | 78 | 10 | 68 | 7 | 7 | 3 | 9 |
| character-pipeline | 51 | 1 | 50 | 0 | 0 | 0 | 1 |
| character-materials | 34 | 1 | 33 | 0 | 0 | 0 | 1 |
| instancing-geometry | 35 | 3 | 32 | 0 | 0 | 1 | 3 |
| simulation-domains | 33 | 1 | 32 | 0 | 0 | 0 | 1 |
| cooking-food | 39 | 8 | 31 | 0 | 0 | 6 | 7 |
| magic-fantasy | 37 | 8 | 29 | 0 | 0 | 7 | 4 |
| sports-fitness | 37 | 9 | 28 | 0 | 0 | 6 | 9 |
| creatures-mythical | 42 | 15 | 27 | 0 | 0 | 12 | 8 |
| data-visualization | 45 | 21 | 24 | 0 | 0 | 13 | 16 |
| gems-minerals | 31 | 8 | 23 | 1 | 1 | 6 | 4 |
| furniture-decor | 36 | 13 | 23 | 0 | 0 | 12 | 10 |
| maritime-naval | 30 | 8 | 22 | 0 | 0 | 6 | 5 |
| animals | 48 | 26 | 22 | 0 | 0 | 18 | 12 |
| age-condition | 30 | 8 | 22 | 0 | 0 | 6 | 4 |
| architecture-realestate | 37 | 15 | 22 | 1 | 1 | 12 | 7 |
| surface-texture | 30 | 8 | 22 | 0 | 0 | 6 | 6 |
| fabric-cloth | 30 | 9 | 21 | 0 | 0 | 6 | 6 |
| terrain-ocean | 20 | 1 | 19 | 0 | 0 | 0 | 1 |
| music-performance | 37 | 19 | 18 | 1 | 1 | 16 | 8 |
| containers-storage | 30 | 13 | 17 | 0 | 0 | 11 | 10 |
| material-properties | 33 | 17 | 16 | 1 | 1 | 15 | 12 |
| scientific-computing | 27 | 11 | 16 | 0 | 0 | 0 | 11 |
| healthcare-medical | 31 | 15 | 16 | 1 | 1 | 4 | 14 |
| signs-communication | 28 | 12 | 16 | 0 | 0 | 9 | 9 |
| environmental-biome | 33 | 18 | 15 | 0 | 0 | 13 | 13 |
| scifi-technology | 24 | 9 | 15 | 1 | 1 | 7 | 7 |
| nature-life | 27 | 13 | 14 | 9 | 9 | 9 | 6 |
| shape-form | 32 | 18 | 14 | 0 | 0 | 17 | 9 |
| time-period | 23 | 9 | 14 | 0 | 0 | 6 | 7 |
| universal-service | 27 | 13 | 14 | 0 | 0 | 11 | 8 |
| water-fluid | 19 | 6 | 13 | 0 | 0 | 3 | 4 |
| npc-roles | 62 | 49 | 13 | 0 | 0 | 46 | 20 |
| holomesh-social | 13 | 1 | 12 | 0 | 0 | 0 | 1 |
| atmosphere-sky | 18 | 6 | 12 | 1 | 1 | 3 | 6 |
| weather-phenomena | 26 | 14 | 12 | 0 | 0 | 9 | 10 |
| intelligence-behavior | 41 | 30 | 11 | 2 | 2 | 25 | 24 |
| global-illumination | 16 | 5 | 11 | 1 | 1 | 4 | 2 |
| size-scale | 18 | 7 | 11 | 0 | 0 | 4 | 7 |
| twin-earth | 46 | 36 | 10 | 0 | 0 | 36 | 0 |
| education-learning | 39 | 30 | 9 | 1 | 1 | 20 | 26 |
| fabrication-devices | 10 | 1 | 9 | 0 | 0 | 0 | 1 |
| measurement-sensing | 17 | 9 | 8 | 0 | 0 | 7 | 6 |
| construction-building | 25 | 17 | 8 | 0 | 0 | 16 | 16 |
| emotion-mood | 20 | 12 | 8 | 0 | 0 | 9 | 11 |
| enterprise-multitenancy | 19 | 11 | 8 | 4 | 4 | 5 | 11 |
| physical-affordances | 22 | 14 | 8 | 0 | 0 | 6 | 14 |
| transportation-vehicles | 12 | 5 | 7 | 0 | 0 | 3 | 3 |
| resource-gathering | 8 | 1 | 7 | 0 | 0 | 0 | 1 |
| analytics-observability | 16 | 10 | 6 | 1 | 1 | 2 | 10 |
| procedural-generation | 27 | 21 | 6 | 2 | 2 | 11 | 16 |
| musical-sound | 10 | 5 | 5 | 0 | 0 | 3 | 5 |
| hologram-media | 13 | 8 | 5 | 3 | 3 | 6 | 6 |
| vfx-audio | 8 | 3 | 5 | 0 | 0 | 3 | 3 |
| post-processing | 19 | 15 | 4 | 0 | 0 | 14 | 15 |
| state-persistence | 17 | 14 | 3 | 0 | 0 | 13 | 14 |
| multisensory-haptic | 16 | 13 | 3 | 0 | 0 | 8 | 13 |
| v43-ai-xr | 10 | 8 | 2 | 6 | 6 | 7 | 8 |
| social-commerce | 12 | 10 | 2 | 0 | 0 | 7 | 10 |
| interop-copresence | 15 | 13 | 2 | 13 | 13 | 9 | 13 |
| weather-particles | 12 | 10 | 2 | 0 | 0 | 0 | 10 |
| volumetric-webgpu | 13 | 11 | 2 | 9 | 9 | 10 | 11 |
| payment | 7 | 5 | 2 | 4 | 4 | 4 | 3 |
| safety-boundaries | 14 | 13 | 1 | 1 | 1 | 6 | 13 |
| connector-integration | 4 | 3 | 1 | 1 | 1 | 2 | 3 |
| accessibility | 10 | 10 | 0 | 10 | 10 | 10 | 10 |
| concurrency | 4 | 4 | 0 | 4 | 4 | 1 | 1 |
| accessibility-extended | 27 | 27 | 0 | 0 | 0 | 3 | 26 |
| rendering | 16 | 16 | 0 | 4 | 4 | 9 | 16 |
| networking-ai | 26 | 26 | 0 | 12 | 12 | 7 | 26 |
| iot-autonomous-agents | 32 | 32 | 0 | 14 | 14 | 20 | 32 |
| debug-cinematic | 4 | 4 | 0 | 4 | 4 | 1 | 1 |
| gaps-physics | 16 | 16 | 0 | 15 | 15 | 13 | 16 |
| narrative-storytelling | 12 | 12 | 0 | 0 | 0 | 10 | 10 |
| lighting | 27 | 27 | 0 | 0 | 0 | 14 | 27 |
| audio | 10 | 10 | 0 | 7 | 7 | 9 | 10 |
| game-mechanics | 31 | 31 | 0 | 0 | 0 | 14 | 31 |
| environment-input | 16 | 16 | 0 | 13 | 13 | 14 | 15 |
| simple-modifiers | 7 | 7 | 0 | 0 | 0 | 7 | 7 |
| auth-identity | 6 | 6 | 0 | 6 | 6 | 4 | 4 |
| workflow-bpm | 4 | 4 | 0 | 4 | 4 | 3 | 3 |
| parser-core-ui | 18 | 18 | 0 | 0 | 0 | 8 | 18 |
| xr-platform | 26 | 26 | 0 | 1 | 1 | 10 | 26 |
| spatial-algorithms | 3 | 3 | 0 | 3 | 3 | 3 | 2 |
| search | 3 | 3 | 0 | 3 | 3 | 0 | 2 |
| data-pipeline | 5 | 5 | 0 | 5 | 5 | 0 | 1 |
| visual-effects | 31 | 31 | 0 | 0 | 0 | 15 | 29 |
| file-storage | 3 | 3 | 0 | 3 | 3 | 0 | 1 |
| humanoid-avatar | 15 | 15 | 0 | 6 | 6 | 14 | 13 |
| core-vr-interaction | 13 | 13 | 0 | 2 | 2 | 11 | 13 |
| scripting-automation | 13 | 13 | 0 | 13 | 13 | 8 | 12 |
| physics-expansion | 7 | 7 | 0 | 7 | 7 | 7 | 7 |
| data-storage | 7 | 7 | 0 | 7 | 7 | 7 | 7 |
| media-analytics | 7 | 7 | 0 | 0 | 0 | 4 | 7 |
| devops-ci | 5 | 5 | 0 | 5 | 5 | 3 | 3 |
| object-interaction | 25 | 25 | 0 | 0 | 0 | 10 | 25 |
| audit-trail | 2 | 2 | 0 | 2 | 2 | 0 | 1 |
| testing-qa | 5 | 5 | 0 | 5 | 5 | 1 | 2 |
| locomotion-movement | 14 | 14 | 0 | 2 | 2 | 4 | 13 |
| social-effects | 8 | 8 | 0 | 0 | 0 | 7 | 8 |
| gpu-compute | 4 | 4 | 0 | 4 | 4 | 4 | 4 |
| compliance-governance | 3 | 3 | 0 | 3 | 3 | 0 | 1 |
| communication | 7 | 7 | 0 | 7 | 7 | 2 | 1 |
| ml-inference | 6 | 6 | 0 | 6 | 6 | 2 | 3 |
| ffi-os | 4 | 4 | 0 | 4 | 4 | 0 | 1 |
| geospatial-web3 | 9 | 9 | 0 | 9 | 9 | 9 | 9 |
| api-gateway | 3 | 3 | 0 | 3 | 3 | 0 | 2 |
| observability | 5 | 5 | 0 | 5 | 5 | 3 | 3 |
| holomap-reconstruction | 5 | 5 | 0 | 0 | 0 | 5 | 5 |
| media-content | 4 | 4 | 0 | 4 | 4 | 0 | 1 |
| i18n-localization | 3 | 3 | 0 | 3 | 3 | 1 | 1 |
| database-persistence | 4 | 4 | 0 | 4 | 4 | 0 | 1 |
| ml-tensor | 3 | 3 | 0 | 3 | 3 | 0 | 1 |
| notification-alerting | 3 | 3 | 0 | 3 | 3 | 1 | 1 |
| feature-flags | 1 | 1 | 0 | 1 | 1 | 1 | 1 |

---

## Zero-Coverage Traits Detail

### facial-expression (73 uncovered)

- `expression_angry`
- `expression_disgusted`
- `expression_fearful`
- `expression_happy`
- `expression_neutral`
- `expression_sad`
- `expression_surprised`
- `expression_thinking`
- `facs_au02_outer_brow_raise`
- `facs_au04_brow_lowerer`
- `facs_au05_upper_lid_raise`
- `facs_au06_cheek_raise`
- `facs_au07_lid_tightener`
- `facs_au09_nose_wrinkler`
- `facs_au10_upper_lip_raise`
- `facs_au11_nasolabial_deepen`
- `facs_au12_lip_corner_pull`
- `facs_au13_sharp_lip_pull`
- `facs_au14_dimpler`
- `facs_au15_lip_corner_depress`
- `facs_au16_lower_lip_depress`
- `facs_au17_chin_raise`
- `facs_au18_lip_pucker`
- `facs_au19_tongue_show`
- `facs_au20_lip_stretch`
- `facs_au21_neck_tighten`
- `facs_au22_lip_funnel`
- `facs_au23_lip_tighten`
- `facs_au24_lip_press`
- `facs_au25_lips_part`
- `facs_au26_jaw_drop`
- `facs_au27_mouth_stretch`
- `facs_au28_lip_suck`
- `facs_au29_jaw_thrust`
- `facs_au30_jaw_sideways`
- `facs_au31_jaw_clench`
- `facs_au32_lip_bite`
- `facs_au33_cheek_blow`
- `facs_au34_cheek_puff`
- `facs_au35_cheek_suck`
- `facs_au36_tongue_bulge`
- `facs_au37_lip_wipe`
- `facs_au38_nostril_dilate`
- `facs_au39_nostril_compress`
- `facs_au43_eyes_closed`
- `facs_au45_blink`
- `facs_au46_wink`
- `facs_au51_head_turn_left`
- `facs_au52_head_turn_right`
- `facs_au53_head_up`
- `facs_au54_head_down`
- `facs_au55_head_tilt_left`
- `facs_au56_head_tilt_right`
- `facs_au57_head_forward`
- `facs_au58_head_back`
- `facs_au61_eyes_turn_left`
- `facs_au62_eyes_turn_right`
- `facs_au63_eyes_up`
- `facs_au64_eyes_down`
- `viseme_ch`
- `viseme_dd`
- `viseme_ee`
- `viseme_ff`
- `viseme_ih`
- `viseme_kk`
- `viseme_nn`
- `viseme_oh`
- `viseme_oo`
- `viseme_pp`
- `viseme_rr`
- `viseme_sil`
- `viseme_ss`
- `viseme_th`

### security-crypto (68 uncovered)

- `aes_128`
- `aes_256`
- `api_restriction`
- `aws_cloudhsm`
- `azure_key_vault`
- `batch_verification`
- `bls12_381_curve`
- `bn254_curve`
- `bulletproofs`
- `certificate_pinning`
- `chacha20_poly1305`
- `chain_of_trust`
- `code_injection_detection`
- `common_criteria`
- `composition_validation`
- `container_sandbox`
- `cvss_scoring`
- `cwe_mapping`
- `dependency_check`
- `detached_signature`
- `dtls`
- `dynamic_analysis`
- `ecdsa_p256`
- `ecdsa_secp256k1`
- `ecdsa_signing`
- `ed25519_signing`
- `embedded_signature`
- `end_to_end_encryption`
- `fips_140_2`
- `fips_140_3`
- `google_cloud_hsm`
- `hybrid_encryption`
- `iframe_sandbox`
- `isolate_sandbox`
- `key_derivation`
- `key_rotation`
- `multi_region_key`
- `oaep_padding`
- `ocsp_stapling`
- `owasp_top_10`
- `pedersen_commitment`
- `penetration_test`
- `perfect_forward_secrecy`
- `permission_system`
- `pkcs1_padding`
- `poseidon_hash`
- `pss_padding`
- `recursive_proof`
- `resource_limits`
- `rsa_2048`
- `rsa_3072`
- `rsa_4096`
- `sarif_output`
- `secret_detection`
- `secure_enclave`
- `session_resumption`
- `signature_verification`
- `static_analysis`
- `timestamp_authority`
- `tls_1_2`
- `tls_1_3`
- `tpm_module`
- `vm_sandbox`
- `wasm_sandbox`
- `worker_sandbox`
- `xss_detection`
- `zk_snark`
- `zk_stark`

### character-pipeline (50 uncovered)

- `character_hollow`
- `character_lod`
- `character_lod_crossfade`
- `character_lod_dithered`
- `clothing_baked`
- `clothing_cloth_sim`
- `clothing_layered_shell`
- `clothing_shrinkwrap`
- `clothing_wrinkle_map`
- `compiled_mesh`
- `deploy_apple_usdz`
- `deploy_cloud_native`
- `deploy_rpm_glb`
- `deploy_unity_fbx`
- `deploy_unreal_usd`
- `deploy_vrchat_vrm`
- `deploy_web_gltf`
- `face_action_unit`
- `face_expression_preset`
- `face_facs_52`
- `face_idle_blink`
- `face_reactive`
- `face_viseme`
- `hair_cards`
- `hair_guide_curves`
- `hair_strands`
- `material_hair_marschner`
- `material_refractive_eye`
- `material_subsurface`
- `mesh_ball_pivoting`
- `mesh_dual_contouring`
- `mesh_marching_cubes`
- `mesh_poisson_reconstruction`
- `optimized_character`
- `rigged_character`
- `sculpt_blend_smooth_union`
- `sculpt_color_map`
- `sculpt_fill_shell`
- `sculpt_fill_tube`
- `sculpt_fill_volumetric`
- `sculpt_region`
- `skeleton_custom_bone`
- `skeleton_humanoid_65`
- `skin_max_influences`
- `skinning_geodesic_voxel`
- `skinning_heat_diffusion`
- `skinning_neural`
- `speech_audio_analysis`
- `speech_emotion_overlay`
- `speech_viseme_15`

### character-materials (33 uncovered)

- `cloth_material_chainmail`
- `cloth_material_cotton`
- `cloth_material_denim`
- `cloth_material_fur`
- `cloth_material_leather`
- `cloth_material_silk`
- `cloth_material_velvet`
- `eye_cornea`
- `eye_iris`
- `eye_micro_saccade`
- `eye_parallax`
- `eye_pupil_dilation`
- `eye_refractive`
- `eye_sclera`
- `eye_wet_layer`
- `hair_anisotropy`
- `hair_marschner`
- `hair_melanin`
- `hair_melanin_redness`
- `hair_primary_specular`
- `hair_root_darkening`
- `hair_scatter`
- `hair_secondary_specular`
- `hair_tip_lightening`
- `nail_keratin`
- `skin_blood_flow`
- `skin_melanin`
- `skin_oiliness`
- `skin_pore_detail`
- `skin_scatter_color`
- `skin_scatter_distance`
- `skin_wrinkle_normal`
- `tooth_enamel`

### instancing-geometry (32 uncovered)

- `batched_draw_indirect`
- `batched_mesh`
- `compute_rasterize`
- `compute_rasterize_points`
- `compute_rasterize_splats`
- `instanced_array`
- `instanced_color`
- `instanced_transform`
- `morton_octree`
- `morton_sort`
- `multi_draw_indirect`
- `render_strategy`
- `render_strategy_auto`
- `render_strategy_batched`
- `render_strategy_compute`
- `render_strategy_instanced`
- `render_strategy_sdf`
- `sdf_bend`
- `sdf_difference`
- `sdf_intersect`
- `sdf_primitive`
- `sdf_repeat`
- `sdf_smooth_difference`
- `sdf_smooth_intersect`
- `sdf_smooth_union`
- `sdf_twist`
- `shape_pool_box`
- `shape_pool_capsule`
- `shape_pool_cone`
- `shape_pool_cylinder`
- `shape_pool_sphere`
- `shape_pool_torus`

### simulation-domains (32 uncovered)

- `colormap_coolwarm`
- `colormap_inferno`
- `colormap_jet`
- `colormap_turbo`
- `colormap_viridis`
- `hydraulic_junction`
- `hydraulic_pipe`
- `hydraulic_pump`
- `hydraulic_reservoir`
- `hydraulic_valve`
- `phase_transition`
- `saturation_chemical`
- `saturation_electrical`
- `saturation_moisture`
- `saturation_pressure`
- `saturation_structural`
- `saturation_thermal`
- `scalar_field_overlay`
- `structural_constraint`
- `structural_dynamic`
- `structural_fem`
- `structural_load`
- `structural_material`
- `structural_static`
- `thermal_boundary`
- `thermal_conduction`
- `thermal_convection`
- `thermal_radiation`
- `thermal_source`
- `threshold_critical`
- `threshold_recovery`
- `threshold_warning`

### cooking-food (31 uncovered)

- `bakeable`
- `batter`
- `blender`
- `bowl`
- `chopping_board`
- `deep_fryer`
- `dough`
- `drinkable`
- `fermentable`
- `frosting`
- `garnish`
- `glass_container`
- `grill`
- `grillable`
- `jar`
- `ladle`
- `marinade`
- `measuring_cup`
- `mixer_kitchen`
- `oven`
- `pot`
- `rolling_pin`
- `sauce`
- `seasoning`
- `smoker`
- `spatula`
- `stove`
- `thermometer_food`
- `timer_kitchen`
- `tongs`
- `whisk`

### magic-fantasy (29 uncovered)

- `banishing`
- `blessed`
- `damage_aura`
- `elemental_air`
- `elemental_earth`
- `elemental_fire`
- `elemental_ice`
- `elemental_light`
- `elemental_lightning`
- `elemental_shadow`
- `elemental_water`
- `glyph`
- `gravity_well`
- `healing_aura`
- `invisibility`
- `mana_source`
- `phylactery`
- `portal_link`
- `relic`
- `shield_aura`
- `sigil`
- `soul_bound`
- `speed_aura`
- `telekinetic`
- `telepathic`
- `time_rewind`
- `time_slow`
- `time_stop`
- `totem`

### sports-fitness (28 uncovered)

- `balance_board`
- `bullseye`
- `calorie_tracker`
- `club`
- `coach`
- `dumbbell`
- `finish_line`
- `fishing_rod`
- `form_checker`
- `heart_rate_monitor`
- `hittable`
- `hoop`
- `hurdle`
- `jump_rope`
- `kettlebell`
- `kickable`
- `lap_counter`
- `opponent`
- `punching_bag`
- `racket`
- `rep_counter`
- `resistance_band`
- `rowing_machine`
- `starting_block`
- `stationary_bike`
- `timer_display`
- `treadmill`
- `yoga_mat`

### creatures-mythical (27 uncovered)

- `angel`
- `basilisk`
- `centaur`
- `cerberus`
- `chimera`
- `djinn`
- `dwarf_creature`
- `elemental_creature`
- `fairy`
- `giant_creature`
- `golem`
- `griffin`
- `lich`
- `mimic`
- `minotaur`
- `ogre`
- `pegasus`
- `pixie`
- `siren`
- `skeleton_creature`
- `sphinx`
- `treant`
- `troll`
- `unicorn`
- `vampire`
- `werewolf`
- `wyvern`

### data-visualization (24 uncovered)

- `bar_chart`
- `code_editor`
- `data_table`
- `file_browser`
- `gantt`
- `heatmap_view`
- `image_viewer`
- `kanban`
- `line_graph`
- `media_player`
- `mind_map`
- `network_graph`
- `org_chart`
- `pdf_viewer`
- `pie_chart`
- `sankey`
- `schematic`
- `speedometer`
- `spreadsheet`
- `status_indicator`
- `sticky_note`
- `timeline_view`
- `tree_map`
- `wireframe_view`

### gems-minerals (23 uncovered)

- `adamantine`
- `amethyst`
- `bloodstone`
- `bronze_material`
- `copper_material`
- `emerald_gem`
- `garnet`
- `gold_material`
- `iron_material`
- `lapis_lazuli`
- `mithril`
- `moonstone`
- `onyx`
- `opal`
- `orichalcum`
- `ruby_gem`
- `sapphire_gem`
- `silver_material`
- `steel_material`
- `sunstone`
- `titanium_material`
- `topaz`
- `turquoise_gem`

### furniture-decor (23 uncovered)

- `aquarium_decor`
- `bed_furniture`
- `birdcage`
- `bookshelf`
- `bust`
- `candelabra`
- `chandelier_decor`
- `coffee_table`
- `dining_table`
- `dresser`
- `fountain`
- `globe`
- `mannequin`
- `mirror_decor`
- `nightstand`
- `picture_frame`
- `plant_pot`
- `rug_decor`
- `sofa`
- `statue`
- `stool`
- `terrarium_decor`
- `vase_decor`

### maritime-naval (22 uncovered)

- `anchor_ship`
- `boat`
- `canoe`
- `cargo_ship`
- `crow_nest`
- `dock_structure`
- `ferry`
- `figurehead`
- `fishing_boat`
- `gangplank`
- `harbor`
- `helm`
- `hovercraft`
- `kayak`
- `keel`
- `lifeboat`
- `pier`
- `porthole`
- `propeller`
- `rudder`
- `warship`
- `yacht`

### animals (22 uncovered)

- `bat_animal`
- `bee`
- `bird`
- `dinosaur`
- `dog`
- `fox`
- `frog`
- `goat`
- `gorilla`
- `hawk`
- `lion`
- `lizard`
- `mammal`
- `octopus`
- `owl`
- `parrot`
- `penguin`
- `reptile`
- `shark`
- `snake`
- `spider`
- `tiger`

### age-condition (22 uncovered)

- `antique`
- `battle_scarred`
- `blood_stained`
- `brand_new`
- `calcified`
- `charred`
- `chipped`
- `corroded`
- `cracked`
- `dented`
- `dust_covered`
- `faded`
- `fossilized`
- `moss_covered`
- `petrified`
- `rusted`
- `stained`
- `sun_bleached`
- `tarnished`
- `vine_covered`
- `weathered`
- `worn`

### architecture-realestate (22 uncovered)

- `atrium`
- `attic`
- `basement`
- `closet`
- `courtyard`
- `doorbell`
- `driveway`
- `exterior_design`
- `furniture_placement`
- `garage`
- `gym_room`
- `home_office`
- `interior_design`
- `laundry`
- `rooftop_deck`
- `room_layout`
- `security_camera`
- `solar_panel`
- `sprinkler`
- `theater_room`
- `utility_room`
- `wine_cellar`

### surface-texture (22 uncovered)

- `braided`
- `crystallized`
- `embossed`
- `engraved`
- `etched`
- `feathered`
- `frosted_surface`
- `gravelly`
- `hammered`
- `knitted`
- `leathery`
- `matte_surface`
- `mossy`
- `pearlescent`
- `pitted`
- `porcelain`
- `sandy`
- `silky`
- `slimy`
- `velvety`
- `woolly`
- `woven`

### fabric-cloth (21 uncovered)

- `awning`
- `bedsheet`
- `billowing`
- `cloak`
- `drape`
- `hammock`
- `net_fabric`
- `parachute`
- `pillow`
- `pleated`
- `quilted`
- `ruffled`
- `rug`
- `sail`
- `tablecloth`
- `tapestry`
- `tarp`
- `tattered`
- `tent`
- `towel`
- `upholstered`

### terrain-ocean (19 uncovered)

- `ocean_buoyancy`
- `ocean_calm_lake`
- `ocean_caustics`
- `ocean_fft`
- `ocean_flowing_river`
- `ocean_foam`
- `ocean_gerstner`
- `ocean_shoreline`
- `ocean_underwater_fog`
- `ocean_wake`
- `terrain_biome_splatmap`
- `terrain_fbm_noise`
- `terrain_grass_scatter`
- `terrain_hydraulic_erosion`
- `terrain_lod_geomorphing`
- `terrain_rock_scatter`
- `terrain_thermal_erosion`
- `terrain_tree_scatter`
- `terrain_triplanar_texture`

### music-performance (18 uncovered)

- `amplifier`
- `beat_detector`
- `chord_progression`
- `dance_floor`
- `dj_booth`
- `equalizer`
- `guitar`
- `headphones`
- `karaoke`
- `key_signature`
- `light_show`
- `loop_station`
- `lyrics_display`
- `midi_controller`
- `music_visualizer`
- `recording_studio`
- `trumpet`
- `turntable`

### containers-storage (17 uncovered)

- `aquarium`
- `backpack`
- `barrel_container`
- `basket`
- `cabinet`
- `chest_container`
- `compartment`
- `display_case`
- `drawer`
- `holster`
- `hopper`
- `locker`
- `pouch`
- `quiver`
- `sheath`
- `terrarium`
- `trophy_case`

### material-properties (16 uncovered)

- `adobe`
- `bamboo`
- `carbon_fiber`
- `cardboard`
- `concrete_reinforced`
- `crystal_material`
- `fiberglass`
- `ice_material`
- `ivory`
- `kevlar`
- `marble_material`
- `resin`
- `stained_glass`
- `stone_material`
- `thatch`
- `wax`

### scientific-computing (16 uncovered)

- `atom_labels`
- `atom_selection`
- `binding_affinity`
- `collaborative_science`
- `database_query`
- `electrostatic_surface`
- `interactive_forces`
- `mol_loader`
- `multimer_predict`
- `pae_visualization`
- `pdb_loader`
- `residue_labels`
- `simulation_control`
- `structure_confidence`
- `trajectory_analysis`
- `trajectory_playback`

### healthcare-medical (16 uncovered)

- `bandage`
- `body_scan`
- `breathing_exercise`
- `cognitive_therapy`
- `defibrillator`
- `exposure_therapy`
- `guided_relaxation`
- `iv_drip`
- `mindfulness`
- `pain_management`
- `phobia_treatment`
- `prosthetic`
- `ptsd_therapy`
- `rehabilitation`
- `splint`
- `stethoscope`

### signs-communication (16 uncovered)

- `billboard_sign`
- `exclamation_mark`
- `exit_sign`
- `graffiti`
- `heads_up_display`
- `holographic_display`
- `information_kiosk`
- `inscription`
- `name_tag`
- `newspaper`
- `postcard`
- `question_mark`
- `speech_bubble`
- `telegram`
- `thought_bubble`
- `warning_sign`

### environmental-biome (15 uncovered)

- `abyssal`
- `alien`
- `crystalline_biome`
- `foggy`
- `futuristic`
- `high_gravity`
- `icy`
- `low_gravity`
- `overgrown`
- `sacred`
- `steampunk`
- `subterranean`
- `swamp`
- `toxic`
- `zero_gravity`

### scifi-technology (15 uncovered)

- `black_hole`
- `cloaking`
- `cryo`
- `cybernetic`
- `dyson_sphere`
- `energy_weapon`
- `force_field_tech`
- `hyperspace`
- `nanite`
- `quantum_locked`
- `ringworld`
- `stasis`
- `terraforming`
- `warp_drive`
- `wormhole`

### nature-life (14 uncovered)

- `amphibious`
- `aquatic`
- `bloomable`
- `burrowing`
- `carnivorous_plant`
- `cocoon`
- `larva`
- `metamorphic`
- `parasitic`
- `photosynthetic`
- `pollinating`
- `symbiotic`
- `venomous`
- `witherable`

### shape-form (14 uncovered)

- `amorphous`
- `asymmetrical`
- `corrugated`
- `faceted`
- `flared`
- `fractal_shape`
- `layered_form`
- `modular_shape`
- `organic_form`
- `perforated`
- `ribbed`
- `smooth_form`
- `triangular`
- `twisted`

### time-period (14 uncovered)

- `anachronistic`
- `ancient_era`
- `art_deco`
- `art_nouveau`
- `bronze_age`
- `far_future`
- `feudal`
- `iron_age`
- `post_apocalyptic`
- `renaissance`
- `timeless`
- `utopian`
- `victorian`
- `viking`

### universal-service (14 uncovered)

- `api_gateway`
- `api_version`
- `batch_endpoint`
- `file_upload`
- `graphql_resolver`
- `multipart_handler`
- `request_validator`
- `response_transformer`
- `reverse_proxy`
- `rpc_method`
- `service_discovery`
- `sse_endpoint`
- `webhook_receiver`
- `webhook_sender`

### water-fluid (13 uncovered)

- `absorbent`
- `boiling`
- `condensing`
- `corrosive`
- `drainable`
- `evaporating`
- `frozen_liquid`
- `hydrophilic`
- `overflowing`
- `permeable`
- `sinkable`
- `waterproof`
- `watertight`

### npc-roles (13 uncovered)

- `archaeologist`
- `artificer`
- `doctor`
- `engineer`
- `fisher_npc`
- `gatherer`
- `healer_npc`
- `miner_npc`
- `prophet`
- `refugee`
- `scientist`
- `summoner_npc`
- `vigilante`

### holomesh-social (12 uncovered)

- `agent_badge`
- `agent_room`
- `agent_wall`
- `background_music`
- `guestbook`
- `profile_theme`
- `room_portal`
- `spatial_comment`
- `status_mood`
- `top8_friends`
- `trait_showcase`
- `visitor_counter`

### atmosphere-sky (12 uncovered)

- `atmosphere_gradient`
- `atmosphere_hdri`
- `cirrus_clouds`
- `cloud_shadow`
- `cumulus_clouds`
- `day_night_cycle`
- `lightning_flash`
- `moon_disc`
- `rainbow_arc`
- `sky_dome`
- `stratus_clouds`
- `sun_disc`

### weather-phenomena (12 uncovered)

- `cold_snap`
- `geyser`
- `hailstorm`
- `heatwave`
- `monsoon`
- `sinkhole`
- `solar_flare`
- `thunderstorm`
- `typhoon`
- `volcanic_eruption`
- `waterspout`
- `whirlpool`

### intelligence-behavior (11 uncovered)

- `invisible_agent`
- `migratory`
- `mischievous`
- `nocturnal`
- `pack_animal`
- `playful`
- `prey`
- `reward_shaping`
- `shapeshifter`
- `solitary`
- `territorial`

### global-illumination (11 uncovered)

- `ambient_occlusion_baked`
- `ambient_occlusion_realtime`
- `bounce_light`
- `emissive_gi`
- `light_propagation_volume`
- `lightmap_baked`
- `lightmap_dynamic`
- `planar_reflection`
- `radiance_cascades`
- `screen_space_reflection`
- `voxel_cone_trace`

### size-scale (11 uncovered)

- `building_scale`
- `city_scale`
- `colossal`
- `expandable`
- `human_scale`
- `microscale`
- `miniature`
- `planetary_scale`
- `pocket_sized`
- `shrinkable`
- `towering`

### twin-earth (10 uncovered)

- `degradation_audio_narration`
- `earth_boundary`
- `earth_poi`
- `game_geo_heading`
- `location_quest_radius`
- `place_capacity`
- `place_schedule`
- `privacy_anonymization`
- `privacy_audit_log`
- `privacy_retention_policy`

### education-learning (9 uncovered)

- `archaeological_artifact`
- `astronomical`
- `gallery_piece`
- `geographic`
- `geological`
- `hint_system`
- `knowledge_check`
- `museum_exhibit`
- `slow_motion`

### fabrication-devices (9 uncovered)

- `cnc_millable`
- `embroiderable`
- `fabrication_ready`
- `fdm_target`
- `laser_cuttable`
- `printability_feedback`
- `printable`
- `resin_target`
- `vinyl_cuttable`

### measurement-sensing (8 uncovered)

- `air_quality`
- `filament_sensor`
- `humidity_sensor`
- `noise_level`
- `power_monitor`
- `thermometer`
- `vibration_sensor`
- `weighable`

### construction-building (8 uncovered)

- `elevator`
- `ladder`
- `paintable_surface`
- `placeable`
- `pressure_plate`
- `staircase`
- `terrain_modifiable`
- `tripwire`

### emotion-mood (8 uncovered)

- `chaotic`
- `desolate`
- `eerie`
- `majestic`
- `melancholic`
- `serene`
- `triumphant`
- `whimsical`

### enterprise-multitenancy (8 uncovered)

- `audit_trail`
- `quota_gaussian`
- `quota_render_credits`
- `quota_scene`
- `quota_storage`
- `sso_oidc`
- `sso_saml`
- `sso_session`

### physical-affordances (8 uncovered)

- `bellows`
- `fulcrum`
- `gear_mechanism`
- `latch`
- `piston`
- `pulley`
- `ratchet`
- `spring_loaded`

### transportation-vehicles (7 uncovered)

- `autopilot`
- `cargo_hold`
- `fuelable`
- `landable`
- `launchable`
- `passenger_seat`
- `towable`

### resource-gathering (7 uncovered)

- `cookable`
- `distillable`
- `fishable`
- `forgeable`
- `harvestable`
- `mineable`
- `recyclable`

### analytics-observability (6 uncovered)

- `metrics_aggregator`
- `metrics_dashboard`
- `metrics_sink`
- `otel_metric`
- `otel_span`
- `otel_trace`

### procedural-generation (6 uncovered)

- `marching_cubes`
- `maze_generator`
- `noise_generator`
- `procedural_dialogue`
- `procedural_weather`
- `road_generator`

### musical-sound (5 uncovered)

- `ambient_sound`
- `harmony`
- `melody`
- `percussion`
- `sound_absorber`

### hologram-media (5 uncovered)

- `animated_texture`
- `depth_sequence`
- `depth_to_normal`
- `gaussian_splatting`
- `temporal_smoothing`

### vfx-audio (5 uncovered)

- `vfx_particle_dust`
- `vfx_particle_emitter`
- `vfx_particle_fog`
- `vfx_particle_rain`
- `vfx_particle_snow`

### post-processing (4 uncovered)

- `glitch_effect`
- `lut_color`
- `outline_effect`
- `pixelate_effect`

### state-persistence (3 uncovered)

- `charged`
- `depleted`
- `phased`

### multisensory-haptic (3 uncovered)

- `electric_sensation`
- `tingling`
- `vibrating`

### v43-ai-xr (2 uncovered)

- `ai_vision`
- `eye_hand_fusion`

### social-commerce (2 uncovered)

- `limited_edition`
- `seasonal_item`

### interop-copresence (2 uncovered)

- `stt`
- `tts`

### weather-particles (2 uncovered)

- `firefly_emitter`
- `pollen_emitter`

### volumetric-webgpu (2 uncovered)

- `print_twin`
- `scan_to_sculpt`

### payment (2 uncovered)

- `micro_payment`
- `x402_settlement`

### safety-boundaries (1 uncovered)

- `tutorial_zone`

### connector-integration (1 uncovered)

- `on_connector_event`
