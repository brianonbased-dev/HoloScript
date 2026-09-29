//! Holo capability modules: `import { f } from "holo:<module>"` (gap G21; proposal
//! `proposals/Host_Capability_Imports_v1.md`).
//!
//! Each module is declared in `.hs`, in `packages/std/src/holo/<module>.hs`, and embedded here,
//! so what a `holo:` import means is part of the checker build (Spec v0.1 decision (a): `.hs`
//! means what `validate_detailed` accepts). A declaration pairs an `@host { function, authority,
//! version }` block with a typed `export function` whose body says what the call means with no
//! host. The checker reads the signature; engines bind the call to a host or refuse it.

use std::collections::HashMap;
use std::sync::OnceLock;

use crate::ast::{AstNode, FunctionNode, ObjectLiteralNode};

/// Every Holo module the checker knows: (name, declaration source). A module is one line here
/// and one `.hs` file.
const MODULES: &[(&str, &str)] = &[("absorb", include_str!("../../std/src/holo/absorb.hs"))];

/// The import source prefix that names a Holo module.
pub(crate) const HOST_SCHEME: &str = "holo:";

/// One declared capability: its typed signature and the `@host` block that governs it.
#[derive(Debug, Clone)]
pub(crate) struct HostFunction {
    pub(crate) param_types: Vec<Option<String>>,
    pub(crate) return_type: Option<String>,
    /// The authority a caller needs (the MCP tool the binding performs).
    pub(crate) authority: String,
    /// The ABI version: a call lowers to `holo.<module>.<function>.v<version>`.
    pub(crate) version: u32,
}

#[derive(Debug)]
pub(crate) struct HostModule {
    pub(crate) functions: HashMap<String, HostFunction>,
}

/// What an import source names.
pub(crate) enum HostSource<'a> {
    /// Not a `holo:` source: an ordinary (file) import.
    NotHost,
    /// A URI-style scheme other than the exact `holo:` (`HOLO:absorb`, `https://...`). No
    /// import reads it, and a case variant must not pass for a file path.
    ForeignScheme(&'a str),
    /// `holo:` followed by something that is not one lowercase name (`holo://x`, `holo:Absorb`,
    /// `holo:absorb/x`).
    Malformed,
    /// A well-formed name no embedded module has.
    Unknown(&'a str),
    /// The module, and its declarations.
    Module(&'a str, &'static HostModule),
    /// The module's declaration file is broken; the checker refuses to guess its meaning.
    Broken(&'a str, &'static str),
}

pub(crate) fn resolve_host_source(source: &str) -> HostSource<'_> {
    let Some(name) = source.strip_prefix(HOST_SCHEME) else {
        return match foreign_scheme(source) {
            Some(scheme) => HostSource::ForeignScheme(scheme),
            None => HostSource::NotHost,
        };
    };
    if !is_module_name(name) {
        return HostSource::Malformed;
    }
    match modules().get(name) {
        None => HostSource::Unknown(name),
        Some(Ok(module)) => HostSource::Module(name, module),
        Some(Err(reason)) => HostSource::Broken(name, reason.as_str()),
    }
}

/// Every embedded module as JSON, for tools (see `holo_modules_json` in lib.rs).
pub(crate) fn modules_json() -> String {
    let mut listed = Vec::new();
    for name in module_names() {
        let entry = match modules().get(name) {
            Some(Ok(module)) => {
                let mut functions: Vec<_> = module.functions.iter().collect();
                functions.sort_by(|a, b| a.0.cmp(b.0));
                serde_json::json!({
                    "module": format!("{HOST_SCHEME}{name}"),
                    "functions": functions
                        .into_iter()
                        .map(|(function, declared)| serde_json::json!({
                            "name": function,
                            "params": declared.param_types,
                            "returns": declared.return_type,
                            "authority": declared.authority,
                            "version": declared.version,
                            "abi": format!("holo.{name}.{function}.v{}", declared.version),
                        }))
                        .collect::<Vec<_>>(),
                })
            }
            Some(Err(reason)) => serde_json::json!({
                "module": format!("{HOST_SCHEME}{name}"),
                "broken": reason,
            }),
            None => continue,
        };
        listed.push(entry);
    }
    serde_json::Value::Array(listed).to_string()
}

/// The names of every embedded module, for messages.
pub(crate) fn module_names() -> Vec<&'static str> {
    let mut names: Vec<&'static str> = MODULES.iter().map(|(name, _)| *name).collect();
    names.sort_unstable();
    names
}

