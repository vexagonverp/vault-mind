import path from "node:path";
import {
  copyTree,
  ensureCleanDir,
  ensureMarkdownFrontmatter,
  writeGeneratedBlock,
  writeText,
} from "../core/files.js";
import { today } from "../core/dates.js";
import type { CommandSpec } from "../types.js";
import { renderSkill, skillName } from "./shared.js";

interface BuildArgs {
  repoRoot: string;
  outDir: string;
  commands: CommandSpec[];
}

export async function buildAgentSkills({ repoRoot, outDir, commands }: BuildArgs): Promise<void> {
  const skillRoot = path.join(outDir, ".agents", "skills", skillName);

  await ensureCleanDir(skillRoot);
  const agentsFile = path.join(outDir, "AGENTS.md");
  await ensureMarkdownFrontmatter(agentsFile, renderAgentsFrontmatter());
  await writeGeneratedBlock(agentsFile, "vault-mind", renderAgentsBlock(commands));
  await writeText(path.join(skillRoot, "SKILL.md"), renderSkill(commands));

  for (const command of commands) {
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
date: ${today()}
type: agent-guidance
tags: [agent-guidance]
ai-first: true
---

## For future agent
This file is the shared operating manual for agents working in this vault.
Read it before using generated workflow skills or writing vault notes.`;
}

function renderAgentsBlock(commands: CommandSpec[]): string {
  return `# Vault Mind

This vault includes the \`vault-mind\` skill at:

\`.agents/skills/vault-mind/SKILL.md\`

Use it when the user asks to inspect, audit, search, update, or maintain this
knowledge vault. The umbrella skill is \`$vault-mind\`; individual workflow
skills are also generated so they appear directly in the skill picker.

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

## Workflow Spec

${command.raw}
`;
}

function workflowSkillName(command: CommandSpec): string {
  return `vault-${command.name}`;
}

async function copyTreeIfPresent(source: string, destination: string): Promise<void> {
  try {
    await copyTree(source, destination);
  } catch {
    // Optional references should not block a minimal build.
  }
}
