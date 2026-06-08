export interface CommandSpec {
  name: string;
  file: string;
  description: string;
  category: string;
  triggersEn: string[];
  body: string;
  raw: string;
}

export interface HealthIssue {
  type:
    | "duplicate"
    | "orphan"
    | "stale_task"
    | "missing_frontmatter"
    | "empty_folder"
    | "broken_link"
    | "template_leftover";
  severity: "error" | "warning" | "info";
  message: string;
  files: string[];
  due?: string;
}

export interface HealthResult {
  vault: string;
  scanned: string;
  totalNotes: number;
  totalIssues: number;
  counts: Record<string, number>;
  issues: HealthIssue[];
}

export interface ReviewIssue {
  type:
    | "unfilled_agent_block"
    | "missing_evidence"
    | "broken_evidence_path";
  severity: "error" | "warning" | "info";
  message: string;
  files: string[];
}

export interface ReviewResult {
  vault: string;
  scanned: string;
  notesReviewed: number;
  totalIssues: number;
  counts: Record<string, number>;
  issues: ReviewIssue[];
}
