import path from "node:path";
import { listCommands } from "./core/commands.js";
import { buildAgentSkills } from "./adapters/adapter.js";

interface BuildArgs {
  repoRoot: string;
  outDir: string;
}

export async function buildVault(args: BuildArgs): Promise<void> {
  const commands = await listCommands(path.join(args.repoRoot, "commands"));
  await buildAgentSkills({
    repoRoot: args.repoRoot,
    outDir: args.outDir,
    commands,
  });
}
