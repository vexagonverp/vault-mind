import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { escapeRegExp, fileExists, isString, readTextIfPresent, toVaultPath } from "../core/files.js";

const execFileAsync = promisify(execFile);

const skipDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".next",
  ".nuxt",
  "vendor",
  "coverage",
  ".turbo",
  ".cache",
  "out",
]);

const supportDirs = new Set([
  "tests",
  "test",
  "docs",
  "doc",
  "examples",
  "example",
  "scripts",
  "fixtures",
  "__tests__",
  "spec",
  "specs",
]);

const languagesByExtension: Record<string, string> = {
  ".py": "Python",
  ".js": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".jsx": "JavaScript",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".sh": "Shell",
  ".sql": "SQL",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".md": "Markdown",
};

const sourceExtensions = new Set(
  Object.keys(languagesByExtension).filter((extension) => extension !== ".md"),
);

export interface ArchitectureModule {
  name: string;
  path: string;
  sourceFiles: number;
  roleHint: "core" | "support";
}

export interface ArchitectureManifest {
  root: string;
  name: string;
  slug: string;
  title: string;
  kind: string | undefined;
  sourceRoots: string[];
  languages: Array<{ language: string; files: number; pct: number }>;
  modules: ArchitectureModule[];
  dependencies: string[];
  entryPoints: string[];
  signals: {
    dockerfile: boolean;
    makefile: boolean;
    ci: boolean;
  };
  git: {
    commit: string;
    dirty: boolean;
  } | undefined;
}

export interface ArchitectOptions {
  maxModules?: number;
}

export interface ArchitectWriteOptions extends ArchitectOptions {
  repoPath: string;
  vaultPath: string;
}

export interface ArchitectResult {
  manifest: ArchitectureManifest;
  written: string[];
}

interface ManifestInfo {
  name: string;
  kind: string | undefined;
  dependencies: string[];
  entryPoints: string[];
  signals: ArchitectureManifest["signals"];
}

export async function scanCodebase(
  repoPath: string,
  options: ArchitectOptions = {},
): Promise<ArchitectureManifest> {
  const root = path.resolve(repoPath);
  const maxModules = options.maxModules ?? 12;
  const files = await listFiles(root);
  const manifest = await detectManifest(root);
  const roots = await sourceRoots(root);

  return {
    root,
    name: manifest.name,
    slug: projectSlug(manifest.name),
    title: projectTitle(manifest.name),
    kind: manifest.kind,
    sourceRoots: roots.map((sourceRoot) => toVaultPath(path.relative(root, sourceRoot)) || "."),
    languages: detectLanguages(files),
    modules: await proposeModules(root, maxModules, roots),
    dependencies: manifest.dependencies,
    entryPoints: manifest.entryPoints,
    signals: manifest.signals,
    git: await gitInfo(root),
  };
}

export async function writeArchitectureNotes(
  options: ArchitectWriteOptions,
): Promise<ArchitectResult> {
  const manifest = await scanCodebase(options.repoPath, options);
  const vault = path.resolve(options.vaultPath);
  const architectureDir = path.join(vault, "Architecture", manifest.slug);
  const today = new Date().toISOString().slice(0, 10);
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
      renderFrontmatter(today, "architecture-overview", manifest),
      renderOverview(manifest, siblingTitles),
    ),
  );

  written.push(
    await writeArchitectureNote(
      path.join(architectureDir, `${scanFactsTitle}.md`),
      renderFrontmatter(today, "architecture-scan", manifest),
      renderScanFacts(manifest),
    ),
  );

  written.push(
    await writeArchitectureNote(
      path.join(architectureDir, `${decisionsTitle}.md`),
      renderFrontmatter(today, "adr", manifest),
      renderDecisions(manifest),
    ),
  );

  return {
    manifest,
    written: written.map((file) => toVaultPath(path.relative(vault, file))),
  };
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (skipDirs.has(entry.name)) {
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }

  await walk(root);
  return files;
}

function detectLanguages(files: string[]): ArchitectureManifest["languages"] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const language = languagesByExtension[path.extname(file).toLowerCase()];
    if (language === undefined) {
      continue;
    }
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, files]) => ({
      language,
      files,
      pct: Math.round((1000 * files) / total) / 10,
    }));
}

