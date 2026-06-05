import os from "node:os";
import path from "node:path";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { buildVault } from "../../build.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("build emits umbrella skill and per-workflow skills", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-build-"));

  await buildVault({ repoRoot, outDir });

  const agents = await read(outDir, "AGENTS.md");
  expect(agents).toMatch(/^---\n/);
  expectContainsAll(agents, [
    "type: agent-guidance",
    ".agents/skills/vault-mind/SKILL.md",
    "$vault-health",
    "$vault-architect",
  ]);

  await expectPath(outDir, ".agents/skills/vault-mind/SKILL.md");
  expect(await read(outDir, ".agents/skills/vault-mind/SKILL.md")).toContain("not slash commands");
  await expectPath(outDir, ".agents/skills/vault-mind/commands/health.md");
  expect(await read(outDir, ".agents/skills/vault-health/SKILL.md"))
    .toContain("Vault Mind Workflow: health");
  expect(await read(outDir, ".agents/skills/vault-mind/references/ai-first-rules.md"))
    .not.toContain("[[wikilinks]]");
  expect(await read(outDir, ".agents/skills/vault-mind/references/ai-first-rules.md"))
    .toContain("Do not create phantom graph nodes");
});

test("build writes architect workflow skill with required sections", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-architect-"));

  await buildVault({ repoRoot, outDir });

  expectContainsAll(await read(outDir, ".agents/skills/vault-architect/SKILL.md"), [
    "## For future agent",
    "Do not hand-write",
    "Add agent analysis only inside `@agent`",
    "## 5. Document Source-Backed Findings",
    "A generic stack summary is not enough",
    "Useful graph node candidates",
    "Bad graph nodes",
    "## 6. Anti-Fabrication Rules",
    "## 7. Search-Completeness Rules",
  ]);
  for (const workflow of ["architect", "health", "init"]) {
    expect(await read(outDir, `.agents/skills/vault-${workflow}/SKILL.md`))
      .toContain("False absence is the most common failure mode");
  }
});

test("build preserves existing vault files", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-existing-"));
  const note = path.join(outDir, "Personal.md");
  const agents = path.join(outDir, "AGENTS.md");

  await writeFile(note, "# Personal\n", "utf8");
  await writeFile(agents, "# Existing Notes\n", "utf8");

  await buildVault({ repoRoot, outDir });

  expect(await readFile(note, "utf8")).toBe("# Personal\n");
  expectContainsAll(await readFile(agents, "utf8"), [
    "# Existing Notes",
    "vault-mind:vault-mind:start",
  ]);
});

test("build replaces generated blocks without expanding dollar replacement tokens", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-rebuild-"));

  await buildVault({ repoRoot, outDir });
  await buildVault({ repoRoot, outDir });

  const agents = await read(outDir, "AGENTS.md");
  expect(agents).toContain("$vault-mind");
  expect(agents.match(/^---$/gm)).toHaveLength(2);
});

async function read(root: string, file: string): Promise<string> {
  return readFile(path.join(root, ...file.split("/")), "utf8");
}

async function expectPath(root: string, file: string): Promise<void> {
  await expect(access(path.join(root, ...file.split("/")))).resolves.toBeUndefined();
}

function expectContainsAll(text: string, values: string[]): void {
  for (const value of values) {
    expect(text).toContain(value);
  }
}
