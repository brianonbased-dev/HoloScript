/**
 * Tool Scope Mapping — Gate 2 Authorization
 *
 * Maps every MCP tool to the OAuth 2.1 scopes required to invoke it.
 * Gate 2 (LLM->MCP tool authorization) checks that the authenticated
 * token's scopes include the required scope for each tool call.
 *
 * Scope hierarchy:
 *   admin:*        → grants everything
 *   tools:read     → parse, validate, list, explain, analyze, documentation
 *   tools:write    → generate, compile, render, share, edit, convert
 *   tools:codebase → absorb, query, impact, detect changes, graph RAG
 *   tools:browser  → browser_launch, browser_execute, browser_screenshot
 *   tools:admin    → self-improve, diagnostics, training data
 *   a2a:tasks      → A2A task lifecycle
 *   scenes:read    → read scene data
 *   scenes:write   → store scenes
 */

import type { OAuthScope } from './oauth21';

// ── Tool-to-Scope Mapping ────────────────────────────────────────────────────

const TOOL_SCOPE_MAP: Record<string, OAuthScope[]> = {
  // === Read-only language tools ===
  parse_hs: ['tools:read'],
  parse_holo: ['tools:read'],
  parse_pipeline: ['tools:read'],
  validate_holoscript: ['tools:read'],
  list_traits: ['tools:read'],
  explain_trait: ['tools:read'],
  get_syntax_reference: ['tools:read'],
  get_examples: ['tools:read'],
  explain_code: ['tools:read'],
  analyze_code: ['tools:read'],

  // === Write / generative tools ===
  suggest_traits: ['tools:write'],
  suggest_2d_traits: ['tools:write'],
  generate_object: ['tools:write'],
  generate_scene: ['tools:write'],
  generate_semantic_ui: ['tools:write'],
  holo_hologram_from_media: ['tools:write'],
  holo_hologram_compile_quilt: ['tools:write'],
  holo_hologram_compile_mvhevc: ['tools:write'],
  holo_hologram_render: ['tools:write'],
  holo_hologram_publish_feed: ['tools:write'],
  holo_hologram_send: ['tools:write'],
  holo_holotwin_connect: ['tools:write'],
  holo_holotwin_map_sensor: ['tools:write'],
  holo_holotwin_compile_quilt: ['tools:write'],
  holo_holotwin_stream: ['tools:write'],
  holo_holotwin_status: ['tools:read'],
  holo_holotwin_disconnect: ['tools:write'],
  holo_holotwin_example: ['tools:write'],
  render_preview: ['tools:write'],
  create_share_link: ['tools:write'],
  convert_format: ['tools:write'],
  edit_holo: ['tools:write'],
  generate_3d_object: ['tools:write'],
  compose_workflow: ['tools:write'],
  execute_workflow: ['tools:write'],
  workflow_memory_write: ['tools:write'],
  workflow_memory_read: ['tools:read'],
  workflow_memory_subscribe: ['tools:read'],

  // === Batch meta-tools (each inner call is re-authorized independently) ===
  batch_tool_call: ['tools:read'],
  holoscript_batch_execute: ['tools:read'],

  // === Sovereign from-scratch training ===
  holo_from_scratch_status: ['tools:read'],
  holo_from_scratch_launch: ['tools:admin'],

  // === HoloLand MCP tools (world CRUD + MMO + Twin Earth) ===
  generate_world_from_prompt: ['tools:write'],
  generate_world: ['tools:write'],
  create_world: ['tools:write'],
  get_world: ['tools:read'],
  update_world: ['tools:write'],
  delete_world: ['tools:write'],
  list_worlds: ['tools:read'],
  create_shard: ['tools:write'],
  get_shard: ['tools:read'],
  update_shard: ['tools:write'],
  delete_shard: ['tools:write'],
  list_shards: ['tools:read'],
  create_zone: ['tools:write'],
  get_zone: ['tools:read'],
  update_zone: ['tools:write'],
  delete_zone: ['tools:write'],
  list_zones: ['tools:read'],
  create_place: ['tools:write'],
  get_place: ['tools:read'],
  update_place: ['tools:write'],
  delete_place: ['tools:write'],
  list_places: ['tools:read'],
  create_location_quest: ['tools:write'],
  get_location_quest: ['tools:read'],
  update_location_quest: ['tools:write'],
  delete_location_quest: ['tools:write'],
  list_location_quests: ['tools:read'],

  // === HoloLand MMO / Twin Earth product actions ===
  hololand_shard_status: ['tools:read'],
  hololand_publish_zone: ['tools:write'],
  hololand_create_geo_anchor: ['tools:write'],
  hololand_steward_tick: ['tools:admin'],
  hololand_capture_runtime_receipt: ['tools:admin'],

  // === Graph understanding (read-only analysis) ===
  holo_parse_to_graph: ['tools:read'],
  holo_visualize_flow: ['tools:read'],
  holo_get_node_connections: ['tools:read'],
  holo_design_graph: ['tools:write'],
  holo_diff_graphs: ['tools:read'],
  holo_suggest_connections: ['tools:read'],

  // === IDE tools (read-heavy, some write) ===
  hs_scan_project: ['tools:read'],
  hs_diagnostics: ['tools:read'],
  hs_autocomplete: ['tools:read'],
  hs_refactor: ['tools:write'],
  hs_docs: ['tools:read'],
  hs_code_action: ['tools:write'],
  hs_hover: ['tools:read'],
  hs_go_to_definition: ['tools:read'],
  hs_find_references: ['tools:read'],

  // === Brittney-Lite AI ===
  hs_ai_explain_error: ['tools:read'],
  hs_ai_fix_code: ['tools:write'],
  hs_ai_review: ['tools:read'],
  hs_ai_scaffold: ['tools:write'],

  // === Codebase intelligence ===
  holo_absorb_manifest: ['tools:read', 'tools:codebase'],
  holo_graph_status: ['tools:codebase'],
  holo_absorb_repo: ['tools:codebase'],
  holo_cancel_absorb: ['tools:codebase'],
  holo_query_codebase: ['tools:codebase'],
  holo_impact_analysis: ['tools:codebase'],
  holo_detect_changes: ['tools:codebase'],

  // === Graph RAG ===
  holo_semantic_search: ['tools:codebase'],
  holo_ask_codebase: ['tools:codebase'],
  holo_visual_graph_context: ['tools:codebase'],

  // === Self-improve (admin) ===
  holo_self_diagnose: ['tools:admin'],
  holo_validate_quality: ['tools:admin'],

  // === Compiler tools ===
  compile_holoscript: ['tools:write'],
  compile_pipeline: ['tools:write'],
  compile_to_unity: ['tools:write'],
  compile_to_unreal: ['tools:write'],
  compile_to_urdf: ['tools:write'],
  compile_to_webgpu: ['tools:write'],
  compile_to_character_webgpu: ['tools:write'],
  compile_to_omnigent_agent_yaml: ['tools:write'],
  compile_to_r3f: ['tools:write'],
  compile_to_godot: ['tools:write'],
  compile_to_openxr: ['tools:write'],
  get_compilation_status: ['tools:read'],

  // === Browser control ===
  browser_session: ['tools:browser'],
  browser_launch: ['tools:browser'],
  browser_execute: ['tools:browser'],
  browser_screenshot: ['tools:browser'],

  // === GLTF Import/Export ===
  import_gltf: ['tools:write'],
  compile_to_gltf: ['tools:write'],

  // === Networking ===
  push_state_delta: ['tools:write'],
  fetch_authoritative_state: ['tools:read'],

  // === Temporal Snapshots ===
  create_temporal_snapshot: ['tools:write'],
  load_temporal_snapshot: ['tools:read'],
  rewind_world_state: ['tools:write'],

  // === Monitoring ===
  get_telemetry_metrics: ['tools:read'],

  // === HoloTest / Eval ===
  execute_holotest: ['tools:admin'],
  execute_eval: ['tools:admin'],

  // === Wisdom/Gotcha ===
  holo_query_wisdom: ['tools:read'],
  holo_list_gotchas: ['tools:read'],
  holo_check_gotchas: ['tools:read'],
  holo_add_wisdom: ['tools:admin'],
  holo_add_gotcha: ['tools:admin'],

  // === Receipt Capability Query ===
  holo_query_receipts: ['tools:read'],
  holo_list_receipt_capabilities: ['tools:read'],

  // === Training data generation (admin) ===
  generate_hololand_training: ['tools:admin'],

  // === Refactor/Codegen ===
  holo_refactor_plan: ['tools:write'],
  holo_scaffold: ['tools:write'],

  // === Absorb Service ===
  absorb_create_project: ['tools:codebase'],
  absorb_get_credits: ['tools:codebase'],
  absorb_run_absorb: ['tools:codebase'],
  absorb_run_improve: ['tools:codebase'],
  absorb_query: ['tools:codebase'],
  absorb_render: ['tools:write'],
  absorb_diff: ['tools:codebase'],
  absorb_get_pipeline: ['tools:codebase'],
  absorb_run_pipeline: ['tools:codebase'],
  absorb_get_project: ['tools:codebase'],

  // === HoloMesh (spatial mesh, A2A discovery) ===
  holomesh_status: ['tools:read'],
  holomesh_discover: ['tools:read'],
  holomesh_publish_tool: ['tools:write'],
  holomesh_invoke_tool: ['tools:write'],
  holomesh_gossip: ['tools:write', 'tools:admin'],
  holomesh_contribute: ['tools:write'],
  holomesh_query: ['tools:read'],
  holomesh_subscribe: ['tools:read'],
  holomesh_collect: ['tools:write'],

  // === HoloMesh Board / Slots / Mode ===
  holomesh_board_list: ['tools:read'],
  holomesh_board_done_log: ['tools:read'],
  holomesh_board_add: ['tools:write'],
  holomesh_board_claim: ['tools:write'],
  holomesh_board_complete: ['tools:write'],
  holomesh_slot_assign: ['tools:write', 'tools:admin'],
  holomesh_mode_set: ['tools:write', 'tools:admin'],

  // === Railway Deployment (registered dynamically via connector) ===
  railway_project_create: ['tools:admin'],
  railway_service_create: ['tools:admin'],
  railway_deploy: ['tools:admin'],
  railway_variable_set: ['tools:admin'],
  railway_domain_add: ['tools:admin'],
  railway_deployment_status: ['tools:read'],

  // === Secrets Broker (security-gated) ===
  holo_secrets_grant: ['tools:admin'],
  holo_secrets_resolve: ['tools:admin'],
  holo_secrets_revoke: ['tools:admin'],

  // === Conformance Artifact Admission Gate (HoloGate §admission) ===
  // conformance_list_rules: read-only catalog query
  // conformance_check_artifact: validates an artifact against the admission gate (no side-effects)
  // conformance_admit_artifact: explicit admission decision — same validation but framed as an
  //   authoritative gate action (ecosystem write-once receipt implied); mapped to tools:write
  //   so it gates behind the same scope as other ecosystem mutation tools.
  conformance_list_rules: ['tools:read'],
  conformance_check_artifact: ['tools:read'],
  conformance_admit_artifact: ['tools:write'],

  // === HIGH-RISK tools that were REGISTERED but UNMAPPED (task_1783794507029) ===
  // These fell through to the fail-open default (['tools:read']) — i.e. money movement,
  // token minting, physical robot actuation, safety-envelope CRUD, autonomous control,
  // sovereign-state restore, fleet compute spend, plugin install, and memory graduation
  // were all invokable with only tools:read. Pin each to its true least-privilege scope.
  // Economy / real spend:
  settle_creator_payout: ['tools:admin'],
  execute_economic_contract: ['tools:admin'],
  sim_run_paid: ['tools:admin'],
  get_creator_earnings: ['tools:read'],
  // Agent identity / token minting:
  issue_agent_token: ['tools:admin'],
  verify_agent_token: ['tools:read'],
  delegate_task: ['tools:admin'],
  // Twin Earth — physical robot actuation, identity, permissions, and SAFETY envelopes:
  twin_earth_robot_actuate: ['tools:admin'],
  twin_earth_register_identity: ['tools:admin'],
  twin_earth_revoke_identity: ['tools:admin'],
  twin_earth_grant_permission: ['tools:admin'],
  twin_earth_revoke_permission: ['tools:admin'],
  twin_earth_create_safety_envelope: ['tools:admin'],
  twin_earth_update_safety_envelope: ['tools:admin'],
  twin_earth_delete_safety_envelope: ['tools:admin'],
  // Autonomous control / federation / sovereign state:
  holomesh_autonomous_control: ['tools:admin'],
  holomesh_federate_twin_earth: ['tools:admin'],
  holomesh_sovereign_lifepod_restore: ['tools:admin'],
  holomesh_sovereign_lifepod_snapshot: ['tools:admin'],
  // Fleet compute spend / training / hardware:
  render_world_on_fleet: ['tools:admin'],
  train_rom: ['tools:admin'],
  sync_hardware_loop: ['tools:admin'],
  // Plugin install (arbitrary code) / memory canon:
  install_plugin: ['tools:admin'],
  install_domain_plugin: ['tools:admin'],
  manage_plugin: ['tools:admin'],
  holo_memory_graduate: ['tools:admin'],
  holo_memory_store: ['tools:write'],
  compile_to_daimon_seed: ['tools:write'],
  // HoloLand identity provisioning / revocation:
  hololand_provision_player: ['tools:admin'],
  hololand_provision_agent: ['tools:admin'],
  hololand_provision_creator: ['tools:admin'],
  hololand_revoke_agent: ['tools:admin'],
  // === v2g4: least-privilege scopes for the 242 previously-unmapped registered tools.
  // Classified + ADVERSARIALLY VERIFIED by a 73-agent workflow that read each handler
  // (dangerous-first rubric). 8 new admin tools surfaced beyond zvor's 28; 2 were flipped by
  // the verify pass (holomesh_team_compound write->read = pure read; hololand_create_player_invite
  // admin->write = invite link, not provisioning). Every entry here is explicit so it is greppable
  // and regression-pinned by the completeness test (no tool falls to the classifier fail-closed).
  // admin (money/token/actuation/identity/spend/install/canon — adversarially verified):
  holo_ci_dispatch: ['tools:admin'],
  holo_protocol_collect: ['tools:admin'],
  holo_protocol_publish: ['tools:admin'],
  hololand_revoke_creator: ['tools:admin'],
  hololand_revoke_player: ['tools:admin'],
  holotune_launch: ['tools:admin'],
  holotune_promote: ['tools:admin'],
  twin_earth_update_identity: ['tools:admin'],
  // codebase intelligence:
  absorb_provenance_answer: ['tools:codebase'],
  absorb_run_query_ai: ['tools:codebase'],
  holo_detect_drift: ['tools:codebase'],
  holo_generate_refactor_plan: ['tools:codebase'],
  holo_get_absorb_status: ['tools:codebase'],
  holo_resolve_symbol: ['tools:codebase'],
  // write / generative / state-mutating:
  absorb_delete_project: ['tools:write'],
  absorb_fmu: ['tools:write'],
  absorb_run_render: ['tools:write'],
  absorb_typescript: ['tools:write'],
  compile_to_3dgs: ['tools:write'],
  compile_to_3dtiles: ['tools:write'],
  compile_to_a2a_agent_card: ['tools:write'],
  compile_to_agent_inference: ['tools:write'],
  compile_to_ai_glasses: ['tools:write'],
  compile_to_android: ['tools:write'],
  compile_to_android_xr: ['tools:write'],
  compile_to_bias_audit_report: ['tools:write'],
  compile_to_bot_swarm: ['tools:write'],
  compile_to_canvas2d_game: ['tools:write'],
  compile_to_code_editor: ['tools:write'],
  compile_to_colyseus: ['tools:write'],
  compile_to_dtdl: ['tools:write'],
  compile_to_dungeon_instance: ['tools:write'],
  compile_to_edge: ['tools:write'],
  compile_to_embodied_dataset: ['tools:write'],
  compile_to_flutter: ['tools:write'],
  compile_to_fmu: ['tools:write'],
  compile_to_gaussian_train: ['tools:write'],
  compile_to_holob: ['tools:write'],
  compile_to_ios: ['tools:write'],
  compile_to_lens_studio: ['tools:write'],
  compile_to_llama_server: ['tools:write'],
  compile_to_mcp_config: ['tools:write'],
  compile_to_mcp_server: ['tools:write'],
  compile_to_mjcf: ['tools:write'],
  compile_to_mjx: ['tools:write'],
  compile_to_nft_marketplace: ['tools:write'],
  compile_to_nir: ['tools:write'],
  compile_to_node_service: ['tools:write'],
  compile_to_onnx: ['tools:write'],
  compile_to_openapi: ['tools:write'],
  compile_to_openxr_spatial_entities: ['tools:write'],
  compile_to_pcg_graph: ['tools:write'],
  compile_to_qasm: ['tools:write'],
  compile_to_quest: ['tools:write'],
  compile_to_rom_twin: ['tools:write'],
  compile_to_ros2_deploy: ['tools:write'],
  compile_to_scm: ['tools:write'],
  compile_to_sdf: ['tools:write'],
  compile_to_sdk: ['tools:write'],
  compile_to_state: ['tools:write'],
  compile_to_stl_export: ['tools:write'],
  compile_to_svg: ['tools:write'],
  compile_to_tsl: ['tools:write'],
  compile_to_usd: ['tools:write'],
  compile_to_usdz: ['tools:write'],
  compile_to_visionos: ['tools:write'],
  compile_to_vrchat: ['tools:write'],
  compile_to_wasm: ['tools:write'],
  compile_to_world_shard: ['tools:write'],
  compile_trait_composition: ['tools:write'],
  export_traces_otlp: ['tools:write'],
  fairness_sweep: ['tools:write'],
  generate_service_contract: ['tools:write'],
  holo_edit_file: ['tools:write'],
  holo_generate_bindings: ['tools:write'],
  holo_generate_mesh: ['tools:write'],
  holo_generate_semantic_scene_graph: ['tools:write'],
  holo_git_commit: ['tools:write'],
  holo_hologram_inject_world: ['tools:write'],
  holo_hologram_upload_bundle: ['tools:write'],
  holo_oracle_synthesize: ['tools:write'],
  holo_reconstruct_export: ['tools:write'],
  holo_reconstruct_from_video: ['tools:write'],
  holo_reconstruct_step: ['tools:write'],
  holo_run_related_tests: ['tools:write'],
  holo_run_tests_targeted: ['tools:write'],
  holo_scaffold_code: ['tools:write'],
  holo_service_scaffold: ['tools:write'],
  holo_tunnel_close: ['tools:write'],
  holo_tunnel_create: ['tools:write'],
  holo_write_file: ['tools:write'],
  hololand_brittney_npc_mode: ['tools:write'],
  hololand_create_npc: ['tools:write'],
  hololand_create_player_invite: ['tools:write'],
  hololand_delete_npc: ['tools:write'],
  hololand_npc_generate_dialogue: ['tools:write'],
  hololand_update_npc: ['tools:write'],
  holomesh_board_append_commit: ['tools:write'],
  holomesh_crosspost_moltbook: ['tools:write'],
  holomesh_gossip_sync: ['tools:write'],
  // heartbeat is a presence keepalive that EVERY non-admin agent (incl. read-only monitors) issues;
  // task_1783805494038 names it a flow that must not break. Kept at tools:read (least-privilege that
  // preserves the liveness ping) even though it updates a presence timestamp — a human override of the
  // classifier's semantic write call, per the task's runtime-verify requirement.
  holomesh_heartbeat: ['tools:read'],
  holomesh_mark_read: ['tools:write'],
  holomesh_moltbook_crosspost: ['tools:write'],
  holomesh_publish_agent_template: ['tools:write'],
  holomesh_publish_insight: ['tools:write'],
  holomesh_reply: ['tools:write'],
  holomesh_scout: ['tools:write'],
  holomesh_send_message: ['tools:write'],
  holomesh_suggest: ['tools:write'],
  holomesh_suggest_vote: ['tools:write'],
  holomesh_team_load_agents: ['tools:write'],
  holomesh_team_run_cycle: ['tools:write'],
  holomesh_upvote_reply: ['tools:write'],
  holoscript_compile_education: ['tools:write'],
  holoscript_compile_healthcare: ['tools:write'],
  holoscript_compile_iot: ['tools:write'],
  holoscript_compile_music: ['tools:write'],
  holoscript_compile_robotics: ['tools:write'],
  holoscript_compose_traits: ['tools:write'],
  holoscript_map_csv: ['tools:write'],
  holoscript_map_schema: ['tools:write'],
  holoshell_download_recovery_forensic_export: ['tools:write'],
  holoshell_download_recovery_import_handoff: ['tools:write'],
  holoshell_download_recovery_quarantine: ['tools:write'],
  holoshell_download_recovery_resume: ['tools:write'],
  holotune_curate: ['tools:write'],
  holotune_download: ['tools:write'],
  push_portal_intent: ['tools:write'],
  solve_logic: ['tools:write'],
  solve_structural: ['tools:write'],
  solve_thermal: ['tools:write'],
  stream_world_tiles: ['tools:write'],
  twin_earth_ai_invoke: ['tools:write'],
  twin_earth_capture_receipt: ['tools:write'],
  // read-only / no side effects:
  absorb_check_credits: ['tools:read'],
  absorb_list_projects: ['tools:read'],
  absorb_suggest_holoscript_transform: ['tools:read'],
  alphafold_fetch_structure: ['tools:read'],
  check_agent_budget: ['tools:read'],
  check_permission: ['tools:read'],
  discover_agents: ['tools:read'],
  discover_plugins: ['tools:read'],
  explain_fairness_receipt: ['tools:read'],
  explain_service_contract: ['tools:read'],
  get_agent_health: ['tools:read'],
  get_api_reference: ['tools:read'],
  get_circuit_breaker_status: ['tools:read'],
  get_delegation_chain: ['tools:read'],
  get_dev_dashboard_state: ['tools:read'],
  get_metrics_prometheus: ['tools:read'],
  get_task_status: ['tools:read'],
  get_tool_health: ['tools:read'],
  get_tool_manifest: ['tools:read'],
  get_unified_budget_state: ['tools:read'],
  get_usage_summary: ['tools:read'],
  get_workspace_info: ['tools:read'],
  holo_batch_type_fix: ['tools:read'],
  holo_critic: ['tools:read'],
  holo_estimate_task_duration: ['tools:read'],
  holo_founder: ['tools:read'],
  holo_hologram_get_asset: ['tools:read'],
  holo_list_type_errors: ['tools:read'],
  holo_map_paper_ingest_probe: ['tools:read'],
  holo_memory_farm: ['tools:read'],
  holo_memory_list: ['tools:read'],
  holo_memory_recall: ['tools:read'],
  holo_memory_stats: ['tools:read'],
  holo_oracle_consult: ['tools:read'],
  holo_oracle_curate: ['tools:read'],
  holo_oracle_discover: ['tools:read'],
  holo_oracle_explore: ['tools:read'],
  holo_oracle_gaps: ['tools:read'],
  holo_premortem: ['tools:read'],
  holo_protocol_lookup: ['tools:read'],
  holo_protocol_revenue: ['tools:read'],
  holo_quality_trend: ['tools:read'],
  holo_read_file: ['tools:read'],
  holo_reconstruct_anchor: ['tools:read'],
  holo_semantic_scene_graph: ['tools:read'],
  holo_task_kolmogorov_score: ['tools:read'],
  holo_tunnel_status: ['tools:read'],
  holo_verify_before_commit: ['tools:read'],
  hololand_get_agent: ['tools:read'],
  hololand_get_creator: ['tools:read'],
  hololand_get_geo_anchor: ['tools:read'],
  hololand_get_invite: ['tools:read'],
  hololand_get_npc: ['tools:read'],
  hololand_get_player: ['tools:read'],
  hololand_list_agents: ['tools:read'],
  hololand_list_creators: ['tools:read'],
  hololand_list_geo_anchors: ['tools:read'],
  hololand_list_npcs: ['tools:read'],
  hololand_list_players: ['tools:read'],
  hololand_npc_byok_status: ['tools:read'],
  hololand_twin_earth_contract: ['tools:read'],
  hololand_twin_earth_substrate_status: ['tools:read'],
  holomesh_agent_capabilities: ['tools:read'],
  holomesh_discussion: ['tools:read'],
  holomesh_feed_source: ['tools:read'],
  holomesh_inbox: ['tools:read'],
  holomesh_knowledge_read: ['tools:read'],
  holomesh_marketplace_search: ['tools:read'],
  holomesh_notifications: ['tools:read'],
  holomesh_presence: ['tools:read'],
  holomesh_query_spatial: ['tools:read'],
  holomesh_read_thread: ['tools:read'],
  holomesh_search: ['tools:read'],
  holomesh_sovereign_topology: ['tools:read'],
  holomesh_suggest_list: ['tools:read'],
  holomesh_team_compound: ['tools:read'],
  holomesh_team_form: ['tools:read'],
  holomesh_wallet_status: ['tools:read'],
  holoscript_audit_numbers: ['tools:read'],
  holoscript_code_health: ['tools:read'],
  holoscript_select_modality: ['tools:read'],
  holoshell_download_recovery_list: ['tools:read'],
  holotune_eval: ['tools:read'],
  holotune_serve: ['tools:read'],
  holotune_status: ['tools:read'],
  inspect_trace_waterfall: ['tools:read'],
  list_export_targets: ['tools:read'],
  list_plugins: ['tools:read'],
  optimize_scene_budget: ['tools:read'],
  query_traces: ['tools:read'],
  rig_match_skeleton: ['tools:read'],
  serve_preview: ['tools:read'],
  sim_fleet_status: ['tools:read'],
  sim_quote: ['tools:read'],
  suggest_tools_for_goal: ['tools:read'],
  suggest_universal_traits: ['tools:read'],
  twin_earth_get_identity: ['tools:read'],
  twin_earth_get_safety_envelope: ['tools:read'],
  twin_earth_list_identities: ['tools:read'],
  twin_earth_list_permissions: ['tools:read'],
  twin_earth_list_safety_envelopes: ['tools:read'],
  twin_earth_validate_permission: ['tools:read'],
  validate_composition: ['tools:read'],
  validate_marketplace_pricing: ['tools:read'],
  verify_cael_trace: ['tools:read'],
  verify_cross_perceiver: ['tools:read'],
  verify_verified_view: ['tools:read'],
  // === v2g4-delta: the 25 tools that ALL_AVAILABLE_TOOLS adds beyond the 426-tool base
  // (daemon-lifecycle / GRPO / negotiation / compute-trace / spatial). Same classify+verify
  // workflow. holo_run_grpo_pass verified as WRITE (local test/lint scoring, NOT fleet/GPU spend);
  // negotiation_settle is the one admin (settles a money contract). ===
  // admin:
  negotiation_settle: ['tools:admin'],
  // write:
  compile_to_spatial: ['tools:write'],
  holo_create_daemon: ['tools:write'],
  holo_daemon_emergence_check: ['tools:write'],
  holo_daemon_turn: ['tools:write'],
  holo_export_compute_traces: ['tools:write'],
  holo_export_emergence_corpus: ['tools:write'],
  holo_extract_grpo_prompts: ['tools:write'],
  holo_grade_compute_mutation: ['tools:write'],
  holo_observe_soul: ['tools:write'],
  holo_run_grpo_pass: ['tools:write'],
  holo_update_daemon_ritual: ['tools:write'],
  negotiation_accept: ['tools:write'],
  negotiation_dispute: ['tools:write'],
  negotiation_execute: ['tools:write'],
  negotiation_quote: ['tools:write'],
  negotiation_reject: ['tools:write'],
  negotiation_request_quote: ['tools:write'],
  visualize_query_result: ['tools:write'],
  // read:
  holo_compute_trace_stats: ['tools:read'],
  holo_get_daemon: ['tools:read'],
  holo_list_daemons: ['tools:read'],
  holoscript_discover_tools: ['tools:read'],
  negotiation_get: ['tools:read'],
  negotiation_list: ['tools:read'],
};

