# 2D Web Page Constructs Reference (`.holo`)

`.holo` is the universal intermediate representation consumed by all platform compilers. Alongside 3D/VR scene authoring, `.holo` supports declarative 2D web page composition with constructs that compile to native web UI — either static HTML/CSS or React (`.tsx`) components.

This document covers the web-authoring surface: `@page`, `@panel`, `@slot`, `@tailwind`, and the broader reactive-composition trait vocabulary that `Native2DCompiler` and `NextJSCompiler` understand.

---

## How `.holo` reaches a 2D web target

Every `.holo` file parses into a `HoloComposition` AST. Compiler selection happens at the MCP/CLI call site, not in the file itself. The same `.holo` file can compile to multiple targets:

| Target | Compiler | Output |
|---|---|---|
| Static HTML page | `Native2DCompiler` (format: `html`) | Self-contained `.html` with inlined Tailwind-compatible CSS and a vanilla fetch runtime |
| React component | `Native2DCompiler` (format: `react`) | A `.tsx` functional component with React hooks |
| Next.js App Router page | `NextJSCompiler` | A `<route>/page.tsx` file with `'use client'`, optional `metadata` export, and `next/navigation` imports |
| WebXR / R3F | `R3FCompiler` | Three.js scene graph — ignores 2D traits |

When a `.holo` composition contains no 3D-specific constructs (`environment`, `light`, spatial position/scale/rotation), the 2D target is the natural choice. When both 2D traits (`@panel`, `@text`) and 3D constructs coexist, the 2D compilers ignore the 3D elements and vice versa.

---

## `@page` — Route and page metadata

**Parser status:** Captured as a root-level `ObjectTrait` in `composition.traits[]`. The parser does not type-specialize `@page`; it collects the trait name and its config block as a generic `HoloObjectTrait`. `NextJSCompiler.findTrait(composition, 'page')` reads it from that array at compile time.

`@page` can appear in two positions:

### Outside the `composition` block (implicit composition syntax)

```holo
@page({ route: "/settings" })
composition "settings" {
  // ...
}
```

### Inside the `composition` block (decorator at composition level)

```holo
composition "PipelineEditor" {
  @page { route: "/pipeline" }
  // ...
}
```

Both forms are accepted by the parser. The first form uses the `@decorator(...)` syntax with parentheses; the second uses a block body `@page { ... }`. Both round-trip to the same AST node.

### `@page` config keys

| Key | Type | Description |
|---|---|---|
| `route` | `string` | URL path for the Next.js App Router page. Defaults to `/<composition-name-lowercased>`. |
| `client` | `boolean` | When `true` (the default), emits `'use client'` at the top of the generated file and suppresses the `metadata` export. Set `false` for server components. |
| `redirect` | `string` | When set, generates a redirect-only page (`redirect()` from `next/navigation`) with no content. |

### Minimal redirect page

```holo
@page {
  route: "/holoclaw"
  redirect: "/teams"
}
```

Compiles to a Next.js file that redirects `/holoclaw` → `/teams` with no React component body.

---

## `@panel` — Semantic HTML container

**Parser status:** Collected as an `ObjectTrait` on an `HoloObjectDecl` node. Fully implemented — `Native2DCompiler` reads `traits.panel` on every object node during code generation.

`@panel` marks an object as an HTML container element. Without `@panel`, an object defaults to a `<div>`. With `@panel`, you can name the specific HTML5 semantic element via the `tag` key.

```holo
object "Header" {
  @panel { tag: "header" }
  @theme { style: "display:flex; gap:16px; align-items:baseline" }

  object "Title" {
    @text { variant: "h1", content: "Founder Console" }
  }
}
```

### `@panel` config keys

| Key | Type | Description |
|---|---|---|
| `tag` | `string` | HTML element to emit. Any valid HTML5 tag is accepted. Common values: `"div"` (default), `"main"`, `"header"`, `"footer"`, `"section"`, `"article"`, `"nav"`, `"form"`. |

The element selection waterfall in `Native2DCompiler`:

1. `@theme { tag: ... }` — explicit override (highest priority)
2. `@panel { tag: ... }` — semantic container
3. `@button` trait present → `<button>`
4. `@link` trait present → `<a>`
5. `@image` trait present → `<img>`
6. `@input` trait present → `<input>`
7. `@text` trait present → element from `mapTextVariantToTag()` (see below)
8. Fallback → `<div>`

### Studio panel shell pattern (W.712)

The 84+ Studio panels in `packages/studio/src/lib/studio/panels/*.holo` follow a minimal metadata-shell pattern. Each is a 4-line file:

