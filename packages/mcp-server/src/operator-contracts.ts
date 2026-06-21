export const OPERATOR_CONTRACT_SCHEMA_VERSION = 1;

export interface OperatorToolRegistration {
  name: string;
}

export interface OperatorToolCallExample {
  name: string;
  arguments: Record<string, unknown>;
}

export interface OperatorDialogueExample {
  intent: string;
  user: string;
  assistant: string;
  toolCall: OperatorToolCallExample;
}

export interface OperatorContract {
  schemaVersion: number;
  toolName: string;
  nlVerbs: string[];
  exampleDialogues: OperatorDialogueExample[];
}

export interface OperatorContractExemption {
  reason: string;
  owner: string;
}

export interface OperatorContractCoverage {
  missingContracts: string[];
  orphanContracts: string[];
  invalidContracts: string[];
}

const OPERATOR_CONTRACT_TOOL_NAMES = `
parse_hs
parse_holo
parse_pipeline
compile_pipeline
validate_holoscript
list_traits
explain_trait
suggest_traits
suggest_universal_traits
suggest_2d_traits
generate_object
generate_scene
generate_semantic_ui
get_syntax_reference
get_examples
explain_code
analyze_code
render_preview
create_share_link
convert_format
holo_parse_to_graph
holo_semantic_scene_graph
holo_visualize_flow
holo_get_node_connections
holo_design_graph
holo_diff_graphs
holo_suggest_connections
holo_generate_semantic_scene_graph
holo_reconstruct_from_video
holo_reconstruct_step
holo_reconstruct_anchor
holo_reconstruct_export
holo_map_paper_ingest_probe
hs_scan_project
hs_diagnostics
hs_autocomplete
hs_refactor
hs_docs
hs_code_action
hs_hover
hs_go_to_definition
hs_find_references
hs_ai_explain_error
hs_ai_fix_code
hs_ai_review
hs_ai_scaffold
generate_3d_object
browser_launch
browser_execute
browser_screenshot
generate_hololand_training
holo_absorb_repo
holo_query_codebase
holo_impact_analysis
holo_detect_changes
holo_graph_status
holo_detect_drift
holo_resolve_symbol
holo_get_absorb_status
holo_semantic_search
holo_ask_codebase
holo_write_file
holo_edit_file
holo_read_file
holo_git_commit
holo_run_tests_targeted
holo_list_type_errors
holo_batch_type_fix
holo_verify_before_commit
holo_run_related_tests
holo_quality_trend
holo_self_diagnose
holo_validate_quality
holo_query_wisdom
holo_list_gotchas
holo_check_gotchas
import_gltf
compile_to_gltf
edit_holo
absorb_query
absorb_diff
absorb_list_projects
absorb_create_project
absorb_delete_project
absorb_check_credits
absorb_run_absorb
absorb_run_improve
absorb_run_query_ai
absorb_run_render
absorb_run_pipeline
generate_service_contract
explain_service_contract
validate_composition
absorb_typescript
absorb_suggest_holoscript_transform
discover_agents
delegate_task
get_task_status
compose_workflow
execute_workflow
query_traces
export_traces_otlp
get_agent_health
get_metrics_prometheus
holo_service_scaffold
install_plugin
install_domain_plugin
discover_plugins
list_plugins
manage_plugin
check_agent_budget
get_usage_summary
get_creator_earnings
optimize_scene_budget
validate_marketplace_pricing
get_unified_budget_state
get_api_reference
serve_preview
get_workspace_info
inspect_trace_waterfall
holo_generate_bindings
get_dev_dashboard_state
holomesh_moltbook_crosspost
holomesh_publish_agent_template
holomesh_publish_tool
holomesh_invoke_tool
holomesh_publish_insight
holomesh_discover
holomesh_contribute
holomesh_query
holomesh_gossip
holomesh_subscribe
holomesh_status
holomesh_collect
holomesh_gossip_sync
holomesh_query_spatial
holomesh_feed_source
holomesh_wallet_status
holomesh_crosspost_moltbook
holomesh_send_message
holomesh_inbox
holomesh_read_thread
holomesh_notifications
holomesh_mark_read
holomesh_reply
holomesh_discussion
holomesh_upvote_reply
holomesh_search
holomesh_board_list
holomesh_board_add
holomesh_board_claim
holomesh_board_complete
holomesh_board_append_commit
holomesh_slot_assign
holomesh_mode_set
holomesh_scout
holomesh_suggest
holomesh_suggest_vote
holomesh_suggest_list
holomesh_heartbeat
holomesh_knowledge_read
holomesh_team_load_agents
holomesh_team_run_cycle
holomesh_team_compound
holomesh_autonomous_control
holomesh_team_form
holomesh_agent_capabilities
holomesh_marketplace_search
holomesh_sovereign_topology
holomesh_sovereign_lifepod_snapshot
holomesh_sovereign_lifepod_restore
holomesh_federate_twin_earth
holo_protocol_publish
holo_protocol_collect
holo_protocol_revenue
holo_protocol_lookup
holoscript_code_health
holo_oracle_consult
solve_structural
solve_thermal
verify_cael_trace
absorb_provenance_answer
get_tool_manifest
suggest_tools_for_goal
batch_tool_call
get_tool_health
holoscript_compose_traits
holoscript_compile_healthcare
holoscript_compile_robotics
holoscript_compile_iot
holoscript_compile_education
holoscript_compile_music
holoscript_map_schema
holoscript_map_csv
holoscript_select_modality
compile_holoscript
compile_to_unity
compile_to_unreal
compile_to_urdf
compile_to_webgpu
# compile_to_r3f — retired apex-poison 2026-06-17
compile_to_godot
compile_to_visionos
compile_to_openxr
# compile_to_babylon — retired apex-poison 2026-06-17
# compile_to_playcanvas — retired apex-poison 2026-06-17
compile_to_vrchat
compile_to_android
compile_to_android_xr
compile_to_ios
# compile_to_ar — retired apex-poison 2026-06-17
compile_to_wasm
compile_to_usd
compile_to_usdz
compile_to_sdf
# compile_to_vrr — retired apex-poison 2026-06-17
compile_to_multi_layer
compile_to_ros2_deploy
compile_to_dtdl
compile_to_nir
# compile_to_native_2d — retired apex-poison 2026-06-17
compile_to_node_service
compile_to_a2a_agent_card
compile_to_state
compile_to_3dgs
compile_to_edge
compile_to_mcp_config
compile_to_qasm
get_compilation_status
list_export_targets
get_circuit_breaker_status
holoscript_audit_numbers
alphafold_fetch_structure
push_state_delta
fetch_authoritative_state
push_portal_intent
create_temporal_snapshot
load_temporal_snapshot
rewind_world_state
get_telemetry_metrics
execute_holotest
execute_eval
holo_generate_refactor_plan
holo_scaffold_code
compile_trait_composition
sync_hardware_loop
execute_economic_contract
generate_world_from_prompt
generate_world
create_world
get_world
update_world
delete_world
list_worlds
create_shard
get_shard
update_shard
delete_shard
list_shards
create_zone
get_zone
update_zone
delete_zone
list_zones
create_place
get_place
update_place
delete_place
list_places
create_location_quest
get_location_quest
update_location_quest
delete_location_quest
list_location_quests
hololand_shard_status
hololand_publish_zone
hololand_create_geo_anchor
hololand_steward_tick
hololand_capture_runtime_receipt
hololand_create_npc
hololand_get_npc
hololand_update_npc
hololand_delete_npc
hololand_list_npcs
hololand_npc_generate_dialogue
hololand_npc_byok_status
hololand_brittney_npc_mode
hololand_twin_earth_contract
hololand_twin_earth_substrate_status
conformance_check_artifact
conformance_admit_artifact
conformance_list_rules
hololand_provision_player
hololand_get_player
hololand_list_players
hololand_revoke_player
hololand_create_player_invite
hololand_get_invite
hololand_provision_creator
hololand_get_creator
hololand_list_creators
hololand_revoke_creator
hololand_provision_agent
hololand_get_agent
hololand_list_agents
hololand_revoke_agent
twin_earth_register_identity
twin_earth_get_identity
twin_earth_update_identity
twin_earth_revoke_identity
twin_earth_list_identities
twin_earth_create_safety_envelope
twin_earth_get_safety_envelope
twin_earth_update_safety_envelope
twin_earth_delete_safety_envelope
twin_earth_list_safety_envelopes
twin_earth_grant_permission
twin_earth_revoke_permission
twin_earth_validate_permission
twin_earth_list_permissions
twin_earth_robot_actuate
twin_earth_ai_invoke
twin_earth_capture_receipt
holo_hologram_from_media
holo_hologram_compile_quilt
holo_hologram_compile_mvhevc
holo_hologram_render
holo_hologram_publish_feed
holo_hologram_send
holo_hologram_upload_bundle
holo_hologram_get_asset
holo_estimate_task_duration
holo_task_kolmogorov_score
holo_critic
holo_founder
holo_premortem
holo_oracle_discover
holo_oracle_synthesize
holo_oracle_gaps
holo_oracle_explore
holo_oracle_curate
holo_secrets_grant
holo_secrets_resolve
holo_secrets_revoke
holo_query_receipts
holo_list_receipt_capabilities
holo_tunnel_create
holo_tunnel_close
holo_tunnel_status
sim_quote
sim_run_paid
sim_fleet_status
compile_to_canvas2d_game
compile_to_code_editor
explain_fairness_receipt
fairness_sweep
holo_ci_dispatch
render_world_on_fleet
`
  .trim()
  .split(/\s+/);

