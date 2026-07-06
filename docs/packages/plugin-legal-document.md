# @holoscript/plugin-legal-document

`@holoscript/plugin-legal-document` is the legal-document domain plugin for
HoloScript. It packages contract drafting, electronic signature, case
management, programmable-law, signature-block, and audit-trail helpers behind a
plugin surface so legal workflows stay outside HoloScript core.

## Install

```bash
npm install @holoscript/plugin-legal-document
```

## Use

```ts
import {
  parseSpatialLegalContract,
  validateSpatialLegalContract,
  legalDocumentPlugin,
} from '@holoscript/plugin-legal-document';
```

## Package Surface

| Surface                         | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `contract_draft`                | Contract generation and clause drafting      |
| `e_signature`                   | Electronic, wet, and hybrid signature blocks |
| `case_management`               | Legal matter and case status behavior        |
| `programmable_law`              | Rule-driven legal workflow behavior          |
| `signature_block`               | Compiler-native signer block metadata        |
| `audit_trail`                   | Immutable contract action history            |
| `validateSpatialLegalContract`  | Validates legal document payloads            |
| `parseSpatialLegalContract`     | Parses validated spatial contract payloads   |
| `legalDocumentPlugin`           | Bundled metadata, handlers, and validators   |

## Packaging Note

This package is currently source-first: `main` points at `src/index.ts`, and the
test script runs Vitest directly against source. Treat a future `dist`
entrypoint migration as its own hardening pass.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when legal-document, signing, audit replay, or programmable-law workflows need
these traits directly.

Keep core parser/compiler/runtime generic. Legal-domain payload validation,
signature metadata, case management, and programmable-law behavior belong here.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-legal-document run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
