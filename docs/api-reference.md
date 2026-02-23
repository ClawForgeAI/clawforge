# API Reference

All endpoints except those marked "Public" require a `Bearer` token in the `Authorization` header.

**Base URL:** `http://localhost:4100`

**Health check:** `GET /health` → `{"status": "ok"}` (no auth required)

---

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Public | Email/password login |
| `POST` | `/api/v1/auth/exchange` | Public | SSO token exchange (OIDC code/token) |
| `POST` | `/api/v1/auth/enroll` | Public | Enroll with enrollment token |
| `GET` | `/api/v1/auth/mode` | Public | Available auth methods |
| `POST` | `/api/v1/auth/change-password` | User | Self-service password change |

### Login

```json
// POST /api/v1/auth/login
{
  "email": "admin@clawforge.local",
  "password": "clawforge",
  "orgId": "org-uuid"
}
```

### Enrollment

```json
// POST /api/v1/auth/enroll
{
  "token": "enrollment-token-string",
  "email": "newuser@example.com",
  "name": "New User"
}
```

### SSO Token Exchange

**Grant types:**

**Authorization Code** (interactive browser login with PKCE):

```json
// POST /api/v1/auth/exchange
// Header: X-ClawForge-Org: <org-uuid>
{
  "grantType": "authorization_code",
  "code": "auth-code-from-idp",
  "codeVerifier": "pkce-verifier",
  "redirectUri": "http://localhost:19832/clawforge/callback"
}
```

**ID Token** (direct validation, headless/CI):

```json
// POST /api/v1/auth/exchange
{
  "grantType": "id_token",
  "idToken": "eyJ...",
  "orgId": "org-uuid"
}
```

**Refresh Token:**

```json
// POST /api/v1/auth/exchange
{
  "grantType": "refresh_token",
  "refreshToken": "eyJ..."
}
```

### Auth Response (all auth endpoints)

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresAt": 1703361600000,
  "userId": "uuid",
  "orgId": "uuid",
  "email": "user@example.com",
  "roles": ["admin"]
}
```

**Token lifetimes:** Access token = 1 hour, Refresh token = 30 days.

---

## Enrollment Tokens

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/enrollment-tokens/:orgId` | Admin | Create token (optional: `label`, `expiresAt`, `maxUses`) |
| `GET` | `/api/v1/enrollment-tokens/:orgId` | Admin | List active tokens |
| `DELETE` | `/api/v1/enrollment-tokens/:orgId/:tokenId` | Admin | Revoke a token |

---

## Policies

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/policies/:orgId/effective` | User | Get effective policy for authenticated user |
| `GET` | `/api/v1/policies/:orgId` | Admin | Get raw org policy |
| `PUT` | `/api/v1/policies/:orgId` | Admin | Update org policy |
| `PUT` | `/api/v1/policies/:orgId/kill-switch` | Admin | Toggle kill switch |

### Update Policy

```json
// PUT /api/v1/policies/:orgId
{
  "toolsConfig": {
    "allow": ["web_search", "read", "write"],
    "deny": ["exec"],
    "profile": "restricted"
  },
  "skillsConfig": {
    "requireApproval": true,
    "approved": [
      { "name": "weather", "key": "weather-v1", "scope": "org" }
    ]
  },
  "auditLevel": "full"
}
```

### Toggle Kill Switch

```json
// PUT /api/v1/policies/:orgId/kill-switch
{
  "active": true,
  "message": "Tool access suspended pending security review."
}
```

---

## Skills

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/skills/:orgId/submit` | User | Submit a skill for review |
| `GET` | `/api/v1/skills/:orgId/review` | Admin | List pending submissions |
| `PUT` | `/api/v1/skills/:orgId/review/:id` | Admin | Approve or reject a submission |
| `GET` | `/api/v1/skills/:orgId/approved` | User | List approved skills |

### Review a Submission

```json
// PUT /api/v1/skills/:orgId/review/:id
{
  "status": "approved-org",
  "reviewNotes": "Reviewed, no issues found.",
  "approvedForUser": "optional-user-uuid"
}
```

Status values: `approved-org`, `approved-self`, `rejected`

---

## Audit

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/audit/:orgId/events` | User | Ingest audit events (batched from plugin) |
| `GET` | `/api/v1/audit/:orgId/query` | Admin | Query audit logs |

### Query Parameters

| Parameter | Description |
|---|---|
| `userId` | Filter by user ID |
| `eventType` | Filter by event type |
| `toolName` | Filter by tool name |
| `outcome` | Filter by outcome (`allowed`, `blocked`, `error`, `success`) |
| `from` | Start time (ISO-8601) |
| `to` | End time (ISO-8601) |
| `limit` | Max results |
| `offset` | Pagination offset |

### Example Query

```bash
curl "http://localhost:4100/api/v1/audit/$ORG_ID/query?\
userId=$USER_ID&\
eventType=tool_call_attempt&\
outcome=blocked&\
from=2025-01-01T00:00:00Z&\
to=2025-01-31T23:59:59Z&\
limit=50&\
offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Response

```json
{
  "events": [
    {
      "id": "uuid",
      "userId": "uuid",
      "eventType": "tool_call_attempt",
      "toolName": "exec",
      "outcome": "blocked",
      "agentId": "main",
      "sessionKey": "session-abc",
      "metadata": {},
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Heartbeat

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/heartbeat/:orgId/:userId` | User | Client heartbeat — returns kill switch state + policy version |

### Response

```json
{
  "policyVersion": 3,
  "killSwitch": false,
  "killSwitchMessage": null,
  "refreshPolicyNow": false
}
```

---

## Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/:orgId` | Admin | List org users |
