import path from "node:path";
import type { CommandSpec } from "../types.js";
import { listMarkdownFiles, readText } from "./files.js";
import { frontmatterArrayValue, frontmatterStringValue, parseFrontmatter } from "./frontmatter.js";

export async function listCommands(commandsDir: string): Promise<CommandSpec[]> {
  const files = await listMarkdownFiles(commandsDir);
  const commands: CommandSpec[] = [];

  for (const file of files) {
    const text = await readText(file);
    const parsed = parseFrontmatter(text);
    commands.push({
      name: path.basename(file, ".md"),
      file,
      description: frontmatterStringValue(parsed.data.description),
      category: frontmatterStringValue(parsed.data.category, "other"),
      triggersEn: frontmatterArrayValue(parsed.data.triggers_en),
      body: parsed.content,
      raw: text,
    });
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));
  return commands;
}
