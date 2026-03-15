/**
 * @fileoverview Effect Inference Engine
 * @module @holoscript/core/compiler/safety
 *
 * Maps HoloScript traits and built-in functions to their effect signatures.
 * Provides bottom-up inference: given an AST node, compute the effect row
 * by looking up known effects and composing callee rows.
 *
 * @version 1.0.0
 */

import { EffectRow, VREffect, EffectDeclaration, EffectCategory } from '../../types/effects';

// =============================================================================
// TRAIT → EFFECT MAPPINGS
// =============================================================================

/**
 * Maps standard HoloScript trait names to their effect rows.
 * When a function uses a trait, it inherits these effects.
 */
export const TRAIT_EFFECTS: Record<string, VREffect[]> = {
  // Rendering traits
  '@mesh': ['render:spawn'],
  '@material': ['render:material'],
  '@particle': ['render:particle', 'render:spawn', 'resource:gpu'],
  '@light': ['render:light'],
  '@shader': ['render:shader', 'resource:gpu'],
  '@gaussian': ['render:gaussian', 'resource:gpu', 'resource:memory'],
  '@camera': ['render:spawn'],
  '@sprite': ['render:spawn'],
  '@vfx': ['render:particle', 'render:shader', 'resource:gpu'],

  // Physics traits
  '@physics': ['physics:force', 'physics:collision', 'resource:cpu'],
  '@rigidbody': ['physics:force', 'physics:collision'],
  '@collider': ['physics:collision'],
  '@joint': ['physics:joint'],
  '@trigger': ['physics:collision'],
  '@gravity': ['physics:gravity'],
  '@teleport': ['physics:teleport'],

  // Audio traits
  '@audio': ['audio:play'],
  '@spatial_audio': ['audio:spatial'],
  '@reverb': ['audio:reverb'],
  '@music': ['audio:play', 'audio:global'],

  // State traits
  '@state': ['state:read', 'state:write'],
  '@persistent': ['state:persistent', 'io:write'],
  '@global_state': ['state:global'],

  // Networking
  '@networked': ['io:network', 'state:write'],
  '@multiplayer': ['io:network', 'agent:communicate'],
  '@sync': ['io:network', 'state:write'],

  // Agent traits
  '@agent': ['agent:spawn', 'resource:cpu'],
  '@npc': ['agent:spawn', 'agent:observe'],
  '@ai': ['agent:observe', 'resource:cpu'],
  '@behavior': ['agent:observe', 'state:read'],

  // Inventory / economy
  '@inventory': ['inventory:take', 'inventory:give'],
  '@tradeable': ['inventory:trade'],
  '@consumable': ['inventory:destroy'],
  '@loot': ['inventory:give'],

  // Authority / permissions
  '@owned': ['authority:own'],
  '@delegated': ['authority:delegate'],
  '@zone': ['authority:zone'],

  // Animation (mostly pure, some render effects)
  '@animation': ['render:material'],
  '@keyframe': ['state:read'],
  '@tween': ['state:read', 'state:write'],

  // Script / lifecycle
  '@script': ['state:read', 'state:write'],
  '@timer': ['io:timer'],
  '@event': ['state:read'],

  // Sandbox (explicitly limited)
  '@sandbox': [], // Pure — sandboxed code should have no effects

  // Culture traits (emergent agent culture)
  '@norm_compliant': ['agent:observe', 'agent:communicate'], // Must observe + report norms
  '@cultural_memory': ['state:read', 'state:write', 'state:persistent'], // Dual memory persistence
  '@cultural_trace': ['state:write', 'render:spawn'], // Spatial stigmergic markers

  // GPU Compute traits
  '@compute_shader': ['resource:gpu', 'render:shader'],
  '@render_pipeline': ['resource:gpu', 'render:spawn'],
  '@post_process': ['resource:gpu', 'render:material'],
  '@ray_trace': ['resource:gpu', 'resource:cpu'],

  // ML / Tensor traits
  '@tensor_op': ['resource:gpu', 'resource:memory'],
  '@onnx_runtime': ['resource:cpu', 'resource:memory'],
  '@training_loop': ['resource:gpu', 'resource:cpu', 'resource:memory'],

  // Database / Persistence traits
  '@sql_query': ['io:read', 'io:write'],
  '@orm_entity': ['io:read', 'io:write', 'state:read', 'state:write'],
  '@offline_sync': ['io:network', 'io:write', 'state:persistent'],
  '@reactive_store': ['state:read', 'state:write'],

  // Spatial Algorithm traits
  '@astar': ['resource:cpu'],
  '@navmesh_solver': ['resource:cpu', 'resource:memory'],
  '@optimization': ['resource:cpu'],

  // Debug / Cinematic traits
  '@time_travel_debug': ['state:read', 'state:write', 'resource:memory'],
  '@spatial_profiler': ['state:read', 'resource:cpu'],
  '@cinematic_seq': ['render:spawn', 'state:read'],
  '@ai_camera': ['render:spawn', 'agent:observe'],

  // FFI / OS traits
  '@ffi': ['io:read', 'io:write'],
  '@native_call': ['io:read', 'io:write'],
  '@wasm_bridge': ['resource:memory', 'resource:cpu'],
  '@sys_io': ['io:read', 'io:write'],

  // Concurrency traits
  '@actor': ['agent:spawn', 'agent:communicate'],
  '@csp_channel': ['state:read', 'state:write'],
  '@temporal_guard': ['state:read'],
  '@deadlock_free': ['resource:cpu'],


  // Auto-generated effect mappings
config "shamefully-hoist". This will 
stop working in the next major 
version of npm.
At line:1 char:1
+ & "C:\Program 
Files\nodejs/node.exe" 
"C:\Users\josep\AppData\Roaming\ ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : 
NotSpeci    fied: (npm warn 
Unknow...version o    f npm.:String) 
[], RemoteException
    + FullyQualifiedErrorId : 
NativeCo    mmandError
 
npm warn Unknown project config 
"strict-peer-dependencies". This will 
stop working in the next major 
version of npm.
Total handler traits with name: 293
Already in TRAIT_COMPLETIONS: 121
Missing from TRAIT_COMPLETIONS: 186
Already in TRAIT_EFFECTS: 73
Missing from TRAIT_EFFECTS: 267

// ΓòÉΓòÉΓòÉ NEW TRAIT_COMPLETIONS ΓòÉΓòÉΓòÉ
  '@absorb': {
    detail: 'AbsorbProcessor',
    documentation: 'AbsorbProcessor.\n\n```holo\n@absorb()\n```',
  },
  '@abtest': {
    detail: 'Per',
    documentation: 'Per.\n\n```holo\n@abtest()\n```',
  },
  '@advanced_lighting': {
    detail: 'AdvancedLighting',
    documentation: 'AdvancedLighting.\n\n```holo\n@advanced_lighting()\n```',
  },
  '@advanced_pbr': {
    detail: 'AdvancedPBR',
    documentation: 'AdvancedPBR.\n\n```holo\n@advanced_pbr()\n```',
  },
  '@advanced_texturing': {
    detail: 'AdvancedTexturing',
    documentation: 'AdvancedTexturing.\n\n```holo\n@advanced_texturing()\n```',
  },
  '@agent_discovery': {
    detail: 'the AgentRegistry for multi',
    documentation: 'the AgentRegistry for multi.\n\n```holo\n@agent_discovery()\n```',
  },
  '@agent_portal': {
    detail: 'AgentPortalTrait',
    documentation: 'AgentPortalTrait.\n\n```holo\n@agent_portal()\n```',
  },
  '@ai_inpainting': {
    detail: 'AI',
    documentation: 'AI.\n\n```holo\n@ai_inpainting()\n```',
  },
  '@ai_npc_brain': {
    detail: 'AINPCBrain',
    documentation: 'AINPCBrain.\n\n```holo\n@ai_npc_brain()\n```',
  },
  '@ai_texture_gen': {
    detail: 'Supports text',
    documentation: 'Supports text.\n\n```holo\n@ai_texture_gen()\n```',
  },
  '@ai_upscaling': {
    detail: 'AI',
    documentation: 'AI.\n\n```holo\n@ai_upscaling()\n```',
  },
  '@analytics': {
    detail: 'and user engagement data with privacy',
    documentation: 'and user engagement data with privacy.\n\n```holo\n@analytics()\n```',
  },
  '@api_key': {
    detail: 'ApiKeyTrait',
    documentation: 'ApiKeyTrait.\n\n```holo\n@api_key()\n```',
  },
  '@approval': {
    detail: 'ApprovalTrait',
    documentation: 'ApprovalTrait.\n\n```holo\n@approval()\n```',
  },
  '@audit_log': {
    detail: 'Centralized audit logging for HoloScript enterprise multi',
    documentation: 'Centralized audit logging for HoloScript enterprise multi.\n\n```holo\n@audit_log()\n```',
  },
  '@autocomplete': {
    detail: 'AutocompleteTrait',
    documentation: 'AutocompleteTrait.\n\n```holo\n@autocomplete()\n```',
  },
  '@batch_job': {
    detail: 'BatchJobTrait',
    documentation: 'BatchJobTrait.\n\n```holo\n@batch_job()\n```',
  },
  '@biofeedback': {
    detail: 'Source',
    documentation: 'Source.\n\n```holo\n@biofeedback()\n```',
  },
  '@blackboard': {
    detail: 'Blackboard',
    documentation: 'Blackboard.\n\n```holo\n@blackboard()\n```',
  },
  '@blob_store': {
    detail: 'BlobStoreTrait',
    documentation: 'BlobStoreTrait.\n\n```holo\n@blob_store()\n```',
  },
  '@buffer': {
    detail: 'BufferTrait',
    documentation: 'BufferTrait.\n\n```holo\n@buffer()\n```',
  },
  '@cache': {
    detail: 'CacheTrait',
    documentation: 'CacheTrait.\n\n```holo\n@cache()\n```',
  },
  '@canary': {
    detail: 'CanaryTrait',
    documentation: 'CanaryTrait.\n\n```holo\n@canary()\n```',
  },
  '@change_tracking': {
    detail: 'ChangeTrackingTrait',
    documentation: 'ChangeTrackingTrait.\n\n```holo\n@change_tracking()\n```',
  },
  '@chaos_test': {
    detail: 'ChaosTestTrait',
    documentation: 'ChaosTestTrait.\n\n```holo\n@chaos_test()\n```',
  },
  '@choreography': {
    detail: 'Enables nodes to participate in multi',
    documentation: 'Enables nodes to participate in multi.\n\n```holo\n@choreography()\n```',
  },
  '@circuit_breaker': {
    detail: 'CircuitBreakerTrait',
    documentation: 'CircuitBreakerTrait.\n\n```holo\n@circuit_breaker()\n```',
  },
  '@consent_gate': {
    detail: 'Human',
    documentation: 'Human.\n\n```holo\n@consent_gate()\n```',
  },
  '@consent_management': {
    detail: 'ConsentManagementTrait',
    documentation: 'ConsentManagementTrait.\n\n```holo\n@consent_management()\n```',
  },
  '@controlnet': {
    detail: 'ControlNet',
    documentation: 'ControlNet.\n\n```holo\n@controlnet()\n```',
  },
  '@cron': {
    detail: 'Scheduled execution of HoloScript trait events',
    documentation: 'Scheduled execution of HoloScript trait events.\n\n```holo\n@cron()\n```',
  },
  '@database': {
    detail: 'DatabaseTrait',
    documentation: 'DatabaseTrait.\n\n```holo\n@database()\n```',
  },
  '@data_lineage': {
    detail: 'DataLineageTrait',
    documentation: 'DataLineageTrait.\n\n```holo\n@data_lineage()\n```',
  },
  '@data_quality': {
    detail: 'DataQualityTrait',
    documentation: 'DataQualityTrait.\n\n```holo\n@data_quality()\n```',
  },
  '@data_retention': {
    detail: 'DataRetentionTrait',
    documentation: 'DataRetentionTrait.\n\n```holo\n@data_retention()\n```',
  },
  '@data_transform': {
    detail: 'DataTransformTrait',
    documentation: 'DataTransformTrait.\n\n```holo\n@data_transform()\n```',
  },
  '@deploy': {
    detail: 'DeployTrait',
    documentation: 'DeployTrait.\n\n```holo\n@deploy()\n```',
  },
  '@diffusion_realtime': {
    detail: 'Real',
    documentation: 'Real.\n\n```holo\n@diffusion_realtime()\n```',
  },
  '@discord': {
    detail: 'DiscordTrait',
    documentation: 'DiscordTrait.\n\n```holo\n@discord()\n```',
  },
  '@economy': {
    detail: 'EconomyPrimitivesTrait',
    documentation: 'EconomyPrimitivesTrait.\n\n```holo\n@economy()\n```',
  },
  '@email': {
    detail: 'EmailTrait',
    documentation: 'EmailTrait.\n\n```holo\n@email()\n```',
  },
  '@embedding_search': {
    detail: 'EmbeddingSearch',
    documentation: 'EmbeddingSearch.\n\n```holo\n@embedding_search()\n```',
  },
  '@embedding': {
    detail: 'EmbeddingTrait',
    documentation: 'EmbeddingTrait.\n\n```holo\n@embedding()\n```',
  },
  '@emotional_voice': {
    detail: 'EmotionalVoice',
    documentation: 'EmotionalVoice.\n\n```holo\n@emotional_voice()\n```',
  },
  '@encryption': {
    detail: 'Encryption',
    documentation: 'Encryption.\n\n```holo\n@encryption()\n```',
  },
  '@env_config': {
    detail: 'EnvConfigTrait',
    documentation: 'EnvConfigTrait.\n\n```holo\n@env_config()\n```',
  },
  '@etl': {
    detail: 'EtlTrait',
    documentation: 'EtlTrait.\n\n```holo\n@etl()\n```',
  },
  '@eye_tracked': {
    detail: 'Enable dwell',
    documentation: 'Enable dwell.\n\n```holo\n@eye_tracked()\n```',
  },
  '@faceted_search': {
    detail: 'FacetedSearchTrait',
    documentation: 'FacetedSearchTrait.\n\n```holo\n@faceted_search()\n```',
  },
  '@feature_flag': {
    detail: 'FeatureFlagTrait',
    documentation: 'FeatureFlagTrait.\n\n```holo\n@feature_flag()\n```',
  },
  '@feedback_loop': {
    detail: 'FeedbackLoopTrait',
    documentation: 'FeedbackLoopTrait.\n\n```holo\n@feedback_loop()\n```',
  },
  '@file_system': {
    detail: 'FileSystemTrait',
    documentation: 'FileSystemTrait.\n\n```holo\n@file_system()\n```',
  },
  '@fine_tune': {
    detail: 'FineTuneTrait',
    documentation: 'FineTuneTrait.\n\n```holo\n@fine_tune()\n```',
  },
  '@fixture': {
    detail: 'FixtureTrait',
    documentation: 'FixtureTrait.\n\n```holo\n@fixture()\n```',
  },
  '@flow_field': {
    detail: 'Implements NPC navigation using GPU',
    documentation: 'Implements NPC navigation using GPU.\n\n```holo\n@flow_field()\n```',
  },
  '@form_builder': {
    detail: 'FormBuilderTrait',
    documentation: 'FormBuilderTrait.\n\n```holo\n@form_builder()\n```',
  },
  '@full_text_search': {
    detail: 'FullTextSearchTrait',
    documentation: 'FullTextSearchTrait.\n\n```holo\n@full_text_search()\n```',
  },
  '@gdpr': {
    detail: 'GdprTrait',
    documentation: 'GdprTrait.\n\n```holo\n@gdpr()\n```',
  },
  '@gesture_recognition': {
    detail: 'Gesture',
    documentation: 'Gesture.\n\n```holo\n@gesture_recognition()\n```',
  },
  '@global_illumination': {
    detail: 'GlobalIllumination',
    documentation: 'GlobalIllumination.\n\n```holo\n@global_illumination()\n```',
  },
  '@graphql': {
    detail: 'GraphqlTrait',
    documentation: 'GraphqlTrait.\n\n```holo\n@graphql()\n```',
  },
  '@ui_hand_menu': {
    detail: 'HandMenu',
    documentation: 'HandMenu.\n\n```holo\n@ui_hand_menu()\n```',
  },
  '@hand_mesh_ai': {
    detail: 'AI',
    documentation: 'AI.\n\n```holo\n@hand_mesh_ai()\n```',
  },
  '@pinch': {
    detail: 'HandTracking',
    documentation: 'HandTracking.\n\n```holo\n@pinch()\n```',
  },
  '@soft': {
    detail: 'Enable proximity',
    documentation: 'Enable proximity.\n\n```holo\n@soft()\n```',
  },
  '@healthcheck': {
    detail: 'HealthcheckTrait',
    documentation: 'HealthcheckTrait.\n\n```holo\n@healthcheck()\n```',
  },
  '@hitl': {
    detail: 'Critical for agentic AI systems',
    documentation: 'Critical for agentic AI systems.\n\n```holo\n@hitl()\n```',
  },
  '@hot_reload': {
    detail: 're',
    documentation: 're.\n\n```holo\n@hot_reload()\n```',
  },
  '@hsm_integration': {
    detail: 'HSMIntegration',
    documentation: 'HSMIntegration.\n\n```holo\n@hsm_integration()\n```',
  },
  '@image_resize': {
    detail: 'ImageResizeTrait',
    documentation: 'ImageResizeTrait.\n\n```holo\n@image_resize()\n```',
  },
  '@incident': {
    detail: 'IncidentTrait',
    documentation: 'IncidentTrait.\n\n```holo\n@incident()\n```',
  },
  '@index': {
    detail: 'IndexTrait',
    documentation: 'IndexTrait.\n\n```holo\n@index()\n```',
  },
  '@inference': {
    detail: 'InferenceTrait',
    documentation: 'InferenceTrait.\n\n```holo\n@inference()\n```',
  },
  '@interactive_graph': {
    detail: 'Enable click',
    documentation: 'Enable click.\n\n```holo\n@interactive_graph()\n```',
  },
  '@invoice': {
    detail: 'InvoiceTrait',
    documentation: 'InvoiceTrait.\n\n```holo\n@invoice()\n```',
  },
  '@jwt': {
    detail: 'JwtTrait',
    documentation: 'JwtTrait.\n\n```holo\n@jwt()\n```',
  },
  '@layer_aware': {
    detail: 'LayerAware',
    documentation: 'LayerAware.\n\n```holo\n@layer_aware()\n```',
  },
  '@low_vowel': {
    detail: 'Real',
    documentation: 'Real.\n\n```holo\n@low_vowel()\n```',
  },
  '@load_test': {
    detail: 'LoadTestTrait',
    documentation: 'LoadTestTrait.\n\n```holo\n@load_test()\n```',
  },
  '@locale': {
    detail: 'LocaleTrait',
    documentation: 'LocaleTrait.\n\n```holo\n@locale()\n```',
  },
  '@log_aggregator': {
    detail: 'LogAggregatorTrait',
    documentation: 'LogAggregatorTrait.\n\n```holo\n@log_aggregator()\n```',
  },
  '@markdown_render': {
    detail: 'MarkdownRenderTrait',
    documentation: 'MarkdownRenderTrait.\n\n```holo\n@markdown_render()\n```',
  },
  '@marketplace_integration': {
    detail: 'MarketplaceIntegration',
    documentation: 'MarketplaceIntegration.\n\n```holo\n@marketplace_integration()\n```',
  },
  '@mfa': {
    detail: 'MfaTrait',
    documentation: 'MfaTrait.\n\n```holo\n@mfa()\n```',
  },
  '@migrate': {
    detail: 'MigrateTrait',
    documentation: 'MigrateTrait.\n\n```holo\n@migrate()\n```',
  },
  '@mitosis': {
    detail: 'Mitosis',
    documentation: 'Mitosis.\n\n```holo\n@mitosis()\n```',
  },
  '@mock': {
    detail: 'MockTrait',
    documentation: 'MockTrait.\n\n```holo\n@mock()\n```',
  },
  '@model_load': {
    detail: 'ModelLoadTrait',
    documentation: 'ModelLoadTrait.\n\n```holo\n@model_load()\n```',
  },
  '@mqtt_pub': {
    detail: 'MqttPubTrait',
    documentation: 'MqttPubTrait.\n\n```holo\n@mqtt_pub()\n```',
  },
  '@mqtt_sink': {
    detail: 'Auto',
    documentation: 'Auto.\n\n```holo\n@mqtt_sink()\n```',
  },
  '@mqtt_source': {
    detail: 'Auto',
    documentation: 'Auto.\n\n```holo\n@mqtt_source()\n```',
  },
  '@multi_agent': {
    detail: 'Enables multi',
    documentation: 'Enables multi.\n\n```holo\n@multi_agent()\n```',
  },
  '@negotiation': {
    detail: 'Enables nodes to participate in multi',
    documentation: 'Enables nodes to participate in multi.\n\n```holo\n@negotiation()\n```',
  },
  '@networked_avatar': {
    detail: 'Uses WebRTCTransport for high',
    documentation: 'Uses WebRTCTransport for high.\n\n```holo\n@networked_avatar()\n```',
  },
  '@neural_animation': {
    detail: 'Supports pose',
    documentation: 'Supports pose.\n\n```holo\n@neural_animation()\n```',
  },
  '@neural_forge': {
    detail: 'NeuralForge',
    documentation: 'NeuralForge.\n\n```holo\n@neural_forge()\n```',
  },
  '@neural_link': {
    detail: 'NeuralLink',
    documentation: 'NeuralLink.\n\n```holo\n@neural_link()\n```',
  },
  '@npc_ai': {
    detail: 'LLM',
    documentation: 'LLM.\n\n```holo\n@npc_ai()\n```',
  },
  '@oauth': {
    detail: 'OauthTrait',
    documentation: 'OauthTrait.\n\n```holo\n@oauth()\n```',
  },
  '@object_tracking': {
    detail: 'Tracks and anchors virtual objects to real',
    documentation: 'Tracks and anchors virtual objects to real.\n\n```holo\n@object_tracking()\n```',
  },
  '@openxr_hal': {
    detail: 'Critical foundation for ALL haptic traits',
    documentation: 'Critical foundation for ALL haptic traits.\n\n```holo\n@openxr_hal()\n```',
  },
  '@orbital': {
    detail: 'Orbital',
    documentation: 'Orbital.\n\n```holo\n@orbital()\n```',
  },
  '@package_signing': {
    detail: 'PackageSigning',
    documentation: 'PackageSigning.\n\n```holo\n@package_signing()\n```',
  },
  '@pagerduty': {
    detail: 'PagerdutyTrait',
    documentation: 'PagerdutyTrait.\n\n```holo\n@pagerduty()\n```',
  },
  '@partner_sdk': {
    detail: 'PartnerSDK',
    documentation: 'PartnerSDK.\n\n```holo\n@partner_sdk()\n```',
  },
  '@pdf_generate': {
    detail: 'PdfGenerateTrait',
    documentation: 'PdfGenerateTrait.\n\n```holo\n@pdf_generate()\n```',
  },
  '@permission': {
    detail: 'PermissionTrait',
    documentation: 'PermissionTrait.\n\n```holo\n@permission()\n```',
  },
  '@pipeline': {
    detail: 'PipelineTrait',
    documentation: 'PipelineTrait.\n\n```holo\n@pipeline()\n```',
  },
  '@pose_estimation': {
    detail: 'Detects keypoints and skeleton tracking for full',
    documentation: 'Detects keypoints and skeleton tracking for full.\n\n```holo\n@pose_estimation()\n```',
  },
  '@profiler': {
    detail: 'ProfilerTrait',
    documentation: 'ProfilerTrait.\n\n```holo\n@profiler()\n```',
  },
  '@prompt_template': {
    detail: 'PromptTemplateTrait',
    documentation: 'PromptTemplateTrait.\n\n```holo\n@prompt_template()\n```',
  },
  '@push_notification': {
    detail: 'PushNotificationTrait',
    documentation: 'PushNotificationTrait.\n\n```holo\n@push_notification()\n```',
  },
  '@query': {
    detail: 'QueryTrait',
    documentation: 'QueryTrait.\n\n```holo\n@query()\n```',
  },
  '@quota': {
    detail: 'Manages usage quotas and resource limits for HoloScript enterprise multi',
    documentation: 'Manages usage quotas and resource limits for HoloScript enterprise multi.\n\n```holo\n@quota()\n```',
  },
  '@rag_knowledge': {
    detail: 'Retrieval',
    documentation: 'Retrieval.\n\n```holo\n@rag_knowledge()\n```',
  },
  '@rate_limiter': {
    detail: 'RateLimiterTrait',
    documentation: 'RateLimiterTrait.\n\n```holo\n@rate_limiter()\n```',
  },
  '@ray_tracing': {
    detail: 'RayTracing',
    documentation: 'RayTracing.\n\n```holo\n@ray_tracing()\n```',
  },
  '@rbac': {
    detail: 'Implements Role',
    documentation: 'Implements Role.\n\n```holo\n@rbac()\n```',
  },
  '@realitykit_mesh': {
    detail: 'Extends scene_reconstruction with RealityKit',
    documentation: 'Extends scene_reconstruction with RealityKit.\n\n```holo\n@realitykit_mesh()\n```',
  },
  '@refund': {
    detail: 'RefundTrait',
    documentation: 'RefundTrait.\n\n```holo\n@refund()\n```',
  },
  '@render_network': {
    detail: 'Distributed GPU rendering via Render Network for high',
    documentation: 'Distributed GPU rendering via Render Network for high.\n\n```holo\n@render_network()\n```',
  },
  '@rest_endpoint': {
    detail: 'RestEndpointTrait',
    documentation: 'RestEndpointTrait.\n\n```holo\n@rest_endpoint()\n```',
  },
  '@retry': {
    detail: 'RetryTrait',
    documentation: 'RetryTrait.\n\n```holo\n@retry()\n```',
  },
  '@roadmap_node': {
    detail: 'Roadmap',
    documentation: 'Roadmap.\n\n```holo\n@roadmap_node()\n```',
  },
  '@rollback': {
    detail: 'RollbackTrait',
    documentation: 'RollbackTrait.\n\n```holo\n@rollback()\n```',
  },
  '@rollout': {
    detail: 'RolloutTrait',
    documentation: 'RolloutTrait.\n\n```holo\n@rollout()\n```',
  },
  '@room_mesh': {
    detail: 'Whole',
    documentation: 'Whole.\n\n```holo\n@room_mesh()\n```',
  },
  '@rpc': {
    detail: 'RpcTrait',
    documentation: 'RpcTrait.\n\n```holo\n@rpc()\n```',
  },
  '@rsa_encryption': {
    detail: 'RSAEncryption',
    documentation: 'RSAEncryption.\n\n```holo\n@rsa_encryption()\n```',
  },
  '@rtl': {
    detail: 'RtlTrait',
    documentation: 'RtlTrait.\n\n```holo\n@rtl()\n```',
  },
  '@sandbox_execution': {
    detail: 'SandboxExecution',
    documentation: 'SandboxExecution.\n\n```holo\n@sandbox_execution()\n```',
  },
  '@scene_reconstruction': {
    detail: 'Real',
    documentation: 'Real.\n\n```holo\n@scene_reconstruction()\n```',
  },
  '@scheduler': {
    detail: 'SchedulerTrait',
    documentation: 'SchedulerTrait.\n\n```holo\n@scheduler()\n```',
  },
  '@schema_migrate': {
    detail: 'SchemaMigrateTrait',
    documentation: 'SchemaMigrateTrait.\n\n```holo\n@schema_migrate()\n```',
  },
  '@screen_space_effects': {
    detail: 'Screen',
    documentation: 'Screen.\n\n```holo\n@screen_space_effects()\n```',
  },
  '@script_test': {
    detail: 'Tests run without any render target',
    documentation: 'Tests run without any render target.\n\n```holo\n@script_test()\n```',
  },
  '@scrollable': {
    detail: 'Use spring physics for boundary snap',
    documentation: 'Use spring physics for boundary snap.\n\n```holo\n@scrollable()\n```',
  },
  '@seated': {
    detail: 'Seated',
    documentation: 'Seated.\n\n```holo\n@seated()\n```',
  },
  '@secret': {
    detail: 'SecretTrait',
    documentation: 'SecretTrait.\n\n```holo\n@secret()\n```',
  },
  '@session': {
    detail: 'SessionTrait',
    documentation: 'SessionTrait.\n\n```holo\n@session()\n```',
  },
  '@hologram': {
    detail: 'Human',
    documentation: 'Human.\n\n```holo\n@hologram()\n```',
  },
  '@shareplay': {
    detail: 'SharePlay',
    documentation: 'SharePlay.\n\n```holo\n@shareplay()\n```',
  },
  '@shell': {
    detail: 'ShellTrait',
    documentation: 'ShellTrait.\n\n```holo\n@shell()\n```',
  },
  '@base': {
    detail: 'Enables bone',
    documentation: 'Enables bone.\n\n```holo\n@base()\n```',
  },
  '@url': {
    detail: 'SkillRegistryTrait',
    documentation: 'SkillRegistryTrait.\n\n```holo\n@url()\n```',
  },
  '@slack_alert': {
    detail: 'SlackAlertTrait',
    documentation: 'SlackAlertTrait.\n\n```holo\n@slack_alert()\n```',
  },
  '@slack': {
    detail: 'SlackTrait',
    documentation: 'SlackTrait.\n\n```holo\n@slack()\n```',
  },
  '@slo_monitor': {
    detail: 'SLOMonitorTrait',
    documentation: 'SLOMonitorTrait.\n\n```holo\n@slo_monitor()\n```',
  },
  '@sms': {
    detail: 'SmsTrait',
    documentation: 'SmsTrait.\n\n```holo\n@sms()\n```',
  },
  '@snapshot_test': {
    detail: 'SnapshotTestTrait',
    documentation: 'SnapshotTestTrait.\n\n```holo\n@snapshot_test()\n```',
  },
  '@snapshot': {
    detail: 'SnapshotTrait',
    documentation: 'SnapshotTrait.\n\n```holo\n@snapshot()\n```',
  },
  '@spatial_navigation': {
    detail: 'World',
    documentation: 'World.\n\n```holo\n@spatial_navigation()\n```',
  },
  '@spatial_persona': {
    detail: 'SpatialPersona',
    documentation: 'SpatialPersona.\n\n```holo\n@spatial_persona()\n```',
  },
  '@sse': {
    detail: 'SseTrait',
    documentation: 'SseTrait.\n\n```holo\n@sse()\n```',
  },
  '@sso_saml': {
    detail: 'Implements Single Sign',
    documentation: 'Implements Single Sign.\n\n```holo\n@sso_saml()\n```',
  },
  '@stable_diffusion': {
    detail: 'AI',
    documentation: 'AI.\n\n```holo\n@stable_diffusion()\n```',
  },
  '@state_machine': {
    detail: 'StateMachineTrait',
    documentation: 'StateMachineTrait.\n\n```holo\n@state_machine()\n```',
  },
  '@stream': {
    detail: 'StreamTrait',
    documentation: 'StreamTrait.\n\n```holo\n@stream()\n```',
  },
  '@stripe': {
    detail: 'StripeTrait',
    documentation: 'StripeTrait.\n\n```holo\n@stripe()\n```',
  },
  '@structured_logger': {
    detail: 'StructuredLoggerTrait',
    documentation: 'StructuredLoggerTrait.\n\n```holo\n@structured_logger()\n```',
  },
  '@subscription': {
    detail: 'SubscriptionTrait',
    documentation: 'SubscriptionTrait.\n\n```holo\n@subscription()\n```',
  },
  '@subsurface_scattering': {
    detail: 'Burley / Christensen',
    documentation: 'Burley / Christensen.\n\n```holo\n@subsurface_scattering()\n```',
  },
  '@task_queue': {
    detail: 'TaskQueueTrait',
    documentation: 'TaskQueueTrait.\n\n```holo\n@task_queue()\n```',
  },
  '@tenant': {
    detail: 'Provides multi',
    documentation: 'Provides multi.\n\n```holo\n@tenant()\n```',
  },
  '@timeout_guard': {
    detail: 'TimeoutGuardTrait',
    documentation: 'TimeoutGuardTrait.\n\n```holo\n@timeout_guard()\n```',
  },
  '@timezone': {
    detail: 'TimezoneTrait',
    documentation: 'TimezoneTrait.\n\n```holo\n@timezone()\n```',
  },
  '@transform': {
    detail: 'TransformTrait',
    documentation: 'TransformTrait.\n\n```holo\n@transform()\n```',
  },
  '@translation': {
    detail: 'TranslationTrait',
    documentation: 'TranslationTrait.\n\n```holo\n@translation()\n```',
  },
  '@urdf_robot': {
    detail: 'URDFRobotTrait',
    documentation: 'URDFRobotTrait.\n\n```holo\n@urdf_robot()\n```',
  },
  '@user_monitor': {
    detail: 'Auto',
    documentation: 'Auto.\n\n```holo\n@user_monitor()\n```',
  },
  '@vector_db': {
    detail: 'Embedding Search',
    documentation: 'Embedding Search.\n\n```holo\n@vector_db()\n```',
  },
  '@vector_search': {
    detail: 'VectorSearchTrait',
    documentation: 'VectorSearchTrait.\n\n```holo\n@vector_search()\n```',
  },
  '@video_transcode': {
    detail: 'VideoTranscodeTrait',
    documentation: 'VideoTranscodeTrait.\n\n```holo\n@video_transcode()\n```',
  },
  '@vision': {
    detail: 'Vision',
    documentation: 'Vision.\n\n```holo\n@vision()\n```',
  },
  '@voice_mesh': {
    detail: 'Handles Voice',
    documentation: 'Handles Voice.\n\n```holo\n@voice_mesh()\n```',
  },
  '@volumetric': {
    detail: 'Handles level',
    documentation: 'Handles level.\n\n```holo\n@volumetric()\n```',
  },
  '@volumetric_window': {
    detail: 'visionOS',
    documentation: 'visionOS.\n\n```holo\n@volumetric_window()\n```',
  },
  '@vulnerability_scanner': {
    detail: 'VulnerabilityScanner',
    documentation: 'VulnerabilityScanner.\n\n```holo\n@vulnerability_scanner()\n```',
  },
  '@watcher': {
    detail: 'WatcherTrait',
    documentation: 'WatcherTrait.\n\n```holo\n@watcher()\n```',
  },
  '@webhook_out': {
    detail: 'WebhookOutTrait',
    documentation: 'WebhookOutTrait.\n\n```holo\n@webhook_out()\n```',
  },
  '@webhook': {
    detail: 'WebhookTrait',
    documentation: 'WebhookTrait.\n\n```holo\n@webhook()\n```',
  },
  '@workflow': {
    detail: 'WorkflowTrait',
    documentation: 'WorkflowTrait.\n\n```holo\n@workflow()\n```',
  },
  '@wot_thing': {
    detail: 'WoTThing',
    documentation: 'WoTThing.\n\n```holo\n@wot_thing()\n```',
  },
  '@zero_knowledge_proof': {
    detail: 'Zero',
    documentation: 'Zero.\n\n```holo\n@zero_knowledge_proof()\n```',
  },
  '@public_hash': {
    detail: 'ZkPrivateTrait',
    documentation: 'ZkPrivateTrait.\n\n```holo\n@public_hash()\n```',
  },
  '@zora_coins': {
    detail: 'Auto',
    documentation: 'Auto.\n\n```holo\n@zora_coins()\n```',
  },

// ΓòÉΓòÉΓòÉ NEW TRAIT_EFFECTS ΓòÉΓòÉΓòÉ
  '@absorb': [],
  '@abtest': [],
  '@accessible': [],
  '@advanced_lighting': ['render:spawn', 'resource:gpu'],
  '@advanced_pbr': [],
  '@advanced_texturing': [],
  '@agent_discovery': ['agent:spawn', 'resource:cpu'],
  '@agent_portal': ['agent:spawn', 'resource:cpu'],
  '@ai_inpainting': ['agent:spawn', 'resource:cpu'],
  '@ai_npc_brain': ['agent:spawn', 'resource:cpu'],
  '@ai_texture_gen': ['agent:spawn', 'resource:cpu'],
  '@ai_upscaling': ['agent:spawn', 'resource:cpu'],
  '@alert': [],
  '@alt_text': [],
  '@ambisonics': ['audio:play'],
  '@analytics': ['state:read'],
  '@anchor': [],
  '@api_key': [],
  '@approval': [],
  '@audio_material': ['render:spawn', 'resource:gpu'],
  '@audio_occlusion': ['audio:play'],
  '@audio_portal': ['audio:play'],
  '@audit_log': [],
  '@autocomplete': [],
  '@avatar_embodiment': [],
  '@batch_job': [],
  '@behavior_tree': ['agent:spawn', 'resource:cpu'],
  '@biofeedback': ['io:read', 'io:write'],
  '@blackboard': [],
  '@blob_store': ['state:read', 'state:write'],
  '@body_tracking': ['state:read'],
  '@buffer': [],
  '@buoyancy': ['physics:force', 'physics:collision'],
  '@cache': ['state:read', 'state:write'],
  '@canary': [],
  '@chain': ['agent:spawn', 'resource:cpu'],
  '@change_tracking': ['state:read'],
  '@chaos_test': [],
  '@choreography': [],
  '@circuit_breaker': [],
  '@cloth': ['physics:force', 'physics:collision'],
  '@co_located': [],
  '@compute': ['resource:gpu', 'resource:cpu'],
  '@consent_gate': ['authority:own'],
  '@consent_management': ['authority:own'],
  '@controller': [],
  '@controlnet': [],
  '@cron': [],
  '@database': ['state:read', 'state:write'],
  '@data_binding': [],
  '@data_lineage': [],
  '@data_quality': [],
  '@data_retention': ['io:read', 'io:write'],
  '@data_transform': ['state:read', 'state:write'],
  '@deploy': [],
  '@destruction': ['io:read', 'io:write'],
  '@dialogue': [],
  '@diffusion_realtime': ['io:read', 'io:write'],
  '@digital_twin': [],
  '@discord': [],
  '@economy': [],
  '@email': ['agent:spawn', 'resource:cpu'],
  '@embedding_search': [],
  '@embedding': [],
  '@emotional_voice': ['audio:play'],
  '@emotion': ['io:read', 'io:write'],
  '@encryption': ['io:read', 'io:write'],
  '@env_config': [],
  '@etl': [],
  '@eye_tracked': ['state:read'],
  '@faceted_search': [],
  '@face_tracking': ['state:read'],
  '@faction': ['agent:spawn', 'resource:cpu'],
  '@fbx': [],
  '@feature_flag': [],
  '@feedback_loop': [],
  '@file_system': ['io:read', 'io:write'],
  '@fine_tune': [],
  '@fixture': [],
  '@flow_field': [],
  '@fluid': ['physics:force', 'physics:collision'],
  '@form_builder': ['state:read', 'state:write'],
  '@full_text_search': [],
  '@gaussian_splat': ['render:spawn', 'resource:gpu'],
  '@gdpr': ['authority:own'],
  '@geospatial_anchor': [],
  '@geospatial': [],
  '@gesture_recognition': ['io:read', 'io:write'],
  '@global_illumination': ['io:read', 'io:write'],
  '@gltf': [],
  '@goal_oriented': [],
  '@gpu_buffer': ['resource:gpu', 'resource:cpu'],
  '@gpu_particle': ['render:spawn', 'resource:gpu'],
  '@gpu_physics': ['physics:force', 'physics:collision'],
  '@graphql': ['io:network'],
  '@ui_hand_menu': [],
  '@hand_mesh_ai': ['render:spawn', 'resource:gpu'],
  '@pinch': [],
  '@haptic_cue': [],
  '@soft': ['physics:force', 'physics:collision'],
  '@head_tracked_audio': ['audio:play'],
  '@healthcheck': [],
  '@high_contrast': [],
  '@hitl': [],
  '@hot_reload': [],
  '@hrtf': ['audio:play'],
  '@hsm_integration': ['io:read', 'io:write'],
  '@image_resize': [],
  '@incident': [],
  '@index': [],
  '@inference': [],
  '@interactive_graph': [],
  '@invoice': ['audio:play'],
  '@jwt': ['authority:own'],
  '@layer_aware': [],
  '@light_estimation': ['render:spawn', 'resource:gpu'],
  '@low_vowel': [],
  '@llm_agent': ['agent:spawn', 'resource:cpu'],
  '@load_test': [],
  '@locale': [],
  '@log_aggregator': [],
  '@magnifiable': [],
  '@markdown_render': ['render:spawn', 'resource:gpu'],
  '@marketplace_integration': ['io:read', 'io:write'],
  '@marketplace': [],
  '@material_x': ['render:spawn', 'resource:gpu'],
  '@memory': ['agent:spawn', 'resource:cpu'],
  '@mesh_detection': ['render:spawn', 'resource:gpu'],
  '@mfa': ['authority:own'],
  '@migrate': [],
  '@mitosis': [],
  '@mock': [],
  '@model_load': [],
  '@motion_reduced': ['io:read', 'io:write'],
  '@mqtt_pub': ['io:network'],
  '@mqtt_sink': ['io:network'],
  '@mqtt_source': ['io:network'],
  '@multi_agent': ['agent:spawn', 'resource:cpu'],
  '@negotiation': ['io:read', 'io:write'],
  '@nerf': ['render:spawn', 'resource:gpu'],
  '@networked_avatar': ['io:network'],
  '@neural_animation': ['agent:spawn', 'resource:cpu'],
  '@neural_forge': ['agent:spawn', 'resource:cpu'],
  '@neural_link': ['agent:spawn', 'resource:cpu'],
  '@nft': [],
  '@npc_ai': ['agent:spawn', 'resource:cpu'],
  '@oauth': ['authority:own'],
  '@object_tracking': ['state:read'],
  '@occlusion': ['io:read', 'io:write'],
  '@openxr_hal': [],
  '@orbital': [],
  '@package_signing': ['authority:own'],
  '@pagerduty': [],
  '@partner_sdk': [],
  '@patrol': ['agent:spawn', 'resource:cpu'],
  '@pdf_generate': ['io:read', 'io:write'],
  '@perception': ['agent:spawn', 'resource:cpu'],
  '@permission': ['io:read', 'io:write'],
  '@persistent_anchor': ['state:read', 'state:write'],
  '@photogrammetry': [],
  '@pipeline': [],
  '@plane_detection': ['io:read', 'io:write'],
  '@point_cloud': [],
  '@poi': [],
  '@portable': [],
  '@pose_estimation': ['io:read', 'io:write'],
  '@profiler': ['io:read', 'io:write'],
  '@prompt_template': [],
  '@push_notification': ['io:read', 'io:write'],
  '@query': [],
  '@quota': [],
  '@rag_knowledge': [],
  '@rate_limiter': [],
  '@ray_tracing': [],
  '@rbac': ['authority:own'],
  '@realitykit_mesh': ['render:spawn', 'resource:gpu'],
  '@refund': [],
  '@remote_presence': [],
  '@render_network': ['io:network'],
  '@rest_endpoint': ['io:network'],
  '@retry': [],
  '@reverb_zone': ['audio:play'],
  '@roadmap_node': [],
  '@role': [],
  '@rollback': [],
  '@rollout': [],
  '@rooftop_anchor': [],
  '@room_mesh': ['render:spawn', 'resource:gpu'],
  '@rope': ['physics:force', 'physics:collision'],
  '@rpc': ['io:network'],
  '@rsa_encryption': ['io:read', 'io:write'],
  '@rtl': [],
  '@sandbox_execution': ['io:read', 'io:write'],
  '@scene_graph': [],
  '@scene_reconstruction': ['io:read', 'io:write'],
  '@scheduler': [],
  '@schema_migrate': [],
  '@screen_reader': ['render:spawn', 'resource:gpu'],
  '@screen_space_effects': ['render:spawn', 'resource:gpu'],
  '@script_test': [],
  '@scrollable': [],
  '@seated': [],
  '@secret': ['authority:own'],
  '@sensor': [],
  '@session': ['io:read', 'io:write'],
  '@hologram': [],
  '@shared_anchor': [],
  '@shared_world': [],
  '@shareplay': [],
  '@shell': [],
  '@base': [],
  '@url': [],
  '@slack_alert': [],
  '@slack': [],
  '@slo_monitor': ['state:read'],
  '@sms': ['io:read', 'io:write'],
  '@snapshot_test': ['state:read', 'state:write'],
  '@snapshot': ['state:read', 'state:write'],
  '@soft_body': ['physics:force', 'physics:collision'],
  '@sonification': ['io:read', 'io:write'],
  '@spatial_accessory': ['authority:own'],
  '@spatial_audio_cue': ['audio:play'],
  '@spatial_navigation': ['io:read', 'io:write'],
  '@spatial_persona': [],
  '@spectator': [],
  '@sse': ['io:network'],
  '@sso_saml': ['authority:own'],
  '@stable_diffusion': ['io:read', 'io:write'],
  '@state_machine': ['state:read', 'state:write'],
  '@stream': ['io:network'],
  '@stripe': [],
  '@structured_logger': [],
  '@subscription': ['io:read', 'io:write'],
  '@subsurface_scattering': [],
  '@subtitle': [],
  '@task_queue': [],
  '@tenant': [],
  '@terrain_anchor': ['agent:spawn', 'resource:cpu'],
  '@timeout_guard': [],
  '@timezone': [],
  '@token_gated': [],
  '@transform': ['state:read', 'state:write'],
  '@translation': ['io:read', 'io:write'],
  '@urdf_robot': [],
  '@usd': [],
  '@user_monitor': ['state:read'],
  '@vector_db': [],
  '@vector_search': [],
  '@video_transcode': [],
  '@vision': ['io:read', 'io:write'],
  '@voice_mesh': ['render:spawn', 'resource:gpu'],
  '@voice_proximity': ['audio:play'],
  '@volumetric': ['render:spawn', 'resource:gpu'],
  '@volumetric_video': ['render:spawn', 'resource:gpu'],
  '@volumetric_window': ['render:spawn', 'resource:gpu'],
  '@vps': [],
  '@vulnerability_scanner': [],
  '@wallet': [],
  '@watcher': [],
  '@webhook_out': ['io:network'],
  '@webhook': ['io:network'],
  '@wind': [],
  '@workflow': [],
  '@wot_thing': [],
  '@zero_knowledge_proof': ['authority:own'],
  '@public_hash': [],
  '@zora_coins': [],
};

