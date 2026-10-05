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

/// The value types capability ABI v1 passes between a program and its host, by value on the
/// stack (proposal §Execution). A record, buffer or string needs a later ABI version.
const ABI_V1_TYPES: &[&str] = &["i32", "f32", "f64", "bool"];

/// The CRDT stream the `.hsplus` import resolver reads (`isCrdtImport` in ImportResolver.ts). It
/// is not a Holo module and not a file, and the checker reads it as G11 did.
const CRDT_SCHEME: &str = "crdt://";

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
    /// Not a `holo:` source: an ordinary (file) import, or the `crdt://` stream the `.hsplus`
    /// import resolver reads.
    NotHost,
    /// A source with a space before or after it, or a character outside ASCII (`" holo:absorb"`,
    /// a fullwidth `ｈolo:absorb`, a Cyrillic `а`). Native trims sources, and a lookalike would
    /// otherwise pass as an unchecked file import, so no reader takes it.
    Unreadable,
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
    if source.trim() != source || !source.is_ascii() {
        return HostSource::Unreadable;
    }
    let Some(name) = source.strip_prefix(HOST_SCHEME) else {
        if source.starts_with(CRDT_SCHEME) {
            return HostSource::NotHost;
        }
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

/// `[a-z_][a-z0-9_]*`: a declared capability's name, as its ABI name spells it.
fn is_function_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some('a'..='z' | '_'))
        && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '_'))
}

fn modules() -> &'static HashMap<&'static str, Result<HostModule, String>> {
    static MODULE_TABLE: OnceLock<HashMap<&'static str, Result<HostModule, String>>> =
        OnceLock::new();
    MODULE_TABLE.get_or_init(|| {
        let sources = MODULES.iter();
        #[cfg(test)]
        let sources = sources.chain(TEST_MODULES.iter());
        sources
            .map(|(name, source)| (*name, load_module(source)))
            .collect()
    })
}

