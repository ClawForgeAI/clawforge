# End-to-End Onboarding Guide

A complete walkthrough from zero to a fully managed OpenClaw fleet. By the end of this guide you will have a running ClawForge instance, a configured organization, at least one enrolled employee, and verified governance across policies, audit, kill switch, and skill review.

**Time estimate:** 20-30 minutes for Parts 1-3; Part 4 verification adds another 10 minutes.

---

## Part 1: Admin Setup

### Prerequisites

You need **one** of the following:

| Option | Requirements |
|--------|-------------|
| **Docker (recommended)** | Docker Engine + Docker Compose |
| **Manual** | Node.js >= 22, PostgreSQL >= 15, pnpm |

The Docker path is covered here. For manual setup, see the [Setup Guide](setup.md).

### 1.1 Clone and Start

```bash
git clone https://github.com/openclaw/clawforge.git
cd clawforge
docker compose up --build
```

This starts three services:

| Service | URL | Purpose |
|---------|-----|---------|
| PostgreSQL | `localhost:5432` | Database (auto-migrated and seeded) |
| Server API | `http://localhost:4100` | Control plane |
| Admin Console | `http://localhost:4200` | Web dashboard |

Wait until you see the server log indicating it is listening on port 4100. You can verify the server is healthy:

```bash
curl http://localhost:4100/health
# {"status":"ok"}
```

### 1.2 Log In to the Admin Console

