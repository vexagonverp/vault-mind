import os from "node:os";
import path from "node:path";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { initVault } from "../init.js";

test("initVault creates only the minimal base files without overwriting", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vaultmind-init-"));

  const first = await initVault(root);
  const second = await initVault(root);

  expect(first.created).toEqual(["index.md", "log.md"]);
  expect(second.skipped).toEqual(["index.md", "log.md"]);
  await expect(access(vaultFile(root, "index.md"))).resolves.toBeUndefined();
  await expect(access(vaultFile(root, "log.md"))).resolves.toBeUndefined();
  expect(await readFile(vaultFile(root, "index.md"), "utf8")).not.toContain("SOUL");
});

function vaultFile(root: string, file: string): string {
  return path.join(root, file);
}
