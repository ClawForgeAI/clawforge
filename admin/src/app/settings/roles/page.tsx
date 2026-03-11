"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getRoles, getPermissions } from "@/lib/api";
import type { Role, Permission } from "@/lib/api";

export default function RolesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    Promise.all([
      getRoles(auth.orgId, auth.accessToken),
      getPermissions(auth.orgId, auth.accessToken),
    ])
      .then(([rolesData, permsData]) => {
        setRoles(rolesData.roles);
        setPermissions(permsData.permissions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  // Group permissions by resource
  const groupedPerms = permissions.reduce<Record<string, Permission[]>>((acc, perm) => {
    if (!acc[perm.resource]) acc[perm.resource] = [];
    acc[perm.resource].push(perm);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Role Management</h2>
          <p className="text-sm text-base-content/50 mt-1">View and manage roles and permissions</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Roles list */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider mb-2">Roles</h3>
              {roles.map((role) => (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <button
                    onClick={() => setSelectedRole(role)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedRole?.id === role.id
                        ? "border-primary bg-primary/10"
                        : "border-base-300 bg-base-100 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{role.name.replace(/_/g, " ")}</span>
                      {role.isBuiltIn && (
                        <Badge variant="default">Built-in</Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-xs text-base-content/50 mt-1">{role.description}</p>
                    )}
                    <p className="text-xs text-base-content/40 mt-1">
                      {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
                    </p>
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Permission details */}
            <div className="lg:col-span-2">
              {selectedRole ? (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <CardTitle className="mb-0">{selectedRole.name.replace(/_/g, " ")}</CardTitle>
                      {selectedRole.description && (
                        <p className="text-sm text-base-content/50 mt-1">{selectedRole.description}</p>
                      )}
                    </div>
                    {selectedRole.isBuiltIn && (
                      <Badge variant="default">Built-in (read-only)</Badge>
                    )}
                  </div>
                  <div className="space-y-4">
                    {Object.entries(groupedPerms).map(([resource, perms]) => (
                      <div key={resource}>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">
                          {resource}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {perms.map((perm) => {
                            const hasPermission = selectedRole.permissions.includes(perm.name);
                            return (
                              <label
                                key={perm.name}
                                className={`flex items-center gap-2 p-2 rounded text-sm ${
                                  hasPermission ? "text-base-content" : "text-base-content/30"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={hasPermission}
                                  disabled={selectedRole.isBuiltIn}
                                  readOnly
                                  className="checkbox checkbox-xs checkbox-primary"
                                />
                                <span>{perm.action}</span>
                                <span className="text-xs text-base-content/40 ml-auto">{perm.description}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="text-center py-12 text-base-content/40">
                    <p className="text-sm">Select a role to view its permissions</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
