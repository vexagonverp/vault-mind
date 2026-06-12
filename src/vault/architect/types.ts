import type { GitInfo } from "../../core/git.js";
import type { ManagedNoteResult } from "../../core/managed-notes.js";
import type { OperationLogResult } from "../../core/operation-log.js";

export interface ArchitectureManifest {
  root: string;
  name: string;
  slug: string;
  title: string;
  kind: string | undefined;
  scanSource: "git" | "filesystem";
  filesScanned: number;
  sourceRoots: string[];
  languages: Array<{ language: string; files: number; pct: number }>;
  modules: Array<{
    name: string;
    path: string;
    sourceFiles: number;
    roleHint: "core" | "support";
  }>;
  dependencies: string[];
  entryPoints: string[];
  manifestFiles: string[];
  docs: string[];
  configFiles: string[];
  workflows: string[];
  candidateEntryFiles: Array<{
    path: string;
    reason: string;
  }>;
  candidateArchitectureNotes: Array<{
    title: string;
    why: string;
    startFiles: string[];
  }>;
  signals: {
    dockerfile: boolean;
    makefile: boolean;
    ci: boolean;
  };
  git: GitInfo | undefined;
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
  operationLog: OperationLogResult;
  changes: ManagedNoteResult[];
}
