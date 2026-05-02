/**
 * /clawforge-submit command.
 *
 * Workflow:
 * 1. Resolve the skill directory from the argument (skill name)
 * 2. Read SKILL.md content and parse frontmatter / metadata
 * 3. Run local security scan via scanDirectoryWithSummary
 * 4. Submit to POST /api/v1/skills/:orgId/submit with bundle + scan results
 */

import fs from "node:fs";
import path from "node:path";
import type { ClawForgePluginConfig, SessionTokens } from "../types.js";

export type SkillSubmissionBundle = {
  skillName: string;
  skillKey?: string;
  metadata: Record<string, unknown>;
  manifestContent: string;
  scanResults: {
    scannedFiles: number;
    critical: number;
    warn: number;
    info: number;
    findings: Array<{
      ruleId: string;
      severity: string;
      file: string;
      line: number;
      message: string;
      evidence: string;
    }>;
  };
};

/**
 * Resolve where a skill lives on disk.
 * Checks common locations: ./skills/<name>, user extra dirs, etc.
 */
function resolveSkillDir(skillName: string, workspaceDir?: string): string | null {
  const candidates = [
    // Bundled skills
    path.join(process.cwd(), "skills", skillName),
    // Workspace-relative
    ...(workspaceDir ? [path.join(workspaceDir, "skills", skillName)] : []),
  ];

  for (const candidate of candidates) {
    const skillMd = path.join(candidate, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      return candidate;
    }
  }

  // Maybe the argument is an absolute or relative path directly
  if (fs.existsSync(path.join(skillName, "SKILL.md"))) {
    return path.resolve(skillName);
  }

  return null;
}

/**
 * Read SKILL.md and extract basic frontmatter.
 */
function readSkillManifest(skillDir: string): {
  content: string;
  frontmatter: Record<string, unknown>;
  name: string;
} {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const content = fs.readFileSync(skillMdPath, "utf-8");

  // Simple frontmatter extraction (YAML between --- delimiters)
  const frontmatter: Record<string, unknown> = {};
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const lines = fmMatch[1].split("\n");
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        frontmatter[key] = value;
      }
    }
  }

  // Derive skill name from the directory name
  const name = path.basename(skillDir);

  return { content, frontmatter, name };
}

/**
 * Bundle a skill for submission: read manifest, scan for security issues.
 */
export async function bundleSkillForSubmission(
  skillNameOrPath: string,
  workspaceDir?: string,
): Promise<SkillSubmissionBundle> {
  const skillDir = resolveSkillDir(skillNameOrPath, workspaceDir);
  if (!skillDir) {
    throw new Error(
      `Skill "${skillNameOrPath}" not found. Provide a skill name (from skills/) or a path to a skill directory containing SKILL.md.`,
    );
  }

  const manifest = readSkillManifest(skillDir);

  // Run security scan
  const { scanDirectoryWithSummary } = await import("../security/skill-scanner.js");
  const scanResults = await scanDirectoryWithSummary(skillDir);

  // Extract metadata from frontmatter
  const metadata: Record<string, unknown> = {
    ...manifest.frontmatter,
    skillDir,
  };

  // Pull skillKey from openclaw metadata block if present
  const openclawBlock = manifest.frontmatter.openclaw as Record<string, unknown> | undefined;
  const skillKey = typeof openclawBlock?.skillKey === "string" ? openclawBlock.skillKey : undefined;

  return {
    skillName: manifest.name,
    skillKey,
    metadata,
    manifestContent: manifest.content,
    scanResults,
  };
}

/**
 * Submit a bundled skill to the control plane.
 */
export async function submitSkillToControlPlane(params: {
  controlPlaneUrl: string;
  orgId: string;
  accessToken: string;
  bundle: SkillSubmissionBundle;
}): Promise<{ id: string; status: string }> {
  const url = `${params.controlPlaneUrl}/api/v1/skills/${encodeURIComponent(params.orgId)}/submit`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      skillName: params.bundle.skillName,
      skillKey: params.bundle.skillKey,
      metadata: params.bundle.metadata,
      manifestContent: params.bundle.manifestContent,
      scanResults: params.bundle.scanResults,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Skill submission failed (${response.status}): ${text}`);
  }

  return (await response.json()) as { id: string; status: string };
}

/**
 * Format scan results for display.
 */
export function formatScanSummary(scanResults: SkillSubmissionBundle["scanResults"]): string {
  const lines: string[] = [];
  lines.push(`  Scanned files: ${scanResults.scannedFiles}`);

  if (scanResults.critical > 0) {
    lines.push(`  Critical issues: ${scanResults.critical}`);
  }
  if (scanResults.warn > 0) {
    lines.push(`  Warnings: ${scanResults.warn}`);
  }
  if (scanResults.info > 0) {
    lines.push(`  Info: ${scanResults.info}`);
  }
  if (scanResults.findings.length === 0) {
    lines.push("  No security issues found.");
  } else {
    for (const finding of scanResults.findings.slice(0, 5)) {
      lines.push(`  [${finding.severity}] ${finding.message} (${finding.file}:${finding.line})`);
    }
    if (scanResults.findings.length > 5) {
      lines.push(`  ... and ${scanResults.findings.length - 5} more findings`);
    }
  }
  return lines.join("\n");
}