```holo
@view({ id: "chat", title: "Brittney Chat", icon: "MessageCircle", category: "assistant",
        placement: "right-rail", scope: "workspace", gate: "always",
        surfaceClass: "core-workbench", defaultOpen: true, exclusiveWith: [], order: 1 })
composition "chat" {
  // @slot widget mount pending — registry metadata migrated, render-wiring is the follow-on step
}
```

The `@view` decorator carries the panel registry metadata (id, title, icon, placement category). The actual UI render is either a pending `@slot` mount or a full reactive composition. These are metadata declarations consumed by the Studio panel registry, not by `Native2DCompiler`.

---

## `@slot` — Hand-written component mount point

**Parser status:** Collected as an `ObjectTrait` on `HoloObjectDecl`. Fully implemented — `Native2DCompiler.generateReactNode()` has a dedicated `if (traits.slot)` branch that generates the component import and JSX.

`@slot` is the escape hatch for UI that is too dynamic or auth-coupled to express declaratively in `.holo`. It compiles to a named React component reference with auto-generated imports.

```holo
object "PipelineWorkbench" {
  @slot
}
```

When no config is provided, the object name becomes the slot name and the component name, with the import path defaulting to `@/components/<ComponentName>`.

```holo
object "SignInView" @slot(component: "SignInView", import: "@/components/auth/SignInView") {}
```

Inline trait syntax with explicit component and import path.

### `@slot` config keys

| Key | Type | Description |
|---|---|---|
| `name` | `string` | Slot identity key. Defaults to the object's `name`. Used to look up the slot in the compiler's slot registry. |
| `component` | `string` | React component name to import and render. Defaults to the slot name. |
| `import` | `string` | Module path for the `import` statement. Defaults to `@/components/<component>`. |
| `props` | `object` | Nested props object passed to the component via spread. |
| *(any other key)* | *any* | Flat scalar props forwarded to the component via spread. |

### Compiler-side slot registry

`NextJSCompiler` and `Native2DCompiler` accept a `slots` option at instantiation:

```ts
const compiler = new NextJSCompiler({
  slots: {
    PipelineWorkbench: {
      component: 'PipelineWorkbench',
      importPath: '@/components/pipeline/PipelineWorkbench',
    },
  },
});
```

When a slot's config in the `.holo` file matches a registry entry by name, the registry values override the defaults from the file. This lets the build system control import paths without encoding them in source.

### Generated output

For `object "PipelineWorkbench" { @slot }` with the registry entry above:

```tsx
import { PipelineWorkbench } from '@/components/pipeline/PipelineWorkbench';

// ...inside the component JSX:
<div data-holo-slot="PipelineWorkbench">
  <PipelineWorkbench />
</div>
```

### When to use `@slot`

Use `@slot` when the content requires:
- Runtime-dynamic data that cannot be expressed with `@fetch` (e.g. `getProviders()`)
- Next.js-specific primitives (`signIn()`, `useSearchParams()`, `redirect()`)
- Per-provider conditional rendering (e.g. OAuth icons)
- Complex imperative UI that would be harder to maintain as `.holo` than as a hand-written component

Auth pages and complex editor panels are the canonical examples in the codebase.

---

## `@tailwind` — Tailwind utility class injection

**Parser status:** Collected as an `ObjectTrait`. Fully implemented in `Native2DCompiler.buildClasses()`.

`@tailwind` appends arbitrary Tailwind utility classes to the compiled element's `className`. It is the lowest-level escape hatch for styling — use `@theme { className: "..." }` when the class string belongs to a theme token; use `@tailwind` when you want to inject classes without the full `@theme` block.

### Block config syntax

```holo
object "Card" {
  @panel { tag: "article" }
  @tailwind { classes: "rounded-2xl bg-gray-900 p-6 shadow-lg" }
}
```

### Positional string syntax

```holo
object "Card" {
  @tailwind("rounded-2xl bg-gray-900 p-6 shadow-lg")
}
```

The compiler normalizes both forms to `{ classes: "<string>" }` before processing (`extractTraits()` at line 1106 in `Native2DCompiler.ts`).

### Bundled utility CSS

When compiling to HTML format (`format: 'html'`), `Native2DCompiler` inlines a bundled subset of Tailwind-compatible utility CSS into `<style>` in the `<head>`. This covers the most common layout, typography, color, spacing, border, and shadow utilities. No CDN dependency is needed for HTML output.

When compiling to React format (`format: 'react'`), the output assumes the host project provides Tailwind CSS through its own build pipeline (e.g. `tailwind.config.ts` in Next.js).

---

## `@metadata` — SEO and Open Graph metadata

