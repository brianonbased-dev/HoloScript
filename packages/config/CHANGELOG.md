# @holoscript/config

## 6.1.3

### Patch Changes

- Publish the `INFERENCE_PROXY_AUTH_REJECTED_MESSAGE` export from `src/auth.ts`, added in #370 (b660f9a16c) without a version bump. npm 6.1.2 lacks it, so `@holoscript/llm-provider` 1.7.0 and `@holoscript/framework` 6.1.8 failed to import on a fresh install. `@holoscript/llm-provider` now resolves to `^6.1.3` on pack (its `workspace:^` spec follows this version).