/// A scheme of two or more characters before `:` (`HOLO`, `https`), as URIs write it. One
/// letter is a drive (`C:/x.hs`), not a scheme.
fn foreign_scheme(source: &str) -> Option<&str> {
    let (scheme, _) = source.split_once(':')?;
    let mut chars = scheme.chars();
    let starts_with_letter = matches!(chars.next(), Some(c) if c.is_ascii_alphabetic());
    let rest_is_scheme = chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'));
    (scheme.len() >= 2 && starts_with_letter && rest_is_scheme).then_some(scheme)
}

/// `[a-z][a-z0-9_]*`: the product's name after "Holo", in lower case.
fn is_module_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some('a'..='z'))
        && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '_'))
}

fn modules() -> &'static HashMap<&'static str, Result<HostModule, String>> {
    static MODULE_TABLE: OnceLock<HashMap<&'static str, Result<HostModule, String>>> =
        OnceLock::new();
    MODULE_TABLE.get_or_init(|| {
        MODULES
            .iter()
            .map(|(name, source)| (*name, load_module(source)))
            .collect()
    })
}

/// Parse one declaration file and pair its `@host` blocks with its exported functions, one to
/// one. The pairing is by the block's `function` string, so it is checked, not assumed: a
/// block naming no exported function, an exported function with no block, or two blocks for one
/// function make the module unusable, with the reason.
pub(crate) fn load_module(source: &str) -> Result<HostModule, String> {
    let ast = crate::parse_ast(source).map_err(|errors| {
        format!(
            "the declarations do not parse: {}",
            errors
                .first()
                .map(|error| error.message.clone())
                .unwrap_or_default()
        )
    })?;
    let mut blocks: HashMap<String, (String, u32)> = HashMap::new();
    let mut functions: HashMap<String, &FunctionNode> = HashMap::new();
    for node in &ast.body {
        match node {
            AstNode::Trait(block) if block.name == "host" => {
                let (function, authority, version) = read_host_block(block.config.as_deref())?;
                if blocks.contains_key(&function) {
                    return Err(format!("two @host blocks govern `{function}`"));
                }
                blocks.insert(function, (authority, version));
            }
            AstNode::Export(export) => {
                if let AstNode::Function(function) = export.declaration.as_ref() {
                    functions.insert(function.name.clone(), function);
                }
            }
            _ => {}
        }
    }
    let mut paired = HashMap::new();
    for (name, function) in &functions {
        let Some((authority, version)) = blocks.remove(name) else {
            return Err(format!("exported function `{name}` has no @host block"));
        };
        if function.return_type.is_none()
            || function.param_types.len() != function.params.len()
            || function.param_types.iter().any(Option::is_none)
        {
            return Err(format!(
                "`{name}` must state every parameter type and its result type"
            ));
        }
        paired.insert(
            name.clone(),
            HostFunction {
                param_types: function.param_types.clone(),
                return_type: function.return_type.clone(),
                authority,
                version,
            },
        );
    }
    if let Some(orphan) = blocks.keys().next() {
        return Err(format!(
            "the @host block for `{orphan}` names no exported function"
        ));
    }
    Ok(HostModule { functions: paired })
}

fn read_host_block(config: Option<&AstNode>) -> Result<(String, String, u32), String> {
    let Some(AstNode::ObjectLiteral(ObjectLiteralNode { properties, .. })) = config else {
        return Err("an @host block needs `{ function, authority, version }`".to_string());
    };
    // A misspelled key would leave a capability governed by nothing (`authorty: ...`), so only
    // the three keys are read, and any other key refuses the module.
    if let Some(unknown) = properties
        .iter()
        .find(|property| !matches!(property.key.as_str(), "function" | "authority" | "version"))
    {
        return Err(format!(
            "an @host block has an unknown key `{}`; it takes only function, authority and version",
            unknown.key
        ));
    }
    let text = |key: &str| {
        properties
            .iter()
            .find(|property| property.key == key)
            .and_then(|property| match property.value.as_ref() {
                AstNode::String(value) if !value.value.is_empty() => Some(value.value.clone()),
                _ => None,
            })
    };
    let function = text("function").ok_or("an @host block needs a `function` name")?;
    let authority = text("authority")
        .ok_or_else(|| format!("the @host block for `{function}` needs an `authority`"))?;
    let version = properties
        .iter()
        .find(|property| property.key == "version")
        .and_then(|property| match property.value.as_ref() {
            AstNode::Number(number) if number.value >= 1.0 && number.value.fract() == 0.0 => {
                Some(number.value as u32)
            }
            _ => None,
        })
        .ok_or_else(|| {
            format!("the @host block for `{function}` needs a whole-number `version` of 1 or more")
        })?;
    Ok((function, authority, version))
}

