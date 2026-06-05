import os from "node:os";
import path from "node:path";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { buildPlatform } from "../../build.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("codex build emits a repo skill instead of private command folders", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-codex-"));

  await buildPlatform({ repoRoot, platform: "codex-cli", outDir });

  const agents = await read(outDir, "AGENTS.md");
  expect(agents).toMatch(/^---\n/);
  expectContainsAll(agents, [
    "type: agent-guidance",
    ".agents/skills/vault-mind/SKILL.md",
    "not Codex slash",
    "$vault-mind-obsidian-health",
  ]);

  await expectPath(outDir, ".agents/skills/vault-mind/SKILL.md");
  expect(await read(outDir, ".agents/skills/vault-mind/SKILL.md")).toContain("not slash commands");
  await expectPath(outDir, ".agents/skills/vault-mind/commands/obsidian-health.md");
  expect(await read(outDir, ".agents/skills/vault-mind-obsidian-health/SKILL.md"))
    .toContain("Vault Mind Workflow: obsidian-health");
  expect(await read(outDir, ".agents/skills/vault-mind/references/ai-first-rules.md"))
    .not.toContain("[[wikilinks]]");
  expect(await read(outDir, ".agents/skills/vault-mind/references/ai-first-rules.md"))
    .toContain("Do not create phantom graph nodes");
});

test("gemini build configures AGENTS.md and emits command files", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-gemini-"));

  await buildPlatform({ repoRoot, platform: "gemini-cli", outDir });

  const agents = await read(outDir, "AGENTS.md");
  expectContainsAll(agents, [
    "vault-mind:gemini:start",
    "run it instead of hand-writing",
    "vault-mind-obsidian-architect",
  ]);
  expectContainsAll(await read(outDir, ".gemini/commands/vault-mind-obsidian-architect.md"), [
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
  expect(await read(outDir, ".gemini/settings.json")).toContain('"fileName": [');
  await expectPath(outDir, ".gemini/commands/vault-mind-obsidian-health.md");
  await expectMissingPath(outDir, ".gemini/commands/obsidian-health.md");
  for (const workflow of ["architect", "health", "init"]) {
    expect(await read(outDir, `.gemini/commands/vault-mind-obsidian-${workflow}.md`))
      .toContain("False absence is the most common failure mode");
  }
});

test("build preserves existing vault files", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-existing-"));
  const note = path.join(outDir, "Personal.md");
  const agents = path.join(outDir, "AGENTS.md");
  const gemini = path.join(outDir, "GEMINI.md");

  await writeFile(note, "# Personal\n", "utf8");
  await writeFile(agents, "# Existing Codex Notes\n", "utf8");
  await writeFile(gemini, "# Existing Gemini Notes\n", "utf8");

  await buildPlatform({ repoRoot, platform: "codex-cli", outDir });
  await buildPlatform({ repoRoot, platform: "gemini-cli", outDir });

  expect(await readFile(note, "utf8")).toBe("# Personal\n");
  expectContainsAll(await readFile(agents, "utf8"), [
    "# Existing Codex Notes",
    "vault-mind:codex:start",
    "vault-mind:gemini:start",
  ]);
  expect(await readFile(gemini, "utf8")).toContain("# Existing Gemini Notes");
});

test("build replaces generated blocks without expanding dollar replacement tokens", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "vaultmind-rebuild-"));

  await buildPlatform({ repoRoot, platform: "codex-cli", outDir });
  await buildPlatform({ repoRoot, platform: "codex-cli", outDir });

  const agents = await read(outDir, "AGENTS.md");
  expect(agents).toContain("Codex's `$` skill picker");
  expect(agents.match(/^---$/gm)).toHaveLength(2);
});

async function read(root: string, file: string): Promise<string> {
  return readFile(path.join(root, ...file.split("/")), "utf8");
}

async function expectPath(root: string, file: string): Promise<void> {
  await expect(access(path.join(root, ...file.split("/")))).resolves.toBeUndefined();
}

async function expectMissingPath(root: string, file: string): Promise<void> {
  await expect(access(path.join(root, ...file.split("/")))).rejects.toThrow();
}

function expectContainsAll(text: string, values: string[]): void {
  for (const value of values) {
    expect(text).toContain(value);
  }
}
