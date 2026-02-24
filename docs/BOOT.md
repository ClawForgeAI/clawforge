# ClawForge — Boot Context

This document defines the core vision, purpose, and mental model of ClawForge. It should be passed to every agent, contributor, or AI assistant working on this project to ensure a shared understanding.

---

## What is ClawForge?

ClawForge is the **enterprise admin console and control plane** for [OpenClaw](https://github.com/openclaw), an open-source AI assistant. It gives organizations centralized governance over every OpenClaw instance running across their employees' machines.

Think of it like an MDM (Mobile Device Management) system, but for AI assistants instead of phones.

---

## The Problem

When an organization adopts OpenClaw as its AI assistant for employees:

- Each employee runs their own OpenClaw instance locally on their machine.
- Each instance can call tools (file read/write, shell exec, web fetch, etc.), install skills (third-party plugins), and interact with LLMs.
- Without governance, the org has **zero visibility or control** over what these AI assistants are doing — what tools they call, what data they access, what third-party code they run.
- There is no way to enforce security policies, audit activity, or respond to incidents across the fleet.

---

## The Solution

ClawForge solves this by providing a **single admin panel** that connects to every employee's OpenClaw instance and gives the organization:

1. **Centralized policy enforcement** — Define which tools are allowed or blocked, org-wide, from one place.
2. **Skill governance** — Employees submit third-party skills for admin review. Only approved skills can run.
3. **Audit trail** — Every tool call, session, and LLM interaction across all instances is logged and queryable.
4. **Kill switch** — Instantly disable all AI tool access across the entire org in an emergency.
5. **User management** — See who is using OpenClaw, their roles, and their last activity.
6. **Heartbeat monitoring** — Know which instances are online and what policy version they're running.

---

## Key Actors

| Actor | Description |
|---|---|
| **Org Admin** | Uses the ClawForge admin console (web UI) to manage policies, review skills, query audits, and control the kill switch. Has full visibility over all connected OpenClaw instances. |
| **Employee / User** | Runs OpenClaw on their machine for day-to-day work. Their instance connects to the org's ClawForge control plane and follows the policies set by the admin. They can submit skills for approval and see their own status. |
| **OpenClaw Instance** | The AI assistant running on an employee's machine. It connects to ClawForge via the `@ClawForgeAI/clawforge` plugin, authenticates the user, fetches policies, enforces tool restrictions, uploads audit events, and checks in via heartbeat. |

---

## How It Works (Big Picture)

```
Employee Machine A          Employee Machine B          Employee Machine C
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   OpenClaw + CG   │       │   OpenClaw + CG   │       │   OpenClaw + CG   │
│     Plugin        │       │     Plugin        │       │     Plugin        │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         │      Heartbeat, Policy Fetch, Audit Upload          │
         │              (authenticated HTTP)                    │
         └──────────────────┬───────┴──────────────────────────┘
                            │
                   ┌────────▼─────────┐        ┌───────────────────┐
                   │  ClawForge        │        │  ClawForge Admin   │
                   │  Control Plane    │◄──────►│  Console (Web UI)  │
                   │  (API Server)     │        │                   │
                   └────────┬─────────┘        └───────────────────┘
                            │                           ▲
                       PostgreSQL                       │
                                                   Org Admin
                                                (browser access)
```

1. Admin sets up ClawForge (server + admin console) and creates the organization.
2. Each employee installs the ClawForge plugin in their OpenClaw config and authenticates (via SSO or email/password).
3. The plugin connects the employee's OpenClaw instance to the org's control plane.
4. From that point on, the admin has control: policies are pushed down, audits flow up, and the kill switch works instantly.

---

## Architecture (Three Packages)

| Package | Role | Runs On |
|---|---|---|
| `@ClawForgeAI/clawforge` | OpenClaw plugin — hooks into the AI assistant lifecycle, enforces policies client-side, uploads audit events, polls heartbeat | Employee's machine |
| `@ClawForgeAI/clawforge-server` | Control plane API — manages auth, policies, skill reviews, audit storage, heartbeat, kill switch | Org's server / cloud |
| `@ClawForgeAI/clawforge-admin` | Admin web console — UI for managing everything | Org's server / cloud (accessed via browser) |

---

## Core Concepts

### Organization
The top-level tenant. An org groups users, policies, skills, and audit logs. Everything in ClawForge is scoped to an org.

### Policy
Each org has one active, versioned policy that defines:
- **Tool allow/deny lists** — Which tools can the AI assistant use?
- **Skill approval requirements** — Must skills be reviewed before use?
- **Audit level** — How much is logged? (`full` / `metadata` / `off`)
- **Kill switch state** — Is all tool access disabled?

Policies are fetched by each OpenClaw instance and enforced locally. When the admin updates a policy, connected instances detect the new version on their next heartbeat and refresh.

### Enrollment
How an employee's OpenClaw instance joins the org. Currently via SSO/OIDC login (`/clawforge-login`). The user authenticates, the control plane links them to the org, and the plugin stores a session locally.

### Heartbeat
Each connected instance periodically polls the control plane. The heartbeat serves two purposes:
1. **Liveness** — The admin sees which instances are online.
2. **State sync** — The instance learns about kill switch changes and policy updates.

### Audit Trail
Every tool call, session event, and (optionally) LLM interaction is batched and uploaded to the control plane. The admin can query and filter these logs in the console.

### Kill Switch
An emergency mechanism. When activated, **all** tool calls are blocked across every connected instance in the org. Propagates via heartbeat.

---

## What ClawForge is NOT

- **Not an AI model provider** — It doesn't host or run LLMs. OpenClaw handles that.
- **Not a replacement for OpenClaw** — It adds governance on top of OpenClaw. Without OpenClaw, ClawForge has nothing to govern.
- **Not per-user config** — Policies are org-wide (with some per-user skill scoping). It is not a personal settings manager.
- **Not real-time streaming** — Communication is poll-based (heartbeat). Kill switch propagation has a delay equal to the heartbeat interval.

---

## Current State & Known Gaps

### Implemented
- SSO/OIDC and email/password authentication
- Org-level policy management (tools, skills, audit level, kill switch)
- Skill submission, security scanning, and admin review workflow
- Audit event ingestion and querying
- Kill switch with heartbeat propagation
- Admin console with dashboard, policy editor, skill reviewer, audit viewer, user list
- Client heartbeat tracking

### Not Yet Implemented
- Enrollment tokens (admin generates a token, employee uses it to join the org without SSO)
- User CRUD API (invite, remove, change role)
- Multi-org management in the admin UI
- Audit export (CSV/JSON) and retention policies
- Real-time push (WebSocket/SSE for instant kill switch)
- Docker/production deployment configs
- Tests (unit + integration)
- Secret/API key management

---

## Guiding Principles

1. **Admin has control, user has transparency.** The admin governs; the user can always see what policies apply to them (`/clawforge-status`).
2. **Enforce at the edge.** Policies are enforced client-side in the plugin, not by blocking API calls at the server. The server is the source of truth; the plugin is the enforcer.
3. **Fail secure.** If the control plane is unreachable, the plugin activates a local kill switch after a threshold of failed heartbeats.
4. **Audit everything (configurable).** Default to logging. Let the admin dial it down, not up from zero.
5. **Org-scoped multi-tenancy.** Every resource belongs to an org. The schema supports multiple orgs even if the UI doesn't yet.
6. **Simple onboarding.** Getting an employee connected should be as easy as adding the plugin config and running one login command.
