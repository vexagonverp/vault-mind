import path from "node:path";
import { readdir } from "node:fs/promises";
import { isString, listMarkdownFiles, readText, toVaultPath } from "../core/files.js";
import { hasFrontmatter, parseFrontmatter } from "../core/frontmatter.js";
import type { HealthIssue, HealthResult } from "../types.js";

const wikilinkRe = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const templateRe = /<%.*?%>/s;
const skipOrphanTopLevel = new Set([
  "Daily",
  "Boards",
  "Templates",
  "Logs",
  "boards",
  "templates",
  "raw",
]);
const looseRootNotes = new Set(["Home.md", "index.md", "log.md", "SOUL.md", "CRITICAL_FACTS.md"]);
const skipHealthFiles = new Set(["AGENTS.md", "ANTIGRAVITY.md", "_CLAUDE.md"]);
const skipEmptyDirs = new Set([
  ".git",
  ".agents",
  ".codex",
  ".antigravity",
  ".obsidian",
  ".trash",
  "_trash",
  "node_modules",
  "dist",
]);

interface Note {
  file: string;
  rel: string;
  stem: string;
  size: number;
  content: string;
  frontmatter: Record<string, unknown>;
  hasFrontmatter: boolean;
  links: string[];
  aliases: string[];
  due: string | undefined;
}

interface HealthOptions {
  today?: Date | string;
}

export async function runHealthCheck(
  vaultPath: string,
  options: HealthOptions = {},
): Promise<HealthResult> {
  const today = dateOnly(options.today ?? new Date());
  const files = await listMarkdownFiles(vaultPath);

  const allNotes: Note[] = await Promise.all(
    files.map(async (file) => {
      const content = await readText(file);
      const rel = toVaultPath(path.relative(vaultPath, file));
      const parsed = parseFrontmatter(content);
      return {
        file,
        rel,
        stem: path.basename(file, ".md"),
        size: content.length,
        content,
        frontmatter: parsed.data,
        hasFrontmatter: hasFrontmatter(content),
        links: extractWikilinks(content),
        aliases: aliasesFor(parsed.data),
        due: stringFrontmatterValue(parsed.data.due),
      };
    }),
  );

  const notes = allNotes.filter((note) => !skipHealthFiles.has(note.rel));
  const issues = [
    ...checkDuplicates(notes),
    ...checkOrphans(notes),
    ...checkStaleTasks(notes, today),
    ...checkMissingFrontmatter(notes),
    ...(await checkEmptyFolders(vaultPath)),
    ...checkBrokenLinks(notes, allNotes),
    ...checkTemplateLeftovers(notes),
  ];

  const counts = issues.reduce<Record<string, number>>((acc, issue) => {
    const label = issueLabelMap[issue.type];
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  return {
    vault: vaultPath,
    scanned: today,
    totalNotes: notes.length,
    totalIssues: issues.length,
    counts,
    issues,
  };
}

const issueLabelMap: Record<HealthIssue["type"], string> = {
  duplicate: "Duplicates",
  orphan: "Orphans",
  stale_task: "Stale tasks",
  missing_frontmatter: "Missing frontmatter",
  empty_folder: "Empty folders",
  broken_link: "Broken links",
  template_leftover: "Template leftovers",
};

function checkDuplicates(notes: Note[]): HealthIssue[] {
  const byName = new Map<string, Note[]>();
  for (const note of notes) {
    const normalized = normalizeDuplicateName(note.stem);
    if (normalized.length === 0) {
      continue;
    }
    byName.set(normalized, [...(byName.get(normalized) ?? []), note]);
  }

  return [...byName.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([name, matches]) => ({
      type: "duplicate",
      severity: "warning",
      message: `Possible duplicates: ${name}`,
      files: matches.map((note) => note.rel),
    }));
}

function checkMissingFrontmatter(notes: Note[]): HealthIssue[] {
  return notes
    .filter((note) => !isLooseRootNote(note.rel))
    .filter((note) => !note.hasFrontmatter && note.size > 50)
    .map((note) => ({
      type: "missing_frontmatter",
      severity: "warning",
      message: `Missing frontmatter: ${note.rel}`,
      files: [note.rel],
    }));
}

function checkBrokenLinks(notes: Note[], targetNotes = notes): HealthIssue[] {
  const targets = new Set<string>();
  for (const note of targetNotes) {
    targets.add(normalizeTarget(note.stem));
    for (const alias of note.aliases) {
      targets.add(normalizeTarget(alias));
    }
  }

  const issues: HealthIssue[] = [];
  for (const note of notes) {
    for (const link of note.links) {
      if (!targets.has(normalizeTarget(linkBasename(link)))) {
        issues.push({
          type: "broken_link",
          severity: "warning",
          message: `Broken link [[${link}]] in ${note.rel}`,
          files: [note.rel],
        });
      }
    }
  }
  return issues;
}

function checkOrphans(notes: Note[]): HealthIssue[] {
  const incoming = new Set<string>();
  for (const note of notes) {
    for (const link of note.links) {
      incoming.add(normalizeTarget(linkBasename(link)));
    }
  }

  return notes
    .filter((note) => {
      if (isLooseRootNote(note.rel)) {
        return false;
      }
      const top = note.rel.split("/")[0] ?? "";
      if (skipOrphanTopLevel.has(top)) {
        return false;
      }
      return !incoming.has(normalizeTarget(note.stem)) &&
        !note.aliases.some((alias) => incoming.has(normalizeTarget(alias)));
    })
    .map((note) => ({
      type: "orphan",
      severity: "info",
      message: `No incoming links: ${note.rel}`,
      files: [note.rel],
    }));
}

function checkStaleTasks(notes: Note[], today: string): HealthIssue[] {
  return notes.flatMap((note) => {
    if (!isTaskLike(note) || note.due === undefined) {
      return [];
    }

    const daysOverdue = daysBetween(note.due, today);
    if (daysOverdue <= 0) {
      return [];
    }

    return [{
      type: "stale_task",
      severity: daysOverdue > 7 ? "warning" : "info",
      message: `Overdue by ${daysOverdue}d: ${note.rel}`,
      files: [note.rel],
      due: note.due,
    }];
  });
}

async function checkEmptyFolders(vaultPath: string): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const visible = entries.filter((entry) => !skipEmptyDirs.has(entry.name));
    if (dir !== vaultPath && visible.length === 0) {
      issues.push({
        type: "empty_folder",
        severity: "info",
        message: `Empty folder: ${toVaultPath(path.relative(vaultPath, dir))}/`,
        files: [],
      });
      return;
    }

    for (const entry of visible) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
      }
    }
  }

  await walk(vaultPath);
  return issues;
}

