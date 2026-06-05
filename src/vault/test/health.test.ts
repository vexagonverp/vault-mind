import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { runHealthCheck } from "../health.js";

test("health reports a clean linked two-note vault", async () => {
  const root = await tempVault();
  await writeNotes(root, {
    "Home.md": "# Home\n\nSee [[Project Alpha]].\n",
    "Project Alpha.md": `---
type: project
aliases:
  - Project Alpha
---

# Project Alpha

Back to [[Home]].
`,
  });

  const result = await runHealthCheck(root);

  expect(result.totalNotes).toBe(2);
  expect(result.totalIssues).toBe(0);
});

test("health reports structural issues from the richer audit", async () => {
  const root = await tempVault("vaultmind-issues-");
  await mkdir(path.join(root, "Empty"));
  await writeNotes(root, {
    "Project Alpha.md": `---
type: project
aliases:
  - Alpha
---

# Project Alpha

See [[Missing Note]].
`,
    "2000-01-01 Project Alpha.md": `---
type: project
---

# Project Alpha
`,
    "Task.md": `---
type: task
due: 2000-01-01
---

# Task
`,
    "Loose.md": "# Loose\n\nThis note has enough body text to need frontmatter in a real vault.\n",
    "Template Leak.md": `---
type: note
---

# Template Leak

<% tp.date.now() %>
`,
  });

  const result = await runHealthCheck(root, { today: "2000-01-10" });

  expect(result.counts).toMatchObject({
    Duplicates: 1,
    "Stale tasks": 1,
    "Missing frontmatter": 1,
    "Empty folders": 1,
    "Broken links": 1,
    "Template leftovers": 1,
  });
  expect(result.issues.map((issue) => issue.type)).toContain("template_leftover");
});

test("health treats skipped agent docs as valid link targets", async () => {
  const root = await tempVault("vaultmind-agent-docs-");
  await writeNotes(root, {
    "AGENTS.md": "# Agent guidance\n",
    "index.md": "# Index\n\nSee [[Project Note]].\n",
    "Project Note.md": `---
type: project
---

# Project Note

See [[AGENTS]] for agent guidance.
`,
  });

  const result = await runHealthCheck(root);

  expect(result.totalNotes).toBe(2);
  expect(result.totalIssues).toBe(0);
});

function tempVault(prefix = "vaultmind-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeNotes(root: string, notes: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(notes).map(([file, content]) =>
      writeFile(path.join(root, file), content, "utf8"),
    ),
  );
}
