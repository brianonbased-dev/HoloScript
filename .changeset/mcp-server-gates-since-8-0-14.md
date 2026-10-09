---
'@holoscript/mcp-server': patch
---

Security and correctness fixes merged since 8.0.14 (the last npm release):
POST /a2a and /a2a/tasks run the same tool-call gate as /mcp and /tools/call and
are audited under their own path; a self-registered OAuth client that proved
nothing gets `tools:execute` as `tools:write` only; a call without a caller is
the local user only on the stdio server; a customer key never carries an
operator scope; the server no longer runs orchestrator job commands with its
secrets in scope; a codebase scan opens only allowed server folders; the
video-reconstruction and mesh-invoke fetches reach only the public internet
unless the caller is an operator or local; `@types/express` and `@types/qrcode`
are declared.
