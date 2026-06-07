"use client";

/**
 * AGT-canonical policy authoring (Cut 1 step 9 — addendum §A18 Tier 1).
 *
 * Lists AGT policies for the current org, surfaces the YAML for editing,
 * supports a "Test" dry-run via /api/v1/policies/evaluate, and creates
 * new policies via POST /api/v1/policies.
 *
 * Cut 2b §A21 step 2.16 layout pass — wrapped in the shared Sidebar /
 * Card shell so this page matches the rest of the admin UI.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import {
  createAgtPolicy,
  evaluateAgtPolicy,
  getEffectiveAgtYaml,
  listAgtPolicies,
  type AgtEvaluateResult,
  type AgtPolicySummary,
} from "@/lib/agt-api";

const SAMPLE_YAML = `version: "1.0"
name: my-first-agt-policy
description: AGT canonical policy authored from the admin console
rules:
  - name: deny_shell
    condition:
      field: tool_name
      operator: eq
      value: shell_exec
    action: deny
    priority: 100
    message: shell access is denied for production agents
defaults:
  action: allow
  max_tokens: 4096
  max_tool_calls: 10
  confidence_threshold: 0.8
`;

export default function AgtPoliciesPage() {
  const router = useRouter();
  const [auth, setAuthState] = useState<ReturnType<typeof getAuth>>(null);
  const [policies, setPolicies] = useState<AgtPolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [yamlSource, setYamlSource] = useState(SAMPLE_YAML);
  const [policyName, setPolicyName] = useState("my-first-agt-policy");
  const [saving, setSaving] = useState(false);

  const [evalAction, setEvalAction] = useState("shell_exec");
  const [evalDid, setEvalDid] = useState("did:mesh:test-agent");
  const [evalResult, setEvalResult] = useState<AgtEvaluateResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  const [effectiveYaml, setEffectiveYaml] = useState<string | null>(null);
  const [effectiveDid, setEffectiveDid] = useState("did:mesh:test-agent");
  const [effectiveError, setEffectiveError] = useState<string | null>(null);

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login");
      return;
    }
    setAuthState(a);
  }, [router]);

  const refresh = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAgtPolicies(auth.accessToken);
      setPolicies(res.policies);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!auth) return;
    setSaving(true);
    setError(null);
    try {
      await createAgtPolicy(auth.accessToken, { name: policyName, yamlSource });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEvaluate = async () => {
    if (!auth) return;
    setEvalError(null);
    setEvalResult(null);
    try {
      const result = await evaluateAgtPolicy(auth.accessToken, {
        agentDid: evalDid,
        action: evalAction,
        policyYaml: yamlSource,
      });
      setEvalResult(result);
    } catch (err) {
      setEvalError((err as Error).message);
    }
  };

  const handleFetchEffective = async () => {
    if (!auth) return;
    setEffectiveError(null);
    setEffectiveYaml(null);
    try {
      const yaml = await getEffectiveAgtYaml(auth.accessToken, effectiveDid);
      setEffectiveYaml(yaml);
    } catch (err) {
      setEffectiveError((err as Error).message);
    }
  };

  const decisionBadge = useMemo(() => {
    if (!evalResult) return null;
    const cls = evalResult.allowed ? "badge-success" : "badge-error";
    return (
      <span className={`badge ${cls} badge-sm`}>
        {evalResult.allowed ? "allowed" : "denied"} · {evalResult.action}
      </span>
    );
  }, [evalResult]);

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Policies</h2>
          <p className="text-sm text-base-content/50 mt-1">
            Author AGT-canonical YAML, dry-run it against a sample agent, and inspect what an enrolled agent receives.
          </p>
        </div>

        {error && (
          <div className="alert alert-error mb-4 text-sm">
            <span>{error}</span>
          </div>
        )}

        {!auth ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* --- Author column --- */}
              <Card>
                <CardTitle>Author</CardTitle>
                <div className="form-control mb-3">
                  <label className="label py-1">
                    <span className="label-text text-xs">Policy name</span>
                  </label>
                  <input
                    className="input input-bordered input-sm"
                    value={policyName}
                    onChange={(e) => setPolicyName(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">YAML source</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered font-mono text-xs"
                    rows={18}
                    value={yamlSource}
                    onChange={(e) => setYamlSource(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button className="btn btn-primary btn-sm gap-2" disabled={saving} onClick={handleSave}>
                    {saving && <span className="loading loading-spinner loading-xs" />}
                    {saving ? "Saving…" : "Save AGT policy"}
                  </button>
                </div>
              </Card>

              {/* --- Dry-run column --- */}
              <Card>
                <CardTitle>Test (dry-run)</CardTitle>
                <p className="text-xs text-base-content/50 mb-3">
                  Evaluates the YAML above against the action / DID below via the AGT engine.
                </p>
                <div className="form-control mb-3">
                  <label className="label py-1">
                    <span className="label-text text-xs">Agent DID</span>
                  </label>
                  <input
                    className="input input-bordered input-sm font-mono text-xs"
                    value={evalDid}
                    onChange={(e) => setEvalDid(e.target.value)}
                  />
                </div>
                <div className="form-control mb-3">
                  <label className="label py-1">
                    <span className="label-text text-xs">Action / tool name</span>
                  </label>
                  <input
                    className="input input-bordered input-sm"
                    value={evalAction}
                    onChange={(e) => setEvalAction(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <button className="btn btn-secondary btn-sm" onClick={handleEvaluate}>
                    Evaluate
                  </button>
                </div>

                {evalError && (
                  <div className="alert alert-error mt-3 text-xs py-2">
                    <span>{evalError}</span>
                  </div>
                )}
                {evalResult && (
                  <div className="mt-3 space-y-2">
                    <div>{decisionBadge}</div>
                    {evalResult.matchedRule && (
                      <div className="text-xs text-base-content/60">
                        matched rule: <code className="font-mono">{evalResult.matchedRule}</code>
                      </div>
                    )}
                    {evalResult.reason && <div className="text-xs">reason: {evalResult.reason}</div>}
                    <pre className="text-xs bg-base-200 p-2 rounded overflow-auto max-h-48">
                      {JSON.stringify(evalResult, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>
            </div>

            {/* --- Effective policy lookup --- */}
            <Card>
              <CardTitle>Effective YAML for an agent</CardTitle>
              <p className="text-xs text-base-content/50 mb-3">
                Returns what <code className="font-mono">GET /api/v1/policies/effective</code> serves the supplied DID —
                i.e. the policy that agent is currently bound to.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="form-control flex-1 min-w-[20rem]">
                  <label className="label py-1">
                    <span className="label-text text-xs">Agent DID</span>
                  </label>
                  <input
                    className="input input-bordered input-sm font-mono text-xs"
                    value={effectiveDid}
                    onChange={(e) => setEffectiveDid(e.target.value)}
                  />
                </div>
                <button className="btn btn-sm" onClick={handleFetchEffective}>
                  Fetch
                </button>
              </div>
              {effectiveError && (
                <div className="alert alert-error mt-3 text-xs py-2">
                  <span>{effectiveError}</span>
                </div>
              )}
              {effectiveYaml !== null && (
                <pre className="text-xs bg-base-200 p-3 rounded mt-3 overflow-auto whitespace-pre-wrap max-h-72">
                  {effectiveYaml}
                </pre>
              )}
            </Card>

            {/* --- Saved policies table --- */}
            <Card>
              <CardTitle>Saved AGT policies</CardTitle>
              {loading ? (
                <p className="text-sm text-base-content/40">Loading…</p>
              ) : policies.length === 0 ? (
                <p className="text-sm text-base-content/40">No AGT policies yet — save one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-zebra text-sm">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Version</th>
                        <th>Spec</th>
                        <th>Created</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <code className="font-mono text-xs">{p.name}</code>
                          </td>
                          <td>{p.version}</td>
                          <td>{p.schemaVersion ?? "—"}</td>
                          <td className="text-xs whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</td>
                          <td className="text-xs whitespace-nowrap">{new Date(p.updatedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
