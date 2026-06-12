import { expect, test } from "vitest";
import { expectContainsAll, readPath, rootPath, tempVault, writeNotes, writePath } from "../../../test/helpers.js";
import { buildAntipatternIndex, writeAntipatternIndex } from "../rollup.js";

function patternNote(name: string, rule: string, status = "active"): string {
  return `---
type: antipattern-pattern
status: ${status}
---

# ${name}

${rule}
`;
}

function instanceNote(repoRoot: string, findings: string): string {
  return `---
type: antipatterns
source-repo: ${JSON.stringify(repoRoot)}
---

<!-- @agent:start -->
## Anti-pattern findings

${findings}
<!-- @agent:end -->
`;
}

async function seededVault(): Promise<string> {
  const root = await tempVault("vaultmind-ap-index-");
  // A real repo on disk (basename becomes the repo label) for stale-checks.
  await writePath(root, "repos/search-api/src/a.ts", "x\n");
  await writePath(root, "repos/search-api/src/c.ts", "x\n");
  const searchApiRoot = rootPath(root, "repos/search-api");

  await writeNotes(root, {
    "Anti-patterns/_patterns/Error swallowing.md": patternNote(
      "Error swallowing",
      "Catching and discarding an error hides the failure; log and rethrow instead.",
    ),
    "Anti-patterns/search-api/Search API - Anti-patterns.md": instanceNote(searchApiRoot, [
      "pattern: [[Error swallowing]]; status: active; example: src/a.ts:1",
      "pattern: [[Error swallowing]]; status: resolved; example: src/gone.ts:2",
      "pattern: [[God object]]; status: active; example: src/c.ts:3",
    ].join("\n")),
    "Anti-patterns/poi/POI - Anti-patterns.md": instanceNote("/x/poi", [
      "pattern: [[Error swallowing]]; status: active; example: src/d.ts:4",
    ].join("\n")),
  });
  return root;
}

test("rolls up instances by pattern with rule, examples, and stale-checks", async () => {
  const root = await seededVault();

  const index = await buildAntipatternIndex(root);
  const errorSwallowing = index.patterns.find((pattern) => pattern.name === "Error swallowing");
  const godObject = index.patterns.find((pattern) => pattern.name === "God object");

  expect(errorSwallowing).toMatchObject({
    defined: true,
    status: "active",
    rule: "Catching and discarding an error hides the failure; log and rethrow instead.",
    instances: 3,
    resolved: 1,
    repos: ["poi", "search-api"],
  });
  // The present file resolves; the missing file is flagged; the off-disk repo is unchecked.
  expect(errorSwallowing?.examples.find((e) => e.path === "src/a.ts:1")?.ok).toBe(true);
  expect(errorSwallowing?.examples.find((e) => e.path === "src/gone.ts:2")?.ok).toBe(false);
  expect(errorSwallowing?.examples.find((e) => e.path === "src/d.ts:4")?.ok).toBeUndefined();

  expect(godObject).toMatchObject({ defined: false, status: "no pattern note", instances: 1 });
});

test("writes a master-list _Index.md with rules, examples, and stale flags", async () => {
  const root = await seededVault();

  const result = await writeAntipatternIndex(root);
  const note = await readPath(root, "Anti-patterns/_Index.md");

  expect(result.file).toBe("Anti-patterns/_Index.md");
  expectContainsAll(note, [
    "type: antipattern-index",
    "Read this before implementing or reviewing code",
    "## [[Error swallowing]]",
    "> Catching and discarding an error hides the failure",
    "- search-api — `src/gone.ts:2` (resolved, ⚠️ path not found)",
    "- poi — `src/d.ts:4`",
    "## Undefined Patterns",
    "God object",
    "patterns ·",
    "<!-- vault-mind:antipattern-index:start -->",
  ]);
});

test("returns an empty index when there are no anti-pattern notes", async () => {
  const root = await tempVault("vaultmind-ap-empty-");

  const index = await buildAntipatternIndex(root);

  expect(index.patterns).toEqual([]);
});
