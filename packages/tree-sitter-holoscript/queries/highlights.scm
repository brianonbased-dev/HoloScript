; tree-sitter-holoscript/queries/highlights.scm
; Syntax highlighting queries for HoloScript

; =============================================================================
; KEYWORDS
; =============================================================================

[
  "composition"
  "world"
  "template"
  "object"
  "entity"
  "action"
  "trait"
  "extends"
  "using"
] @keyword

[
  "orb"
  "cube"
  "sphere"
  "cylinder"
  "cone"
  "model"
] @keyword.type

[
  "environment"
  "state"
  "networked"
  "physics"
  "timeline"
  "logic"
  "animation"
  "spatial_group"
  "component"
  "eventBus"
] @keyword.storage

[
  "light"
  "directional_light"
  "point_light"
  "spot_light"
  "camera"
  "perspective_camera"
  "orthographic_camera"
] @keyword.type

; Control flow
[
  "if"
  "else"
  "for"
  "while"
  "return"
] @keyword.control

; Boolean and null
[
  "true"
  "false"
] @constant.builtin.boolean

(null) @constant.builtin

; =============================================================================
; MATERIAL & PBR SYSTEM
; =============================================================================

; Material block keywords
[
  "material"
  "pbr_material"
  "unlit_material"
  "shader"
  "toon_material"
  "glass_material"
  "subsurface_material"
] @keyword.type

; Material block name
(material_block
  name: (string) @type.definition)

(material_block
  name: (identifier) @type.definition)

; Texture map keywords (inline and block forms)
; Note: Channel keywords (albedo_map, normal_map, etc.) are anonymous string literals
; and get highlighted by tree-sitter's default keyword coloring
[
  "albedo_map"
  "normal_map"
  "roughness_map"
  "metallic_map"
  "emission_map"
  "ao_map"
  "height_map"
  "opacity_map"
  "displacement_map"
  "specular_map"
  "clearcoat_map"
  "baseColor_map"
  "emissive_map"
  "transmission_map"
  "sheen_map"
  "anisotropy_map"
  "thickness_map"
  "subsurface_map"
  "iridescence_map"
] @property.definition

; =============================================================================
; STRUCTURED PHYSICS SYSTEM
; =============================================================================

; Physics sub-block keywords
[
  "collider"
  "trigger"
  "rigidbody"
  "force_field"
  "gravity_zone"
  "wind_zone"
  "buoyancy_zone"
  "magnetic_field"
  "drag_zone"
  "articulation"
] @keyword.type

; Collider shape keywords
[
  "box"
  "capsule"
  "mesh"
  "convex"
  "heightfield"
] @type.builtin

; Joint sub-block keywords
[
  "joint"
  "hinge"
  "slider"
  "ball_socket"
  "fixed_joint"
  "d6_joint"
  "spring_joint"
  "prismatic"
] @keyword.type

; Named physics blocks
(force_field_block
  name: (string) @type.definition)

(force_field_block
  name: (identifier) @type.definition)

(articulation_block
  name: (string) @type.definition)

(articulation_block
  name: (identifier) @type.definition)

(joint_block
  name: (string) @label)

(joint_block
  name: (identifier) @label)

; Collider shape field
(collider_block
  shape: (_) @type.builtin)

; Shader pass keyword and name
(shader_pass
  "pass" @keyword.storage)

(shader_pass
  name: (string) @label)

(shader_pass
  name: (identifier) @label)

; Shader connection arrow operator
(shader_connection
  "->" @operator)

; =============================================================================
; TRAITS
; =============================================================================

(trait_inline
  "@" @punctuation.special
  name: (identifier) @attribute)

(trait_definition
  "trait" @keyword
  name: (identifier) @type.definition)

(trait_arguments
  "(" @punctuation.bracket
  ")" @punctuation.bracket)

; =============================================================================
; TYPES & DEFINITIONS
; =============================================================================

(composition
  name: (string) @namespace)

(world
  name: (string) @namespace)

(template
  name: (string) @type.definition)

(object
  name: (string) @variable)

(entity
  name: (string) @variable)

