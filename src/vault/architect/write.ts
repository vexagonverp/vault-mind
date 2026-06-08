import path from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { today } from "../../core/dates.js";
import { toVaultPath } from "../../core/files.js";
import { renderBulletList } from "../../core/markdown.js";
import {
  renderNoteHeader,
  writeManagedNote,
  type ManagedNoteResult,
} from "../../core/managed-notes.js";
import { appendOperationLog } from "../../core/operation-log.js";
import { scanCodebase } from "./scan.js";
import type {
  ArchitectureManifest,
  ArchitectResult,
  ArchitectWriteOptions,
} from "./types.js";

type ArchitectureEvidenceFile = ArchitectureManifest["candidateEntryFiles"][number];
type ArchitectureNoteCandidate = ArchitectureManifest["candidateArchitectureNotes"][number];

export async function writeArchitectureNotes(
  options: ArchitectWriteOptions,
): Promise<ArchitectResult> {
  const manifest = await scanCodebase(options.repoPath, options);
  const vault = path.resolve(options.vaultPath);
  const architectureDir = path.join(vault, "Architecture", manifest.slug);
  const generatedDate = today();
  const noteResults: ManagedNoteResult[] = [];
  const overviewTitle = `${manifest.title} - Overview`;
  const scanFactsTitle = `${manifest.title} - Scan facts`;
  const decisionsTitle = `${manifest.title} - Key decisions`;

  await mkdir(architectureDir, { recursive: true });
  const siblingTitles = await architectureSiblingTitles(architectureDir, overviewTitle, [
    scanFactsTitle,
    decisionsTitle,
  ]);

  noteResults.push(
    await writeManagedNote({
      file: path.join(architectureDir, `${overviewTitle}.md`),
      header: renderFrontmatter(generatedDate, "architecture-overview", manifest, {
        scannedCommit: scannedCommit(manifest),
      }),
      generated: renderOverview(manifest, siblingTitles),
      agentBlock: renderAgentBlock(),
      frontmatter: { "scanned-commit": scannedCommit(manifest) },
    }),
  );

  noteResults.push(
    await writeManagedNote({
      file: path.join(architectureDir, `${scanFactsTitle}.md`),
      header: renderFrontmatter(generatedDate, "architecture-scan", manifest),
      generated: renderScanFacts(manifest),
      agentBlock: renderAgentBlock(),
    }),
  );

  noteResults.push(
    await writeManagedNote({
      file: path.join(architectureDir, `${decisionsTitle}.md`),
      header: renderFrontmatter(generatedDate, "adr", manifest),
      generated: renderDecisions(manifest),
      agentBlock: renderAgentBlock(),
    }),
  );

  const changes = noteResults.map((result) => ({
    ...result,
    file: toVaultPath(path.relative(vault, result.file)),
  }));
  const operationLog = await appendOperationLog({
    vault,
    date: generatedDate,
    summary: `architecture refresh: [[${overviewTitle}]] for ${manifest.name}`,
    changes,
    commit: scannedCommit(manifest),
  });

  return {
    manifest,
    operationLog,
    changes,
  };
}

async function architectureSiblingTitles(
  dir: string,
  overviewTitle: string,
  plannedTitles: string[],
): Promise<string[]> {
  const titles = new Set(plannedTitles);
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const title = path.basename(entry.name, ".md");
        if (title !== overviewTitle) {
          titles.add(title);
        }
      }
    }
  } catch {
    // First run or unreadable folders should not block scaffold generation.
  }
  return [...titles].sort();
}

function renderAgentBlock(): string {
  return `<!-- @agent:start -->
## Agent notes

Add source-backed findings here. Important claims need \`Evidence:\` and
\`confidence:\` markers. A generic summary without inspected source paths is
incomplete.

Mark rationale, product intent, compliance intent, and risk explanations as
\`confidence: speculation\` unless a source states them directly.

Prefer focused sibling architecture notes for real runtime flows, domains,
integrations, infrastructure, data models, or state models. Link them from the
overview and back to it.

<!-- @agent:end -->
`;
}

function renderFrontmatter(
  date: string,
  type: string,
  manifest: ArchitectureManifest,
  options: { scannedCommit?: string } = {},
): string {
  return renderNoteHeader({
    date,
    type,
    tags: ["architecture"],
    sourceRepo: manifest.root,
    ...(options.scannedCommit !== undefined && { scannedCommit: options.scannedCommit }),
    preamble: `This architecture note describes ${manifest.title} as scanned from ${manifest.root}.
Generated sections may be refreshed; preserve anything in the user notes section.`,
  });
}

function scannedCommit(manifest: ArchitectureManifest): string {
  return manifest.git?.commit ?? "not detected";
}

function renderOverview(manifest: ArchitectureManifest, siblingTitles: string[]): string {
  return `# ${manifest.title} - Overview

## Snapshot

- Repo: ${manifest.title}
- Root: ${manifest.root}
- Kind: ${manifest.kind ?? "unknown"}
- Git: ${manifest.git ? `${manifest.git.commit}${manifest.git.dirty ? " (dirty)" : ""}` : "not detected"}

## Architecture Notes

${siblingTitles.map((title) => `- [[${title}]]`).join("\n") || "- No sibling architecture notes yet"}

## How To Use

- Start with [[${manifest.title} - Scan facts]] for deterministic filesystem and manifest facts.
- Use the agent section for source-backed findings and links to meaningful architecture notes.
- Create focused sibling notes for real source-backed concepts instead of cramming all findings here.
- Keep generated scan output separate from agent-authored interpretation.
- Use the AI investigation map in scan facts as leads, not as finished architecture claims.
- If this workflow was invoked to document a readable repo, a generic summary without evidence is incomplete.
`;
}

