//! HoloScript WASM Compiler — `.hs` subset parser
//!
//! High-performance parser for the **structural `.hs` dialect** of HoloScript,
//! compiled to WebAssembly.  This is a *subset* parser — it covers the
//! object-graph surface but not the full HoloScript grammar:
//!
//! **Supported**: `composition`, `world`, `orb`, `entity`, `object`, `template`,
//! `group`, `environment`, `logic`, `npc`, `quest`, `ability`, `dialogue`,
//! `state_machine`, `achievement`, `talent_tree`, `import`, `export`, `function`,
//! `move`, `action`, `on_*` event blocks, and the standard expression grammar
//! (binary ops, lambda expressions, call expressions, member access, arrays, object literals).
//!
//! **Not supported** (use `HoloScriptPlusParser` / `HoloCompositionParser` in TS):
//! - `.hsplus` constructs: `brain` declarations, cognitive actions (`@llm_call`,
//!   `@recall`, `@rag_query`, `@plan`, `@reflect`), pipelines, `hs_connect`,
//!   `hs_execute`, `@safe_daemon`, `@goal`, `@escalation`, `@provider_policy`,
//!   React blocks.
//! - `HoloCompositionParser` constructs: spatial groups, lights, audio, camera,
//!   timelines, themes, scenes, spawn groups, waypoints, constraints, terrain,
//!   loot tables, world chunks, game triggers, movement paths, reaction triggers,
//!   world layers, dungeon instances, world shards, domain blocks, norm / metanorm
//!   / contract / topic / channel blocks, connection statements, shape declarations,
//!   platform constraints.
//! - `HoloScriptCodeParser` features: TypeScript companion code, expression
//!   interpolation, incremental parsing.
//!
//! On the canonical fixtures (research/2026-04-19_todo-r2-wasm-bench-results.md),
//! the WASM parser is currently SLOWER than the JS parser due to
//! JS↔linear-memory string marshalling overhead. Native Rust (no
//! WASM boundary) is ~1.3-1.4x faster than JS. Use WASM only when
//! the V8 JIT is not available (mobile WebViews, edge workers, sandboxed
//! runtimes). The `WasmParserBridge` falls back to `HoloScriptPlusParser`
//! (full-grammar TS parser) automatically when WASM is unavailable.

mod ast;
mod kotlin_emit;
mod lexer;
mod parser;
mod token;
pub mod types;
mod uaal_emit;

use wasm_bindgen::prelude::*;

/// Native-only re-export of the parser entry point for the
/// `parser_bench` binary. NOT exported to WASM — `__bench_parse`
/// stays out of the JS surface so it can't be called from the browser.
///
/// Returns `Ok(())` on success, `Err(usize)` with the error count on
/// failure. We discard the AST and the error details so the benchmark
/// measures pure parser throughput, not serialization.
#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn __bench_parse(source: &str) -> Result<(), usize> {
    match parser::Parser::new(source).parse() {
        Ok(_ast) => Ok(()),
        Err(errs) => Err(errs.len()),
    }
}

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
        Ok(ast) => serde_json::to_string(&ast)
            .unwrap_or_else(|e| format!(r#"{{"error": "Serialization error: {}"}}"#, e)),
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
        Ok(ast) => serde_json::to_string_pretty(&ast)
            .unwrap_or_else(|e| format!(r#"{{"error": "Serialization error: {}"}}"#, e)),
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
        Ok(ast) => match kotlin_emit::check_semantics(&ast) {
            Ok(()) => r#"{"valid": true, "errors": []}"#.to_string(),
            Err(error) => serde_json::to_string(&serde_json::json!({
                "valid": false,
                "errors": [{
                    "message": error.message,
                    "line": error.line,
                    "column": error.column,
                }]
            }))
            .unwrap_or_else(|_| r#"{"valid": false, "errors": []}"#.to_string()),
        },
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

/// Compile the top-level `function`s in a `.hs` source string to Kotlin.
///
/// This is the first target-language backend in the crate: it parses `source` with the
/// canonical `.hs` grammar (the only parser that produces a real logic AST — the TS
/// parser keeps function bodies as raw strings) and emits Kotlin function declarations
/// for the `compile_to_quest` target.
///
/// # Arguments
/// * `source` - `.hs` source containing one or more top-level `function` declarations.
/// * `indent` - leading indentation applied to each emitted function (e.g. `"  "` when
///   the functions are nested inside a Kotlin `object`).
///
/// # Returns
/// The emitted Kotlin on success, or a JSON error object `{"error": "..."}` on a parse
/// or emit failure — same convention as [`parse`], so the TS bridge can branch on it.
#[wasm_bindgen]
pub fn compile_to_kotlin(source: &str, indent: &str) -> String {
    match kotlin_emit::compile_source_to_kotlin(source, indent) {
        Ok(kotlin) => kotlin,
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e.message }))
            .unwrap_or_else(|_| r#"{"error": "Unknown emit error"}"#.to_string()),
    }
}

/// Native-only re-export of the Kotlin emitter for tests and the `parser_bench`-style
/// tooling. NOT exported to WASM.
#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn __compile_to_kotlin(source: &str, indent: &str) -> Result<String, String> {
    kotlin_emit::compile_source_to_kotlin(source, indent).map_err(|e| e.message)
}

/// Compile top-level `.hs` functions to a UAAL bytecode packet.
///
/// This mirrors [`compile_to_kotlin`]'s JSON boundary but targets the stack-based
/// UAAL VM: success returns `{"version":1,"instructions":[...]}`, failure returns
/// `{"error":"..."}`.
#[wasm_bindgen]
pub fn compile_to_uaal(source: &str) -> String {
    match uaal_emit::compile_source_to_uaal(source) {
        Ok(bytecode) => serde_json::to_string(&bytecode)
            .unwrap_or_else(|e| format!(r#"{{"error": "Serialization error: {}"}}"#, e)),
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e.message }))
            .unwrap_or_else(|_| r#"{"error": "Unknown UAAL emit error"}"#.to_string()),
    }
}

/// Native-only re-export of the UAAL emitter for tests and local validation.
#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn __compile_to_uaal(source: &str) -> Result<String, String> {
    uaal_emit::compile_source_to_uaal_json(source).map_err(|e| e.message)
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

    #[test]
    fn test_validate_unclosed_brace_eof() {
        // consume_braced_body_raw must return Err when depth > 0 at EOF
        let source = r#"orb test { name: "x""#; // missing closing }
        assert!(!validate(source));
        let detail = validate_detailed(source);
        assert!(
            detail.contains("\"valid\":false"),
            "expected valid:false got: {detail}"
        );
    }

    #[test]
    fn test_validate_nested_unclosed_brace() {
        let source = r#"orb test { props: { x: 1 }"#; // outer brace unclosed
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
    fn test_validate_detailed_rejects_immutable_reassignment() {
        let source = r#"function f() {
  let x = 1
  x = x + 1
  return x
}"#;
        let result = validate_detailed(source);
        assert!(result.contains("\"valid\":false"), "{result}");
        assert!(
            result.contains("cannot assign to immutable binding `x`"),
            "{result}"
        );
    }

    #[test]
    fn test_validate_detailed_invalid() {
        let source = r#"{{{{ invalid syntax"#;
        let result = validate_detailed(source);
        // Either valid=false or has errors
        let has_errors = result.contains("\"valid\": false") || result.contains("error");
        assert!(
            has_errors,
            "Expected validation to fail for invalid syntax: {}",
            result
        );
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