export const operatorContractExemptions: Record<string, OperatorContractExemption> = {};

export const operatorContracts: Record<string, OperatorContract> = Object.fromEntries(
  OPERATOR_CONTRACT_TOOL_NAMES.map((toolName) => [toolName, createOperatorContract(toolName)])
);

export function validateOperatorContractCoverage(
  registeredTools: OperatorToolRegistration[] | string[] = OPERATOR_CONTRACT_TOOL_NAMES,
  contracts: Record<string, OperatorContract> = operatorContracts,
  exemptions: Record<string, OperatorContractExemption> = operatorContractExemptions
): OperatorContractCoverage {
  const registeredNames = new Set(
    registeredTools.map((tool) => (typeof tool === 'string' ? tool : tool.name))
  );
  const contractNames = new Set(Object.keys(contracts));
  const exemptionNames = new Set(Object.keys(exemptions));

  return {
    missingContracts: [...registeredNames]
      .filter((name) => !contractNames.has(name) && !exemptionNames.has(name))
      .sort(),
    orphanContracts: [
      ...OPERATOR_CONTRACT_TOOL_NAMES.filter((name) => !registeredNames.has(name)),
      ...Object.keys(exemptions).filter((name) => !registeredNames.has(name)),
    ].sort(),
    invalidContracts: Object.values(contracts)
      .filter((contract) => registeredNames.has(contract.toolName))
      .filter((contract) => !isValidOperatorContract(contract))
      .map((contract) => contract.toolName)
      .sort(),
  };
}

