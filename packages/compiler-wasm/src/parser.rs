//! Subset parser for the `.hs` object-graph dialect of HoloScript.
//!
//! Covers: `composition`, `world`, `orb`, `entity`, `object`, `template`,
//! `group`, `environment`, `logic`, `npc`, `quest`, `ability`, `dialogue`,
//! `state_machine`, `achievement`, `talent_tree`, `import`, `export`,
//! `function`, `move`, `action`, `on_*` event blocks, and the standard
//! expression grammar.
//!
//! Does NOT cover `.hsplus` constructs (`brain`, cognitive actions, pipelines,
//! `@safe_daemon`, etc.) or the extended `HoloCompositionParser` surface
//! (spatial groups, lights, audio, camera, timelines, terrain, norms, etc.).
//! See `lib.rs` for the full scope note.

use crate::ast::*;
use crate::lexer::Lexer;
use crate::token::{Token, TokenType};

type ObjectBody = (Vec<TraitNode>, Vec<PropertyNode>, Vec<AstNode>);

/// Parse error
#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

impl ParseError {
    pub fn new(message: impl Into<String>, line: usize, column: usize) -> Self {
        Self {
            message: message.into(),
            line,
            column,
        }
    }
}

/// Parser for HoloScript
pub struct Parser {
    tokens: Vec<Token>,
    current: usize,
    errors: Vec<ParseError>,
}

impl Parser {
    pub fn new(source: &str) -> Self {
        let mut lexer = Lexer::new(source);
        let raw_tokens = lexer.tokenize();
        let errors = raw_tokens
            .iter()
            .filter(|token| token.token_type == TokenType::Forbidden)
            .map(|token| {
                ParseError::new(
                    format!(
                        "HS010: Security violation: blocked lexical capability `{}`",
                        token.value.trim_start_matches('@')
                    ),
                    token.line,
                    token.column,
                )
            })
            .collect();
        let tokens: Vec<Token> = raw_tokens
            .into_iter()
            .filter(|t| {
                !matches!(
                    t.token_type,
                    TokenType::Whitespace
                        | TokenType::Newline
                        | TokenType::Comment
                        | TokenType::BlockComment
                )
            })
            .collect();

        Self {
            tokens,
            current: 0,
            errors,
        }
    }

    /// Parse the source code into an AST
    pub fn parse(&mut self) -> Result<Ast, Vec<ParseError>> {
        if !self.errors.is_empty() {
            return Err(self.errors.clone());
        }
        let mut ast = Ast::default();

        while !self.is_at_end() {
            match self.parse_top_level() {
                Ok(node) => ast.body.push(node),
                Err(e) => {
                    self.errors.push(e);
                    self.synchronize();
                }
            }
        }

        if self.errors.is_empty() {
            Ok(ast)
        } else {
            Err(self.errors.clone())
        }
    }

    fn parse_top_level(&mut self) -> Result<AstNode, ParseError> {
        // `@frame_declaration { ... }` at the top level is promoted to a typed
        // FrameDeclarationNode rather than a generic Trait node. This lets consumers
        // pattern-match on `AstNode::FrameDeclaration` without inspecting the name.
        if self.check(TokenType::Trait)
            && self.peek().value.trim_start_matches('@') == "frame_declaration"
        {
            let trait_node = self.parse_trait()?;
            // Build the equivalent Directive and extract the typed node.
            let directive = crate::ast::Directive {
                name: trait_node.name.clone(),
                config: trait_node.config,
                loc: trait_node.loc,
            };
            if let Some(fd) = crate::ast::FrameDeclarationNode::try_from_directive(&directive) {
                return Ok(AstNode::FrameDeclaration(fd));
            }
        }

        // All other top-level traits remain generic Trait nodes (directives).
        if self.check(TokenType::Trait) {
            let trait_node = self.parse_trait()?;
            // Store as directive (we could add to ast.directives here)
            return Ok(AstNode::Trait(trait_node));
        }

        match self.peek().token_type {
            TokenType::Composition => self.parse_composition(),
            TokenType::World => self.parse_world(),
            TokenType::Orb => self.parse_orb(),
            TokenType::Entity => self.parse_entity(),
            TokenType::Object => self.parse_generic_object("object"),
            TokenType::Template => self.parse_template(),
            TokenType::Group => self.parse_group(),
            TokenType::Timeline => self.parse_timeline(),
            TokenType::Environment => self.parse_environment(),
            TokenType::Logic => self.parse_logic(),
            TokenType::Npc => self.parse_npc(),
            TokenType::Quest => self.parse_quest(),
            TokenType::Ability => self.parse_ability(),
            TokenType::Dialogue => self.parse_dialogue(),
            TokenType::StateMachine => self.parse_state_machine(),
            TokenType::Achievement => self.parse_achievement(),
            TokenType::TalentTree => self.parse_talent_tree(),
            TokenType::Import => self.parse_import(),
            TokenType::Export => self.parse_export(),
            TokenType::Function => self.parse_function(),
            TokenType::Enum => self.parse_enum_declaration(),
            TokenType::Struct => self.parse_struct_declaration(),
            TokenType::Move => self.parse_move_statement(),
            TokenType::Action => self.parse_action_decl(),
            TokenType::OnEvent => self.parse_game_event_block(),
            TokenType::Identifier => {
                // Could be a generic object type (cube, sphere, etc.)
                let name = self.peek().value.clone();
                if self.is_object_type(&name) {
                    self.parse_generic_object(&name)
                } else {
                    Err(self.error(&format!("Unexpected identifier: {}", name)))
                }
            }
            _ => Err(self.error(&format!("Unexpected token: {:?}", self.peek().token_type))),
        }
    }

    fn is_object_type(&self, name: &str) -> bool {
        matches!(
            name,
            "cube" | "sphere" | "plane" | "cylinder" | "mesh" | "light" | "camera"
        )
    }

