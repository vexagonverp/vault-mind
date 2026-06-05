import path from "node:path";
import { listCommands } from "./core/commands.js";
import { buildCodexCli } from "./adapters/codex-cli.js";
import { buildGeminiCli } from "./adapters/gemini-cli.js";
import type { CommandSpec } from "./types.js";

export type Platform = "codex-cli" | "gemini-cli";

interface BuildPlatformArgs {
  repoRoot: string;
  platform: Platform;
  outDir: string;
}

type AdapterFn = (args: { repoRoot: string; outDir: string; commands: CommandSpec[] }) => Promise<void>;

const builders: Record<Platform, AdapterFn> = {
  "codex-cli": buildCodexCli,
  "gemini-cli": buildGeminiCli,
};

export async function buildPlatform(args: BuildPlatformArgs): Promise<void> {
  const builder = builders[args.platform];
  const commands = await listCommands(path.join(args.repoRoot, "commands"));
  await builder({
    repoRoot: args.repoRoot,
    outDir: args.outDir,
    commands,
  });
}
