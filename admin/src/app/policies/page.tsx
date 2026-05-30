"use client";

/**
 * AGT-canonical policy authoring (Cut 1 step 9 — addendum §A18 Tier 1).
 *
 * Lists AGT policies for the current org, surfaces the YAML for editing,
 * supports a "Test" dry-run via /api/v1/policies/evaluate, and creates
 * new policies via /api/v1/policies/agt.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
      <span className={`badge ${cls}`}>
        {evalResult.allowed ? "allowed" : "denied"} · {evalResult.action}
      </span>
    );
  }, [evalResult]);

  if (!auth) return <main className="p-8">Loading…</main>;

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">AGT Policies</h1>
        <p className="text-base-content/70">
          Author AGT-canonical YAML, test it with a dry-run, and see what an agent receives via{" "}
          <code className="text-xs">GET /api/v1/policies/effective</code>.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <h2 className="card-title">Author</h2>
            <label className="form-control">
              <span className="label-text">Policy name</span>
              <input
                className="input input-bordered w-full"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
              />
            </label>
            <label className="form-control mt-3">
              <span className="label-text">YAML source</span>
              <textarea
                className="textarea textarea-bordered font-mono text-xs"
                rows={20}
                value={yamlSource}
                onChange={(e) => setYamlSource(e.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="card-actions justify-end mt-3">
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save AGT policy"}
              </button>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <h2 className="card-title">Test (dry-run)</h2>
            <p className="text-sm text-base-content/70">
              Evaluates the YAML above against the action/DID below via the AGT engine.
            </p>
            <label className="form-control mt-2">
              <span className="label-text">Agent DID</span>
              <input
                className="input input-bordered w-full"
                value={evalDid}
                onChange={(e) => setEvalDid(e.target.value)}
              />
            </label>
            <label className="form-control mt-2">
              <span className="label-text">Action / tool name</span>
              <input
                className="input input-bordered w-full"
                value={evalAction}
                onChange={(e) => setEvalAction(e.target.value)}
              />
            </label>
            <div className="card-actions justify-end mt-3">
              <button className="btn btn-secondary" onClick={handleEvaluate}>
                Evaluate
              </button>
            </div>
            {evalError && <div className="alert alert-error mt-3 text-sm">{evalError}</div>}
            {evalResult && (
              <div className="mt-3 space-y-2">
                <div>{decisionBadge}</div>
                {evalResult.matchedRule && (
                  <div className="text-xs text-base-content/70">
                    matched rule: <code>{evalResult.matchedRule}</code>
                  </div>
                )}
                {evalResult.reason && <div className="text-xs">reason: {evalResult.reason}</div>}
                <pre className="text-xs bg-base-200 p-2 rounded overflow-auto">
                  {JSON.stringify(evalResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Effective YAML for an agent</h2>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="form-control flex-1 min-w-[20rem]">
              <span className="label-text">Agent DID</span>
              <input
                className="input input-bordered w-full"
                value={effectiveDid}
                onChange={(e) => setEffectiveDid(e.target.value)}
              />
            </label>
            <button className="btn" onClick={handleFetchEffective}>
              Fetch
            </button>
          </div>
          {effectiveError && <div className="alert alert-error mt-3 text-sm">{effectiveError}</div>}
          {effectiveYaml !== null && (
            <pre className="text-xs bg-base-200 p-3 rounded mt-3 overflow-auto whitespace-pre-wrap">
              {effectiveYaml}
            </pre>
          )}
        </div>
      </section>

      <section className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Saved AGT policies</h2>
          {loading ? (
            <div>Loading…</div>
          ) : policies.length === 0 ? (
            <div className="text-base-content/60">No AGT policies yet — save one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra">
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
                        <code>{p.name}</code>
                      </td>
                      <td>{p.version}</td>
                      <td>{p.schemaVersion ?? "—"}</td>
                      <td>{new Date(p.createdAt).toLocaleString()}</td>
                      <td>{new Date(p.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
