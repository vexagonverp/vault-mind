import { escapeRegExp, readTextIfPresent, writeText } from "./files.js";

export const GENERATED_START = "<!-- @generated:start -->";
export const GENERATED_END = "<!-- @generated:end -->";
export const AGENT_START = "<!-- @agent:start -->";
export const AGENT_END = "<!-- @agent:end -->";
export const USER_START = "<!-- @user:start -->";
export const USER_END = "<!-- @user:end -->";

// Shared sentinel sentence that every agent-block placeholder must contain.
// Its presence means the agent has not yet replaced the template with real
// findings. The review check relies on this to detect unfilled blocks.
export const AGENT_PLACEHOLDER_SENTINEL = "Add source-backed findings here";

export type ManagedNoteStatus = "created" | "updated" | "unchanged";

export interface ManagedNoteResult {
  file: string;
  status: ManagedNoteStatus;
  generatedChanged: boolean;
  frontmatterChanged: boolean;
}

export interface ManagedNoteInput {
  file: string;
  // Frontmatter and preamble written only when the note is first created.
  header: string;
  // Content for the CLI-owned `@generated` block. Refreshed on every run.
  generated: string;
  // Full rendered `@agent` block (markers included). Inserted on create or when
  // an existing note is missing the block; never overwrites agent content.
  agentBlock: string;
  // Frontmatter keys to upsert after the body is assembled.
  frontmatter?: Record<string, string>;
}

/**
 * Idempotent writer for a three-zone note (`@generated`, `@agent`, `@user`).
 * The CLI owns `@generated` and refreshes it; agent and user zones are
 * preserved across runs. Shared by the architect and antipatterns scaffolds.
 */
export async function writeManagedNote(input: ManagedNoteInput): Promise<ManagedNoteResult> {
  const block = `${GENERATED_START}\n${input.generated.trimEnd()}\n${GENERATED_END}\n`;
  const current = await readTextIfPresent(input.file);
  let generatedChanged = true;
  let next: string;

  if (current.includes(GENERATED_START) && current.includes(GENERATED_END)) {
    const refreshed = current.replace(
      new RegExp(`${escapeRegExp(GENERATED_START)}[\\s\\S]*?${escapeRegExp(GENERATED_END)}\\n?`),
      () => block,
    );
    generatedChanged = refreshed !== current;
    next = ensureEditableBlocks(refreshed, input.agentBlock);
  } else {
    next = current.trim().length > 0
      ? `${current.trimEnd()}\n\n${block}${input.agentBlock}${renderUserBlock()}`
      : `${input.header.trimEnd()}\n\n${block}${input.agentBlock}${renderUserBlock()}`;
  }

  const withFrontmatter = applyFrontmatterUpdates(next, input.frontmatter ?? {});
  const frontmatterChanged = withFrontmatter !== next;

  if (withFrontmatter === current) {
    return { file: input.file, status: "unchanged", generatedChanged: false, frontmatterChanged: false };
  }

  await writeText(input.file, withFrontmatter);
  return {
    file: input.file,
    status: current.length === 0 ? "created" : "updated",
    generatedChanged,
    frontmatterChanged,
  };
}

export function renderUserBlock(): string {
  return `${USER_START}\n## User notes\n\n${USER_END}\n`;
}

export interface NoteHeaderOptions {
  date: string;
  type: string;
  tags: string[];
  sourceRepo: string;
  scannedCommit?: string;
  // Prose for the "## For future agent" section explaining the note's purpose.
  preamble: string;
}

/**
 * Frontmatter plus the "## For future agent" preamble written when a managed
 * note is first created. Shared by the architect and antipatterns scaffolds.
 */
export function renderNoteHeader(options: NoteHeaderOptions): string {
  const frontmatter = [
    "---",
    `date: ${options.date}`,
    `type: ${options.type}`,
    `tags: [${options.tags.join(", ")}]`,
    "ai-first: true",
    `source-repo: ${yamlString(options.sourceRepo)}`,
    ...(options.scannedCommit === undefined
      ? []
      : [`scanned-commit: ${yamlString(options.scannedCommit)}`]),
    "---",
  ].join("\n");

  return `${frontmatter}\n\n## For future agent\n${options.preamble.trim()}\n`;
}

function ensureEditableBlocks(content: string, agentBlock: string): string {
  return ensureUserBlock(ensureAgentBlock(content, agentBlock));
}

function ensureAgentBlock(content: string, agentBlock: string): string {
  if (content.includes(AGENT_START)) {
    return content;
  }

  const userStart = content.indexOf(USER_START);
  if (userStart >= 0) {
    return `${content.slice(0, userStart).trimEnd()}\n\n${agentBlock}${content.slice(userStart)}`;
  }

  return `${content.trimEnd()}\n\n${agentBlock}`;
}

function ensureUserBlock(content: string): string {
  if (content.includes(USER_START)) {
    return content;
  }

  return `${content.trimEnd()}\n\n${renderUserBlock()}`;
}

function applyFrontmatterUpdates(content: string, updates: Record<string, string>): string {
  const entries = Object.entries(updates);
  if (entries.length === 0 || !content.startsWith("---\n")) {
    return content;
  }

  const end = content.indexOf("\n---", 4);
  if (end < 0) {
    return content;
  }

  const frontmatter = content.slice(4, end).split("\n");
  for (const [key, value] of entries) {
    const rendered = `${key}: ${yamlString(value)}`;
    const existing = frontmatter.findIndex((line) =>
      new RegExp(`^${escapeRegExp(key)}\\s*:`).test(line)
    );
    if (existing >= 0) {
      frontmatter[existing] = rendered;
    } else {
      frontmatter.push(rendered);
    }
  }

  return `---\n${frontmatter.join("\n")}${content.slice(end)}`;
}

export function yamlString(value: string): string {
  return JSON.stringify(value);
}
