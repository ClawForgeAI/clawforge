# ClawForge — Boot Context

This document defines the core vision, purpose, and mental model of ClawForge. It should be passed to every agent, contributor, or AI assistant working on this project to ensure a shared understanding.

---

## What ClawForge is

ClawForge is a **control plane and operator console for AI agents at work**. It centralises policy, audit, and incident response across mixed agent runtimes, while keeping enforcement local to where the agent actually runs.

It is **not** another detection-shaped security product (prompt scanners, output monitors, risk-flag dashboards). Those tools watch behaviour at the runtime layer. ClawForge is the operations surface above them — who approves what, where policy lives, how an incident moves through the fleet, and what evidence exists after the fact.

The project's stance: **the runtime layer will keep changing**. The agent that matters next year will not be the agent that matters this year. An operations layer that only works against one vendor's runtime becomes a liability the day a second runtime arrives. ClawForge is therefore **vendor-neutral by intent, open by design, and self-hosted by default**.

---

## The operator gap it addresses

AI agents are spreading faster than the operator model around them. The pattern teams hit, in order:

1. **Fragmented runtimes** — Claude Code, OpenAI Agents, LangGraph, internal workflows, all with disconnected operators and disconnected policy.
2. **Untrusted MCP servers** — no allow-listing, approval flow, or audit trail for the capabilities agents are actually reaching.
3. **Shadow AI workflows** — autonomous agents touching production systems without governance, and without anyone tracking which.
4. **No queryable evidence** — security and legal cannot reconstruct what an agent did; logs are scattered, untyped, and inconsistent.
5. **No containment path** — kill switches and approval flows are scattered across tools, or missing entirely when an incident hits.

ClawForge gives those teams a single operational surface across whichever runtimes they already use.

---

## Four-layer architecture

ClawForge meets each runtime where it lives — local enforcement where the runtime supports it, MCP proxying where it doesn't, and an append-only audit pipeline either way.

| Layer                       | Role                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agents**                  | The assistants themselves: Claude Code, OpenClaw, OpenAI Agents, LangGraph, MCP servers, Microsoft AGT, custom enterprise agents.                                                   |
| **Adapters & interception** | Runtime-specific surfaces that translate ClawForge policy into something the agent's runtime actually understands — SDK hooks, MCP proxying, AGT integration, native runtime hooks. |
| **Governance runtime**      | Local enforcement, audit emission, heartbeat behaviour. Sits close to the agent rather than waiting on a round-trip to the cloud.                                                   |
| **Control plane**           | The operator surface: policy authoring, audit federation, approval queues, emergency state.                                                                                         |

The split matters. Operators want one place to write policy and review behaviour. Runtimes need enforcement that does not break when the network does. ClawForge does the operator half centrally and the enforcement half locally, and treats the connection between them as a first-class control loop, not a logging pipe.

### Trust boundaries

- **Assistant runtime** — enforces policy, tracks local state, uploads audit data.
- **Control plane API** — stores org policy, audit records, identity state, and runtime status.
- **Operator console** — review and response surface used by admins and platform teams.
- **Customer environment** — self-hosted deployment keeps control-plane services and storage under customer ownership.

### Core control flows

- **Policy enforcement** — versioned in the control plane, enforced close to the runtime so the operator model stays centralised while execution controls stay local.
- **Audit emission** — runtimes emit tool and session events upward into the control plane so operators can query behaviour without collecting logs machine by machine.
- **Heartbeat & control propagation** — the heartbeat loop reports liveness, checks policy freshness, and carries kill-switch state back to connected clients.
- **Kill-switch behaviour** — emergency controls publish through the same policy loop, with a local fail-secure posture when the control plane stops responding for too long.

---

## Capabilities

Everything flows through **policy, approval, audit, and response**. One operator model. One queryable event stream. One containment path.

