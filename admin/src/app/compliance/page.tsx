"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { generateAttestation, verifyAttestation, type AgtAttestation } from "@/lib/api";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

export default function ComplianceAttestationPage() {
  const router = useRouter();
  const toast = useToast();
  const [fromIso, setFromIso] = useState(isoDaysAgo(30));
  const [toIso, setToIso] = useState(nowIso());
  const [agentDid, setAgentDid] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ attestation: AgtAttestation; token: string } | undefined>();

  const [pasteToken, setPasteToken] = useState("");
  const [verifyResult, setVerifyResult] = useState<
    | undefined
    | {
        signatureValid: boolean;
        orgMatch?: boolean;
        attestation?: AgtAttestation;
        error?: string;
      }
  >();
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) router.replace("/login");
  }, [router]);

  async function handleGenerate() {
    const auth = getAuth();
    if (!auth) return;
    setGenerating(true);
    setResult(undefined);
    try {
      const res = await generateAttestation(auth.accessToken, {
        fromIso,
        toIso,
        agentDid: agentDid.trim() || undefined,
      });
      setResult(res);
      toast.success(`Attestation generated (${res.attestation.entriesCovered} entries)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate attestation");
    } finally {
      setGenerating(false);
    }
  }

  async function handleVerify() {
    const auth = getAuth();
    if (!auth) return;
    if (!pasteToken.trim()) return;
    setVerifying(true);
    setVerifyResult(undefined);
    try {
      const res = await verifyAttestation(auth.accessToken, pasteToken.trim());
      setVerifyResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to verify attestation");
    } finally {
      setVerifying(false);
    }
  }

  function downloadAttestation() {
    if (!result) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            attestation: result.attestation,
            token: result.token,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clawforge-attestation-${result.attestation.rangeFrom.slice(0, 10)}-to-${result.attestation.rangeTo.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Compliance Attestation</h2>
          <p className="text-sm text-base-content/50 mt-1">
            Generate a signed proof of audit-chain integrity for an auditor. The token is a JWT signed with this control
            plane's secret; any third party can verify it by posting it back to{" "}
            <code className="px-1 py-0.5 bg-base-300 rounded text-xs">/api/v1/attestations/verify</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* --- Generate column --- */}
          <Card>
            <CardTitle>Generate</CardTitle>
            <div className="form-control mb-3">
              <label className="label py-1">
                <span className="label-text text-xs">From (ISO)</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm font-mono text-xs"
                value={fromIso}
                onChange={(e) => setFromIso(e.target.value)}
              />
            </div>
            <div className="form-control mb-3">
              <label className="label py-1">
                <span className="label-text text-xs">To (ISO)</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm font-mono text-xs"
                value={toIso}
                onChange={(e) => setToIso(e.target.value)}
              />
            </div>
            <div className="form-control mb-3">
              <label className="label py-1">
                <span className="label-text text-xs">Agent DID (optional)</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm font-mono text-xs"
                placeholder="did:mesh:…"
                value={agentDid}
                onChange={(e) => setAgentDid(e.target.value)}
              />
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn btn-primary btn-sm gap-2 mt-2">
              {generating && <span className="loading loading-spinner loading-xs" />}
              {generating ? "Generating…" : "Generate attestation"}
            </button>

            {result && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`badge ${result.attestation.valid ? "badge-success" : "badge-error"}`}>
                    {result.attestation.valid ? "Chain valid" : `Break: ${result.attestation.breakKind ?? "unknown"}`}
                  </span>
                  <button onClick={downloadAttestation} className="btn btn-xs btn-ghost">
                    Download JSON
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-base-content/50 uppercase">Entries</div>
                    <div className="font-bold">{result.attestation.entriesCovered}</div>
                  </div>
                  <div>
                    <div className="text-xs text-base-content/50 uppercase">Agents</div>
                    <div className="font-bold">{result.attestation.agentsCovered}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-base-content/50 uppercase">Root hash</div>
                    <div className="font-mono text-xs break-all">{result.attestation.rootHash}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-base-content/50 uppercase mb-1">Signed token</div>
                  <textarea
                    readOnly
                    rows={4}
                    className="textarea textarea-bordered w-full text-xs font-mono"
                    value={result.token}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* --- Verify column --- */}
          <Card>
            <CardTitle>Verify</CardTitle>
            <p className="text-xs text-base-content/50 mb-3">
              Paste a previously-issued attestation token to confirm its signature and that the orgId matches.
            </p>
            <textarea
              rows={6}
              className="textarea textarea-bordered w-full text-xs font-mono"
              placeholder="eyJhbGciOi…"
              value={pasteToken}
              onChange={(e) => setPasteToken(e.target.value)}
            />
            <button
              onClick={handleVerify}
              disabled={verifying || pasteToken.trim().length === 0}
              className="btn btn-primary btn-sm gap-2 mt-2"
            >
              {verifying && <span className="loading loading-spinner loading-xs" />}
              {verifying ? "Verifying…" : "Verify"}
            </button>

            {verifyResult && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`badge ${verifyResult.signatureValid ? "badge-success" : "badge-error"}`}>
                    {verifyResult.signatureValid ? "Signature valid" : "Signature invalid"}
                  </span>
                  {verifyResult.signatureValid && (
                    <span className={`badge ${verifyResult.orgMatch ? "badge-success" : "badge-warning"}`}>
                      {verifyResult.orgMatch ? "Org match" : "Org mismatch"}
                    </span>
                  )}
                </div>
                {verifyResult.error && <p className="text-xs text-error">{verifyResult.error}</p>}
                {verifyResult.attestation && (
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                    <div>
                      <div className="text-xs text-base-content/50 uppercase">Range</div>
                      <div className="font-mono text-xs">
                        {new Date(verifyResult.attestation.rangeFrom).toLocaleDateString()} →{" "}
                        {new Date(verifyResult.attestation.rangeTo).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-base-content/50 uppercase">Issued</div>
                      <div className="font-mono text-xs">
                        {new Date(verifyResult.attestation.issuedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-base-content/50 uppercase">Root hash</div>
                      <div className="font-mono text-xs break-all">{verifyResult.attestation.rootHash}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