function checkTemplateLeftovers(notes: Note[]): HealthIssue[] {
  return notes
    .filter((note) => !note.rel.split("/").some((part) => part.toLowerCase() === "templates"))
    .filter((note) => templateRe.test(note.content))
    .map((note) => ({
      type: "template_leftover",
      severity: "error",
      message: `Unfilled template syntax in: ${note.rel}`,
      files: [note.rel],
    }));
}

function extractWikilinks(content: string): string[] {
  return [...content.matchAll(wikilinkRe)].map((match) => match[1]?.trim()).filter(isString);
}

function aliasesFor(frontmatter: Record<string, unknown>): string[] {
  const aliases = frontmatter.aliases;
  if (Array.isArray(aliases)) {
    return aliases.map(String);
  }
  if (typeof aliases === "string") {
    return [aliases];
  }
  return [];
}

function normalizeTarget(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDuplicateName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linkBasename(link: string): string {
  return link.split(/[\\/]/).at(-1) ?? link;
}

function isTaskLike(note: Note): boolean {
  const type = stringFrontmatterValue(note.frontmatter.type);
  const tags = arrayFrontmatterValue(note.frontmatter.tags);
  return type === "task" ||
    tags.includes("task") ||
    note.content.slice(0, 300).toLowerCase().includes("kanban-plugin: board");
}

function stringFrontmatterValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

function arrayFrontmatterValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return typeof value === "string" ? [value] : [];
}

function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString().slice(0, 10);
}

function daysBetween(past: string, today: string): number {
  const pastTime = Date.parse(`${past}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(pastTime) || Number.isNaN(todayTime)) {
    return 0;
  }
  return Math.floor((todayTime - pastTime) / 86_400_000);
}

function isLooseRootNote(rel: string): boolean {
  return looseRootNotes.has(rel);
}
