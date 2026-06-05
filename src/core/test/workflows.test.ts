import path from "node:path";
import { expect, test } from "vitest";
import { normalizeWorkflowName, renderWorkflowPrompt } from "../workflows.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test.each([
  "/obsidian-health",
  "$obsidian-health",
  "obsidian-health.md",
])("normalizeWorkflowName accepts %s", (name) => {
  expect(normalizeWorkflowName(name)).toBe("obsidian-health");
});

test("renderWorkflowPrompt includes workflow body and arguments", async () => {
  const prompt = await renderWorkflowPrompt({
    repoRoot,
    workflow: "obsidian-health",
    vaultPath: "vault",
    args: ["--json"],
  });

  expect(prompt).toContain("Workflow: obsidian-health");
  expect(prompt).toContain("User-supplied arguments: --json");
  expect(prompt).toContain("vaultmind health --path <vault-path>");
});
