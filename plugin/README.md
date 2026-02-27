# @clawforgeai/clawforge

Enterprise governance plugin for [OpenClaw](https://github.com/ClawForgeAI/clawforge) — SSO authentication, tool policy enforcement, skill approval, audit logging, and kill switch.

## Features

- **SSO Authentication** — OIDC Authorization Code flow with PKCE, proactive token refresh
- **Tool Policy Enforcement** — allow/deny lists with group support (`group:fs`, `group:web`, etc.)
- **Skill Approval** — static security scanning and org-level approval workflow
- **Audit Logging** — buffered event shipping with configurable audit levels (`full`, `metadata`, `off`)
- **Kill Switch** — remote kill switch via heartbeat polling and real-time SSE events
- **Offline Resilience** — configurable offline modes: `block`, `allow`, or `cached`

## Installation

```bash
npm install @clawforgeai/clawforge
```

### Quick Setup

Use the bundled CLI to configure the plugin:

```bash
npx clawguard install --url https://clawforge.example.com --org your-org-id
```

Then enroll a user inside an OpenClaw session:

```
/clawforge-enroll <enrollment-token> <email>
```

### Manual Configuration

Add the plugin to your `~/.openclaw/openclaw.json`:

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

All configuration options are set in the plugin's `config` block:

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

## CLI

The `clawguard` CLI is included for setup and teardown:

```bash
# Configure the plugin
clawguard install --url <controlPlaneUrl> --org <orgId>

# Remove the plugin configuration
clawguard uninstall
```

## License

MIT
