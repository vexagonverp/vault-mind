import path from "node:path";
import { git, gitInfo } from "../../core/git.js";
import { sourceExtensions } from "../../core/languages.js";
import { projectSlug, projectTitle } from "../../core/naming.js";
import type { AntipatternOptions, AntipatternSignals } from "./types.js";

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

// Commits whose subject signals remediation - the lead for fix-prone files.
const fixSubjectRe =
  /\b(fix(?:e[sd])?|bug(?:fix)?|hotfix|revert(?:ed|s)?|patch|regress(?:ion)?|broke(?:n)?|workaround|rollback)\b/i;
// Narrower set for the "notable incidents" list.
const remediationSubjectRe =
  /\b(revert(?:ed|s)?|hotfix|rollback|workaround|regression)\b|quick.?fix|temp(?:orary)?.?fix|band.?aid/i;

interface Commit {
  hash: string;
  subject: string;
  files: string[];
}

/**
 * Deterministic anti-pattern signal scan. It reads git history to surface where
 * change and fixes concentrate - it does NOT judge what is an anti-pattern.
 * The agent inspects the cited files and PRs and writes the actual findings.
 */
export async function scanAntipatterns(
  repoPath: string,
  options: AntipatternOptions = {},
): Promise<AntipatternSignals> {
  const root = path.resolve(repoPath);
  const maxFiles = options.maxFiles ?? 15;
  const maxCommits = options.maxCommits ?? 20;
  const name = path.basename(root);

  const base: AntipatternSignals = {
    root,
    name,
    slug: projectSlug(name),
    title: projectTitle(name),
    scanSource: "none",
    commitsScanned: 0,
    hotspotFiles: [],
    fixProneFiles: [],
    remediationCommits: [],
    git: undefined,
  };

  const commits = await readHistory(root);
  if (commits === undefined) {
    return base;
  }

  const tracked = await listTrackedFiles(root);
  // Rank source files only. Manifests, lockfiles, CI yaml, and docs churn for
  // reasons unrelated to code smells and would bury the real leads.
  const isCitable = (file: string): boolean =>
    tracked.has(file) && sourceExtensions.has(path.extname(file).toLowerCase());

  const commitCounts = new Map<string, number>();
  const fixCounts = new Map<string, number>();
  const remediationCommits: AntipatternSignals["remediationCommits"] = [];

  for (const commit of commits) {
    const isFix = fixSubjectRe.test(commit.subject);
    if (remediationSubjectRe.test(commit.subject) && remediationCommits.length < maxCommits) {
      remediationCommits.push({ hash: commit.hash.slice(0, 8), subject: commit.subject });
    }
    for (const file of commit.files) {
      if (!isCitable(file)) {
        continue;
      }
      commitCounts.set(file, (commitCounts.get(file) ?? 0) + 1);
      if (isFix) {
        fixCounts.set(file, (fixCounts.get(file) ?? 0) + 1);
      }
    }
  }

  return {
    ...base,
    scanSource: "git",
    commitsScanned: commits.length,
    hotspotFiles: topFiles(commitCounts, maxFiles).map(([file, count]) => ({ path: file, commits: count })),
    fixProneFiles: topFiles(fixCounts, maxFiles).map(([file, count]) => ({ path: file, fixCommits: count })),
    remediationCommits,
    git: await gitInfo(root),
  };
}

async function readHistory(root: string): Promise<Commit[] | undefined> {
  try {
    return parseHistory(
      await git(root, ["log", "--no-merges", `--pretty=format:${RECORD_SEP}%H${FIELD_SEP}%s`, "--name-only"]),
    );
  } catch {
    return undefined;
  }
}

function parseHistory(stdout: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of stdout.split(RECORD_SEP)) {
    if (record.trim().length === 0) {
      continue;
    }
    const lines = record.split("\n");
    const [hash, subject = ""] = (lines[0] ?? "").split(FIELD_SEP);
    if (hash === undefined || hash.length === 0) {
      continue;
    }
    const files = lines.slice(1).map((line) => line.trim()).filter((line) => line.length > 0);
    commits.push({ hash, subject, files });
  }
  return commits;
}

function topFiles(counts: Map<string, number>, limit: number): Array<[string, number]> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

async function listTrackedFiles(root: string): Promise<Set<string>> {
  try {
    const stdout = await git(root, ["ls-files", "-z"]);
    return new Set(stdout.split("\0").filter((file) => file.length > 0));
  } catch {
    return new Set();
  }
}
