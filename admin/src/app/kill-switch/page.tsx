"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getPolicy, setKillSwitch, getUsers } from "@/lib/api";

export default function KillSwitchPage() {
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<boolean>(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    async function load() {
      const auth = getAuth()!;
      const [policyRes, usersRes] = await Promise.allSettled([
        getPolicy(auth.orgId, auth.accessToken),
        getUsers(auth.orgId, auth.accessToken),
      ]);
      if (policyRes.status === "fulfilled") {
        setActive(policyRes.value.killSwitch.active);
        setMessage(policyRes.value.killSwitch.message ?? "");
      }
      if (usersRes.status === "fulfilled") {
        setUserCount(usersRes.value.users.length);
      }
      setLoading(false);
    }

    load();
  }, [router]);

  function requestToggle(newState: boolean) {
    setPendingAction(newState);
    setShowConfirm(true);
  }

  async function confirmToggle() {
    const auth = getAuth();
    if (!auth) return;

    setShowConfirm(false);
    setToggling(true);

    try {
      await setKillSwitch(auth.orgId, auth.accessToken, pendingAction, message || undefined);
      setActive(pendingAction);
      toast.success(
        pendingAction
          ? "Kill switch activated. All agent tool calls are now blocked."
          : "Kill switch deactivated. Normal operations resumed.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update kill switch");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Kill Switch</h2>
          <p className="text-sm text-base-content/50 mt-1">Emergency control to halt all agent operations</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            {/* Status */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className={active ? "border-error/30 bg-error/5" : "border-success/30 bg-success/5"}>
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    active ? "bg-error/15" : "bg-success/15"
                  }`}>
                    <svg className={`w-7 h-7 ${active ? "text-error" : "text-success"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                      <line x1="12" y1="2" x2="12" y2="12" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold">
                      {active ? "Kill Switch is ACTIVE" : "Kill Switch is OFF"}
                    </h3>
                    <p className="text-sm text-base-content/50 mt-0.5">
                      {active
                        ? "All agent tool calls are currently blocked across the organization."
                        : "Agents are operating normally under policy rules."}
                    </p>
                  </div>
                  {active && (
                    <div className="w-3 h-3 rounded-full bg-error animate-pulse" />
                  )}
                </div>
              </Card>
            </motion.div>

            {/* Impact */}
            <Card>
              <CardTitle>Impact</CardTitle>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  </svg>
                </div>
                <p className="text-sm text-base-content/60">
                  {active ? "Currently affecting" : "Will affect"}{" "}
                  <span className="font-bold text-base-content text-lg">{userCount}</span> user{userCount !== 1 ? "s" : ""} in this organization.
                </p>
              </div>
            </Card>

            {/* Message */}
            <Card>
              <CardTitle>Custom Message</CardTitle>
              <p className="text-sm text-base-content/50 mb-3">
                This message will be shown to users when their tool calls are blocked.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Emergency maintenance in progress. All agent operations are temporarily suspended."
                rows={3}
                className="textarea textarea-bordered w-full text-sm resize-none"
              />
            </Card>

            {/* Toggle button */}
            <div>
              {active ? (
                <button
                  onClick={() => requestToggle(false)}
                  disabled={toggling}
                  className="btn btn-success btn-lg gap-2"
                >
                  {toggling && <span className="loading loading-spinner loading-sm" />}
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" /></svg>
                  {toggling ? "Updating..." : "Deactivate Kill Switch"}
                </button>
              ) : (
                <button
                  onClick={() => requestToggle(true)}
                  disabled={toggling}
                  className="btn btn-error btn-lg gap-2"
                >
                  {toggling && <span className="loading loading-spinner loading-sm" />}
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" /></svg>
                  {toggling ? "Updating..." : "Activate Kill Switch"}
                </button>
              )}
            </div>

            {/* Confirmation dialog */}
            <AnimatePresence>
              {showConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                  onClick={() => setShowConfirm(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="card bg-base-100 shadow-xl border border-base-300 max-w-md w-full mx-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="card-body">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 ${
                        pendingAction ? "bg-error/10" : "bg-success/10"
                      }`}>
                        <svg className={`w-6 h-6 ${pendingAction ? "text-error" : "text-success"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold">
                        {pendingAction ? "Activate Kill Switch?" : "Deactivate Kill Switch?"}
                      </h3>
                      <p className="text-sm text-base-content/60 mt-1">
                        {pendingAction
                          ? `This will immediately block all agent tool calls for ${userCount} user${userCount !== 1 ? "s" : ""}. Are you sure?`
                          : "This will restore normal agent operations under existing policy rules."}
                      </p>
                      <div className="card-actions justify-end mt-4">
                        <button
                          onClick={() => setShowConfirm(false)}
                          className="btn btn-ghost btn-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmToggle}
                          className={`btn btn-sm ${pendingAction ? "btn-error" : "btn-success"}`}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
