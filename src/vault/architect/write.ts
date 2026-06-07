import path from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { today } from "../../core/dates.js";
import { escapeRegExp, readTextIfPresent, toVaultPath, writeText } from "../../core/files.js";
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
  const written: string[] = [];
  const overviewTitle = `${manifest.title} - Overview`;
  const scanFactsTitle = `${manifest.title} - Scan facts`;
  const decisionsTitle = `${manifest.title} - Key decisions`;

  await mkdir(architectureDir, { recursive: true });
  const siblingTitles = await architectureSiblingTitles(architectureDir, overviewTitle, [
    scanFactsTitle,
    decisionsTitle,
  ]);

  written.push(
    await writeArchitectureNote(
      path.join(architectureDir, `${overviewTitle}.md`),
      renderFrontmatter(generatedDate, "architecture-overview", manifest),
      renderOverview(manifest, siblingTitles),
    ),
  );

  written.push(
    await writeArchitectureNote(
      path.join(architectureDir, `${scanFactsTitle}.md`),
      renderFrontmatter(generatedDate, "architecture-scan", manifest),
      renderScanFacts(manifest),
    ),
  );

  written.push(
    await writeArchitectureNote(
      path.join(architectureDir, `${decisionsTitle}.md`),
      renderFrontmatter(generatedDate, "adr", manifest),
      renderDecisions(manifest),
    ),
  );

  return {
    manifest,
    written: written.map((file) => toVaultPath(path.relative(vault, file))),
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

async function writeArchitectureNote(
  file: string,
  header: string,
  generated: string,
): Promise<string> {
  const start = "<!-- @generated:start -->";
  const end = "<!-- @generated:end -->";
  const block = `${start}\n${generated.trimEnd()}\n${end}\n`;
  const current = await readTextIfPresent(file);

  if (current.includes(start) && current.includes(end)) {
    const refreshed = current.replace(
      new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`),
      block,
    );
    await writeText(file, ensureEditableBlocks(refreshed));
    return file;
  }

  const next = current.trim().length > 0
    ? `${current.trimEnd()}\n\n${block}${renderAgentBlock()}${renderUserBlock()}`
    : `${header.trimEnd()}\n\n${block}${renderAgentBlock()}${renderUserBlock()}`;
  await writeText(file, next);
  return file;
}

function ensureEditableBlocks(content: string): string {
  return ensureUserBlock(ensureAgentBlock(content));
}

function ensureAgentBlock(content: string): string {
  if (content.includes("<!-- @agent:start -->")) {
    return content;
  }

  const userStart = content.indexOf("<!-- @user:start -->");
  if (userStart >= 0) {
    return `${content.slice(0, userStart).trimEnd()}\n\n${renderAgentBlock()}${content.slice(userStart)}`;
  }

  return `${content.trimEnd()}\n\n${renderAgentBlock()}`;
}

function ensureUserBlock(content: string): string {
  if (content.includes("<!-- @user:start -->")) {
    return content;
  }

  return `${content.trimEnd()}\n\n${renderUserBlock()}`;
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

function renderUserBlock(): string {
  return "<!-- @user:start -->\n## User notes\n\n<!-- @user:end -->\n";
}

function renderFrontmatter(today: string, type: string, manifest: ArchitectureManifest): string {
  return `---
date: ${today}
type: ${type}
tags: [architecture]
ai-first: true
source-repo: "${manifest.root}"
---

## For future agent
This architecture note describes ${manifest.title} as scanned from ${manifest.root}.
Generated sections may be refreshed; preserve anything in the user notes section.
`;
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

${renderPathList(manifest.manifestFiles, "No manifest files detected")}

### Documentation

${renderPathList(manifest.docs, "No documentation files detected")}

### Config Files

${renderPathList(manifest.configFiles, "No config files detected")}

### Workflows

${renderPathList(manifest.workflows, "No workflow files detected")}

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

${renderPathList(mustInspect, "No priority inspection files detected")}

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

function renderPathList(paths: string[], empty: string): string {
  return paths.length > 0 ? paths.map((file) => `- ${file}`).join("\n") : `- ${empty}`;
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
