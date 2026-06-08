import { beforeEach, describe, expect, test, vi } from "vitest";
import { expectContainsAll, readPath, tempDir, tempVault } from "../../../test/helpers.js";
import { scanAntipatterns } from "../scan.js";
import { writeAntipatternNotes } from "../write.js";
import type { AntipatternSignals } from "../types.js";

vi.mock("../scan.js", () => ({
  scanAntipatterns: vi.fn(),
}));

const mockScan = vi.mocked(scanAntipatterns);

describe("writeAntipatternNotes", () => {
  beforeEach(() => {
    mockScan.mockReset();
  });

  test("writes a sentinel-safe note with signals and an empty agent block", async () => {
    const repo = await tempDir("vaultmind-ap-repo-");
    const vault = await tempVault();
    mockScan.mockResolvedValue(sampleSignals(repo));

    const result = await writeAntipatternNotes({ repoPath: repo, vaultPath: vault });
    const note = await readPath(vault, "Anti-patterns/poi/POI - Anti-patterns.md");
    const log = await readPath(vault, "log.md");

    expect(result.changes[0]).toMatchObject({
      status: "created",
      file: "Anti-patterns/poi/POI - Anti-patterns.md",
    });
    expectContainsAll(note, [
      "type: antipatterns",
      'scanned-commit: "abc123"',
      "## Change Hotspots",
      "src/handler.ts (9 commits)",
      "## Fix-Prone Files",
      "src/handler.ts (5 fix commits)",
      "## Remediation Commits",
      "deadbee revert: broke search",
      "<!-- @agent:start -->",
      "Add source-backed findings here",
      "<!-- @user:start -->",
    ]);
    expectContainsAll(log, [
      "# Operation Log",
      "anti-pattern scan: [[POI - Anti-patterns]]",
      "commit abc123",
    ]);
  });

  test("reports an unchanged note on a second run with identical signals", async () => {
    const repo = await tempDir("vaultmind-ap-repo-");
    const vault = await tempVault();
    mockScan.mockResolvedValue(sampleSignals(repo));

    await writeAntipatternNotes({ repoPath: repo, vaultPath: vault });
    const second = await writeAntipatternNotes({ repoPath: repo, vaultPath: vault });

    expect(second.changes[0]?.status).toBe("unchanged");
  });
});

function sampleSignals(root: string): AntipatternSignals {
  return {
    root,
    name: "poi",
    slug: "poi",
    title: "POI",
    scanSource: "git",
    commitsScanned: 12,
    hotspotFiles: [{ path: "src/handler.ts", commits: 9 }],
    fixProneFiles: [{ path: "src/handler.ts", fixCommits: 5 }],
    remediationCommits: [{ hash: "deadbee", subject: "revert: broke search" }],
    git: { commit: "abc123", dirty: false },
  };
}
