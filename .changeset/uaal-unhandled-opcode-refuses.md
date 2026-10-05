---
'@holoscript/uaal': patch
---

An opcode with no built-in behaviour and no registered handler now stops the run instead of
pushing `null` and carrying on. Of the 95 opcodes, 72 have no built-in case (`EXEC`, the HS buffer
and aggregate ops, the graph and routing ops, `OP_INVOKE_LLM`, ...); a program that reached one
with no handler used to end `HALTED` with an invented value, so a missing host capability looked
like a success. `execute()` still never throws: the run ends `ERROR`.

`VMResult` gains `error?: { message, pc, opcode? }`, set on every `ERROR` path (a handler that
throws, an unhandled opcode, the instruction limit), so a host can say why. The new
`UAALUnhandledOpcodeError` and `VMRunError` are exported. Text taken from bytecode (an `EXEC`
target, a malformed opcode) is cut at 120 characters and escaped in the message.

Hosts that register a handler for every opcode their programs use are unaffected. An execution log
recorded before this change that holds such a step now replays invalid, with a reason that names
the opcode that stopped it.
