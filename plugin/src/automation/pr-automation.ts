import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { ClawForgePluginConfig } from "../types.js";

const GITHUB_API = "https://api.github.com";

export type PullRequestSummary = {
  number: number;
  title: string;
  url: string;
  author: string;
  labels: string[];
  draft: boolean;
  mergeable: boolean | null;
  mergeableState?: string;
  reviewDecision?: string | null;
  approvals: number;
  changeRequests: number;
  checksPassed: boolean;
  totalChangedFiles?: number;
  additions?: number;
  deletions?: number;
  updatedAt?: string;
};

export type EligibleDecision = {
  eligible: boolean;
  reasons: string[];
};

export type RankedPullRequest = PullRequestSummary & {
  score: number;
  decision: EligibleDecision;
};

export type AutomationRunResult = {
  mode: "dry-run" | "merge";
  repository: string;
  candidates: RankedPullRequest[];
  merged?: RankedPullRequest;
  skippedReasons: string[];
};

function parseRepo(fullRepo: string): { owner: string; repo: string } {
  const [owner, repo] = fullRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository "${fullRepo}". Expected owner/repo.`);
  }
  return { owner, repo };
}

function normalizeLabels(labels: string[]): string[] {
  return labels.map((label) => label.toLowerCase());
}

function hasBlockingLabel(labels: string[]): boolean {
  const normalized = normalizeLabels(labels);
  return normalized.some((label) => ["wip", "blocked", "do-not-merge"].includes(label));
}

function labelScore(labels: string[]): number {
  const normalized = normalizeLabels(labels);
  if (normalized.includes("hotfix")) return 100;
  if (normalized.includes("security")) return 90;
  if (normalized.includes("bug")) return 80;
  if (normalized.includes("improvement")) return 50;
  if (normalized.includes("feature")) return 30;
  return 10;
}

export function evaluateEligibility(
  pr: PullRequestSummary,
  options: {
    minApprovals: number;
    trustedAuthorsOnly: boolean;
    trustedAuthors: string[];
  },
): EligibleDecision {
  const reasons: string[] = [];

  if (pr.draft) reasons.push("draft");
  if (pr.mergeable === false) reasons.push("merge_conflict");
  if (!pr.checksPassed) reasons.push("checks_not_green");
  if (pr.changeRequests > 0) reasons.push("change_requested");
  if (pr.approvals < options.minApprovals) reasons.push("missing_approval");
  if (hasBlockingLabel(pr.labels)) reasons.push("blocking_label");
  if (options.trustedAuthorsOnly) {
    const trusted = options.trustedAuthors.map((v) => v.toLowerCase());
    if (!trusted.includes(pr.author.toLowerCase())) reasons.push("untrusted_author");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export function scorePullRequest(pr: PullRequestSummary): number {
  let score = labelScore(pr.labels);
  if (pr.approvals > 0) score += 20;
  if ((pr.totalChangedFiles ?? Number.POSITIVE_INFINITY) <= 8) score += 10;
  if ((pr.additions ?? 0) + (pr.deletions ?? 0) <= 300) score += 10;
  return score;
}

type GitHubRestClient = {
  getJson<T>(path: string): Promise<T>;
  putJson<T>(path: string, body: unknown): Promise<T>;
};

function createGitHubClient(token: string): GitHubRestClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "clawforge-pr-automation",
  };

  return {
    async getJson<T>(path: string): Promise<T> {
      const res = await fetch(`${GITHUB_API}${path}`, { headers });
      if (!res.ok) {
        throw new Error(`GitHub GET ${path} failed (${res.status}): ${await res.text()}`);
      }
      return (await res.json()) as T;
    },
    async putJson<T>(path: string, body: unknown): Promise<T> {
      const res = await fetch(`${GITHUB_API}${path}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`GitHub PUT ${path} failed (${res.status}): ${await res.text()}`);
      }
      return (await res.json()) as T;
    },
  };
}

type RestLabel = { name?: string };
type RestUser = { login: string };
type RestPull = {
  number: number;
  title: string;
  html_url: string;
  user: RestUser;
  labels: RestLabel[];
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state?: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  updated_at?: string;
};
type RestReview = { state: string; user?: RestUser };
type RestCombinedStatus = { state: string };
type RestCheckRuns = { total_count: number; check_runs: Array<{ conclusion: string | null; status: string }> };

type MergeResponse = { sha?: string; merged?: boolean; message?: string };

async function fetchChecksPassed(client: GitHubRestClient, owner: string, repo: string, prNumber: number): Promise<boolean> {
  const combined = await client.getJson<RestCombinedStatus>(`/repos/${owner}/${repo}/commits/pulls/${prNumber}/status`);
  const checkRuns = await client.getJson<RestCheckRuns>(`/repos/${owner}/${repo}/commits/pulls/${prNumber}/check-runs`);

  const combinedOk = combined.state === "success";
  const checksOk =
    checkRuns.total_count === 0 ||
    checkRuns.check_runs.every((run) => run.status === "completed" && run.conclusion === "success");

  return combinedOk && checksOk;
}

