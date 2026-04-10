# HoloScript Pipeline Grammar (.hs)

## Overview

The `.hs` pipeline grammar extends HoloScript's core format for declarative data pipelines. A pipeline describes **what** data flows where — the compiler decides **how** (Node.js, Python, serverless, etc.).

## Pipeline Structure

```hs
pipeline "Name" {
  schedule: "<cron expression>"
  timeout: <duration>
  retry: { max: <n>, backoff: "none" | "linear" | "exponential" }

  source <Name> { ... }      // 1+ data sources
  merge <Name> { ... }       // optional: combine sources
  transform <Name> { ... }   // 0+ transformations
  filter <Name> { ... }      // 0+ filters
  validate <Name> { ... }    // 0+ validations
  branch <Name> { ... }      // optional: conditional routing
  sink <Name> { ... }        // 1+ destinations
}
```

## Blocks

### `source` — Where data comes from

```hs
source POS {
  type: "rest" | "stream" | "filesystem" | "database" | "mcp" | "list"
  endpoint: "<url>"
  auth: { type: "bearer" | "oauth2" | "api_key", token: "<value>" }
  method: "GET" | "POST"
  pagination: { type: "cursor" | "offset", param: "<key>", limit: <n> }
  since: "<duration>"         // for filesystem/incremental sources
  pattern: "<glob>"           // for filesystem sources
}
```

### `transform` — Reshape data

**Field mapping:**

```hs
transform MapFields {
  old_name -> new_name
  old_name -> new_name : function1() : function2()
}
```

Built-in transform functions: `trim()`, `titleCase()`, `lowercase()`, `uppercase()`, `split(sep)`, `join(sep)`, `toISO()`, `toEpoch()`, `multiply(n)`, `round(n)`, `truncate(n)`, `hash()`, `base64()`.

**LLM transform:**

```hs
transform Classify {
  type: "llm"
  model: "<model-id>"
  prompt: "<instruction>"
  input: <field>
  output: <field>
}
```

**MCP tool transform:**

```hs
transform Enrich {
  type: "mcp"
  server: "<server-id>"
  tool: "<tool-name>"
  args: { ... }
  output: <field>
}
```

**HTTP transform:**

```hs
transform Fetch {
  type: "http"
  method: "GET" | "POST"
  url: "<url>"
  timeout: <duration>
  output: { ... }
}
```

### `filter` — Conditional pass-through

```hs
filter ActiveOnly {
  where: <expression>
}
```

Expressions support: `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, field access (`.`), `contains()`, `startsWith()`, `endsWith()`, `matches(<regex>)`.

Special references: `previous.<field>` (last run's value for delta detection).

### `validate` — Schema enforcement

```hs
validate Order {
  productId : required, string, minLength(3)
  quantity  : required, integer, min(1), max(10000)
  email     : optional, string, matches(/^.+@.+$/)
}
```

Validators: `required`, `optional`, `string`, `integer`, `float`, `boolean`, `array`, `min(n)`, `max(n)`, `minLength(n)`, `maxLength(n)`, `matches(regex)`, `oneOf(a, b, c)`.

### `merge` — Combine multiple sources

```hs
merge Combined {
  from: [Source1, Source2]
  dedup: { key: "<field>", window: "<duration>" }
  strategy: "concat" | "zip" | "latest"
}
```

### `branch` — Conditional routing

```hs
branch Route {
  when <expression> -> sink <Name>
  when <expression> -> sink <Name>
  default           -> sink <Name>
}
```

### `sink` — Where data goes

```hs
sink API {
  type: "rest" | "webhook" | "mcp" | "filesystem" | "database" | "stdout"
  endpoint: "<url>"
  method: "POST" | "PATCH" | "PUT"
  auth: { ... }
  batch: { size: <n>, parallel: <n> }
  on_error: { action: "log" | "retry" | "dead_letter", continue: true | false }
  format: "json" | "jsonl" | "csv"
}
```

**Chained sinks** (use output of one tool as input to another):

```hs
sink Answer {
  type: "mcp"
  tool: "absorb_query"
  args: { search: "${content}" }
  then: sink Reply {
    type: "rest"
    endpoint: "${source.reply_url}"
    body: { content: "${result.answer}" }
  }
}
```

## Interpolation

All string values support `${...}` interpolation:

- `${env.VAR_NAME}` — environment variables
- `${field_name}` — current record fields
- `${previous.field}` — previous run's value
- `${batch.length}` — current batch size
- `${source.field}` — original source metadata
- `${result.field}` — output from MCP/LLM transforms

## Duration Literals

`15s`, `30s`, `5m`, `1h`, `24h`, `7d`

## Compilation Targets

A `.hs` pipeline compiles to:

| Target           | Output                                     |
| ---------------- | ------------------------------------------ |
| `node`           | ES module with node-cron scheduler         |
| `python`         | async Python script with APScheduler       |
| `lambda`         | AWS Lambda handler + CloudWatch Event rule |
| `cloudflare`     | Cloudflare Worker with Cron Trigger        |
| `docker`         | Dockerfile + entrypoint with crond         |
| `kubernetes`     | CronJob YAML manifest                      |
| `github-actions` | Workflow YAML with cron schedule           |

## Design Principles

1. **Declarative, not imperative** — describe the flow, not the loop
2. **Environment-agnostic** — same `.hs` runs anywhere via compilation
3. **Observable by default** — every pipeline emits structured logs
4. **Idempotent** — re-running produces the same result (delta detection via `previous`)
5. **Composable** — pipelines can source from other pipelines (future)
