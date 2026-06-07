import { beforeEach, describe, expect, test, vi } from "vitest";
import { expectContainsAll, readPath, tempDir, tempVault, writePath } from "../../../test/helpers.js";
import { scanCodebase } from "../scan.js";
import { writeArchitectureNotes } from "../write.js";
import type { ArchitectureManifest, ArchitectResult } from "../types.js";

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
    const operationLog = await readPath(vault, "log.md");

    expect(mockScanCodebase).toHaveBeenCalledWith(repo, { repoPath: repo, vaultPath: vault });
    expect(changedFiles(result)).toContain("Architecture/sample-app/Sample App - Overview.md");
    expect(changedFiles(result)).toContain("Architecture/sample-app/Sample App - Scan facts.md");
    expect(changedFiles(result)).not.toContain("Architecture/sample-app/Sample App - Cli.md");
    expect(result.operationLog).toMatchObject({
      file: "log.md",
      entry: expect.stringContaining("[[Sample App - Overview]]"),
    });
    expect(changeStatuses(result)).toEqual(["created", "created", "created"]);
    expectContainsAll(overview, [
      'scanned-commit: "abc123"',
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
    expectContainsAll(operationLog, [
      "# Operation Log",
      "architecture refresh: [[Sample App - Overview]]",
      "3 created, 0 updated, 0 unchanged",
      "commit abc123",
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

  test("reports refreshes and only writes generated blocks whose facts changed", async () => {
    const repo = await tempDir("vaultmind-repo-");
    const vault = await tempVault();
    mockScanCodebase.mockResolvedValue(sampleManifest(repo));

    await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });

    const unchanged = await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });
    const logAfterUnchangedRefresh = await readPath(vault, "log.md");
    expect(changedFiles(unchanged)).toEqual([]);
    expect(unchangedFiles(unchanged)).toEqual([
      "Architecture/sample-app/Sample App - Overview.md",
      "Architecture/sample-app/Sample App - Scan facts.md",
      "Architecture/sample-app/Sample App - Key decisions.md",
    ]);
    expect(changeStatuses(unchanged)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(logAfterUnchangedRefresh.match(/architecture refresh:/g)).toHaveLength(2);
    expect(logAfterUnchangedRefresh).toContain("0 created, 0 updated, 3 unchanged");

    mockScanCodebase.mockResolvedValue(sampleManifest(repo, {
      dependencies: ["commander", "zod"],
    }));

    const refreshed = await writeArchitectureNotes({ repoPath: repo, vaultPath: vault });
    expect(changedFiles(refreshed)).toEqual(["Architecture/sample-app/Sample App - Scan facts.md"]);
    expect(unchangedFiles(refreshed)).toEqual([
      "Architecture/sample-app/Sample App - Overview.md",
      "Architecture/sample-app/Sample App - Key decisions.md",
    ]);
    expect(refreshed.changes.find((change) =>
      change.file.endsWith("Scan facts.md")
    )).toMatchObject({
      status: "updated",
      generatedChanged: true,
      frontmatterChanged: false,
    });
  });
});

function sampleManifest(
  root: string,
  overrides: Partial<ArchitectureManifest> = {},
): ArchitectureManifest {
  const manifest: ArchitectureManifest = {
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
  return { ...manifest, ...overrides };
}

async function vaultNote(vault: string, suffix: string): Promise<string> {
  return readPath(vault, `Architecture/sample-app/Sample App - ${suffix}.md`);
}

async function writeVaultNote(vault: string, suffix: string): Promise<void> {
  await writePath(vault, `Architecture/sample-app/Sample App - ${suffix}.md`, "# Existing note\n");
}

function changeStatuses(result: ArchitectResult): ArchitectResult["changes"][number]["status"][] {
  return result.changes.map((change) => change.status);
}

function changedFiles(result: ArchitectResult): string[] {
  return result.changes.filter((c) => c.status !== "unchanged").map((c) => c.file);
}

function unchangedFiles(result: ArchitectResult): string[] {
  return result.changes.filter((c) => c.status === "unchanged").map((c) => c.file);
}
