import { expect, test } from "vitest";
import { expectPathExists, readPath, tempDir } from "../../../test/helpers.js";
import { initVault } from "../index.js";

test("initVault creates only the minimal base files without overwriting", async () => {
  const root = await tempDir("vaultmind-init-");

  const first = await initVault(root);
  const second = await initVault(root);

  expect(first.created).toEqual(["index.md", "log.md"]);
  expect(second.skipped).toEqual(["index.md", "log.md"]);
  await expectPathExists(root, "index.md");
  await expectPathExists(root, "log.md");
  expect(await readPath(root, "index.md")).not.toContain("SOUL");
});
