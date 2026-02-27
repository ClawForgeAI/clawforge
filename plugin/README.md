# @clawforgeai/clawforge

Enterprise governance plugin for [OpenClaw](https://github.com/ClawForgeAI/clawforge) — SSO authentication, tool policy enforcement, skill approval, audit logging, and kill switch.

## Features

- **SSO Authentication** — OIDC Authorization Code flow with PKCE, proactive token refresh
- **Tool Policy Enforcement** — allow/deny lists with group support (`group:fs`, `group:web`, etc.)
- **Skill Approval** — static security scanning and org-level approval workflow
- **Audit Logging** — buffered event shipping with configurable audit levels (`full`, `metadata`, `off`)
- **Kill Switch** — remote kill switch via heartbeat polling and real-time SSE events
- **Offline Resilience** — configurable offline modes: `block`, `allow`, or `cached`

## Getting Started

### 1. Install the plugin

```bash
openclaw plugins install @clawforgeai/clawforge
```

### 2. Configure

Use the bundled CLI to point the plugin at your control plane:

```bash
npx clawguard install --url https://clawforge.example.com --org your-org-id
```

Or configure manually with `openclaw config set`:

```bash
openclaw config set plugins.entries.clawforge.config.controlPlaneUrl "https://clawforge.example.com"
openclaw config set plugins.entries.clawforge.config.orgId "your-org-id"
```

### 3. Enroll

Start OpenClaw and authenticate with an enrollment token:

```
/clawforge-enroll <token> <email>
```

### Manual Configuration

You can also edit `~/.openclaw/openclaw.json` directly:

```json
{
  "plugins": {
    "entries": {
      "clawforge": {
        "enabled": true,
        "config": {
          "controlPlaneUrl": "https://clawforge.example.com",
          "orgId": "your-org-id"
        }
      }
    }
  }
}
```

## Configuration

All options are set in the plugin's `config` block:

| Option | Type | Default | Description |
|---|---|---|---|
| `controlPlaneUrl` | `string` | — | Base URL of the ClawForge control plane |
| `orgId` | `string` | — | Organization identifier |
| `sso.issuerUrl` | `string` | — | OIDC issuer URL |
| `sso.clientId` | `string` | — | OIDC client ID |
| `offlineMode` | `"block" \| "allow" \| "cached"` | `"block"` | Behavior when the control plane is unreachable |
| `policyCacheTtlMs` | `number` | `3600000` | Policy cache TTL (ms) |
| `heartbeatIntervalMs` | `number` | `30000` | Heartbeat polling interval (ms) |
| `heartbeatFailureThreshold` | `number` | `10` | Consecutive failures before degraded mode |
| `auditBatchSize` | `number` | `100` | Audit events to buffer before shipping |
| `auditFlushIntervalMs` | `number` | `30000` | Audit flush interval (ms) |
| `maxAuditBufferSize` | `number` | `10000` | Max buffered audit events before dropping oldest |
| `sseEnabled` | `boolean` | `true` | Enable real-time SSE for instant kill switch and policy updates |

## Commands

The plugin registers the following OpenClaw slash commands:

| Command | Description |
|---|---|
| `/clawforge-login` | Authenticate via SSO |
| `/clawforge-enroll <token> <email>` | Enroll with an enrollment token |
| `/clawforge-submit <skill>` | Submit a skill for org approval |
| `/clawforge-status` | Display current governance status |

## Uninstall

```bash
npx clawguard uninstall
openclaw plugins uninstall clawforge
```

## License

MIT
