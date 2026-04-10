# @holoscript/marketplace-web

Web UI for the HoloScript Trait Marketplace. Browse, search, and install community traits.

## Features

- **Trait Browser** - Search and filter traits by category
- **Version History** - View changelogs and version diffs
- **Install Flow** - One-click install commands
- **Responsive** - Mobile-friendly layout

## Tech Stack

| Component | Technology               |
| --------- | ------------------------ |
| Framework | Next.js 14               |
| State     | Zustand + React Query    |
| Styling   | Tailwind CSS             |
| Icons     | Lucide React             |
| Testing   | Vitest + Testing Library |

## Development

```bash
pnpm dev    # Start Next.js dev server
pnpm build  # Production build
pnpm start  # Serve production build
pnpm test   # Run tests
pnpm lint   # ESLint
```

## Dependencies

- `@holoscript/marketplace-api` - Backend API client

## License

MIT
