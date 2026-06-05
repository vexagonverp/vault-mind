import path from "node:path";
import { listCommands } from "./commands.js";
import type { CommandSpec } from "../types.js";

export interface WorkflowPromptArgs {
  repoRoot: string;
  workflow: string;
  vaultPath: string;
  args?: string[];
}

export async function renderWorkflowPrompt({
  repoRoot,
  workflow,
  vaultPath,
  args = [],
}: WorkflowPromptArgs): Promise<string> {
  const command = await findWorkflow(repoRoot, workflow);
  const argsText = args.length > 0 ? args.join(" ") : "(none)";

  return `You are executing a vault-mind workflow.

Workflow: ${command.name}
Vault root: ${path.resolve(vaultPath)}

Rules:
- Start by reading AGENTS.md at the vault root if it exists.
- Follow the workflow spec below exactly.
- Keep vault writes AI-first: frontmatter, a future-agent preamble, wikilinks, dates, and sources.
- Do not edit destructive or ambiguous changes without asking first.

User-supplied arguments: ${argsText}

Workflow spec:
${command.raw}`;
}

export async function findWorkflow(repoRoot: string, workflow: string): Promise<CommandSpec> {
  const normalized = normalizeWorkflowName(workflow);
  const commands = await listCommands(path.join(repoRoot, "commands"));
  const command = commands.find((item) => item.name === normalized);
  if (command === undefined) {
    throw new Error(`Unknown workflow: ${workflow}`);
  }
  return command;
}

export function normalizeWorkflowName(value: string): string {
  return value.replace(/^\//, "").replace(/^\$/, "").replace(/\.md$/, "");
}
