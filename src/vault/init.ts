import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export interface InitVaultResult {
  vault: string;
  created: string[];
  skipped: string[];
}

export async function initVault(vaultPath: string): Promise<InitVaultResult> {
  const vault = path.resolve(vaultPath);
  const created: string[] = [];
  const skipped: string[] = [];
  await mkdir(vault, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const files = new Map<string, string>([
    ["index.md", renderIndex(today)],
    ["log.md", renderLog(today)],
  ]);

  for (const [relativePath, content] of files) {
    const status = await writeIfMissing(path.join(vault, relativePath), content);
    (status === "created" ? created : skipped).push(relativePath);
  }

  return { vault, created, skipped };
}

async function writeIfMissing(file: string, content: string): Promise<"created" | "skipped"> {
  try {
    await writeFile(file, content, { encoding: "utf8", flag: "wx" });
    return "created";
  } catch (error) {
    if (isFileExists(error)) {
      return "skipped";
    }
    throw error;
  }
}

function renderIndex(today: string): string {
  return `---
date: ${today}
type: index
tags: [index]
ai-first: true
---

## For future agent
This is the vault's minimal index. Read it before broad searching, and keep it
current when creating durable notes.

# Vault Index

## Core

- [[log]] - append-only operation log

## Notes

Add links here as the vault grows.
`;
}

function renderLog(today: string): string {
  return `---
date: ${today}
type: log
tags: [log]
ai-first: true
---

## For future agent
This is the append-only operation log for the vault. Add one dated entry for
every meaningful vault write, import, health check, or architecture refresh.

# Operation Log

## ${today}

- vault initialized
`;
}

function isFileExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
