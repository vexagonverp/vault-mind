import path from "node:path";
import { today } from "../../core/dates.js";
import {
  ensureMarkdownFrontmatter,
  fileExists,
  listMarkdownFiles,
  readText,
  stripLineReference,
  toVaultPath,
  writeGeneratedBlock,
} from "../../core/files.js";
import { parseFrontmatter, sourceRepoValue } from "../../core/frontmatter.js";
import { renderBulletList } from "../../core/markdown.js";
import type {
  AntipatternIndex,
  AntipatternIndexResult,
  PatternExample,
  PatternIndexEntry,
} from "./types.js";

const ANTIPATTERNS_DIR = "Anti-patterns";
const PATTERNS_DIR = "_patterns";
const INDEX_STEM = "_Index";
const INDEX_BLOCK_ID = "antipattern-index";

// An instance finding links up to a pattern with `pattern: [[Name]]`, and may
// carry `status: active|resolved` and `example: path:line` on the same line.
const patternRefRe = /pattern:\s*\[\[([^\]|#]+)/gi;
const resolvedRe = /status:\s*resolved/i;
const exampleRe = /example:\s*([^\s;]+)/i;

interface PatternDefinition {
  status: string;
  rule: string;
}

interface PatternAccumulator {
  instances: number;
  resolved: number;
  repos: Set<string>;
  examples: PatternExample[];
}

/**
 * Deterministic cross-repo rollup of anti-pattern *types*. It groups instance
 * references (`pattern: [[Name]]` in per-repo notes) by pattern and reconciles
 * them with the durable `_patterns/<Name>.md` notes. It does not interpret -
 * the pattern definitions and the tagging are agent-authored.
 */
export async function buildAntipatternIndex(vaultPath: string): Promise<AntipatternIndex> {
  const dir = path.join(vaultPath, ANTIPATTERNS_DIR);
  if (!(await fileExists(dir))) {
    return { vault: vaultPath, patterns: [] };
  }

  const files = await listMarkdownFiles(dir);
  const definedPatterns = new Map<string, PatternDefinition>();
  const refs = new Map<string, PatternAccumulator>();

  for (const file of files) {
    const rel = toVaultPath(path.relative(dir, file));
    const stem = path.basename(file, ".md");

    if (isPatternNote(rel)) {
      const content = await readText(file);
      definedPatterns.set(stem, { status: patternStatus(content), rule: patternRule(content) });
      continue;
    }

    if (stem === INDEX_STEM) {
      continue;
    }

    const content = await readText(file);
    const parsed = parseFrontmatter(content);
    const repoRoot = sourceRepoValue(parsed.data);
    const repo = repoLabel(rel, repoRoot);

    for (const { name, resolved, example } of patternReferences(content)) {
      const acc = refs.get(name) ?? { instances: 0, resolved: 0, repos: new Set<string>(), examples: [] };
      acc.instances += 1;
      if (resolved) {
        acc.resolved += 1;
      }
      acc.repos.add(repo);
      acc.examples.push({
        repo,
        path: example ?? "(no example given)",
        resolved,
        ok: await exampleResolves(repoRoot, example),
      });
      refs.set(name, acc);
    }
  }

  const names = new Set<string>([...definedPatterns.keys(), ...refs.keys()]);
  const patterns: PatternIndexEntry[] = [...names]
    .map((name) => {
      const acc = refs.get(name);
      const definition = definedPatterns.get(name);
      return {
        name,
        defined: definition !== undefined,
        status: definition?.status ?? "no pattern note",
        rule: definition?.rule ?? "",
        instances: acc?.instances ?? 0,
        resolved: acc?.resolved ?? 0,
        repos: [...(acc?.repos ?? [])].sort(),
        examples: acc?.examples ?? [],
      };
    })
    .sort((a, b) => b.instances - a.instances || a.name.localeCompare(b.name));

  return { vault: vaultPath, patterns };
}

export async function writeAntipatternIndex(vaultPath: string): Promise<AntipatternIndexResult> {
  const index = await buildAntipatternIndex(vaultPath);
  const file = path.join(vaultPath, ANTIPATTERNS_DIR, `${INDEX_STEM}.md`);

  await ensureMarkdownFrontmatter(file, renderIndexHeader(today()));
  await writeGeneratedBlock(file, INDEX_BLOCK_ID, renderIndexBody(index));

  return { file: toVaultPath(path.relative(vaultPath, file)), index };
}

function isPatternNote(rel: string): boolean {
  return rel.split("/")[0] === PATTERNS_DIR;
}

function patternStatus(content: string): string {
  const status = parseFrontmatter(content).data.status;
  return typeof status === "string" && status.length > 0 ? status : "active";
}

// The pattern's rule: the first non-heading, non-empty line of its note body.
function patternRule(content: string): string {
  for (const line of parseFrontmatter(content).content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      return trimmed;
    }
  }
  return "";
}

function repoLabel(rel: string, repoRoot: string | undefined): string {
  if (repoRoot !== undefined) {
    return path.basename(repoRoot);
  }
  return rel.split("/")[0] ?? "unknown";
}

async function exampleResolves(
  repoRoot: string | undefined,
  example: string | undefined,
): Promise<boolean | undefined> {
  if (repoRoot === undefined || example === undefined || !(await fileExists(repoRoot))) {
    return undefined;
  }
  return fileExists(path.join(repoRoot, stripLineReference(example)));
}

function patternReferences(content: string): Array<{ name: string; resolved: boolean; example: string | undefined }> {
  const references: Array<{ name: string; resolved: boolean; example: string | undefined }> = [];
  for (const line of content.split("\n")) {
    const resolved = resolvedRe.test(line);
    const example = exampleRe.exec(line)?.[1];
    for (const match of line.matchAll(patternRefRe)) {
      const name = match[1]?.trim();
      if (name !== undefined && name.length > 0) {
        references.push({ name, resolved, example });
      }
    }
  }
  return references;
}

function renderIndexHeader(date: string): string {
  return `---
date: ${date}
type: antipattern-index
tags: [antipatterns, index]
ai-first: true
---

## For future agent
Read this before implementing or reviewing code. It is the durable, cross-repo
catalog of anti-patterns ("what not to do"); each entry is a lesson with real
examples. Instances live in the per-repo notes and link up with
\`pattern: [[Name]]\`; a pattern persists here even when every instance is fixed -
a resolved example is evidence the rule works. The generated block is a
deterministic rollup; refresh it with \`vaultmind antipatterns --index\`. Add
curation notes below the generated block; they are preserved.
`;
}

function renderIndexBody(index: AntipatternIndex): string {
  if (index.patterns.length === 0) {
    return `# Anti-pattern index

No patterns recorded yet. Tag instance findings with \`pattern: [[Name]]\` and
create \`_patterns/<Name>.md\` notes for the durable lessons.`;
  }

  const sections = index.patterns.map(renderPatternSection).join("\n\n");
  const undefinedNames = index.patterns.filter((pattern) => !pattern.defined).map((pattern) => pattern.name);

  return `# Anti-pattern index

${renderSummary(index.patterns)}

${sections}

## Undefined Patterns

Referenced by an instance but missing a \`_patterns/<Name>.md\` note. Write the
durable lesson so the pattern survives its instances.

${renderBulletList(undefinedNames, "None - every referenced pattern has a note")}`;
}

function renderSummary(patterns: PatternIndexEntry[]): string {
  const active = patterns.reduce((sum, pattern) => sum + (pattern.instances - pattern.resolved), 0);
  const resolved = patterns.reduce((sum, pattern) => sum + pattern.resolved, 0);
  const repos = new Set(patterns.flatMap((pattern) => pattern.repos));
  return `${patterns.length} patterns · ${active} active · ${resolved} resolved across ${repos.size} repos.`;
}

function renderPatternSection(pattern: PatternIndexEntry): string {
  const heading = pattern.defined ? `## [[${pattern.name}]]` : `## ${pattern.name}`;
  const lines = [heading];

  if (pattern.rule.length > 0) {
    lines.push(`> ${pattern.rule}`);
  } else if (!pattern.defined) {
    lines.push(`_No \`_patterns/${pattern.name}.md\` note yet - write the durable lesson._`);
  }

  const examples = pattern.examples.length > 0
    ? pattern.examples.map(renderExample)
    : ["- (no examples recorded)"];
  lines.push(examples.join("\n"));

  return lines.join("\n");
}

function renderExample(example: PatternExample): string {
  const flags = [
    example.resolved ? "resolved" : undefined,
    example.ok === false ? "⚠️ path not found" : undefined,
  ].filter((flag) => flag !== undefined);
  const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
  return `- ${example.repo} — \`${example.path}\`${suffix}`;
}
