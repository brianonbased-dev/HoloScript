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
        let tokens: Vec<Token> = lexer
            .tokenize()
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
            errors: Vec::new(),
        }
    }

    /// Parse the source code into an AST
    pub fn parse(&mut self) -> Result<Ast, Vec<ParseError>> {
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
        ) && matches!(self.peek_at(2).map(|t| &t.token_type), Some(TokenType::LBrace))
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
            // Skip optional keyframe separators between entries. `;` lexes as an
            // `Invalid` token (no Semicolon token type); `,` is a real Comma.
            // Newlines are already filtered out, so separators are optional.
            if self.check(TokenType::Comma)
                || (self.check(TokenType::Invalid) && self.peek().value == ";")
            {
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
        self.expect(TokenType::LParen)?;

        let mut params = Vec::new();
        while !self.check(TokenType::RParen) && !self.is_at_end() {
            params.push(self.expect_identifier()?);
            if !self.check(TokenType::RParen) {
                self.expect(TokenType::Comma)?;
            }
        }
        self.expect(TokenType::RParen)?;

        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::Function(FunctionNode {
            name,
            params,
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
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            fields.push(self.expect_identifier()?);
            if self.check(TokenType::Comma) {
                self.advance();
            }
        }

        self.expect(TokenType::RBrace)?;

        Ok(AstNode::StructDeclaration(StructDeclarationNode {
            name,
            fields,
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
                    let dir_name = self
                        .advance()
                        .value
                        .trim_start_matches('@')
                        .to_string();
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

                // Otherwise: skip/advance (plain properties are not retained on
                // the WASM action node — the TS node keeps them, but the Rust
                // parity surface mirrors only clauses + flags).
                self.advance();
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

        let name = token.value.trim_start_matches('@').to_string();

        let config = if self.check(TokenType::LBrace) {
            self.advance();
            let obj = self.parse_object_literal_body()?;
            self.expect(TokenType::RBrace)?;
            Some(Box::new(obj))
        } else {
            None
        };

        Ok(TraitNode {
            name,
            config,
            loc: Some(self.location_from(start_loc)),
        })
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
        self.parse_or_expression()
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
        if self.check(TokenType::Bang) || self.check(TokenType::Minus) {
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
            TokenType::Identifier => {
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
            let key = self.expect_identifier_or_string()?;
            self.expect(TokenType::Colon)?;
            let value = self.parse_expression()?;

            properties.push(PropertyNode {
                key,
                value: Box::new(value),
                loc: None,
            });

            if !self.check(TokenType::RBrace) {
                // Comma is optional
                if self.check(TokenType::Comma) {
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
        self.expect(TokenType::Equals)?;
        let value = self.parse_expression()?;

        Ok(AstNode::VariableDeclaration(VariableDeclarationNode {
            name,
            value: Box::new(value),
            mutable,
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

    fn expect_identifier_or_string(&mut self) -> Result<String, ParseError> {
        self.expect_string_or_identifier()
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

    #[test]
    fn test_parse_simple_orb() {
        let source = r#"orb test { color: "red" }"#;
        let mut parser = Parser::new(source);
        let result = parser.parse();
        assert!(result.is_ok());
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
        } else {
            panic!("Expected StructDeclaration node, got {:?}", program.body[0]);
        }
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
