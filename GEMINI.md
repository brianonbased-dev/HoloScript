# Gemini Instructions for HoloScript

## You Are On A Team

You are a member of the **HoloScript Core** team (team_bfe0bd952f327631).
The team persists across sessions. You don't.

Other agents (Claude Code, GitHub Copilot) work in parallel windows on the same codebase.
Use the team tools to coordinate — don't duplicate work.

## On Session Start

The `team-connect.mjs` daemon runs automatically and handles heartbeats.
Your job is to check in with the team:

1. **Check inbox** — `holomesh_inbox` for DMs, handoff notes, review requests
2. **Read knowledge** — `holomesh_knowledge_read` for what other agents learned
3. **Vote on suggestions** — `holomesh_suggest_list` then `holomesh_suggest_vote`
4. **Check board** — `holomesh_board_list` for open/claimed/done tasks
5. **Claim a task** — `holomesh_board_claim` the highest-priority open task
6. **Follow the team mode** — audit/build/research/review shapes your behavior

## During Work

- **Query before asking the user**: `holo_query_codebase`, `holo_ask_codebase`, `holo_impact_analysis`
- **Message teammates**: `holomesh_send_message` for help or context sharing
- **Request reviews**: `holomesh_send_message` with review context
- **Contribute knowledge**: `holomesh_contribute` with type wisdom/pattern/gotcha
- **When done**: `holomesh_board_complete` with commit hash and summary

## On Session End

- **DM the next agent** with context they'll need: `holomesh_send_message`
- **Contribute knowledge**: `holomesh_contribute` with what you learned
- **Propose improvements**: `holomesh_suggest` for reusable patterns you found
- Context is the most valuable thing you produce — the code is in git, but WHY you made those choices dies unless you write it down

## Team MCP Tools

All available via the holoscript-mcp server:

### Board
- `holomesh_board_list` — see open/claimed/done tasks
- `holomesh_board_claim` — claim a task
- `holomesh_board_complete` — mark done with commit hash
- `holomesh_mode_set` — switch team mode

### Knowledge
- `holomesh_contribute` — add W/P/G (wisdom/pattern/gotcha)
- `holomesh_knowledge_read` — read team knowledge
- `holomesh_query` — semantic search across knowledge

### Collaboration
- `holomesh_send_message` — DM another agent
- `holomesh_inbox` — check your messages
- `holomesh_read_thread` — read a conversation thread
- `holomesh_add_reply` — reply to a message

### Suggestions
- `holomesh_suggest` — propose improvement
- `holomesh_suggest_vote` — vote on suggestions
- `holomesh_suggest_list` — list all suggestions

### Codebase Intelligence
- `holo_query_codebase` — callers, callees, imports, symbols
- `holo_ask_codebase` — natural language Q&A with GraphRAG + OpenAI embeddings
- `holo_impact_analysis` — blast radius for changes
- `holo_graph_status` — check if codebase graph is loaded

## HoloScript-First Development

HoloScript compiles to 39 targets. Always use MCP tools before writing code:
1. `suggest_traits` — get appropriate traits
2. `generate_object` or `generate_scene` — create code
3. `validate_holoscript` — verify syntax

## File Formats

| Extension | Purpose | Parser |
|-----------|---------|--------|
| `.holo` | Worlds, scenes, compositions | HoloCompositionParser |
| `.hsplus` | Agent behaviors, state machines | HoloScriptPlusParser |
| `.hs` | Data pipelines (source→transform→sink) | PipelineParser |

## Rules

1. Never hardcode API keys — use environment variables
2. Always explicit `git add <file>`, never `git add -A`
3. Run tests before committing
4. Query the codebase (GraphRAG) before asking the user a code question
5. Read team knowledge before starting work
6. Write knowledge + messages when ending
