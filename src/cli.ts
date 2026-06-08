#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { buildVault } from "./build.js";
import { listCommands } from "./core/commands.js";
import { renderWorkflowPrompt, normalizeWorkflowName } from "./core/workflows.js";
import { writeAntipatternNotes } from "./vault/antipatterns/index.js";
import { writeArchitectureNotes } from "./vault/architect/index.js";
import { runHealthCheck } from "./vault/health/index.js";
import { initVault } from "./vault/init/index.js";
import { reviewVault } from "./vault/review/index.js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repoRoot = path.resolve(dirname, "..");

export function createProgram(root = repoRoot): Command {
  const program = new Command();
  const pkg = readPackage(root);

  program
    .name("vaultmind")
    .description("An AI operating layer for your personal knowledge vault.")
    .version(pkg.version)
    .showHelpAfterError();

  program
    .command("commands")
    .description("List installed command specs")
    .action(async () => {
      const commands = await listCommands(path.join(root, "commands"));
      for (const command of commands) {
        console.log(`/${command.name}\t${command.category}\t${command.description}`);
      }
    });

  program
    .command("build")
    .description("Build agent skill files into a vault directory")
    .option("--out <dir>", "output directory", "vault")
    .action(async (options: { out: string }) => {
      const outDir = path.resolve(process.cwd(), options.out);
      await buildVault({ repoRoot: root, outDir });
      console.log(`Built -> ${path.relative(process.cwd(), outDir) || "."}`);
    });

  program
    .command("init")
    .description("Bootstrap a local vault structure")
    .argument("[vault]", "vault path")
    .option("--path <vault>", "vault path")
    .action(async (vault: string | undefined, options: { path?: string }) => {
      const vaultPath = resolveVaultPath(options.path ?? vault);
      await runInitAction(vaultPath);
    });

  program
    .command("health")
    .description("Audit a vault for structural issues")
    .argument("[vault]", "vault path")
    .option("--path <vault>", "vault path")
    .option("--json", "print machine-readable JSON")
    .action(async (vault: string | undefined, options: { path?: string; json?: boolean }) => {
      const vaultPath = options.path ?? vault;
      if (!vaultPath) {
        throw new Error("health requires --path <vault-path>");
      }
      await runHealthAction(path.resolve(vaultPath), options.json);
    });

  program
    .command("review")
    .description("Verify the evidence contract in agent-authored vault notes")
    .argument("[vault]", "vault path")
    .option("--path <vault>", "vault path")
    .option("--json", "print machine-readable JSON")
    .action(async (vault: string | undefined, options: { path?: string; json?: boolean }) => {
      const vaultPath = options.path ?? vault;
      if (!vaultPath) {
        throw new Error("review requires --path <vault-path>");
      }
      await runReviewAction(path.resolve(vaultPath), options.json);
    });

  program
    .command("architect")
    .description("Scan a codebase and write architecture notes into a vault")
    .argument("[repo]", "repo path")
    .option("--repo <repo>", "repo path")
    .option("--vault <vault>", "vault path", "vault")
    .option("--max-modules <count>", "maximum source areas in scan facts", parseInteger, 12)
    .option("--json", "print machine-readable JSON")
    .action(async (repo: string | undefined, options: {
      repo?: string;
      vault: string;
      maxModules: number;
      json?: boolean;
    }) => {
      await runArchitectAction(
        resolveRepoPath("architect", options.repo, repo),
        resolveVaultPath(options.vault),
        options.json,
        options.maxModules,
      );
    });

  program
    .command("antipatterns")
    .description("Scan a codebase's history for anti-pattern signals and scaffold a findings note")
    .argument("[repo]", "repo path")
    .option("--repo <repo>", "repo path")
    .option("--vault <vault>", "vault path", "vault")
    .option("--json", "print machine-readable JSON")
    .action(async (repo: string | undefined, options: {
      repo?: string;
      vault: string;
      json?: boolean;
    }) => {
      await runAntipatternsAction(
        resolveRepoPath("antipatterns", options.repo, repo),
        resolveVaultPath(options.vault),
        options.json,
      );
    });

  program
    .command("print")
    .description("Print an agent prompt for a workflow")
    .argument("<workflow>", "workflow name")
    .argument("[args...]", "workflow arguments")
    .option("--vault <vault>", "vault path", "vault")
    .allowUnknownOption()
    .action(async (workflow: string, args: string[], options: { vault: string }) => {
      console.log(await renderWorkflowPrompt({
        repoRoot: root,
        workflow,
        vaultPath: resolveVaultPath(options.vault),
        args,
      }));
    });

  program
    .command("run")
    .description("Run a built-in deterministic workflow, or print its agent prompt")
    .argument("<workflow>", "workflow name")
    .argument("[args...]", "workflow arguments")
    .option("--vault <vault>", "vault path", "vault")
    .option("--repo <repo>", "repo path for architect")
    .option("--json", "print machine-readable JSON where supported")
    .allowUnknownOption()
    .action(async (workflow: string, args: string[], options: {
      vault: string;
      repo?: string;
      json?: boolean;
    }) => {
      const name = normalizeWorkflowName(workflow);
      const vaultPath = resolveVaultPath(options.vault);

      if (name === "health") {
        await runHealthAction(vaultPath, options.json);
        return;
      }

      if (name === "init") {
        await runInitAction(vaultPath);
        return;
      }

      if (name === "review") {
        await runReviewAction(vaultPath, options.json);
        return;
      }

      if (name === "architect") {
        await runArchitectAction(resolveRepoPath("architect", options.repo, args[0]), vaultPath, options.json);
        return;
      }

      if (name === "antipatterns") {
        await runAntipatternsAction(resolveRepoPath("antipatterns", options.repo, args[0]), vaultPath, options.json);
        return;
      }

      console.log(await renderWorkflowPrompt({
        repoRoot: root,
        workflow,
        vaultPath,
        args,
      }));
    });

  program
    .command("version")
    .description("Print version")
    .action(() => {
      console.log(pkg.version);
    });

  return program;
}

