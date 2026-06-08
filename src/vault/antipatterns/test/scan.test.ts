import { describe, expect, test } from "vitest";
import { tempDir, writePath } from "../../../test/helpers.js";
import { gitCommit, initGitRepo } from "../../../test/git.js";
import { scanAntipatterns } from "../scan.js";

describe("scanAntipatterns", () => {
  test("ranks hotspots, fix-prone files, and remediation commits from history", async () => {
    const root = await tempDir("vaultmind-ap-repo-");
    await initGitRepo(root);
    await gitCommit(root, "feat: add handler", { "src/handler.ts": "v1\n", "src/util.ts": "u1\n" });
    await gitCommit(root, "fix: handler null check", { "src/handler.ts": "v2\n" });
    await gitCommit(root, "hotfix: handler crash in prod", { "src/handler.ts": "v3\n" });
    await gitCommit(root, "revert: handler change broke search", { "src/handler.ts": "v4\n" });
    await gitCommit(root, "docs: tidy readme", { "README.md": "readme\n" });

    const signals = await scanAntipatterns(root);

    expect(signals.scanSource).toBe("git");
    expect(signals.commitsScanned).toBe(5);
    expect(signals.hotspotFiles[0]).toEqual({ path: "src/handler.ts", commits: 4 });
    expect(signals.fixProneFiles[0]).toEqual({ path: "src/handler.ts", fixCommits: 3 });
    expect(signals.remediationCommits.map((c) => c.subject)).toEqual([
      "revert: handler change broke search",
      "hotfix: handler crash in prod",
    ]);
    expect(signals.git?.commit).toMatch(/^[0-9a-f]{7,}$/);
  });

  test("returns an empty scan for a non-git directory", async () => {
    const root = await tempDir("vaultmind-ap-nogit-");
    await writePath(root, "src/app.ts", "x\n");

    const signals = await scanAntipatterns(root);

    expect(signals.scanSource).toBe("none");
    expect(signals.commitsScanned).toBe(0);
    expect(signals.hotspotFiles).toEqual([]);
    expect(signals.git).toBeUndefined();
  });
});
