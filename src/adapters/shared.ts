import type { CommandSpec } from "../types.js";

export const skillName = "vault-mind";

export function renderSkill(commands: CommandSpec[]): string {
  return `---
name: ${skillName}
description: Operate an Obsidian or Markdown knowledge vault as an AI-readable personal memory layer. Use when the user asks to inspect, audit, search, update, or maintain their vault.
---

# Vault Mind

Vault Mind is a small workflow pack for personal knowledge vaults.

## How To Use

When the user's request matches a workflow below, read the workflow file and
follow it step by step. In Codex CLI, these are not slash commands; use natural
language or \`/skills\` to invoke this skill.

Example:

\`$vault-mind run obsidian-health\`

${renderCommandTable(commands, "commands")}

## Rules

- Read the vault's local operating manual first if one exists.
- Keep vault writes AI-first: frontmatter, a future-agent preamble, wikilinks,
  recency markers, and source URLs.
- Do not invent facts or claim absence without exhaustive search.
`;
}

export function renderCommandTable(
  commands: CommandSpec[],
  prefix: string,
  fileNameFor: (command: CommandSpec) => string = (command) => command.name,
): string {
  const rows = [
    "| Workflow | Category | What it does | File |",
    "|---|---|---|---|",
  ];

  for (const command of commands) {
    rows.push(
      `| \`${fileNameFor(command)}\` | ${command.category} | ${command.description} | \`${prefix}/${fileNameFor(command)}.md\` |`,
    );
  }

  return rows.join("\n");
}
