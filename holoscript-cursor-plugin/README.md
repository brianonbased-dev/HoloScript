# HoloScript plugin for Cursor

A skills-and-rules plugin for writing [HoloScript](https://github.com/brianonbased-dev/HoloScript)
files in Cursor. It contains no MCP server and runs no code.

## What's inside

| Component | Path | What it does |
| --- | --- | --- |
| Skill | `skills/write-holoscript/SKILL.md` | Guides the agent to write `.holo` scenes with the composition / template / object pattern |
| Rule | `rules/holoscript.mdc` | HoloScript conventions, offered for `**/*.holo`, `**/*.hs`, `**/*.hsplus` (not always applied) |

## What it claims

The syntax examples in the skill are copied from `SYNTAX_DOCS` in
`packages/mcp-server/src/documentation.ts`. Those examples are parsed through the
production parser by `packages/mcp-server/src/__tests__/syntax-reference-conformance.test.ts`
(see `docs/spec/holoscript-grammar-ssot.md`). The plugin claims nothing beyond that.

## Install locally

Copy or link this `holoscript-cursor-plugin` folder into `~/.cursor/plugins/local/`
and restart Cursor. The repository root also has `.cursor-plugin/marketplace.json`,
which lists this folder as the `holoscript` plugin.

## Configuration

None. The plugin declares no variables and needs no secrets.

## License

MIT, see `LICENSE`.