/**
 * Maps built-in functions to their effect rows.
 */
export const BUILTIN_EFFECTS: Record<string, VREffect[]> = {
  // Object manipulation
  spawn: ['render:spawn', 'resource:memory'],
  destroy: ['render:destroy'],
  clone: ['render:spawn', 'resource:memory'],

  // Physics
  applyForce: ['physics:force'],
  applyImpulse: ['physics:impulse'],
  setVelocity: ['physics:force'],
  teleportTo: ['physics:teleport'],
  setGravity: ['physics:gravity'],

  // Audio
  playSound: ['audio:play'],
  stopSound: ['audio:stop'],
  playSpatial: ['audio:spatial'],
  playMusic: ['audio:global'],

  // State
  setState: ['state:write'],
  getState: ['state:read'],
  setGlobal: ['state:global'],
  persist: ['state:persistent', 'io:write'],
  load: ['state:read', 'io:read'],
  save: ['state:write', 'io:write'],

  // IO
  fetch: ['io:network'],
  httpGet: ['io:network'],
  httpPost: ['io:network', 'io:write'],
  readFile: ['io:read'],
  writeFile: ['io:write'],
  setTimeout: ['io:timer'],
  setInterval: ['io:timer'],

  // Inventory
  giveItem: ['inventory:give'],
  takeItem: ['inventory:take'],
  destroyItem: ['inventory:destroy'],
  tradeWith: ['inventory:trade'],

  // Agent
  spawnAgent: ['agent:spawn', 'resource:cpu'],
  killAgent: ['agent:kill'],
  sendMessage: ['agent:communicate'],
  observe: ['agent:observe'],

  // Authority
  transferOwnership: ['authority:delegate'],
  revokeAccess: ['authority:revoke'],
  claimZone: ['authority:zone'],

  // Resource-heavy operations
  createParticleSystem: ['render:particle', 'resource:gpu'],
  compileShader: ['render:shader', 'resource:gpu'],
  allocateBuffer: ['resource:memory', 'resource:gpu'],

  // Pure functions (no effects)
  'Math.sin': [],
  'Math.cos': [],
  'Math.random': [],
  lerp: [],
  clamp: [],
  distance: [],
  normalize: [],
  dot: [],
  cross: [],
};