**Parser status:** Captured as a root-level `ObjectTrait`. Read by `NextJSCompiler` alongside `@page`.

```holo
composition "AboutPage" {
  @page { route: "/about", client: false }
  @metadata { title: "About Us", description: "Learn more about HoloScript" }

  object "Body" {
    @panel { tag: "main" }
    // ...
  }
}
```

When `client: false` is set on `@page`, `NextJSCompiler` emits a `metadata` export from the generated file:

```tsx
export const metadata = {
  title: "About Us",
  description: "Learn more about HoloScript",
};
```

If `client: true` (the default), the `metadata` export is suppressed because Next.js does not support `metadata` in client components.

### `@metadata` config keys

| Key | Type | Description |
|---|---|---|
| `title` | `string` | Page title. Emitted to `metadata.title`. |
| `description` | `string` | Page description. Emitted to `metadata.description`. |

---

## Reactive-composition trait vocabulary

The 2D web surface has a full reactive-composition vocabulary beyond `@panel`, `@slot`, and `@tailwind`. All traits below are consumed by `Native2DCompiler` and listed in `NATIVE2D_TRAITS` in `packages/core/src/traits/knownTraitSet.ts`.

### `@text` — Text content

```holo
object "Title" {
  @text { variant: "h1", content: "Hello World" }
}
```

| Key | Type | Description |
|---|---|---|
| `variant` | `"h1" \| "h2" \| "h3" \| "subtitle" \| "caption" \| "emoji" \| "body"` | Maps to `h1`–`h4`, `span`, or `p`. Also drives Tailwind class injection. |
| `content` | `string` | Text content. Supports <code v-pre>{{field}}</code> interpolation when inside an `@fetch` container. |
| `align` | `string` | CSS `text-align` value. |
| `maxWidth` | `string \| number` | CSS `max-width`. |
| `weight` | `string` | CSS `font-weight`. |

### `@theme` — Inline styling and class assignment

```holo
object "Card" {
  @theme { className: "lift-card", style: "border:1px solid #e5e7eb; border-radius:12px; padding:16px" }
}
```

| Key | Type | Description |
|---|---|---|
| `className` | `string` | CSS class string appended to the element. |
| `style` | `string` | Inline CSS string (semicolon-separated `property:value` pairs). Parsed and emitted as a React `style` object in React output. |
| `tag` | `string` | Override the HTML element tag (highest-priority over `@panel { tag }` and trait-based tag inference). |
| `id` | `string` | HTML `id` attribute. |
| `attributes` | `string` | JSON object string of additional HTML attributes, e.g. `'{"data-testid": "main"}'`. |
| `backgroundColor` | `string` | CSS `background-color`. |
| `color` | `string` | CSS `color`. |
| `padding` | `string \| number` | CSS `padding`. |
| `borderRadius` | `string \| number` | CSS `border-radius`. |
| `border` | `string` | CSS `border`. |

### `@layout` — Flexbox and grid containers

```holo
object "Shell" {
  @layout { flex: "column" }
}
```

| Key | Type | Description |
|---|---|---|
| `flex` | `"row" \| "column"` | Sets `display:flex` and `flex-direction`. |
| `grid` | `boolean` | Sets `display:grid`. |
| `columns` | `number` | When `grid: true`, sets `grid-template-columns: repeat(N, minmax(0, 1fr))`. |
| `justify` | `string` | CSS `justify-content`. |
| `align` | `string` | CSS `align-items`. |
| `gap` | `string \| number` | CSS `gap`. |
| `padding` | `string \| number` | CSS `padding`. |

### `@button` — Button element

```holo
object "Approve" {
  @button { content: "Approve", onClick: "window.open('{{url}}')", variant: "primary" }
}
```

| Key | Type | Description |
|---|---|---|
| `content` | `string` | Button label text. |
| `onClick` | `string` | Click handler expression. `"navigate('/path')"` → `onClick={() => navigate('/path')}`. |
| `variant` | `"primary" \| "outline" \| "ghost" \| "glow"` | Button style preset — drives Tailwind class injection. |
| `size` | `"sm" \| "lg"` | Size preset. |
| `type` | `string` | HTML `type` attribute. |

### `@link` — Anchor element

```holo
object "Nav" {
  @link { href: "/about", content: "About" }
}
```

| Key | Type | Description |
|---|---|---|
| `href` | `string` | `href` attribute. |
| `content` | `string` | Link text. |

### `@image` — Image element

```holo
object "Avatar" {
  @image { src: "/avatar.png", alt: "User avatar" }
}
```

| Key | Type | Description |
|---|---|---|
| `src` | `string` | `src` attribute. |
| `alt` | `string` | `alt` attribute. |

