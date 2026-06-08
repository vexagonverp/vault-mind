import path from "node:path";
import { readTextIfPresent, toVaultPath, writeText } from "./files.js";
import type { ManagedNoteResult, ManagedNoteStatus } from "./managed-notes.js";

export interface OperationLogResult {
  file: string;
  entry: string;
}

export interface OperationLogOptions {
  vault: string;
  date: string;
  // Lead text for the entry, e.g. `architecture refresh: [[Title]] for repo-name`.
  summary: string;
  changes: ManagedNoteResult[];
  commit: string;
}

/**
 * Append one dated bullet to the vault's `log.md` summarising a managed-note
 * write. Shared by the architect and antipatterns scaffolds so every scan
 * records the same created/updated/unchanged + commit shape.
 */
export async function appendOperationLog(options: OperationLogOptions): Promise<OperationLogResult> {
  const file = path.join(options.vault, "log.md");
  const entry = `- ${options.summary} (${changeSummary(options.changes)}; commit ${options.commit})`;
  const current = await readTextIfPresent(file);
  await writeText(file, appendDatedLogEntry(current, options.date, entry));
  return { file: toVaultPath(path.relative(options.vault, file)), entry };
}

function changeSummary(changes: ManagedNoteResult[]): string {
  const created = countByStatus(changes, "created");
  const updated = countByStatus(changes, "updated");
  const unchanged = countByStatus(changes, "unchanged");
  return `${created} created, ${updated} updated, ${unchanged} unchanged`;
}

function countByStatus(changes: ManagedNoteResult[], status: ManagedNoteStatus): number {
  return changes.filter((change) => change.status === status).length;
}

/** Insert `entry` under a `## <date>` heading, creating the log or heading as needed. */
export function appendDatedLogEntry(current: string, date: string, entry: string): string {
  if (current.trim().length === 0) {
    return `# Operation Log\n\n## ${date}\n\n${entry}\n`;
  }

  const heading = `## ${date}`;
  const headingIndex = current.indexOf(heading);
  if (headingIndex < 0) {
    return `${current.trimEnd()}\n\n${heading}\n\n${entry}\n`;
  }

  const insertAt = nextHeadingIndex(current, headingIndex + heading.length);
  const before = current.slice(0, insertAt).trimEnd();
  const after = current.slice(insertAt);
  return `${before}\n${entry}\n${after}`;
}

function nextHeadingIndex(content: string, from: number): number {
  const match = /\n## \d{4}-\d{2}-\d{2}\b/.exec(content.slice(from));
  return match === null ? content.length : from + match.index;
}