function readPackage(root: string): { version: string } {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };
}

function resolveVaultPath(value = "vault"): string {
  return path.resolve(process.cwd(), value);
}

// Resolve a repo path from the `--repo` option and positional argument, in that
// order of precedence. Throws a command-specific usage error when neither is set.
function resolveRepoPath(command: string, ...candidates: Array<string | undefined>): string {
  const repoPath = candidates.find((value) => value !== undefined && value.length > 0);
  if (repoPath === undefined) {
    throw new Error(`${command} requires --repo <repo-path>`);
  }
  return path.resolve(repoPath);
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

async function runHealthAction(vaultPath: string, json?: boolean): Promise<void> {
  const result = await runHealthCheck(vaultPath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHealth(result);
  }
  if (result.issues.some((issue) => issue.severity !== "info")) {
    process.exitCode = 1;
  }
}

async function runInitAction(vaultPath: string): Promise<void> {
  printInit(await initVault(vaultPath));
}

async function runReviewAction(vaultPath: string, json?: boolean): Promise<void> {
  const result = await reviewVault(vaultPath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReview(result);
  }
  if (result.issues.some((issue) => issue.severity !== "info")) {
    process.exitCode = 1;
  }
}

async function runArchitectAction(
  repoPath: string,
  vaultPath: string,
  json?: boolean,
  maxModules?: number,
): Promise<void> {
  const result = await writeArchitectureNotes({ repoPath, vaultPath, ...(maxModules !== undefined && { maxModules }) });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printArchitect(result);
  }
}

function printHealth(result: Awaited<ReturnType<typeof runHealthCheck>>): void {
  printIssueReport({
    vault: result.vault,
    scanned: result.scanned,
    subtotalLabel: "Notes",
    subtotal: result.totalNotes,
    totalIssues: result.totalIssues,
    counts: result.counts,
    issues: result.issues,
    emptyMessage: "No issues found.",
  });
}

function printReview(result: Awaited<ReturnType<typeof reviewVault>>): void {
  printIssueReport({
    vault: result.vault,
    scanned: result.scanned,
    subtotalLabel: "Notes reviewed",
    subtotal: result.notesReviewed,
    totalIssues: result.totalIssues,
    counts: result.counts,
    issues: result.issues,
    emptyMessage: "No evidence-contract issues found.",
  });
}

