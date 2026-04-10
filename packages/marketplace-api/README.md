# @holoscript/marketplace-api

REST API for the HoloScript Trait Marketplace - publishing, discovery, and dependency resolution for community traits and packages.

## Features

- **Trait Publishing** - Publish custom traits with versioning (semver)
- **Discovery** - Search and browse community traits by category, tag, or keyword
- **Dependency Resolution** - Automatic dependency graph resolution for trait packages
- **Rate Limiting** - Built-in rate limiting via `rate-limiter-flexible`
- **Validation** - Zod-based request validation

## Tech Stack

| Component  | Technology                  |
| ---------- | --------------------------- |
| Server     | Express 4                   |
| Validation | Zod                         |
| Database   | PostgreSQL (pg)             |
| Cache      | Redis                       |
| Logging    | Winston                     |
| Security   | Helmet, CORS, rate limiting |

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm dev    # Start with hot reload (tsx watch)
pnpm build  # Compile TypeScript
pnpm start  # Run compiled output
pnpm test   # Run tests
```

## Dependencies

- `@holoscript/core` - Parser and trait definitions
- `@holoscript/registry` - Package registry client

## License

MIT