    fn parse_composition(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'composition'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Composition(CompositionNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// True when the cursor is at the start of a `module <Name> { … }` block —
    /// the `.hsplus` native-surface form nested inside a `composition`. `module`
    /// lexes as an Identifier (not a keyword), so it is matched by value with a
    /// look-ahead: a name (identifier or string) followed by an opening brace.
    /// The brace look-ahead disambiguates this block from a property literally
    /// named `module` (`module: <value>`, which has a Colon after the name).
    fn is_module_start(&self) -> bool {
        if !(self.check(TokenType::Identifier) && self.peek().value == "module") {
            return false;
        }
        matches!(
            self.peek_at(1).map(|t| &t.token_type),
            Some(TokenType::Identifier) | Some(TokenType::String)
        ) && matches!(
            self.peek_at(2).map(|t| &t.token_type),
            Some(TokenType::LBrace)
        )
    }

    /// True when the cursor is at `<word> { … }` — a keyword-by-value named
    /// block (`state { … }`, `exports { … }`) inside a `module` body. `<word>`
    /// lexes as an Identifier; the brace look-ahead keeps it distinct from a
    /// `<word>: <value>` property.
    fn is_named_block_start(&self, word: &str) -> bool {
        self.check(TokenType::Identifier)
            && self.peek().value == word
            && matches!(
                self.peek_at(1).map(|t| &t.token_type),
                Some(TokenType::LBrace)
            )
    }

    /// Parse a `module <Name> { … }` block (the `.hsplus` native surface). The
    /// body mixes a `state { … }` property block, `action <name>(…) { … }`
    /// declarations, an `exports { … }` name list, trait annotations, and plain
    /// `key: value` module properties. Represented as a `GroupNode` (a named
    /// container of children) so no new AST variant / emitter arm is required —
    /// the shadow-parity surface only needs the form to parse, and the module's
    /// children carry its state/actions/exports structurally.
    fn parse_module(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'module' (matched by value)

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let mut traits = Vec::new();
        let mut properties = Vec::new();
        let mut children = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            if self.check(TokenType::Trait) {
                traits.push(self.parse_trait()?);
            } else if self.check(TokenType::Action) {
                children.push(self.parse_action_decl()?);
            } else if self.is_named_block_start("state") {
                children.push(self.parse_named_property_block()?);
            } else if self.is_named_block_start("exports") {
                children.push(self.parse_exports_block()?);
            } else if self.is_module_start() {
                // Additive: tolerate a nested `module` (submodule) block.
                children.push(self.parse_module()?);
            } else if self.is_child_object() {
                children.push(self.parse_top_level()?);
            } else if self.check(TokenType::Identifier) {
                let ident = self.peek().value.clone();
                if ident.starts_with("on") && self.peek_next_is(TokenType::Colon) {
                    children.push(self.parse_event_handler()?);
                } else if self.is_object_type(&ident) {
                    children.push(self.parse_generic_object(&ident)?);
                } else {
                    properties.push(self.parse_property()?);
                }
            } else {
                return Err(self
                    .error("Expected state, action, exports, trait, or property in module body"));
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Group(GroupNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a `<word> { key: value … }` property block (the `state { … }` block
    /// inside a `module`). The block name is captured by value; the body is the
    /// standard property-only grammar (so array / string / number / bool values
    /// and multi-line `capability_tags: [ … ]` all parse). Returned as a
    /// `GroupNode` named for the block, carrying the entries as `properties`.
    fn parse_named_property_block(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        let block_name = self.advance().value.clone(); // 'state' (matched by value)
        self.expect(TokenType::LBrace)?;

        let properties = self.parse_properties_only()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Group(GroupNode {
            name: block_name,
            traits: Vec::new(),
            properties,
            children: Vec::new(),
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse an `exports { a, b, c }` block — the module's exported-name list.
    /// Entries are bare identifiers (or strings), separated by commas / newlines
    /// / semicolons (all optional, matching the lenient enum/struct member
    /// grammar). Captured as a `GroupNode` named `exports` whose children are the
    /// exported names as `Identifier` nodes.
    fn parse_exports_block(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'exports' (matched by value)
        self.expect(TokenType::LBrace)?;

        let mut children = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            if self.check(TokenType::Comma) || self.check(TokenType::Semicolon) {
                self.advance();
                continue;
            }
            let export_start = self.current_location();
            let export_name = self.expect_string_or_identifier()?;
            children.push(AstNode::Identifier(IdentifierNode {
                name: export_name,
                loc: Some(self.location_from(export_start)),
            }));
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Group(GroupNode {
            name: "exports".to_string(),
            traits: Vec::new(),
            properties: Vec::new(),
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_world(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'world'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::World(WorldNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_orb(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'orb'

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Orb(OrbNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_entity(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'entity'

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Entity(EntityNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_generic_object(&mut self, object_type: &str) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume type keyword

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Object(ObjectNode {
            name,
            object_type: object_type.to_string(),
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_template(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'template'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Template(TemplateNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_group(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'group'

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Group(GroupNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a timeline construct: `timeline <name> { ...properties, tracks, children }`.
    /// Mirrors `parse_group` — a named temporal container. Properties carry the
    /// sequencing parameters (`duration`, `autoplay`, `loop`, `stagger`);
    /// `track "<target>" { key … }` sub-blocks are the keyframe channels
    /// (harvested from Theatre.js's Sequence model); remaining children are
    /// sequenced statements (e.g. `move` statements). Valid at top level and as
    /// a nested child (see `is_child_object`).
    fn parse_timeline(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'timeline'

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let (traits, properties, children) = self.parse_timeline_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Timeline(TimelineNode {
            name,
            traits,
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse the body of a `timeline`. Identical to `parse_object_body` except
    /// that an identifier `track` followed by a string/identifier target opens a
    /// keyframe-track sub-block (`track "<target>" { key … }`), pushed as a
    /// `Track` child node. `track` lexes as an `Identifier` (not a keyword), so
    /// it is matched by value — same convention as `move`'s `to`/`over`/`easing`.
    fn parse_timeline_body(&mut self) -> Result<ObjectBody, ParseError> {
        let mut traits = Vec::new();
        let mut properties = Vec::new();
        let mut children = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            if self.check(TokenType::Trait) {
                traits.push(self.parse_trait()?);
            } else if self.check(TokenType::Move) {
                children.push(self.parse_move_statement()?);
            } else if self.check(TokenType::Action) {
                children.push(self.parse_action_decl()?);
            } else if self.check(TokenType::OnEvent) {
                children.push(self.parse_game_event_block()?);
            } else if self.is_child_object() {
                children.push(self.parse_top_level()?);
            } else if self.is_track_start() {
                children.push(self.parse_track()?);
            } else if self.check(TokenType::Identifier) {
                let name = self.peek().value.clone();
                if name.starts_with("on") && self.peek_next_is(TokenType::Colon) {
                    children.push(self.parse_event_handler()?);
                } else if self.is_object_type(&name) {
                    children.push(self.parse_generic_object(&name)?);
                } else {
                    properties.push(self.parse_property()?);
                }
            } else {
                return Err(self.error("Expected trait, property, track, or nested object"));
            }
        }

        Ok((traits, properties, children))
    }

    /// True when the cursor is at the start of a `track "<target>" { … }` block:
    /// the identifier `track` followed by a string/identifier target and an
    /// opening brace. The brace look-ahead disambiguates the keyframe-track from
    /// a property literally named `track` (`track: <value>`), which has a colon
    /// next instead.
    fn is_track_start(&self) -> bool {
        if !(self.check(TokenType::Identifier) && self.peek().value == "track") {
            return false;
        }
        // Next token must be the target name (string or identifier), and the
        // one after that must open the keyframe block. This brace look-ahead
        // disambiguates `track "x" { … }` from a property named `track`.
        matches!(
            self.peek_at(1).map(|t| &t.token_type),
            Some(TokenType::String) | Some(TokenType::Identifier)
        ) && matches!(
            self.peek_at(2).map(|t| &t.token_type),
            Some(TokenType::LBrace)
        )
    }

    /// Parse a keyframe-track: `track "<target>" { key <time> { <value> } [easing <ease>] ; … }`.
    /// Keyframe separators (`;` / newline / `,`) are optional and skipped.
    fn parse_track(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'track' (matched by value)

        let target = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let mut keyframes = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            // Skip optional keyframe separators between entries (`;` / `,`).
            // Newlines are already filtered out, so separators are optional.
            if self.check(TokenType::Comma) || self.check(TokenType::Semicolon) {
                self.advance();
                continue;
            }
            if self.check_value("key") {
                keyframes.push(self.parse_keyframe()?);
            } else {
                return Err(self.error("Expected 'key' inside track block"));
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Track(TrackNode {
            target,
            keyframes,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a single keyframe entry: `key <time> { <value> } [easing <ease>]`.
    /// `key` and `easing` lex as identifiers (matched by value). The `{ <value> }`
    /// block holds the target value expression at this keyframe.
    fn parse_keyframe(&mut self) -> Result<KeyframeNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'key' (matched by value)

        // Keyframe time: a numeric literal.
        let time = if self.check(TokenType::Number) {
            self.advance().value.parse().unwrap_or(0.0)
        } else {
            return Err(self.error("Expected numeric time after 'key'"));
        };

        // `{ <value> }` value block.
        self.expect(TokenType::LBrace)?;
        let value = self.parse_value()?;
        self.expect(TokenType::RBrace)?;

        // Optional `easing <ease>` clause (reuses the shipped easing names).
        let mut easing: Option<String> = None;
        if self.check_value("easing") {
            self.advance();
            easing = Some(self.expect_identifier()?);
        }

        Ok(KeyframeNode {
            time,
            value: Box::new(value),
            easing,
            loc: Some(self.location_from(start_loc)),
        })
    }

    fn parse_environment(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'environment'

        self.expect(TokenType::LBrace)?;

        let (_, properties, children) = self.parse_object_body()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Environment(EnvironmentNode {
            properties,
            children,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_logic(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'logic'

        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Logic(LogicNode {
            body,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_npc(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'npc'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let properties = self.parse_properties_only()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Npc(NpcNode {
            name,
            properties,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_quest(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'quest'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let properties = self.parse_properties_only()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Quest(QuestNode {
            name,
            properties,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_ability(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'ability'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let properties = self.parse_properties_only()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Ability(AbilityNode {
            name,
            properties,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_dialogue(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'dialogue'

        let id = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let properties = self.parse_properties_only()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Dialogue(DialogueNode {
            id,
            properties,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_state_machine(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'state_machine'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let mut properties = Vec::new();
        let mut states = Vec::new();

        // Parse properties and states
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            let key = self.expect_identifier()?;
            self.expect(TokenType::Colon)?;

            if key == "states" {
                // Parse states block: { "idle": {...}, "running": {...} }
                self.expect(TokenType::LBrace)?;
                while !self.check(TokenType::RBrace) && !self.is_at_end() {
                    let state_name = self.expect_string_or_identifier()?;
                    self.expect(TokenType::Colon)?;
                    self.expect(TokenType::LBrace)?;
                    let state_props = self.parse_properties_only()?;
                    self.expect(TokenType::RBrace)?;

                    states.push(StateNode {
                        name: state_name,
                        properties: state_props,
                    });

                    // Optional comma between states
                    if self.check(TokenType::Comma) {
                        self.advance();
                    }
                }
                self.expect(TokenType::RBrace)?;
            } else {
                // Regular property
                let value = self.parse_expression()?;
                properties.push(PropertyNode {
                    key,
                    value: Box::new(value),
                    loc: None,
                });
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::StateMachine(StateMachineNode {
            name,
            properties,
            states,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_achievement(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'achievement'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let properties = self.parse_properties_only()?;

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Achievement(AchievementNode {
            name,
            properties,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_talent_tree(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'talent_tree'

        let name = self.expect_string_or_identifier()?;
        self.expect(TokenType::LBrace)?;

        let mut properties = Vec::new();
        let mut tiers = Vec::new();

        // Parse properties and tiers/rows
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            let key = self.expect_identifier()?;
            self.expect(TokenType::Colon)?;

            if key == "rows" || key == "tiers" {
                // Parse tiers array: [ { tier: 1, nodes: [...] }, ... ]
                self.expect(TokenType::LBracket)?;
                while !self.check(TokenType::RBracket) && !self.is_at_end() {
                    self.expect(TokenType::LBrace)?;

                    let mut level: i32 = 1;
                    let mut nodes = Vec::new();

                    // Parse tier properties
                    while !self.check(TokenType::RBrace) && !self.is_at_end() {
                        // Skip commas between properties
                        if self.check(TokenType::Comma) {
                            self.advance();
                            continue;
                        }

                        let tier_key = self.expect_identifier()?;
                        self.expect(TokenType::Colon)?;

                        if tier_key == "tier" || tier_key == "level" {
                            if let AstNode::Number(n) = self.parse_expression()? {
                                level = n.value as i32;
                            }
                        } else if tier_key == "nodes" {
                            // Parse nodes array: [ { name: "...", ... }, ... ]
                            self.expect(TokenType::LBracket)?;
                            while !self.check(TokenType::RBracket) && !self.is_at_end() {
                                self.expect(TokenType::LBrace)?;

                                let mut node_name = String::new();
                                let mut node_props = Vec::new();

                                while !self.check(TokenType::RBrace) && !self.is_at_end() {
                                    // Skip commas between properties
                                    if self.check(TokenType::Comma) {
                                        self.advance();
                                        continue;
                                    }

                                    let node_key = self.expect_identifier()?;
                                    self.expect(TokenType::Colon)?;
                                    let node_value = self.parse_expression()?;

                                    if node_key == "name" || node_key == "id" {
                                        if let AstNode::String(s) = &node_value {
                                            node_name = s.value.clone();
                                        }
                                    }
                                    node_props.push(PropertyNode {
                                        key: node_key,
                                        value: Box::new(node_value),
                                        loc: None,
                                    });
                                }

                                self.expect(TokenType::RBrace)?;
                                nodes.push(TalentNode {
                                    name: node_name,
                                    properties: node_props,
                                });

                                if self.check(TokenType::Comma) {
                                    self.advance();
                                }
                            }
                            self.expect(TokenType::RBracket)?;
                        } else {
                            // Skip unknown tier property
                            self.parse_expression()?;
                        }
                    }

                    self.expect(TokenType::RBrace)?;
                    tiers.push(TalentTierNode { level, nodes });

                    if self.check(TokenType::Comma) {
                        self.advance();
                    }
                }
                self.expect(TokenType::RBracket)?;
            } else {
                // Regular property
                let value = self.parse_expression()?;
                properties.push(PropertyNode {
                    key,
                    value: Box::new(value),
                    loc: None,
                });
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::TalentTree(TalentTreeNode {
            name,
            properties,
            tiers,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_import(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'import'

        let mut specifiers = Vec::new();

        // import { a, b } from "module"
        if self.check(TokenType::LBrace) {
            self.advance();
            while !self.check(TokenType::RBrace) && !self.is_at_end() {
                let imported = self.expect_identifier()?;
                let local = if self.check(TokenType::As) {
                    self.advance();
                    self.expect_identifier()?
                } else {
                    imported.clone()
                };
                specifiers.push(ImportSpecifier { imported, local });

                if !self.check(TokenType::RBrace) {
                    self.expect(TokenType::Comma)?;
                }
            }
            self.expect(TokenType::RBrace)?;
        }

        self.expect(TokenType::From)?;
        let source = self.expect_string()?;

        Ok(AstNode::Import(ImportNode {
            specifiers,
            source,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_export(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'export'

        let declaration = self.parse_top_level()?;

        Ok(AstNode::Export(ExportNode {
            declaration: Box::new(declaration),
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_function(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'function'

        let name = self.expect_identifier()?;
        let mut lifetimes = Vec::new();
        if self.check(TokenType::Lt) {
            self.advance();
            lifetimes.push(self.expect(TokenType::Lifetime)?.value.clone());
            self.expect(TokenType::Gt)?;
        }
        self.expect(TokenType::LParen)?;

        let mut params = Vec::new();
        let mut param_types = Vec::new();
        while !self.check(TokenType::RParen) && !self.is_at_end() {
            params.push(self.expect_identifier()?);
            let param_type = if self.check(TokenType::Colon) {
                self.advance();
                Some(self.parse_type_annotation()?)
            } else {
                None
            };
            param_types.push(param_type);
            if !self.check(TokenType::RParen) {
                self.expect(TokenType::Comma)?;
            }
        }
        self.expect(TokenType::RParen)?;

        let return_type = if self.check(TokenType::Colon) {
            self.advance();
            Some(self.parse_type_annotation()?)
        } else {
            None
        };

        if param_types.iter().all(Option::is_none) {
            param_types.clear();
        }

        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Function(FunctionNode {
            name,
            lifetimes,
            params,
            param_types,
            return_type,
            body,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse an enum (sum-type) declaration:
    ///   enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }
    ///
    /// The name and each member lex as Identifier tokens. Commas between members are
    /// optional (mirroring the object-literal grammar's lenient comma handling) and a
    /// trailing comma is tolerated. The members are a closed set of bare identifiers —
    /// no associated values, no methods (the `.hs` logic subset is data-only).
    fn parse_enum_declaration(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'enum'

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let mut members = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            members.push(self.expect_identifier()?);
            // Comma between members is optional; tolerate a trailing one.
            if self.check(TokenType::Comma) {
                self.advance();
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::EnumDeclaration(EnumDeclarationNode {
            name,
            members,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a struct (record) declaration: `struct Vec3 { x, y, z }`.
    /// Fields are bare identifiers; commas between them are optional and a trailing comma is
    /// tolerated (same lenient comma policy as enum members / object literals). Data-only — no
    /// methods. The Kotlin backend emits `data class Vec3(val x: Float, val y: Float, val z: Float)`.
    fn parse_struct_declaration(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'struct'

        let name = self.expect_identifier()?;
        self.expect(TokenType::LBrace)?;

        let mut fields = Vec::new();
        let mut field_types = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            fields.push(self.expect_identifier()?);
            let field_type = if self.check(TokenType::Colon) {
                self.advance();
                Some(self.parse_type_annotation()?)
            } else {
                None
            };
            field_types.push(field_type);
            if self.check(TokenType::Comma) {
                self.advance();
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::StructDeclaration(StructDeclarationNode {
            name,
            fields,
            field_types: if field_types.iter().all(Option::is_none) {
                Vec::new()
            } else {
                field_types
            },
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a movement statement:
    ///   move <target> to [x, y, z]
    ///   move <target> to otherEntity
    ///   move <target> to [..] over 2 via glide easing ease_in_out
    ///
    /// `target` is optional and defaults to `self`. Clause order after `to` is
    /// free (`over` / `via` / `easing` may appear in any order). `to` / `over` /
    /// `via` / `easing` lex as Identifier tokens, so they are matched by value.
    fn parse_move_statement(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'move'

        // Optional target preceding `to`; `move to [..]` implies self. The
        // target name may tokenize as a keyword (e.g. `player`, `entity`), so
        // accept any non-`to` Identifier/Keyword token here.
        let mut target = "self".to_string();
        if !self.check_value("to")
            && matches!(
                self.peek().token_type,
                TokenType::Identifier | TokenType::Keyword
            )
        {
            target = self.advance().value.clone();
        }

        // `to` is required (matched by value — it lexes as an Identifier).
        if !self.check_value("to") {
            return Err(self.error("Expected 'to' in move statement"));
        }
        self.advance(); // consume 'to'

        // Destination: a [x, y, z] literal, or an entity id.
        let destination = if self.check(TokenType::LBracket) {
            MovementDestination::Position(self.parse_vec3()?)
        } else {
            MovementDestination::EntityId(self.expect_identifier()?)
        };

        let mut duration: Option<f64> = None;
        let mut mode: Option<String> = None;
        let mut easing: Option<String> = None;

        // Free-order trailing clauses: over <n> | via <mode> | easing <ease>
        let mut guard = 0;
        while !self.is_at_end() && guard < 8 {
            guard += 1;
            if self.check_value("over") {
                self.advance();
                if self.check(TokenType::Number) {
                    duration = Some(self.advance().value.parse().unwrap_or(0.0));
                }
            } else if self.check_value("via") {
                self.advance();
                mode = Some(self.expect_identifier()?);
            } else if self.check_value("easing") {
                self.advance();
                easing = Some(self.expect_identifier()?);
            } else {
                break;
            }
        }

        Ok(AstNode::MovementStatement(MovementStatementNode {
            target,
            destination,
            duration,
            mode,
            easing,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a domain-neutral action declaration:
    ///   action open(target) {
    ///     @requires { distance < 2 }
    ///     @cooldown 1s
    ///     effect { state.open = true }
    ///     @server_side
    ///   }
    ///
    /// `@requires`/`@cost`/effect/etc. become clauses; bare `@`-flags
    /// (`@server_side`) become flags.
    fn parse_action_decl(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        self.advance(); // consume 'action'

        let name = self.expect_identifier()?;

        // Parameter list: action open(target)
        let mut params = Vec::new();
        if self.check(TokenType::LParen) {
            self.advance();
            while !self.check(TokenType::RParen) && !self.is_at_end() {
                params.push(self.expect_identifier()?);
                if self.check(TokenType::Comma) {
                    self.advance();
                }
            }
            self.expect(TokenType::RParen)?;
        }

        let mut clauses = Vec::new();
        let mut flags = Vec::new();

        if self.check(TokenType::LBrace) {
            self.advance();
            while !self.check(TokenType::RBrace) && !self.is_at_end() {
                // `@`-prefixed directive: `@` lexes as a Trait token whose value
                // is `@<name>`. The name is the clause kind / flag.
                if self.check(TokenType::Trait) {
                    let dir_name = self.advance().value.trim_start_matches('@').to_string();
                    if self.check(TokenType::LBrace) {
                        // Predicate/effect block — capture raw body.
                        let body = self.consume_braced_body_raw()?;
                        clauses.push(ActionClause {
                            kind: dir_name,
                            body,
                        });
                    } else {
                        // Scalar value (@cooldown 1s) to end-of-line, or bare flag.
                        let mut raw = String::new();
                        while !self.is_at_end() {
                            let t = self.peek();
                            if matches!(
                                t.token_type,
                                TokenType::Trait | TokenType::LBrace | TokenType::RBrace
                            ) {
                                break;
                            }
                            // Stop at a known keyword (start of next clause).
                            if !matches!(
                                t.token_type,
                                TokenType::Identifier | TokenType::Number | TokenType::String
                            ) {
                                break;
                            }
                            raw.push_str(&self.advance().value);
                        }
                        if raw.trim().is_empty() {
                            flags.push(dir_name);
                        } else {
                            clauses.push(ActionClause {
                                kind: dir_name,
                                body: raw.trim().to_string(),
                            });
                        }
                    }
                    continue;
                }

                // `effect { .. }` keyword-style clause: identifier followed by `{`.
                if self.check(TokenType::Identifier) && self.peek_next_is(TokenType::LBrace) {
                    let clause_name = self.advance().value.clone();
                    let body = self.consume_braced_body_raw()?;
                    clauses.push(ActionClause {
                        kind: clause_name,
                        body,
                    });
                    continue;
                }

                // Otherwise: skip a token. A nested brace block — an
                // object-literal call argument (`emit("x", { … })`) or a
                // `return { … }` body — MUST be consumed as a BALANCED unit so
                // its inner `}` does not prematurely terminate this action's
                // `}`-delimited loop (advancing token-by-token would exit at the
                // first inner `}` and leave the rest of the body unparsed).
                // Plain properties are not retained on the WASM action node — the
                // TS node keeps them, but the Rust parity surface mirrors only
                // clauses + flags.
                if self.check(TokenType::LBrace) {
                    self.consume_braced_body_raw()?;
                } else {
                    self.advance();
                }
            }
            self.expect(TokenType::RBrace)?;
        }

        Ok(AstNode::ActionDecl(ActionDeclNode {
            name,
            params,
            clauses,
            flags,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a generalized reaction / event block:
    ///   on_grab { drop() }
    ///   on_cast(target) { ... }
    fn parse_game_event_block(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        let name = self.advance().value.clone(); // consume on_* token

        // Optional parameter list: on_cast(target)
        let mut params = Vec::new();
        if self.check(TokenType::LParen) {
            self.advance();
            while !self.check(TokenType::RParen) && !self.is_at_end() {
                params.push(self.expect_identifier()?);
                if self.check(TokenType::Comma) {
                    self.advance();
                }
            }
            self.expect(TokenType::RParen)?;
        }

        let body = if self.check(TokenType::LBrace) {
            self.consume_braced_body_raw()?
        } else {
            String::new()
        };

        Ok(AstNode::GameEventBlock(GameEventBlockNode {
            name: name.clone(),
            params,
            body,
            category: Some(reaction_category(&name).to_string()),
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Peek-by-value: true when the current token's lexeme equals `v`.
    fn check_value(&self, v: &str) -> bool {
        !self.is_at_end() && self.peek().value == v
    }

    /// Parse a `[x, y, z]` literal, tolerating missing components as 0.
    fn parse_vec3(&mut self) -> Result<[f64; 3], ParseError> {
        let mut out: Vec<f64> = Vec::new();
        self.expect(TokenType::LBracket)?;
        while !self.check(TokenType::RBracket) && !self.is_at_end() {
            if self.check(TokenType::Number) {
                out.push(self.advance().value.parse().unwrap_or(0.0));
            } else if self.check(TokenType::Minus) {
                // Negative numeric literal: -<n>
                self.advance();
                if self.check(TokenType::Number) {
                    out.push(-self.advance().value.parse::<f64>().unwrap_or(0.0));
                }
            } else {
                self.advance();
            }
            if self.check(TokenType::Comma) {
                self.advance();
            }
        }
        self.expect(TokenType::RBracket)?;
        Ok([
            out.first().copied().unwrap_or(0.0),
            out.get(1).copied().unwrap_or(0.0),
            out.get(2).copied().unwrap_or(0.0),
        ])
    }

    /// Consume a `{ ... }` block (the `{` is current) and return its raw inner
    /// text — token lexemes joined by spaces, respecting nested braces.
    fn consume_braced_body_raw(&mut self) -> Result<String, ParseError> {
        self.expect(TokenType::LBrace)?;
        let mut body = String::new();
        let mut depth = 1;
        while depth > 0 && !self.is_at_end() {
            let t = self.peek().clone();
            if t.token_type == TokenType::LBrace {
                depth += 1;
            } else if t.token_type == TokenType::RBrace {
                depth -= 1;
                if depth == 0 {
                    self.advance();
                    break;
                }
            }
            if !body.is_empty() {
                body.push(' ');
            }
            body.push_str(&t.value);
            self.advance();
        }
        if depth > 0 {
            return Err(self.error("Unclosed brace: missing '}'"));
        }
        Ok(body.trim().to_string())
    }

    fn parse_object_body(&mut self) -> Result<ObjectBody, ParseError> {
        let mut traits = Vec::new();
        let mut properties = Vec::new();
        let mut children = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            if self.check(TokenType::Trait) {
                traits.push(self.parse_trait()?);
            } else if self.check(TokenType::Move) {
                children.push(self.parse_move_statement()?);
            } else if self.check(TokenType::Action) {
                children.push(self.parse_action_decl()?);
            } else if self.check(TokenType::OnEvent) {
                children.push(self.parse_game_event_block()?);
            } else if self.is_child_object() {
                children.push(self.parse_top_level()?);
            } else if self.is_module_start() {
                // `.hsplus` native-surface form: a named `module <Name> { … }`
                // block nested inside a `composition`. `module` lexes as an
                // Identifier (not a keyword), so it is matched by value with a
                // brace look-ahead — additive, never shadowing a `module:`
                // property (which has a Colon, not a name + `{`).
                children.push(self.parse_module()?);
            } else if self.check(TokenType::Identifier) {
                let name = self.peek().value.clone();
                // Check if it's an event handler (onXxx:)
                if name.starts_with("on") && self.peek_next_is(TokenType::Colon) {
                    children.push(self.parse_event_handler()?);
                } else if self.is_object_type(&name) {
                    children.push(self.parse_generic_object(&name)?);
                } else {
                    properties.push(self.parse_property()?);
                }
            } else {
                return Err(self.error("Expected trait, property, or nested object"));
            }
        }

        Ok((traits, properties, children))
    }

    fn parse_properties_only(&mut self) -> Result<Vec<PropertyNode>, ParseError> {
        let mut properties = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            properties.push(self.parse_property()?);
        }

        Ok(properties)
    }

    fn is_child_object(&self) -> bool {
        matches!(
            self.peek().token_type,
            TokenType::Orb
                | TokenType::Entity
                | TokenType::Object
                | TokenType::Group
                | TokenType::Timeline
                | TokenType::Template
                | TokenType::Environment
                | TokenType::Logic
                | TokenType::Npc
                | TokenType::Quest
                | TokenType::Dialogue
                | TokenType::Using
        )
    }

    fn parse_trait(&mut self) -> Result<TraitNode, ParseError> {
        let start_loc = self.current_location();
        let token = self.advance(); // consume trait token

        let mut name = token.value.trim_start_matches('@').to_string();

        // `@trait NAME { ... }` DEFINITION form: the `@trait` keyword is followed
        // by a separate identifier naming the trait. (Decorator applications like
        // `@grabbable { ... }` carry their name in the `@`-token itself.) Consuming
        // the NAME here is what lets the header parse; the definition BODY is then
        // parsed by `parse_trait_definition_body` — which understands `@on_*`
        // handlers, nested `@receipt`/`@synced` annotations, and `field: Type =
        // default` — whereas a plain application body stays on the property-only
        // `parse_object_literal_body`. Gating the richer body on the definition
        // form keeps the (shared) application/decorator path byte-identical.
        let is_definition = name == "trait";
        if is_definition && self.check(TokenType::Identifier) {
            name = self.expect_identifier()?;
        }

        let mut members = Vec::new();
        let config = if self.check(TokenType::LBrace) {
            self.advance();
            let obj = if is_definition {
                self.parse_trait_definition_body(&mut members)?
            } else {
                self.parse_object_literal_body()?
            };
            self.expect(TokenType::RBrace)?;
            Some(Box::new(obj))
        } else {
            None
        };

        Ok(TraitNode {
            name,
            label: None,
            config,
            members,
            loc: Some(self.location_from(start_loc)),
        })
    }

    /// Parse the body of a trait DEFINITION (`@trait NAME { ... }`). Unlike a
    /// trait application's config (plain `key: value` only), a definition body
    /// mixes several member kinds:
    ///   - `key: value` / `key: Type = default` properties -> the returned
    ///     `ObjectLiteral` (so existing `TraitNode.config` consumers keep working)
    ///   - `@on_*[(params)] [=>] { ... }` event handlers    -> `members`
    ///   - `@receipt NAME { ... }` / `@synced { ... }` annotations -> `members`
    ///   - bare keyword reaction blocks `on_grab { ... }`   -> `members`
    ///
    /// The opening `{` has already been consumed; this stops at the matching `}`,
    /// which the caller consumes.
    fn parse_trait_definition_body(
        &mut self,
        members: &mut Vec<AstNode>,
    ) -> Result<AstNode, ParseError> {
        let mut properties = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            if self.check(TokenType::Trait) {
                // `@word ...` — an `@on_*` handler or a nested annotation.
                let word = self.peek().value.trim_start_matches('@').to_string();
                if word.starts_with("on_") {
                    members.push(self.parse_trait_arrow_handler()?);
                } else {
                    members.push(self.parse_trait_annotation()?);
                }
            } else if self.check(TokenType::OnEvent) {
                // Bare keyword reaction block `on_grab { ... }` (no `@`).
                members.push(self.parse_game_event_block()?);
            } else {
                properties.push(self.parse_trait_property()?);
            }
        }

        Ok(AstNode::ObjectLiteral(ObjectLiteralNode {
            properties,
            loc: None,
        }))
    }

    /// Parse an `@on_*` event handler inside a trait definition body:
    ///   `@on_spawn { ... }` | `@on_grab(event) { ... }` | `@on_x(a, b) => { ... }`
    /// The `=>` arrow is accepted but OPTIONAL: the canonical native form omits it,
    /// the current corpus includes it. The body is captured raw (matching the
    /// existing `.hs` `on_*` blocks) so it tolerates any in-body statement form.
    fn parse_trait_arrow_handler(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        let token = self.advance(); // consume `@on_*`
        let name = token.value.trim_start_matches('@').to_string();

        let mut params = Vec::new();
        if self.check(TokenType::LParen) {
            self.advance();
            while !self.check(TokenType::RParen) && !self.is_at_end() {
                // Accept identifiers OR keyword-lexed names (`world`, `action`,
                // `entity`, `composition`, `context`, …) as handler param names.
                params.push(self.advance().value.clone());
                if self.check(TokenType::Comma) {
                    self.advance();
                }
            }
            self.expect(TokenType::RParen)?;
        }

        // Optional `=>` between the (params) and the body block.
        if self.check(TokenType::Arrow) {
            self.advance();
        }

        let body = if self.check(TokenType::LBrace) {
            self.consume_braced_body_raw()?
        } else {
            String::new()
        };

        Ok(AstNode::GameEventBlock(GameEventBlockNode {
            name: name.clone(),
            params,
            body,
            category: Some(reaction_category(&name).to_string()),
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a nested annotation inside a trait definition body:
    ///   `@receipt NAME { ... }` (named) | `@synced { ... }` / `@physics { ... }`
    /// Represented as a `TraitNode` whose `label` carries the optional instance
    /// NAME and whose `config` is the `{ key: value }` body.
    fn parse_trait_annotation(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        let token = self.advance(); // consume `@word`
        let name = token.value.trim_start_matches('@').to_string();

        let label = if self.check(TokenType::Identifier) || self.check(TokenType::String) {
            Some(self.advance().value.clone())
        } else {
            None
        };

        let config = if self.check(TokenType::LBrace) {
            self.advance();
            let obj = self.parse_object_literal_body()?;
            self.expect(TokenType::RBrace)?;
            Some(Box::new(obj))
        } else {
            None
        };

        Ok(AstNode::Trait(TraitNode {
            name,
            label,
            config,
            members: Vec::new(),
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Parse a trait definition property, tolerating a typed field default:
    ///   `maxHealth: 100` | `capability_tags: [ ... ]` | `auto_register: Bool = true`
    fn parse_trait_property(&mut self) -> Result<PropertyNode, ParseError> {
        let key = self.expect_property_key()?;
        self.expect(TokenType::Colon)?;
        // `mode: enum("a" | "b")` — enum type annotations aren't expressions.
        let value = if self.check(TokenType::Enum) {
            self.parse_enum_type()?
        } else {
            self.parse_expression()?
        };

        // Optional-type marker: `llm_provider_id: String?`.
        if self.check(TokenType::Question) {
            self.advance();
        }

        // Optional typed-field default: `name: Type = default`.
        if self.check(TokenType::Equals) {
            self.advance();
            let _default = self.parse_expression()?;
        }

        if !self.check(TokenType::RBrace)
            && (self.check(TokenType::Comma) || self.check(TokenType::Semicolon))
        {
            self.advance();
        }

        Ok(PropertyNode {
            key,
            value: Box::new(value),
            loc: None,
        })
    }

    /// Parse an enum type annotation used as a field value:
    ///   `mode: enum("t0" | "t1" | "t2")`
    /// The variant list mixes string literals and `|` separators (lexed as
    /// `Invalid`), so it is captured raw into an `Identifier` node — the full
    /// `enum(...)` text is preserved rather than dropped.
    fn parse_enum_type(&mut self) -> Result<AstNode, ParseError> {
        let mut text = self.advance().value.clone(); // "enum"
        if self.check(TokenType::LParen) {
            self.advance();
            text.push('(');
            let mut depth = 1;
            while depth > 0 && !self.is_at_end() {
                let t = self.peek().clone();
                if t.token_type == TokenType::LParen {
                    depth += 1;
                } else if t.token_type == TokenType::RParen {
                    depth -= 1;
                    if depth == 0 {
                        self.advance();
                        text.push(')');
                        break;
                    }
                }
                text.push_str(&t.value);
                self.advance();
            }
        }
        Ok(AstNode::Identifier(IdentifierNode {
            name: text,
            loc: None,
        }))
    }

    fn parse_property(&mut self) -> Result<PropertyNode, ParseError> {
        let start_loc = self.current_location();
        let key = self.expect_identifier()?;
        self.expect(TokenType::Colon)?;
        let value = self.parse_value()?;

        Ok(PropertyNode {
            key,
            value: Box::new(value),
            loc: Some(self.location_from(start_loc)),
        })
    }

    fn parse_event_handler(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        let event = self.expect_identifier()?;
        self.expect(TokenType::Colon)?;
        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::EventHandler(EventHandlerNode {
            event,
            body,
            loc: Some(self.location_from(start_loc)),
        }))
    }

    fn parse_value(&mut self) -> Result<AstNode, ParseError> {
        self.parse_expression()
    }

    fn parse_expression(&mut self) -> Result<AstNode, ParseError> {
        if self.is_lambda_start() {
            return self.parse_lambda_expression();
        }
        self.parse_null_coalescing()
    }

    fn is_lambda_start(&self) -> bool {
        if self.check_offset(0, TokenType::Identifier) && self.check_offset(1, TokenType::Arrow) {
            return true;
        }

        if !self.check_offset(0, TokenType::LParen) {
            return false;
        }

        let mut i = 1;
        if !self.check_offset(i, TokenType::Identifier) {
            return false;
        }
        i += 1;

        self.check_offset(i, TokenType::RParen) && self.check_offset(i + 1, TokenType::Arrow)
    }

    fn parse_lambda_expression(&mut self) -> Result<AstNode, ParseError> {
        let start_loc = self.current_location();
        let mut params = Vec::new();

        if self.check(TokenType::Identifier) && self.peek_next_is(TokenType::Arrow) {
            params.push(self.expect_identifier()?);
        } else {
            self.expect(TokenType::LParen)?;
            params.push(self.expect_identifier()?);
            self.expect(TokenType::RParen)?;
        }

        self.expect(TokenType::Arrow)?;
        let body = self.parse_expression()?;

        Ok(AstNode::LambdaExpression(LambdaExpression {
            params,
            body: Box::new(body),
            loc: Some(self.location_from(start_loc)),
        }))
    }

    /// Null-coalescing `a ?? b` (lexes as two consecutive `?` tokens). Binds just
    /// below the logical operators. The single-`?` forms (optional-type marker,
    /// ternary) are handled by callers, so only the doubled `??` is consumed here.
    fn parse_null_coalescing(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_or_expression()?;
        while self.check(TokenType::Question) && self.peek_next_is(TokenType::Question) {
            self.advance();
            self.advance();
            let right = self.parse_or_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: "??".to_string(),
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }
        Ok(left)
    }

    fn parse_or_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_and_expression()?;

        while self.check(TokenType::Or) {
            let op = self.advance().value.clone();
            let right = self.parse_and_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    fn parse_and_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_equality_expression()?;

        while self.check(TokenType::And) {
            let op = self.advance().value.clone();
            let right = self.parse_equality_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    fn parse_equality_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_comparison_expression()?;

        while self.check(TokenType::Eq) || self.check(TokenType::Ne) {
            let op = self.advance().value.clone();
            let right = self.parse_comparison_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    fn parse_comparison_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_range_expression()?;

        while self.check(TokenType::Lt)
            || self.check(TokenType::Gt)
            || self.check(TokenType::Le)
            || self.check(TokenType::Ge)
        {
            let op = self.advance().value.clone();
            let right = self.parse_range_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    /// Parse a range expression `a..b` (used by `for (i in 0..n)`). Binds looser than additive so
    /// `0..n + 1` reads as `0..(n + 1)`, matching Kotlin's `..` precedence. Non-associative in
    /// practice (`a..b..c` is meaningless), but parsed left-associatively for simplicity. Emitted
    /// as a `..` binary expression so the Kotlin backend renders it verbatim.
    fn parse_range_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_additive_expression()?;

        while self.check(TokenType::Range) {
            let op = self.advance().value.clone();
            let right = self.parse_additive_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    fn parse_additive_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_multiplicative_expression()?;

        while self.check(TokenType::Plus) || self.check(TokenType::Minus) {
            let op = self.advance().value.clone();
            let right = self.parse_multiplicative_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    fn parse_multiplicative_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut left = self.parse_unary_expression()?;

        while self.check(TokenType::Star)
            || self.check(TokenType::Slash)
            || self.check(TokenType::Percent)
        {
            let op = self.advance().value.clone();
            let right = self.parse_unary_expression()?;
            left = AstNode::BinaryExpression(BinaryExpression {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                loc: None,
            });
        }

        Ok(left)
    }

    fn parse_unary_expression(&mut self) -> Result<AstNode, ParseError> {
        if self.check(TokenType::Ampersand) {
            self.advance();
            let operator = if self.check_value("mut") {
                self.advance();
                "&mut"
            } else {
                "&"
            };
            let argument = self.parse_unary_expression()?;
            return Ok(AstNode::UnaryExpression(UnaryExpression {
                operator: operator.to_string(),
                argument: Box::new(argument),
                prefix: true,
                loc: None,
            }));
        }

        if self.check(TokenType::Bang)
            || self.check(TokenType::Minus)
            || self.check(TokenType::Star)
        {
            let op = self.advance().value.clone();
            let argument = self.parse_unary_expression()?;
            return Ok(AstNode::UnaryExpression(UnaryExpression {
                operator: op,
                argument: Box::new(argument),
                prefix: true,
                loc: None,
            }));
        }

        self.parse_call_expression()
    }

    fn parse_call_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut expr = self.parse_member_expression()?;

        while self.check(TokenType::LParen) {
            self.advance();
            let mut arguments = Vec::new();

            while !self.check(TokenType::RParen) && !self.is_at_end() {
                arguments.push(self.parse_expression()?);
                if !self.check(TokenType::RParen) {
                    self.expect(TokenType::Comma)?;
                }
            }

            self.expect(TokenType::RParen)?;

            expr = AstNode::CallExpression(CallExpression {
                callee: Box::new(expr),
                arguments,
                loc: None,
            });
        }

        Ok(expr)
    }

    fn parse_member_expression(&mut self) -> Result<AstNode, ParseError> {
        let mut expr = self.parse_primary()?;

        loop {
            if self.check(TokenType::Dot) {
                self.advance();
                let property = self.expect_identifier()?;
                expr = AstNode::MemberExpression(MemberExpression {
                    object: Box::new(expr),
                    property: Box::new(AstNode::Identifier(IdentifierNode {
                        name: property,
                        loc: None,
                    })),
                    computed: false,
                    loc: None,
                });
            } else if self.check(TokenType::LBracket) {
                self.advance();
                let property = self.parse_expression()?;
                self.expect(TokenType::RBracket)?;
                expr = AstNode::MemberExpression(MemberExpression {
                    object: Box::new(expr),
                    property: Box::new(property),
                    computed: true,
                    loc: None,
                });
            } else {
                break;
            }
        }

        Ok(expr)
    }

    fn parse_primary(&mut self) -> Result<AstNode, ParseError> {
        let token = self.peek().clone();

        match token.token_type {
            TokenType::String => {
                self.advance();
                Ok(AstNode::String(StringLiteral {
                    value: token.value,
                    loc: None,
                }))
            }
            TokenType::Number => {
                self.advance();
                let value: f64 = token.value.parse().unwrap_or(0.0);
                Ok(AstNode::Number(NumberLiteral {
                    value,
                    raw: token.value,
                    loc: None,
                }))
            }
            TokenType::Boolean => {
                self.advance();
                Ok(AstNode::Boolean(BooleanLiteral {
                    value: token.value == "true",
                    loc: None,
                }))
            }
            TokenType::Null => {
                self.advance();
                Ok(AstNode::Null(NullLiteral { loc: None }))
            }
            TokenType::Identifier | TokenType::Move => {
                self.advance();
                Ok(AstNode::Identifier(IdentifierNode {
                    name: token.value,
                    loc: None,
                }))
            }
            TokenType::LBracket => self.parse_array(),
            TokenType::LBrace => self.parse_object_literal(),
            TokenType::LParen => {
                self.advance();
                let expr = self.parse_expression()?;
                self.expect(TokenType::RParen)?;
                Ok(expr)
            }
            TokenType::Spread => {
                self.advance();
                let argument = self.parse_expression()?;
                Ok(AstNode::SpreadElement(SpreadElement {
                    argument: Box::new(argument),
                    loc: None,
                }))
            }
            _ => Err(self.error(&format!("Unexpected token: {:?}", token.token_type))),
        }
    }

    fn parse_array(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume '['

        let mut elements = Vec::new();
        while !self.check(TokenType::RBracket) && !self.is_at_end() {
            if self.check(TokenType::Spread) {
                self.advance();
                let argument = self.parse_expression()?;
                elements.push(AstNode::SpreadElement(SpreadElement {
                    argument: Box::new(argument),
                    loc: None,
                }));
            } else {
                elements.push(self.parse_expression()?);
            }

            if !self.check(TokenType::RBracket) {
                self.expect(TokenType::Comma)?;
            }
        }

        self.expect(TokenType::RBracket)?;

        Ok(AstNode::Array(ArrayNode {
            elements,
            loc: None,
        }))
    }

    fn parse_object_literal(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume '{'
        let node = self.parse_object_literal_body()?;
        self.expect(TokenType::RBrace)?;
        Ok(node)
    }

    fn parse_object_literal_body(&mut self) -> Result<AstNode, ParseError> {
        let mut properties = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            let key = self.expect_property_key()?;
            self.expect(TokenType::Colon)?;
            let value = if self.check(TokenType::Enum) {
                self.parse_enum_type()?
            } else {
                self.parse_expression()?
            };
            // Optional-type marker + typed-field default: `x: Type? = default`.
            if self.check(TokenType::Question) {
                self.advance();
            }
            if self.check(TokenType::Equals) {
                self.advance();
                let _default = self.parse_expression()?;
            }

            properties.push(PropertyNode {
                key,
                value: Box::new(value),
                loc: None,
            });

            if !self.check(TokenType::RBrace) {
                // Comma / semicolon separators are optional (`type: "X"; ts: now()`).
                if self.check(TokenType::Comma) || self.check(TokenType::Semicolon) {
                    self.advance();
                }
            }
        }

        Ok(AstNode::ObjectLiteral(ObjectLiteralNode {
            properties,
            loc: None,
        }))
    }

    fn parse_statement(&mut self) -> Result<AstNode, ParseError> {
        if self.check_value("scope") && self.peek_next_is(TokenType::LBrace) {
            return self.parse_lexical_scope();
        }
        if self.check_value("slot") {
            return self.parse_stack_slot_declaration();
        }
        match self.peek().token_type {
            TokenType::If => self.parse_if_statement(),
            TokenType::For => self.parse_for_statement(),
            TokenType::While => self.parse_while_statement(),
            TokenType::Return => self.parse_return_statement(),
            TokenType::Const | TokenType::Let | TokenType::Var => self.parse_variable_declaration(),
            TokenType::Move => self.parse_move_statement(),
            TokenType::Action => self.parse_action_decl(),
            TokenType::OnEvent => self.parse_game_event_block(),
            _ => self.parse_expression_statement(),
        }
    }

    fn parse_lexical_scope(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume contextual `scope` keyword
        self.expect(TokenType::LBrace)?;
        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }
        self.expect(TokenType::RBrace)?;

        Ok(AstNode::LexicalScope(LexicalScopeNode { body, loc: None }))
    }

    fn parse_if_statement(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume 'if'
        self.expect(TokenType::LParen)?;
        let test = self.parse_expression()?;
        self.expect(TokenType::RParen)?;
        self.expect(TokenType::LBrace)?;

        let mut consequent = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            consequent.push(self.parse_statement()?);
        }
        self.expect(TokenType::RBrace)?;

        let alternate = if self.check(TokenType::Else) {
            self.advance();
            self.expect(TokenType::LBrace)?;
            let mut alt = Vec::new();
            while !self.check(TokenType::RBrace) && !self.is_at_end() {
                alt.push(self.parse_statement()?);
            }
            self.expect(TokenType::RBrace)?;
            Some(alt)
        } else {
            None
        };

        Ok(AstNode::If(IfNode {
            test: Box::new(test),
            consequent,
            alternate,
            loc: None,
        }))
    }

    /// Parse a for-of / for-in loop: `for (<var> in <iterable>) { … }`.
    ///
    /// The `<iterable>` is any expression — typically a range (`0..n`, parsed as a `..` binary
    /// expression) or an array/identifier. This idiomatic bounded-iteration form replaces the old
    /// toy C-style `for (init : test : update)`: it maps 1:1 onto Kotlin's `for (x in y)`, needs no
    /// mutable-counter ceremony, and keeps a pure loop pure (the loop variable is a fresh binding,
    /// per the functional-core doctrine in MEMORY W.815).
    fn parse_for_statement(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume 'for'
        self.expect(TokenType::LParen)?;

        let var_name = self.expect_identifier()?;
        self.expect(TokenType::In)?;
        let range = self.parse_expression()?;

        self.expect(TokenType::RParen)?;
        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }
        self.expect(TokenType::RBrace)?;

        Ok(AstNode::ForOf(ForOfNode {
            var_name,
            range: Box::new(range),
            body,
            loc: None,
        }))
    }

    fn parse_while_statement(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume 'while'
        self.expect(TokenType::LParen)?;
        let test = self.parse_expression()?;
        self.expect(TokenType::RParen)?;
        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }
        self.expect(TokenType::RBrace)?;

        Ok(AstNode::While(WhileNode {
            test: Box::new(test),
            body,
            loc: None,
        }))
    }

    fn parse_return_statement(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume 'return'

        let argument = if !self.check(TokenType::RBrace) && !self.is_at_end() {
            Some(Box::new(self.parse_expression()?))
        } else {
            None
        };

        Ok(AstNode::Return(ReturnNode {
            argument,
            loc: None,
        }))
    }

    fn parse_variable_declaration(&mut self) -> Result<AstNode, ParseError> {
        // `var` opts into LOCAL mutable state (functional-core: the mutation never escapes the
        // function — see MEMORY W.815); `let`/`const` are single-assignment (immutable `val`).
        let mutable = self.check(TokenType::Var);
        self.advance(); // consume const/let/var
        let name = self.expect_identifier()?;
        let type_annotation = if self.check(TokenType::Colon) {
            self.advance();
            Some(self.parse_type_annotation()?)
        } else {
            None
        };
        self.expect(TokenType::Equals)?;
        let value = if type_annotation
            .as_deref()
            .is_some_and(|annotation| annotation.starts_with('&'))
        {
            // A v3 reference initializer is deliberately a single borrow expression. Stopping
            // at the unary expression keeps a following `*reference = ...` statement from being
            // consumed as legacy multiplication in this newline-insensitive grammar.
            self.parse_unary_expression()?
        } else {
            self.parse_expression()?
        };

        Ok(AstNode::VariableDeclaration(VariableDeclarationNode {
            name,
            type_annotation,
            value: Box::new(value),
            mutable,
            loc: None,
        }))
    }

    fn parse_stack_slot_declaration(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume contextual `slot` keyword
        let name = self.expect_identifier()?;
        self.expect(TokenType::Colon)?;
        let type_annotation = self.parse_type_annotation()?;
        self.expect(TokenType::Equals)?;
        let value = self.parse_expression()?;

        Ok(AstNode::StackSlotDeclaration(StackSlotDeclarationNode {
            name,
            type_annotation,
            value: Box::new(value),
            loc: None,
        }))
    }

    /// Parse an expression statement, OR — when the expression is an l-value (identifier, member,
    /// or index) immediately followed by `=` / `+=` / `-=` / `*=` / `/=` / `%=` — an assignment
    /// statement (`x = expr`, `acc += 1`). Assignment to a previously-declared `var` is how the
    /// `.hs` logic subset expresses LOCAL mutable state (e.g. an accumulator inside a pure loop).
    fn parse_expression_statement(&mut self) -> Result<AstNode, ParseError> {
        let expr = self.parse_expression()?;
        let op = match self.peek().token_type {
            TokenType::Equals => Some("="),
            TokenType::PlusEquals => Some("+="),
            TokenType::MinusEquals => Some("-="),
            TokenType::StarEquals => Some("*="),
            TokenType::SlashEquals => Some("/="),
            TokenType::PercentEquals => Some("%="),
            _ => None,
        };
        if let Some(op) = op {
            self.advance(); // consume the assignment operator
            let value = self.parse_expression()?;
            return Ok(AstNode::Assignment(AssignmentNode {
                operator: op.to_string(),
                target: Box::new(expr),
                value: Box::new(value),
                loc: None,
            }));
        }
        Ok(expr)
    }

    // Helper methods

    fn peek(&self) -> &Token {
        &self.tokens[self.current]
    }

    fn peek_next_is(&self, token_type: TokenType) -> bool {
        if self.current + 1 >= self.tokens.len() {
            false
        } else {
            self.tokens[self.current + 1].token_type == token_type
        }
    }

    /// Look ahead `offset` tokens past the cursor without consuming. Returns
    /// `None` past the end of the token stream.
    fn peek_at(&self, offset: usize) -> Option<&Token> {
        self.tokens.get(self.current + offset)
    }

    fn advance(&mut self) -> &Token {
        if !self.is_at_end() {
            self.current += 1;
        }
        &self.tokens[self.current - 1]
    }

    fn check(&self, token_type: TokenType) -> bool {
        !self.is_at_end() && self.peek().token_type == token_type
    }

    fn check_offset(&self, offset: usize, token_type: TokenType) -> bool {
        self.peek_at(offset)
            .is_some_and(|token| token.token_type == token_type)
    }

    fn is_at_end(&self) -> bool {
        self.peek().token_type == TokenType::Eof
    }

    fn expect(&mut self, token_type: TokenType) -> Result<&Token, ParseError> {
        if self.check(token_type.clone()) {
            Ok(self.advance())
        } else {
            Err(self.error(&format!(
                "Expected {:?}, got {:?}",
                token_type,
                self.peek().token_type
            )))
        }
    }

    fn expect_identifier(&mut self) -> Result<String, ParseError> {
        if self.check(TokenType::Identifier) {
            Ok(self.advance().value.clone())
        } else {
            Err(self.error("Expected identifier"))
        }
    }

    fn parse_type_annotation(&mut self) -> Result<String, ParseError> {
        if !self.check(TokenType::Ampersand) {
            return self.parse_value_type_annotation();
        }

        self.advance();
        let lifetime = if self.check(TokenType::Lifetime) {
            Some(self.advance().value.clone())
        } else {
            None
        };
        let mutable = self.check_value("mut");
        if mutable {
            self.advance();
        }
        let pointee = if self.check(TokenType::LBracket) {
            self.advance();
            let element = self.expect_identifier()?;
            self.expect(TokenType::RBracket)?;
            format!("[{element}]")
        } else {
            self.expect_identifier()?
        };
        Ok(match (lifetime, mutable) {
            (Some(lifetime), true) => format!("&'{lifetime} mut {pointee}"),
            (Some(lifetime), false) => format!("&'{lifetime} {pointee}"),
            (None, true) => format!("&mut {pointee}"),
            (None, false) => format!("&{pointee}"),
        })
    }

    fn parse_value_type_annotation(&mut self) -> Result<String, ParseError> {
        if !self.check(TokenType::LBracket) {
            return self.expect_identifier();
        }

        self.advance();
        let element = self.expect_identifier()?;
        if self.check(TokenType::RBracket) {
            self.advance();
            return Ok(format!("[{element}]"));
        }
        self.expect(TokenType::Semicolon)?;
        let length = self.expect(TokenType::Number)?.value.clone();
        self.expect(TokenType::RBracket)?;
        Ok(format!("[{element}; {length}]"))
    }

    fn expect_string(&mut self) -> Result<String, ParseError> {
        if self.check(TokenType::String) {
            Ok(self.advance().value.clone())
        } else {
            Err(self.error("Expected string"))
        }
    }

    fn expect_string_or_identifier(&mut self) -> Result<String, ParseError> {
        if self.check(TokenType::String) || self.check(TokenType::Identifier) {
            Ok(self.advance().value.clone())
        } else {
            Err(self.error("Expected string or identifier"))
        }
    }

    /// A property key inside a `{ key: value }` config / receipt body. Accepts
    /// plain identifiers and strings, but ALSO keyword-lexed words used
    /// contextually as keys (`action:`, `from:`, `to:`, `extends:`, `using:`) —
    /// these lex as keyword tokens yet are valid property names in this position.
    fn expect_property_key(&mut self) -> Result<String, ParseError> {
        let is_word = self
            .peek()
            .value
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_');
        if self.check(TokenType::String) || self.check(TokenType::Identifier) || is_word {
            Ok(self.advance().value.clone())
        } else {
            Err(self.error("Expected property key"))
        }
    }

    fn error(&self, message: &str) -> ParseError {
        let token = self.peek();
        ParseError::new(message, token.line, token.column)
    }

    fn synchronize(&mut self) {
        self.advance();

        while !self.is_at_end() {
            match self.peek().token_type {
                TokenType::Composition
                | TokenType::World
                | TokenType::Orb
                | TokenType::Entity
                | TokenType::Object
                | TokenType::Template
                | TokenType::Import
                | TokenType::Export
                | TokenType::Function
                | TokenType::Enum
                | TokenType::Move
                | TokenType::Action
                | TokenType::OnEvent => return,
                _ => {
                    self.advance();
                }
            }
        }
    }

    fn current_location(&self) -> Position {
        let token = self.peek();
        Position {
            line: token.line,
            column: token.column,
            offset: token.start,
        }
    }

    fn location_from(&self, start: Position) -> Location {
        let end_token = if self.current > 0 {
            &self.tokens[self.current - 1]
        } else {
            self.peek()
        };

        Location {
            start,
            end: Position {
                line: end_token.line,
                column: end_token.column,
                offset: end_token.end,
            },
        }
    }
}

/// Map a reaction trigger keyword to its routing bucket. Mirrors the TS
/// `reactionCategory`, extended with the movement bucket for the locomotion
/// triggers (on_move / on_walk / on_run / on_jump / on_land / on_strafe /
/// on_teleport).
pub fn reaction_category(trigger: &str) -> &'static str {
    match trigger {
        "on_interact" | "on_grab" | "on_release" | "on_use" | "on_hover" => "interaction",
        "on_collision" | "on_proximity" => "collision",
        "on_spawn" | "on_death" | "on_enter" | "on_exit" | "on_tick" => "lifecycle",
        "on_combat" | "on_cast" => "combat",
        "on_signal" | "on_input" => "signal",
        "on_move" | "on_walk" | "on_run" | "on_jump" | "on_land" | "on_strafe" | "on_teleport" => {
            "movement"
        }
        _ => "custom",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Trait-definition body grammar (handlers / @receipt / field-defaults) ---

    #[test]
    fn test_trait_definition_captures_handlers_and_receipt() {
        // The corpus `=>` handler form + @receipt + a typed field default must
        // parse AND be captured in the AST — not silently dropped (the G3 guard).
        let source = r#"@trait Health {
            maxHP: 100
            auto: Bool = true
            @on_spawn(e) => { hp = maxHP }
            @receipt cfg { type: "HealthReceipt" }
        }"#;
        let mut parser = Parser::new(source);
        let ast = parser.parse().expect("trait definition body should parse");
        let t = ast
            .body
            .iter()
            .find_map(|n| match n {
                AstNode::Trait(t) if t.name == "Health" => Some(t),
                _ => None,
            })
            .expect("Health trait present");

        // config stays a property-only ObjectLiteral so existing consumers (e.g.
        // FrameDeclarationNode::try_from_directive) are unaffected.
        assert!(matches!(
            t.config.as_deref(),
            Some(AstNode::ObjectLiteral(_))
        ));

        // handler captured with its param and a non-empty body (no silent drop).
        let h = t
            .members
            .iter()
            .find_map(|m| match m {
                AstNode::GameEventBlock(g) if g.name == "on_spawn" => Some(g),
                _ => None,
            })
            .expect("on_spawn handler captured in members");
        assert_eq!(h.params, vec!["e".to_string()]);
        assert!(!h.body.is_empty(), "handler body must not be empty");

        // receipt captured with its instance label.
        let r = t
            .members
            .iter()
            .find_map(|m| match m {
                AstNode::Trait(tr) if tr.name == "receipt" => Some(tr),
                _ => None,
            })
            .expect("receipt captured in members");
        assert_eq!(r.label.as_deref(), Some("cfg"));
    }

    #[test]
    fn test_trait_handler_arrow_is_optional() {
        // Native canonical form (no `=>`) and current corpus form (`=>`) both parse.
        for src in [
            "@trait T { @on_spawn { hp = 1 } }",
            "@trait T { @on_spawn => { hp = 1 } }",
        ] {
            let mut parser = Parser::new(src);
            assert!(parser.parse().is_ok(), "should parse: {}", src);
        }
    }

    #[test]
    fn test_trait_application_body_unchanged() {
        // Regression guard: a decorator application (name != "trait") must NOT run
        // the definition body loop — members stays empty, config property-only.
        let source = r#"@grabbable { color: "red" }"#;
        let mut parser = Parser::new(source);
        let ast = parser.parse().expect("decorator application should parse");
        let t = ast
            .body
            .iter()
            .find_map(|n| match n {
                AstNode::Trait(t) => Some(t),
                _ => None,
            })
            .expect("trait node present");
        assert_eq!(t.name, "grabbable");
        assert!(t.members.is_empty(), "application must not collect members");
        assert!(matches!(
            t.config.as_deref(),
            Some(AstNode::ObjectLiteral(_))
        ));
    }

    #[test]
    fn test_trait_body_semicolon_optional_type_keyword_params() {
        // Next corpus layer: `;` separators in brace bodies, `Type?` optional-type
        // markers, and keyword-lexed handler params (world/action/entity/…).
        let source = r#"@trait wasm_api {
            llm_provider_id: String? = null
            @on_compile(ast, world) => { return compile(ast, world) }
            @receipt cfg { type: "WasmApiReceipt"; timestamp: now() }
        }"#;
        let mut parser = Parser::new(source);
        let ast = parser
            .parse()
            .expect("semicolon / optional-type / keyword-params should parse");
        let t = ast
            .body
            .iter()
            .find_map(|n| match n {
                AstNode::Trait(t) if t.name == "wasm_api" => Some(t),
                _ => None,
            })
            .expect("wasm_api trait present");
        // handler with a keyword-lexed param (`world`) captured with both params.
        let h = t
            .members
            .iter()
            .find_map(|m| match m {
                AstNode::GameEventBlock(g) if g.name == "on_compile" => Some(g),
                _ => None,
            })
            .expect("on_compile handler captured");
        assert_eq!(h.params, vec!["ast".to_string(), "world".to_string()]);
        // `;`-separated @receipt body captured.
        assert!(t
            .members
            .iter()
            .any(|m| matches!(m, AstNode::Trait(tr) if tr.name == "receipt")));
    }

    #[test]
    fn test_trait_body_enum_type() {
        let source = r#"@trait agent { mode: enum("t0" | "t1" | "t2") }"#;
        let mut parser = Parser::new(source);
        let ast = parser.parse().expect("enum type annotation should parse");
        let t = ast
            .body
            .iter()
            .find_map(|n| match n {
                AstNode::Trait(t) if t.name == "agent" => Some(t),
                _ => None,
            })
            .expect("agent trait present");
        let Some(AstNode::ObjectLiteral(o)) = t.config.as_deref() else {
            panic!("config should be ObjectLiteral");
        };
        let mode = o
            .properties
            .iter()
            .find(|p| p.key == "mode")
            .expect("mode property present");
        // enum members preserved (not dropped).
        assert!(
            matches!(mode.value.as_ref(), AstNode::Identifier(id) if id.name.contains("t1")),
            "enum variants must be preserved in the value"
        );
    }

    #[test]
    fn test_trait_body_keyword_property_keys() {
        // Keyword-lexed words (`action`, `from`, `using`) are valid property keys
        // in a config body — the cutover-gap fix for e.g. sdk_compiler.hsplus.
        let source = r#"@trait sdk { action: "compile_to_sdk"; from: "core"; using: "Box" }"#;
        let mut parser = Parser::new(source);
        assert!(
            parser.parse().is_ok(),
            "keyword-lexed property keys should parse"
        );
    }

    #[test]
    fn test_trait_body_null_coalescing_and_nested_defaults() {
        // `??` null-coalescing in a value + `= default` inside a nested annotation
        // body — the fleet brain-trait patterns (portable_mind, wallet_identity).
        let source = r#"@trait brain {
            home: host ?? "host-default"
            @synced { mode: String = "auto"; tags: List = ["a", "b"] }
        }"#;
        let mut parser = Parser::new(source);
        assert!(
            parser.parse().is_ok(),
            "?? and nested field-defaults should parse"
        );
    }

    #[test]
    fn test_parse_simple_orb() {
        let source = r#"orb test { color: "red" }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok());
    }

    // ── Nested composition/module/state `.hsplus` native surface (task ktvd) ──

    #[test]
    fn test_parse_nested_composition_module_state() {
        // Mirrors the 8 holoembed / absorb-service / framework `.hsplus`
        // surfaces: `composition "X" { module Y { state { … } action …(…) { … }
        // exports { … } } }`. The action bodies carry nested brace blocks
        // (`emit("x", { … })`, `return { … }`) that must be consumed as balanced
        // units, and an `exports` list of bare identifiers (incl. `state`).
        let source = r#"
            composition "HoloEmbedEncoderSurface" {
              module HoloEmbedEncoderModule {
                state {
                  enable_snn: true
                  embedding_dim: 768
                  structural_weight: 0.12
                  capability_tags: [
                    "holoembed_encoder",
                    "embedding",
                    "768_dim"
                  ]
                }

                action initialize() {
                  emit("holoembed_encoder_ready", {
                    enable_snn: this.state.enable_snn,
                    provider: "holoembed"
                  });

                  return {
                    provider: "holoembed",
                    embedding_dim: this.state.embedding_dim
                  };
                }

                action receipt() {
                  return {
                    type: "HoloEmbedEncoderReceipt",
                    timestamp: current_time()
                  };
                }

                exports { initialize, receipt, state }
              }
            }
        "#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        let AstNode::Composition(comp) = &program.body[0] else {
            panic!("Expected Composition node, got {:?}", &program.body[0]);
        };
        assert_eq!(comp.name, "HoloEmbedEncoderSurface");
        assert_eq!(comp.children.len(), 1, "one module child");

        // The module is a named container (GroupNode) with state + actions +
        // exports as children.
        let AstNode::Group(module) = &comp.children[0] else {
            panic!("Expected module (GroupNode), got {:?}", &comp.children[0]);
        };
        assert_eq!(module.name, "HoloEmbedEncoderModule");

        // state block captured as a named GroupNode carrying its entries.
        let state = module
            .children
            .iter()
            .find_map(|c| match c {
                AstNode::Group(g) if g.name == "state" => Some(g),
                _ => None,
            })
            .expect("state block present");
        assert!(
            state.properties.iter().any(|p| p.key == "capability_tags"),
            "state entries (incl. array value) must parse"
        );

        // two action declarations, both with nested-brace bodies.
        let action_count = module
            .children
            .iter()
            .filter(|c| matches!(c, AstNode::ActionDecl(_)))
            .count();
        assert_eq!(action_count, 2, "both actions parsed");

        // exports list captured as a GroupNode named `exports`.
        let exports = module
            .children
            .iter()
            .find_map(|c| match c {
                AstNode::Group(g) if g.name == "exports" => Some(g),
                _ => None,
            })
            .expect("exports block present");
        assert_eq!(exports.children.len(), 3, "initialize, receipt, state");
    }

    #[test]
    fn test_module_property_is_not_a_module_block() {
        // `module:` (colon) is a plain property, NOT a module block — the brace
        // look-ahead in `is_module_start` must keep them distinct.
        let source = r#"composition "X" { module: "shared" }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        let AstNode::Composition(comp) = &program.body[0] else {
            panic!("Expected Composition node");
        };
        assert!(comp.children.is_empty(), "no module child expected");
        assert_eq!(comp.properties.len(), 1, "module parsed as a property");
        assert_eq!(comp.properties[0].key, "module");
    }

    #[test]
    fn test_parse_composition() {
        let source = r#"
            composition "My Scene" {
                orb cube {
                    @grabbable
                    position: [0, 1, 0]
                }
            }
        "#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_traits() {
        let source = r#"
            orb button {
                @grabbable
                @physics { mass: 1.5 }
                color: "blue"
            }
        "#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_array() {
        let source = r#"orb test { position: [1, 2, 3] }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_syntax() {
        let source = r#"orb { missing name }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_state_machine() {
        let source = r#"
            state_machine "GameController" {
                initialState: "idle"
                states: {
                    "idle": {
                        entry: "init"
                        timeout: 5000
                    },
                    "running": {
                        entry: "start"
                    }
                }
            }
        "#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::StateMachine(sm) = &program.body[0] {
            assert_eq!(sm.name, "GameController");
            assert_eq!(sm.states.len(), 2);
            assert_eq!(sm.states[0].name, "idle");
            assert_eq!(sm.states[1].name, "running");
        } else {
            panic!("Expected StateMachine node");
        }
    }

    #[test]
    fn test_parse_talent_tree() {
        let source = r#"
            talent_tree "WarriorSkills" {
                class: "warrior"
                rows: [
                    {
                        tier: 1,
                        nodes: [
                            { id: "slash", name: "Power Slash", points: 1 },
                            { id: "block", name: "Shield Block", points: 2 }
                        ]
                    },
                    {
                        tier: 2,
                        nodes: [
                            { id: "charge", name: "Battle Charge", points: 1 }
                        ]
                    }
                ]
            }
        "#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::TalentTree(tt) = &program.body[0] {
            assert_eq!(tt.name, "WarriorSkills");
            assert_eq!(tt.tiers.len(), 2);
            assert_eq!(tt.tiers[0].level, 1);
            assert_eq!(tt.tiers[0].nodes.len(), 2);
            // name takes precedence over id when both are present
            assert_eq!(tt.tiers[0].nodes[0].name, "Power Slash");
            assert_eq!(tt.tiers[0].nodes[1].name, "Shield Block");
            assert_eq!(tt.tiers[1].level, 2);
            assert_eq!(tt.tiers[1].nodes.len(), 1);
            assert_eq!(tt.tiers[1].nodes[0].name, "Battle Charge");
        } else {
            panic!("Expected TalentTree node");
        }
    }

    // ── Behavioral construct parity (move / action / on_*) ──────────────

    #[test]
    fn test_parse_move_to_position() {
        let source = r#"move player to [1,0,0]"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::MovementStatement(m) = &program.body[0] {
            assert_eq!(m.target, "player");
            match &m.destination {
                MovementDestination::Position(p) => assert_eq!(*p, [1.0, 0.0, 0.0]),
                other => panic!("Expected Position destination, got {:?}", other),
            }
        } else {
            panic!("Expected MovementStatement node");
        }
    }

    #[test]
    fn test_parse_move_to_entity_with_clauses() {
        let source = r#"move to enemy over 2 via glide"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::MovementStatement(m) = &program.body[0] {
            assert_eq!(m.target, "self");
            assert_eq!(m.duration, Some(2.0));
            assert_eq!(m.mode, Some("glide".to_string()));
            match &m.destination {
                MovementDestination::EntityId(e) => assert_eq!(e, "enemy"),
                other => panic!("Expected EntityId destination, got {:?}", other),
            }
        } else {
            panic!("Expected MovementStatement node");
        }
    }

    // ── Timeline construct (named temporal container, mirrors group) ────

    #[test]
    fn test_parse_timeline_top_level() {
        let source = r#"timeline intro {
            duration: 3.0
            move player to [1, 0, 0] over 1 easing spring
        }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::Timeline(t) = &program.body[0] {
            assert_eq!(t.name, "intro");
            assert_eq!(t.properties.len(), 1);
            assert_eq!(t.properties[0].key, "duration");
            assert_eq!(t.children.len(), 1);
            assert!(
                matches!(&t.children[0], AstNode::MovementStatement(_)),
                "Expected the timeline child to be a move statement"
            );
        } else {
            panic!("Expected Timeline node, got {:?}", &program.body[0]);
        }
    }

    #[test]
    fn test_parse_timeline_as_nested_child() {
        // `timeline` must parse as a nested child too (parity with `group`),
        // so authored forms like `group stage { timeline intro { ... } }` work.
        let source = r#"group stage {
            timeline intro { autoplay: true }
        }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        if let AstNode::Group(g) = &program.body[0] {
            assert_eq!(g.children.len(), 1);
            assert!(
                matches!(&g.children[0], AstNode::Timeline(_)),
                "Expected a nested Timeline child inside the group"
            );
        } else {
            panic!("Expected Group node, got {:?}", &program.body[0]);
        }
    }

    // ── Keyframe-track sub-grammar inside timeline (Theatre.js harvest S1) ──

    #[test]
    fn test_parse_timeline_with_keyframe_track() {
        // The headline target syntax from the harvest plan.
        let source = r#"timeline intro {
            track "scaleUniform" { key 0 {0}; key 1 {1} easing spring }
        }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        let AstNode::Timeline(t) = &program.body[0] else {
            panic!("Expected Timeline node, got {:?}", &program.body[0]);
        };
        assert_eq!(t.name, "intro");
        assert_eq!(t.children.len(), 1, "expected one track child");

        let AstNode::Track(track) = &t.children[0] else {
            panic!("Expected Track child, got {:?}", &t.children[0]);
        };
        assert_eq!(track.target, "scaleUniform");
        assert_eq!(track.keyframes.len(), 2);

        // key 0 {0} — no easing
        assert_eq!(track.keyframes[0].time, 0.0);
        assert!(track.keyframes[0].easing.is_none());
        assert!(
            matches!(track.keyframes[0].value.as_ref(), AstNode::Number(n) if n.value == 0.0),
            "expected key 0 value to be Number(0)"
        );

        // key 1 {1} easing spring — reuses the shipped spring easing name
        assert_eq!(track.keyframes[1].time, 1.0);
        assert_eq!(track.keyframes[1].easing.as_deref(), Some("spring"));
        assert!(
            matches!(track.keyframes[1].value.as_ref(), AstNode::Number(n) if n.value == 1.0),
            "expected key 1 value to be Number(1)"
        );
    }

    #[test]
    fn test_parse_track_separators_optional() {
        // Keyframes may be newline-separated (no `;`) since newlines are
        // filtered out — the grammar must accept both forms.
        let source = r#"timeline t {
            track "opacity" {
                key 0 {0}
                key 0.5 {0.8} easing ease_in_out
                key 1 {1}
            }
        }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        let AstNode::Timeline(t) = &program.body[0] else {
            panic!("Expected Timeline node");
        };
        let AstNode::Track(track) = &t.children[0] else {
            panic!("Expected Track child");
        };
        assert_eq!(track.target, "opacity");
        assert_eq!(track.keyframes.len(), 3);
        assert_eq!(track.keyframes[1].time, 0.5);
        assert_eq!(track.keyframes[1].easing.as_deref(), Some("ease_in_out"));
    }

    #[test]
    fn test_parse_timeline_mixes_track_property_and_move() {
        // A timeline may carry sequencing properties, keyframe tracks, AND
        // statement children side by side.
        let source = r#"timeline scene {
            duration: 2.0
            track "rotationY" { key 0 {0}; key 1 {6.28} easing bounce }
            move camera to [0, 2, 5] over 2 easing ease_out
        }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        let AstNode::Timeline(t) = &program.body[0] else {
            panic!("Expected Timeline node");
        };
        assert_eq!(t.properties.len(), 1, "duration property");
        assert_eq!(t.properties[0].key, "duration");
        assert_eq!(t.children.len(), 2, "one track + one move");
        assert!(matches!(&t.children[0], AstNode::Track(_)));
        assert!(matches!(&t.children[1], AstNode::MovementStatement(_)));

        let AstNode::Track(track) = &t.children[0] else {
            unreachable!();
        };
        assert_eq!(track.target, "rotationY");
        assert_eq!(track.keyframes[1].easing.as_deref(), Some("bounce"));
    }

    #[test]
    fn test_parse_track_identifier_target() {
        // The track target may be a bare identifier, not only a string.
        let source = r#"timeline t {
            track positionX { key 0 {-1}; key 1 {1} }
        }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        let AstNode::Timeline(t) = &program.body[0] else {
            panic!("Expected Timeline node");
        };
        let AstNode::Track(track) = &t.children[0] else {
            panic!("Expected Track child");
        };
        assert_eq!(track.target, "positionX");
        assert_eq!(track.keyframes.len(), 2);
    }

    #[test]
    fn test_property_named_track_is_not_a_track_block() {
        // `track:` (colon) is a property, NOT a keyframe-track block — the
        // brace look-ahead in `is_track_start` must keep them distinct.
        let source = r#"timeline t { track: "main" }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        let AstNode::Timeline(t) = &program.body[0] else {
            panic!("Expected Timeline node");
        };
        assert_eq!(t.properties.len(), 1, "track should parse as a property");
        assert_eq!(t.properties[0].key, "track");
        assert!(t.children.is_empty(), "no Track child expected");
    }

    #[test]
    fn test_parse_action_decl() {
        let source = r#"action open(target) { @requires { dist < 2 } }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::ActionDecl(a) = &program.body[0] {
            assert_eq!(a.name, "open");
            assert_eq!(a.params, vec!["target".to_string()]);
            assert_eq!(a.clauses.len(), 1);
            assert_eq!(a.clauses[0].kind, "requires");
            assert!(a.clauses[0].body.contains("dist"));
        } else {
            panic!("Expected ActionDecl node");
        }
    }

    #[test]
    fn test_parse_action_decl_flags() {
        let source = r#"action attack { @server_side }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        if let AstNode::ActionDecl(a) = &program.body[0] {
            assert_eq!(a.name, "attack");
            assert!(a.clauses.is_empty());
            assert_eq!(a.flags, vec!["server_side".to_string()]);
        } else {
            panic!("Expected ActionDecl node");
        }
    }

    #[test]
    fn test_parse_game_event_block_interaction() {
        let source = r#"on_grab { drop() }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::GameEventBlock(g) = &program.body[0] {
            assert_eq!(g.name, "on_grab");
            assert_eq!(g.category, Some("interaction".to_string()));
        } else {
            panic!("Expected GameEventBlock node");
        }
    }

    #[test]
    fn test_parse_game_event_block_movement() {
        let source = r#"on_teleport { warp() }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();

        if let AstNode::GameEventBlock(g) = &program.body[0] {
            assert_eq!(g.name, "on_teleport");
            assert_eq!(g.category, Some("movement".to_string()));
        } else {
            panic!("Expected GameEventBlock node");
        }
    }

    #[test]
    fn test_parse_typed_function_signature_and_local() {
        let source = r#"function add(left: i32, right: i64): i64 {
            let result: i64 = left + right
            return result
        }"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("typed function should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        assert_eq!(function.params, vec!["left", "right"]);
        assert_eq!(
            function.param_types,
            vec![Some("i32".to_string()), Some("i64".to_string())]
        );
        assert_eq!(function.return_type.as_deref(), Some("i64"));

        let AstNode::VariableDeclaration(local) = &function.body[0] else {
            panic!("Expected VariableDeclaration node");
        };
        assert_eq!(local.name, "result");
        assert_eq!(local.type_annotation.as_deref(), Some("i64"));
    }

    #[test]
    fn test_parse_caller_tied_aggregate_reference_lifetime() {
        let source = r#"function view<'a>(packet: &'a Packet): &'a Packet {
            return packet
        }"#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("explicit aggregate-reference lifetime should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        assert_eq!(function.lifetimes, vec!["a"]);
        assert_eq!(function.param_types, vec![Some("&'a Packet".to_string())]);
        assert_eq!(function.return_type.as_deref(), Some("&'a Packet"));
        let serialized = serde_json::to_value(function).expect("function AST should serialize");
        assert_eq!(serialized["lifetimes"], serde_json::json!(["a"]));
    }

    #[test]
    fn test_parse_caller_tied_slice_reference_lifetime() {
        let source = r#"function view<'a>(values: &'a [i32]): &'a [i32] {
            return values
        }"#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("explicit slice-reference lifetime should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        assert_eq!(function.lifetimes, vec!["a"]);
        assert_eq!(function.param_types, vec![Some("&'a [i32]".to_string())]);
        assert_eq!(function.return_type.as_deref(), Some("&'a [i32]"));
        let serialized = serde_json::to_value(function).expect("function AST should serialize");
        assert_eq!(serialized["lifetimes"], serde_json::json!(["a"]));
    }

    #[test]
    fn test_parse_typed_stack_slot_declaration() {
        let source = r#"function main(): i32 {
            slot value: i32 = 2
            store(value, 5)
            return load(value)
        }"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("typed stack slot should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        let AstNode::StackSlotDeclaration(slot) = &function.body[0] else {
            panic!("Expected StackSlotDeclaration node");
        };
        assert_eq!(slot.name, "value");
        assert_eq!(slot.type_annotation, "i32");
        assert!(matches!(function.body[1], AstNode::CallExpression(_)));
    }

    #[test]
    fn test_parse_fixed_array_slot_and_slice_projection() {
        let source = r#"function main(): i32 {
            slot values: [i32; 4] = [1, 2, 3, 4]
            let index: i32 = 1
            return load(values[1..4][index])
        }"#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("fixed array storage and slice projection should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        let AstNode::StackSlotDeclaration(slot) = &function.body[0] else {
            panic!("Expected StackSlotDeclaration node");
        };
        assert_eq!(slot.type_annotation, "[i32; 4]");
        assert!(matches!(
            slot.value.as_ref(),
            AstNode::Array(array) if array.elements.len() == 4
        ));

        let AstNode::Return(return_node) = &function.body[2] else {
            panic!("Expected Return node");
        };
        let AstNode::CallExpression(load) = return_node
            .argument
            .as_deref()
            .expect("return should carry a load expression")
        else {
            panic!("Expected CallExpression node");
        };
        assert!(matches!(
            load.arguments.first(),
            Some(AstNode::MemberExpression(outer))
                if outer.computed
                    && matches!(
                        outer.object.as_ref(),
                        AstNode::MemberExpression(inner)
                            if inner.computed
                                && matches!(
                                    inner.property.as_ref(),
                                    AstNode::BinaryExpression(range) if range.operator == ".."
                                )
                    )
        ));
    }

    #[test]
    fn test_parse_owned_buffer_type_and_initializer() {
        let source = r#"function main(): i32 {
            let values: [i32] = buffer(4, 0)
            let moved: [i32] = move(values)
            let view: &[i32] = &moved
            return 5
        }"#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("owned buffers and whole-buffer borrows should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        let AstNode::VariableDeclaration(owner) = &function.body[0] else {
            panic!("Expected owned buffer declaration");
        };
        assert_eq!(owner.type_annotation.as_deref(), Some("[i32]"));
        assert!(matches!(
            owner.value.as_ref(),
            AstNode::CallExpression(call)
                if matches!(call.callee.as_ref(), AstNode::Identifier(name) if name.name == "buffer")
                    && call.arguments.len() == 2
        ));

        let AstNode::VariableDeclaration(moved) = &function.body[1] else {
            panic!("Expected moved owned buffer declaration");
        };
        assert!(matches!(
            moved.value.as_ref(),
            AstNode::CallExpression(call)
                if matches!(call.callee.as_ref(), AstNode::Identifier(name) if name.name == "move")
                    && call.arguments.len() == 1
        ));

        let AstNode::VariableDeclaration(view) = &function.body[2] else {
            panic!("Expected borrowed slice declaration");
        };
        assert!(matches!(
            view.value.as_ref(),
            AstNode::UnaryExpression(unary)
                if unary.operator == "&"
                    && matches!(unary.argument.as_ref(), AstNode::Identifier(name) if name.name == "moved")
        ));
    }

    #[test]
    fn test_parse_owned_buffer_parameter_return_and_explicit_transfers() {
        let source = r#"function relay(values: [i32]): [i32] {
            return move(values)
        }
        function main(): i32 {
            let values: [i32] = buffer(2, 5)
            let relayed: [i32] = relay(move(values))
            return 5
        }"#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("owned call and return transfer syntax should parse");

        let AstNode::Function(relay) = &program.body[0] else {
            panic!("Expected relay function");
        };
        assert_eq!(relay.param_types[0].as_deref(), Some("[i32]"));
        assert_eq!(relay.return_type.as_deref(), Some("[i32]"));
        assert!(matches!(
            &relay.body[0],
            AstNode::Return(return_node)
                if matches!(
                    return_node.argument.as_deref(),
                    Some(AstNode::CallExpression(call))
                        if matches!(call.callee.as_ref(), AstNode::Identifier(name) if name.name == "move")
                )
        ));

        let AstNode::Function(main) = &program.body[1] else {
            panic!("Expected main function");
        };
        let AstNode::VariableDeclaration(relayed) = &main.body[1] else {
            panic!("Expected relayed owner declaration");
        };
        assert!(matches!(
            relayed.value.as_ref(),
            AstNode::CallExpression(call)
                if matches!(call.callee.as_ref(), AstNode::Identifier(name) if name.name == "relay")
                    && matches!(
                        call.arguments.first(),
                        Some(AstNode::CallExpression(transfer))
                            if matches!(transfer.callee.as_ref(), AstNode::Identifier(name) if name.name == "move")
                    )
        ));
    }

    #[test]
    fn test_parse_nested_owned_aggregate_field_transfer_path() {
        let source = r#"
            struct Payload { values: [i32], marker: i32 }
            struct Envelope { payload: Payload }
            function extract(): [i32] {
                slot envelope: Envelope = Envelope(Payload(buffer(2, 5), 5))
                return move(envelope.payload.values)
            }
        "#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("nested owned aggregate transfer path should parse");

        let AstNode::StructDeclaration(payload) = &program.body[0] else {
            panic!("Expected Payload struct");
        };
        assert_eq!(payload.field_types[0].as_deref(), Some("[i32]"));
        let AstNode::Function(extract) = &program.body[2] else {
            panic!("Expected extract function");
        };
        let AstNode::Return(return_node) = &extract.body[1] else {
            panic!("Expected owned field return");
        };
        let Some(AstNode::CallExpression(transfer)) = return_node.argument.as_deref() else {
            panic!("Expected move call");
        };
        let Some(AstNode::MemberExpression(values)) = transfer.arguments.first() else {
            panic!("Expected owned aggregate field path");
        };
        assert!(matches!(
            values.property.as_ref(),
            AstNode::Identifier(property) if property.name == "values"
        ));
        assert!(matches!(
            values.object.as_ref(),
            AstNode::MemberExpression(payload)
                if matches!(payload.object.as_ref(), AstNode::Identifier(root) if root.name == "envelope")
                    && matches!(payload.property.as_ref(), AstNode::Identifier(property) if property.name == "payload")
        ));
    }

    #[test]
    fn test_parse_borrowed_slice_types_and_range_initializers() {
        let source = r#"function main(): i32 {
            slot values: [i32; 4] = [1, 2, 3, 4]
            let view: &[i32] = &values[1..4]
            let writer: &mut [i32] = &mut values[0..2]
            return load(view[1])
        }"#;
        let mut parser = Parser::new(source);
        let program = parser
            .parse()
            .expect("borrowed slice types and range initializers should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        let AstNode::VariableDeclaration(view) = &function.body[1] else {
            panic!("Expected immutable slice declaration");
        };
        assert_eq!(view.type_annotation.as_deref(), Some("&[i32]"));
        assert!(matches!(
            view.value.as_ref(),
            AstNode::UnaryExpression(unary)
                if unary.operator == "&"
                    && matches!(
                        unary.argument.as_ref(),
                        AstNode::MemberExpression(member)
                            if member.computed
                                && matches!(
                                    member.property.as_ref(),
                                    AstNode::BinaryExpression(range) if range.operator == ".."
                                )
                    )
        ));

        let AstNode::VariableDeclaration(writer) = &function.body[2] else {
            panic!("Expected mutable slice declaration");
        };
        assert_eq!(writer.type_annotation.as_deref(), Some("&mut [i32]"));
        assert!(matches!(
            writer.value.as_ref(),
            AstNode::UnaryExpression(unary) if unary.operator == "&mut"
        ));
    }

    #[test]
    fn test_parse_typed_reference_borrows_and_dereference_assignment() {
        let source = r#"function main(): i32 {
            slot readable: i32 = 2
            slot writable: i32 = 0
            let view: &i32 = &readable
            let writer: &mut i32 = &mut writable
            *writer = 5
            return *view
        }"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("typed references should parse");

        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        let AstNode::VariableDeclaration(view) = &function.body[2] else {
            panic!("Expected immutable reference declaration");
        };
        assert_eq!(view.type_annotation.as_deref(), Some("&i32"));
        assert!(matches!(
            view.value.as_ref(),
            AstNode::UnaryExpression(unary) if unary.operator == "&"
        ));

        let AstNode::VariableDeclaration(writer) = &function.body[3] else {
            panic!("Expected mutable reference declaration");
        };
        assert_eq!(writer.type_annotation.as_deref(), Some("&mut i32"));
        assert!(matches!(
            writer.value.as_ref(),
            AstNode::UnaryExpression(unary) if unary.operator == "&mut"
        ));

        let AstNode::Assignment(assignment) = &function.body[4] else {
            panic!("Expected dereference assignment");
        };
        assert_eq!(assignment.operator, "=");
        assert!(matches!(
            assignment.target.as_ref(),
            AstNode::UnaryExpression(unary) if unary.operator == "*"
        ));
    }

    #[test]
    fn test_parse_lexical_scope_as_canonical_statement_node() {
        let source = r#"function main(): i32 {
            slot value: i32 = 2
            scope {
                let view: &i32 = &value
            }
            return load(value)
        }"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("lexical scope should parse");
        let json = serde_json::to_value(program).expect("AST should serialize");

        assert_eq!(json["body"][0]["body"][1]["type"], "LexicalScope");
        assert_eq!(
            json["body"][0]["body"][1]["body"][0]["type"],
            "VariableDeclaration"
        );
    }

    #[test]
    fn test_scope_remains_an_identifier_outside_a_scope_block() {
        let mut parser = Parser::new("function main() { scope() return 5 }");
        let program = parser
            .parse()
            .expect("contextual scope keyword must preserve calls named scope");
        let AstNode::Function(function) = &program.body[0] else {
            panic!("Expected Function node");
        };
        assert!(matches!(function.body[0], AstNode::CallExpression(_)));
    }

    #[test]
    fn test_reference_tokens_preserve_multiplication_and_logical_and() {
        for (source, expected_operator) in [
            ("function main() { return 2 * 3 }", "*"),
            ("function main() { return left && right }", "&&"),
        ] {
            let mut parser = Parser::new(source);
            let program = parser.parse().expect("legacy binary operator should parse");
            let AstNode::Function(function) = &program.body[0] else {
                panic!("Expected Function node");
            };
            let AstNode::Return(return_node) = &function.body[0] else {
                panic!("Expected Return node");
            };
            assert!(matches!(
                return_node.argument.as_deref(),
                Some(AstNode::BinaryExpression(binary)) if binary.operator == expected_operator
            ));
        }
    }

    #[test]
    fn test_untyped_function_preserves_legacy_serialized_shape() {
        let mut parser = Parser::new("function identity(value) { let copy = value return copy }");
        let program = parser.parse().expect("legacy function should parse");
        let json = serde_json::to_value(program).expect("AST should serialize");
        let function = &json["body"][0];

        assert!(function.get("param_types").is_none());
        assert!(function.get("return_type").is_none());
        assert!(function["body"][0].get("type_annotation").is_none());
    }

    #[test]
    fn test_parse_enum_declaration() {
        let source = r#"enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 1);

        if let AstNode::EnumDeclaration(e) = &program.body[0] {
            assert_eq!(e.name, "Route");
            assert_eq!(
                e.members,
                vec![
                    "EnterWorld".to_string(),
                    "PendingWorld".to_string(),
                    "OpenUrl".to_string(),
                    "ShowResult".to_string()
                ]
            );
        } else {
            panic!("Expected EnumDeclaration node");
        }
    }

    #[test]
    fn test_parse_enum_with_function() {
        // An enum followed by a function that returns its members parses as two top-level nodes.
        let source = r#"enum Route { EnterWorld, ShowResult }
function decideRoute(isWorldLink) {
  if (isWorldLink) { return Route.EnterWorld } else { return Route.ShowResult }
}"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok(), "Parse error: {:?}", result.err());
        let program = result.unwrap();
        assert_eq!(program.body.len(), 2);
        assert!(matches!(program.body[0], AstNode::EnumDeclaration(_)));
        assert!(matches!(program.body[1], AstNode::Function(_)));
    }

    #[test]
    fn test_parse_struct_declaration() {
        let source = r#"struct Vec3 { x, y, z }"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("struct should parse");
        assert_eq!(program.body.len(), 1);
        if let AstNode::StructDeclaration(s) = &program.body[0] {
            assert_eq!(s.name, "Vec3");
            assert_eq!(
                s.fields,
                vec!["x".to_string(), "y".to_string(), "z".to_string()]
            );
            assert!(s.field_types.is_empty());
        } else {
            panic!("Expected StructDeclaration node, got {:?}", program.body[0]);
        }
    }

    #[test]
    fn test_parse_typed_struct_fields_without_changing_legacy_field_names() {
        let source = r#"struct Packet { enabled: bool, count: i64, code: i32 }"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("typed struct should parse");
        let AstNode::StructDeclaration(packet) = &program.body[0] else {
            panic!("expected StructDeclaration node");
        };

        assert_eq!(packet.fields, vec!["enabled", "count", "code"]);
        assert_eq!(
            packet.field_types,
            vec![
                Some("bool".to_string()),
                Some("i64".to_string()),
                Some("i32".to_string())
            ]
        );
    }

    #[test]
    fn test_parse_var_is_mutable_let_is_not() {
        let source = r#"function f(a) {
  var acc = a
  let base = a
  return acc
}"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("should parse");
        let func = match &program.body[0] {
            AstNode::Function(f) => f,
            other => panic!("expected Function, got {:?}", other),
        };
        let var_decl = match &func.body[0] {
            AstNode::VariableDeclaration(v) => v,
            other => panic!("expected VariableDeclaration, got {:?}", other),
        };
        assert_eq!(var_decl.name, "acc");
        assert!(var_decl.mutable, "var must be mutable");
        let let_decl = match &func.body[1] {
            AstNode::VariableDeclaration(v) => v,
            other => panic!("expected VariableDeclaration, got {:?}", other),
        };
        assert!(!let_decl.mutable, "let must be immutable");
    }

    #[test]
    fn test_parse_single_expression_lambda() {
        let source = r#"function addWith(x) {
  let inc = (y) => x + y
  return inc(1)
}"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("lambda should parse");
        let func = match &program.body[0] {
            AstNode::Function(f) => f,
            other => panic!("expected Function, got {:?}", other),
        };
        let decl = match &func.body[0] {
            AstNode::VariableDeclaration(v) => v,
            other => panic!("expected VariableDeclaration, got {:?}", other),
        };
        let lambda = match decl.value.as_ref() {
            AstNode::LambdaExpression(lambda) => lambda,
            other => panic!("expected LambdaExpression, got {:?}", other),
        };
        assert_eq!(lambda.params, vec!["y".to_string()]);
        match lambda.body.as_ref() {
            AstNode::BinaryExpression(b) => assert_eq!(b.operator, "+"),
            other => panic!("expected binary lambda body, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_assignment_and_compound() {
        let source = r#"function f(x) {
  var acc = 0
  acc = x
  acc += 1
  return acc
}"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("should parse");
        let func = match &program.body[0] {
            AstNode::Function(f) => f,
            other => panic!("expected Function, got {:?}", other),
        };
        // body[0] = var decl, body[1] = `acc = x`, body[2] = `acc += 1`, body[3] = return
        let assign = match &func.body[1] {
            AstNode::Assignment(a) => a,
            other => panic!("expected Assignment, got {:?}", other),
        };
        assert_eq!(assign.operator, "=");
        let compound = match &func.body[2] {
            AstNode::Assignment(a) => a,
            other => panic!("expected Assignment, got {:?}", other),
        };
        assert_eq!(compound.operator, "+=");
    }

    #[test]
    fn test_parse_for_in_range() {
        let source = r#"function f(n) {
  var total = 0
  for (i in 0..n) {
    total += i
  }
  return total
}"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("should parse");
        let func = match &program.body[0] {
            AstNode::Function(f) => f,
            other => panic!("expected Function, got {:?}", other),
        };
        let for_of = match &func.body[1] {
            AstNode::ForOf(f) => f,
            other => panic!("expected ForOf, got {:?}", other),
        };
        assert_eq!(for_of.var_name, "i");
        // The range is a `..` binary expression.
        match for_of.range.as_ref() {
            AstNode::BinaryExpression(b) => assert_eq!(b.operator, ".."),
            other => panic!("expected range BinaryExpression, got {:?}", other),
        }
        assert_eq!(for_of.body.len(), 1);
    }

    #[test]
    fn test_parse_while_loop() {
        let source = r#"function f(n) {
  while (n > 0) {
    n = n - 1
  }
  return n
}"#;
        let mut parser = Parser::new(source);
        let program = parser.parse().expect("should parse");
        let func = match &program.body[0] {
            AstNode::Function(f) => f,
            other => panic!("expected Function, got {:?}", other),
        };
        assert!(
            matches!(&func.body[0], AstNode::While(_)),
            "expected While node, got {:?}",
            func.body[0]
        );
    }

    #[test]
    fn test_reaction_category_mapping() {
        assert_eq!(reaction_category("on_interact"), "interaction");
        assert_eq!(reaction_category("on_collision"), "collision");
        assert_eq!(reaction_category("on_spawn"), "lifecycle");
        assert_eq!(reaction_category("on_cast"), "combat");
        assert_eq!(reaction_category("on_signal"), "signal");
        assert_eq!(reaction_category("on_walk"), "movement");
        assert_eq!(reaction_category("on_unknown_xyz"), "custom");
    }
}
