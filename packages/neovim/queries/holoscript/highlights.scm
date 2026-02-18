; HoloScript Tree-sitter highlights
; Requires: tree-sitter-holoscript grammar
; See: packages/tree-sitter-holoscript/

; ===========================================================================
; Keywords
; ===========================================================================

[
  "orb"
  "template"
  "environment"
  "logic"
  "import"
  "from"
  "type"
] @keyword

[
  "on_click"
  "on_tick"
  "on_hover"
  "on_mount"
  "on_unmount"
] @keyword.function

[
  "true"
  "false"
  "null"
] @constant.builtin

[
  "if"
  "else"
  "return"
  "let"
  "const"
] @keyword.control

; ===========================================================================
; Directives (traits)
; ===========================================================================

(directive_name) @attribute

; ===========================================================================
; Identifiers
; ===========================================================================

(orb_definition
  name: (string) @type)

(template_definition
  name: (string) @type)

(environment_definition
  name: (string) @type)

(property_key) @property

(identifier) @variable

(spread_expression
  name: (identifier) @type)

; ===========================================================================
; Literals
; ===========================================================================

(string_literal) @string

(number_literal) @number

(boolean_literal) @boolean

; ===========================================================================
; Type aliases
; ===========================================================================

(type_alias
  name: (identifier) @type.definition)

; ===========================================================================
; Comments
; ===========================================================================

(line_comment) @comment

(block_comment) @comment

; ===========================================================================
; Operators
; ===========================================================================

[
  "="
  "??="
  "=>"
  "+"
  "-"
  "*"
  "/"
  "?"
  "??"
  "!"
  ":"
  "..."
] @operator

; ===========================================================================
; Delimiters
; ===========================================================================

[
  "{"
  "}"
  "["
  "]"
  "("
  ")"
  ","
] @punctuation.delimiter
