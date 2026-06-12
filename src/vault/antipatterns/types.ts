import type { GitInfo } from "../../core/git.js";
import type { ManagedNoteResult } from "../../core/managed-notes.js";
import type { OperationLogResult } from "../../core/operation-log.js";

export interface AntipatternSignals {
  root: string;
  name: string;
  slug: string;
  title: string;
  scanSource: "git" | "none";
  commitsScanned: number;
  // Files touched by the most commits - where change concentrates.
  hotspotFiles: Array<{ path: string; commits: number }>;
  // Files most often touched by remediation commits - where fixes concentrate.
  fixProneFiles: Array<{ path: string; fixCommits: number }>;
  // Notable revert/hotfix/rollback commits - specific incidents to read.
  remediationCommits: Array<{ hash: string; subject: string }>;
  git: GitInfo | undefined;
}

export interface AntipatternOptions {
  maxFiles?: number;
  maxCommits?: number;
}

export interface AntipatternWriteOptions extends AntipatternOptions {
  repoPath: string;
  vaultPath: string;
}

export interface AntipatternResult {
  signals: AntipatternSignals;
  operationLog: OperationLogResult;
  changes: ManagedNoteResult[];
}

export interface PatternExample {
  // Repo label the instance came from.
  repo: string;
  // The `example:` path (as written, e.g. `src/foo.ts:42`).
  path: string;
  // Whether the instance is marked `status: resolved`.
  resolved: boolean;
  // Whether the example path resolves in the repo on disk:
  // true/false when checkable, undefined when the repo is not on disk.
  ok: boolean | undefined;
}

export interface PatternIndexEntry {
  // Pattern name (the stem of its `_patterns/<name>.md` note).
  name: string;
  // Whether a durable `_patterns/<name>.md` note defines this pattern.
  defined: boolean;
  // Status from the pattern note's frontmatter, or "no pattern note".
  status: string;
  // The pattern's one-line rule (first paragraph of its note), or "".
  rule: string;
  // Total instance references across all per-repo notes.
  instances: number;
  // Instance references marked `status: resolved`.
  resolved: number;
  // Distinct repos referencing this pattern.
  repos: string[];
  // One entry per instance reference - the examples to eyeball/verify.
  examples: PatternExample[];
}

export interface AntipatternIndex {
  vault: string;
  patterns: PatternIndexEntry[];
}

export interface AntipatternIndexResult {
  file: string;
  index: AntipatternIndex;
}
