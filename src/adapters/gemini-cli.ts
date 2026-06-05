import path from "node:path";
import { rm } from "node:fs/promises";
import { commandsForPlatform } from "../core/commands.js";
import {
  copyTree,
  ensureMarkdownFrontmatter,
  isFileNotFound,
  readText,
  writeGeneratedBlock,
  writeText,
} from "../core/files.js";
import type { CommandSpec } from "../types.js";
import { renderCommandTable, skillName } from "./shared.js";

interface AdapterArgs {
  repoRoot: string;
  outDir: string;
  commands: CommandSpec[];
}

export async function buildGeminiCli({ repoRoot, outDir, commands }: AdapterArgs): Promise<void> {
  const selected = commandsForPlatform(commands, "gemini-cli");
  const agentsFile = path.join(outDir, "AGENTS.md");

  await ensureMarkdownFrontmatter(agentsFile, renderAgentsFrontmatter());
  await writeGeneratedBlock(agentsFile, "gemini", renderGeminiAgents(selected));
  await writeGeminiSettings(path.join(outDir, ".gemini", "settings.json"));

  for (const command of selected) {
    const commandsDir = path.join(outDir, ".gemini", "commands");
    await removeGeneratedShortCommand(path.join(commandsDir, `${command.name}.md`));
    await writeText(path.join(commandsDir, `${geminiCommandName(command)}.md`), command.raw);
  }

  await copyTreeIfPresent(path.join(repoRoot, "references"), path.join(outDir, ".gemini", "references"));
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
Read it before using generated workflow files or writing vault notes.`;
}

function renderGeminiAgents(commands: CommandSpec[]): string {
  return `# Vault Mind - Gemini Guidance

Gemini is configured to use this shared \`AGENTS.md\` file as its vault context.
When a user request matches one of the workflows below, read the matching workflow
file and follow it step by step.

${renderCommandTable(commands, ".gemini/commands", geminiCommandName)}

## Rules

- Read the vault's local operating manual first if one exists.
- Workflow command files are source-of-truth execution specs. When a workflow
  tells you to run a \`vaultmind\` CLI command, run it instead of hand-writing
  generated vault files. If the command cannot run, report the blocker.
- Keep vault writes AI-first: frontmatter, a future-agent preamble, wikilinks,
  recency markers, and source URLs.
- Do not invent facts or claim absence without exhaustive search.
`;
}

function geminiCommandName(command: CommandSpec): string {
  return `${skillName}-${command.name}`;
}

async function writeGeminiSettings(file: string): Promise<void> {
  const settings = await readJsonObjectIfPresent(file);
  const context = objectValue(settings.context);

  await writeText(
    file,
    `${JSON.stringify(
      {
        ...settings,
        context: {
          ...context,
          fileName: ["AGENTS.md"],
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function readJsonObjectIfPresent(file: string): Promise<Record<string, unknown>> {
  try {
    return objectValue(JSON.parse(await readText(file)));
  } catch (error) {
    if (isFileNotFound(error)) {
      return {};
    }
    throw error;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function copyTreeIfPresent(source: string, destination: string): Promise<void> {
  try {
    await copyTree(source, destination);
  } catch {
    // Optional references should not block a minimal build.
  }
}

async function removeGeneratedShortCommand(file: string): Promise<void> {
  await rm(file, { force: true });
}
