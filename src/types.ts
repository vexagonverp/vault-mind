export interface CommandSpec {
  name: string;
  file: string;
  description: string;
  category: string;
  exclude: string[];
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
