import { describe, expect, it } from "vitest";
import { evaluateEligibility, scorePullRequest, type PullRequestSummary } from "./pr-automation.js";

function makePr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    number: 42,
    title: "Improve webhook handling",
    url: "https://github.com/ClawForgeAI/clawforge/pull/42",
    author: "trusted-dev",
    labels: ["improvement"],
    draft: false,
    mergeable: true,
    approvals: 1,
    changeRequests: 0,
    checksPassed: true,
    totalChangedFiles: 4,
    additions: 120,
    deletions: 20,
    ...overrides,
  };
}

describe("pr-automation", () => {
  it("marks a clean approved PR as eligible", () => {
    const pr = makePr();
    const decision = evaluateEligibility(pr, {
      minApprovals: 1,
      trustedAuthorsOnly: true,
      trustedAuthors: ["trusted-dev"],
    });

    expect(decision).toEqual({ eligible: true, reasons: [] });
  });

  it("blocks PRs with failing checks and blocking labels", () => {
    const pr = makePr({ checksPassed: false, labels: ["bug", "do-not-merge"] });
    const decision = evaluateEligibility(pr, {
      minApprovals: 1,
      trustedAuthorsOnly: false,
      trustedAuthors: [],
    });

    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("checks_not_green");
    expect(decision.reasons).toContain("blocking_label");
  });

  it("prefers hotfixes over improvements", () => {
    const hotfix = scorePullRequest(makePr({ labels: ["hotfix"] }));
    const improvement = scorePullRequest(makePr({ labels: ["improvement"] }));
    expect(hotfix).toBeGreaterThan(improvement);
  });

  it("blocks untrusted authors when trustedAuthorsOnly is enabled", () => {
    const pr = makePr({ author: "random-contributor" });
    const decision = evaluateEligibility(pr, {
      minApprovals: 1,
      trustedAuthorsOnly: true,
      trustedAuthors: ["trusted-dev"],
    });

    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("untrusted_author");
  });
});