async function fetchPullRequests(client: GitHubRestClient, repoFull: string): Promise<PullRequestSummary[]> {
  const { owner, repo } = parseRepo(repoFull);
  const pulls = await client.getJson<RestPull[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`);

  const results = await Promise.all(
    pulls.map(async (pull) => {
      const reviews = await client.getJson<RestReview[]>(`/repos/${owner}/${repo}/pulls/${pull.number}/reviews?per_page=100`);
      const approvals = reviews.filter((review) => review.state === "APPROVED").length;
      const changeRequests = reviews.filter((review) => review.state === "CHANGES_REQUESTED").length;
      const checksPassed = await fetchChecksPassed(client, owner, repo, pull.number);

      return {
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        author: pull.user.login,
        labels: pull.labels.map((label) => label.name).filter((v): v is string => Boolean(v)),
        draft: pull.draft,
        mergeable: pull.mergeable,
        mergeableState: pull.mergeable_state,
        approvals,
        changeRequests,
        checksPassed,
        totalChangedFiles: pull.changed_files,
        additions: pull.additions,
        deletions: pull.deletions,
        updatedAt: pull.updated_at,
      } satisfies PullRequestSummary;
    }),
  );

  return results;
}

function buildSlackMessage(result: AutomationRunResult): string {
  if (result.merged) {
    return [
      `Merged PR #${result.merged.number} — ${result.merged.title}`,
      `Author: @${result.merged.author}`,
      `Reason: score ${result.merged.score}, labels: ${result.merged.labels.join(", ") || "none"}`,
      `Mode: ${result.mode}`,
      `URL: ${result.merged.url}`,
    ].join("\n");
  }

  const top = result.candidates[0];
  return [
    `PR automation run (${result.mode}) for ${result.repository}`,
    top
      ? `Top candidate: #${top.number} — ${top.title} [eligible=${top.decision.eligible ? "yes" : `no: ${top.decision.reasons.join(", ")}`}]`
      : "No open pull requests found.",
    result.skippedReasons.length > 0 ? `Notes: ${result.skippedReasons.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runPullRequestAutomation(
  api: OpenClawPluginApi,
  pluginConfig: ClawForgePluginConfig,
  opts?: { forceMode?: "dry-run" | "merge" },
): Promise<AutomationRunResult> {
  const automation = pluginConfig.prAutomation;
  if (!automation?.enabled) {
    throw new Error("PR automation is disabled. Set plugins.entries.clawforge.config.prAutomation.enabled=true");
  }

  const repo = automation.repo ?? "ClawForgeAI/clawforge";
  const token = automation.githubToken ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GitHub token. Set prAutomation.githubToken or GITHUB_TOKEN.");

  const mode = opts?.forceMode ?? (automation.dryRun === false ? "merge" : "dry-run");
  const trustedAuthors = automation.trustedAuthors ?? [];
  const minApprovals = automation.minApprovals ?? 1;
  const trustedAuthorsOnly = automation.trustedAuthorsOnly !== false;
  const mergeMethod = automation.mergeMethod ?? "squash";

  const client = createGitHubClient(token);
  const prs = await fetchPullRequests(client, repo);
  const ranked: RankedPullRequest[] = prs
    .map((pr) => ({
      ...pr,
      score: scorePullRequest(pr),
      decision: evaluateEligibility(pr, { minApprovals, trustedAuthorsOnly, trustedAuthors }),
    }))
    .sort((a, b) => b.score - a.score || a.number - b.number);

  const eligible = ranked.filter((pr) => pr.decision.eligible);
  const result: AutomationRunResult = {
    mode,
    repository: repo,
    candidates: ranked,
    skippedReasons: ranked.filter((pr) => !pr.decision.eligible).slice(0, 5).map(
      (pr) => `#${pr.number}:${pr.decision.reasons.join(",")}`,
    ),
  };

  if (eligible.length === 0) {
    await maybeNotifySlack(api, automation.slackTarget, buildSlackMessage(result));
    return result;
  }

  const chosen = eligible[0]!;
  if (mode === "merge") {
    const { owner, repo: repoName } = parseRepo(repo);
    const mergeRes = await client.putJson<MergeResponse>(`/repos/${owner}/${repoName}/pulls/${chosen.number}/merge`, {
      merge_method: mergeMethod,
    });
    if (!mergeRes.merged) {
      throw new Error(`GitHub refused merge for #${chosen.number}: ${mergeRes.message ?? "unknown error"}`);
    }
  }

  result.merged = chosen;
  await maybeNotifySlack(api, automation.slackTarget, buildSlackMessage(result));
  return result;
}

async function maybeNotifySlack(api: OpenClawPluginApi, target: string | undefined, message: string): Promise<void> {
  if (!target) return;
  await api.runtime.channel.slack.sendMessageSlack(target, message, {
    identity: {
      username: "Peach",
      iconEmoji: ":peach:",
    },
  });
}

export function createPullRequestAutomationScheduler(api: OpenClawPluginApi, pluginConfig: ClawForgePluginConfig): () => void {
  const automation = pluginConfig.prAutomation;
  if (!automation?.enabled) {
    return () => {};
  }

  const intervalMs = automation.intervalMs ?? 60 * 60 * 1000;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runPullRequestAutomation(api, pluginConfig);
      api.logger.info(`PR automation completed (${result.mode}) for ${result.repository}`);
    } catch (err) {
      api.logger.error(`PR automation failed: ${String(err)}`);
      if (automation.slackTarget) {
        try {
          await maybeNotifySlack(api, automation.slackTarget, `PR automation failed: ${String(err)}`);
        } catch {
          // ignore secondary Slack failure
        }
      }
    } finally {
      running = false;
    }
  };

  const timeout = setTimeout(() => {
    run().catch(() => {});
  }, Math.min(30_000, intervalMs));
  const timer = setInterval(() => {
    run().catch(() => {});
  }, intervalMs);

  return () => {
    clearTimeout(timeout);
    clearInterval(timer);
  };
}
