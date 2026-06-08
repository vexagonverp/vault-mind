import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writePath } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run `git -C <root> <args>` against a test repo. */
export async function git(root: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", root, ...args]);
}

/** Initialise an empty git repository at `root`. */
export async function initGitRepo(root: string): Promise<void> {
  await git(root, ["init"]);
}

/** Write `files` then commit them with a fixed, deterministic test identity. */
export async function gitCommit(
  root: string,
  message: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    await writePath(root, file, content);
  }
  await git(root, ["add", "-A"]);
  await git(root, [
    "-c", "user.email=t@example.com",
    "-c", "user.name=Test",
    "-c", "commit.gpgsign=false",
    "commit", "-m", message,
  ]);
}