/// A module only tests can import: capabilities with parameters, two parameter types and a
/// version above 1, which `holo:absorb` does not have. Not listed by `module_names` or
/// `holo_modules_json`.
#[cfg(test)]
const TEST_MODULES: &[(&str, &str)] = &[(
    "fixture",
    "@host { function: \"add_one\", authority: \"test_fixture\", version: 2 }\nexport function add_one(x: i32): i32 {\n  return unknown(\"holo:fixture/add_one needs a host\")\n}\n\n@host { function: \"scale\", authority: \"test_fixture\", version: 1 }\nexport function scale(x: f32, factor: i32): f32 {\n  return unknown(\"holo:fixture/scale needs a host\")\n}\n",
)];

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
        // Every engine passes a call's values on the stack, one result back; a type the ABI does
        // not carry would let the checker accept a call no engine can make.
        if let Some(uncarried) = function
            .param_types
            .iter()
            .chain(std::iter::once(&function.return_type))
            .flatten()
            .find(|annotation| !ABI_V1_TYPES.contains(&annotation.trim()))
        {
            return Err(format!(
                "`{name}` passes `{uncarried}` to or from its host; capability ABI v1 carries only {}",
                ABI_V1_TYPES.join(", ")
            ));
        }
        // The name is part of the ABI name a call lowers to, `holo.<module>.<name>.v<N>`, which
        // hosts match byte for byte: one spelling, in lower-case ASCII.
        if !is_function_name(name) {
            return Err(format!(
                "`{name}` is not a capability name: write lower-case ASCII letters, digits and `_`, starting with a letter or `_`"
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
            AstNode::Number(number)
                if number.value >= 1.0
                    && number.value <= f64::from(u32::MAX)
                    && number.value.fract() == 0.0 =>
            {
                Some(number.value as u32)
            }
            _ => None,
        })
        .ok_or_else(|| {
            format!(
                "the @host block for `{function}` needs a whole-number `version` from 1 to {}",
                u32::MAX
            )
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
                "needs a whole-number `version` from 1 to 4294967295",
            ),
            (
                format!(
                    "{}export function f(x): bool {{\n  return true\n}}\n",
                    block("f")
                ),
                "must state every parameter type and its result type",
            ),
            (
                format!("{}export function f() {{\n  return true\n}}\n", block("f")),
                "must state every parameter type and its result type",
            ),
            (
                format!(
                    "{}export function f(path: string): bool {{\n  return true\n}}\n",
                    block("f")
                ),
                "`f` passes `string` to or from its host; capability ABI v1 carries only i32, f32, f64, bool",
            ),
            (
                format!(
                    "struct Report {{\n  passed: bool\n}}\n{}export function f(): Report {{\n  return unknown(\"needs a host\")\n}}\n",
                    block("f")
                ),
                "`f` passes `Report` to or from its host",
            ),
            (
                format!(
                    "@host {{ function: \"f\", authorty: \"tool\", version: 1 }}\n{}",
                    function("f")
                ),
                "unknown key `authorty`",
            ),
            // A version is a u32 in the ABI name; a larger one used to load as 4294967295.
            (
                format!(
                    "@host {{ function: \"f\", authority: \"tool\", version: 4294967296 }}\n{}",
                    function("f")
                ),
                "needs a whole-number `version` from 1 to 4294967295",
            ),
            (
                format!(
                    "@host {{ function: \"f\", authority: \"tool\", version: 4000000000000 }}\n{}",
                    function("f")
                ),
                "needs a whole-number `version` from 1 to 4294967295",
            ),
            // The name is spelled into the ABI name: one lower-case ASCII spelling.
            (
                format!("{}{}", block("función"), function("función")),
                "`función` is not a capability name",
            ),
            (
                format!("{}{}", block("Audit"), function("Audit")),
                "`Audit` is not a capability name",
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
        // The stream the .hsplus import resolver reads stays what G11 made it: names, unchecked.
        assert!(matches!(
            resolve_host_source("crdt://holomesh/feed"),
            HostSource::NotHost
        ));
        // A space around a source, or any character outside ASCII, is read by no reader: native
        // trims it, and a lookalike would pass as an unchecked file import.
        for unreadable in [
            " holo:absorb",
            "holo:absorb ",
            "holo:absorb\t",
            "\u{ff48}olo:absorb",
            "holo:\u{0430}bsorb",
            "holo:absorb\u{200b}",
            "./donn\u{e9}es.hs",
        ] {
            assert!(
                matches!(resolve_host_source(unreadable), HostSource::Unreadable),
                "{unreadable:?}"
            );
        }
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
        // The test module `holo:fixture` is not part of any build tools read.
        assert_eq!(listed.as_array().map(Vec::len), Some(1), "{listed}");
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

        // The declaration is bound to the name the file uses, so an alias's result is checked.
        let aliased_type = "import { manifest_audit_passes as audit } from \"holo:absorb\"\n\nfunction main(): i32 {\n  let n: i32 = audit()\n  return n\n}\n";
        let (message, ..) = verdict(aliased_type).expect("refused");
        assert!(
            message.contains("[HS-TYPE-ASSIGN-001] initializer type mismatch for binding `n`: expected `i32`, found `bool`"),
            "{message}"
        );
    }

    #[test]
    fn a_capability_is_called_only_from_a_function_that_states_its_types() {
        let untyped = "import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction check() {\n  return manifest_audit_passes()\n}\n";
        let (message, line, column) = verdict(untyped).expect("refused");
        assert!(message.contains("[HS-HOST-003] function `check` uses `holo:absorb/manifest_audit_passes` but states no types"), "{message}");
        assert_eq!((line, column), (4, 10), "{message}");

        // Through an alias, and as a value, the same: the check follows the name the file uses.
        for (source, at) in [
            ("import { manifest_audit_passes as audit } from \"holo:absorb\"\n\nfunction check() {\n  return audit()\n}\n", (4, 10)),
            ("import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction check() {\n  let f = manifest_audit_passes\n  return f()\n}\n", (4, 11)),
        ] {
            let (message, line, column) = verdict(source).expect(source);
            assert!(message.contains("[HS-HOST-003] function `check` uses `holo:absorb/manifest_audit_passes` but states no types"), "{message}");
            assert_eq!((line, column), at, "{message}");
        }

        // Until 2026-10-05 this case was valid on purpose ("a local of the same name is the
        // local"). It flips on purpose: a Holo import's name means the capability in the whole
        // file, because UAAL resolved the call to the import while the checker resolved it to
        // the local (claude3's #487 review, P1-1), so the local itself is now refused.
        let (message, line, column) = verdict("import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction check() {\n  let manifest_audit_passes = 1\n  return manifest_audit_passes\n}\n").expect("refused");
        assert!(message.contains("[HS-SCOPE-001] function `check` binds `manifest_audit_passes` as a local, but `manifest_audit_passes` is the Holo import `holo:absorb/manifest_audit_passes` (line 1, column 10)"), "{message}");
        assert_eq!((line, column), (4, 3), "{message}");
    }

    #[test]
    fn a_capability_is_called_by_name_never_passed_on_as_a_value() {
        // As a value it could reach code that calls it with nothing checked: here an untyped
        // function calling it with three arguments, or a parameter that expects a `bool`.
        for (source, at) in [
            ("import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction main(): bool {\n  let f = manifest_audit_passes\n  return run(f)\n}\n\nfunction run(g) {\n  return g(1, 2, 3)\n}\n", (4, 11)),
            ("import { manifest_audit_passes } from \"holo:absorb\"\n\nfunction main(): bool {\n  return keep(manifest_audit_passes)\n}\n\nfunction keep(x: bool): bool {\n  return x\n}\n", (4, 15)),
            ("import { manifest_audit_passes as audit } from \"holo:absorb\"\n\nfunction main(): bool {\n  let f = audit\n  return true\n}\n", (4, 11)),
        ] {
            let (message, line, column) = verdict(source).expect(source);
            assert!(
                message.contains("[HS-HOST-003] function `main` uses `holo:absorb/manifest_audit_passes` as a value; a Holo capability is only called by name"),
                "{message}"
            );
            assert_eq!((line, column), at, "{message}");
        }
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

    /// The EXEC instructions of a compiled program, as (abi, argc).
    fn exec_calls(source: &str) -> Vec<(String, u64)> {
        let bytecode = crate::uaal_emit::compile_source_to_uaal(source).expect("compiles");
        bytecode
            .instructions
            .iter()
            .filter(|instruction| instruction.op_code == 0x20)
            .map(|instruction| {
                (
                    instruction.operands[0].as_str().unwrap_or_default().to_string(),
                    instruction.operands[1].as_u64().unwrap_or(u64::MAX),
                )
            })
            .collect()
    }

    #[test]
    fn uaal_lowers_a_capability_call_to_its_arguments_and_one_exec() {
        // G21 phase 2: the call becomes `EXEC [abi, argc]`; the ABI is the declared name and
        // version, never the local alias.
        assert_eq!(
            exec_calls(AUDIT),
            vec![("holo.absorb.manifest_audit_passes.v1".to_string(), 0)]
        );
        let aliased = "import { add_one as inc } from \"holo:fixture\"\n\nfunction main(): i32 {\n  return inc(41)\n}\n";
        assert_eq!(exec_calls(aliased), vec![("holo.fixture.add_one.v2".to_string(), 1)]);

        // Arguments go first, left to right, each at its declared type, then the EXEC; the
        // handler pops them and pushes the result. UAAL numbers are JSON numbers (a JS number on
        // the VM), so an `f32` argument is the literal rounded to `f32`.
        let scaled = "import { scale } from \"holo:fixture\"\n\nfunction main(): f32 {\n  return scale(0.1, 3)\n}\n";
        assert_eq!(exec_calls(scaled), vec![("holo.fixture.scale.v1".to_string(), 2)]);
        let bytecode = crate::uaal_emit::compile_source_to_uaal(scaled).expect("compiles");
        let exec = bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == 0x20)
            .expect("an EXEC");
        let pushed: Vec<_> = bytecode.instructions[exec - 2..exec]
            .iter()
            .map(|instruction| (instruction.op_code, instruction.operands[0].as_f64()))
            .collect();
        assert_eq!(
            pushed,
            vec![(0x01, Some(f64::from(0.1_f32))), (0x01, Some(3.0))],
            "PUSH x as f32, then PUSH factor, then the EXEC"
        );

        // A capability called as a statement has its one result popped.
        let statement = "import { add_one } from \"holo:fixture\"\n\nfunction main(): i32 {\n  add_one(1)\n  return 0\n}\n";
        let bytecode = crate::uaal_emit::compile_source_to_uaal(statement).expect("compiles");
        let exec = bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == 0x20)
            .expect("an EXEC");
        assert_eq!(bytecode.instructions[exec + 1].op_code, 0x02, "POP after the EXEC");

        // Its declared result type is known: an i32 capability result is i32 arithmetic.
        let arithmetic = "import { add_one } from \"holo:fixture\"\n\nfunction main(): i32 {\n  return add_one(1) + 2\n}\n";
        assert_eq!(
            exec_calls(arithmetic),
            vec![
                ("holo.fixture.add_one.v2".to_string(), 1),
                ("hs.i32.binary.v1".to_string(), u64::MAX),
            ]
        );
    }

    #[test]
    fn engines_without_a_binding_refuse_a_capability_by_name() {
        // Valid to the checker. UAAL compiles it (phase 2) and the host refuses an unbound EXEC
        // at run time; the Kotlin bridge has no binding and says so by name instead of reporting
        // a file it cannot find.
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

    /// The verdict, which must be a refusal with `code`.
    fn refused_with(source: &str, code: &str) -> (String, u64, u64) {
        let (message, line, column) =
            verdict(source).unwrap_or_else(|| panic!("valid, expected {code}:\n{source}"));
        assert!(
            message.contains(&format!("[{code}]")),
            "expected {code}:\n{source}\n=> {message}"
        );
        (message, line, column)
    }

    const ABSORB: &str = "import { manifest_audit_passes } from \"holo:absorb\"\n\n";
    const FIXTURE: &str = "import { add_one, scale } from \"holo:fixture\"\n\n";

    #[test]
    fn every_way_a_capability_escaped_its_check_is_refused() {
        // claude3's #466 review, P1: each form was valid while a direct call in the same
        // function was refused, so a capability ran with nothing checked. One case per form,
        // with the place the message names and the position of the use.
        let untyped =
            "function `check` uses `holo:absorb/manifest_audit_passes` but states no types";
        let value = "function `main` uses `holo:absorb/manifest_audit_passes` as a value";
        let outside = |place: &str| {
            format!("`holo:absorb/manifest_audit_passes` is used in {place}, which is not a top-level function")
        };
        for (form, rest, said, at) in [
            (
                "a lambda's body in an untyped function",
                "function check() {\n  let g = x => manifest_audit_passes(1, 2, 3)\n  return g(0)\n}\n",
                untyped.to_string(),
                (4, 16),
            ),
            (
                "a lambda with the declared count",
                "function check() {\n  let g = x => manifest_audit_passes()\n  return g(0)\n}\n",
                untyped.to_string(),
                (4, 16),
            ),
            (
                "a lambda returned from an untyped function",
                "function check() {\n  return x => manifest_audit_passes(7)\n}\n",
                untyped.to_string(),
                (4, 15),
            ),
            (
                "a member call's callee, untyped",
                "function check() {\n  return manifest_audit_passes.call(1, 2)\n}\n",
                untyped.to_string(),
                (4, 10),
            ),
            (
                "a member call's callee, typed",
                "function main(): bool {\n  return manifest_audit_passes.call(1, 2)\n}\n",
                value.to_string(),
                (4, 10),
            ),
            (
                "an array statement",
                "function check() {\n  [manifest_audit_passes(1, 2)]\n  return 0\n}\n",
                untyped.to_string(),
                (4, 4),
            ),
            (
                "an object statement",
                "function check() {\n  ({ a: manifest_audit_passes(9) })\n  return 0\n}\n",
                untyped.to_string(),
                (4, 9),
            ),
            (
                "a for-in range",
                "function check() {\n  for (x in manifest_audit_passes(4)) {\n    print(x)\n  }\n  return 0\n}\n",
                untyped.to_string(),
                (4, 13),
            ),
            (
                "an object's onClick body",
                "object Lamp {\n  onClick: {\n    manifest_audit_passes(1, 2)\n  }\n}\n\nfunction main(): bool {\n  return true\n}\n",
                outside("handler `onClick`"),
                (5, 5),
            ),
            (
                "an @trait handler",
                "@trait t {\n  @on_check(x) => {\n    return manifest_audit_passes(1, 2, 3)\n  }\n}\n\nfunction main(): bool {\n  return true\n}\n",
                outside("`on_check` block"),
                (5, 12),
            ),
            (
                "a trait config",
                "@audit_on_load { check: manifest_audit_passes(1, 2, 3) }\n\nfunction main(): bool {\n  return true\n}\n",
                outside("trait `@audit_on_load`"),
                (3, 25),
            ),
            (
                "an `on` block inside a typed function",
                "function main(): bool {\n  on_tick {\n    manifest_audit_passes()\n  }\n  return true\n}\n",
                outside("`on_tick` block"),
                (5, 5),
            ),
            (
                "an action's clause, kept as text",
                "function main(): bool {\n  action pick(item) {\n    effect { manifest_audit_passes() }\n  }\n  return true\n}\n",
                outside("action `pick`"),
                (4, 3),
            ),
            (
                "a `move` target",
                "function main(): bool {\n  move manifest_audit_passes to home\n  return true\n}\n",
                value.to_string(),
                (4, 3),
            ),
        ] {
            let (message, line, column) = refused_with(&format!("{ABSORB}{rest}"), "HS-HOST-003");
            assert!(message.contains(&said), "{form}: {message}");
            assert_eq!((line, column), at, "{form}: {message}");
        }
    }

    #[test]
    fn a_call_in_a_typed_functions_lambda_is_checked_there() {
        // The type checker reads a lambda's body in a typed function, so the call is checked,
        // not refused: the right count is valid and a wrong one is an arity error.
        assert_eq!(
            verdict(&format!("{ABSORB}function main(): bool {{\n  let g = x => manifest_audit_passes()\n  return true\n}}\n")),
            None
        );
        let (message, ..) = refused_with(
            &format!("{ABSORB}function main(): bool {{\n  let g = x => manifest_audit_passes(1, 2, 3)\n  return true\n}}\n"),
            "HS-ARITY-001",
        );
        assert!(message.contains("expects 0 arguments, got 3"), "{message}");
    }

    #[test]
    fn a_holo_import_name_cannot_be_rebound_anywhere_in_the_file() {
        // Decision 2026-10-05 (claude3's #487 review, P1-1): UAAL resolved a called name to the
        // import first and the checker to a local first, so `function check(cap) { return cap() }`
        // was valid and compiled to a capability call. The name now means the capability in the
        // whole file, and every binding that would take it is refused, typed function or not.
        let at_import =
            "is the Holo import `holo:absorb/manifest_audit_passes` (line 1, column 10)";
        for (rest, owner, what, at) in [
            ("function check(manifest_audit_passes) {\n  return manifest_audit_passes()\n}\n", "function `check`", "parameter", (3, 16)),
            ("function main(manifest_audit_passes: i32): bool {\n  return manifest_audit_passes()\n}\n", "function `main`", "parameter", (3, 15)),
            ("function main(manifest_audit_passes: bool): bool {\n  return manifest_audit_passes\n}\n", "function `main`", "parameter", (3, 15)),
            ("function check() {\n  let manifest_audit_passes = 5\n  return manifest_audit_passes()\n}\n", "function `check`", "local", (4, 3)),
            ("function main(): bool {\n  let manifest_audit_passes = true\n  return manifest_audit_passes\n}\n", "function `main`", "local", (4, 3)),
            ("function main(): bool {\n  let manifest_audit_passes: i32 = 3\n  return manifest_audit_passes()\n}\n", "function `main`", "local", (4, 3)),
            ("function check() {\n  for (manifest_audit_passes in 0..3) {\n    print(1)\n  }\n  return 0\n}\n", "function `check`", "loop variable", (4, 3)),
            ("function check() {\n  let g = manifest_audit_passes => 1\n  return g(0)\n}\n", "function `check`", "lambda parameter", (4, 11)),
            ("function main(): bool {\n  let g = manifest_audit_passes => 1\n  return true\n}\n", "function `main`", "lambda parameter", (4, 11)),
            ("function main(): bool {\n  on_cast(manifest_audit_passes) {\n    print(1)\n  }\n  return true\n}\n", "`on_cast` block", "parameter", (4, 3)),
        ] {
            let (message, line, column) = refused_with(&format!("{ABSORB}{rest}"), "HS-SCOPE-001");
            assert!(
                message.contains(&format!("{owner} binds `manifest_audit_passes` as a {what}, but `manifest_audit_passes` {at_import}")),
                "{rest}\n=> {message}"
            );
            assert_eq!((line, column), at, "{rest}\n=> {message}");
        }
        // A slot, and an alias: the name the file uses is the one that may not be rebound.
        let (message, line, column) = refused_with(
            &format!("struct R {{\n  a: i32\n}}\n\n{ABSORB}function main(): bool {{\n  slot manifest_audit_passes: R = R(1)\n  return true\n}}\n"),
            "HS-SCOPE-001",
        );
        assert!(message.contains("as a local"), "{message}");
        assert_eq!((line, column), (8, 3), "{message}");
        let (message, line, column) = refused_with(
            "import { manifest_audit_passes as audit } from \"holo:absorb\"\n\nfunction check(audit) {\n  return audit()\n}\n",
            "HS-SCOPE-001",
        );
        assert!(message.contains("function `check` binds `audit` as a parameter, but `audit` is the Holo import `holo:absorb/manifest_audit_passes`"), "{message}");
        assert_eq!((line, column), (3, 16), "{message}");
    }

    #[test]
    fn a_stand_in_is_refused_where_it_is_declared() {
        // claude3's fault F5 moved this refusal onto the import and every test still passed.
        for (stub, at) in [
            (
                "function manifest_audit_passes(): bool {\n  return true\n}\n",
                (7, 1),
            ),
            (
                "export function manifest_audit_passes(): bool {\n  return true\n}\n",
                (7, 8),
            ),
        ] {
            let (message, line, column) = refused_with(&format!("{AUDIT}\n{stub}"), "HS-SCOPE-001");
            assert!(
                message.contains("is imported from a Holo module (line 1, column 10) and also declared as a function"),
                "{message}"
            );
            assert_eq!((line, column), at, "{message}");
        }
    }

    #[test]
    fn a_name_imported_twice_is_refused_at_the_second_import() {
        let (message, line, column) = refused_with(&format!("{ABSORB}{AUDIT}"), "HS-SCOPE-001");
        assert!(
            message.contains("`manifest_audit_passes` is imported twice, at line 1, column 10 and at line 3, column 10; a file imports each name once"),
            "{message}"
        );
        assert_eq!((line, column), (3, 10), "{message}");
    }

    #[test]
    fn an_import_may_not_take_a_built_in_name() {
        // Decision 2026-10-05 (claude3's #466 alias P2 and #487 P2-2): an engine reads a call to a
        // built-in's name as the built-in (`load(r.count)` is a field read), so a capability
        // under that name would be checked as one thing and run as another. (`move` is a keyword:
        // the parser refuses it as a name before the checker runs.)
        for name in [
            "load",
            "store",
            "drop",
            "buffer",
            "known",
            "unknown",
            "isKnown",
            "unknownReason",
            "slice_length",
            "u8_to_i32",
            "i32_to_u8",
            "abs",
            "floor",
            "max",
            "min",
            "pow",
            "sqrt",
        ] {
            let source = format!(
                "import {{ add_one as {name} }} from \"holo:fixture\"\n\nfunction main(): i32 {{\n  return 1\n}}\n"
            );
            let (message, line, column) = refused_with(&source, "HS-SCOPE-001");
            assert!(
                message.contains(&format!("the Holo import `holo:fixture/add_one` takes the name `{name}`, which is a built-in")),
                "{name}: {message}"
            );
            assert_eq!((line, column), (1, 10), "{name}: {message}");
        }
    }

    #[test]
    fn capability_arguments_must_be_proven_of_their_declared_types() {
        // Decision 2026-10-05 (claude3's #487 review, P1-2): an ordinary call accepts an argument
        // the checker cannot type; a capability call does not, because its host receives exactly
        // the declared types. Each case passed a string, a record or an f64 to `add_one(x: i32)`.
        for (rest, found) in [
            ("function helper() {\n  return \"rm -rf /\"\n}\n\nfunction main(): i32 {\n  return add_one(helper())\n}\n", "unknown"),
            ("struct P {\n  a: i32\n}\n\nfunction main(): i32 {\n  return add_one(P(1))\n}\n", "unknown"),
            ("function relay(v: any): i32 {\n  return add_one(v)\n}\n\nfunction main(): i32 {\n  return relay(1)\n}\n", "any"),
            ("function relay(v: unknown): i32 {\n  return add_one(v)\n}\n\nfunction main(): i32 {\n  return relay(1)\n}\n", "unknown"),
            ("function helper() {\n  return \"x\"\n}\n\nfunction main(): i32 {\n  let v = helper()\n  return add_one(v)\n}\n", "unknown"),
            ("struct R {\n  v: f64\n}\n\nfunction main(): i32 {\n  slot r: R = R(2.5)\n  return add_one(load(r.v))\n}\n", "unknown"),
            ("struct R {\n  v: i32\n}\n\nfunction main(): i32 {\n  slot r: R = R(2)\n  return add_one(&r)\n}\n", "unknown"),
            ("function relay(v) {\n  return 1\n}\n\nfunction main(): i32 {\n  return add_one(relay(2))\n}\n", "unknown"),
        ] {
            let (message, ..) = refused_with(&format!("{FIXTURE}{rest}"), "HS-TYPE-ARG-001");
            assert!(
                message.contains(&format!("argument 1 to `add_one` is not proven `i32` (found `{found}`): `holo:fixture/add_one` is a Holo capability")),
                "{rest}\n=> {message}"
            );
        }
        // A type the checker knows and that differs is the ordinary mismatch.
        for (rest, said) in [
            ("function main(): i32 {\n  return add_one(true)\n}\n", "argument 1 to `add_one` has incompatible type: expected `i32`, found `bool`"),
            ("function main(): i32 {\n  return add_one(null)\n}\n", "argument 1 to `add_one` has incompatible type: expected `i32`, found `null`"),
            ("function main(x: f64): f32 {\n  return scale(x, 2)\n}\n", "argument 1 to `scale` has incompatible type: expected `f32`, found `f64`"),
            ("function main(n: i32): f32 {\n  return scale(n, 2)\n}\n", "argument 1 to `scale` has incompatible type: expected `f32`, found `i32`"),
            ("function main(): i32 {\n  return add_one(3000000000)\n}\n", "argument 1 to `add_one` has incompatible type: expected `i32`, found `integer literal`"),
        ] {
            let (message, ..) = refused_with(&format!("{FIXTURE}{rest}"), "HS-TYPE-ARG-001");
            assert!(message.contains(said), "{rest}\n=> {message}");
        }
        // Proven: literals that fit, typed parameters and locals, arithmetic on them, and another
        // capability's declared result.
        for rest in [
            "function main(): i32 {\n  return add_one(41)\n}\n",
            "function main(n: i32): i32 {\n  return add_one(n + 1)\n}\n",
            "function main(): f32 {\n  return scale(0.1, 3)\n}\n",
            "function main(): f32 {\n  return scale(1, 2)\n}\n",
            "function main(): i32 {\n  return add_one(add_one(1))\n}\n",
            "function main(): i32 {\n  let v: i32 = 5\n  return add_one(v)\n}\n",
            "function main(): i32 {\n  add_one(1)\n  scale(0.5, 2)\n  return 0\n}\n",
        ] {
            let source = format!("{FIXTURE}{rest}");
            assert_eq!(verdict(&source), None, "{source}");
        }
    }

    #[test]
    fn a_source_no_reader_takes_as_written_is_refused_and_the_crdt_stream_is_left_alone() {
        // Native trims a source, and a lookalike of `holo:` passed as an unchecked file import.
        for source in [
            " holo:absorb",
            "holo:absorb ",
            "\u{ff48}olo:absorb",
            "holo:\u{0430}bsorb",
            "holo:absorb\u{200b}",
            "./donn\u{e9}es.hs",
        ] {
            let program = AUDIT.replace("holo:absorb\"", &format!("{source}\""));
            let (message, line, column) = refused_with(&program, "HS-HOST-001");
            assert!(message.contains("is not one HoloScript reads: it has a space before or after it, or a character outside ASCII"), "{source:?}: {message}");
            assert_eq!((line, column), (1, 1), "{source:?}: {message}");
        }
        // The `.hsplus` import resolver reads the HoloMesh CRDT stream (`isCrdtImport`); the
        // checker keeps G11's reading of it, as before G21: its names are bound, unchecked.
        assert_eq!(
            verdict("import { feed } from \"crdt://holomesh/feed\"\n\nfunction main() {\n  return feed()\n}\n"),
            None
        );
    }

    #[test]
    fn a_documents_function_cannot_stand_in_for_a_holo_import_of_its_piece() {
        // The `.hsplus` reader checks a document's imports as a piece, with the document's
        // functions and structs as context; each function is checked alone, so a stand-in was
        // never seen (claude3's #466 review, P2).
        let probe = "import { manifest_audit_passes } from \"holo:absorb\"\n";
        for (context, kind) in [
            (
                "{\"functions\":[{\"name\":\"manifest_audit_passes\",\"arity\":0}]}",
                "function",
            ),
            (
                "{\"structs\":[{\"name\":\"manifest_audit_passes\",\"fields\":[]}]}",
                "struct",
            ),
        ] {
            let (message, line, column) =
                verdict_json(&crate::validate_detailed_in_context(probe, context)).expect(context);
            assert!(message.contains(&format!("[HS-SCOPE-001] `manifest_audit_passes` is imported from a Holo module (line 1, column 10) and the document also declares a {kind} named `manifest_audit_passes`")), "{message}");
            assert_eq!((line, column), (1, 10), "{message}");
        }
        // Each typed function, checked with the imports as context, does not report it again.
        let context = "{\"functions\":[{\"name\":\"manifest_audit_passes\",\"arity\":0},{\"name\":\"caller\",\"arity\":0}],\"imports\":[{\"source\":\"holo:absorb\",\"specifiers\":[{\"imported\":\"manifest_audit_passes\",\"local\":\"manifest_audit_passes\"}]}]}";
        assert_eq!(
            verdict_json(&crate::validate_detailed_in_context(
                "function caller(): bool {\n  return manifest_audit_passes()\n}\n",
                context
            )),
            None
        );
    }

    #[test]
    fn passing_the_checker_is_not_permission_to_call_the_tool() {
        // The checker reads what a capability takes and gives; it grants nothing. The authority
        // a declaration names is a stored string no check consults: the checked call compiles
        // on UAAL (phase 2) to an EXEC that carries the ABI name and the argument count only, so
        // whether it runs is the host's decision, made where the host binds it or refuses it
        // (the G21 differential in wasm-api.test.ts: a host that refuses the name ends the run in
        // ERROR). The Kotlin bridge still refuses the call by name (claude3's #466 review,
        // authority).
        assert_eq!(verdict(AUDIT), None);
        let HostSource::Module(_, absorb) = resolve_host_source("holo:absorb") else {
            panic!("holo:absorb should resolve");
        };
        assert_eq!(
            absorb.functions["manifest_audit_passes"].authority,
            "holo_absorb_manifest"
        );
        assert!(!crate::validate_detailed(AUDIT).contains("holo_absorb_manifest"));
        let bytecode = crate::uaal_emit::compile_source_to_uaal_json(AUDIT).expect("compiles");
        assert!(!bytecode.contains("holo_absorb_manifest"), "{bytecode}");
        assert_eq!(
            exec_calls(AUDIT),
            vec![("holo.absorb.manifest_audit_passes.v1".to_string(), 0)]
        );
        let kotlin =
            crate::kotlin_emit::compile_source_to_kotlin(AUDIT, "").expect_err("Kotlin refuses it");
        assert!(
            kotlin.message.contains("[HS-HOST-004]"),
            "{}",
            kotlin.message
        );
        // Native refuses the import as a non-relative path before any check of its own; the
        // G21 differential in wasm-api.test.ts runs holoscriptc on this program.
    }

    /// The emitter alone, past the checker: what a backstop does when the checker is wrong.
    fn emitted_past_the_checker(source: &str) -> Result<Vec<(String, u64)>, String> {
        let ast = crate::parse_ast(source).expect("the program parses");
        crate::uaal_emit::emit_checked_uaal_bytecode(&ast)
            .map(|bytecode| {
                bytecode
                    .instructions
                    .iter()
                    .filter(|instruction| instruction.op_code == 0x20)
                    .map(|instruction| {
                        (
                            instruction.operands[0]
                                .as_str()
                                .unwrap_or_default()
                                .to_string(),
                            instruction.operands[1].as_u64().unwrap_or(u64::MAX),
                        )
                    })
                    .collect()
            })
            .map_err(|error| error.message)
    }

    #[test]
    fn a_locally_bound_name_never_becomes_a_host_call() {
        // claude3's #487 review, P1-1: UAAL looked a called name up among the imports first, so
        // `function check(manifest_audit_passes) { return manifest_audit_passes() }` compiled to
        // an EXEC. The checker refuses the binding (HS-SCOPE-001, #466); past the checker, the
        // emitter resolves the name to the binding, as the checker does, and emits no EXEC.
        for (source, function) in [
            (format!("{ABSORB}function check(manifest_audit_passes) {{\n  return manifest_audit_passes()\n}}\n"), "check"),
            (format!("{ABSORB}function check() {{\n  let manifest_audit_passes = 5\n  return manifest_audit_passes()\n}}\n"), "check"),
            (format!("{ABSORB}function main(manifest_audit_passes: i32): bool {{\n  return manifest_audit_passes()\n}}\n"), "main"),
            (format!("{FIXTURE}function check(add_one) {{\n  add_one(1)\n  return 0\n}}\n"), "check"),
        ] {
            let refused = emitted_past_the_checker(&source).expect_err(&source);
            assert!(
                refused.contains(&format!("is a parameter or local of function `{function}` and also the name of a Holo import")),
                "{source}\n=> {refused}"
            );
            let checked = crate::uaal_emit::compile_source_to_uaal(&source).expect_err(&source);
            assert!(checked.message.contains("[HS-SCOPE-001]"), "{}", checked.message);
        }
        // The same program without the binding still lowers to the one EXEC.
        assert_eq!(
            emitted_past_the_checker(AUDIT),
            Ok(vec![(
                "holo.absorb.manifest_audit_passes.v1".to_string(),
                0
            )])
        );
    }

    #[test]
    fn the_emitter_checks_the_argument_count_itself() {
        // claude3's fault M6b removed this check and no test failed: the checker refuses a wrong
        // count first (HS-ARITY-001), so only a program past the checker reaches it.
        for (call, got) in [("add_one(1, 2)", 2), ("add_one()", 0)] {
            let source = format!("{FIXTURE}function main(): i32 {{\n  return {call}\n}}\n");
            let refused = emitted_past_the_checker(&source).expect_err(&source);
            assert!(
                refused.contains(&format!(
                    "arity mismatch calling `add_one` in compile_to_uaal: expected 1, got {got}"
                )),
                "{refused}"
            );
        }
    }

    #[test]
    fn an_alias_onto_a_built_in_never_compiles() {
        // claude3's #487 review, P2-2: `add_one as load` made `load(r.count)` a field read with no
        // EXEC, and `scale as store` as a statement compiled the built-in and then POPped the
        // caller's value. The checker refuses such an alias (#466); end to end, nothing compiles.
        for source in [
            "import { add_one as load } from \"holo:fixture\"\n\nstruct R {\n  count: i32\n}\n\nfunction main(): i32 {\n  slot r: R = R(5)\n  return load(r.count)\n}\n",
            "import { scale as store } from \"holo:fixture\"\n\nstruct R {\n  count: i32\n}\n\nfunction main(): i32 {\n  slot r: R = R(5)\n  store(r.count, 2)\n  return 109\n}\n",
        ] {
            let (message, ..) = refused_with(source, "HS-SCOPE-001");
            assert!(message.contains("which is a built-in"), "{message}");
            let compiled = crate::uaal_emit::compile_source_to_uaal(source).expect_err(source);
            assert!(compiled.message.contains("which is a built-in"), "{}", compiled.message);
        }
    }

    // The programs claude3's two review harnesses ran (`REVIEW_PROGRAMS`), kept apart as data.
    include!("holo_review_programs.rs");

    /// This round's programs: the escape forms, rebinding, built-in names, sources, argument
    /// proof, the fallback form and values whose type was declared, beside claude3's lists.
    fn round_two_programs() -> Vec<(String, String)> {
        let mut programs = Vec::new();
        let mut add = |id: &str, source: String| programs.push((format!("h4b {id}"), source));
        for (id, rest) in [
            ("lambda untyped", "function check() {\n  let g = x => manifest_audit_passes()\n  return g(0)\n}\n"),
            ("member call typed", "function main(): bool {\n  return manifest_audit_passes.call(1, 2)\n}\n"),
            ("on block in typed fn", "function main(): bool {\n  on_tick {\n    manifest_audit_passes()\n  }\n  return true\n}\n"),
            ("action clause", "function main(): bool {\n  action pick(item) {\n    effect { manifest_audit_passes() }\n  }\n  return true\n}\n"),
            ("move target", "function main(): bool {\n  move manifest_audit_passes to home\n  return true\n}\n"),
            ("slot rebinding", "function main(): bool {\n  slot manifest_audit_passes: R = R(1)\n  return true\n}\n\nstruct R {\n  a: i32\n}\n"),
            ("loop variable rebinding", "function check() {\n  for (manifest_audit_passes in 0..3) {\n    print(1)\n  }\n  return 0\n}\n"),
            ("lambda parameter rebinding", "function main(): bool {\n  let g = manifest_audit_passes => 1\n  return true\n}\n"),
            ("lambda in typed fn", "function main(): bool {\n  let g = x => manifest_audit_passes()\n  return true\n}\n"),
            ("while test", "function main(): i32 {\n  var n: i32 = 0\n  while (manifest_audit_passes()) {\n    n = n + 1\n  }\n  return n\n}\n"),
            ("negated", "function main(): bool {\n  return !manifest_audit_passes()\n}\n"),
        ] {
            add(id, format!("{ABSORB}{rest}"));
        }
        for name in [
            "load",
            "store",
            "drop",
            "buffer",
            "known",
            "unknown",
            "isKnown",
            "unknownReason",
            "slice_length",
            "u8_to_i32",
            "i32_to_u8",
            "abs",
            "floor",
            "max",
            "min",
            "pow",
            "sqrt",
        ] {
            add(
                &format!("alias {name}"),
                format!("import {{ add_one as {name} }} from \"holo:fixture\"\n\nfunction main(): i32 {{\n  return {name}(1)\n}}\n"),
            );
        }
        for source in [
            " holo:absorb",
            "holo:absorb ",
            "\u{ff48}olo:absorb",
            "holo:\u{0430}bsorb",
            "crdt://holomesh/feed",
        ] {
            add(
                &format!("source {source:?}"),
                AUDIT.replace("holo:absorb\"", &format!("{source}\"")),
            );
        }
        for (id, rest) in [
            ("proven literal", "function main(): i32 {\n  return add_one(41)\n}\n"),
            ("proven parameter arithmetic", "function main(n: i32): i32 {\n  return add_one(n * 2 + 1)\n}\n"),
            ("proven f32 arithmetic", "function main(f: f32): f32 {\n  return scale(f * 2.0, 3)\n}\n"),
            ("proven integer literal into f32", "function main(): f32 {\n  return scale(1, 2)\n}\n"),
            ("proven capability result", "function main(): i32 {\n  return add_one(add_one(add_one(1)))\n}\n"),
            ("proven typed function result", "function two(): i32 {\n  return 2\n}\n\nfunction main(): i32 {\n  return add_one(two())\n}\n"),
            ("proven typed local", "function main(): i32 {\n  let v: i32 = 5\n  return add_one(v)\n}\n"),
            ("statement calls", "function main(): i32 {\n  add_one(1)\n  scale(0.5, 2)\n  return 0\n}\n"),
            ("two calls, one per branch", "function main(n: i32): i32 {\n  if (n > 0) {\n    return add_one(n)\n  }\n  return add_one(0 - n)\n}\n"),
            ("result compared", "function main(): bool {\n  return add_one(1) < 3\n}\n"),
            ("unproven untyped helper", "function helper() {\n  return \"x\"\n}\n\nfunction main(): i32 {\n  return add_one(helper())\n}\n"),
            ("unproven struct", "struct P {\n  a: i32\n}\n\nfunction main(): i32 {\n  return add_one(P(1))\n}\n"),
            ("unproven any", "function relay(v: any): i32 {\n  return add_one(v)\n}\n\nfunction main(): i32 {\n  return relay(1)\n}\n"),
            ("unproven untyped local", "function helper() {\n  return \"x\"\n}\n\nfunction main(): i32 {\n  let v = helper()\n  return add_one(v)\n}\n"),
            ("wrong bool", "function main(): i32 {\n  return add_one(true)\n}\n"),
            ("wrong f64", "function main(x: f64): f32 {\n  return scale(x, 2)\n}\n"),
            ("wrong count", "function main(): i32 {\n  return add_one(1, 2)\n}\n"),
            // A fallback stands for its declared field only on a host that carries the tag; the
            // checker takes the fallback's type for the expression, and UAAL refuses the form
            // (HS-UAAL-CAP-008), so no EXEC carries it (the gap is named in What remains).
            ("fallback form", "struct R {\n  @unknown v: f64\n}\n\nfunction main(): i32 {\n  slot r: R = R(2.5)\n  return add_one(load(r.v) ?? 0)\n}\n"),
            // A declared type is trusted, by the checker and by the second reading below: these
            // compile, and are the gap the spec records (Known gaps item 7).
            ("declared local from an untyped helper", "function helper() {\n  return \"rm -rf /\"\n}\n\nfunction main(): i32 {\n  let v: i32 = helper()\n  return add_one(v)\n}\n"),
            ("declared parameter fed by an untyped caller", "function relay(v: i32): i32 {\n  return add_one(v)\n}\n\nfunction helper() {\n  return \"x\"\n}\n\nfunction main() {\n  return relay(helper())\n}\n"),
        ] {
            add(id, format!("{FIXTURE}{rest}"));
        }
        programs
    }

    /// A capability call site of an accepted program, with what the function around it declares.
    struct CallSite<'a> {
        local: String,
        abi: String,
        params: Vec<String>,
        arguments: &'a [AstNode],
        /// Typed parameters and locals of the function around the call, by name.
        names: HashMap<String, String>,
    }

    /// Every capability call site in the file's top-level functions (an accepted program has
    /// them nowhere else), found by a plain recursive walk.
    fn capability_sites(ast: &crate::ast::Ast) -> Vec<CallSite<'_>> {
        let mut imports: HashMap<String, (String, String, &HostFunction)> = HashMap::new();
        for node in &ast.body {
            let AstNode::Import(import) = node else {
                continue;
            };
            let HostSource::Module(module, declarations) = resolve_host_source(&import.source)
            else {
                continue;
            };
            for specifier in &import.specifiers {
                if let Some(function) = declarations.functions.get(&specifier.imported) {
                    imports.insert(
                        specifier.local.clone(),
                        (module.to_string(), specifier.imported.clone(), function),
                    );
                }
            }
        }
        fn walk<'a>(
            node: &'a AstNode,
            imports: &HashMap<String, (String, String, &HostFunction)>,
            names: &mut HashMap<String, String>,
            found: &mut Vec<(String, &'a [AstNode])>,
        ) {
            match node {
                AstNode::CallExpression(call) => {
                    if let AstNode::Identifier(callee) = call.callee.as_ref() {
                        if imports.contains_key(&callee.name) {
                            found.push((callee.name.clone(), &call.arguments));
                        }
                    } else {
                        walk(&call.callee, imports, names, found);
                    }
                    for argument in &call.arguments {
                        walk(argument, imports, names, found);
                    }
                }
                AstNode::VariableDeclaration(variable) => {
                    if let Some(annotation) = &variable.type_annotation {
                        names.insert(variable.name.clone(), annotation.clone());
                    }
                    walk(&variable.value, imports, names, found);
                }
                AstNode::StackSlotDeclaration(slot) => {
                    names.insert(slot.name.clone(), slot.type_annotation.clone());
                    walk(&slot.value, imports, names, found);
                }
                AstNode::Return(ret) => {
                    if let Some(argument) = &ret.argument {
                        walk(argument, imports, names, found);
                    }
                }
                AstNode::Assignment(assignment) => walk(&assignment.value, imports, names, found),
                AstNode::If(if_node) => {
                    walk(&if_node.test, imports, names, found);
                    for statement in if_node
                        .consequent
                        .iter()
                        .chain(if_node.alternate.iter().flatten())
                    {
                        walk(statement, imports, names, found);
                    }
                }
                AstNode::While(while_node) => {
                    walk(&while_node.test, imports, names, found);
                    for statement in &while_node.body {
                        walk(statement, imports, names, found);
                    }
                }
                AstNode::ForOf(for_node) => {
                    walk(&for_node.range, imports, names, found);
                    for statement in &for_node.body {
                        walk(statement, imports, names, found);
                    }
                }
                AstNode::LexicalScope(scope) => {
                    for statement in &scope.body {
                        walk(statement, imports, names, found);
                    }
                }
                AstNode::BinaryExpression(binary) => {
                    walk(&binary.left, imports, names, found);
                    walk(&binary.right, imports, names, found);
                }
                AstNode::UnaryExpression(unary) => walk(&unary.argument, imports, names, found),
                AstNode::MemberExpression(member) => walk(&member.object, imports, names, found),
                AstNode::LambdaExpression(lambda) => walk(&lambda.body, imports, names, found),
                AstNode::Array(array) => {
                    for element in &array.elements {
                        walk(element, imports, names, found);
                    }
                }
                AstNode::ObjectLiteral(object) => {
                    for property in &object.properties {
                        walk(&property.value, imports, names, found);
                    }
                }
                _ => {}
            }
        }
        let mut sites = Vec::new();
        for node in &ast.body {
            let function = match node {
                AstNode::Function(function) => function,
                AstNode::Export(export) => match export.declaration.as_ref() {
                    AstNode::Function(function) => function,
                    _ => continue,
                },
                _ => continue,
            };
            let mut names: HashMap<String, String> = function
                .params
                .iter()
                .zip(function.param_types.iter())
                .filter_map(|(name, annotation)| Some((name.clone(), annotation.clone()?)))
                .collect();
            let mut found = Vec::new();
            for statement in &function.body {
                walk(statement, &imports, &mut names, &mut found);
            }
            for (local, arguments) in found {
                let (module, imported, declared) = &imports[&local];
                sites.push(CallSite {
                    abi: format!("holo.{module}.{imported}.v{}", declared.version),
                    params: declared.param_types.iter().flatten().cloned().collect(),
                    local,
                    arguments,
                    names: names.clone(),
                });
            }
        }
        sites
    }

    /// A second reading of "proven of its declared type", written apart from the checker: a
    /// literal that fits, a name the function declares with that type, arithmetic on such, a
    /// comparison or logic for `bool`, or a call to a capability or a typed function that returns
    /// the type. Nothing else is proven. A declared type is trusted, as the checker trusts it.
    fn proven_by_shape(
        argument: &AstNode,
        expected: &str,
        names: &HashMap<String, String>,
        returns: &HashMap<String, String>,
    ) -> bool {
        let proven = |node: &AstNode, ty: &str| proven_by_shape(node, ty, names, returns);
        match argument {
            AstNode::Number(number) => match expected {
                "i32" => number.value.fract() == 0.0 && number.value.abs() <= f64::from(i32::MAX),
                "f32" | "f64" => true,
                _ => false,
            },
            AstNode::Boolean(_) => expected == "bool",
            AstNode::Identifier(identifier) => {
                names.get(&identifier.name).map(String::as_str) == Some(expected)
            }
            AstNode::UnaryExpression(unary) => match unary.operator.as_str() {
                "-" => {
                    matches!(expected, "i32" | "f32" | "f64") && proven(&unary.argument, expected)
                }
                "!" => expected == "bool" && proven(&unary.argument, "bool"),
                _ => false,
            },
            AstNode::BinaryExpression(binary) => match binary.operator.as_str() {
                "+" | "-" | "*" | "/" | "%" => {
                    matches!(expected, "i32" | "f32" | "f64")
                        && proven(&binary.left, expected)
                        && proven(&binary.right, expected)
                }
                "&&" | "||" => {
                    expected == "bool"
                        && proven(&binary.left, "bool")
                        && proven(&binary.right, "bool")
                }
                "==" | "!=" | "<" | "<=" | ">" | ">=" => expected == "bool",
                _ => false,
            },
            AstNode::CallExpression(call) => match call.callee.as_ref() {
                AstNode::Identifier(callee) => {
                    returns.get(&callee.name).map(String::as_str) == Some(expected)
                }
                _ => false,
            },
            _ => false,
        }
    }

    #[test]
    fn every_capability_program_the_checker_accepts_lowers_to_checked_execs_or_is_refused() {
        // claude3's #487 review: the checker and the emitter apply one rule in two places, so
        // every program the checker accepts must lower to EXECs that agree with the
        // declarations, with arguments proven of their declared types, or be refused; and a
        // program the checker refuses must never compile. Fed: every capability program of
        // claude3's two review harnesses and this round's.
        let mut programs: Vec<(String, String)> = REVIEW_PROGRAMS
            .iter()
            .map(|(id, source)| (id.to_string(), source.to_string()))
            .collect();
        programs.push((
            "c3-466 M14 very long name".to_string(),
            AUDIT.replace("holo:absorb\"", &format!("holo:{}\"", "a".repeat(10_000))),
        ));
        programs.extend(round_two_programs());
        let (mut refused, mut accepted, mut lowered, mut execs, mut with_arguments) =
            (0, 0, 0, 0, 0);
        for (id, source) in &programs {
            let compiled = crate::uaal_emit::compile_source_to_uaal(source);
            if verdict(source).is_some() {
                refused += 1;
                assert!(
                    compiled.is_err(),
                    "{id}: the checker refuses it, so UAAL must"
                );
                continue;
            }
            accepted += 1;
            // A refusal by the engine is an answer: it emits no EXEC at all.
            let Ok(bytecode) = compiled else { continue };
            lowered += 1;
            let ast = crate::parse_ast(source).expect("an accepted program parses");
            let sites = capability_sites(&ast);
            let holo: Vec<(String, u64)> = bytecode
                .instructions
                .iter()
                .filter(|instruction| instruction.op_code == 0x20)
                .filter_map(|instruction| {
                    let abi = instruction.operands[0].as_str()?;
                    abi.starts_with("holo.").then(|| {
                        (
                            abi.to_string(),
                            instruction.operands[1].as_u64().unwrap_or(u64::MAX),
                        )
                    })
                })
                .collect();
            assert_eq!(
                holo.len(),
                sites.len(),
                "{id}: one EXEC per capability call\n{source}"
            );
            let mut returns: HashMap<String, String> = HashMap::new();
            for node in &ast.body {
                let function = match node {
                    AstNode::Function(function) => function,
                    AstNode::Export(export) => match export.declaration.as_ref() {
                        AstNode::Function(function) => function,
                        _ => continue,
                    },
                    _ => continue,
                };
                if let Some(annotation) = &function.return_type {
                    returns.insert(function.name.clone(), annotation.clone());
                }
            }
            for site in &sites {
                let declared = resolve_capability_return(&ast, &site.local);
                returns.insert(site.local.clone(), declared);
            }
            for site in &sites {
                assert!(
                    holo.contains(&(site.abi.clone(), site.params.len() as u64)),
                    "{id}: no EXEC {} with {} arguments in {holo:?}",
                    site.abi,
                    site.params.len()
                );
                assert_eq!(
                    site.arguments.len(),
                    site.params.len(),
                    "{id}: {}",
                    site.local
                );
                for (argument, expected) in site.arguments.iter().zip(&site.params) {
                    assert!(
                        proven_by_shape(argument, expected, &site.names, &returns),
                        "{id}: an argument to `{}` is not proven `{expected}`\n{source}",
                        site.local
                    );
                }
                if !site.params.is_empty() {
                    with_arguments += 1;
                }
            }
            execs += holo.len();
        }
        // Every branch is reached: checker refusals, accepted programs UAAL refuses, and lowered
        // calls, some of them with arguments.
        println!("differential: {} programs, {refused} refused by the checker, {accepted} accepted, {lowered} lowered with {execs} EXECs ({with_arguments} call sites with arguments)", programs.len());
        assert!(refused >= 60, "{refused} refused");
        assert!(accepted > lowered, "{accepted} accepted, {lowered} lowered");
        assert!(
            lowered >= 25 && execs >= 30 && with_arguments >= 15,
            "{lowered} lowered, {execs} EXECs, {with_arguments} with arguments"
        );
    }

    /// The declared result type of the capability a file imports under `local`.
    fn resolve_capability_return(ast: &crate::ast::Ast, local: &str) -> String {
        for node in &ast.body {
            let AstNode::Import(import) = node else {
                continue;
            };
            let HostSource::Module(_, declarations) = resolve_host_source(&import.source) else {
                continue;
            };
            for specifier in &import.specifiers {
                if specifier.local == local {
                    if let Some(function) = declarations.functions.get(&specifier.imported) {
                        return function.return_type.clone().unwrap_or_default();
                    }
                }
            }
        }
        String::new()
    }
}
