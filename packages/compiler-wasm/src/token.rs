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
    Dot,
    Equals,
    Arrow,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Bang,
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

    // Special
    Newline,
    Whitespace,
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

        // Control flow
        "if" => Some(TokenType::If),
        "else" => Some(TokenType::Else),
        "for" => Some(TokenType::For),
        "while" => Some(TokenType::While),
        "return" => Some(TokenType::Return),
        "function" => Some(TokenType::Function),

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
