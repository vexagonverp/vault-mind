import { describe, expect, test } from "vitest";
import { tempDir, writePath } from "../../../test/helpers.js";
import { initGitRepo } from "../../../test/git.js";
import { scanCodebase } from "../scan.js";
import type { ArchitectureManifest } from "../types.js";

describe("scanCodebase", () => {
  test("detects node manifest and source modules", async () => {
    const repo = await createRepo();
    await repo.writePackage({
      name: "sample-app",
      scripts: { build: "tsc" },
      dependencies: { commander: "^1.0.0" },
    });
    await repo.writeSource("src/core/index.ts");
    await repo.writeSource("src/test/index.ts");

    const manifest = await repo.scan();

    expect(manifest).toMatchObject({
      name: "sample-app",
      slug: "sample-app",
      title: "Sample App",
      kind: "node",
      dependencies: ["commander"],
    });
    expect(moduleNames(manifest)).toContain("core");
    expect(moduleRole(manifest, "test")).toBe("support");
  });

  test("looks through nested app/src roots", async () => {
    const repo = await createRepo();
    await repo.writePackage({ name: "nested-service" });
    await repo.writeSource("app/src/handlers/index.ts");
    await repo.writeSource("app/src/model/index.ts");

    const manifest = await repo.scan();
    const modules = modulePaths(manifest);

    expect(modules).toContainEqual(["handlers", "app/src/handlers"]);
    expect(modules).toContainEqual(["model", "app/src/model"]);
    expect(modules).not.toContainEqual(["src", "app/src"]);
  });

  test("ignores gitignored generated artifacts", async () => {
    const repo = await createRepo();
    await repo.writeFile(".gitignore", "cdk.out/\n");
    await repo.writePackage({
      name: "generated-heavy-app",
      scripts: {
        "________________________________:group________________________________": "echo 'group'",
        build: "tsc",
      },
    });
    await repo.writeSource("src/app.ts");
    await repo.writeSource("cdk.out/asset/generated.js");
    await repo.initGit();

    const manifest = await repo.scan();

    expect(manifest.scanSource).toBe("git");
    expect(manifest.filesScanned).toBeGreaterThan(0);
    expect(manifest.entryPoints).toEqual(["build"]);
    expect(languageFiles(manifest, "JavaScript")).toBeUndefined();
    expect(languageFiles(manifest, "TypeScript")).toBe(1);
  });

  test("does not treat config-only script references as entry files", async () => {
    const repo = await createRepo();
    await repo.writePackage({
      name: "config-script-app",
      scripts: {
        build: "tsc -p tsconfig.build.json",
        start: "node dist/cli.js",
      },
    });
    await repo.writeSource("src/cli.ts");
    await repo.writeFile("tsconfig.build.json", "{}");

    const manifest = await repo.scan();

    expect(entryPaths(manifest)).toContain("src/cli.ts");
    expect(entryPaths(manifest)).not.toContain("tsconfig.build.json");
    expect(noteTitles(manifest)).toContain("Runtime flow");
  });
});

interface TestRepo {
  initGit: () => Promise<void>;
  scan: () => Promise<ArchitectureManifest>;
  writeFile: (file: string, content: string) => Promise<void>;
  writePackage: (manifest: Record<string, unknown>) => Promise<void>;
  writeSource: (file: string) => Promise<void>;
}

async function createRepo(): Promise<TestRepo> {
  const root = await tempDir("vaultmind-repo-");
  return {
    initGit: () => initGitRepo(root),
    scan: () => scanCodebase(root),
    writeFile: (file, content) => writePath(root, file, content),
    writePackage: (manifest) => writePath(root, "package.json", JSON.stringify(manifest)),
    writeSource: (file) => writePath(root, file, "export const ok = true;\n"),
  };
}

function moduleNames(manifest: ArchitectureManifest): string[] {
  return manifest.modules.map((module) => module.name);
}

function modulePaths(manifest: ArchitectureManifest): Array<[string, string]> {
  return manifest.modules.map((module) => [module.name, module.path]);
}

function moduleRole(manifest: ArchitectureManifest, name: string): string | undefined {
  return manifest.modules.find((module) => module.name === name)?.roleHint;
}

function languageFiles(manifest: ArchitectureManifest, language: string): number | undefined {
  return manifest.languages.find((item) => item.language === language)?.files;
}

function entryPaths(manifest: ArchitectureManifest): string[] {
  return manifest.candidateEntryFiles.map((file) => file.path);
}

function noteTitles(manifest: ArchitectureManifest): string[] {
  return manifest.candidateArchitectureNotes.map((note) => note.title);
}