(spatial_group
  name: (string) @namespace)

(action
  name: (identifier) @function.definition)

(parameter
  name: (identifier) @variable.parameter)

(event_bus
  name: (identifier) @type)

; =============================================================================
; PROPERTIES
; =============================================================================

(property
  key: (identifier) @property)

(networked_property
  name: (identifier) @property)

(animation_property
  key: (identifier) @property)

; Property values that are special
(property
  key: (identifier) @property
  value: (identifier) @constant
  (#match? @property "^(geometry|skybox|type)$"))

; Sync modes
[
  "synced"
  "owner_only"
  "interpolated"
] @constant.builtin

; =============================================================================
; EVENTS
; =============================================================================

(event_handler
  event: (event_name) @function.method)

[
  "onPoint"
  "onGrab"
  "onRelease"
  "onHoverEnter"
  "onHoverExit"
  "onTriggerEnter"
  "onTriggerExit"
  "onSwing"
  "onClick"
  "onCollision"
  "onInit"
  "onUpdate"
  "onDestroy"
] @function.builtin

; =============================================================================
; TIMELINE
; =============================================================================

(timeline_entry
  time: (number) @number)

(animate_action
  "animate" @keyword
  target: (identifier) @variable)

(emit_action
  "emit" @keyword.control
  event: (string) @string)

(call_action
  "call" @keyword
  function: (property_access) @function)

; =============================================================================
; FUNCTIONS & CALLS
; =============================================================================

(function_call
  function: (identifier) @function)

(function_call
  function: (property_access
    property: (identifier) @function.method))

; Built-in functions
((function_call
  function: (property_access
    object: (identifier) @module
    property: (identifier) @function.builtin))
  (#match? @module "^(audio|haptic|network|scene|player|console)$"))

; =============================================================================
; EXPRESSIONS
; =============================================================================

(binary_expression
  operator: _ @operator)

(unary_expression
  operator: _ @operator)

(ternary_expression
  "?" @operator.ternary
  ":" @operator.ternary)

(assignment
  ["=" "+=" "-=" "*=" "/="] @operator)

; This/self reference
(this) @variable.builtin
(self) @variable.builtin

(property_access
  object: (identifier) @variable
  "." @punctuation.delimiter
  property: (identifier) @property)

(subscript
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

; =============================================================================
; LITERALS
; =============================================================================

(number) @number

(string) @string

(color) @constant.character

(array
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

(object_literal
  "{" @punctuation.bracket
  "}" @punctuation.bracket)

; =============================================================================
; TYPES
; =============================================================================

(type) @type

[
  "number"
  "string"
  "boolean"
  "vec2"
  "vec3"
  "vec4"
  "quaternion"
  "color"
] @type.builtin

; =============================================================================
; PARTICLES & VFX
; =============================================================================

[
  "particles"
  "emitter"
  "vfx"
  "particle_system"
] @keyword.type

; Particle module keywords (must match grammar.js particle_module choice list)
[
  "emission"
  "lifetime"
  "velocity"
  "force"
  "color_over_life"
  "size_over_life"
  "noise"
  "collision"
  "sub_emitter"
  "shape"
  "renderer"
  "rotation_over_life"
  "trails"
  "texture_sheet"
  "inherit_velocity"
] @keyword.storage

(particle_block
  name: (string) @type.definition)

(particle_block
  name: (identifier) @type.definition)

; =============================================================================
; POST-PROCESSING
; =============================================================================

[
  "post_processing"
  "post_fx"
  "render_pipeline"
] @keyword.type

; Post-processing effect keywords (must match grammar.js post_effect choice list)
[
  "bloom"
  "ambient_occlusion"
  "ssao"
  "color_grading"
  "tone_mapping"
  "depth_of_field"
  "motion_blur"
  "vignette"
  "chromatic_aberration"
  "fog"
  "volumetric_fog"
  "screen_space_reflections"
  "ssr"
  "anti_aliasing"
  "fxaa"
  "smaa"
  "taa"
  "film_grain"
  "lens_flare"
  "god_rays"
  "outline"
  "pixelate"
] @function.builtin

(post_processing_block
  name: (string) @type.definition)

(post_processing_block
  name: (identifier) @type.definition)

; =============================================================================
; SPATIAL AUDIO
; =============================================================================

[
  "audio_source"
  "audio_listener"
  "reverb_zone"
  "audio_mixer"
  "ambience"
  "sound_emitter"
] @keyword.type

(audio_source_block
  name: (string) @type.definition)

(audio_source_block
  name: (identifier) @type.definition)

; =============================================================================
; WEATHER SYSTEM
; =============================================================================

[
  "weather"
  "atmosphere"
  "sky"
  "climate"
] @keyword.type

; Weather layer types (must match grammar.js weather_layer choice list)
[
  "rain"
  "snow"
  "wind"
  "lightning"
  "clouds"
  "hail"
  "time_of_day"
  "sun"
  "moon"
  "fog_layer"
  "aurora"
  "dust_storm"
  "humidity"
  "temperature"
] @constant.builtin

(weather_block
  name: (string) @type.definition)

(weather_block
  name: (identifier) @type.definition)

; =============================================================================
; PROCEDURAL GENERATION
; =============================================================================

[
  "procedural"
  "generate"
  "scatter"
  "distribute"
] @keyword.type

; Noise function types (must match grammar.js noise_function choice list)
[
  "perlin"
  "simplex"
  "voronoi"
  "worley"
  "fbm"
  "ridged"
  "cellular"
  "white_noise"
  "curl"
  "domain_warp"
] @function.builtin

(procedural_block
  name: (string) @type.definition)

(procedural_block
  name: (identifier) @type.definition)

; =============================================================================
; LOD & RENDER HINTS
; =============================================================================

[
  "lod"
  "render"
  "level"
] @keyword.type

(lod_level
  distance: (number) @number)

; =============================================================================
; NAVIGATION & AI BEHAVIOR
; =============================================================================

[
  "navmesh"
  "nav_agent"
  "behavior_tree"
  "obstacle"
  "nav_link"
  "nav_modifier"
  "crowd_manager"
] @keyword.type

; Behavior tree node types (must match grammar.js behavior_node choice list)
[
  "selector"
  "sequence"
  "condition"
  "leaf"
  "parallel"
  "decorator"
  "inverter"
  "repeater"
  "cooldown"
  "guard"
] @keyword.control

(navigation_block
  name: (string) @type.definition)

(navigation_block
  name: (identifier) @type.definition)

; =============================================================================
; INPUT SYSTEM
; =============================================================================

[
  "input"
  "interaction"
  "gesture_profile"
  "controller_map"
] @keyword.type

(input_block
  name: (string) @type.definition)

(input_block
  name: (identifier) @type.definition)

; =============================================================================
; CODEBASE ABSORPTION (v4.3)
; =============================================================================

["codebase" "module_map" "dependency_graph" "call_graph" "semantic_search" "graph_query"] @keyword.type

(codebase_block
  name: (string) @type.definition)

(codebase_block
  name: (identifier) @type.definition)

; =============================================================================
; ANNOTATIONS
; =============================================================================

(annotation
  "#[" @punctuation.special)

(annotation_entry
  key: (identifier) @property)

; =============================================================================
; HSPLUS LANGUAGE KEYWORDS
; =============================================================================

[
  "struct"
  "enum"
  "interface"
  "module"
  "function"
  "let"
  "const"
  "var"
  "import"
  "export"
  "from"
  "as"
  "await"
  "new"
  "of"
  "switch"
  "case"
  "default"
  "break"
  "throw"
  "try"
  "catch"
  "finally"
] @keyword

; =============================================================================
; BUILT-IN TEST FRAMEWORK
; =============================================================================

["test"] @keyword.type

(test_block
  name: (string) @type.definition)

[
  "given"
  "when"
  "then"
  "assert"
  "before_each"
  "after_each"
  "before_all"
  "after_all"
] @keyword.control

; =============================================================================
; COMMENTS
; =============================================================================

(comment) @comment

; =============================================================================
; IDENTIFIER (fallback)
; =============================================================================

(identifier) @variable
