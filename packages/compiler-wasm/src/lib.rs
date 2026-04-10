//! HoloScript WASM Compiler
//!
//! High-performance HoloScript parser and type checker compiled to WebAssembly.
//! Provides 10x faster parsing compared to the JavaScript implementation.

mod ast;
mod lexer;
mod parser;
mod token;
mod types;

use wasm_bindgen::prelude::*;

// Initialize panic hook for better error messages in browser console
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Parse HoloScript source code and return AST as JSON.
///
/// # Arguments
/// * `source` - The HoloScript source code to parse
///
/// # Returns
/// A JSON string containing the AST or an error object
#[wasm_bindgen]
pub fn parse(source: &str) -> String {
    match parser::Parser::new(source).parse() {
        Ok(ast) => serde_json::to_string(&ast).unwrap_or_else(|e| {
            format!(r#"{{"error": "Serialization error: {}"}}"#, e)
        }),
        Err(errors) => {
            let error_json: Vec<_> = errors
                .iter()
                .map(|e| {
                    serde_json::json!({
                        "message": e.message,
                        "line": e.line,
                        "column": e.column,
                    })
                })
                .collect();
            serde_json::to_string(&serde_json::json!({
                "errors": error_json
            }))
            .unwrap_or_else(|_| r#"{"error": "Unknown error"}"#.to_string())
        }
    }
}

/// Parse HoloScript and return a pretty-printed JSON AST.
#[wasm_bindgen]
pub fn parse_pretty(source: &str) -> String {
    match parser::Parser::new(source).parse() {
        Ok(ast) => serde_json::to_string_pretty(&ast).unwrap_or_else(|e| {
            format!(r#"{{"error": "Serialization error: {}"}}"#, e)
        }),
        Err(errors) => {
            let error_json: Vec<_> = errors
                .iter()
                .map(|e| {
                    serde_json::json!({
                        "message": e.message,
                        "line": e.line,
                        "column": e.column,
                    })
                })
                .collect();
            serde_json::to_string_pretty(&serde_json::json!({
                "errors": error_json
            }))
            .unwrap_or_else(|_| r#"{"error": "Unknown error"}"#.to_string())
        }
    }
}

/// Validate HoloScript source code without returning the full AST.
///
/// # Returns
/// `true` if the source is valid, `false` otherwise
#[wasm_bindgen]
pub fn validate(source: &str) -> bool {
    parser::Parser::new(source).parse().is_ok()
}

/// Get detailed validation results as JSON.
#[wasm_bindgen]
pub fn validate_detailed(source: &str) -> String {
    match parser::Parser::new(source).parse() {
        Ok(_) => r#"{"valid": true, "errors": []}"#.to_string(),
        Err(errors) => {
            let error_json: Vec<_> = errors
                .iter()
                .map(|e| {
                    serde_json::json!({
                        "message": e.message,
                        "line": e.line,
                        "column": e.column,
                    })
                })
                .collect();
            serde_json::to_string(&serde_json::json!({
                "valid": false,
                "errors": error_json
            }))
            .unwrap_or_else(|_| r#"{"valid": false, "errors": []}"#.to_string())
        }
    }
}

/// Get the version of the WASM compiler.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== parse() tests =====

    #[test]
    fn test_parse_simple_orb() {
        let source = r#"orb test { color: "red" }"#;
        let result = parse(source);
        assert!(!result.contains("error"));
    }

    #[test]
    fn test_parse_composition() {
        let source = r#"
            composition "VR Game" {
                environment {
                    skybox: "nebula"
                    ambient_light: 0.5
                }
                orb player {
                    @grabbable
                    position: [0, 1.6, 0]
                }
            }
        "#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
        assert!(result.contains("VR Game"));
    }

    #[test]
    fn test_parse_multiple_traits() {
        let source = r#"orb cube { @grabbable @physics @networked color: "blue" }"#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
    }

    #[test]
    fn test_parse_returns_json() {
        let source = r#"orb test { position: [1, 2, 3] }"#;
        let result = parse(source);
        // Should be valid JSON
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&result);
        assert!(parsed.is_ok(), "Result should be valid JSON: {}", result);
    }

    #[test]
    fn test_parse_syntax_error_returns_error_json() {
        let source = r#"orb { missing name }"#;
        let result = parse(source);
        assert!(result.contains("errors"));
    }

    // ===== parse_pretty() tests =====

    #[test]
    fn test_parse_pretty_formatting() {
        let source = r#"orb test { color: "red" }"#;
        let result = parse_pretty(source);
        // Pretty printed JSON should have newlines
        assert!(result.contains("\n"));
    }

    #[test]
    fn test_parse_pretty_valid_json() {
        let source = r#"orb cube { position: [0, 0, 0] }"#;
        let result = parse_pretty(source);
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&result);
        assert!(parsed.is_ok());
    }

    // ===== validate() tests =====

    #[test]
    fn test_validate_valid_source() {
        let source = r#"orb cube { @grabbable position: [0, 1, 0] }"#;
        assert!(validate(source));
    }

    #[test]
    fn test_validate_invalid_source() {
        let source = r#"orb { missing name }"#;
        assert!(!validate(source));
    }

    #[test]
    fn test_validate_empty_source() {
        let source = "";
        // Empty source should be valid (empty AST)
        assert!(validate(source));
    }

    #[test]
    fn test_validate_unbalanced_braces() {
        let source = r#"orb test { color: "red" "#;
        assert!(!validate(source));
    }

    // ===== validate_detailed() tests =====

    #[test]
    fn test_validate_detailed_valid() {
        let source = r#"orb test { color: "blue" }"#;
        let result = validate_detailed(source);
        assert!(result.contains("\"valid\": true"));
    }

    #[test]
    fn test_validate_detailed_invalid() {
        let source = r#"{{{{ invalid syntax"#;
        let result = validate_detailed(source);
        // Either valid=false or has errors
        let has_errors = result.contains("\"valid\": false") || result.contains("error");
        assert!(has_errors, "Expected validation to fail for invalid syntax: {}", result);
    }

    #[test]
    fn test_validate_detailed_error_has_location() {
        let source = "orb { }";
        let result = validate_detailed(source);
        // Should include line and column info
        assert!(result.contains("line"));
        assert!(result.contains("column"));
    }

    // ===== version() tests =====

    #[test]
    fn test_version_returns_string() {
        let v = version();
        assert!(!v.is_empty());
        // Should be semver-like
        assert!(v.contains('.'));
    }

    // ===== Complex parsing tests =====

    #[test]
    fn test_parse_nested_objects() {
        let source = r#"
            composition "Nested" {
                group "Room" {
                    orb light { color: "white" }
                    orb table {
                        @collidable
                        geometry: "cube"
                    }
                }
            }
        "#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
    }

    #[test]
    fn test_parse_state_machine() {
        let source = r#"
            state_machine "AI" {
                initialState: "idle"
                states: { "idle": { entry: "wait" } }
            }
        "#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
    }

    #[test]
    fn test_parse_template_usage() {
        let source = r#"
            composition "Demo" {
                template "Cube" { geometry: "cube" color: "red" }
                object "MyCube" using "Cube" { position: [0, 0, 0] }
            }
        "#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
    }

    #[test]
    fn test_parse_logic_block() {
        let source = r#"
            composition "Game" {
                logic {
                    on_start: { console.log("Started") }
                }
            }
        "#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
    }

    #[test]
    fn test_parse_npc_dialogue() {
        let source = r#"
            npc "Merchant" {
                @llm_agent
                personality: "friendly"
                dialogue {
                    greeting: "Welcome to my shop!"
                }
            }
        "#;
        let result = parse(source);
        assert!(!result.contains("\"error\""));
    }
}