// ── Scope Classification ─────────────────────────────────────────────────────

/** Risk levels for tool operations */
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

const TOOL_RISK_MAP: Record<string, ToolRiskLevel> = {
  // Low risk: read-only, no side effects
  parse_hs: 'low',
  parse_holo: 'low',
  parse_pipeline: 'low',
  validate_holoscript: 'low',
  list_traits: 'low',
  explain_trait: 'low',
  get_syntax_reference: 'low',
  get_examples: 'low',
  explain_code: 'low',
  analyze_code: 'low',
  hs_hover: 'low',
  hs_docs: 'low',
  holo_from_scratch_status: 'low',
  holo_absorb_manifest: 'low',

  // Meta-dispatch is side-effect free itself; inner tools retain their own risk.
  batch_tool_call: 'medium',
  holoscript_batch_execute: 'medium',

  // Medium risk: generates content but no side effects
  suggest_traits: 'medium',
  suggest_2d_traits: 'medium',
  generate_object: 'medium',
  generate_scene: 'medium',
  generate_semantic_ui: 'medium',
  holo_hologram_from_media: 'medium',
  holo_hologram_compile_quilt: 'medium',
  holo_hologram_compile_mvhevc: 'medium',
  convert_format: 'medium',
  compile_holoscript: 'medium',
  compile_pipeline: 'medium',

  // High risk: external side effects, file I/O, browser control
  render_preview: 'high',
  create_share_link: 'high',
  edit_holo: 'high',
  browser_session: 'high',
  browser_launch: 'high',
  browser_execute: 'high',
  browser_screenshot: 'high',
  holo_absorb_repo: 'high',
  holo_hologram_render: 'high',
  holo_hologram_publish_feed: 'high',
  holo_hologram_send: 'high',

  // Critical: admin operations, self-modification
  holo_self_diagnose: 'critical',
  holo_validate_quality: 'critical',
  execute_holotest: 'critical',
  execute_eval: 'critical',
  generate_hololand_training: 'critical',
  holo_add_wisdom: 'critical',
  holo_add_gotcha: 'critical',
  holo_from_scratch_launch: 'critical',

  // HoloMesh: spatial networking
  holomesh_status: 'low',
  holomesh_discover: 'low',
  holomesh_publish_tool: 'medium',
  holomesh_invoke_tool: 'high',
  holomesh_query: 'low',
  holomesh_subscribe: 'low',
  holomesh_contribute: 'medium',
  holomesh_collect: 'medium',
  holomesh_gossip: 'high',

  // HoloLand MMO / Twin Earth product actions
  hololand_shard_status: 'low',
  hololand_publish_zone: 'medium',
  hololand_create_geo_anchor: 'medium',
  hololand_steward_tick: 'high',
  hololand_capture_runtime_receipt: 'high',

  // HoloMesh Board / Slots / Mode
  holomesh_board_list: 'low',
  holomesh_board_done_log: 'low',
  holomesh_board_add: 'medium',
  holomesh_board_claim: 'medium',
  holomesh_board_complete: 'medium',
  holomesh_slot_assign: 'high',
  holomesh_mode_set: 'high',

  // Railway Deployment
  railway_project_create: 'critical',
  railway_service_create: 'critical',
  railway_deploy: 'critical',
  railway_variable_set: 'critical',
  railway_domain_add: 'high',
  railway_deployment_status: 'low',

  // Secrets Broker
  holo_secrets_grant: 'critical',
  holo_secrets_resolve: 'critical',
  holo_secrets_revoke: 'critical',

  // Conformance Artifact Admission Gate (HoloGate §admission)
  conformance_list_rules: 'low',
  conformance_check_artifact: 'medium',
  conformance_admit_artifact: 'high',

  // High-risk previously-unmapped tools (task_1783794507029) — see TOOL_SCOPE_MAP above.
  settle_creator_payout: 'critical',
  execute_economic_contract: 'critical',
  sim_run_paid: 'critical',
  get_creator_earnings: 'low',
  issue_agent_token: 'critical',
  verify_agent_token: 'low',
  delegate_task: 'high',
  twin_earth_robot_actuate: 'critical',
  twin_earth_register_identity: 'critical',
  twin_earth_revoke_identity: 'critical',
  twin_earth_grant_permission: 'critical',
  twin_earth_revoke_permission: 'critical',
  twin_earth_create_safety_envelope: 'critical',
  twin_earth_update_safety_envelope: 'critical',
  twin_earth_delete_safety_envelope: 'critical',
  holomesh_autonomous_control: 'critical',
  holomesh_federate_twin_earth: 'critical',
  holomesh_sovereign_lifepod_restore: 'critical',
  holomesh_sovereign_lifepod_snapshot: 'high',
  render_world_on_fleet: 'critical',
  train_rom: 'critical',
  sync_hardware_loop: 'high',
  install_plugin: 'critical',
  install_domain_plugin: 'critical',
  manage_plugin: 'high',
  holo_memory_graduate: 'high',
  holo_memory_store: 'medium',
  compile_to_daimon_seed: 'medium',
  hololand_provision_player: 'high',
  hololand_provision_agent: 'high',
  hololand_provision_creator: 'high',
  hololand_revoke_agent: 'high',
  // v2g4 admin tools — critical risk:
  holo_ci_dispatch: 'critical',
  holo_protocol_collect: 'critical',
  holo_protocol_publish: 'critical',
  hololand_revoke_creator: 'critical',
  hololand_revoke_player: 'critical',
  holotune_launch: 'critical',
  holotune_promote: 'critical',
  twin_earth_update_identity: 'critical',
  // v2g4-delta risk:
  negotiation_settle: 'critical',
  holo_daemon_emergence_check: 'medium',
  holo_export_emergence_corpus: 'medium',
  holo_observe_soul: 'medium',
  holo_run_grpo_pass: 'high',
  negotiation_accept: 'medium',
  negotiation_dispute: 'medium',
  negotiation_execute: 'medium',
  negotiation_quote: 'medium',
  negotiation_request_quote: 'medium',
};

