"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  getPendingSkills,
  reviewSkill,
  getApprovedSkills,
  revokeSkillApproval,
  resubmitSkill,
  getSkillHistory,
} from "@/lib/api";
import type { SkillSubmission, ApprovedSkill } from "@/lib/api";

export default function SkillsPage() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<SkillSubmission[]>([]);
  const [approved, setApproved] = useState<ApprovedSkill[]>([]);
  const [history, setHistory] = useState<ApprovedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "history">("pending");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    const auth = getAuth()!;
    const [pendingRes, approvedRes, historyRes] = await Promise.allSettled([
      getPendingSkills(auth.orgId, auth.accessToken),
      getApprovedSkills(auth.orgId, auth.accessToken),
      getSkillHistory(auth.orgId, auth.accessToken),
    ]);
    if (pendingRes.status === "fulfilled") setPending(pendingRes.value.submissions);
    if (approvedRes.status === "fulfilled") setApproved(approvedRes.value.skills);
    if (historyRes.status === "fulfilled") setHistory(historyRes.value.skills);
    setLoading(false);
  }

  async function handleReview(id: string, status: string) {
    const auth = getAuth();
    if (!auth) return;

    setReviewingId(id);
    try {
      await reviewSkill(auth.orgId, id, auth.accessToken, { status });
      toast.success(`Skill ${status === "rejected" ? "rejected" : "approved"}.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  }

  async function handleRevoke(skillId: string) {
    const auth = getAuth();
    if (!auth) return;

    setRevokingId(skillId);
    try {
      await revokeSkillApproval(auth.orgId, skillId, auth.accessToken);
      toast.success("Skill approval revoked.");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleResubmit(submissionId: string) {
    const auth = getAuth();
    if (!auth) return;

    setResubmittingId(submissionId);
    try {
      await resubmitSkill(auth.orgId, submissionId, auth.accessToken);
      toast.success("Skill resubmitted for review.");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resubmit failed");
    } finally {
      setResubmittingId(null);
    }
  }

  function renderScanResults(submission: SkillSubmission) {
    const scan = submission.scanResults;
    if (!scan) return <p className="text-sm text-base-content/40">No scan results available.</p>;

    return (
      <div className="space-y-3">
        <div className="stats stats-horizontal shadow-sm border border-base-300/50 w-full">
          <div className="stat py-2 px-4">
            <div className="stat-title text-xs">Files</div>
            <div className="stat-value text-lg">{scan.scannedFiles}</div>
          </div>
          <div className="stat py-2 px-4">
            <div className="stat-title text-xs">Critical</div>
            <div className="stat-value text-lg text-error">{scan.critical}</div>
          </div>
          <div className="stat py-2 px-4">
            <div className="stat-title text-xs">Warnings</div>
            <div className="stat-value text-lg text-warning">{scan.warn}</div>
          </div>
          <div className="stat py-2 px-4">
            <div className="stat-title text-xs">Info</div>
            <div className="stat-value text-lg text-info">{scan.info}</div>
          </div>
        </div>
        {scan.findings.length > 0 && (
          <div className="space-y-2">
            {scan.findings.map((f, i) => (
              <div key={i} className="text-xs rounded-lg border border-base-300/50 p-3 bg-base-200/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={f.severity === "critical" ? "danger" : f.severity === "warn" ? "warning" : "info"} size="xs">
                    {f.severity}
                  </Badge>
                  <span className="font-medium">{f.ruleId}</span>
                  <span className="text-base-content/40">{f.file}:{f.line}</span>
                </div>
                <p>{f.message}</p>
                <pre className="mt-1 text-base-content/40 overflow-x-auto font-mono">{f.evidence}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const tabs = [
    { key: "pending", label: "Pending", count: pending.length },
    { key: "approved", label: "Approved", count: approved.length },
    { key: "history", label: "History", count: history.length },
  ] as const;

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Skill Review</h2>
          <p className="text-sm text-base-content/50 mt-1">Review, approve, and manage skill submissions</p>
        </div>

        {/* Tabs */}
        <div className="tabs tabs-boxed bg-base-100 p-1 mb-6 w-fit border border-base-300/50">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab tab-sm gap-2 ${tab === t.key ? "tab-active" : ""}`}
            >
              {t.label}
              <span className="badge badge-sm badge-ghost">{t.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : tab === "pending" ? (
          pending.length === 0 ? (
            <div className="text-center py-16 text-base-content/40">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              <p className="text-sm">No pending skill submissions</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {pending.map((submission) => (
                  <motion.div
                    key={submission.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <Card>
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                          <h3 className="font-semibold text-base">{submission.skillName}</h3>
                          {submission.skillKey && (
                            <p className="text-xs text-base-content/40 font-mono mt-0.5">{submission.skillKey}</p>
                          )}
                          <p className="text-xs text-base-content/40 mt-1">
                            Submitted {new Date(submission.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
                            className="btn btn-ghost btn-xs"
                          >
                            {expandedId === submission.id ? "Hide" : "Details"}
                          </button>
                          <button
                            onClick={() => handleReview(submission.id, "approved-org")}
                            disabled={reviewingId === submission.id}
                            className="btn btn-success btn-xs"
                          >
                            {reviewingId === submission.id && <span className="loading loading-spinner loading-xs" />}
                            Approve (Org)
                          </button>
                          <button
                            onClick={() => handleReview(submission.id, "approved-self")}
                            disabled={reviewingId === submission.id}
                            className="btn btn-info btn-xs"
                          >
                            Approve (Self)
                          </button>
                          <button
                            onClick={() => handleReview(submission.id, "rejected")}
                            disabled={reviewingId === submission.id}
                            className="btn btn-error btn-xs"
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedId === submission.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-base-300/50 space-y-4">
                              {submission.manifestContent && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">SKILL.md</h4>
                                  <pre className="text-xs bg-base-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                                    {submission.manifestContent}
                                  </pre>
                                </div>
                              )}
                              <div>
                                <h4 className="text-sm font-medium mb-2">Security Scan</h4>
                                {renderScanResults(submission)}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )
        ) : tab === "approved" ? (
          approved.length === 0 ? (
            <div className="text-center py-16 text-base-content/40">
              <p className="text-sm">No approved skills</p>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto -mx-5">
                <table className="table table-sm">
                  <thead>
                    <tr className="text-base-content/40 text-xs uppercase">
                      <th>Skill Name</th>
                      <th>Key</th>
                      <th>Scope</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map((skill) => (
                      <tr key={skill.id} className="table-row-hover">
                        <td className="font-medium">{skill.skillName}</td>
                        <td className="font-mono text-xs text-base-content/50">{skill.skillKey}</td>
                        <td>
                          <Badge variant={skill.scope === "org" ? "success" : "info"}>
                            {skill.scope}
                          </Badge>
                        </td>
                        <td className="text-base-content/50">v{skill.version}</td>
                        <td><Badge variant="success">Active</Badge></td>
                        <td>
                          <button
                            onClick={() => handleRevoke(skill.id)}
                            disabled={revokingId === skill.id}
                            className="btn btn-error btn-outline btn-xs"
                          >
                            {revokingId === skill.id && <span className="loading loading-spinner loading-xs" />}
                            {revokingId === skill.id ? "Revoking..." : "Revoke"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        ) : (
          /* History tab */
          history.length === 0 ? (
            <div className="text-center py-16 text-base-content/40">
              <p className="text-sm">No skill approval history</p>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto -mx-5">
                <table className="table table-sm">
                  <thead>
                    <tr className="text-base-content/40 text-xs uppercase">
                      <th>Skill Name</th>
                      <th>Key</th>
                      <th>Scope</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Approved</th>
                      <th>Revoked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((skill) => (
                      <tr key={skill.id} className="table-row-hover">
                        <td className="font-medium">{skill.skillName}</td>
                        <td className="font-mono text-xs text-base-content/50">{skill.skillKey}</td>
                        <td>
                          <Badge variant={skill.scope === "org" ? "success" : "info"}>
                            {skill.scope}
                          </Badge>
                        </td>
                        <td className="text-base-content/50">v{skill.version}</td>
                        <td>
                          {skill.revokedAt ? (
                            <Badge variant="danger">Revoked</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        <td className="text-xs text-base-content/50">
                          {new Date(skill.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-xs text-base-content/50">
                          {skill.revokedAt ? new Date(skill.revokedAt).toLocaleDateString() : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        )}
      </main>
    </div>
  );
}
