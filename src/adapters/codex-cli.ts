import path from "node:path";
import { commandsForPlatform } from "../core/commands.js";
import {
  copyTree,
  ensureCleanDir,
  ensureMarkdownFrontmatter,
  writeGeneratedBlock,
  writeText,
} from "../core/files.js";
import type { CommandSpec } from "../types.js";
import { renderSkill, skillName } from "./shared.js";

interface AdapterArgs {
  repoRoot: string;
  outDir: string;
  commands: CommandSpec[];
}

export async function buildCodexCli({ repoRoot, outDir, commands }: AdapterArgs): Promise<void> {
  const selected = commandsForPlatform(commands, "codex-cli");
  const skillRoot = path.join(outDir, ".agents", "skills", skillName);

  await ensureCleanDir(skillRoot);
  const agentsFile = path.join(outDir, "AGENTS.md");
  await ensureMarkdownFrontmatter(agentsFile, renderAgentsFrontmatter());
  await writeGeneratedBlock(agentsFile, "codex", renderAgents(selected));
  await writeText(path.join(skillRoot, "SKILL.md"), renderSkill(selected));

  for (const command of selected) {
    await writeText(path.join(skillRoot, "commands", `${command.name}.md`), command.raw);
    await writeText(
      path.join(outDir, ".agents", "skills", workflowSkillName(command), "SKILL.md"),
      renderWorkflowSkill(command),
    );
  }

  await copyTreeIfPresent(path.join(repoRoot, "references"), path.join(skillRoot, "references"));
}

function renderAgentsFrontmatter(): string {
  return `---
date: ${new Date().toISOString().slice(0, 10)}
type: agent-guidance
tags: [agent-guidance]
ai-first: true
---

## For future agent
This file is the shared operating manual for agents working in this vault.
Read it before using generated workflow skills or writing vault notes.`;
}

function renderAgents(commands: CommandSpec[]): string {
  return `# Vault Mind - Codex Guidance

This vault includes the \`vault-mind\` skill at:

\`.agents/skills/vault-mind/SKILL.md\`

Use it when the user asks to inspect, audit, search, update, or maintain this
knowledge vault. Vault Mind workflows are skill instructions, not Codex slash
commands. The umbrella skill is \`$vault-mind\`; individual workflow skills are
also generated so they appear directly in Codex's \`$\` skill picker.

${commands.map((command) => `- \`$${workflowSkillName(command)}\` - ${command.description}`).join("\n")}
`;
}

function renderWorkflowSkill(command: CommandSpec): string {
  return `---
name: ${workflowSkillName(command)}
description: ${JSON.stringify(command.description)}
---

# Vault Mind Workflow: ${command.name}

This is an individually invokable wrapper for the \`${command.name}\` workflow.
Use it when the user asks for this exact vault workflow, or when their request
matches one of its trigger phrases.

## How To Use

1. Read \`.agents/skills/${skillName}/SKILL.md\` for shared Vault Mind rules.
2. Follow the workflow spec below step by step.
3. Treat this as a skill workflow, not a Codex slash command.

## Workflow Spec

${command.raw}
`;
}

function workflowSkillName(command: CommandSpec): string {
  return `${skillName}-${command.name}`;
}

async function copyTreeIfPresent(source: string, destination: string): Promise<void> {
  try {
    await copyTree(source, destination);
  } catch {
    // Optional references should not block a minimal build.
  }
}