| Capability                           | What it does                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-agent fleet inventory**      | Mixed-runtime view of every connected agent: where it runs, what version, which policy, last heartbeat.                                              |
| **Centralized policy engine**        | One operator model for permissions, tool scopes, approval thresholds, and audit depth — published once.                                              |
| **MCP governance console**           | Operator surface for the MCP catalog, approval queue, and audit query — layered on AGT's MCPGateway where present, ClawForge interception elsewhere. |
| **Approval workflows**               | Operator approvals for tool scopes, MCP servers, policy changes, and shell access — routed and timed-out.                                            |
| **Audit & evidence pipeline**        | Append-only event store. Query by agent, runtime, policy decision, or operator. Export evidence packs.                                               |
| **Fail-secure kill switch**          | Heartbeat-bounded propagation with a local fail-secure fallback. Containment that does not require connectivity.                                     |
| **AGT-compatible policy layer**      | Translates ClawForge policy into Microsoft AGT primitives where the runtime supports it.                                                             |
| **Risk signals & anomaly detection** | Surfaces unusual tool-call patterns, policy denials, and approval-rate drift across the fleet.                                                       |

---

## Relationship to Microsoft AGT

A common question is how this overlaps with **Microsoft AGT (Agent Governance Toolkit)**. The short answer: it does not. AGT is the enforcement substrate. ClawForge is the operations layer above it.

### What AGT enforces (substrate, runtime layer)

- Sub-millisecond per-tool-call policy enforcement
- MCPGateway and MCPSecurityScanner for MCP traffic
- Adapters for 20+ runtimes (LangChain, AutoGen, CrewAI, Semantic Kernel, OpenAI Agents SDK, Google ADK, …)
- Append-only, hash-chained audit log per deployment
- Four-tier privilege ring model and kill switches
- OWASP Agentic Top 10 coverage at the runtime layer

### What ClawForge operates (operations layer, console)

- Operator console across many AGT deployments and non-AGT runtimes
- Approval queue, routing, SLA, approver audit — the destination AGT's human-approval hook calls into
- MCP catalog, allow-list, and pending-approval surface above AGT's gateway
- Cross-runtime audit federation (AGT logs + Claude Code, OpenClaw, custom agents)
- Policy authoring, versioning, and fleet-wide distribution
- Incident response with mixed-runtime kill-switch posture
- Evidence packaging for security, legal, and compliance

For AGT-supported runtimes, AGT does the per-tool-call enforcement, the MCP gateway, and the append-only audit. ClawForge writes the policy AGT enforces, surfaces AGT's approval hooks into an operator queue, and federates AGT's audit log into the cross-runtime event store.

For runtimes outside AGT (Claude Code today, OpenClaw, custom agents), ClawForge handles interception itself — through SDK adapters, runtime hooks, or its own MCP proxy. **The operator surface stays the same either way**, which is the only thing that lets one team manage a mixed fleet without learning a new operator model per runtime.

ClawForge is not a Microsoft product and does not replace AGT.

---

## Runtime support

| Runtime       | Status        |
| ------------- | ------------- |
| Claude Code   | Available now |
| OpenClaw      | Available now |
| MCP servers   | Q3 2026       |
| OpenAI Agents | Q4 2026       |
| LangGraph     | Q4 2026       |
| Microsoft AGT | Q4 2026       |

The runtime list will grow; the operator surface is meant not to.

---

## The kill-switch model

A red button on a dashboard is easy to draw. A red button that reliably reaches every laptop, every session, and every tool surface across a working fleet — under conditions where something has already started going wrong — is a different problem. ClawForge treats this as a first-class concern.

A kill switch worth deploying has three properties, and ClawForge implements all three:

