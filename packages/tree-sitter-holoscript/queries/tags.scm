; tree-sitter-holoscript/queries/tags.scm
; Symbol tags for code navigation and outline views

; =============================================================================
; DEFINITIONS (symbols that should appear in outline/symbol view)
; =============================================================================

; Compositions are module-level
(composition
  name: (string) @name) @definition.module

; Worlds are also module-level
(world
  name: (string) @name) @definition.module

; Templates are type definitions
(template
  name: (string) @name) @definition.class

; Objects are variables/instances
(object
  name: (string) @name) @definition.variable

; Entities are variables
(entity
  name: (string) @name) @definition.variable

; Actions are functions
(action
  name: (identifier) @name) @definition.function

; Event handlers are methods
(event_handler
  event: (event_name) @name) @definition.method

; Animations are named definitions
(animation
  name: (identifier) @name) @definition.variable

; Timelines are named
(timeline
  name: (string) @name) @definition.variable

; Spatial groups are namespaces
(spatial_group
  name: (string) @name) @definition.namespace

; Trait definitions
(trait_definition
  name: (identifier) @name) @definition.interface

; Event bus definitions
(event_bus
  name: (identifier) @name) @definition.type

; Components inside entities
(component
  name: (identifier) @name) @definition.field

; Material definitions
(material_block
  name: (string) @name) @definition.class

(material_block
  name: (identifier) @name) @definition.class

; Physics sub-block definitions
(force_field_block
  name: (string) @name) @definition.variable

(force_field_block
  name: (identifier) @name) @definition.variable

(articulation_block
  name: (string) @name) @definition.class

(articulation_block
  name: (identifier) @name) @definition.class

(joint_block
  name: (string) @name) @definition.field

(joint_block
  name: (identifier) @name) @definition.field

; =============================================================================
; REFERENCES
; =============================================================================

; Template usage in objects
(object
  template: (string) @name) @reference.class

; Function calls
(function_call
  function: (identifier) @name) @reference.call

(function_call
  function: (property_access
    property: (identifier) @name)) @reference.call
