# Handoff: G5 — R3F trait-application fidelity (color/emissive/position/scale)

**To:** whoever owns the live `R3FCompiler.ts` Lotus work (the file has uncommitted lotus changes today — `git status` shows ` M packages/core/src/compiler/R3FCompiler.ts`, the I.007 pond/petal refactor in the 2492–2567 region). Per P.011 I stayed out and did not touch the file; this patch is in a **non-overlapping** region (~3447). **Please apply it inside your commit** so the trait fix ships with your lotus work (a `git commit --only R3FCompiler.ts` from me would have swept your in-flight changes — W.082/F.042).

**Why:** the 5-persona dogfood harness (see `research/2026-06-07_persona-dogfood-gap-map.md`, gap G5) found that `compile_to_r3f` returns success but is **lossy**: every mesh carries `__unrecognizedTraits:["color","position","scale","emissive"]` and the authored values are dropped — `@emissive("#1a5c3a")` becomes `materialProps.emissive:"#FFFFFF"`, `@color` is captured as `{_arg0:"#c2b280"}` but never applied to the material. Scenes "compile green but render wrong." The local render-verify leg also showed native-2d has the same class of loss (empty mount).

**Root cause:** the trait-processing loop in `compileObjectDecl` (the `.holo` path) has no `else if` branch for `color`/`emissive`/`position`/`scale`, so all four hit the fallthrough `else` (~line 3456) → `props[name] = trait.config` (raw `{_arg0:...}`) + pushed to `__unrecognizedTraits`. Parser shape from `HoloCompositionParser` is `{_arg0: <value>}` for a single positional trait arg.

## Patch (string-anchored — robust to line shifts)

Insert four `else if` branches **between** the `botanical_lotus` branch and the `// ── C2 Fix: Fallthrough with analysis ──` comment in `compileObjectDecl`:

```ts
        // ── I.007 closure: compile the petal material from .holo data ──
        else if (name === 'botanical_lotus') {
          this.emitCompiledLotusMaterial(props, (trait.config as Record<string, unknown>) || {});
        }
        // ── Visual traits authored as @trait(value): unwrap the parser's positional
        //    `_arg0` shape and route to the same sinks the obj.properties (key:value)
        //    path uses, so @color/@emissive drive the material instead of landing in
        //    __unrecognizedTraits with a raw {_arg0:...} config (lossy). Surfaced by
        //    the persona-dogfood harness (gap G5).
        else if (name === 'color') {
          const cfg = (trait.config || {}) as Record<string, unknown>;
          const v = '_arg0' in cfg ? cfg._arg0 : cfg.value;
          if (v !== undefined) props.color = v;
        } else if (name === 'emissive') {
          const cfg = (trait.config || {}) as Record<string, unknown>;
          const v = '_arg0' in cfg ? cfg._arg0 : cfg.value;
          if (v !== undefined) {
            const mProps = (props.materialProps || {}) as Record<string, unknown>;
            mProps.emissive = v;
            if (mProps.emissiveIntensity === undefined) mProps.emissiveIntensity = 1.0;
            props.materialProps = mProps;
          }
        } else if (name === 'position') {
          const cfg = (trait.config || {}) as Record<string, unknown>;
          const v = '_arg0' in cfg ? cfg._arg0 : cfg.value;
          if (Array.isArray(v)) props.position = v;
        } else if (name === 'scale') {
          const cfg = (trait.config || {}) as Record<string, unknown>;
          const v = '_arg0' in cfg ? cfg._arg0 : cfg.value;
          if (Array.isArray(v)) props.scale = v;
          else if (typeof v === 'number') props.scale = [v, v, v];
        }
        // ── C2 Fix: Fallthrough with analysis ──────────────────────
```

Design notes: emissive routes to `materialProps` (not top-level) because the renderer does `Object.assign(matProps, props.materialProps)` last (SceneViewer.tsx:68) — top-level would be clobbered. `emissiveIntensity` default only when unset. Merges into existing `materialProps` so it composes with `@material(...)`.

**Secondary (out of scope, flag):** the AST/`directives` path `compileNode`→`compileProperties` (~4128) has the same missing handlers with **no** fallthrough, so `@color`/`@emissive` are silently ignored there if `compile_to_r3f` is ever fed `.hs`/AST input. Separate fix.

## Validation
```
pnpm --filter @holoscript/core build
pnpm --filter @holoscript/core test -- R3FCompiler
```
Add a case to `packages/core/src/compiler/R3FCompiler.lotusEmission.test.ts` (it already has the parse→compileComposition→assert-materialProps pattern): parse an object with `@color("#c2b280") @emissive("#1a5c3a")`, assert `props.color === "#c2b280"`, `props.materialProps.emissive === "#1a5c3a"`, `emissiveIntensity === 1.0`, and none of color/emissive/position/scale in `__unrecognizedTraits`.

— claude, 2026-06-07 (companion to the G1/G2/G4/G7 fixes shipped in mcp-server commit 1702f4bc4)
