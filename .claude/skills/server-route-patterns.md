# ClawForge Server Route Patterns

## Applies to

Files in `server/src/routes/`

## Route file structure

Every route file follows this pattern:

1. Zod schemas for request/response validation at the top
2. Async function exported as `xxxRoutes(app: FastifyInstance): Promise<void>`
3. Service instantiation inside the function: `const service = new XxxService(app.db)`
4. Routes registered directly on `app` with full paths (e.g., `/api/v1/skills/:orgId/submit`)

## Authentication and authorization

- Import guards from `../middleware/auth.js`: `requireAdmin`, `requireAdminOrViewer`, `requireOrg`, `requirePermission`
- Call guards at the start of each handler, then check if reply was sent:
  ```typescript
  requireOrg(request, reply, orgId);
  if (reply.sent) return;
  ```
- Access authenticated user via `request.authUser!` (non-null assertion safe after guard passes)

## Request validation

- Define Zod schemas at module level (e.g., `const CreateBodySchema = z.object({...})`)
- Validate in handler: `const parsed = CreateBodySchema.safeParse(request.body)`
- On failure: `reply.code(400).send({ error: "Validation failed", details: parsed.error.flatten().fieldErrors })`

## Response patterns

- 201 for creation: `reply.code(201).send(created)`
- 200 for reads and updates: `reply.send(data)`
- 404 for not found: `reply.code(404).send({ error: "Resource not found" })`
- 400 for validation: `reply.code(400).send({ error, details })`

## Webhook integration

After mutating operations, fire webhook events:

```typescript
webhookService.deliverEvent(orgId, "resource.action", { ...payload }).catch(() => {});
```

Event names follow `resource.action` pattern: `skill.submitted`, `skill.approved`, `policy.updated`, etc.

## Admin audit logging

Log admin mutations for the audit trail:

```typescript
logAdminAction(app.db, { orgId, userId, action, resourceType, resourceId, details }).catch(() => {});
```

## Route registration

New route files must be imported and registered in `server/src/server.ts`:

```typescript
import { newRoutes } from "./routes/new.js";
// inside createServer():
await app.register(newRoutes);
```

## Existing route files

alerts, api-keys, audit, auth, enrollment, events, heartbeat, organizations, policies, roles, skills, users, webhooks
