import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { expect } from "vitest";

export function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export function tempVault(prefix = "vaultmind-"): Promise<string> {
  return tempDir(prefix);
}

export async function writeNotes(root: string, notes: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(notes).map(([file, content]) => writePath(root, file, content)));
}

export async function readPath(root: string, file: string): Promise<string> {
  return readFile(rootPath(root, file), "utf8");
}

export async function writePath(root: string, file: string, content: string): Promise<void> {
  const target = rootPath(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

export async function expectPathExists(root: string, file: string): Promise<void> {
  await expect(access(rootPath(root, file))).resolves.toBeUndefined();
}

export function expectContainsAll(text: string, snippets: string[]): void {
  for (const snippet of snippets) {
    expect(text).toContain(snippet);
  }
}

export function rootPath(root: string, file: string): string {
  return path.join(root, ...file.split("/"));
}
