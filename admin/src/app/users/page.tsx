"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getUsers, createUser, updateUser, deleteUser } from "@/lib/api";
import type { OrgUser } from "@/lib/api";

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [router]);

  function loadUsers() {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setCurrentUserId(auth.userId);
    setLoading(true);
    getUsers(auth.orgId, auth.accessToken)
      .then((data) => setUsers(data.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleInvite() {
    const auth = getAuth();
    if (!auth) return;
    setInviting(true);
    try {
      await createUser(auth.orgId, auth.accessToken, {
        email: inviteEmail,
        name: inviteName || undefined,
        role: inviteRole,
        password: invitePassword || undefined,
      });
      toast.success(`User ${inviteEmail} created.`);
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("user");
      setInvitePassword("");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await updateUser(auth.orgId, userId, auth.accessToken, { role: newRole });
      toast.success("Role updated.");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const auth = getAuth();
    if (!auth) return;
    setDeleting(true);
    try {
      await deleteUser(auth.orgId, deleteTarget.id, auth.accessToken);
      toast.success(`User ${deleteTarget.email} removed.`);
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Users</h2>
            <p className="text-sm text-base-content/50 mt-1">{users.length} member{users.length !== 1 ? "s" : ""} in your organization</p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="btn btn-primary btn-sm gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Invite User
          </button>
        </div>

        <AnimatePresence>
          {showInvite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <Card>
                <CardTitle>Invite User</CardTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Email *</span></label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@company.com"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Name</span></label>
                    <input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="John Doe"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Role</span></label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="select select-bordered select-sm w-full"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Password (optional)</span></label>
                    <input
                      type="password"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail}
                    className="btn btn-primary btn-sm"
                  >
                    {inviting && <span className="loading loading-spinner loading-xs" />}
                    {inviting ? "Creating..." : "Create User"}
                  </button>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <CardSkeleton />
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-base-content/40">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            </svg>
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto -mx-5">
              <table className="table table-sm">
                <thead>
                  <tr className="text-base-content/40 text-xs uppercase">
                    <th>User</th>
                    <th>Role</th>
                    <th>Last Seen</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="table-row-hover"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase shrink-0">
                            {user.email.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{user.name || user.email}</p>
                            {user.name && <p className="text-xs text-base-content/40">{user.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="select select-bordered select-xs"
                          disabled={user.id === currentUserId}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="text-base-content/50 text-sm">{formatDate(user.lastSeenAt)}</td>
                      <td className="text-base-content/50 text-sm">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {user.id !== currentUserId && (
                          <button
                            onClick={() => setDeleteTarget({ id: user.id, email: user.email })}
                            className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Delete confirmation dialog */}
        <AnimatePresence>
          {deleteTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => !deleting && setDeleteTarget(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-base-100 rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center">
                    <svg className="w-5 h-5 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-lg">Remove User</h3>
                </div>
                <p className="text-sm text-base-content/60 mb-5">
                  Remove <strong>{deleteTarget.email}</strong> from the organization? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="btn btn-error btn-sm"
                  >
                    {deleting && <span className="loading loading-spinner loading-xs" />}
                    {deleting ? "Removing..." : "Remove"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
