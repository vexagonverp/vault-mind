import path from "node:path";
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

const DEFAULT_SKIP_DIRS = new Set([
  ".git",
  ".agents",
  ".codex",
  ".antigravity",
  ".obsidian",
  ".trash",
  "_trash",
  "node_modules",
  "dist",
]);

export async function ensureCleanDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

export async function writeGeneratedBlock(file: string, id: string, text: string): Promise<void> {
  const start = `<!-- vault-mind:${id}:start -->`;
  const end = `<!-- vault-mind:${id}:end -->`;
  const block = `${start}\n${text.trimEnd()}\n${end}\n`;
  const current = await readTextIfPresent(file);
  const existingBlock = new RegExp(
    `${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`,
  );
  const next = existingBlock.test(current)
    ? current.replace(existingBlock, () => block)
    : appendBlock(current, block);

  await writeText(file, next);
}

export async function ensureMarkdownFrontmatter(file: string, text: string): Promise<void> {
  const current = await readTextIfPresent(file);
  if (current.startsWith("---\n")) {
    return;
  }

  const next = current.trim().length === 0
    ? `${text.trimEnd()}\n`
    : `${text.trimEnd()}\n\n${current.trimStart()}`;
  await writeText(file, next);
}

export async function writeText(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

export async function readText(file: string): Promise<string> {
  return readFile(file, "utf8");
}

export async function copyTree(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

export async function listMarkdownFiles(
  root: string,
  options: { skipDirs?: Set<string> } = {},
): Promise<string[]> {
  const skipDirs = options.skipDirs ?? DEFAULT_SKIP_DIRS;
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          await walk(full);
        }
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(full);
      }
    }
  }

  await walk(root);
  files.sort();
  return files;
}

export async function readTextIfPresent(file: string): Promise<string> {
  try {
    return await readText(file);
  } catch (error) {
    if (isFileNotFound(error)) {
      return "";
    }
    throw error;
  }
}

function appendBlock(current: string, block: string): string {
  if (current.trim().length === 0) {
    return block;
  }
  return `${current.trimEnd()}\n\n${block}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function toVaultPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
