# VRChat Byte Target

Founder direction recorded on 2026-05-24: the long-term VRChat compiler target is Byte/Udon output, not UdonSharp C# source.

## Current State

`VRChatCompiler` still implements the legacy UdonSharp C# emitter. That path remains available as:

```ts
new VRChatCompiler({ outputFormat: 'udonsharp-csharp', useUdonSharp: true });
```

Requests for `outputFormat: 'udon-assembly'`, `outputFormat: 'udon-bytecode'`, or `useUdonSharp: false` fail fast. This prevents agents from silently returning C# while claiming they produced a Byte/Udon artifact.

## Pending Contract

The compiler must not build the new target until the Byte artifact contract is selected:

- Text Udon Assembly (`.uasm`) as the canonical compiler output.
- Serialized Udon bytecode/program asset as the canonical compiler output.
- A bundle format containing prefab metadata plus Udon program assets.

The next implementation pass should make that contract explicit in the result type, CLI/MCP output filenames, and validation fixture before emitting any non-C# artifact.

## Non-Goals

- Do not patch bounded gaps in the UdonSharp C# path as a substitute for the Byte target.
- Do not document `useUdonSharp: false` as raw Udon output until a real artifact exists.
- Do not mark VRChatCompiler failures as a known skip exception; investigate or file a task with evidence.
