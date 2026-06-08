import { expect, test } from "vitest";
import { rootPath, tempVault, writeNotes, writePath } from "../../../test/helpers.js";
import { reviewVault } from "../index.js";

function note(repoRoot: string, agentBody: string): string {
  return `---
type: architecture-overview
source-repo: ${JSON.stringify(repoRoot)}
---

## For future agent
Demo note.

<!-- @generated:start -->
deterministic scan facts
<!-- @generated:end -->

<!-- @agent:start -->
## Agent notes

${agentBody}
<!-- @agent:end -->
<!-- @user:start -->
## User notes
<!-- @user:end -->
`;
}

test("review passes a filled agent block with valid evidence", async () => {
  const root = await tempVault();
  await writePath(root, "repo/src/app.ts", "export const x = 1;\n");
  const repoRoot = rootPath(root, "repo");
  await writeNotes(root, {
    "Architecture/demo/Demo - Overview.md": note(
      repoRoot,
      "- Boots through the CLI entry point. Evidence: `src/app.ts:1`; confidence: high",
    ),
  });

  const result = await reviewVault(root);

  expect(result.notesReviewed).toBe(1);
  expect(result.totalIssues).toBe(0);
});

test("review flags unfilled, unbacked, and broken-evidence agent blocks", async () => {
  const root = await tempVault("vaultmind-review-issues-");
  await writePath(root, "repo/src/app.ts", "export const x = 1;\n");
  const repoRoot = rootPath(root, "repo");
  await writeNotes(root, {
    "Architecture/a/A - Overview.md": note(
      repoRoot,
      "Add source-backed findings here. Important claims need `Evidence:` and `confidence:` markers.",
    ),
    "Architecture/b/B - Overview.md": note(
      repoRoot,
      "- The service reads from DynamoDB on startup.",
    ),
    "Architecture/c/C - Overview.md": note(
      repoRoot,
      "- Boots through the entry point. Evidence: `src/missing.ts:3`; confidence: high",
    ),
  });

  const result = await reviewVault(root);
  const types = result.issues.map((issue) => issue.type);

  expect(result.notesReviewed).toBe(3);
  expect(types).toContain("unfilled_agent_block");
  expect(types).toContain("missing_evidence");
  expect(types).toContain("broken_evidence_path");
});

test("review does not treat git ranges or URLs as evidence paths", async () => {
  const root = await tempVault("vaultmind-review-nonpath-");
  await writePath(root, "repo/src/app.ts", "export const x = 1;\n");
  const repoRoot = rootPath(root, "repo");
  await writeNotes(root, {
    "Architecture/d/D - Overview.md": note(
      repoRoot,
      "- Recent churn in the entry path. Evidence: `51c8bd47..HEAD`, https://example.com/pr/1; confidence: medium",
    ),
  });

  const result = await reviewVault(root);

  expect(result.totalIssues).toBe(0);
});

test("review ignores notes without an agent block", async () => {
  const root = await tempVault("vaultmind-review-skip-");
  await writeNotes(root, {
    "index.md": "# Index\n\nNo agent block here.\n",
  });

  const result = await reviewVault(root);

  expect(result.notesReviewed).toBe(0);
  expect(result.totalIssues).toBe(0);
});
