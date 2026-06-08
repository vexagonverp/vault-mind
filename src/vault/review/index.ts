import path from "node:path";
import { dateOnly } from "../../core/dates.js";
import { fileExists, listMarkdownFiles, readText, toVaultPath } from "../../core/files.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { AGENT_END, AGENT_PLACEHOLDER_SENTINEL, AGENT_START } from "../../core/managed-notes.js";
import type { ReviewIssue, ReviewResult } from "../../types.js";

interface ReviewOptions {
  today?: Date | string;
}

const issueLabelMap: Record<ReviewIssue["type"], string> = {
  unfilled_agent_block: "Unfilled agent blocks",
  missing_evidence: "Missing evidence",
  broken_evidence_path: "Broken evidence paths",
};

/**
 * Deterministic technical review of agent-authored notes. It does not judge
 * whether a finding is true - that is the red-team workflow's job. It verifies
 * the evidence contract: the agent block is filled, important claims carry an
 * `Evidence:` marker, and cited source paths actually exist in the source repo.
 */
export async function reviewVault(
  vaultPath: string,
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  const today = dateOnly(options.today ?? new Date());
  const files = await listMarkdownFiles(vaultPath);
  const issues: ReviewIssue[] = [];
  let notesReviewed = 0;

  for (const file of files) {
    const content = await readText(file);
    const block = agentBlock(content);
    if (block === undefined) {
      continue;
    }
    notesReviewed += 1;
    const rel = toVaultPath(path.relative(vaultPath, file));
    issues.push(...(await reviewNote(rel, block, content)));
  }

  const counts = issues.reduce<Record<string, number>>((acc, issue) => {
    const label = issueLabelMap[issue.type];
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  return {
    vault: vaultPath,
    scanned: today,
    notesReviewed,
    totalIssues: issues.length,
    counts,
    issues,
  };
}

async function reviewNote(rel: string, block: string, content: string): Promise<ReviewIssue[]> {
  if (isUnfilled(block)) {
    return [{
      type: "unfilled_agent_block",
      severity: "warning",
      message: `Agent block has no source-backed findings: ${rel}`,
      files: [rel],
    }];
  }

  const issues: ReviewIssue[] = [];

  if (!block.includes("Evidence:")) {
    issues.push({
      type: "missing_evidence",
      severity: "warning",
      message: `Agent findings carry no Evidence: marker: ${rel}`,
      files: [rel],
    });
  }

  const repoRoot = sourceRepo(content);
  if (repoRoot !== undefined && (await fileExists(repoRoot))) {
    for (const evidencePath of evidencePaths(block)) {
      if (!(await fileExists(path.join(repoRoot, evidencePath)))) {
        issues.push({
          type: "broken_evidence_path",
          severity: "error",
          message: `Evidence path not found in source repo: ${evidencePath} (${rel})`,
          files: [rel],
        });
      }
    }
  }

  return issues;
}

function agentBlock(content: string): string | undefined {
  const start = content.indexOf(AGENT_START);
  if (start < 0) {
    return undefined;
  }
  const end = content.indexOf(AGENT_END, start);
  if (end < 0) {
    return undefined;
  }
  return content.slice(start + AGENT_START.length, end);
}

function isUnfilled(block: string): boolean {
  if (block.includes(AGENT_PLACEHOLDER_SENTINEL)) {
    return true;
  }
  const stripped = block.replace(/^\s*##\s*Agent notes\s*$/im, "").trim();
  return stripped.length === 0;
}

function sourceRepo(content: string): string | undefined {
  const data = parseFrontmatter(content).data as { "source-repo"?: unknown };
  const value = data["source-repo"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function evidencePaths(block: string): string[] {
  const paths = new Set<string>();
  for (const match of block.matchAll(/Evidence:([^\n]*)/g)) {
    for (const token of (match[1] ?? "").split(/[\s,;]+/)) {
      const candidate = normalizeEvidenceToken(token);
      if (candidate !== undefined) {
        paths.add(candidate);
      }
    }
  }
  return [...paths];
}

function normalizeEvidenceToken(raw: string): string | undefined {
  const token = raw.replace(/^[\s`('"[]+/, "").replace(/[\s`)'".,;:\]]+$/, "");
  if (/^https?:\/\//i.test(token)) {
    return undefined;
  }
  const candidate = token.replace(/:\d+(?:-\d+)?$/, "").replace(/^\.\//, "");
  if (candidate.length < 3 || !/^[\w@./-]+$/.test(candidate)) {
    return undefined;
  }
  // `..` means a git revision range or parent traversal, not a citable file.
  if (candidate.includes("..")) {
    return undefined;
  }
  const looksLikePath = candidate.includes("/") || /\.[A-Za-z][A-Za-z0-9]{0,9}$/.test(candidate);
  return looksLikePath ? candidate : undefined;
}
