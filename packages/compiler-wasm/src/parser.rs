//! Parser for HoloScript source code.

use crate::ast::*;
use crate::lexer::Lexer;
use crate::token::{Token, TokenType};

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
pub struct Parser<'a> {
    tokens: Vec<Token>,
    current: usize,
    source: &'a str,
    errors: Vec<ParseError>,
}

impl<'a> Parser<'a> {
    pub fn new(source: &'a str) -> Self {
        let mut lexer = Lexer::new(source);
        let tokens: Vec<Token> = lexer
            .tokenize()
            .into_iter()
            .filter(|t| {
                !matches!(
                    t.token_type,
                    TokenType::Whitespace | TokenType::Newline | TokenType::Comment | TokenType::BlockComment
                )
            })
            .collect();

        Self {
            tokens,
            current: 0,
            source,
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
        // Skip any traits at top level - they become directives
        while self.check(TokenType::Trait) {
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
            TokenType::Identifier => {
                // Could be a generic object type (cube, sphere, etc.)
                let name = self.peek().value.clone();
                if self.is_object_type(&name) {
                    self.parse_generic_object(&name)
                } else {
                    Err(self.error(&format!("Unexpected identifier: {}", name)))
                }
            }
            _ => Err(self.error(&format!(
                "Unexpected token: {:?}",
                self.peek().token_type
            ))),
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

    fn parse_object_body(&mut self) -> Result<(Vec<TraitNode>, Vec<PropertyNode>, Vec<AstNode>), ParseError> {
        let mut traits = Vec::new();
        let mut properties = Vec::new();
        let mut children = Vec::new();

        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            if self.check(TokenType::Trait) {
                traits.push(self.parse_trait()?);
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
        let mut left = self.parse_additive_expression()?;

        while self.check(TokenType::Lt)
            || self.check(TokenType::Gt)
            || self.check(TokenType::Le)
            || self.check(TokenType::Ge)
        {
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

    fn parse_for_statement(&mut self) -> Result<AstNode, ParseError> {
        self.advance(); // consume 'for'
        self.expect(TokenType::LParen)?;

        // Simplified for loop parsing
        let init = if !self.check(TokenType::Colon) {
            Some(Box::new(self.parse_expression()?))
        } else {
            None
        };

        self.expect(TokenType::Colon)?; // Using : as separator for simplicity

        let test = if !self.check(TokenType::Colon) {
            Some(Box::new(self.parse_expression()?))
        } else {
            None
        };

        self.expect(TokenType::Colon)?;

        let update = if !self.check(TokenType::RParen) {
            Some(Box::new(self.parse_expression()?))
        } else {
            None
        };

        self.expect(TokenType::RParen)?;
        self.expect(TokenType::LBrace)?;

        let mut body = Vec::new();
        while !self.check(TokenType::RBrace) && !self.is_at_end() {
            body.push(self.parse_statement()?);
        }
        self.expect(TokenType::RBrace)?;

        Ok(AstNode::For(ForNode {
            init,
            test,
            update,
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

        Ok(AstNode::Return(ReturnNode { argument, loc: None }))
    }

    fn parse_variable_declaration(&mut self) -> Result<AstNode, ParseError> {
        // For now, treat as property assignment
        self.advance(); // consume const/let/var
        let name = self.expect_identifier()?;
        self.expect(TokenType::Equals)?;
        let value = self.parse_expression()?;

        Ok(AstNode::Property(PropertyNode {
            key: name,
            value: Box::new(value),
            loc: None,
        }))
    }

    fn parse_expression_statement(&mut self) -> Result<AstNode, ParseError> {
        self.parse_expression()
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
                | TokenType::Function => return,
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
}
