import path from "node:path";
import { expect, test } from "vitest";
import { buildVault } from "../../build.js";
import {
  expectContainsAll,
  expectPathExists,
  readPath,
  tempDir,
  writePath,
} from "../../test/helpers.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("build emits umbrella skill and per-workflow skills", async () => {
  const outDir = await tempDir("vaultmind-build-");

  await buildVault({ repoRoot, outDir });

  const agents = await readPath(outDir, "AGENTS.md");
  expect(agents).toMatch(/^---\n/);
  expectContainsAll(agents, [
    "type: agent-guidance",
    ".agents/skills/vault-mind/SKILL.md",
    "$vault-health",
    "$vault-architect",
  ]);

  await expectPathExists(outDir, ".agents/skills/vault-mind/SKILL.md");
  expect(await readPath(outDir, ".agents/skills/vault-mind/SKILL.md")).toContain("not slash commands");
  await expectPathExists(outDir, ".agents/skills/vault-mind/commands/health.md");
  expect(await readPath(outDir, ".agents/skills/vault-health/SKILL.md"))
    .toContain("Vault Mind Workflow: health");
  expect(await readPath(outDir, ".agents/skills/vault-mind/references/ai-first-rules.md"))
    .not.toContain("[[wikilinks]]");
  expect(await readPath(outDir, ".agents/skills/vault-mind/references/ai-first-rules.md"))
    .toContain("Do not create phantom graph nodes");
});

test("build writes architect workflow skill with required sections", async () => {
  const outDir = await tempDir("vaultmind-architect-");

  await buildVault({ repoRoot, outDir });

  expectContainsAll(await readPath(outDir, ".agents/skills/vault-architect/SKILL.md"), [
    "## For future agent",
    "Do not hand-write",
    "Add agent analysis only inside `@agent`",
    "## 5. Document Source-Backed Findings",
    "Module note policy",
    "Do not create one note per folder automatically",
    "A generic stack summary is not enough",
    "Useful graph node candidates",
    "Bad graph nodes",
    "## 6. Anti-Fabrication Rules",
    "## 7. Refresh Behavior",
    "scanned-commit",
    "## 8. Search-Completeness Rules",
    "## 10. Vault Links And Operation Log",
    "project hub note",
  ]);
  for (const workflow of ["architect", "health", "init"]) {
    expect(await readPath(outDir, `.agents/skills/vault-${workflow}/SKILL.md`))
      .toContain("False absence is the most common failure mode");
  }
});

test("build preserves existing vault files", async () => {
  const outDir = await tempDir("vaultmind-existing-");
  await writePath(outDir, "Personal.md", "# Personal\n");
  await writePath(outDir, "AGENTS.md", "# Existing Notes\n");

  await buildVault({ repoRoot, outDir });

  expect(await readPath(outDir, "Personal.md")).toBe("# Personal\n");
  expectContainsAll(await readPath(outDir, "AGENTS.md"), [
    "# Existing Notes",
    "vault-mind:vault-mind:start",
  ]);
});

test("build replaces generated blocks without expanding dollar replacement tokens", async () => {
  const outDir = await tempDir("vaultmind-rebuild-");

  await buildVault({ repoRoot, outDir });
  await buildVault({ repoRoot, outDir });

  const agents = await readPath(outDir, "AGENTS.md");
  expect(agents).toContain("$vault-mind");
  expect(agents.match(/^---$/gm)).toHaveLength(2);
});
