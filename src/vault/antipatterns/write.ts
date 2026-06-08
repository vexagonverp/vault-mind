import path from "node:path";
import { mkdir } from "node:fs/promises";
import { today } from "../../core/dates.js";
import { toVaultPath } from "../../core/files.js";
import { renderBulletList } from "../../core/markdown.js";
import { renderNoteHeader, writeManagedNote } from "../../core/managed-notes.js";
import { appendOperationLog } from "../../core/operation-log.js";
import { scanAntipatterns } from "./scan.js";
import type {
  AntipatternResult,
  AntipatternSignals,
  AntipatternWriteOptions,
} from "./types.js";

export async function writeAntipatternNotes(
  options: AntipatternWriteOptions,
): Promise<AntipatternResult> {
  const signals = await scanAntipatterns(options.repoPath, options);
  const vault = path.resolve(options.vaultPath);
  const dir = path.join(vault, "Anti-patterns", signals.slug);
  const generatedDate = today();
  const title = `${signals.title} - Anti-patterns`;

  await mkdir(dir, { recursive: true });
  const result = await writeManagedNote({
    file: path.join(dir, `${title}.md`),
    header: renderHeader(generatedDate, signals),
    generated: renderSignals(signals),
    agentBlock: renderAgentBlock(),
    frontmatter: { "scanned-commit": scannedCommit(signals) },
  });

  const change = { ...result, file: toVaultPath(path.relative(vault, result.file)) };
  const operationLog = await appendOperationLog({
    vault,
    date: generatedDate,
    summary: `anti-pattern scan: [[${title}]] for ${signals.name}`,
    changes: [change],
    commit: scannedCommit(signals),
  });

  return { signals, operationLog, changes: [change] };
}

function renderHeader(date: string, signals: AntipatternSignals): string {
  return renderNoteHeader({
    date,
    type: "antipatterns",
    tags: ["antipatterns"],
    sourceRepo: signals.root,
    scannedCommit: scannedCommit(signals),
    preamble: `This note catalogs anti-patterns ("what not to do") in ${signals.title}, scanned
from ${signals.root}. The generated section lists deterministic git-history
signals; treat them as leads. The agent section holds source-backed findings.`,
  });
}

function renderSignals(signals: AntipatternSignals): string {
  return `# ${signals.title} - Anti-patterns

## Snapshot

- Repo: ${signals.title}
- Root: ${signals.root}
- Git: ${signals.git ? `${signals.git.commit}${signals.git.dirty ? " (dirty)" : ""}` : "not detected"}
- History scan: ${signals.scanSource === "git" ? `${signals.commitsScanned} commits` : "no git history detected"}

## Change Hotspots

Files with the most commits. High churn often marks fragile or overloaded code.

${renderBulletList(signals.hotspotFiles.map((file) => `${file.path} (${file.commits} commits)`), "No hotspots detected")}

## Fix-Prone Files

Files most often touched by fix, bug, revert, or hotfix commits. Strong leads
for recurring anti-patterns.

${renderBulletList(signals.fixProneFiles.map((file) => `${file.path} (${file.fixCommits} fix commits)`), "No fix-prone files detected")}

## Remediation Commits

Notable revert, hotfix, rollback, or workaround commits - specific incidents to read.

${renderBulletList(signals.remediationCommits.map((commit) => `${commit.hash} ${commit.subject}`), "No remediation commits detected")}

## How To Use

- These are deterministic git signals, not findings. Inspect the cited files and
  their pull-request review comments (gh) before naming an anti-pattern.
- A high-churn or fix-prone file is a lead. Confirm the actual smell in source.
- Record findings in the agent section, then verify with \`vaultmind review\`.
`;
}

function renderAgentBlock(): string {
  return `<!-- @agent:start -->
## Anti-pattern findings

Add source-backed findings here. Each anti-pattern needs:

- a short symptom (what the bad pattern is)
- \`Evidence:\` a \`path/to/file.ts:line\`, a PR link, or a commit hash
- a \`confidence:\` marker (\`speculation\` unless a source states it directly)
- "Do instead:" the fix, linking \`CODING_GUIDELINES\` where one exists

Use the signals above as leads, not findings. Inspect the cited files and their
pull-request review comments (gh) before deciding a pattern is real and
recurring rather than a one-off nitpick.

<!-- @agent:end -->
`;
}

function scannedCommit(signals: AntipatternSignals): string {
  return signals.git?.commit ?? "not detected";
}