### `@input` — Input element

```holo
object "EmailField" {
  @input { type: "email", placeholder: "you@example.com", required: true }
}
```

| Key | Type | Description |
|---|---|---|
| `type` | `string` | HTML `type` attribute. |
| `placeholder` | `string` | Placeholder text. |
| `required` | `boolean` | HTML `required` attribute. |

### `@fetch` — Live data binding

Declares a `useEffect`+`fetch` call (React output) or a vanilla-JS live-list runtime (HTML output). The parent object becomes the list container; its first child object is the row template.

```holo
object "Inbox" {
  @panel { tag: "section" }
  @fetch { into: "items", endpoint: "/api/quest-proof/inbox", method: "GET" }

  object "Row" {
    @panel { tag: "article" }
    object "Label" { @text { variant: "h3", content: "{{label}}" } }
  }
}
```

| Key | Type | Description |
|---|---|---|
| `into` | `string` | State variable name that receives the fetched array. Also used as the `data-holo-into` attribute in HTML output for `@count_of` bindings. |
| `endpoint` | `string` | URL to fetch. |
| `method` | `string` | HTTP method. Defaults to `"GET"`. |

In HTML output, a vanilla-JS runtime in the generated `<script>` block handles the fetch, clones the first `[data-holo-template]` child per item, and interpolates <code v-pre>{{field}}</code> (including dotted paths like <code v-pre>{{vetting.glance}}</code>). No React, no hydration.

### `@bind` — Reactive state binding

Reads from a React state variable and emits a JSX expression that updates on every render.

```holo
object "Score" {
  @bind { state: "profile.fps", prefix: "FPS: ", precision: 1 }
}
```

| Key | Type | Description |
|---|---|---|
| `state` | `string` | Dot-path into state variables (e.g. `"score"`, `"profile.fps"`). |
| `prefix` | `string` | Static string prepended before the value. |
| `suffix` | `string` | Static string appended after the value. |
| `precision` | `integer` | Decimal places — emits `.toFixed(N)`. |
| `tiers` | `array` | Threshold-conditional className: `[{ gte: 60, className: "text-green-400" }, { lt: 30, className: "text-red-400" }, { className: "text-amber-400" }]`. First match wins. |

### `@hook` — React hook injection

Calls a React hook at the top of the generated component and destructures its return value into named consts that `@bind` can read.

```holo
object "Profiler" {
  @hook { name: "useProfiler", import: "@/hooks/useProfiler", returns: "snap" }
  @bind { state: "snap.fps", suffix: " FPS" }
}
```

| Key | Type | Description |
|---|---|---|
| `name` | `string` | Hook function name (must be a valid JS identifier). |
| `import` | `string` | Module path for the import statement. |
| `returns` | `string` | Comma-separated list of destructured names from the hook's return value. |

### `@when` — Conditional render

Wraps the element in a React short-circuit expression.

```holo
object "ErrorBanner" {
  @when { state: "error" }
  @text { content: "Something went wrong." }
}
```

| Key | Type | Description |
|---|---|---|
| `state` | `string` | State path. The element renders only when this value is truthy. |

### `@each` — List iteration

Wraps the element in a `.map()` over a bound array state variable.

```holo
object "Item" {
  @each { state: "items", as: "item" }
  @text { content: "{{item.name}}" }
}
```

| Key | Type | Description |
|---|---|---|
| `state` | `string` | State variable holding the array to iterate. |
| `as` | `string` | Loop variable name. Defaults to `"item"`. |

### `@count_of` — Dynamic count display

In HTML output, tracks the item count from an `@fetch` binding and updates a counter element.

```holo
object "PendingCount" {
  @text { content: "0" }
  @count_of { source: "items" }
}
```

| Key | Type | Description |
|---|---|---|
| `source` | `string` | The `into` value from the `@fetch` trait on a sibling or parent container. |

### `@view` — Panel registry metadata

Used by Studio panel `.holo` shells to declare panel identity without triggering the `Native2DCompiler` render path. The Studio panel registry reads this trait to position and label panels in the editor UI.

```holo
@view({ id: "chat", title: "Brittney Chat", icon: "MessageCircle", category: "assistant",
        placement: "right-rail", scope: "workspace", gate: "always",
        surfaceClass: "core-workbench", defaultOpen: true, exclusiveWith: [], order: 1 })
composition "chat" {
  // render-wiring pending — see W.712
}
```

`@view` is distinct from `@page`: `@page` configures Next.js routing; `@view` configures the Studio panel slot system.

---

## `@page` placement: file-level vs inside `composition`

The parser handles both forms. The choice is stylistic:

