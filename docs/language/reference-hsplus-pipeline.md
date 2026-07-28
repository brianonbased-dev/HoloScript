# Pipeline DSL Reference (`.hs` / `.hsplus`)

The Pipeline DSL is a declarative data-flow sub-language embedded inside `.hs`
and `.hsplus` files. It expresses ETL-style processing — sources feed records
through transforms, filters, branches, and validates, and out to sinks — without
writing imperative control flow.

The parser (`packages/core/src/parser/PipelineParser.ts`) understands a named
`pipeline` block at the top level of any `.hs` file. The four block types
`transform`, `filter`, `branch`, and `validate` are also dispatched by the
`.hsplus` parser (`HoloScriptPlusParser.ts` line 1618) when they appear inside a
`.hsplus` module; they use a dedicated parser path for their non-standard body
syntax (mapping arrows, when-guards, constraint rules).

The compiler (`packages/core/src/parser/PipelineCompiler.ts`) targets Node.js
ES modules (node-cron for scheduling, native `fetch` for HTTP). Additional
compilation targets (Python, Lambda, Cloudflare Worker, Docker, K8s CronJob)
are listed in the compiler header.

---

## Top-Level Structure

Every pipeline begins with a named `pipeline` block. The name may be a bare
identifier or a quoted string.

```hs
pipeline "InventorySync" {
  // Pipeline-level options
  schedule: "*/5 * * * *"   // cron expression
  timeout: 30s               // duration: <N>(s|m|h|d)
  retry: { max: 3, backoff: "exponential" }

  // Optional parameter block — interpolated at run time
  params {
    api_url: "${env.API_URL:-https://api.example.com}"
    top_n:   "${env.TOP_N:-5}"
  }

  // Blocks: source, merge, transform, filter, validate, branch, sink
  // (each described in detail below)
}
```

### Pipeline-level options

| Key        | Type          | Description                                                       |
| ---------- | ------------- | ----------------------------------------------------------------- |
| `schedule` | cron string   | When to run (e.g. `"*/5 * * * *"`, `"0 6 * * *"`)                 |
| `timeout`  | duration      | Maximum run time; format: `<N>s`, `<N>m`, `<N>h`, `<N>d`          |
| `retry`    | inline object | `{ max: <N>, backoff: "none" \| "linear" \| "exponential" }`      |
| `params`   | named block   | Key-value pairs expanded via `${params.key}` in subsequent blocks |

---

## Block Types

A pipeline is required to have at least one `source` and at least one `sink`;
all other blocks are optional. Blocks may appear in any order — the compiler
canonicalises them as `sources → merges → transforms → filters → validates →
branches → sinks`.

---

### `source` — Pull records into the pipeline

Sources are the ingress points. The parser accepts multiple `source` blocks; at
run time they are executed in declaration order and their records are
concatenated into the pipeline's working set.

```hs
source POS {
  type: "rest"
  endpoint: "${env.POS_API_URL}/products"
  method: "GET"
  auth: { type: "bearer", token: "${env.POS_TOKEN}" }
  pagination: { type: "cursor", param: "after", limit: 100 }
}
```

**`type` values**

| Value          | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `"rest"`       | HTTP request — pairs with `endpoint`, `method`, `auth`         |
| `"webhook"`    | Alias for `rest`; semantically inbound HTTP                    |
| `"stream"`     | SSE / NDJSON / chunked-JSON endpoint — parsed line-by-line     |
| `"filesystem"` | Directory scan — pairs with `path`, `pattern`, `since`         |
| `"database"`   | PostgreSQL via `pg` — pairs with `connection`, `query`         |
| `"mcp"`        | HoloScript MCP tool call — pairs with `server`, `tool`, `args` |
| `"list"`       | Static inline array — pairs with `items: [...]`                |
| `"stdout"`     | No-op placeholder (testing)                                    |
| `"user_input"` | Interactive prompt (runtime-specific)                          |

**Common properties**

