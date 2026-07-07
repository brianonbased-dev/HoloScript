# HoloLlama Public Agent Harness

This is a minimal public `.ai-ecosystem` starter for users running
`@holoscript/holollama`. It is not the founder private harness and must not
contain private paths, wallets, GOLD files, local OAuth state, or API keys.

## Purpose

Use this folder as the small shared contract between a human operator, local AI
agents, and HoloLlama serving nodes.

- `holollama` plans and verifies llama.cpp serving bundles.
- HoloScript source stays in the user's own repo.
- HoloMesh or MCP endpoints are optional integrations, configured by env vars.
- Secrets live in a local `.env` copied from `.env.example`; never commit them.

## First Commands

```bash
npm install -g @holoscript/holollama
holollama doctor --json
holollama profiles
holollama lifecycle --profile jetson-orin --team-id local-team --json
```

For live nodes:

```bash
holollama lifecycle --profile jetson-orin --live --endpoint http://127.0.0.1:18080 --json
```

## Agent Rules

- Treat this folder as a harness, not as product source.
- Prefer package commands over ad hoc scripts.
- Record receipts from `doctor`, `contract`, `preflight`, and `lifecycle`.
- Treat HoloLlama as native llama.cpp operations, not an Ollama wrapper; live
  lifecycle receipts should reject Ollama-owned server binaries.
- Do not assume the founder private `.ai-ecosystem` layout exists.
- Do not write secrets, OAuth cache, wallet material, or machine-private paths
  into tracked files.