// =============================================================================
// INFERENCE ENGINE
// =============================================================================

/** Result of inferring effects for an AST node */
export interface InferredEffects {
  /** The inferred effect row */
  row: EffectRow;
  /** Source of each effect (which trait/function caused it) */
  sources: Map<VREffect, string[]>;
  /** Any warnings generated during inference */
  warnings: string[];
}

/**
 * Infer effects from a list of trait names used by an object/function.
 */
export function inferFromTraits(traitNames: string[]): InferredEffects {
  const allEffects: VREffect[] = [];
  const sources = new Map<VREffect, string[]>();
  const warnings: string[] = [];

  for (const trait of traitNames) {
    const normalized = trait.startsWith('@') ? trait : `@${trait}`;
    const effects = TRAIT_EFFECTS[normalized];
    if (effects) {
      for (const e of effects) {
        allEffects.push(e);
        const existing = sources.get(e) || [];
        existing.push(normalized);
        sources.set(e, existing);
      }
    } else {
      warnings.push(`Unknown trait '${normalized}': cannot infer effects. Assuming pure.`);
    }
  }

  return { row: new EffectRow(allEffects), sources, warnings };
}

/**
 * Infer effects from a list of built-in function calls.
 */
export function inferFromBuiltins(functionNames: string[]): InferredEffects {
  const allEffects: VREffect[] = [];
  const sources = new Map<VREffect, string[]>();
  const warnings: string[] = [];

  for (const fn of functionNames) {
    const effects = BUILTIN_EFFECTS[fn];
    if (effects) {
      for (const e of effects) {
        allEffects.push(e);
        const existing = sources.get(e) || [];
        existing.push(fn);
        sources.set(e, existing);
      }
    }
    // Unknown functions are NOT warned — they may be user-defined (checked separately)
  }

  return { row: new EffectRow(allEffects), sources, warnings };
}

