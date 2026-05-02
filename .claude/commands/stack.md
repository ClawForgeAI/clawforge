# Docker Stack Management

Manage the full ClawForge Docker stack (PostgreSQL + Server + Admin).

## Instructions

Parse the operation from: $ARGUMENTS

If no argument, default to `status`.

### Operations

**up**:

1. Check if `.env` exists at project root. If not, copy from `.env.example`
2. Run `docker compose up --build -d`
3. Wait for health checks to pass (check with `docker compose ps`)
4. Report service status and URLs:
   - PostgreSQL: localhost:5432
   - Server API: http://localhost:4100
   - Admin Console: http://localhost:4200

**down**:

1. Run `docker compose down`
2. Report stopped services

**down-clean** (removes volumes — destructive):

1. Warn the user this will destroy all database data
2. Only proceed if user confirms
3. Run `docker compose down -v`

**logs** [service]:

1. Run `docker compose logs --tail=100 <service>` or all services if none specified

**seed**:

1. Run `docker compose run --rm seed`
2. Report seed completion (default credentials: admin@clawforge.local / clawforge)

**status**:

1. Run `docker compose ps`
2. Check health endpoint: `curl -sf http://localhost:4100/health/ready`
3. Report which services are running and healthy
