import { beforeEach, describe, expect, test, vi } from "vitest";
import { expectContainsAll, readPath, tempDir, tempVault, writePath } from "../../../test/helpers.js";
import { scanCodebase } from "../scan.js";
import { writeArchitectureNotes } from "../write.js";
import type { ArchitectureManifest } from "../types.js";

vi.mock("../scan.js", () => ({
  scanCodebase: vi.fn(),
}));

const mockScanCodebase = vi.mocked(scanCodebase);

describe("writeArchitectureNotes", () => {
  beforeEach(() => {
    mockScanCodebase.mockReset();
  });

  test("writes sentinel-safe notes into the vault", async () => {
    const repo = await tempDir("vaultmind-repo-");
    const vault = await tempVault();
    mockScanCodebase.mockResolvedValue(sampleManifest(repo));

    const result = await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });
    const overview = await vaultNote(vault, "Overview");
    const scanFacts = await vaultNote(vault, "Scan facts");
    const decisions = await vaultNote(vault, "Key decisions");

    expect(mockScanCodebase).toHaveBeenCalledWith(repo, { repoPath: repo, vaultPath: vault });
    expect(result.written).toContain("Architecture/sample-app/Sample App - Overview.md");
    expect(result.written).toContain("Architecture/sample-app/Sample App - Scan facts.md");
    expect(result.written).not.toContain("Architecture/sample-app/Sample App - Cli.md");
    expectContainsAll(overview, [
      "<!-- @generated:start -->",
      "<!-- @agent:start -->",
      "## Agent notes",
      "Evidence:",
      "confidence:",
      "focused sibling architecture notes",
      "<!-- @user:start -->",
      "[[Sample App - Scan facts]]",
      "[[Sample App - Key decisions]]",
    ]);
    expectContainsAll(scanFacts, [
      "## Source Areas",
      "src/cli",
      "## AI Investigation Map",
      "src/cli/index.ts - common application entry file",
      "Runtime flow",
    ]);
    expectContainsAll(decisions, [
      "[[Sample App - Overview]]",
      "[[Sample App - Scan facts]]",
    ]);
  });

  test("links existing sibling architecture notes", async () => {
    const repo = await tempDir("vaultmind-repo-");
    const vault = await tempVault();
    await writeVaultNote(vault, "Runtime");
    mockScanCodebase.mockResolvedValue(sampleManifest(repo));

    await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });

    expect(await vaultNote(vault, "Overview")).toContain("[[Sample App - Runtime]]");
  });
});

function sampleManifest(root: string): ArchitectureManifest {
  return {
    root,
    name: "sample-app",
    slug: "sample-app",
    title: "Sample App",
    kind: "node",
    scanSource: "filesystem",
    filesScanned: 8,
    sourceRoots: ["src"],
    languages: [{ language: "TypeScript", files: 1, pct: 100 }],
    modules: [{ name: "cli", path: "src/cli", roleHint: "core", sourceFiles: 1 }],
    dependencies: ["commander"],
    entryPoints: ["start"],
    manifestFiles: ["package.json"],
    docs: ["README.md"],
    configFiles: ["tsconfig.json"],
    workflows: [".github/workflows/ci.yml"],
    candidateEntryFiles: [{
      path: "src/cli/index.ts",
      reason: "common application entry file",
    }],
    candidateArchitectureNotes: [{
      title: "Runtime flow",
      why: "Candidate entry files suggest startup, request, render, or command paths.",
      startFiles: ["src/cli/index.ts"],
    }],
    signals: {
      dockerfile: false,
      makefile: false,
      ci: true,
    },
    git: {
      commit: "abc123",
      dirty: false,
    },
  };
}

async function vaultNote(vault: string, suffix: string): Promise<string> {
  return readPath(vault, `Architecture/sample-app/Sample App - ${suffix}.md`);
}

async function writeVaultNote(vault: string, suffix: string): Promise<void> {
  await writePath(vault, `Architecture/sample-app/Sample App - ${suffix}.md`, "# Existing note\n");
}
