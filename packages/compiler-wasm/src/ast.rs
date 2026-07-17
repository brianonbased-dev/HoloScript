//! AST (Abstract Syntax Tree) types for HoloScript.

use serde::{Deserialize, Serialize};
use typeshare::typeshare;

/// Root AST node representing a HoloScript file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[typeshare]
pub struct Ast {
    #[serde(rename = "type")]
    pub node_type: String,
    pub body: Vec<AstNode>,
    pub directives: Vec<Directive>,
}

impl Default for Ast {
    fn default() -> Self {
        Self {
            node_type: "Program".to_string(),
            body: Vec::new(),
            directives: Vec::new(),
        }
    }
}

/// Any AST node
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[typeshare]
pub enum AstNode {
    // Object definitions
    Composition(CompositionNode),
    World(WorldNode),
    Orb(OrbNode),
    Entity(EntityNode),
    Object(ObjectNode),
    Template(TemplateNode),
    Group(GroupNode),
    Timeline(TimelineNode),
    Track(TrackNode),
    Environment(EnvironmentNode),
    Logic(LogicNode),

    // Game constructs
    Npc(NpcNode),
    Quest(QuestNode),
    Ability(AbilityNode),
    Dialogue(DialogueNode),
    StateMachine(StateMachineNode),
    Achievement(AchievementNode),
    TalentTree(TalentTreeNode),

    // Properties and values
    Property(PropertyNode),
    Trait(TraitNode),
    Array(ArrayNode),
    ObjectLiteral(ObjectLiteralNode),

    // Literals
    String(StringLiteral),
    Number(NumberLiteral),
    Boolean(BooleanLiteral),
    Null(NullLiteral),
    Identifier(IdentifierNode),

    // Expressions
    BinaryExpression(BinaryExpression),
    UnaryExpression(UnaryExpression),
    CallExpression(CallExpression),
    LambdaExpression(LambdaExpression),
    MemberExpression(MemberExpression),
    SpreadElement(SpreadElement),

    // Statements
    Using(UsingNode),
    Import(ImportNode),
    Export(ExportNode),
    Function(FunctionNode),
    Return(ReturnNode),
    If(IfNode),
    For(ForNode),
    ForOf(ForOfNode),
    While(WhileNode),
    EnumDeclaration(EnumDeclarationNode),
    StructDeclaration(StructDeclarationNode),
    VariableDeclaration(VariableDeclarationNode),
    StackSlotDeclaration(StackSlotDeclarationNode),
    LexicalScope(LexicalScopeNode),
    Assignment(AssignmentNode),

    // Event handlers
    EventHandler(EventHandlerNode),

    // Behavioral constructs
    MovementStatement(MovementStatementNode),
    ActionDecl(ActionDeclNode),
    GameEventBlock(GameEventBlockNode),

    // Comments
    Comment(CommentNode),

    // Epistemic frame declaration
    FrameDeclaration(FrameDeclarationNode),
}

