# @holoscript/registry

Package registry and team workspace management for HoloScript.

## Features

- **Team Workspaces** - Collaborative project management
- **Role-based Access** - Owner, Admin, Developer, Viewer roles
- **Shared Secrets** - Encrypted environment variables
- **Activity Feed** - Track team activity
- **Package Registry** - Private package hosting

## Installation

```bash
npm install @holoscript/registry
```

## API Endpoints

### Workspaces

| Method | Endpoint          | Description            |
| ------ | ----------------- | ---------------------- |
| POST   | `/workspaces`     | Create workspace       |
| GET    | `/workspaces`     | List user's workspaces |
| GET    | `/workspaces/:id` | Get workspace details  |
| PUT    | `/workspaces/:id` | Update workspace       |
| DELETE | `/workspaces/:id` | Delete workspace       |

### Members

| Method | Endpoint                          | Description   |
| ------ | --------------------------------- | ------------- |
| GET    | `/workspaces/:id/members`         | List members  |
| POST   | `/workspaces/:id/members`         | Invite member |
| PUT    | `/workspaces/:id/members/:userId` | Update role   |
| DELETE | `/workspaces/:id/members/:userId` | Remove member |

### Secrets

| Method | Endpoint                        | Description   |
| ------ | ------------------------------- | ------------- |
| GET    | `/workspaces/:id/secrets`       | List secrets  |
| POST   | `/workspaces/:id/secrets`       | Set secret    |
| DELETE | `/workspaces/:id/secrets/:name` | Delete secret |

### Activity

| Method | Endpoint                   | Description   |
| ------ | -------------------------- | ------------- |
| GET    | `/workspaces/:id/activity` | Activity feed |

## Roles & Permissions

| Permission       | Owner | Admin | Developer | Viewer |
| ---------------- | ----- | ----- | --------- | ------ |
| Read workspace   | ✓     | ✓     | ✓         | ✓      |
| Update workspace | ✓     | ✓     |           |        |
| Delete workspace | ✓     |       |           |        |
| Invite members   | ✓     | ✓     |           |        |
| Remove members   | ✓     | ✓     |           |        |
| Update roles     | ✓     | ✓     |           |        |
| Publish packages | ✓     | ✓     | ✓         |        |
| Manage secrets   | ✓     | ✓     |           |        |
| Read secrets     | ✓     | ✓     | ✓         |        |
| Manage billing   | ✓     |       |           |        |

## Configuration

Workspaces use a `.holoscript/workspace.json` file:

```json
{
  "workspace": "@myteam/vr-project",
  "members": ["alice", "bob", "charlie"],
  "settings": {
    "formatter": { "tabWidth": 2 },
    "linter": { "rules": { "no-unused": "error" } }
  },
  "packages": {
    "@myteam/shared-components": "workspace:*"
  }
}
```

## CLI Usage

```bash
# Create workspace
holoscript workspace create my-team

# List workspaces
holoscript workspace list

# Invite member
holoscript workspace invite alice --role developer

# Set secret
holoscript workspace secret set API_KEY --value xxx

# View activity
holoscript workspace activity
```

## License

MIT
