import type { ManagedNoteResult } from "../../core/managed-notes.js";

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
  git: { commit: string; dirty: boolean } | undefined;
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
  operationLog: {
    file: string;
    entry: string;
  };
  changes: ManagedNoteResult[];
}
