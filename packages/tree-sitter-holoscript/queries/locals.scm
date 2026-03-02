; tree-sitter-holoscript/queries/locals.scm
; Local variable scoping queries for HoloScript

; =============================================================================
; SCOPE DEFINITIONS
; =============================================================================

; Top-level scopes
(composition) @scope
(world) @scope
(template) @scope
(object) @scope
(entity) @scope
(action) @scope
(trait_definition) @scope

; Block scopes
(block) @scope
(if_statement) @scope
(for_loop) @scope
(while_loop) @scope

; Nested scopes
(state_block) @scope
(networked_block) @scope
(animation) @scope
(event_handler) @scope
(logic) @scope

; =============================================================================
; DEFINITIONS
; =============================================================================

; Composition/world name is a definition
(composition
  name: (string) @definition.namespace)

(world
  name: (string) @definition.namespace)

; Template definitions
(template
  name: (string) @definition.type)

; Object definitions
(object
  name: (string) @definition.var)

; Entity definitions
(entity
  name: (string) @definition.var)

; Action definitions
(action
  name: (identifier) @definition.function)

; Parameter definitions
(parameter
  name: (identifier) @definition.parameter)

; Property definitions (state variables)
(state_block
  (property
    key: (identifier) @definition.var))

; Animation names
(animation
  name: (identifier) @definition.var)

; Event bus definitions
(event_bus
  name: (identifier) @definition.type)

; Trait definitions
(trait_definition
  name: (identifier) @definition.type)

; =============================================================================
; REFERENCES
; =============================================================================

; Property access references
(property_access
  object: (identifier) @reference)

(property_access
  property: (identifier) @reference)

; Function call references
(function_call
  function: (identifier) @reference)

; Simple identifier references
(identifier) @reference

; Template usage
(object
  template: (string) @reference)

; Material block scopes
(material_block) @scope

; Material block definitions
(material_block
  name: (string) @definition.type)

(material_block
  name: (identifier) @definition.type)

; =============================================================================
; SPECIAL SCOPES
; =============================================================================

; 'this' and 'self' are special built-in references
(this) @reference.builtin
(self) @reference.builtin
