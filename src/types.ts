export interface CommandSpec {
  name: string;
  file: string;
  description: string;
  category: string;
  triggersEn: string[];
  body: string;
  raw: string;
}

/** One checkable problem surfaced by a vault scan. */
export interface Issue<T extends string> {
  type: T;
  severity: "error" | "warning" | "info";
  message: string;
  files: string[];
}

/** Shared shape of a vault scan report; `counts` keys are human-readable labels. */
export interface IssueReport<I> {
  vault: string;
  scanned: string;
  totalIssues: number;
  counts: Record<string, number>;
  issues: I[];
}

export type HealthIssue = Issue<
  | "duplicate"
  | "orphan"
  | "stale_task"
  | "missing_frontmatter"
  | "empty_folder"
  | "broken_link"
  | "template_leftover"
> & { due?: string };

export interface HealthResult extends IssueReport<HealthIssue> {
  totalNotes: number;
}

export type ReviewIssue = Issue<
  | "unfilled_agent_block"
  | "missing_evidence"
  | "broken_evidence_path"
>;

export interface ReviewResult extends IssueReport<ReviewIssue> {
  notesReviewed: number;
}
