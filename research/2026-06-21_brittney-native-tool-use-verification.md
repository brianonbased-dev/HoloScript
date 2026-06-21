# Brittney Native Tool-Use Verification

Date: 2026-06-21
Room task: `task_1781079001103_rrak`
Scope: verify Brittney sovereign/local provider paths pass tools and parse native `tool_calls` instead of depending on raw-text JSON rescue.

## Conclusion

Verified on the local sovereign Ollama path with `qwen3:4b-instruct`: the serving model returns native tool calls, and `LocalLLMAdapter.complete()` preserves them as `toolUses` with `finishReason: "tool_use"`. The earlier founder-transcript raw JSON `{"name":"tend_garden"}` failure is not reproduced on the current local Ollama/model/template stack.

The `vast-serverless` fleet path is covered by targeted tests that prove both non-streaming and fragmented streaming `tool_calls` are passed and parsed. No product-code change was needed for this verification pass.

## Local Runtime

```text
ollama version is 0.30.9
```

`GET http://localhost:11434/api/tags` returned:

```json
[
  {
    "name": "qwen3:4b-instruct",
    "details": {
      "format": "gguf",
      "family": "qwen3",
      "parameter_size": "4.0B",
      "quantization_level": "Q4_K_M",
      "context_length": 262144
    },
    "capabilities": ["completion", "tools"]
  }
]
```

## Validation

Targeted provider tests:

```powershell
pnpm --filter @holoscript/llm-provider exec vitest run src/__tests__/local-llm.toolcall.test.ts src/__tests__/vast-serverless.test.ts src/__tests__/local-model-picker.test.ts src/__tests__/local-llm-streaming.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests       34 passed (34)
```

Live native Ollama `/api/chat` smoke:

```json
{
  "ok": true,
  "model": "qwen3:4b-instruct",
  "sentTools": ["tend_garden"],
  "contentWasRawJson": false,
  "responseContentLength": 0,
  "toolCalls": [
    {
      "function": {
        "name": "tend_garden",
        "arguments": {
          "garden_id": "lotus",
          "action": "water"
        }
      }
    }
  ]
}
```

Live `LocalLLMAdapter.complete()` smoke:

```json
{
  "ok": true,
  "finishReason": "tool_use",
  "contentWasRawJson": false,
  "contentLength": 0,
  "toolUses": [
    {
      "type": "tool_use",
      "name": "tend_garden",
      "input": {
        "garden_id": "lotus",
        "action": "water"
      }
    }
  ]
}
```

## Notes

- `textToolCallRescue.ts` remains a fallback safety net, not the primary path for this current local runtime.
- The local model picker still matters because tool capability labels can lie; its targeted regression test stayed green in this run.
- This receipt intentionally does not modify unrelated in-progress provider or studio files already dirty in the worktree.