function renderScanFacts(manifest: ArchitectureManifest): string {
  const coreAreas = manifest.modules.filter((item) => item.roleHint === "core");
  const supportAreas = manifest.modules.filter((item) => item.roleHint === "support");
  const mustInspect = mustInspectFiles(manifest);

  return `# ${manifest.title} - Scan facts

## Snapshot

- Repo: ${manifest.title}
- Root: ${manifest.root}
- Kind: ${manifest.kind ?? "unknown"}
- Git: ${manifest.git ? `${manifest.git.commit}${manifest.git.dirty ? " (dirty)" : ""}` : "not detected"}
- File scan: ${manifest.scanSource === "git" ? "git tracked and unignored files" : "filesystem walk"} (${manifest.filesScanned} files)

## Source Roots

${manifest.sourceRoots.map((sourceRoot) => `- ${sourceRoot}`).join("\n") || "- None detected"}

## Languages

${manifest.languages.map((item) => `- ${item.language}: ${item.files} files (${item.pct}%)`).join("\n") || "- None detected"}

## Entry Points

These are package script names or language manifest entrypoints. Inspect the
candidate entry files below before treating a script as a runtime path.

${manifest.entryPoints.map((entry) => `- ${entry}`).join("\n") || "- None detected"}

## Dependencies

${manifest.dependencies.map((dependency) => `- ${dependency}`).join("\n") || "- None detected"}

## Repository Evidence

### Manifest Files

${renderBulletList(manifest.manifestFiles, "No manifest files detected")}

### Documentation

${renderBulletList(manifest.docs, "No documentation files detected")}

### Config Files

${renderBulletList(manifest.configFiles, "No config files detected")}

### Workflows

${renderBulletList(manifest.workflows, "No workflow files detected")}

## Source Areas

These are filesystem facts, not architecture decisions.

${coreAreas.map((item) => `- ${item.path} (${item.sourceFiles} source files)`).join("\n") || "- No core source areas detected"}

## Support Areas

${supportAreas.map((item) => `- ${item.path} (${item.sourceFiles} source files)`).join("\n") || "- No support source areas detected"}

## Repository Signals

- Dockerfile: ${manifest.signals.dockerfile ? "yes" : "no"}
- Makefile: ${manifest.signals.makefile ? "yes" : "no"}
- CI workflows: ${manifest.signals.ci ? "yes" : "no"}

## AI Investigation Map

These are deterministic leads for source inspection, not architecture
decisions. Create or update agent-authored architecture notes only after
inspecting the listed evidence.

### Must Inspect First

${renderBulletList(mustInspect, "No priority inspection files detected")}

### Candidate Entry Files

${renderEvidenceFiles(manifest.candidateEntryFiles)}

### Candidate Architecture Notes

${renderNoteCandidates(manifest.candidateArchitectureNotes)}

### Evidence Rules

- Claims need source paths, config paths, docs, or URLs in \`Evidence:\`.
- Rationale, product intent, compliance intent, and risks need \`confidence: speculation\` unless stated by a source.
- Use \`TBD\` for unknowns instead of filling gaps with plausible text.
`;
}

function mustInspectFiles(manifest: ArchitectureManifest): string[] {
  return [...new Set([
    ...manifest.docs,
    ...manifest.manifestFiles,
    ...manifest.candidateEntryFiles.map((file) => file.path),
    ...manifest.configFiles,
    ...manifest.workflows,
  ])].slice(0, 30);
}

function renderEvidenceFiles(files: ArchitectureEvidenceFile[]): string {
  if (files.length === 0) {
    return "- No candidate entry files detected";
  }

  return files
    .map((file) => `- ${file.path} - ${file.reason}; confidence: candidate`)
    .join("\n");
}

function renderNoteCandidates(candidates: ArchitectureNoteCandidate[]): string {
  if (candidates.length === 0) {
    return "- No candidate architecture notes detected";
  }

  return candidates
    .map((candidate) => {
      const startFiles = candidate.startFiles.length > 0
        ? candidate.startFiles.join(", ")
        : "TBD";
      return `- ${candidate.title} - ${candidate.why} Start files: ${startFiles}; confidence: candidate`;
    })
    .join("\n");
}

function renderDecisions(manifest: ArchitectureManifest): string {
  return `# ${manifest.title} - Key decisions

## Related

- [[${manifest.title} - Overview]]
- [[${manifest.title} - Scan facts]]

## CLI Notes

- The CLI does not infer architecture decisions.
- Use the agent section for source-backed decision candidates.
- Mark rationale as \`confidence: speculation\` unless a source states it directly.
- If source files were inspected, record the inspected evidence or state that no decision candidates were found.

## Follow-Up Questions

- Which modules are true business domains versus implementation folders?
- Which entry points are production paths versus local tooling?
- Which architecture decisions should become standalone ADR notes?
`;
}