Open [http://localhost:4200](http://localhost:4200) in your browser and log in with the default credentials:

| Field | Value |
|-------|-------|
| Email | `admin@clawforge.local` |
| Password | `clawforge` |

> **Production note:** Change these before deploying. You can set custom credentials with environment variables when starting Docker:
>
> ```bash
> SUPERADMIN_EMAIL=admin@yourcompany.com SUPERADMIN_PASSWORD=s3cure \
>   docker compose up --build
> ```

### 1.3 Tour of the Dashboard

After logging in, the admin console shows these sections:

| Section | What It Does |
|---------|--------------|
| **Dashboard** | Overview of connected clients, recent activity, and kill switch status |
| **Policies** | Configure tool allow/deny lists, audit level, skill approval requirements, and the kill switch |
| **Skills** | Review pending skill submissions, see approved skills, approve or reject |
| **Audit** | Query and filter all audit events (tool calls, sessions, LLM interactions) across the org |
| **Users** | List all enrolled users, their roles, and last activity |
| **Enrollment Tokens** | Generate and manage invite tokens for onboarding new users |

Take a moment to click through each section. The org is empty right now, so most views will be blank. That changes once employees connect.

---

## Part 2: Configure Your Organization

### 2.1 Set Tool Policies

Navigate to **Policies** in the admin console. This is where you define which tools employees' AI assistants are allowed to use.

A good starting policy:

| Setting | Value | Reason |
|---------|-------|--------|
| **Allow list** | `read`, `write`, `web_search` | Common, low-risk tools |
| **Deny list** | `exec` | Shell execution is high-risk; block it by default |
| **Profile** | `restricted` | Named profile for clarity |

If you prefer to set this via API:

```bash
# First, get your org ID from the seed output or the admin console URL
ORG_ID="your-org-uuid"
TOKEN="your-admin-jwt"

curl -X PUT "http://localhost:4100/api/v1/policies/$ORG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toolsConfig": {
      "allow": ["read", "write", "web_search"],
      "deny": ["exec"],
      "profile": "restricted"
    },
    "skillsConfig": {
      "requireApproval": true
    },
    "auditLevel": "metadata"
  }'
```

### 2.2 Configure Audit Level

The audit level controls how much data is captured from each OpenClaw instance:

| Level | What Is Logged | Recommended For |
|-------|---------------|-----------------|
| `metadata` | Tool names, outcomes (allowed/blocked), timestamps, session IDs | **Start here** -- good visibility, low storage |
| `full` | Everything in `metadata` plus full tool inputs/outputs and LLM interactions | Security-sensitive orgs, incident investigation |
| `off` | Nothing | Not recommended |

Set this in the **Policies** page alongside your tool config. We recommend starting with `metadata` and upgrading to `full` only if you need detailed forensics.

### 2.3 (Optional) Configure SSO

If your organization uses an OIDC provider (Okta, Auth0, Entra ID), you can enable SSO alongside email/password authentication. This is optional -- enrollment tokens (next step) work without SSO.

Brief steps:

1. Register an OIDC application with your identity provider.
2. Set the redirect URI to `http://localhost:19832/clawforge/callback` (the OpenClaw plugin's local callback).
3. Add the SSO config to your organization record (via SQL or API).

For detailed SSO setup instructions, see the [Setup Guide -- Configure SSO](setup.md#configure-sso-optional).

### 2.4 Generate Enrollment Tokens

Enrollment tokens let employees join the organization without SSO. Navigate to **Enrollment Tokens** in the admin console and create a token.

You can optionally set:
- **Label** -- A human-readable name (e.g., "Engineering team Q1")
- **Expiry** -- When the token stops working
- **Max uses** -- How many employees can use this token

Copy the generated token string. You will distribute this to employees in the next step.

To create a token via API:

```bash
curl -X POST "http://localhost:4100/api/v1/enrollment-tokens/$ORG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Engineering team",
    "maxUses": 50
  }'
```

---

## Part 3: Employee Onboarding

These steps are performed on each employee's machine.

### 3.1 Install OpenClaw

If the employee does not already have OpenClaw installed, follow the installation instructions in the [OpenClaw documentation](https://github.com/openclaw/openclaw).

### 3.2 Add the ClawForge Plugin

Open the OpenClaw configuration file (`openclaw.json`) and add the ClawForge plugin block. Copy and paste this, replacing the placeholder values:

```json
{
  "plugins": {
    "clawforge": {
      "controlPlaneUrl": "http://localhost:4100",
      "orgId": "your-org-uuid"
    }
  }
}
```

| Field | Where to Find It |
|-------|-------------------|
| `controlPlaneUrl` | The URL where your ClawForge server is running. Use `http://localhost:4100` for local setups, or the production URL for deployed instances. |
| `orgId` | Shown in the admin console, or in the seed output when the server first starts. |

> **Optional settings:** You can also configure `policyCacheTtlMs`, `heartbeatIntervalMs`, `auditBatchSize`, and more. See the [Configuration Reference](configuration.md) for all options.

If your organization uses SSO, also add the `sso` block:

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

### 3.3 Enroll

There are two ways to enroll, depending on your organization's auth setup:

**Option A: Enrollment token (no SSO required)**

The admin provides the employee with an enrollment token. The employee runs:

```
/clawforge-login
```

and enters the enrollment token along with their email and name when prompted. This registers them with the organization and stores a session locally at `~/.clawforge/session.json`.

**Option B: SSO login**

If SSO is configured, the employee runs:

```
/clawforge-login
```

This opens a browser window for OIDC authentication. After completing the login flow, the session is stored locally.

### 3.4 Verify Connection

After enrolling, the employee can check their connection status:

```
/clawforge-status
```

This displays:
- Auth state (authenticated or not)
- Organization name and ID
- Current policy version
- Kill switch status (active or inactive)
- Heartbeat status

If everything is working, you should see an authenticated state, the correct org, and the policy version matching what the admin set.

---

## Part 4: Verification Checklist

Walk through each item to confirm the full system is working end-to-end.

- [ ] **Admin sees employee in Users list** -- In the admin console, navigate to **Users**. The newly enrolled employee should appear with their email and role.

- [ ] **Dashboard shows online client** -- Navigate to **Dashboard**. The employee's OpenClaw instance should show as online (heartbeat received). If it does not appear immediately, wait up to one heartbeat interval (default: 60 seconds).

- [ ] **Blocked tool call is enforced** -- Have the employee attempt to use a denied tool (e.g., `exec` if you followed the policy example above). The tool call should be blocked by the plugin with a policy violation message.

- [ ] **Audit events appear** -- Navigate to **Audit** in the admin console. You should see events for the blocked tool call (`tool_call_attempt` with outcome `blocked`) and any allowed tool calls. Filter by user or event type to find them.

- [ ] **Kill switch works end-to-end** -- In the admin console, go to **Policies** and activate the kill switch. Optionally add a message (e.g., "Tool access suspended for security review"). Wait one heartbeat interval, then have the employee try any tool call. It should be blocked. Deactivate the kill switch and verify tools work again.

- [ ] **Skill governance works** -- Have the employee submit a skill from their OpenClaw instance. In the admin console, navigate to **Skills** and review the pending submission. Approve it and verify the skill becomes available to the employee. Reject a different submission and verify it does not load.

---

## Part 5: Troubleshooting

### "Connection refused"

**Cause:** The ClawForge server is not running, or the `controlPlaneUrl` in the plugin config points to the wrong address.

**Fix:**
1. Verify the server is running: `curl http://localhost:4100/health` should return `{"status":"ok"}`.
2. Check that `controlPlaneUrl` in `openclaw.json` matches the actual server address.
3. If running Docker, ensure the container is up: `docker compose ps`.

### "Unauthorized"

**Cause:** The authentication token has expired, or the `orgId` in the plugin config is incorrect.

**Fix:**
1. Re-authenticate by running `/clawforge-login`.
2. Verify the `orgId` in `openclaw.json` matches the organization UUID shown in the admin console.
3. Check that the session file exists at `~/.clawforge/session.json` and is not corrupted.

### "SSO callback error"

**Cause:** The OIDC redirect URI is misconfigured, or the SSO config is missing from the organization record.

**Fix:**
1. Confirm the redirect URI in your IdP matches `http://localhost:19832/clawforge/callback`.
2. Verify the `sso_config` is set on the organization record (check via the database or API).
3. Ensure the `sso.issuerUrl` and `sso.clientId` in `openclaw.json` match your IdP configuration.
4. See the [Setup Guide -- Configure SSO](setup.md#configure-sso-optional) for detailed instructions.

### "No heartbeat" (employee not showing as online)

**Cause:** The plugin is not connected to the control plane, or there is a network issue between the employee's machine and the server.

**Fix:**
1. Run `/clawforge-status` on the employee's machine to check connection state.
2. Verify the employee is authenticated (session not expired).
3. Check network connectivity: `curl http://<controlPlaneUrl>/health` from the employee's machine.
4. If the server is behind a firewall or VPN, ensure the employee has access.

### "Tools not blocked" (policy not enforced)

**Cause:** The plugin has not fetched the latest policy, or the cached policy is stale.

**Fix:**
1. Run `/clawforge-status` to see the current policy version on the client.
2. Compare it with the policy version in the admin console.
3. If they differ, wait for the next heartbeat to trigger a policy refresh, or restart the OpenClaw instance.
4. Check that `policyCacheTtlMs` is not set to an excessively large value in `openclaw.json`.

### Where to Find Logs

| Component | Log Location |
|-----------|-------------|
| **Server (Docker)** | `docker compose logs server` |
| **Server (manual)** | stdout of the `pnpm dev` or `node dist/index.js` process |
| **Admin Console (Docker)** | `docker compose logs admin` |
| **Plugin** | OpenClaw's plugin log output (check OpenClaw docs for log location) |
| **Session file** | `~/.clawforge/session.json` (contains auth state, not a log, but useful for debugging auth issues) |

---

## Next Steps

- Read the [Architecture & How It Works](architecture.md) guide to understand the system internals.
- Explore the [API Reference](api-reference.md) for programmatic management.
- Review the [Configuration Reference](configuration.md) for all plugin and server options.
- Set up SSO if you have not already -- see the [Setup Guide](setup.md#configure-sso-optional).
