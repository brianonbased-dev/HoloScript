# Proposals Index

This folder tracks RFC-style proposals for new language, trait, compiler, and ecosystem capabilities.

## Active Proposals

| Proposal                                                                               | Status                                  | Focus Area                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| [DAO Governance v1](./DAO_Governance_v1.md)                                            | Proposed                                | On-chain spatial governance primitives                                |
| [Geospatial Climate Twin v1](./Geospatial_Climate_Twin_RFC.md)                         | Proposed                                | City-scale GIS and climate digital twins                              |
| [Culture Keyword Extension](./culture-keyword-extension.md)                            | Proposal                                | Compile-time cultural norm declarations                               |
| [`.hs` checker: names, calls, returns](./HS_Checker_Names_Calls_Returns_v1.md)         | Proposed; built in #438, gate 4 pending | "Valid `.hs`" means it runs (gap G11)                                 |
| [Reading an `@unknown` field](./Unknown_Field_Reads_v1.md)                             | Proposed; built in #444, gate 4 pending | One written form `load(record.field) ?? fallback`; tag reads accepted |
| [Agent frames: a way to say "no tools"](./Agent_Frame_Tool_Allowlist_v1.md)            | Proposed; built in #456, gate 4 pending | An empty tool allowlist stops meaning "every tool" (gap G15)          |
| [Holo tools in the language: checked `holo:` imports](./Host_Capability_Imports_v1.md) | Phase 1 built in #466, gate 4 pending   | HoloAbsorb, HoloCI … as typed, permitted imports (gap G21)            |

## How to Use This Folder

1. Start from an existing RFC as a template.
2. Include motivation, design, implementation phases, and open questions.
3. Link related examples, docs, or compiler targets when possible.
4. Open a PR and request feedback from maintainers and domain owners.

## Suggested Naming

- `Topic_Area_v1.md` for scoped feature RFCs
- `Topic_Area_RFC.md` for broader architecture RFCs
