import path from "node:path";
import type { CommandSpec } from "../types.js";
import { listMarkdownFiles, readText } from "./files.js";
import { parseFrontmatter } from "./frontmatter.js";

export async function listCommands(commandsDir: string): Promise<CommandSpec[]> {
  const files = await listMarkdownFiles(commandsDir);
  const commands: CommandSpec[] = [];

  for (const file of files) {
    const text = await readText(file);
    const parsed = parseFrontmatter(text);
    commands.push({
      name: path.basename(file, ".md"),
      file,
      description: stringValue(parsed.data.description),
      category: stringValue(parsed.data.category, "other"),
      exclude: arrayValue(parsed.data.exclude),
      triggersEn: arrayValue(parsed.data.triggers_en),
      body: parsed.content,
      raw: text,
    });
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));
  return commands;
}

export function commandsForPlatform(commands: CommandSpec[], platform: string): CommandSpec[] {
  return commands.filter((command) => !command.exclude.includes(platform));
}

function stringValue(value: unknown, fallback = ""): string {
  if (value === undefined) {
    return fallback;
  }
  return String(value);
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (value === undefined || value === "") {
    return [];
  }
  return [String(value)];
}