/**
 * Compose multiple inferred effect rows into a single row.
 * This is the row-polymorphic union: fn effects = ∪(callee effects).
 */
export function composeEffects(...inferred: InferredEffects[]): InferredEffects {
  let combined = EffectRow.PURE;
  const allSources = new Map<VREffect, string[]>();
  const allWarnings: string[] = [];

  for (const inf of inferred) {
    combined = combined.union(inf.row);
    for (const [effect, srcs] of inf.sources) {
      const existing = allSources.get(effect) || [];
      allSources.set(effect, [...existing, ...srcs]);
    }
    allWarnings.push(...inf.warnings);
  }

  return { row: combined, sources: allSources, warnings: allWarnings };
}

/**
 * Get the effect declaration for a trait.
 */
export function traitEffectDeclaration(traitName: string): EffectDeclaration {
  const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
  const effects = TRAIT_EFFECTS[normalized];
  return {
    declared: effects ? new EffectRow(effects) : EffectRow.PURE,
    origin: effects ? 'annotated' : 'inferred',
  };
}

/**
 * List all known trait names.
 */
export function knownTraits(): string[] {
  return Object.keys(TRAIT_EFFECTS);
}

/**
 * List all known built-in function names.
 */
export function knownBuiltins(): string[] {
  return Object.keys(BUILTIN_EFFECTS);
}