// ── Registry-aware, fail-closed scope resolution (task_1783805494038) ─────────

// The set of tool names the server ACTUALLY registered. Populated at startup by registerKnownTools
// (called from index.ts / http-server.ts with the live tool list, plus plugin tools). Additive, so
// dynamically-installed plugin tools can register their names too. When this is non-empty (i.e. the
// registry is known), authorizeToolCall DENIES any name not in it — even presented with admin:* — so
// a spoofed or unregistered tool name cannot be invoked (fail-closed-on-unregistered). Empty (e.g. a
// unit test that calls authorizeToolCall directly without registering) → the check is skipped.
const KNOWN_TOOLS = new Set<string>();

/** Register live tool names (idempotent, additive). Call at startup and whenever plugins load. */
export function registerKnownTools(names: Iterable<string>): void {
  for (const n of names) {
    const normalized = n.trim();
    if (normalized) KNOWN_TOOLS.add(normalized);
  }
}

/** True once at least one tool has been registered (the live registry is known). */
export function isToolRegistryKnown(): boolean {
  return KNOWN_TOOLS.size > 0;
}

/** True iff the tool name is in the live registry. */
export function isRegisteredTool(name: string): boolean {
  return KNOWN_TOOLS.has(name);
}

/** Reset the registry — test-only helper so suites can exercise the known/unknown paths. */
export function __resetKnownToolsForTest(): void {
  KNOWN_TOOLS.clear();
}

