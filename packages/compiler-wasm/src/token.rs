//! Token types for the HoloScript lexer.

use serde::{Deserialize, Serialize};

/// Token types in HoloScript
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TokenType {
    // Literals
    String,
    Number,
    Boolean,
    Null,

    // Identifiers and keywords
    Identifier,
    Keyword,

    // Object types
    Orb,
    Entity,
    Object,
    Composition,
    World,
    Template,
    Group,
    Timeline,
    Environment,
    Logic,

    // Game constructs (Brittney AI)
    Npc,
    Quest,
    Ability,
    Dialogue,
    StateMachine,
    Achievement,
    TalentTree,

    // Traits
    Trait,

    // Operators
    Colon,
    Comma,
    Semicolon,
    Question,
    Dot,
    Range,
    Equals,
    PlusEquals,
    MinusEquals,
    StarEquals,
    SlashEquals,
    PercentEquals,
    Arrow,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Bang,
    Ampersand,
    And,
    Or,
    Lt,
    Gt,
    Le,
    Ge,
    Eq,
    Ne,
    Spread,

    // Brackets
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    LParen,
    RParen,

    // Control flow
    If,
    Else,
    For,
    While,
    Return,
    Function,
    Enum,
    Struct,
    In,

    // Declarations
    Const,
    Let,
    Var,
    Import,
    Export,
    From,
    As,
    Using,
    Extends,

    // Comments
    Comment,
    BlockComment,

    // Behavioral constructs
    Move,
    Action,
    OnEvent,

    // Special
    Newline,
    Whitespace,
    Forbidden,
    Eof,
    Invalid,
}

/// A token with position information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub token_type: TokenType,
    pub value: String,
    pub line: usize,
    pub column: usize,
    pub start: usize,
    pub end: usize,
}

impl Token {
    pub fn new(
        token_type: TokenType,
        value: impl Into<String>,
        line: usize,
        column: usize,
        start: usize,
        end: usize,
    ) -> Self {
        Self {
            token_type,
            value: value.into(),
            line,
            column,
            start,
            end,
        }
    }

    pub fn eof(line: usize, column: usize, position: usize) -> Self {
        Self {
            token_type: TokenType::Eof,
            value: String::new(),
            line,
            column,
            start: position,
            end: position,
        }
    }
}

/// Keywords mapping
pub fn get_keyword(word: &str) -> Option<TokenType> {
    match word {
        // Object types
        "orb" => Some(TokenType::Orb),
        "entity" => Some(TokenType::Entity),
        "object" => Some(TokenType::Object),
        "composition" => Some(TokenType::Composition),
        "world" => Some(TokenType::World),
        "template" => Some(TokenType::Template),
        "group" => Some(TokenType::Group),
        "timeline" => Some(TokenType::Timeline),
        "environment" => Some(TokenType::Environment),
        "logic" => Some(TokenType::Logic),

        // Game constructs
        "npc" => Some(TokenType::Npc),
        "quest" => Some(TokenType::Quest),
        "ability" => Some(TokenType::Ability),
        "dialogue" => Some(TokenType::Dialogue),
        "state_machine" => Some(TokenType::StateMachine),
        "achievement" => Some(TokenType::Achievement),
        "talent_tree" => Some(TokenType::TalentTree),

        // Behavioral constructs
        "move" => Some(TokenType::Move),
        "action" => Some(TokenType::Action),
        "on_combat" | "on_death" | "on_spawn" | "on_cast" | "on_interact" | "on_collision"
        | "on_proximity" | "on_grab" | "on_release" | "on_use" | "on_hover" | "on_enter"
        | "on_exit" | "on_signal" | "on_input" | "on_tick" | "on_move" | "on_walk" | "on_run"
        | "on_jump" | "on_land" | "on_strafe" | "on_teleport" => Some(TokenType::OnEvent),

        // Control flow
        "if" => Some(TokenType::If),
        "else" => Some(TokenType::Else),
        "for" => Some(TokenType::For),
        "while" => Some(TokenType::While),
        "return" => Some(TokenType::Return),
        "function" => Some(TokenType::Function),
        "enum" => Some(TokenType::Enum),
        "struct" => Some(TokenType::Struct),
        "in" => Some(TokenType::In),

        // Declarations
        "const" => Some(TokenType::Const),
        "let" => Some(TokenType::Let),
        "var" => Some(TokenType::Var),
        "import" => Some(TokenType::Import),
        "export" => Some(TokenType::Export),
        "from" => Some(TokenType::From),
        "as" => Some(TokenType::As),
        "using" => Some(TokenType::Using),
        "extends" => Some(TokenType::Extends),

        // Literals
        "true" | "false" => Some(TokenType::Boolean),
        "null" => Some(TokenType::Null),

        _ => None,
    }
}