async function detectManifest(root: string): Promise<ManifestInfo> {
  const packageJson = path.join(root, "package.json");
  const pyproject = path.join(root, "pyproject.toml");
  const base: ManifestInfo = {
    name: path.basename(root),
    kind: undefined,
    dependencies: [],
    entryPoints: [],
    signals: {
      dockerfile: await fileExists(path.join(root, "Dockerfile")),
      makefile: await fileExists(path.join(root, "Makefile")),
      ci: await fileExists(path.join(root, ".github", "workflows")),
    },
  };

  if (await fileExists(packageJson)) {
    const parsed = JSON.parse(await readTextIfPresent(packageJson)) as {
      name?: string;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    return {
      ...base,
      name: parsed.name ?? base.name,
      kind: "node",
      dependencies: Object.keys(parsed.dependencies ?? {}).sort().slice(0, 25),
      entryPoints: Object.keys(parsed.scripts ?? {}).sort().slice(0, 15),
    };
  }

  if (await fileExists(pyproject)) {
    const text = await readTextIfPresent(pyproject);
    return {
      ...base,
      name: matchOne(text, /^\s*name\s*=\s*["']([^"']+)/m) ?? base.name,
      kind: "python",
      dependencies: matchMany(text, /["']([A-Za-z0-9_.-]+)(?:[<>=~! ].*)?["']/g).slice(0, 25),
      entryPoints: matchMany(text, /^\s*([A-Za-z0-9_-]+)\s*=\s*["'][^"']+:[^"']+["']/gm).slice(0, 15),
    };
  }

  for (const [file, kind] of [
    ["go.mod", "go"],
    ["Cargo.toml", "rust"],
    ["requirements.txt", "python"],
    ["Gemfile", "ruby"],
    ["pom.xml", "java"],
    ["build.gradle", "gradle"],
  ] as const) {
    if (await fileExists(path.join(root, file))) {
      return { ...base, kind };
    }
  }

  return base;
}

async function proposeModules(
  root: string,
  maxModules: number,
  roots: string[],
): Promise<ArchitectureModule[]> {
  const modules: ArchitectureModule[] = [];
  for (const base of roots) {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || skipDirs.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const full = path.join(base, entry.name);
      const sourceFiles = (await listFiles(full)).filter((file) =>
        sourceExtensions.has(path.extname(file).toLowerCase()),
      ).length;
      if (sourceFiles === 0) {
        continue;
      }

      modules.push({
        name: entry.name,
        path: toVaultPath(path.relative(root, full)),
        sourceFiles,
        roleHint: supportDirs.has(entry.name.toLowerCase()) ? "support" : "core",
      });
    }
  }

  return modules
    .sort((a, b) => {
      if (a.roleHint !== b.roleHint) {
        return a.roleHint === "core" ? -1 : 1;
      }
      return b.sourceFiles - a.sourceFiles;
    })
    .slice(0, maxModules);
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

async function sourceRoots(root: string): Promise<string[]> {
  for (const name of ["src", "app/src", "lib"]) {
    const full = path.join(root, name);
    if (await fileExists(full)) {
      return [full];
    }
  }

  for (const name of ["app", "apps", "packages"]) {
    const full = path.join(root, name);
    if (await fileExists(full)) {
      try {
        const entries = await readdir(full, { withFileTypes: true });
        const subdirs = entries
          .filter((e) => e.isDirectory() && !skipDirs.has(e.name) && !e.name.startsWith("."))
          .map((e) => path.join(full, e.name));
        if (subdirs.length > 0) {
          return subdirs;
        }
      } catch {
        // fall through
      }
      return [full];
    }
  }

  return [root];
}

async function gitInfo(root: string): Promise<ArchitectureManifest["git"]> {
  try {
    const commit = await execGit(root, ["rev-parse", "--short", "HEAD"]);
    if (commit.length === 0) {
      return undefined;
    }
    const status = await execGit(root, ["status", "--porcelain"]);
    return { commit, dirty: status.length > 0 };
  } catch {
    return undefined;
  }
}

async function execGit(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args]);
  return stdout.trim();
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
    await writeFile(file, ensureEditableBlocks(refreshed), "utf8");
    return file;
  }

  await mkdir(path.dirname(file), { recursive: true });
  const next = current.trim().length > 0
    ? `${current.trimEnd()}\n\n${block}${renderAgentBlock()}${renderUserBlock()}`
    : `${header.trimEnd()}\n\n${block}${renderAgentBlock()}${renderUserBlock()}`;
  await writeFile(file, next, "utf8");
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
- If this workflow was invoked to document a readable repo, a generic summary without evidence is incomplete.
`;
}

function renderScanFacts(manifest: ArchitectureManifest): string {
  const coreAreas = manifest.modules.filter((item) => item.roleHint === "core");
  const supportAreas = manifest.modules.filter((item) => item.roleHint === "support");

  return `# ${manifest.title} - Scan facts

## Snapshot

- Repo: ${manifest.title}
- Root: ${manifest.root}
- Kind: ${manifest.kind ?? "unknown"}
- Git: ${manifest.git ? `${manifest.git.commit}${manifest.git.dirty ? " (dirty)" : ""}` : "not detected"}

## Source Roots

${manifest.sourceRoots.map((sourceRoot) => `- ${sourceRoot}`).join("\n") || "- None detected"}

## Languages

${manifest.languages.map((item) => `- ${item.language}: ${item.files} files (${item.pct}%)`).join("\n") || "- None detected"}

## Entry Points

${manifest.entryPoints.map((entry) => `- ${entry}`).join("\n") || "- None detected"}

## Dependencies

${manifest.dependencies.map((dependency) => `- ${dependency}`).join("\n") || "- None detected"}

## Source Areas

These are filesystem facts, not architecture decisions.

${coreAreas.map((item) => `- ${item.path} (${item.sourceFiles} source files)`).join("\n") || "- No core source areas detected"}

## Support Areas

${supportAreas.map((item) => `- ${item.path} (${item.sourceFiles} source files)`).join("\n") || "- No support source areas detected"}

## Repository Signals

- Dockerfile: ${manifest.signals.dockerfile ? "yes" : "no"}
- Makefile: ${manifest.signals.makefile ? "yes" : "no"}
- CI workflows: ${manifest.signals.ci ? "yes" : "no"}
`;
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

function matchOne(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

function matchMany(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]).filter(isString);
}

function projectSlug(value: string): string {
  const slug = value
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "project";
}

function projectTitle(value: string): string {
  const words = value
    .replace(/^@/, "")
    .replace(/[/:\\_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  return words.map(formatTitleWord).join(" ") || "Project";
}

function formatTitleWord(word: string): string {
  const acronym = word.toLowerCase();
  if (["api", "cli", "ui", "ux", "sdk", "id", "url", "http"].includes(acronym)) {
    return acronym.toUpperCase();
  }
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}