// Dangerous-first keyword classifier — the FALLBACK for a registered tool that is somehow NOT in
// TOOL_SCOPE_MAP. Every tool live today IS in the map (enforced by the completeness test), so this
// only ever classifies a FUTURE tool. Admin triggers are tested FIRST, and the final fallback is
// tools:admin (FAIL-CLOSED): a new, unrecognized tool requires the highest scope until a human maps
// it explicitly — it never silently defaults to tools:read the way the old code did.
const ADMIN_KEYWORDS =
  /settle|payout|economic|_paid\b|_paid_|billing|invoice|spend|wallet|x402|treasury|issue_agent|_mint\b|actuate|robot_|_robot\b|provision_|_provision\b|revoke|register_identity|update_identity|grant_permission|revoke_permission|safety_envelope|autonomous_control|sovereign_lifepod|federate|lifepod|render_world_on_fleet|_from_scratch|from_scratch_|holotune_(?:launch|promote|serve)|holo_ci_dispatch|sync_hardware|train_rom|install_plugin|install_domain|manage_plugin|secrets?_(?:grant|resolve|revoke)|memory_graduate|\bgraduate\b|protocol_(?:publish|collect|revenue)|delete_(?:world|shard|zone|place|npc)|_seed$|steward|capture_runtime|hololand_training/i;
