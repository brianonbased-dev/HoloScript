; HoloScript Tree-sitter injections
; Inject languages embedded within HoloScript source

; JavaScript/TypeScript inside logic blocks
(logic_block
  body: (block_body) @injection.content
  (#set! injection.language "javascript")
  (#set! injection.include-children))

; Inline expressions in string interpolations
(template_literal
  (interpolation
    (expression) @injection.content
    (#set! injection.language "javascript")))

; GLSL shaders in compute trait arguments (if present)
(trait_arguments
  "shader:" (string_literal) @injection.content
  (#set! injection.language "glsl"))