interface IssueReport {
  vault: string;
  scanned: string;
  subtotalLabel: string;
  subtotal: number;
  totalIssues: number;
  counts: Record<string, number>;
  issues: Array<{ severity: string; message: string }>;
  emptyMessage: string;
}

function printIssueReport(report: IssueReport): void {
  console.log(`Vault: ${report.vault}`);
  console.log(`Scanned: ${report.scanned}`);
  console.log(`${report.subtotalLabel}: ${report.subtotal}`);
  console.log(`Issues: ${report.totalIssues}`);
  console.log("");

  if (report.totalIssues === 0) {
    console.log(report.emptyMessage);
    return;
  }

  for (const [label, count] of Object.entries(report.counts)) {
    if (count > 0) {
      console.log(`${label}: ${count}`);
    }
  }

  console.log("");
  for (const issue of report.issues.slice(0, 50)) {
    console.log(`- [${issue.severity}] ${issue.message}`);
  }
  if (report.issues.length > 50) {
    console.log(`- ... ${report.issues.length - 50} more`);
  }
}

function printInit(result: Awaited<ReturnType<typeof initVault>>): void {
  console.log(`Vault: ${result.vault}`);
  console.log(`Created files: ${result.created.length}`);
  console.log(`Skipped files: ${result.skipped.length}`);

  for (const file of result.created) {
    console.log(`- created ${file}`);
  }
}

async function runAntipatternsAction(
  repoPath: string,
  vaultPath: string,
  json?: boolean,
): Promise<void> {
  const result = await writeAntipatternNotes({ repoPath, vaultPath });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printAntipatterns(result);
  }
}

function printAntipatterns(result: Awaited<ReturnType<typeof writeAntipatternNotes>>): void {
  const { signals } = result;
  console.log(`Repo: ${signals.root}`);
  console.log(`Name: ${signals.name}`);
  console.log(`Scan commit: ${signals.git?.commit ?? "not detected"}`);
  console.log(`History: ${signals.scanSource === "git" ? `${signals.commitsScanned} commits` : "no git history"}`);
  console.log(`Hotspots: ${signals.hotspotFiles.length}, fix-prone: ${signals.fixProneFiles.length}, remediation commits: ${signals.remediationCommits.length}`);
  printChangeList(result.changes, result.operationLog.file);
}

function printArchitect(result: Awaited<ReturnType<typeof writeArchitectureNotes>>): void {
  console.log(`Repo: ${result.manifest.root}`);
  console.log(`Name: ${result.manifest.name}`);
  console.log(`Kind: ${result.manifest.kind ?? "unknown"}`);
  console.log(`Scan commit: ${result.manifest.git?.commit ?? "not detected"}`);
  console.log(`Source areas: ${result.manifest.modules.length}`);
  printChangeList(result.changes, result.operationLog.file, changeReason);
}

function printChangeList<T extends { status: string; file: string }>(
  changes: T[],
  operationLogFile: string,
  reasonFor: (change: T) => string = () => "",
): void {
  console.log("Changes:");
  for (const change of changes) {
    console.log(`- ${change.status} ${change.file}${reasonFor(change)}`);
  }
  console.log(`Operation log: ${operationLogFile}`);
}

function changeReason(change: Awaited<ReturnType<typeof writeArchitectureNotes>>["changes"][number]): string {
  const parts: string[] = [];
  if (change.generatedChanged) parts.push("generated");
  if (change.frontmatterChanged) parts.push("frontmatter");
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export function isCliEntrypoint(argvPath: string | undefined, modulePath = filename): boolean {
  if (argvPath === undefined) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (isCliEntrypoint(process.argv[1])) {
  const program = createProgram();
  program.exitOverride();

  program.parseAsync(process.argv).catch((error: unknown) => {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "commander.helpDisplayed" || error.code === "commander.version")
    ) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`vaultmind: ${message}`);
    process.exitCode = 1;
  });
}