```holo
// Form 1: file-level decorator (implicit composition)
@page({ route: "/settings" })
composition "settings" {
  // ...
}

// Form 2: decorator inside composition block
composition "PipelineEditor" {
  @page { route: "/pipeline" }
  // ...
}
```

Both parse into identical AST nodes (`composition.traits[]` containing an `ObjectTrait` with `name: 'page'`). `NextJSCompiler.findTrait()` reads from the same location regardless.

---

## Complete 2D page example

Derived from `packages/studio/src/app/quest-proof/native/founder-console.holo`:

```holo
composition "FounderConsole" {
  object "Root" {
    @panel { tag: "main" }
    @theme { style: "padding:24px; max-width:680px; margin:0 auto; font-family:system-ui,-apple-system,sans-serif" }

    object "Header" {
      @panel { tag: "header" }
      @theme { style: "display:flex; gap:16px; align-items:baseline; margin-bottom:20px" }
      object "Title" { @text { variant: "h1", content: "Founder Console" } }
      object "PendingCount" {
        @text { content: "0" }
        @count_of { source: "items" }
        @theme { style: "color:#d97706; font-weight:700; font-size:20px" }
      }
    }

    object "Inbox" {
      @panel { tag: "section" }
      @fetch { into: "items", endpoint: "/api/quest-proof/inbox", method: "GET" }

      object "Row" {
        @panel { tag: "article" }
        @theme { className: "lift-card", style: "border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px" }
        object "Label" { @text { variant: "h3", content: "{{label}}" } }
        object "Badge" {
          @text { content: "{{vetting.glance}}" }
          @theme { style: "color:#16a34a; font-size:13px; display:block; margin:6px 0" }
        }
        object "Approve" {
          @button { content: "Approve", onClick: "window.open('{{url}}')" }
          @theme { className: "glow-btn", style: "background:#16a34a; color:#fff; border:none; border-radius:8px; padding:8px 18px; cursor:pointer" }
        }
      }
    }
  }
}
```

This compiles to a self-contained HTML page with zero framework dependencies. The `@fetch` runtime fetches `/api/quest-proof/inbox` after DOM load, clones the `Row` template per item, and interpolates <code v-pre>{{field}}</code> placeholders.

---

## Current implementation status

| Construct | Parser | Native2DCompiler (HTML) | Native2DCompiler (React) | NextJSCompiler |
|---|---|---|---|---|
| `@page` | Captured as generic trait | Not consumed | Not consumed | Fully consumed (route, client, redirect) |
| `@metadata` | Captured as generic trait | Not consumed | Not consumed | Fully consumed (title, description) |
| `@panel` | Captured as object trait | Fully consumed | Fully consumed | Via Native2DCompiler |
| `@slot` | Captured as object trait | Not consumed | Fully consumed | Fully consumed (imports, JSX, props) |
| `@tailwind` | Captured as object trait | Fully consumed | Fully consumed | Via Native2DCompiler |
| `@text` | Captured as object trait | Fully consumed | Fully consumed | Via Native2DCompiler |
| `@theme` | Captured as object trait | Fully consumed | Fully consumed | Via Native2DCompiler |
| `@layout` | Captured as object trait | Fully consumed | Fully consumed | Via Native2DCompiler |
| `@button` | Captured as object trait | Fully consumed | Fully consumed | Via Native2DCompiler |
| `@fetch` | Captured as object trait | Vanilla-JS runtime | `useEffect`+`useState` | Via Native2DCompiler |
| `@bind` | Captured as object trait | Not consumed | Fully consumed | Via Native2DCompiler |
| `@hook` | Captured as object trait | Not consumed | Fully consumed | Via Native2DCompiler |
| `@when` | Captured as object trait | Not consumed | Fully consumed | Via Native2DCompiler |
| `@each` | Captured as object trait | Not consumed | Fully consumed | Via Native2DCompiler |
| `@view` | Captured as root-level trait | Not consumed | Not consumed | Not consumed (Studio registry only) |
| `@count_of` | Captured as object trait | Fully consumed | Not consumed | Via Native2DCompiler (HTML only) |

**Parser note:** "Captured as generic trait" means the parser stores the decorator in `composition.traits[]` (root-level) or `object.traits[]` (object-level) as an `HoloObjectTrait { name, config }`. There is no dedicated AST node type for `@page`, `@slot`, etc. — they are read by compilers via name lookup at compile time. This is the intentional design: the parser is domain-agnostic; compilers are domain-specific.

**LSP note:** All traits listed in this document are in `NATIVE2D_TRAITS` in `packages/core/src/traits/knownTraitSet.ts`, so the language server and parser will not emit "Unknown trait" warnings for them.