export function isValidOperatorContract(contract: OperatorContract): boolean {
  return (
    contract.schemaVersion === OPERATOR_CONTRACT_SCHEMA_VERSION &&
    typeof contract.toolName === 'string' &&
    contract.toolName.length > 0 &&
    Array.isArray(contract.nlVerbs) &&
    contract.nlVerbs.length >= 2 &&
    contract.nlVerbs.every((verb) => typeof verb === 'string' && verb.trim().length > 0) &&
    Array.isArray(contract.exampleDialogues) &&
    contract.exampleDialogues.length > 0 &&
    contract.exampleDialogues.every(
      (example) =>
        typeof example.intent === 'string' &&
        example.intent.trim().length > 0 &&
        typeof example.user === 'string' &&
        example.user.trim().length > 0 &&
        typeof example.assistant === 'string' &&
        example.assistant.trim().length > 0 &&
        example.toolCall?.name === contract.toolName &&
        example.toolCall.arguments &&
        typeof example.toolCall.arguments === 'object' &&
        !Array.isArray(example.toolCall.arguments)
    )
  );
}

function createOperatorContract(toolName: string): OperatorContract {
  const label = humanizeToolName(toolName);
  const verb = primaryVerb(toolName);
  return {
    schemaVersion: OPERATOR_CONTRACT_SCHEMA_VERSION,
    toolName,
    nlVerbs: unique([verb, `use ${label}`, `${verb} with ${label}`]),
    exampleDialogues: [
      {
        intent: `Map an operator request to ${toolName}.`,
        user: `Please ${verb} using ${label}.`,
        assistant: `I will call ${toolName} with the required fields from the request.`,
        toolCall: {
          name: toolName,
          arguments: {},
        },
      },
    ],
  };
}

function primaryVerb(toolName: string): string {
  const prefix = toolName.split('_')[0] || 'use';
  const overrides: Record<string, string> = {
    parse: 'parse',
    compile: 'compile',
    validate: 'validate',
    list: 'list',
    explain: 'explain',
    suggest: 'suggest',
    generate: 'generate',
    get: 'get',
    analyze: 'analyze',
    render: 'render',
    create: 'create',
    convert: 'convert',
    import: 'import',
    edit: 'edit',
    absorb: 'absorb',
    discover: 'discover',
    delegate: 'delegate',
    compose: 'compose',
    execute: 'execute',
    query: 'query',
    export: 'export',
    install: 'install',
    manage: 'manage',
    check: 'check',
    optimize: 'optimize',
    serve: 'serve',
    inspect: 'inspect',
    holomesh: 'coordinate',
    holoscript: 'operate',
    holo: 'operate',
    hs: 'inspect',
    solve: 'solve',
    verify: 'verify',
    batch: 'batch',
    push: 'push',
    fetch: 'fetch',
    load: 'load',
    rewind: 'rewind',
    sync: 'sync',
    update: 'update',
    delete: 'delete',
    twin: 'operate',
    conformance: 'check',
    sim: 'simulate',
  };
  return overrides[prefix] || 'use';
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/_/g, ' ');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
