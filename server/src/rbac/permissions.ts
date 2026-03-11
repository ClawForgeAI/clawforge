/**
 * Built-in permissions for ClawForge RBAC (#61).
 */

export const PERMISSIONS = {
  // Policy
  "policy:read": { resource: "policy", action: "read", description: "View policies" },
  "policy:write": { resource: "policy", action: "write", description: "Create and update policies" },

  // Kill switch
  "killswitch:read": { resource: "killswitch", action: "read", description: "View kill switch status" },
  "killswitch:activate": { resource: "killswitch", action: "activate", description: "Activate/deactivate kill switch" },

  // Audit
  "audit:read": { resource: "audit", action: "read", description: "View audit logs" },
  "audit:write": { resource: "audit", action: "write", description: "Ingest audit events" },
  "audit:delete": { resource: "audit", action: "delete", description: "Delete audit data" },

  // Users
  "users:read": { resource: "users", action: "read", description: "View users" },
  "users:write": { resource: "users", action: "write", description: "Create and update users" },
  "users:delete": { resource: "users", action: "delete", description: "Delete users" },

  // Roles
  "roles:read": { resource: "roles", action: "read", description: "View roles" },
  "roles:write": { resource: "roles", action: "write", description: "Create and update roles" },

  // Skills
  "skills:read": { resource: "skills", action: "read", description: "View skill submissions" },
  "skills:review": { resource: "skills", action: "review", description: "Approve/reject skills" },

  // Settings
  "settings:read": { resource: "settings", action: "read", description: "View organization settings" },
  "settings:write": { resource: "settings", action: "write", description: "Update organization settings" },

  // API Keys
  "apikeys:read": { resource: "apikeys", action: "read", description: "View API keys" },
  "apikeys:write": { resource: "apikeys", action: "write", description: "Create and revoke API keys" },

  // Enrollment
  "enrollment:read": { resource: "enrollment", action: "read", description: "View enrollment tokens" },
  "enrollment:write": { resource: "enrollment", action: "write", description: "Create enrollment tokens" },

  // Heartbeat/Clients
  "clients:read": { resource: "clients", action: "read", description: "View connected clients" },
} as const;

export type PermissionName = keyof typeof PERMISSIONS;

/**
 * Built-in role definitions with their default permissions.
 */
export const BUILT_IN_ROLES: Record<string, { description: string; permissions: PermissionName[] }> = {
  super_admin: {
    description: "Full access to all features",
    permissions: Object.keys(PERMISSIONS) as PermissionName[],
  },
  admin: {
    description: "Organization administrator",
    permissions: Object.keys(PERMISSIONS) as PermissionName[],
  },
  policy_admin: {
    description: "Can manage policies and skills",
    permissions: [
      "policy:read", "policy:write",
      "killswitch:read", "killswitch:activate",
      "skills:read", "skills:review",
      "audit:read",
      "clients:read",
    ],
  },
  security_admin: {
    description: "Can manage security settings and audit",
    permissions: [
      "audit:read", "audit:delete",
      "killswitch:read", "killswitch:activate",
      "users:read",
      "settings:read", "settings:write",
      "apikeys:read", "apikeys:write",
      "clients:read",
    ],
  },
  viewer: {
    description: "Read-only access",
    permissions: [
      "policy:read",
      "killswitch:read",
      "audit:read",
      "users:read",
      "skills:read",
      "settings:read",
      "clients:read",
      "enrollment:read",
      "roles:read",
    ],
  },
  user: {
    description: "Basic user with limited access",
    permissions: [
      "policy:read",
      "audit:write",
    ],
  },
};
