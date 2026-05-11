# Public Access — No API Key Required

HoloScript has four ways in that do not require signing up, paying, or asking anyone for a key. They cover most first-touch use cases: write a `.holo` file, see it run, look up the syntax, browse what others published.

When you need the parts that cost money to run (LLM-backed generation, codebase intelligence, publishing on-chain), you self-register a client at `/oauth/register` — still no human approval, just an HTTP call.

---

## 1. npm — install and run, fully offline

Three public packages, all on the public npm registry, MIT-licensed, no auth:

```bash
# Scaffold a new HoloScript app (browser scene in under a minute)
npx create-holoscript@latest my-app

# Or install the CLI directly
npm install -g @holoscript/cli
holoscript --help

# Or install the WASM parser/compiler for in-browser use
npm install @holoscript/wasm @holoscript/core
```

The CLI parses, validates, watches, and compiles `.holo` files locally. The WASM package runs the parser in a browser or Node worker — no network round-trip.

## 2. Studio playground — type, see, share

<https://holoscript.studio/playground>

Live editor on the left, WebGPU preview on the right, image-to-hologram drop zone, no login required. The WASM compiler is bundled into the page; compilation happens client-side. Anything you write stays in your browser unless you explicitly publish.

## 3. Anonymous MCP tier — six tools, no key

`POST https://mcp.holoscript.net/api/public/tool`

> Status: shipped to `main` — will be live on `mcp.holoscript.net` after the next MCP server deploy. Verify with `curl https://mcp.holoscript.net/api/public/tool`; a `200` discovery payload confirms the endpoint is live, a `404` means the server hasn't redeployed yet.

Read-only / inert tools that are safe to expose without a key:

| Tool | What it does |
|------|---------------|
| `parse_holo` | Parse a `.holo` source string to AST |
| `validate_holoscript` | Validate a composition against the schema |
| `explain_trait` | Get the docs + signature for any trait |
| `get_syntax_reference` | Language reference |
| `get_examples` | Browse example compositions |
| `list_export_targets` | Show every platform the compiler can target |

Discovery (also no key):

```bash
curl https://mcp.holoscript.net/api/public/tool
```

Calling a tool:

```bash
curl -X POST https://mcp.holoscript.net/api/public/tool \
  -H 'Content-Type: application/json' \
  -d '{"tool":"parse_holo","arguments":{"code":"composition \"Hello\" { object \"Box\" {} }"}}'
```

The argument field names match each tool's schema (`parse_holo` and `validate_holoscript` use `code`; the others have their own — call `GET /api/public/tool` for the schema-mapped example, or call the tool through an MCP client which surfaces the schema automatically).

Rate limit: **30 requests/minute per IP** (configurable via `PUBLIC_ANON_RATE_LIMIT`). Hitting the limit returns `429` with a `retry_after_seconds` hint and a pointer to `/oauth/register`.

Any tool name that is not in the anonymous allowlist returns `403` with the full allowlist and the upgrade endpoint — so you discover what is and isn't free by trying.

## 4. Protocol read paths — public on-chain lookups

Anyone can read what's been published, without auth:

```bash
# Look up a composition by content hash
curl https://mcp.holoscript.net/api/protocol/<hash>

# All publications by a given author address
curl https://mcp.holoscript.net/api/protocol/author/<address>

# Preview revenue distribution for a hash (creator + remix splits)
curl https://mcp.holoscript.net/api/protocol/revenue/<hash>
```

Writes (`POST /api/protocol` to publish, `POST /api/collect/:hash` to collect) are separate — they cost gas and are tracked on-chain.

---

## When you outgrow the free tier

Register an OAuth 2.1 client. No human review — it's [RFC 7591 dynamic client registration](https://www.rfc-editor.org/rfc/rfc7591):

```bash
# Register a client (returns client_id + client_secret)
curl -X POST https://mcp.holoscript.net/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"my-app","redirect_uris":["http://localhost/callback"]}'

# Exchange for a token (client_credentials grant)
curl -X POST https://mcp.holoscript.net/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=<id>&client_secret=<secret>'
```

Use the bearer token on any MCP endpoint:

```bash
curl -X POST https://mcp.holoscript.net/mcp \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"generate_scene","arguments":{...}}}'
```

The same token unlocks every tool the server exposes — see `GET /health` for the live inventory.

---

## What you do *not* need

- A signup form
- An invitation
- A wallet (only required for publishing on-chain, not for using the platform)
- A founder approval
- Email confirmation
- Credit card

The substrate is the platform. The packages are the API. The playground is the demo. The anon tier is the trial. None of those gates exist.
