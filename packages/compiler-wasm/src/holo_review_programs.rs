// Test data, included by the G21 differential in `holo_modules.rs` (never a module of the crate):
// the capability programs claude3's review harnesses ran on G21 phases 1 and 2 (PRs #466 and
// #487, 2026-10-04/05: `pr466-review-claude3/cases.mjs`, `pr487-review-claude3/cases487.mts` and
// its probe `rev487_probe.rs.txt`), 126 programs after removing duplicates. The 10,000-character
// module name is built in the test instead.

const REVIEW_PROGRAMS: &[(&str, &str)] = &[
    (
        "c3-466 R01 demo",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 R02 unknown module holo:no_such",
        r#"import { manifest_audit_passes } from "holo:no_such"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 R03 unknown function (typo)",
        r#"import { manifest_audit_pases } from "holo:absorb"

function main(): bool {
  return manifest_audit_pases()
}
"#,
    ),
    (
        "c3-466 R04 unknown function, far name (no hint)",
        r#"import { delete_everything } from "holo:absorb"

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 R05 wrong arity",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes(1)
}
"#,
    ),
    (
        "c3-466 R06 wrong arity via alias",
        r#"import { manifest_audit_passes as audit } from "holo:absorb"

function main(): bool {
  return audit(1, 2)
}
"#,
    ),
    (
        "c3-466 R07 result into i32 local",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  let n: i32 = manifest_audit_passes()
  return n
}
"#,
    ),
    (
        "c3-466 R08 result returned from i32 fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 R09 result discarded (statement)",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  manifest_audit_passes()
  return true
}
"#,
    ),
    (
        "c3-466 R10 result used in arithmetic into i32",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  let n: i32 = manifest_audit_passes() + 1
  return n
}
"#,
    ),
    (
        "c3-466 R11 result used as if-test",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  if (manifest_audit_passes()) {
return 1
  }
  return 0
}
"#,
    ),
    (
        "c3-466 U01 call from untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 U02 lambda in untyped fn, wrong arity",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  let g = x => manifest_audit_passes(1, 2, 3)
  return g(0)
}
"#,
    ),
    (
        "c3-466 U03 lambda in typed fn, wrong arity",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  let g = x => manifest_audit_passes(1, 2, 3)
  return true
}
"#,
    ),
    (
        "c3-466 U03b lambda in untyped fn, right arity",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  let g = x => manifest_audit_passes()
  return g(0)
}
"#,
    ),
    (
        "c3-466 U03c lambda returned from untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  return x => manifest_audit_passes(7)
}
"#,
    ),
    (
        "c3-466 U03d object event handler at top level",
        r#"import { manifest_audit_passes } from "holo:absorb"

object Lamp {
  onClick: {
manifest_audit_passes(1, 2)
  }
}

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 U03e @trait handler body at top level",
        r#"import { manifest_audit_passes } from "holo:absorb"

@trait t {
  @on_check(x) => {
return manifest_audit_passes(1, 2, 3)
  }
}

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 U04 member call in untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  return manifest_audit_passes.call(1, 2)
}
"#,
    ),
    (
        "c3-466 U05 member call in typed fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes.call(1, 2)
}
"#,
    ),
    (
        "c3-466 U06 array statement in untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  [manifest_audit_passes(1, 2)]
  return 0
}
"#,
    ),
    (
        "c3-466 U07 object statement in untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  ({ a: manifest_audit_passes(9) })
  return 0
}
"#,
    ),
    (
        "c3-466 U08 trait config at top level",
        r#"import { manifest_audit_passes } from "holo:absorb"

@audit_on_load { check: manifest_audit_passes(1, 2, 3) }

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 U09 import statement inside a function body",
        r#"function main(): bool {
  import { manifest_audit_passes } from "holo:no_such"
  return true
}
"#,
    ),
    (
        "c3-466 U10 value use in typed fn (let f =)",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  let f = manifest_audit_passes
  return true
}
"#,
    ),
    (
        "c3-466 U11 value use: returned",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes
}
"#,
    ),
    (
        "c3-466 U12 untyped fn with a holo import, no use",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  return 1
}
"#,
    ),
    (
        "c3-466 U13 for-in over the call in untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  for (x in manifest_audit_passes(4)) {
print(x)
  }
  return 0
}
"#,
    ),
    (
        "c3-466 U14 call as argument of a typed call",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  print(manifest_audit_passes(1))
  return true
}
"#,
    ),
    (
        "c3-466 S01 local fn of same name (stand-in)",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}