| Property                 | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `endpoint`               | URL; supports `${…}` interpolation                                                  |
| `method`                 | HTTP verb (default `"GET"`)                                                         |
| `path`                   | Filesystem path                                                                     |
| `pattern`                | Glob pattern for filesystem scan (e.g. `"*.md"`)                                    |
| `since`                  | Relative time cutoff for filesystem scan (e.g. `"24h"`)                             |
| `auth`                   | Inline object: `{ type: "bearer" \| "oauth2" \| "api_key" \| "basic", token: "…" }` |
| `pagination`             | `{ type: "cursor" \| "offset", param: "…", limit: <N> }`                            |
| `items`                  | Array literal for `type: "list"`                                                    |
| `output`                 | Variable name to bind the source response body for subsequent blocks                |
| `server`, `tool`, `args` | MCP source: server name, tool name, argument object                                 |

**MCP source example**

```hs
source TargetLookup {
  type: "mcp"
  server: "bio-research"
  tool: "chembl__target_search"
  args: {
    gene_symbol: "${params.target_gene}"
    organism:    "${params.organism}"
    limit:       1
  }
  output: target_result
}
```

**Filesystem source example**

```hs
source ResearchFiles {
  type: "filesystem"
  path: "${env.WORKSPACE}/research/"
  pattern: "*.md"
  since: "24h"
}
```

---

### `merge` — Combine multiple sources

`merge` joins the records from two or more named sources into a single stream.

```hs
merge AllMentions {
  from: [Twitter, Moltbook]
  dedup: { key: "content_hash", window: "24h" }
  strategy: "concat"    // "concat" | "zip" | "latest" (optional)
}
```

| Property   | Description                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `from`     | Array of source or merge names to combine                                                                      |
| `dedup`    | Optional: `{ key: "<field>", window: "<duration>" }` — drop records whose `key` field was seen within `window` |
| `strategy` | `"concat"` (default) / `"zip"` / `"latest"`                                                                    |

---

### `transform` — Map and reshape records

`transform` blocks reshape each record passing through the pipeline. There are
two distinct syntaxes depending on the transform type.

#### Field-mapping transform (arrow syntax)

When the body contains arrow (`->`) statements, the block is interpreted as a
`type: "field_mapping"` transform. Each line maps one field to another, with
optional chained transform operations separated by `:`.

```hs
transform MapFields {
  sku       -> productId
  qty       -> stock
  unit_cost -> costCents : multiply(100)
  name      -> displayName : trim() : titleCase()
  category  -> tags : split(",") : trim()
  updated   -> lastSync : toISO()
}
```

Syntax of a mapping line:

```
<source-path> -> <dest-path> : <op>() : <op>()  // ops are chained with :
```

Paths may be dotted (`hit.molecule_chembl_id`) and may carry an array-unwrap
suffix (`entries[]`) to spread an array into individual records:

```hs
transform Flatten {
  entries[] -> entry   // spreads each element of `entries` into a separate record
}
```

A literal array may appear on the left-hand side:

```hs
transform BuildBindingSite {
  [790, 797, 858] -> binding.residues
}
```

Expressions may also appear on the left-hand side for concatenation:

```hs
transform BuildBindingSite {
  target.chembl_id + "-" + drug.chembl_id -> binding.id
}
```

#### Typed transform (property syntax)

When `type:` is present, the block uses the standard property syntax.

```hs
transform Classify {
  type: "llm"
  model: "${env.LLM_MODEL}"
  prompt: "Classify this mention as: question, feedback, bug_report, praise, spam"
  input: content
  output: category
}
```

**`type` values for typed transforms**

| Value             | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `"llm"`           | Call an LLM — pairs with `model`, `prompt`, `input`, `output`    |
| `"mcp"`           | Call an MCP tool — pairs with `server`, `tool`, `args`, `output` |
| `"http"`          | HTTP fetch — pairs with `url`, `method`, `timeout`, `output`     |
| `"field_mapping"` | Explicit; inferred automatically when mappings are present       |

**LLM transform properties**

| Property | Description                                           |
| -------- | ----------------------------------------------------- |
| `model`  | Model identifier (e.g. `"claude-sonnet-4-6"`)         |
| `prompt` | Prompt string; supports `\|` heredoc for multi-line   |
| `input`  | Field name from the current record to pass as content |
| `output` | Field name to write the response into                 |

Multi-line prompt with heredoc (`|`):

```hs
transform ExtractInsights {
  type: "llm"
  model: "claude-sonnet-4-6"
  prompt: |
    Extract wisdom (W), patterns (P), and gotchas (G) from this content.
    Return JSON array: [{type, id, content, confidence, domain, tags}]
    Only extract insights with confidence > 0.7.
  input: content
  output: entries
}
```

