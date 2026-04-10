; tree-sitter-holoscript/queries/indents.scm
; Indentation queries for HoloScript

; =============================================================================
; INDENT ON OPEN BRACE
; =============================================================================

; Top-level definitions with direct "{" children
(composition "{" @indent)
(world "{" @indent)
(template "{" @indent)
(object "{" @indent)
(entity "{" @indent)

; Nested blocks with direct "{" children
(environment "{" @indent)
(state_block "{" @indent)
(networked_block "{" @indent)
(physics_block "{" @indent)
(collider_block "{" @indent)
(rigidbody_block "{" @indent)
(force_field_block "{" @indent)
(articulation_block "{" @indent)
(joint_block "{" @indent)
(animation "{" @indent)
(timeline "{" @indent)
(logic "{" @indent)
(spatial_group "{" @indent)
(component "{" @indent)

; Code blocks (used by action, event_handler, if_statement, for_loop, while_loop)
(block "{" @indent)

; Literals
(array "[" @indent)
(object_literal "{" @indent)

; =============================================================================
; DEDENT ON CLOSE BRACE
; =============================================================================

"}" @dedent
"]" @dedent

; =============================================================================
; ALIGN RULES
; =============================================================================

; Align properties
(property) @align

; Align array elements
(array (_) @align)

; =============================================================================
; SPECIAL CASES
; =============================================================================

; Keep else on same indent level as if
(if_statement
  "else" @branch)

; Continue statements don't change indent
(return_statement) @same_line
