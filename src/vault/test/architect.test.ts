import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { scanCodebase, writeArchitectureNotes } from "../architect.js";

test("scanCodebase detects node manifest and source modules", async () => {
  const repo = await tempRepo();
  await writePackage(repo, {
    name: "sample-app",
    scripts: { build: "tsc" },
    dependencies: { commander: "^1.0.0" },
  });
  await writeSource(repo, "src/core/index.ts");
  await writeSource(repo, "src/test/index.ts");

  const manifest = await scanCodebase(repo);

  expect(manifest.name).toBe("sample-app");
  expect(manifest.slug).toBe("sample-app");
  expect(manifest.title).toBe("Sample App");
  expect(manifest.kind).toBe("node");
  expect(manifest.dependencies).toEqual(["commander"]);
  expect(manifest.modules.map((item) => item.name)).toContain("core");
  expect(manifest.modules.find((item) => item.name === "test")?.roleHint).toBe("support");
});

test("scanCodebase looks through nested app/src roots", async () => {
  const repo = await tempRepo();
  await writePackage(repo, { name: "nested-service" });
  await writeSource(repo, "app/src/handlers/index.ts");
  await writeSource(repo, "app/src/model/index.ts");

  const manifest = await scanCodebase(repo);
  const modules = manifest.modules.map((item) => [item.name, item.path]);

  expect(modules).toContainEqual(["handlers", "app/src/handlers"]);
  expect(modules).toContainEqual(["model", "app/src/model"]);
  expect(modules).not.toContainEqual(["src", "app/src"]);
});

test("writeArchitectureNotes writes sentinel-safe notes into the vault", async () => {
  const repo = await tempRepo();
  const vault = await mkdtemp(path.join(os.tmpdir(), "vaultmind-vault-"));
  await writePackage(repo, { name: "sample-app" });
  await writeSource(repo, "src/cli/index.ts");

  const result = await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });

  expect(result.written).toContain("Architecture/sample-app/Sample App - Overview.md");
  expect(result.written).toContain("Architecture/sample-app/Sample App - Scan facts.md");
  const overview = await vaultNote(vault, "Overview");
  const scanFacts = await vaultNote(vault, "Scan facts");
  const decisions = await vaultNote(vault, "Key decisions");
  expect(overview).toContain("<!-- @generated:start -->");
  expect(overview).toContain("<!-- @agent:start -->");
  expect(overview).toContain("## Agent notes");
  expect(overview).toContain("Evidence:");
  expect(overview).toContain("confidence:");
  expect(overview).toContain("focused sibling architecture notes");
  expect(overview).toContain("<!-- @user:start -->");
  expect(overview).toContain("[[Sample App - Scan facts]]");
  expect(overview).toContain("[[Sample App - Key decisions]]");
  expect(scanFacts).toContain("## Source Areas");
  expect(scanFacts).toContain("src/cli");
  expect(result.written).not.toContain("Architecture/sample-app/Sample App - Cli.md");
  expect(decisions).toContain("[[Sample App - Overview]]");
  expect(decisions).toContain("[[Sample App - Scan facts]]");
});

test("writeArchitectureNotes links existing sibling architecture notes", async () => {
  const repo = await tempRepo();
  const vault = await mkdtemp(path.join(os.tmpdir(), "vaultmind-vault-"));
  await writePackage(repo, { name: "sample-app" });
  await writeSource(repo, "src/cli/index.ts");
  await writeVaultNote(vault, "Runtime");

  await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });

  expect(await vaultNote(vault, "Overview")).toContain("[[Sample App - Runtime]]");
});

function tempRepo(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "vaultmind-repo-"));
}

async function writePackage(repo: string, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(repo, "package.json"), JSON.stringify(manifest), "utf8");
}

async function writeSource(repo: string, file: string): Promise<void> {
  const fullPath = path.join(repo, file);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, "export const ok = true;\n", "utf8");
}

function vaultNote(vault: string, suffix: string): Promise<string> {
  return readFile(
    path.join(vault, "Architecture", "sample-app", `Sample App - ${suffix}.md`),
    "utf8",
  );
}

async function writeVaultNote(vault: string, suffix: string): Promise<void> {
  const file = path.join(vault, "Architecture", "sample-app", `Sample App - ${suffix}.md`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "# Existing note\n", "utf8");
}