**HTTP transform properties**

| Property  | Description                                            |
| --------- | ------------------------------------------------------ |
| `url`     | URL; supports `${…}` interpolation                     |
| `method`  | HTTP verb                                              |
| `timeout` | Duration (e.g. `5s`)                                   |
| `output`  | Inline object mapping response fields to record fields |

```hs
transform HealthCheck {
  type: "http"
  method: "GET"
  url: "${item.url}"
  timeout: 5s
  output: {
    service: "${item.name}"
    status:  "${response.status}"
    ok:      "${response.json.status == 'healthy'}"
    latency: "${response.duration_ms}"
  }
}
```

**MCP transform properties**

| Property | Description                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------- |
| `server` | MCP server name                                                                                   |
| `tool`   | Tool name                                                                                         |
| `args`   | Argument object (supports `${…}` interpolation)                                                   |
| `output` | Variable name to bind the tool response                                                           |
| `where`  | Post-call guard — records not matching are dropped (e.g. `existing.results[0].similarity < 0.85`) |

---

### `filter` — Drop records that do not match

`filter` keeps only records where the `where` expression is truthy. The
expression is a bare comparison or logical combination; field names are resolved
against the current record automatically.

```hs
filter StockChanged {
  where: stock != previous.stock
      || costCents != previous.costCents
}
```

```hs
filter NotSpam {
  where: category != "spam"
}
```

```hs
filter Unhealthy {
  where: ok == false || latency > 5000
}
```

The `where` value is a single property spanning as many lines as needed. Only
`//` line comments, comparisons (`==`, `!=`, `>`, `<`, `>=`, `<=`), logical
operators (`||`, `&&`), and string/number literals are accepted; `{`, `;`, and
arrow functions are rejected as unsafe and cause all records to pass.

---

### `validate` — Assert field constraints, reject invalid records

`validate` declares per-field rules. Records that violate any rule are rejected
before reaching subsequent blocks or sinks. Each line inside the block is:

```
<field-path> : <rule>, <rule(arg)>, ...
```

```hs
validate Inventory {
  productId : required, string, minLength(3)
  stock     : required, integer, min(0)
  costCents : required, integer, min(0)
}
```

Dotted paths are supported:

```hs
validate DiseaseResolved {
  disease.efo_id : required, string, startsWith("EFO_")
  disease.type   : required, equals("disease")
}
```

Rules are arbitrary identifiers optionally followed by a single argument in
parentheses. The compiler emits them as runtime assertions; custom rule
implementations are registered at the execution layer.

---

### `branch` — Route records to different sinks

`branch` evaluates `when` conditions in declaration order and routes each record
to the first matching sink. A `default` route is the catch-all.

```hs
branch Route {
  when category == "bug_report" -> sink GitHub
  when category == "question"   -> sink KnowledgeBase
  default                       -> sink Dashboard
}
```

```hs
branch Severity {
  when consecutive >= 3 -> sink PagerDuty
  when consecutive >= 1 -> sink Slack
  default               -> sink Log
}
```

Syntax of a route line:

```
when <condition> -> sink <SinkName>
default          -> sink <SinkName>
```

The condition is a bare expression (same rules as `filter where`). The target
must name a `sink` block declared elsewhere in the same pipeline.

---

### `sink` — Write records to a destination

Sinks are the egress points. Multiple sinks are allowed; when no `branch` is
present, all records flow to all sinks.

```hs
sink Storefront {
  type: "rest"
  endpoint: "${env.STORE_API}/inventory"
  method: "PATCH"
  batch: { size: 50, parallel: 3 }
  on_error: { action: "log", continue: true }
}
```

**`type` values**

| Value          | Description                                                           |
| -------------- | --------------------------------------------------------------------- |
| `"rest"`       | HTTP POST/PATCH/PUT — pairs with `endpoint`, `method`, `auth`, `body` |
| `"webhook"`    | Alias for `rest` with a pre-built `body`                              |
| `"mcp"`        | HoloScript MCP tool call                                              |
| `"filesystem"` | Write to disk — pairs with `path`, `format`, `append`                 |
| `"database"`   | Write to PostgreSQL                                                   |
| `"stdout"`     | Print JSON to stdout (debugging)                                      |
| `"holo"`       | Emit a `.holo` composition file — pairs with `path`, `template`       |

