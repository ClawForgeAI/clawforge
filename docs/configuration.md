# Configuration Reference

## Plugin Config (`ClawForgePluginConfig`)

These options go in your OpenClaw config file (`openclaw.json`) under `plugins.clawforge`:

| Key | Type | Default | Description |
|---|---|---|---|
| `controlPlaneUrl` | `string` | — | URL of the ClawForge control plane API |
| `orgId` | `string` | — | Organization UUID (fallback if not in session) |
| `sso.issuerUrl` | `string` | — | OIDC issuer URL (optional — only needed for SSO) |
| `sso.clientId` | `string` | — | OIDC client ID (optional — only needed for SSO) |
| `policyCacheTtlMs` | `number` | — | How long to cache policy locally (ms) |
| `heartbeatIntervalMs` | `number` | — | Kill switch polling interval (ms) |
| `heartbeatFailureThreshold` | `number` | — | Consecutive heartbeat failures before activating local kill switch |
| `auditBatchSize` | `number` | — | Max events per audit flush batch |
| `auditFlushIntervalMs` | `number` | — | Audit event flush interval (ms) |

Example:

```json
{
  "plugins": {
    "clawforge": {
      "controlPlaneUrl": "http://localhost:4100",
      "orgId": "your-org-uuid",
      "policyCacheTtlMs": 300000,
      "heartbeatIntervalMs": 60000,
      "heartbeatFailureThreshold": 3,
      "auditBatchSize": 50,
      "auditFlushIntervalMs": 10000
    }
  }
}
```

---

## Server Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4100` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `postgresql://localhost:5432/clawforge` | PostgreSQL connection string |
| `JWT_SECRET` | `clawforge-dev-secret-change-in-production` | JWT signing secret — **must change in production** |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |

---

## Admin Console Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4100` | Control plane API URL |

---

## Seed Environment Variables

Used when running `pnpm db:seed` to create the initial organization and admin user:

| Variable | Default | Description |
|---|---|---|
| `SUPERADMIN_EMAIL` | `admin@clawforge.local` | Admin email address |
| `SUPERADMIN_PASSWORD` | `clawforge` | Admin password |
| `SUPERADMIN_ORG_NAME` | `Default` | Organization name |
