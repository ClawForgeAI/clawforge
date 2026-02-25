# Setup Guide

## Docker (Recommended)

The fastest way to get running. One command starts Postgres, runs migrations, seeds an admin user, and launches both the server and admin console.

```bash
git clone https://github.com/ClawForgeAI/clawforge.git
cd clawforge
docker compose up --build
```

Once running:

- **Server API:** http://localhost:4100
- **Admin Console:** http://localhost:4200
- **Default login:** `admin@clawforge.local` / `clawforge`

To customize the default admin credentials:

```bash
SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD=s3cure \
  docker compose up --build
```

---

## Manual Setup

### Prerequisites

- Node.js >= 22
- PostgreSQL >= 15
- pnpm

### 1. Database Setup

```bash
createdb clawforge

cd server
pnpm install
pnpm db:migrate
pnpm db:seed  # Creates default org + admin user
```

The seed creates a superadmin you can log in with immediately. Customize with env vars:

| Variable | Default | Description |
|---|---|---|
| `SUPERADMIN_EMAIL` | `admin@clawforge.local` | Admin email |
| `SUPERADMIN_PASSWORD` | `clawforge` | Admin password |
| `SUPERADMIN_ORG_NAME` | `Default` | Organization name |

### 2. Start the Control Plane

```bash
cd server

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/clawforge"
export JWT_SECRET="your-secret-here"  # Change in production!
export CORS_ORIGIN="http://localhost:4200"

# Development
pnpm dev

# Production
pnpm build && pnpm start
```

The API starts on `http://localhost:4100`. Health check: `GET /health`.

### 3. Start the Admin Console

```bash
cd admin

export NEXT_PUBLIC_API_URL="http://localhost:4100"

# Development
pnpm dev

# Production
pnpm build && pnpm start
```

The admin UI is available at `http://localhost:4200`.

### 4. Log In

With the seeded admin user:

```bash
curl -X POST http://localhost:4100/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@clawforge.local", "password": "clawforge", "orgId": "<ORG_ID>"}'
```

The org ID is printed during seed output.

---

## Configure SSO (Optional)

SSO is not required for getting started. To add OIDC authentication alongside email/password:

1. Register an OIDC application with your IdP (Okta, Auth0, Entra ID, etc.)
2. Add SSO config to your org record:

```sql
UPDATE organizations
SET sso_config = '{"issuerUrl": "https://your-idp.example.com", "clientId": "your-client-id"}'
WHERE name = 'Default';
```

3. Configure the OpenClaw plugin:

```json
{
  "plugins": {
    "clawforge": {
      "controlPlaneUrl": "http://localhost:4100",
      "orgId": "your-org-uuid",
      "sso": {
        "issuerUrl": "https://your-idp.example.com",
        "clientId": "your-oidc-client-id"
      }
    }
  }
}
```

4. Run `/clawforge-login` from your OpenClaw session to authenticate via browser.

The control plane discovers your IdP's endpoints automatically via `/.well-known/openid-configuration`. You only need to provide the issuer URL and client ID. An optional audience claim can also be configured.

Both the discovery document and JWKS are cached in-memory for 1 hour, reducing latency and IdP load.

---

## Connect an OpenClaw Gateway

Add ClawForge to your OpenClaw config (`openclaw.json`):

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

See [Configuration](configuration.md) for details on all plugin options.

---

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Run everything in dev mode
pnpm --filter @ClawForgeAI/clawforge-server dev   # API on :4100
pnpm --filter @ClawForgeAI/clawforge-admin dev    # UI on :4200

# Database management
cd server
pnpm db:generate   # Generate migration from schema changes
pnpm db:migrate    # Apply migrations
pnpm db:seed       # Seed default org + admin user
pnpm db:studio     # Open Drizzle Studio (visual DB browser)
```