**Common sink properties**

| Property                 | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `endpoint`               | URL for `rest` / `webhook`                                                     |
| `method`                 | HTTP verb (default `"POST"`)                                                   |
| `auth`                   | Same inline auth object as `source`                                            |
| `body`                   | Inline object; values support `${…}` interpolation                             |
| `batch`                  | `{ size: <N>, parallel: <N> }` — batch records before sending                  |
| `on_error`               | `{ action: "log" \| "retry" \| "dead_letter", continue: true \| false }`       |
| `path`                   | Filesystem path for `filesystem` / `holo` sink                                 |
| `format`                 | `"json"` / `"jsonl"` / `"csv"` for filesystem sink                             |
| `append`                 | `true` to append rather than overwrite                                         |
| `server`, `tool`, `args` | MCP sink — same as MCP source                                                  |
| `template`               | Multi-line `.holo` composition body for `type: "holo"` (supports heredoc `\|`) |
| `hash`                   | When set, the compiler attaches a SHA-256 hash of the emitted file             |

**MCP sink example**

```hs
sink KnowledgeStore {
  type: "mcp"
  server: "mcp-orchestrator"
  tool: "knowledge_sync"
  args: {
    workspace_id: "ai-ecosystem"
    entries: "${batch}"
  }
  batch: { size: 20 }
}
```

**Chained sink (`then`)**

An MCP sink can chain a second sink in the `then` field to act on the tool's
response:

```hs
sink KnowledgeBase {
  type: "mcp"
  server: "holoscript-tools"
  tool: "absorb_query"
  args: { search: "${content}", limit: 3 }
  then: sink Reply {
    type: "rest"
    endpoint: "${source.reply_url}"
    method: "POST"
    body: { content: "${result.answer}" }
  }
}
```

**Holo composition sink**

```hs
sink HoloComposition {
  type: "holo"
  path: "output/${target.chembl_id}-${drug.chembl_id}.holo"
  template: |
    composition "Binding Scene" {
      object "Protein" {
        @protein_structure(uniprot: "${target.uniprot}")
      }
    }
  hash: true
}
```

---

## Interpolation

String values inside any pipeline block support `${…}` interpolation:

```
${env.VAR_NAME}            // environment variable
${env.VAR_NAME:-default}   // with fallback
${params.key}              // params block value
${field.path}              // current record field
${batch}                   // the full batch array (in sink args)
${now()}                   // current timestamp helper
${item.name}               // loop variable for list sources
${response.status}         // HTTP response field (http transform)
${source.reply_url}        // source metadata (in chained sinks)
```

---

## Composing a Complete Pipeline

Data flows linearly: sources produce records, optional merge joins them, then
transforms, filters, validates, and branches process them in declaration order,
and sinks consume the results.

```hs
pipeline "DeployMonitor" {
  schedule: "*/2 * * * *"
  timeout: 15s
  retry: { max: 1, backoff: "none" }

  // 1. Source — static list of services to probe
  source Services {
    type: "list"
    items: [
      { name: "mcp-server",   url: "https://mcp.holoscript.net/health" },
      { name: "orchestrator", url: "https://mcp-orchestrator-production-45f9.up.railway.app/health" },
    ]
  }

  // 2. Transform — HTTP health-check each item
  transform HealthCheck {
    type: "http"
    method: "GET"
    url: "${item.url}"
    timeout: 5s
    output: {
      service: "${item.name}"
      status:  "${response.status}"
      ok:      "${response.json.status == 'healthy'}"
      latency: "${response.duration_ms}"
    }
  }

  // 3. Filter — only unhealthy services reach the sinks
  filter Unhealthy {
    where: ok == false || latency > 5000
  }

  // 4. Branch — route by severity
  branch Severity {
    when consecutive >= 3 -> sink PagerDuty
    when consecutive >= 1 -> sink Slack
    default               -> sink Log
  }

  // 5. Sinks
  sink Slack {
    type: "webhook"
    endpoint: "${env.SLACK_WEBHOOK}"
    method: "POST"
    body: { text: "Service ${service} unhealthy — ${latency}ms" }
  }

  sink PagerDuty {
    type: "webhook"
    endpoint: "${env.PAGERDUTY_WEBHOOK}"
    method: "POST"
    body: {
      routing_key: "${env.PD_ROUTING_KEY}"
      event_action: "trigger"
      payload: { summary: "${service} down", severity: "critical" }
    }
  }

  sink Log {
    type: "filesystem"
    path: "${env.WORKSPACE}/health.jsonl"
    format: "jsonl"
    append: true
  }
}
```

