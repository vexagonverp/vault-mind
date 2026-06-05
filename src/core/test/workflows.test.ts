import path from "node:path";
import { expect, test } from "vitest";
import { normalizeWorkflowName, renderWorkflowPrompt } from "../workflows.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test.each([
  "/health",
  "$health",
  "health.md",
])("normalizeWorkflowName accepts %s", (name) => {
  expect(normalizeWorkflowName(name)).toBe("health");
});

test("renderWorkflowPrompt includes workflow body and arguments", async () => {
  const prompt = await renderWorkflowPrompt({
    repoRoot,
    workflow: "health",
    vaultPath: "vault",
    args: ["--json"],
  });

  expect(prompt).toContain("Workflow: health");
  expect(prompt).toContain("User-supplied arguments: --json");
  expect(prompt).toContain("vaultmind health --path <vault-path>");
});