/// The declared name closest to a misspelled one, for "did you mean" (edit distance at most 3).
pub(crate) fn closest_function(module: &HostModule, name: &str) -> Option<String> {
    module
        .functions
        .keys()
        .map(|candidate| (edit_distance(candidate, name), candidate))
        .filter(|(distance, _)| *distance <= 3)
        .min()
        .map(|(_, candidate)| candidate.clone())
}

fn edit_distance(left: &str, right: &str) -> usize {
    let right: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right.len()).collect();
    for (i, a) in left.chars().enumerate() {
        let mut current = vec![i + 1];
        for (j, b) in right.iter().enumerate() {
            let substitution = previous[j] + usize::from(a != *b);
            current.push(substitution.min(previous[j + 1] + 1).min(current[j] + 1));
        }
        previous = current;
    }
    previous[right.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_embedded_module_pairs_its_blocks_with_its_functions() {
        for (name, source) in MODULES {
            let module = load_module(source)
                .unwrap_or_else(|error| panic!("holo:{name} declarations: {error}"));
            assert!(!module.functions.is_empty(), "holo:{name} declares nothing");
            // The declaration file is itself valid `.hs`: its bodies are what a call means with
            // no host, so they must mean something.
            let verdict = crate::validate_detailed(source);
            assert!(
                verdict.contains("\"valid\": true"),
                "holo:{name}: {verdict}"
            );
        }
        let HostSource::Module(_, absorb) = resolve_host_source("holo:absorb") else {
            panic!("holo:absorb should resolve");
        };
        let audit = &absorb.functions["manifest_audit_passes"];
        assert_eq!(audit.authority, "holo_absorb_manifest");
        assert_eq!(audit.version, 1);
        assert_eq!(audit.return_type.as_deref(), Some("bool"));
        assert!(audit.param_types.is_empty());
    }

    #[test]
    fn a_broken_pairing_makes_the_module_unusable_with_the_reason() {
        let block = |function: &str| {
            format!("@host {{ function: \"{function}\", authority: \"tool\", version: 1 }}\n")
        };
        let function =
            |name: &str| format!("export function {name}(): bool {{\n  return true\n}}\n");
        for (source, reason) in [
            (function("f"), "exported function `f` has no @host block"),
            (
                format!("{}{}", block("g"), function("f")),
                "exported function `f` has no @host block",
            ),
            (
                format!("{}{}{}", block("f"), function("f"), block("g")),
                "the @host block for `g` names no exported function",
            ),
            (
                format!("{}{}{}", block("f"), block("f"), function("f")),
                "two @host blocks govern `f`",
            ),
            (
                format!(
                    "@host {{ function: \"f\", authority: \"tool\", version: 0 }}\n{}",
                    function("f")
                ),
                "needs a whole-number `version` of 1 or more",
            ),
            (
                format!(
                    "{}export function f(x): bool {{\n  return true\n}}\n",
                    block("f")
                ),
                "must state every parameter type and its result type",
            ),
            (
                format!(
                    "@host {{ function: \"f\", authorty: \"tool\", version: 1 }}\n{}",
                    function("f")
                ),
                "unknown key `authorty`",
            ),
        ] {
            let error = load_module(&source).expect_err(&source);
            assert!(error.contains(reason), "{source}\n=> {error}");
        }
    }

    #[test]
    fn a_holo_source_is_one_lowercase_name() {
        assert!(matches!(
            resolve_host_source("./math.hs"),
            HostSource::NotHost
        ));
        assert!(matches!(
            resolve_host_source("C:/lib/math.hs"),
            HostSource::NotHost
        ));
        assert!(matches!(
            resolve_host_source("HOLO:absorb"),
            HostSource::ForeignScheme("HOLO")
        ));
        assert!(matches!(
            resolve_host_source("https://example.com/x.hs"),
            HostSource::ForeignScheme("https")
        ));
        assert!(matches!(
            resolve_host_source("holo:absorb"),
            HostSource::Module(..)
        ));
        assert!(matches!(
            resolve_host_source("holo:no_such"),
            HostSource::Unknown("no_such")
        ));
        for malformed in [
            "holo:",
            "holo://assets/terrain",
            "holo:Absorb",
            "holo:absorb/x",
            "holo:9x",
        ] {
            assert!(
                matches!(resolve_host_source(malformed), HostSource::Malformed),
                "{malformed}"
            );
        }
    }

    #[test]
    fn tools_read_the_modules_as_json() {
        let listed: serde_json::Value =
            serde_json::from_str(&modules_json()).expect("modules_json is JSON");
        assert_eq!(listed[0]["module"], "holo:absorb");
        let audit = &listed[0]["functions"][0];
        assert_eq!(audit["name"], "manifest_audit_passes");
        assert_eq!(audit["authority"], "holo_absorb_manifest");
        assert_eq!(audit["abi"], "holo.absorb.manifest_audit_passes.v1");
        assert_eq!(audit["returns"], "bool");
        assert_eq!(audit["params"], serde_json::json!([]));
    }

    #[test]
    fn the_closest_declared_name_is_offered() {
        let HostSource::Module(_, absorb) = resolve_host_source("holo:absorb") else {
            panic!("holo:absorb should resolve");
        };
        assert_eq!(
            closest_function(absorb, "manifest_audit_pases").as_deref(),
            Some("manifest_audit_passes")
        );
        assert_eq!(closest_function(absorb, "something_else"), None);
    }

    /// `validate_detailed`'s verdict: None when valid, else (message, line, column).
    fn verdict(source: &str) -> Option<(String, u64, u64)> {
        verdict_json(&crate::validate_detailed(source))
    }

    fn verdict_json(json: &str) -> Option<(String, u64, u64)> {
        let value: serde_json::Value = serde_json::from_str(json).expect("verdict is JSON");
        if value["valid"].as_bool() == Some(true) {
            return None;
        }
        let error = &value["errors"][0];
        Some((
            error["message"].as_str().unwrap_or_default().to_string(),
            error["line"].as_u64().unwrap_or(0),
            error["column"].as_u64().unwrap_or(0),
        ))
    }

    const AUDIT: &str = "import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction main(): bool {\n  return manifest_audit_passes()\n}\n";

    #[test]
    fn a_declared_capability_is_valid_from_a_typed_function() {
        assert_eq!(verdict(AUDIT), None);
        // A relative import keeps G11's reading: its name is bound, unchecked.
        assert_eq!(
            verdict("import { add as combine } from \"./math.hs\"\n\nfunction main() {\n  return combine(1, 2)\n}\n"),
            None
        );
    }

    #[test]
    fn an_unknown_or_malformed_module_is_refused_where_the_import_is_written() {
        for (source, said) in [
            ("holo:no_such", "there is no Holo module `holo:no_such`; the modules this checker knows are `holo:absorb`"),
            ("holo://assets/terrain", "is not a Holo module"),
            ("holo:Absorb", "is not a Holo module"),
            ("holo:absorb/x", "is not a Holo module"),
            ("HOLO:absorb", "`HOLO:` is not a scheme it knows"),
        ] {
            let program = AUDIT.replace("holo:absorb", source);
            let (message, line, column) = verdict(&program).expect(source);
            assert!(message.contains("[HS-HOST-001]"), "{source}: {message}");
            assert!(message.contains(said), "{source}: {message}");
            assert_eq!((line, column), (1, 1), "{source}: {message}");
        }
    }

    #[test]
    fn an_unknown_function_is_refused_at_its_name_with_the_closest_declared_one() {
        let program = AUDIT.replace("{ manifest_audit_passes }", "{ manifest_audit_pases }");
        let (message, line, column) = verdict(&program).expect("refused");
        assert!(
            message.contains("[HS-HOST-002] `holo:absorb` declares no `manifest_audit_pases`"),
            "{message}"
        );
        assert!(
            message.contains("did you mean `manifest_audit_passes`?"),
            "{message}"
        );
        assert_eq!((line, column), (1, 10), "{message}");
    }

    #[test]
    fn arguments_and_results_are_checked_against_the_declaration_even_through_an_alias() {
        let wrong_count = AUDIT.replace("manifest_audit_passes()\n", "manifest_audit_passes(1)\n");
        let (message, ..) = verdict(&wrong_count).expect("refused");
        assert!(
            message.contains("[HS-ARITY-001] `manifest_audit_passes` expects 0 arguments, got 1"),
            "{message}"
        );

        let aliased = "import { manifest_audit_passes as audit } from \"holo:absorb\"\n\nfunction main(): bool {\n  return audit(1, 2)\n}\n";
        let (message, ..) = verdict(aliased).expect("refused");
        assert!(
            message.contains("[HS-ARITY-001] `audit` expects 0 arguments, got 2"),
            "{message}"
        );

        let wrong_type = "import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction main(): i32 {\n  let n: i32 = manifest_audit_passes()\n  return n\n}\n";
        let (message, ..) = verdict(wrong_type).expect("refused");
        assert!(message.contains("HS-TYPE-ASSIGN-001"), "{message}");
    }

    #[test]
    fn a_capability_is_called_only_from_a_function_that_states_its_types() {
        let untyped = "import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction check() {\n  return manifest_audit_passes()\n}\n";
        let (message, line, column) = verdict(untyped).expect("refused");
        assert!(message.contains("[HS-HOST-003] function `check` uses `holo:absorb/manifest_audit_passes` but states no types"), "{message}");
        assert_eq!((line, column), (4, 10), "{message}");
    }

    #[test]
    fn a_file_may_not_define_the_capability_it_imports() {
        // Every engine resolves an import by name: a local stub would stand in for HoloAbsorb
        // (premortem 2026-09-29: the UAAL VM printed the demo's `true` with no audit call).
        for stub in [
            "export function manifest_audit_passes(): bool {\n  return true\n}\n",
            "function manifest_audit_passes(): bool {\n  return true\n}\n",
        ] {
            let program = format!("{AUDIT}\n{stub}");
            let (message, ..) = verdict(&program).expect("refused");
            assert!(
                message.contains(
                    "[HS-SCOPE-001] `manifest_audit_passes` is imported from a Holo module"
                ),
                "{message}"
            );
            assert!(
                message.contains("cannot be defined in the file that imports it"),
                "{message}"
            );
            let engine = crate::uaal_emit::compile_source_to_uaal(&program)
                .expect_err("UAAL refuses it too");
            assert!(
                engine.message.contains("HS-SCOPE-001"),
                "{}",
                engine.message
            );
        }
    }

    #[test]
    fn engines_refuse_a_capability_by_name_until_they_bind_it() {
        // Valid to the checker; no engine binds it yet (phase 2), and each says so by name
        // instead of reporting a file it cannot find.
        let uaal =
            crate::uaal_emit::compile_source_to_uaal(AUDIT).expect_err("UAAL has no binding yet");
        assert!(
            uaal.message.contains(
                "[HS-HOST-004] `holo:absorb/manifest_audit_passes` has no binding on UAAL yet"
            ),
            "{}",
            uaal.message
        );
        assert!(
            uaal.message
                .contains("EXEC `holo.absorb.manifest_audit_passes.v1`"),
            "{}",
            uaal.message
        );
        let kotlin = crate::kotlin_emit::compile_source_to_kotlin(AUDIT, "")
            .expect_err("the Kotlin bridge has no binding yet");
        assert!(
            kotlin.message.contains("[HS-HOST-004] `holo:absorb/manifest_audit_passes` has no binding on the Kotlin (Quest) bridge yet"),
            "{}",
            kotlin.message
        );
    }

    #[test]
    fn a_fragment_resolves_its_documents_holo_imports_from_the_context() {
        let context = |imported: &str| {
            format!(
                "{{\"imports\":[{{\"source\":\"holo:absorb\",\"specifiers\":[{{\"imported\":\"{imported}\",\"local\":\"audit\"}}]}}]}}"
            )
        };
        let fragment = "function main(): bool {\n  return audit()\n}\n";
        assert_eq!(
            verdict_json(&crate::validate_detailed_in_context(
                fragment,
                &context("manifest_audit_passes")
            )),
            None
        );
        let (message, ..) = verdict_json(&crate::validate_detailed_in_context(
            fragment,
            &context("manifest_audit_pases"),
        ))
        .expect("refused");
        assert!(message.contains("[HS-HOST-002]"), "{message}");
        let (message, ..) = verdict_json(&crate::validate_detailed_in_context(
            "function main(): bool {\n  return audit(1)\n}\n",
            &context("manifest_audit_passes"),
        ))
        .expect("refused");
        assert!(
            message.contains("[HS-ARITY-001] `audit` expects 0 arguments, got 1"),
            "{message}"
        );
    }
}
