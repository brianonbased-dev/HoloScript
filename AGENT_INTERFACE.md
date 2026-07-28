# Agent Interface -- HoloScript

Shared repo-local contract for agents working in this monorepo. Tool-specific
files such as `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
`.github/copilot-instructions.md` may add surface-specific hints, but this file
only keeps facts that belong in the public HoloScript repo.

## Source Of Truth

| Need                                                       | Source                                              |
| ---------------------------------------------------------- | --------------------------------------------------- |
| Repo workflow, commit posture, file formats                | `AGENTS.md`                                         |
| Project strategy and package boundaries                    | `NORTH_STAR.md`, `ARCHITECTURE.md`                  |
| Live services and public endpoints                         | `SURFACES.md`                                       |
| Live counts and metric commands                            | `docs/NUMBERS.md`                                   |
| Private fleet coordination, room, GOLD, local `.env` paths | `C:/Users/josep/.ai-ecosystem` on Joseph's machines |

Do not copy private API keys, wallet material, local team IDs, or machine-local
paths into this repo. HoloScript can link to the ecosystem substrate; the private
operational state belongs in `.ai-ecosystem`.

## Agent Workflow

1. Read `AGENTS.md` first.
2. Use `.holo`, `.hsplus`, and `.hs` for HoloScript content; reserve TypeScript
   for platform tooling.
3. Discover MCP tools through `POST https://mcp.holoscript.net/mcp` or verify the
   live server with `GET https://mcp.holoscript.net/health`.
4. Use `docs/NUMBERS.md` before citing counts.
5. Stage explicit paths only. Never use `git add .` or `git add -A`.
6. Validate the surface you changed before committing or handing off.

## Public Service Map

| Surface                  | Verification                                        |
| ------------------------ | --------------------------------------------------- |
| HoloScript MCP           | `curl https://mcp.holoscript.net/health`            |
| Studio                   | `curl -fsSL https://holoscript.studio -o /dev/null` |
| Public access guide      | `docs/PUBLIC_ACCESS.md`                             |
| Service surface registry | `SURFACES.md`                                       |

## Ownership Boundary

Keep in HoloScript: language, compiler, runtime, package, public MCP, and
public-product documentation.

Keep outside HoloScript: private HoloMesh room procedures, local credentials,
GOLD vault routing, founder-machine paths, and fleet roster state.