---

## Pipeline DSL inside `.hsplus` Modules

The four DSL block types (`transform`, `filter`, `branch`, `validate`) may also
appear as top-level declarations inside a `.hsplus` module, alongside `@import`,
`@export`, `composition`, `brain`, and event handlers. In this context they are
dispatched by the `.hsplus` parser rather than `parsePipeline`, and are valid
as named reusable blocks that a pipeline or agent can reference by name.

```hsplus
@module "DataTransforms"
@version "1.0.0"

transform NormalizeUser {
  raw_name  -> display_name : trim() : titleCase()
  email     -> email : lowercase()
  created   -> joined_at : toISO()
}

filter ActiveOnly {
  where: status == "active" && verified == true
}

validate UserSchema {
  display_name : required, string, minLength(1)
  email        : required, string
  joined_at    : required, string
}
```

---

## Grammar Summary

```
pipeline <Name | "Name"> {
  schedule: "<cron>"
  timeout: <N>(s|m|h|d)
  retry: { max: <N>, backoff: "none" | "linear" | "exponential" }
  params { <key>: "<value>" ... }

  source <Name> { type: "..." ... }
  merge  <Name> { from: [<Source>, ...] dedup: { key: "...", window: "..." } }

  transform <Name> {
    // field-mapping form:
    <from-path> -> <to-path>
    <from-path> -> <to-path> : <op>() : <op>()
    <array-field>[] -> <var>          // array unwrap
    // OR typed form:
    type: "llm" | "mcp" | "http" | "field_mapping"
    ...type-specific properties...
  }

  filter <Name> {
    where: <expression>
  }

  validate <Name> {
    <field> : <rule>, <rule(arg)>, ...
  }

  branch <Name> {
    when <condition> -> sink <SinkName>
    default          -> sink <SinkName>
  }

  sink <Name> {
    type: "rest" | "webhook" | "mcp" | "filesystem" | "database" | "stdout" | "holo"
    ...type-specific properties...
  }
}
```

---

## Real-World Examples

All four canonical pipeline examples ship in the repository:

| File                                            | What it shows                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `examples/pipelines/inventory-sync.hs`          | REST source, field-mapping transform, filter, validate, two sinks                                           |
| `examples/pipelines/social-engagement.hs`       | Two sources, merge with dedup, LLM transform, filter, branch, MCP + REST sinks                              |
| `examples/pipelines/knowledge-compressor.hs`    | Filesystem sources, merge, LLM + MCP transforms, filter, MCP + filesystem sinks; heredoc prompt             |
| `examples/pipelines/deploy-monitor.hs`          | List source, HTTP transform, field-mapping transform, filter, branch, three sinks                           |
| `examples/pipelines/drug-discovery-flagship.hs` | Multi-stage scientific pipeline: MCP sources, params block, holo sink with heredoc template, audit log sink |

---

## Forbidden Keywords

The following `.holo` and `.hsplus` keywords are rejected inside a `pipeline`
block and will cause a parse error:

`environment`, `spatial_group`, `object`, `orb`, `theme`, `light`, `camera`,
`audio`, `zone`, `timeline`, `particle_system`, `effects`, `ui`, `npc`, `quest`,
`dialogue`, `ability`, `achievement`, `talent_tree`, `behavior`, `state_machine`,
`shape`, `terrain`, `waypoints`, `spawn_group`, `composition`, `constraint`,
`sub_orb`, `norm`, `metanorm`

The keyword `template` is allowed as a **property** (`template: "..."`) on a
`holo` sink but is rejected as a **block** keyword (`template Name { ... }`).

---

## Next Steps

- [State & Actions](./reference-hsplus-state) — state blocks, computed values, and action definitions inside `.hsplus`
- [Brain Declarations](./reference-hsplus-brain) — wiring a `brain` block that calls a pipeline as an agent behavior
- [Cognitive Verbs](./reference-hsplus-cognitive) — `llm_call`, `recall`, `rag_query`, `plan`, `reflect` — the typed cognitive actions in `.hsplus` brains