function manifest_audit_passes(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 S02 struct of same name",
        r#"import { manifest_audit_passes } from "holo:absorb"

struct manifest_audit_passes { a: i32 }

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 S03 typed param of same name, called",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(manifest_audit_passes: i32): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 S04 typed param of same name, read",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(manifest_audit_passes: bool): bool {
  return manifest_audit_passes
}
"#,
    ),
    (
        "c3-466 S05 let of same name in typed fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  let manifest_audit_passes = true
  return manifest_audit_passes
}
"#,
    ),
    (
        "c3-466 S06 same holo import twice",
        r#"import { manifest_audit_passes } from "holo:absorb"

import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 S07 same name from holo and from a file",
        r#"import { manifest_audit_passes } from "holo:absorb"

import { manifest_audit_passes } from "./stub.hs"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 S08 same name from a file, then holo",
        r#"import { manifest_audit_passes } from "./stub.hs"
import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 S09 alias onto a built-in name (print)",
        r#"import { manifest_audit_passes as print } from "holo:absorb"

function main(): bool {
  print(1, 2)
  return true
}
"#,
    ),
    (
        "c3-466 S10 alias onto unknown()",
        r#"import { manifest_audit_passes as unknown } from "holo:absorb"

function main(): bool {
  return unknown("x")
}
"#,
    ),
    (
        "c3-466 S11 alias onto isKnown()",
        r#"import { manifest_audit_passes as isKnown } from "holo:absorb"

function main(): bool {
  return isKnown(1)
}
"#,
    ),
    (
        "c3-466 S12 two names, one alias to the other",
        r#"import { manifest_audit_passes, manifest_audit_passes as manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 S13 alias exec (HS010)",
        r#"import { manifest_audit_passes as exec } from "holo:absorb"

function main(): bool {
  return exec()
}
"#,
    ),
    (
        "c3-466 S14 enum of same name as alias",
        r#"import { manifest_audit_passes as Audit } from "holo:absorb"

enum Audit { A }

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-466 M01 holo:../x",
        r#"import { manifest_audit_passes } from "holo:../x"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M02 holo: (empty)",
        r#"import { manifest_audit_passes } from "holo:"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M03 Cyrillic a lookalike holo:аbsorb",
        r#"import { manifest_audit_passes } from "holo:аbsorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M04 a zero-width space after holo:absorb",
        "import { manifest_audit_passes } from \"holo:absorb\u{200b}\"\n\nfunction main(): bool {\n  return manifest_audit_passes()\n}\n",
    ),
    (
        "c3-466 M05 fullwidth h ｈolo:absorb",
        r#"import { manifest_audit_passes } from "ｈolo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M06 leading space \" holo:absorb\"",
        r#"import { manifest_audit_passes } from " holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M07 trailing space \"holo:absorb \"",
        r#"import { manifest_audit_passes } from "holo:absorb "

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M08 HOLO:absorb",
        r#"import { manifest_audit_passes } from "HOLO:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M09 Holo:absorb",
        r#"import { manifest_audit_passes } from "Holo:absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M10 holo:Absorb",
        r#"import { manifest_audit_passes } from "holo:Absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M11 holo://absorb",
        r#"import { manifest_audit_passes } from "holo://absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M12 holo:absorb.hs",
        r#"import { manifest_audit_passes } from "holo:absorb.hs"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M13 holo:absorb?x=1",
        r#"import { manifest_audit_passes } from "holo:absorb?x=1"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M15 holo:absorb_ (unknown, valid shape)",
        r#"import { manifest_audit_passes } from "holo:absorb_"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M16 escaped holo:\\u0061bsorb in source text",
        r#"import { manifest_audit_passes } from "holo:\u0061bsorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-466 M17 https scheme file import",
        r#"import { helper } from "https://example.com/x.hs"

function main() {
  return helper()
}
"#,
    ),
    (
        "c3-466 M18 relative file import (G11, unchecked)",
        r#"import { add as combine } from "./math.hs"

function main() {
  return combine(1, 2)
}
"#,
    ),
    (
        "c3-466 M19 lib:x scheme-like file import",
        r#"import { helper } from "lib:math.hs"

function main() {
  return helper()
}
"#,
    ),
    (
        "c3-466 M20 tab inside holo:\\tabsorb",
        r#"import { manifest_audit_passes } from "holo:	absorb"

function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 X03 lambda returned from untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  return x => manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 X04b member call in untyped fn (.call())",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  return manifest_audit_passes.call()
}
"#,
    ),
    (
        "c3-487 X05b array statement in untyped fn (0 args)",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  [manifest_audit_passes()]
  return 0
}
"#,
    ),
    (
        "c3-487 X06 object statement in untyped fn",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  ({ a: manifest_audit_passes() })
  return 0
}
"#,
    ),
    (
        "c3-487 X07 object onClick at top level",
        r#"import { manifest_audit_passes } from "holo:absorb"

object Lamp {
  onClick: {
manifest_audit_passes()
  }
}

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-487 X08 @trait handler at top level",
        r#"import { manifest_audit_passes } from "holo:absorb"

@trait t {
  @on_check(x) => {
return manifest_audit_passes()
  }
}

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-487 X09 trait config at top level",
        r#"import { manifest_audit_passes } from "holo:absorb"

@audit_on_load { check: manifest_audit_passes() }

function main(): bool {
  return true
}
"#,
    ),
    (
        "c3-487 N01 untyped fn, PARAMETER named like the capability, called",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check(manifest_audit_passes) {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 N02 untyped fn, LET named like the capability, called",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  let manifest_audit_passes = 5
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 N03 untyped fn, parameter shadow, 3 args",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check(manifest_audit_passes) {
  return manifest_audit_passes(1, 2, 3)
}
"#,
    ),
    (
        "c3-487 N04 untyped helper (param shadow) called from typed i32 main",
        r#"import { manifest_audit_passes } from "holo:absorb"

function helper(manifest_audit_passes) {
  return manifest_audit_passes()
}

function main(): i32 {
  return helper(0)
}
"#,
    ),
    (
        "c3-487 N05 untyped fn, let shadow, result used in if",
        r#"import { manifest_audit_passes } from "holo:absorb"

function check() {
  let manifest_audit_passes = 0
  if (manifest_audit_passes()) {
return 1
  }
  return 0
}
"#,
    ),
    (
        "c3-487 N09 typed fn, typed let of the same name, then called",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  let manifest_audit_passes: i32 = 3
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 P02 statement call, then return 7",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  manifest_audit_passes()
  return 7
}
"#,
    ),
    (
        "c3-487 P04 while-test, counts calls (host: true,true,false)",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  var n: i32 = 0
  while (manifest_audit_passes()) {
n = n + 1
  }
  return n
}
"#,
    ),
    (
        "c3-487 P05 && of two calls",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  return manifest_audit_passes() && manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 P06 typed let",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  let ok: bool = manifest_audit_passes()
  return ok
}
"#,
    ),
    (
        "c3-487 P07 assignment",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): bool {
  var ok: bool = false
  ok = manifest_audit_passes()
  return ok
}
"#,
    ),
    (
        "c3-487 P08 argument of a typed user function",
        r#"import { manifest_audit_passes } from "holo:absorb"

function id(b: bool): bool {
  return b
}

function main(): bool {
  return id(manifest_audit_passes())
}
"#,
    ),
    (
        "c3-487 P09 three statement calls in if/while bodies",
        r#"import { manifest_audit_passes } from "holo:absorb"

function main(): i32 {
  var n: i32 = 0
  manifest_audit_passes()
  if (true) {
manifest_audit_passes()
  }
  while (n < 1) {
manifest_audit_passes()
n = n + 1
  }
  return 9
}
"#,
    ),
    (
        "c3-487 P10 statement call inside a recursive function",
        r#"import { manifest_audit_passes } from "holo:absorb"

function count(n: i32): i32 {
  manifest_audit_passes()
  if (n < 1) {
return 0
  }
  return count(n - 1) + 1
}

function main(): i32 {
  return count(3)
}
"#,
    ),
    (
        "c3-487 P12 untyped main returns the typed wrapper",
        r#"import { manifest_audit_passes } from "holo:absorb"

function audit(): bool {
  return manifest_audit_passes()
}

function main() {
  return audit()
}
"#,
    ),
    (
        "c3-487 A01 alias kept out of the ABI",
        r#"import { manifest_audit_passes as zz } from "holo:absorb"

function main(): bool {
  return zz()
}
"#,
    ),
    (
        "c3-487 A02 alias load",
        r#"import { manifest_audit_passes as load } from "holo:absorb"

function main(): bool {
  return load()
}
"#,
    ),
    (
        "c3-487 A03 alias move",
        r#"import { manifest_audit_passes as move } from "holo:absorb"

function main(): bool {
  return move()
}
"#,
    ),
    (
        "c3-487 A04 alias drop (statement)",
        r#"import { manifest_audit_passes as drop } from "holo:absorb"

function main(): i32 {
  drop()
  return 1
}
"#,
    ),
    (
        "c3-487 A05 alias store",
        r#"import { manifest_audit_passes as store } from "holo:absorb"

function main(): bool {
  return store()
}
"#,
    ),
    (
        "c3-487 A06 alias buffer",
        r#"import { manifest_audit_passes as buffer } from "holo:absorb"

function main(): bool {
  return buffer()
}
"#,
    ),
    (
        "c3-487 A07 alias unknown",
        r#"import { manifest_audit_passes as unknown } from "holo:absorb"

function main(): bool {
  return unknown()
}
"#,
    ),
    (
        "c3-487 A08 alias print",
        r#"import { manifest_audit_passes as print } from "holo:absorb"

function main(): bool {
  return print()
}
"#,
    ),
    (
        "c3-487 D03 name and alias of the same capability",
        r#"import { manifest_audit_passes, manifest_audit_passes as audit } from "holo:absorb"

function main(): bool {
  return audit() && manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487 D04 export function main",
        r#"import { manifest_audit_passes } from "holo:absorb"

export function main(): bool {
  return manifest_audit_passes()
}
"#,
    ),
    (
        "c3-487probe F01 add_one(41)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(41)
}
"#,
    ),
    (
        "c3-487probe F02 scale(0.1, 3)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): f32 {
  return scale(0.1, 3)
}
"#,
    ),
    (
        "c3-487probe F03 nested add_one(add_one(1))",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(add_one(1))
}
"#,
    ),
    (
        "c3-487probe F04 order scale(scale(0.5, 1), add_one(2))",
        r#"import { add_one, scale } from "holo:fixture"

function main(): f32 {
  return scale(scale(0.5, 1), add_one(2))
}
"#,
    ),
    (
        "c3-487probe F05 STRING via untyped helper into i32",
        r#"import { add_one, scale } from "holo:fixture"

function helper() {
  return "rm -rf /"
}

function main(): i32 {
  return add_one(helper())
}
"#,
    ),
    (
        "c3-487probe F06 RECORD via struct constructor into i32",
        r#"import { add_one, scale } from "holo:fixture"

struct P {
  a: i32
}

function main(): i32 {
  return add_one(P(1))
}
"#,
    ),
    (
        "c3-487probe F07 STRING via any-typed parameter",
        r#"import { add_one, scale } from "holo:fixture"

function relay(v: any): i32 {
  return add_one(v)
}

function main(): i32 {
  return relay("rm -rf /")
}
"#,
    ),
    (
        "c3-487probe F08 STRING via unknown-typed parameter",
        r#"import { add_one, scale } from "holo:fixture"

function relay(v: unknown): i32 {
  return add_one(v)
}

function main(): i32 {
  return relay("x\ny")
}
"#,
    ),
    (
        "c3-487probe F09 STRING via untyped let in typed fn",
        r#"import { add_one, scale } from "holo:fixture"

function helper() {
  return "x"
}

function main(): i32 {
  let v = helper()
  return add_one(v)
}
"#,
    ),
    (
        "c3-487probe F10 null (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(null)
}
"#,
    ),
    (
        "c3-487probe F11 1.5 (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(1.5)
}
"#,
    ),
    (
        "c3-487probe F12 3000000000 (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(3000000000)
}
"#,
    ),
    (
        "c3-487probe F13 true (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(true)
}
"#,
    ),
    (
        "c3-487probe F14 f64 into f32 (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(x: f64): f32 {
  return scale(x, 2)
}
"#,
    ),
    (
        "c3-487probe F15 string literal (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one("7")
}
"#,
    ),
    (
        "c3-487probe F16 i32 result as an if-test",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  if (add_one(1)) {
return 1
  }
  return 0
}
"#,
    ),
    (
        "c3-487probe F17 untyped fn, parameter shadow, unknown-typed argument",
        r#"import { add_one, scale } from "holo:fixture"

function check(add_one) {
  return add_one(helper())
}

function helper() {
  return "rm -rf /"
}
"#,
    ),
    (
        "c3-487probe F18 alias onto load, then load(r.count)",
        r#"import { add_one as load } from "holo:fixture"

struct R {
  count: i32
}

function main(): i32 {
  slot r: R = R(5)
  return load(r.count)
}
"#,
    ),
    (
        "c3-487probe F19 i32 arithmetic argument",
        r#"import { add_one, scale } from "holo:fixture"

function main(n: i32): i32 {
  return add_one(n + 1)
}
"#,
    ),
    (
        "c3-487probe F20 f32 arithmetic argument",
        r#"import { add_one, scale } from "holo:fixture"

function main(f: f32): f32 {
  return scale(f * 2.0, 3)
}
"#,
    ),
    (
        "c3-487probe F21 negative literal argument",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  return add_one(-1)
}
"#,
    ),
    (
        "c3-487probe F22 integer literal into f32",
        r#"import { add_one, scale } from "holo:fixture"

function main(): f32 {
  return scale(1, 2)
}
"#,
    ),
    (
        "c3-487probe F23 literal 1e39 into f32",
        r#"import { add_one, scale } from "holo:fixture"

function main(): f32 {
  return scale(1e39, 2)
}
"#,
    ),
    (
        "c3-487probe F24 i32 identifier into f32 (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(n: i32): f32 {
  return scale(n, 2)
}
"#,
    ),
    (
        "c3-487probe F25 F64 FIELD via load(r.v) into i32",
        r#"import { add_one, scale } from "holo:fixture"

struct R {
  v: f64
}

function main(): i32 {
  slot r: R = R(2.5)
  return add_one(load(r.v))
}
"#,
    ),
    (
        "c3-487probe F26 RECORD FIELD via load(o.inner) into i32",
        r#"import { add_one, scale } from "holo:fixture"

struct In {
  a: i32
}

struct Out {
  inner: In
}

function main(): i32 {
  slot o: Out = Out(In(1))
  return add_one(load(o.inner))
}
"#,
    ),
    (
        "c3-487probe F27 borrow &r into i32",
        r#"import { add_one, scale } from "holo:fixture"

struct R {
  v: i32
}

function main(): i32 {
  slot r: R = R(2)
  return add_one(&r)
}
"#,
    ),
    (
        "c3-487probe F28 i32 result && true (control)",
        r#"import { add_one, scale } from "holo:fixture"

function main(): bool {
  return add_one(1) && true
}
"#,
    ),
    (
        "c3-487probe F29 i32 result compared",
        r#"import { add_one, scale } from "holo:fixture"

function main(): bool {
  return add_one(1) < 3
}
"#,
    ),
    (
        "c3-487probe F30 BOOL via typed-bool helper? (control)",
        r#"import { add_one, scale } from "holo:fixture"

function b(): bool {
  return true
}

function main(): i32 {
  return add_one(b())
}
"#,
    ),
    (
        "c3-487probe F31 statement call with arguments",
        r#"import { add_one, scale } from "holo:fixture"

function main(): i32 {
  add_one(1)
  scale(0.5, 2)
  return 0
}
"#,
    ),
    (
        "c3-487probe F32 untyped let shadow, then a string argument via helper",
        r#"import { add_one, scale } from "holo:fixture"

function check() {
  let add_one = 0
  return add_one(helper())
}

function helper() {
  return "x"
}
"#,
    ),
];
