//! Lexer for HoloScript source code.

use crate::token::{get_keyword, Token, TokenType};

/// Lexer for tokenizing HoloScript source code
pub struct Lexer<'a> {
    source: &'a str,
    chars: std::iter::Peekable<std::str::CharIndices<'a>>,
    line: usize,
    column: usize,
    position: usize,
}

impl<'a> Lexer<'a> {
    pub fn new(source: &'a str) -> Self {
        Self {
            source,
            chars: source.char_indices().peekable(),
            line: 1,
            column: 1,
            position: 0,
        }
    }

    /// Tokenize the entire source and return all tokens
    pub fn tokenize(&mut self) -> Vec<Token> {
        let mut tokens = Vec::new();
        loop {
            let token = self.next_token();
            let is_eof = token.token_type == TokenType::Eof;
            tokens.push(token);
            if is_eof {
                break;
            }
        }
        tokens
    }

    /// Get the next token
    pub fn next_token(&mut self) -> Token {
        self.skip_whitespace();

        let Some(&(start, ch)) = self.chars.peek() else {
            return Token::eof(self.line, self.column, self.position);
        };

        let start_line = self.line;
        let start_column = self.column;

        match ch {
            // Comments
            '/' => {
                self.advance();
                if let Some(&(_, '/')) = self.chars.peek() {
                    self.advance();
                    return self.read_line_comment(start, start_line, start_column);
                } else if let Some(&(_, '*')) = self.chars.peek() {
                    self.advance();
                    return self.read_block_comment(start, start_line, start_column);
                }
                Token::new(TokenType::Slash, "/", start_line, start_column, start, start + 1)
            }

            '#' => {
                self.advance();
                self.read_line_comment(start, start_line, start_column)
            }

            // Strings
            '"' | '\'' => self.read_string(ch),

            // Numbers
            '0'..='9' => self.read_number(),
            '-' if self.peek_next().map_or(false, |c| c.is_ascii_digit()) => self.read_number(),

            // Traits
            '@' => self.read_trait(),

            // Identifiers and keywords
            'a'..='z' | 'A'..='Z' | '_' => self.read_identifier(),

            // Operators and punctuation
            ':' => self.single_char_token(TokenType::Colon, ":"),
            ',' => self.single_char_token(TokenType::Comma, ","),
            '.' => {
                self.advance();
                if let Some(&(_, '.')) = self.chars.peek() {
                    self.advance();
                    if let Some(&(_, '.')) = self.chars.peek() {
                        self.advance();
                        return Token::new(
                            TokenType::Spread,
                            "...",
                            start_line,
                            start_column,
                            start,
                            self.position,
                        );
                    }
                }
                Token::new(TokenType::Dot, ".", start_line, start_column, start, start + 1)
            }
            '=' => {
                self.advance();
                if let Some(&(_, '>')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::Arrow, "=>", start_line, start_column, start, self.position)
                } else if let Some(&(_, '=')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::Eq, "==", start_line, start_column, start, self.position)
                } else {
                    Token::new(TokenType::Equals, "=", start_line, start_column, start, self.position)
                }
            }
            '+' => self.single_char_token(TokenType::Plus, "+"),
            '*' => self.single_char_token(TokenType::Star, "*"),
            '%' => self.single_char_token(TokenType::Percent, "%"),
            '!' => {
                self.advance();
                if let Some(&(_, '=')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::Ne, "!=", start_line, start_column, start, self.position)
                } else {
                    Token::new(TokenType::Bang, "!", start_line, start_column, start, self.position)
                }
            }
            '<' => {
                self.advance();
                if let Some(&(_, '=')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::Le, "<=", start_line, start_column, start, self.position)
                } else {
                    Token::new(TokenType::Lt, "<", start_line, start_column, start, self.position)
                }
            }
            '>' => {
                self.advance();
                if let Some(&(_, '=')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::Ge, ">=", start_line, start_column, start, self.position)
                } else {
                    Token::new(TokenType::Gt, ">", start_line, start_column, start, self.position)
                }
            }
            '&' => {
                self.advance();
                if let Some(&(_, '&')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::And, "&&", start_line, start_column, start, self.position)
                } else {
                    Token::new(TokenType::Invalid, "&", start_line, start_column, start, self.position)
                }
            }
            '|' => {
                self.advance();
                if let Some(&(_, '|')) = self.chars.peek() {
                    self.advance();
                    Token::new(TokenType::Or, "||", start_line, start_column, start, self.position)
                } else {
                    Token::new(TokenType::Invalid, "|", start_line, start_column, start, self.position)
                }
            }

            // Brackets
            '{' => self.single_char_token(TokenType::LBrace, "{"),
            '}' => self.single_char_token(TokenType::RBrace, "}"),
            '[' => self.single_char_token(TokenType::LBracket, "["),
            ']' => self.single_char_token(TokenType::RBracket, "]"),
            '(' => self.single_char_token(TokenType::LParen, "("),
            ')' => self.single_char_token(TokenType::RParen, ")"),

            // Newline (for significant whitespace if needed)
            '\n' => {
                self.advance();
                self.line += 1;
                self.column = 1;
                Token::new(TokenType::Newline, "\n", start_line, start_column, start, self.position)
            }

            // Invalid character
            _ => {
                self.advance();
                Token::new(
                    TokenType::Invalid,
                    ch.to_string(),
                    start_line,
                    start_column,
                    start,
                    self.position,
                )
            }
        }
    }

    fn advance(&mut self) -> Option<(usize, char)> {
        if let Some((pos, ch)) = self.chars.next() {
            self.position = pos + ch.len_utf8();
            self.column += 1;
            Some((pos, ch))
        } else {
            None
        }
    }

    fn peek_next(&mut self) -> Option<char> {
        let mut iter = self.chars.clone();
        iter.next();
        iter.next().map(|(_, c)| c)
    }

    fn skip_whitespace(&mut self) {
        while let Some(&(_, ch)) = self.chars.peek() {
            if ch == ' ' || ch == '\t' || ch == '\r' {
                self.advance();
            } else if ch == '\n' {
                // Don't skip newlines - they might be significant
                break;
            } else {
                break;
            }
        }
    }

    fn single_char_token(&mut self, token_type: TokenType, value: &str) -> Token {
        let start = self.position;
        let line = self.line;
        let column = self.column;
        self.advance();
        Token::new(token_type, value, line, column, start, self.position)
    }

    fn read_string(&mut self, quote: char) -> Token {
        let start = self.position;
        let start_line = self.line;
        let start_column = self.column;

        self.advance(); // Skip opening quote

        let mut value = String::new();
        while let Some(&(_, ch)) = self.chars.peek() {
            if ch == quote {
                self.advance(); // Skip closing quote
                return Token::new(TokenType::String, value, start_line, start_column, start, self.position);
            }
            if ch == '\\' {
                self.advance();
                if let Some(&(_, escaped)) = self.chars.peek() {
                    let escaped_char = match escaped {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        '\\' => '\\',
                        '"' => '"',
                        '\'' => '\'',
                        _ => escaped,
                    };
                    value.push(escaped_char);
                    self.advance();
                }
            } else if ch == '\n' {
                self.line += 1;
                self.column = 0;
                value.push(ch);
                self.advance();
            } else {
                value.push(ch);
                self.advance();
            }
        }

        // Unterminated string
        Token::new(TokenType::Invalid, value, start_line, start_column, start, self.position)
    }

    fn read_number(&mut self) -> Token {
        let start = self.position;
        let start_line = self.line;
        let start_column = self.column;

        let mut value = String::new();

        // Handle negative sign
        if let Some(&(_, '-')) = self.chars.peek() {
            value.push('-');
            self.advance();
        }

        // Integer part
        while let Some(&(_, ch)) = self.chars.peek() {
            if ch.is_ascii_digit() {
                value.push(ch);
                self.advance();
            } else {
                break;
            }
        }

        // Decimal part
        if let Some(&(_, '.')) = self.chars.peek() {
            // Check if this is really a decimal (not a method call or spread)
            let mut iter = self.chars.clone();
            iter.next();
            if let Some((_, next_ch)) = iter.next() {
                if next_ch.is_ascii_digit() {
                    value.push('.');
                    self.advance();

                    while let Some(&(_, ch)) = self.chars.peek() {
                        if ch.is_ascii_digit() {
                            value.push(ch);
                            self.advance();
                        } else {
                            break;
                        }
                    }
                }
            }
        }

        // Exponent part
        if let Some(&(_, ch)) = self.chars.peek() {
            if ch == 'e' || ch == 'E' {
                value.push(ch);
                self.advance();

                if let Some(&(_, sign)) = self.chars.peek() {
                    if sign == '+' || sign == '-' {
                        value.push(sign);
                        self.advance();
                    }
                }

                while let Some(&(_, ch)) = self.chars.peek() {
                    if ch.is_ascii_digit() {
                        value.push(ch);
                        self.advance();
                    } else {
                        break;
                    }
                }
            }
        }

        Token::new(TokenType::Number, value, start_line, start_column, start, self.position)
    }

    fn read_identifier(&mut self) -> Token {
        let start = self.position;
        let start_line = self.line;
        let start_column = self.column;

        let mut value = String::new();
        while let Some(&(_, ch)) = self.chars.peek() {
            if ch.is_alphanumeric() || ch == '_' {
                value.push(ch);
                self.advance();
            } else {
                break;
            }
        }

        let token_type = get_keyword(&value).unwrap_or(TokenType::Identifier);
        Token::new(token_type, value, start_line, start_column, start, self.position)
    }

    fn read_trait(&mut self) -> Token {
        let start = self.position;
        let start_line = self.line;
        let start_column = self.column;

        self.advance(); // Skip @

        let mut value = String::from("@");
        while let Some(&(_, ch)) = self.chars.peek() {
            if ch.is_alphanumeric() || ch == '_' {
                value.push(ch);
                self.advance();
            } else {
                break;
            }
        }

        Token::new(TokenType::Trait, value, start_line, start_column, start, self.position)
    }

    fn read_line_comment(&mut self, start: usize, start_line: usize, start_column: usize) -> Token {
        let mut value = String::new();
        while let Some(&(_, ch)) = self.chars.peek() {
            if ch == '\n' {
                break;
            }
            value.push(ch);
            self.advance();
        }
        Token::new(TokenType::Comment, value, start_line, start_column, start, self.position)
    }

    fn read_block_comment(&mut self, start: usize, start_line: usize, start_column: usize) -> Token {
        let mut value = String::new();
        while let Some((_, ch)) = self.advance() {
            if ch == '*' {
                if let Some(&(_, '/')) = self.chars.peek() {
                    self.advance();
                    break;
                }
            }
            if ch == '\n' {
                self.line += 1;
                self.column = 1;
            }
            value.push(ch);
        }
        Token::new(TokenType::BlockComment, value, start_line, start_column, start, self.position)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_tokens() {
        let mut lexer = Lexer::new("orb test { }");
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::Orb);
        assert_eq!(tokens[1].token_type, TokenType::Identifier);
        assert_eq!(tokens[2].token_type, TokenType::LBrace);
        assert_eq!(tokens[3].token_type, TokenType::RBrace);
    }

    #[test]
    fn test_string_literal() {
        let mut lexer = Lexer::new(r#""hello world""#);
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::String);
        assert_eq!(tokens[0].value, "hello world");
    }

    #[test]
    fn test_number_literal() {
        let mut lexer = Lexer::new("42 3.14 -10 1e5");
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::Number);
        assert_eq!(tokens[0].value, "42");
        assert_eq!(tokens[1].token_type, TokenType::Number);
        assert_eq!(tokens[1].value, "3.14");
    }

    #[test]
    fn test_trait() {
        let mut lexer = Lexer::new("@grabbable @physics");
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::Trait);
        assert_eq!(tokens[0].value, "@grabbable");
        assert_eq!(tokens[1].token_type, TokenType::Trait);
        assert_eq!(tokens[1].value, "@physics");
    }

    #[test]
    fn test_comments() {
        let mut lexer = Lexer::new("// comment\norb");
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::Comment);
        assert_eq!(tokens[1].token_type, TokenType::Newline);
        assert_eq!(tokens[2].token_type, TokenType::Orb);
    }
}
