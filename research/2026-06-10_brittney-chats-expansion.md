# Brittney Chats Expansion — Server-Side Persistence + Multi-Conversation

**Date:** 2026-06-10
**Branch:** `claude/brittney-chats-expansion-okxic8`
**Scope:** `packages/studio` (schema, API routes, hooks, chat panel)

> **2026-06-09 follow-up (board task qq65) — What-Remains items 1, 3, 6, 7 CLOSED.**
> Server-side write-through on POST /api/brittney now persists the user turn
> pre-stream and the assistant turn (text + clipped tool calls) in the stream's
> catch/finally — crash, provider error, and client abort all keep the turn
> (item 7). Tool calls persist into `tool_calls` end-to-end with size bounds
> (item 3). Past-thread summaries from the same scope feed Brittney's system
> prompt via `lib/brittney/pastThreads.ts` — the first D.053 relational-memory
> step (item 6). Deploy probe: `GET /api/brittney/conversations` live on prod,
> 401 auth gate, app healthy through the migration (item 1). Still open:
> items 2 (offline outbox), 4 (hook-level tests), 5 (search/export).

## Problem

Brittney's chat engine (streaming, tool loops, provider routing) was production-grade,
but every conversation lived ONLY in browser localStorage:

- `useBrittneyHistory` — 200-message cap, per-browser, lost on storage clear / new device
- No `conversations` / `messages` tables in the Studio DB
- One thread per workspace, no thread list, no titles, no archive
- The relational-memory direction (D.053) and cross-session recall were blocked on a
  durable record that didn't exist (flagged "design needed; not yet assigned" in
  `research/2026-06-07_brittney-fleet-orchestrator-wiring.md` era audits)

## What Shipped

### 1. Schema (`src/db/schema.ts`, migration `drizzle/0001_redundant_penance.sql`)

- `brittney_conversations` — owner-scoped (FK `users.id`, cascade), `scope` matches the
  client history scope (`workspace:<id>` | `project:studio:default`), title,
  messageCount, lastMessageAt, archivedAt
- `brittney_messages` — per-turn rows, monotonic `seq` with a UNIQUE
  `(conversation_id, seq)` index so concurrent appends can't silently interleave,
  cascade delete with the conversation
- The generated migration also catches up `user_api_keys` (pre-existing schema drift —
  table was in schema.ts but never had a migration). Safe: `scripts/db-migrate.ts`
  reconciles "already exists" idempotently.

### 2. API routes (NextAuth session OR `bk_*` API key, same auth as `POST /api/brittney`)

- `GET/POST /api/brittney/conversations` — list (scope filter, archived excluded by
  default) / create
- `GET/PATCH/DELETE /api/brittney/conversations/[id]` — fetch with messages
  (`?afterSeq=` incremental), rename/archive, delete; non-owner gets 404
- `POST /api/brittney/conversations/[id]/messages` — batched append, server-assigned
  seq, auto-title from first user message, bumps counters
- DB-or-in-memory fallback (same pattern as `/api/projects`) so local dev and tests
  work without DATABASE_URL

### 3. Client sync (`src/lib/brittney/conversationsClient.ts`, `useUnifiedBrittneyHistory`)

- localStorage stays the instant, offline-safe cache of the ACTIVE thread; the server
  is the durable, multi-thread record. Every server call is fail-soft — chat never
  breaks signed-out / offline / DB-less.
- Hydration on mount/scope change: list threads, restore the remembered (or most
  recent) thread, pull server history when it has more than the local cache
- Legacy localStorage-only threads migrate to a server conversation on first
  authenticated load of a scope with no server threads
- `addMessage` writes locally first, then queues a server append (conversation row
  created lazily on the first message of a new thread; failed appends requeue)
- New API: `conversations`, `activeConversationId`, `threadKey`, `newConversation`,
  `selectConversation`, `renameConversation`, `archiveConversation`;
  `clearHistory` now also deletes the active server thread

### 4. UI (`BrittneyChatPanel`)

- Conversation switcher in the panel header (visible when authenticated): thread list
  newest-first with titles + message counts, New chat, rename, archive
- Message reload keyed on `threadKey` (scope + active thread) so switching threads —
  not just workspaces — rebuilds the rendered history and LLM context

## Validation

- `pnpm vitest run src/app/api/brittney/conversations/route.test.ts` — 13/13 green
  (auth gates, owner isolation, scope filter, archive filter, seq monotonicity,
  auto-title, incremental fetch, rename/delete)
- `pnpm typecheck` — zero errors in changed files (remaining errors are pre-existing
  unbuilt-workspace-package resolution in unrelated files, verified identical at HEAD)
- `npx eslint <changed files>` — zero new warnings (3 findings pre-exist at HEAD)
- Full `pnpm test` — failures are the same 42 pre-existing unbuilt-dep suite failures
  as HEAD (verified via stash run); no new failures

## What Remains After This Plan

Deliberately not addressed — real gaps, stated so nobody concludes "chats are done":

1. **No live DB smoke test** — the Drizzle path is exercised only through the
   migration SQL + types; this sandbox has no Postgres. First deploy should watch
   `[db-migrate]` output and probe `GET /api/brittney/conversations`.
2. **Offline back-sync is migration-only** — messages written while the server was
   unreachable back-sync only via the legacy-migration path (empty server scope) or
   the in-session retry queue. A persistent outbox (IndexedDB) is the follow-on.
3. **Tool calls aren't persisted** — `brittney_messages.tool_calls` exists, but the
   panel currently uploads text turns only. Wiring `toolResults` into the upload is
   straightforward but unshipped.
4. **No hook-level tests** — `useUnifiedBrittneyHistory`'s sync engine is covered
   indirectly (route tests + types); a renderHook suite would pin hydration/migration
   edge cases.
5. **No conversation search/export** — list is newest-first only; no full-text
   search, no export, no pagination beyond the 200-conversation list cap.
6. **No cross-session memory consumption** — persistence unblocks D.053 relational
   memory, but nothing yet feeds past conversations into Brittney's context window.
7. **`/api/brittney` route is still stateless** — the chat POST doesn't read/write
   the conversation store server-side; persistence is client-driven. Server-side
   write-through (route appends turns itself) would close the gap where a client
   crash mid-stream drops the assistant turn.