1. **Heartbeat-driven.** The runtime checks in with the control plane on a known cadence. Emergency state rides the same loop as policy updates — the runtime doesn't have to be told it's in an incident; it picks up the new posture on the next heartbeat.
2. **Fail-secure on silence.** If the runtime stops hearing from the control plane for too long, it defaults to a restricted posture rather than continuing under stale policy. The threshold is configurable; the default fails toward safe.
3. **Policy-graded, not binary.** The state can suspend specific tool surfaces, specific runtimes, specific sessions, or specific scopes of user identity. The binary "everything off" version is one expression of the same state machine, not a separate code path.

Operators change kill-switch state through the same console where policy lives. Actions are auditable and role-gated. A runtime that is offline past the fail-secure threshold lands in a restricted posture until it has reconnected and resynced — it does not get to keep operating under stale assumptions.

A kill switch is **not** a substitute for runtime sandboxing, **not** a detection system, and **not** an excuse to ship weak default policy. It is the containment path for the day a "safe" tool call turns out not to be.

---

## Security posture

ClawForge is the operations layer for enterprise AI agents. The trust boundary, incident path, and disclosure route are explicit — no certifications claimed beyond what is in place, and no opaque deployment shape.

### Principles

- **Self-hosted deployment** keeps the control plane, admin surface, and storage boundary in customer-managed infrastructure.
- **Policy enforcement happens close to the runtime**, not in a detached reporting-only layer.
- **Audit trails are a product surface**, not an afterthought.
- **Incident controls are visible and operational**, with kill-switch state propagating through the same control loop as policy updates.

### Posture

- **Identity & access** — SSO / OIDC plus password-based paths; org-scoped roles decide who can review policies, inspect events, and change emergency state.
- **Audit logging** — tool attempts, session activity, and operator actions are queryable in the control plane.
- **Fail-secure** — heartbeat carries policy freshness and kill-switch state; long silence puts runtimes in a restricted posture rather than letting them continue under stale assumptions.
- **Release hygiene** — public repo with CI and release automation in view.

### Shared responsibility

**ClawForge secures:**

- Policy distribution and enforcement boundary
- Audit collection, retention configuration, and operator query surface
- Incident-control surfaces — the remote kill switch and heartbeat propagation

**You still own:**

- Infrastructure hardening, network policy, and database posture
- Identity-provider configuration and secrets management
- Assistant-specific behaviour outside the governed adapter surface

### Responsible disclosure

Send disclosures to **contact@clawforge.co**, or use the website contact form with the "security disclosure" inquiry type. A reproduction outline, impacted surface, and severity estimate are enough to start follow-up — please avoid attaching unnecessary sensitive material in the first contact.

---

## Who it is for

- **Platform engineering** — standardise agent rollout, policy, and runtime governance across teams without rebuilding operator tooling per runtime. Audit query across runtimes, policy publish + propagation, one operator on call instead of N.
- **Security & compliance** — approval workflows, queryable audit evidence, and operational containment for AI agents and the MCP servers they reach.
- **AI platform teams** — govern custom AGT and LangGraph agents alongside Claude Code and OpenAI Agents from one operational surface.

---

## Open-source posture

| Field           | Value                    |
| --------------- | ------------------------ |
| License         | MIT                      |
| Deployment      | Self-hosted-first        |
| Runtime lock-in | None                     |
| Policy format   | Open, versioned          |
| Audit store     | Customer-hosted Postgres |
| Contributors    | Community-driven         |

The control plane runs in your environment, on your storage, governing whichever agent runtimes you already use. No runtime lock-in, no proprietary policy format. ClawForge is MIT licensed, inspectable, self-hosted, and forkable.

---

## The thesis, in one paragraph

Most AI security products today are detection-shaped: scan prompts, watch outputs, flag risky calls, report incidents. That work is useful, but it is not the operator's missing piece. The missing piece is the operations surface _above_ it — who approves what, where policy lives, how an incident actually moves through the fleet, and what evidence exists after the fact. ClawForge is that surface, built so the same control plane that ships policy also shows runtime posture and the evidence behind every decision — across whichever agent runtimes a team already uses, today and next year.

**Operate AI agents like production infrastructure.**
