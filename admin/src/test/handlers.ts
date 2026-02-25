import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API_BASE = "http://localhost:4100";

const handlers = [
  // Auth mode
  http.get(`${API_BASE}/api/v1/auth/mode`, () => {
    return HttpResponse.json({ methods: ["password"] });
  }),

  // Login
  http.post(`${API_BASE}/api/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      password: string;
    };
    if (body.email === "admin@example.com" && body.password === "password123") {
      return HttpResponse.json({
        accessToken: "mock-token-123",
        refreshToken: "mock-refresh-token",
        expiresAt: Date.now() + 3600000,
        userId: "user-1",
        orgId: "org-1",
        email: "admin@example.com",
        roles: ["admin"],
      });
    }
    return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }),

  // Token exchange (SSO)
  http.post(`${API_BASE}/api/v1/auth/exchange`, () => {
    return HttpResponse.json({
      accessToken: "mock-sso-token",
      orgId: "org-1",
      userId: "user-1",
      email: "admin@example.com",
      role: "admin",
    });
  }),

  // Policy
  http.get(`${API_BASE}/api/v1/policies/:orgId`, () => {
    return HttpResponse.json({
      version: 1,
      tools: { allow: ["*"], deny: [], profile: "default" },
      skills: {
        approved: [{ name: "test-skill", key: "test-key", scope: "org" }],
        requireApproval: true,
      },
      killSwitch: { active: false },
      auditLevel: "full",
    });
  }),

  // Effective policy
  http.get(`${API_BASE}/api/v1/policies/:orgId/effective`, () => {
    return HttpResponse.json({
      version: 1,
      tools: { allow: ["*"], deny: [], profile: "default" },
      skills: {
        approved: [],
        requireApproval: true,
      },
      killSwitch: { active: false },
      auditLevel: "full",
    });
  }),

  // Audit query
  http.get(`${API_BASE}/api/v1/audit/:orgId/query`, () => {
    return HttpResponse.json({
      events: [
        {
          id: "evt-1",
          userId: "user-abcdef12",
          eventType: "tool_call",
          toolName: "file_read",
          outcome: "allowed",
          timestamp: new Date().toISOString(),
        },
        {
          id: "evt-2",
          userId: "user-abcdef12",
          eventType: "tool_call",
          toolName: "exec_cmd",
          outcome: "blocked",
          timestamp: new Date().toISOString(),
        },
      ],
      total: 2,
    });
  }),

  // Pending skills
  http.get(`${API_BASE}/api/v1/skills/:orgId/review`, () => {
    return HttpResponse.json({
      submissions: [
        {
          id: "sub-1",
          skillName: "test-skill",
          status: "pending",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }),

  // Approved skills
  http.get(`${API_BASE}/api/v1/skills/:orgId/approved`, () => {
    return HttpResponse.json({
      skills: [],
    });
  }),

  // Users
  http.get(`${API_BASE}/api/v1/users/:orgId`, () => {
    return HttpResponse.json({
      users: [
        {
          id: "user-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
        {
          id: "user-2",
          email: "user@example.com",
          name: "User",
          role: "member",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }),

  // Enrollment tokens
  http.get(`${API_BASE}/api/v1/enrollment-tokens/:orgId`, () => {
    return HttpResponse.json({
      tokens: [],
    });
  }),

  // Connected clients
  http.get(`${API_BASE}/api/v1/heartbeat/:orgId`, () => {
    return HttpResponse.json({
      clients: [],
      summary: { total: 5, online: 3, offline: 2 },
    });
  }),

  // Organization
  http.get(`${API_BASE}/api/v1/organizations/:orgId`, () => {
    return HttpResponse.json({
      organization: {
        id: "org-1",
        name: "Test Org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }),
];

export const server = setupServer(...handlers);
export { handlers };