const CODEBASE_KEYWORDS =
  /absorb|codebase|semantic_search|ask_codebase|impact_analysis|resolve_symbol|detect_(?:changes|drift)|refactor_plan|generate_refactor|graph_status|get_absorb|provenance_answer|query_ai/i;
const BROWSER_KEYWORDS = /^browser_/i;
const WRITE_KEYWORDS =
  /^create_|^update_|^delete_|^generate|^compile|^render|^edit_|^import_|^convert|^store|^write|^publish|^send|^add_|_add$|claim|complete|^set_|assign|scaffold|refactor|^launch|^run_|_run\b|reconstruct|snapshot|rewind|contribute|invite|crosspost|npc_generate|steward|capture_runtime/i;
const READ_KEYWORDS =
  /^get_|^list_|^parse_|^validate|^explain|^analyze|^discover|^query|^search|_status$|status$|_list$|health|hover|reference|examples|inspect|read$|_read\b|lookup|estimate|score|^suggest|check_|diff|visualize|topology|manifest|budget|usage|metrics|wisdom/i;

/** Dangerous-first classifier for tools not explicitly mapped. Fail-closed default: tools:admin. */
export function classifyToolScope(toolName: string): OAuthScope[] {
  if (ADMIN_KEYWORDS.test(toolName)) return ['tools:admin'];
  if (CODEBASE_KEYWORDS.test(toolName)) return ['tools:codebase'];
  if (BROWSER_KEYWORDS.test(toolName)) return ['tools:browser'];
  if (WRITE_KEYWORDS.test(toolName)) return ['tools:write'];
  if (READ_KEYWORDS.test(toolName)) return ['tools:read'];
  return ['tools:admin']; // FAIL-CLOSED: an unrecognized tool needs the highest scope until mapped.
}