/// Location information for AST nodes
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[typeshare]
pub struct Location {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[typeshare]
pub struct Position {
    pub line: usize,
    pub column: usize,
    pub offset: usize,
}

/// Composition node (root scene definition)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompositionNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// World node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Orb node (3D object)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Entity node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Generic object node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectNode {
    pub name: String,
    pub object_type: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Template node (reusable object definition)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Group node (container for multiple objects)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Timeline node (named temporal / animation-sequence container). Mirrors
/// `GroupNode`: `properties` carry sequencing parameters (e.g. `duration`,
/// `autoplay`, `loop`, `stagger`) and `children` are the sequenced statements
/// (e.g. `move` statements). Parsed in both top-level and nested positions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineNode {
    pub name: String,
    pub traits: Vec<TraitNode>,
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// A keyframe-track inside a `timeline`: `track "<target>" { key … ; key … }`.
/// `target` is the animated prop name (e.g. `"scaleUniform"`, `"position.x"`);
/// `keyframes` are ordered key entries. Harvested from Theatre.js's Sequence
/// model — the track is the per-prop keyframe channel of a sequence. Native:
/// the track is DATA the sequencer runtime consumes, not a class.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackNode {
    pub target: String,
    pub keyframes: Vec<KeyframeNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// A single keyframe inside a `track`: `key <time> { <value> } [easing <ease>]`.
/// `time` is the position along the timeline (seconds or normalized 0..1 — the
/// runtime decides); `value` is the target value expression in the `{…}` block;
/// `easing` is the per-segment timing function (reuses the shipped
/// `spring`/`bounce`/`easeX` easings — direct payoff of the anime.js work).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeNode {
    pub time: f64,
    pub value: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub easing: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Environment node (scene-wide settings)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentNode {
    pub properties: Vec<PropertyNode>,
    pub children: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Logic node (embedded scripting)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicNode {
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// NPC node (game character)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Quest node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Ability node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbilityNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Dialogue node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DialogueNode {
    pub id: String,
    pub properties: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// State machine node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateMachineNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
    pub states: Vec<StateNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
}

/// Achievement node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Talent tree node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentTreeNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
    pub tiers: Vec<TalentTierNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentTierNode {
    pub level: i32,
    pub nodes: Vec<TalentNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentNode {
    pub name: String,
    pub properties: Vec<PropertyNode>,
}

/// Property node (key: value)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropertyNode {
    pub key: String,
    pub value: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Trait node (@traitname or @traitname { config })
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraitNode {
    pub name: String,
    /// Instance/label name for named annotations inside a trait definition body,
    /// e.g. the `mcp_registrar_config` in `@receipt mcp_registrar_config { … }`.
    /// `None` for plain `@decorator` applications and for `@trait NAME` (whose
    /// NAME lives in `name`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<Box<AstNode>>,
    /// Trait-DEFINITION body members that are not plain `key: value` properties:
    /// `@on_*` event handlers and nested `@receipt`/`@synced`/… annotations.
    /// Empty for trait applications (`@grabbable`). `config` still carries the
    /// plain properties as an `ObjectLiteral`, so existing config consumers are
    /// unaffected.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub members: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Array literal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArrayNode {
    pub elements: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Object literal { key: value, ... }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectLiteralNode {
    pub properties: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// String literal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StringLiteral {
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Number literal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberLiteral {
    pub value: f64,
    pub raw: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Boolean literal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BooleanLiteral {
    pub value: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Null literal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NullLiteral {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Identifier
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentifierNode {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Binary expression (a + b, a > b, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryExpression {
    pub operator: String,
    pub left: Box<AstNode>,
    pub right: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Unary expression (!a, -b, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnaryExpression {
    pub operator: String,
    pub argument: Box<AstNode>,
    pub prefix: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Function call expression
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallExpression {
    pub callee: Box<AstNode>,
    pub arguments: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Lambda expression (`(x) => x + 1`), intentionally scoped to expression bodies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LambdaExpression {
    pub params: Vec<String>,
    pub body: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Member expression (object.property)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberExpression {
    pub object: Box<AstNode>,
    pub property: Box<AstNode>,
    pub computed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Spread element (...expr)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadElement {
    pub argument: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Using statement (template instantiation)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsingNode {
    pub template: String,
    pub overrides: Vec<PropertyNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Import statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportNode {
    pub specifiers: Vec<ImportSpecifier>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSpecifier {
    pub imported: String,
    pub local: String,
}

/// Export statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportNode {
    pub declaration: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Function definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionNode {
    pub name: String,
    pub params: Vec<String>,
    /// Optional machine-level type for each parameter. Empty for legacy untyped functions so
    /// their serialized AST shape remains unchanged; otherwise aligned 1:1 with `params`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub param_types: Vec<Option<String>>,
    /// Explicit return type when written as `function name(...): type`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Enum (sum-type) declaration: `enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }`.
/// A named, fixed set of bare member identifiers. The `.hs` logic subset uses it as a closed
/// return-domain for routing decisions; the Kotlin backend emits `enum class <name> { <members> }`
/// and lets a function that returns `<name>.<Member>` infer the enum return type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnumDeclarationNode {
    pub name: String,
    pub members: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Struct (record) declaration: `struct Vec3 { x, y, z }` or `struct Hit { id, dist }`.
/// A named immutable data carrier whose fields are bare identifiers (untyped in the `.hs`
/// logic subset — the Kotlin backend types each field by usage, defaulting to `Float`).
/// The Kotlin backend emits `data class <Name>(val <field>: <T>, …)`; pure functions can
/// return a struct to carry a multi-field result without resorting to a side-effecting host call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructDeclarationNode {
    pub name: String,
    pub fields: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Variable declaration: `let x = expr` / `const x = expr` / `var x = expr`.
///
/// `mutable` is `true` only for `var`. The `.hs` logic subset is single-assignment by default
/// (`let`/`const` → Kotlin `val`); a `var` binding opts into LOCAL mutable state so a pure
/// function can accumulate inside a loop (functional-core: the mutation never escapes the
/// function — host state stays in the Kotlin shell, per MEMORY W.815). The Kotlin backend emits
/// `val`/`var` accordingly.
///
/// Distinct from the object-graph `PropertyNode` (`key: value`) so the emitter can tell a logic
/// binding apart from a scene property and pick `val` vs `var`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableDeclarationNode {
    pub name: String,
    /// Explicit local type when written as `let name: type = value`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_annotation: Option<String>,
    pub value: Box<AstNode>,
    pub mutable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Addressable, function-local machine storage: `slot value: i32 = 0`.
///
/// A stack slot is deliberately distinct from an SSA local. Its identity carries provenance:
/// consumers must use the native `load(slot)` and `store(slot, value)` operations, and the slot
/// cannot be treated as a scalar value or escape its declaring function.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackSlotDeclarationNode {
    pub name: String,
    pub type_annotation: String,
    pub value: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Compiler-owned lexical lifetime boundary: `scope { ... }`.
///
/// Unlike a scene `LogicNode`, this is a canonical statement node. Native machine contracts use
/// it to delimit local/reference visibility and to release scoped borrow leases atomically when
/// control reaches the closing brace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LexicalScopeNode {
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Assignment / compound-assignment statement: `x = expr`, `x += expr`, `acc = acc + 1`.
///
/// Only legal against a previously-declared `var` (LOCAL mutable state). The parser records the
/// operator verbatim (`=`, `+=`, `-=`, `*=`, `/=`, `%=`); the Kotlin backend emits it unchanged.
/// The target is an l-value expression (a bare identifier today; member/index targets parse too).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentNode {
    pub operator: String,
    pub target: Box<AstNode>,
    pub value: Box<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// For-of / for-in loop over a range or iterable: `for (i in 0..n) { … }` or
/// `for (x in items) { … }`. The idiomatic PURE loop form — bounded iteration with a local
/// binding, no C-style mutable counter ceremony. `range` carries the iterable expression
/// (`RangeExpression` for `a..b`, or any expression for an array/identifier). The Kotlin backend
/// emits `for (<var> in <range>) { … }` directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForOfNode {
    pub var_name: String,
    pub range: Box<AstNode>,
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Return statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argument: Option<Box<AstNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// If statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfNode {
    pub test: Box<AstNode>,
    pub consequent: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternate: Option<Vec<AstNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// For loop
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForNode {
    pub init: Option<Box<AstNode>>,
    pub test: Option<Box<AstNode>>,
    pub update: Option<Box<AstNode>>,
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// While loop
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhileNode {
    pub test: Box<AstNode>,
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Event handler (onGrab, onClick, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventHandlerNode {
    pub event: String,
    pub body: Vec<AstNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Movement destination: a `[x, y, z]` position triple, or an entity id to
/// follow/seek. Untagged so it serializes as a bare array-or-string, matching
/// the TS `[number, number, number] | string` union.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MovementDestination {
    Position([f64; 3]),
    EntityId(String),
}

/// Movement statement: `move <target> to <dest> [over <n>] [via <mode>] [easing <ease>]`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovementStatementNode {
    pub target: String,
    pub destination: MovementDestination,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub easing: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// A single declarative requirement/effect clause inside an `action` block.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionClause {
    pub kind: String,
    pub body: String,
}

/// Action declaration: `action <name>(params) { @requires {…} effect {…} … }`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionDeclNode {
    pub name: String,
    pub params: Vec<String>,
    pub clauses: Vec<ActionClause>,
    pub flags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Generalized reaction / event block: `on_grab { … }`, `on_death { … }`, etc.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEventBlockNode {
    pub name: String,
    pub params: Vec<String>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Comment node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentNode {
    pub value: String,
    pub block: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Directive (structural annotations like @manifest, @world_metadata)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Directive {
    pub name: String,
    pub config: Option<Box<AstNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

/// Parsed form of `@frame_declaration { ... }` when it appears as a top-level
/// directive in a `.hs` file or on an object/trait node.
///
/// The Rust parser materialises the declaration from a generic `Directive` whose
/// `name == "frame_declaration"` by calling `FrameDeclarationNode::try_from_directive`.
/// All fields default to the permissive baseline when absent from the source block.
///
/// Serialises to JSON with snake_case keys so the TS wasm-api layer can read it
/// directly without a naming translation step.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[typeshare]
pub struct FrameDeclarationNode {
    /// Primary knowledge domain. `"*"` means unrestricted.
    #[serde(default = "frame_domain_default")]
    pub domain: String,

    /// Temporal knowledge cutoff as an ISO-8601 prefix (e.g. `"2026-06"`).
    /// Empty string means no cutoff.
    #[serde(default)]
    pub horizon: String,

    /// Capability tier — 0 (sovereign) through 3 (restricted). Default: 2.
    #[serde(default = "frame_tier_default")]
    pub capability_tier: u8,

    /// Trust tier — 0 through 3. Default: 2.
    #[serde(default = "frame_tier_default")]
    pub trust_tier: u8,

    /// Explicit tool allowlist. Empty vec = all tools permitted.
    #[serde(default)]
    pub allowed_tools: Vec<String>,

    /// Domains this agent must not act on.
    #[serde(default)]
    pub denied_domains: Vec<String>,

    /// Source location in the original file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc: Option<Location>,
}

fn frame_domain_default() -> String {
    "*".to_string()
}

fn frame_tier_default() -> u8 {
    2
}

impl FrameDeclarationNode {
    /// Extract a `FrameDeclarationNode` from a generic `Directive` whose name is
    /// `"frame_declaration"`. Returns `None` if the directive name does not match.
    /// All fields default gracefully when the config block is absent or incomplete.
    pub fn try_from_directive(directive: &Directive) -> Option<Self> {
        if directive.name != "frame_declaration" {
            return None;
        }

        let loc = directive.loc.clone();

        // Config block is optional — all fields default when absent
        let Some(config_node) = &directive.config else {
            return Some(Self {
                domain: frame_domain_default(),
                horizon: String::new(),
                capability_tier: frame_tier_default(),
                trust_tier: frame_tier_default(),
                allowed_tools: Vec::new(),
                denied_domains: Vec::new(),
                loc,
            });
        };

        // Config must be an ObjectLiteral to extract fields
        let AstNode::ObjectLiteral(obj) = config_node.as_ref() else {
            return Some(Self {
                domain: frame_domain_default(),
                horizon: String::new(),
                capability_tier: frame_tier_default(),
                trust_tier: frame_tier_default(),
                allowed_tools: Vec::new(),
                denied_domains: Vec::new(),
                loc,
            });
        };

        let mut domain = frame_domain_default();
        let mut horizon = String::new();
        let mut capability_tier = frame_tier_default();
        let mut trust_tier = frame_tier_default();
        let mut allowed_tools: Vec<String> = Vec::new();
        let mut denied_domains: Vec<String> = Vec::new();

        for prop in &obj.properties {
            match prop.key.as_str() {
                "domain" => {
                    if let AstNode::String(s) = prop.value.as_ref() {
                        domain = s.value.clone();
                    } else if let AstNode::Identifier(id) = prop.value.as_ref() {
                        domain = id.name.clone();
                    }
                }
                "horizon" => {
                    if let AstNode::String(s) = prop.value.as_ref() {
                        horizon = s.value.clone();
                    }
                }
                "capability_tier" => {
                    if let AstNode::Number(n) = prop.value.as_ref() {
                        let v = n.value as u8;
                        if v <= 3 {
                            capability_tier = v;
                        }
                    }
                }
                "trust_tier" => {
                    if let AstNode::Number(n) = prop.value.as_ref() {
                        let v = n.value as u8;
                        if v <= 3 {
                            trust_tier = v;
                        }
                    }
                }
                "allowed_tools" => {
                    if let AstNode::Array(arr) = prop.value.as_ref() {
                        for elem in &arr.elements {
                            if let AstNode::String(s) = elem {
                                allowed_tools.push(s.value.clone());
                            }
                        }
                    }
                }
                "denied_domains" => {
                    if let AstNode::Array(arr) = prop.value.as_ref() {
                        for elem in &arr.elements {
                            if let AstNode::String(s) = elem {
                                denied_domains.push(s.value.clone());
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        Some(Self {
            domain,
            horizon,
            capability_tier,
            trust_tier,
            allowed_tools,
            denied_domains,
            loc,
        })
    }
}
