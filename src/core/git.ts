import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Histories and file listings can be large; size the buffer for big repos.
const MAX_BUFFER = 64 * 1024 * 1024;

export interface GitInfo {
  commit: string;
  dirty: boolean;
}

/** Run `git -C <root> <args>` and return its raw stdout. Throws if git fails. */
export async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

/** Short HEAD commit and dirty flag, or undefined when `root` is not a git repo. */
export async function gitInfo(root: string): Promise<GitInfo | undefined> {
  try {
    const commit = (await git(root, ["rev-parse", "--short", "HEAD"])).trim();
    if (commit.length === 0) {
      return undefined;
    }
    const status = await git(root, ["status", "--porcelain"]);
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return undefined;
  }
}