/**
 * Resolve required scopes: the explicit map wins; otherwise the dangerous-first classifier (which
 * fails closed to tools:admin). This NEVER fail-opens to tools:read the way the old default did.
 */
export function resolveRequiredScopes(toolName: string): OAuthScope[] {
  return TOOL_SCOPE_MAP[toolName] ?? classifyToolScope(toolName);
}

/**
 * True iff the tool has an EXPLICIT scope-map entry (not merely a classifier fallback). The
 * completeness test asserts every REGISTERED tool is explicitly mapped, so a newly-added tool that
 * nobody classified fails CI (rather than silently riding the classifier's fail-closed default).
 */
export function hasExplicitScope(toolName: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_SCOPE_MAP, toolName);
}

// ── Gate 2: Tool Authorization ───────────────────────────────────────────────

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  requiredScopes?: OAuthScope[];
  grantedScopes?: OAuthScope[];
  riskLevel?: ToolRiskLevel;
}

/**
 * Gate 2: Authorize a tool invocation against the authenticated token's scopes.
 *
 * @param toolName - The MCP tool being invoked
 * @param tokenScopes - Scopes granted to the authenticated token
 * @returns Authorization result with reason if denied
 */
export function authorizeToolCall(
  toolName: string,
  tokenScopes: OAuthScope[]
): AuthorizationResult {
  // Fail-closed on unregistered: once the live registry is known, a name that is NOT registered is
  // denied outright — even with admin:* — so a spoofed / unregistered tool name cannot be invoked.
  if (isToolRegistryKnown() && !KNOWN_TOOLS.has(toolName)) {
    return {
      authorized: false,
      reason: `Tool "${toolName}" is not a registered tool (fail-closed on unregistered)`,
      grantedScopes: tokenScopes,
    };
  }

  // Resolve required scopes via the explicit map, else the dangerous-first classifier (fail-closed
  // to tools:admin). NEVER fail-open to tools:read.
  const requiredScopes = resolveRequiredScopes(toolName);

  // admin:* grants everything (for a REGISTERED tool).
  if (tokenScopes.includes('admin:*')) {
    return {
      authorized: true,
      riskLevel: getToolRiskLevel(toolName),
      grantedScopes: tokenScopes,
      requiredScopes,
    };
  }

  // Check if token has ANY of the required scopes
  const hasScope = requiredScopes.some((required) => tokenScopes.includes(required));

  if (!hasScope) {
    return {
      authorized: false,
      reason: `Insufficient scope. Required one of: [${requiredScopes.join(', ')}]. Granted: [${tokenScopes.join(', ')}]`,
      requiredScopes,
      grantedScopes: tokenScopes,
      riskLevel: getToolRiskLevel(toolName),
    };
  }

  return {
    authorized: true,
    requiredScopes,
    grantedScopes: tokenScopes,
    riskLevel: getToolRiskLevel(toolName),
  };
}

/**
 * Get the risk level for a tool.
 */
export function getToolRiskLevel(toolName: string): ToolRiskLevel {
  return TOOL_RISK_MAP[toolName] || 'medium';
}

/**
 * Get the required scopes for a tool.
 */
export function getToolScopes(toolName: string): OAuthScope[] {
  return resolveRequiredScopes(toolName);
}

/**
 * List all tools in a given scope.
 */
export function getToolsForScope(scope: OAuthScope): string[] {
  return Object.entries(TOOL_SCOPE_MAP)
    .filter(([, scopes]) => scopes.includes(scope))
    .map(([name]) => name);
}
