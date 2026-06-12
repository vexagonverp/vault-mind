import path from "node:path";
import { readdir } from "node:fs/promises";
import { git, gitInfo } from "../../core/git.js";
import { fileExists, isString, listFiles, readTextIfPresent, toVaultPath } from "../../core/files.js";
import { languagesByExtension, sourceExtensions } from "../../core/languages.js";
import { projectSlug, projectTitle } from "../../core/naming.js";
import type {
  ArchitectOptions,
  ArchitectureManifest,
} from "./types.js";

type ArchitectureModule = ArchitectureManifest["modules"][number];
type ArchitectureEvidenceFile = ArchitectureManifest["candidateEntryFiles"][number];
type ArchitectureNoteCandidate = ArchitectureManifest["candidateArchitectureNotes"][number];

const skipDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-ssr",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".next",
  ".nuxt",
  "vendor",
  "coverage",
  ".turbo",
  ".cache",
  ".output",
  ".serverless",
  ".aws-sam",
  ".parcel-cache",
  ".svelte-kit",
  "cdk.out",
  "out",
]);

const supportDirs = new Set([
  "tests",
  "test",
  "docs",
  "doc",
  "examples",
  "example",
  "scripts",
  "fixtures",
  "__tests__",
  "spec",
  "specs",
]);

interface ManifestInfo {
  name: string;
  kind: string | undefined;
  dependencies: string[];
  entryPoints: string[];
  scripts: Array<{ name: string; command: string }>;
  signals: ArchitectureManifest["signals"];
}

interface FileScan {
  files: string[];
  source: ArchitectureManifest["scanSource"];
}

export async function scanCodebase(
  repoPath: string,
  options: ArchitectOptions = {},
): Promise<ArchitectureManifest> {
  const root = path.resolve(repoPath);
  const maxModules = options.maxModules ?? 12;
  const scan = await scanFiles(root);
  const manifest = await detectManifest(root);
  const roots = await sourceRoots(root, scan.files);
  const candidateEntryFiles = detectCandidateEntryFiles(root, scan.files, manifest.scripts);

  return {
    root,
    name: manifest.name,
    slug: projectSlug(manifest.name),
    title: projectTitle(manifest.name),
    kind: manifest.kind,
    scanSource: scan.source,
    filesScanned: scan.files.length,
    sourceRoots: roots.map((sourceRoot) => toVaultPath(path.relative(root, sourceRoot)) || "."),
    languages: detectLanguages(scan.files),
    modules: await proposeModules(root, maxModules, roots, scan.files),
    dependencies: manifest.dependencies,
    entryPoints: manifest.entryPoints,
    manifestFiles: detectManifestFiles(root, scan.files),
    docs: detectDocs(root, scan.files),
    configFiles: detectConfigFiles(root, scan.files),
    workflows: detectWorkflows(root, scan.files),
    candidateEntryFiles,
    candidateArchitectureNotes: proposeArchitectureNotes(root, scan.files, candidateEntryFiles),
    signals: manifest.signals,
    git: await gitInfo(root),
  };
}

async function scanFiles(root: string): Promise<FileScan> {
  const gitFiles = await listGitVisibleFiles(root);
  if (gitFiles.length > 0) {
    return {
      files: gitFiles,
      source: "git",
    };
  }

  return {
    files: await listFiles(root, { skipDirs }),
    source: "filesystem",
  };
}

async function listGitVisibleFiles(root: string): Promise<string[]> {
  try {
    const stdout = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
    return stdout
      .split("\0")
      .filter((file) => file.length > 0)
      .filter((file) => !isSkippedPath(file))
      .map((file) => path.join(root, file))
      .sort();
  } catch {
    return [];
  }
}

function detectLanguages(files: string[]): ArchitectureManifest["languages"] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const language = languagesByExtension[path.extname(file).toLowerCase()];
    if (language === undefined) {
      continue;
    }
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, files]) => ({
      language,
      files,
      pct: Math.round((1000 * files) / total) / 10,
    }));
}

async function detectManifest(root: string): Promise<ManifestInfo> {
  const packageJson = path.join(root, "package.json");
  const pyproject = path.join(root, "pyproject.toml");
  const base: ManifestInfo = {
    name: path.basename(root),
    kind: undefined,
    dependencies: [],
    entryPoints: [],
    scripts: [],
    signals: {
      dockerfile: await fileExists(path.join(root, "Dockerfile")),
      makefile: await fileExists(path.join(root, "Makefile")),
      ci: await fileExists(path.join(root, ".github", "workflows")),
    },
  };

  if (await fileExists(packageJson)) {
    const parsed = JSON.parse(await readTextIfPresent(packageJson)) as {
      name?: string;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const scripts = Object.entries(parsed.scripts ?? {})
      .filter(([name, command]) => isMeaningfulScript(name, command))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, command]) => ({ name, command }));
    return {
      ...base,
      name: parsed.name ?? base.name,
      kind: "node",
      dependencies: Object.keys(parsed.dependencies ?? {}).sort().slice(0, 25),
      entryPoints: scripts.map((script) => script.name).slice(0, 15),
      scripts,
    };
  }

  if (await fileExists(pyproject)) {
    const text = await readTextIfPresent(pyproject);
    return {
      ...base,
      name: matchOne(text, /^\s*name\s*=\s*["']([^"']+)/m) ?? base.name,
      kind: "python",
      dependencies: matchMany(text, /["']([A-Za-z0-9_.-]+)(?:[<>=~! ].*)?["']/g).slice(0, 25),
      entryPoints: matchMany(text, /^\s*([A-Za-z0-9_-]+)\s*=\s*["'][^"']+:[^"']+["']/gm).slice(0, 15),
    };
  }

  for (const [file, kind] of [
    ["go.mod", "go"],
    ["Cargo.toml", "rust"],
    ["requirements.txt", "python"],
    ["Gemfile", "ruby"],
    ["pom.xml", "java"],
    ["build.gradle", "gradle"],
  ] as const) {
    if (await fileExists(path.join(root, file))) {
      return { ...base, kind };
    }
  }

  return base;
}

async function proposeModules(
  root: string,
  maxModules: number,
  roots: string[],
  files: string[],
): Promise<ArchitectureModule[]> {
  const modules: ArchitectureModule[] = [];
  for (const base of roots) {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || skipDirs.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const full = path.join(base, entry.name);
      const sourceFiles = countSourceFilesUnder(files, full);
      if (sourceFiles === 0) {
        continue;
      }

      modules.push({
        name: entry.name,
        path: toVaultPath(path.relative(root, full)),
        sourceFiles,
        roleHint: supportDirs.has(entry.name.toLowerCase()) ? "support" : "core",
      });
    }
  }

  return modules
    .sort((a, b) => {
      if (a.roleHint !== b.roleHint) {
        return a.roleHint === "core" ? -1 : 1;
      }
      return b.sourceFiles - a.sourceFiles;
    })
    .slice(0, maxModules);
}

function countSourceFilesUnder(files: string[], dir: string): number {
  return files.filter((file) =>
    sourceExtensions.has(path.extname(file).toLowerCase()) &&
    isWithin(file, dir)
  ).length;
}

function detectManifestFiles(root: string, files: string[]): string[] {
  const names = new Set([
    "package.json",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "requirements.txt",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "pnpm-workspace.yaml",
    "turbo.json",
  ]);

  return limitList(
    files
      .map((file) => repoPath(root, file))
      .filter((file) => names.has(path.basename(file))),
    25,
  );
}

function detectDocs(root: string, files: string[]): string[] {
  return limitList(
    files
      .map((file) => repoPath(root, file))
      .filter((file) => {
        const name = path.basename(file).toLowerCase();
        return (
          name === "agents.md" ||
          name === "readme.md" ||
          name === "contributing.md" ||
          name === "coding_guidelines.md" ||
          /^docs\/.+\.md$/i.test(file)
        );
      }),
    25,
  );
}

function detectConfigFiles(root: string, files: string[]): string[] {
  const configExtensions = new Set([".cjs", ".js", ".json", ".mjs", ".ts", ".toml", ".yaml", ".yml"]);
  const names = new Set([
    "catalog-info.yaml",
    "cdk.json",
    "eslint.config.js",
    "jest.config.js",
    "jest.config.e2e.js",
    "jest.config.int.js",
    "lambda-vite.config.ts",
    "mkdocs.yml",
    "openapitools.json",
    "renovate.json",
    "repolinter.json",
    "tsconfig.json",
    "vite.config.ts",
    "vitest.config.ts",
  ]);

  return limitList(
    files
      .map((file) => repoPath(root, file))
      .filter((file) => {
        const name = path.basename(file);
        return names.has(name) || (
          /^config\//.test(file) &&
          configExtensions.has(path.extname(file).toLowerCase())
        );
      }),
    30,
  );
}

function detectWorkflows(root: string, files: string[]): string[] {
  return limitList(
    files
      .map((file) => repoPath(root, file))
      .filter((file) => /^\.github\/workflows\//.test(file)),
    25,
  );
}

function detectCandidateEntryFiles(
  root: string,
  files: string[],
  scripts: ManifestInfo["scripts"],
): ArchitectureEvidenceFile[] {
  const reasons = new Map<string, Set<string>>();
  const repoFiles = files.map((file) => repoPath(root, file));

  function add(file: string, reason: string): void {
    if (isSkippedPath(file)) {
      return;
    }
    const existing = reasons.get(file) ?? new Set<string>();
    existing.add(reason);
    reasons.set(file, existing);
  }

  for (const file of repoFiles) {
    const reason = entryFileReason(file);
    if (reason !== undefined) {
      add(file, reason);
    }
  }

  for (const script of scripts.filter((script) => isArchitectureScript(script.name))) {
    for (const file of scriptReferencedFiles(repoFiles, script.command)) {
      add(file, `package script "${script.name}" references this file`);
    }
  }

  return [...reasons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 30)
    .map(([file, fileReasons]) => ({
      path: file,
      reason: [...fileReasons].sort().join("; "),
    }));
}

function entryFileReason(file: string): string | undefined {
  if (/^src\/entry-(client|server).+\.[jt]sx?$/.test(file)) {
    return "platform client/server entry file";
  }
  if (/^src\/(main|index|cli|server|app)\.[jt]sx?$/.test(file)) {
    return "common application entry file";
  }
  if (/^src\/(cli|server|app)\/index\.[jt]sx?$/.test(file)) {
    return "common application entry file";
  }
  if (/^(server|client)\.js$/.test(file)) {
    return "local runtime wrapper";
  }
  if (/^lambda\/(lambda|index)\.[jt]s$/.test(file)) {
    return "serverless handler entry file";
  }
  if (/^cdk\/(index|app)\.ts$/.test(file)) {
    return "infrastructure entry file";
  }
  if (/^cdk\/src\/(index|stack)\.ts$/.test(file)) {
    return "infrastructure stack entry file";
  }
  if (/^openapi\.ya?ml$/.test(file)) {
    return "API contract";
  }
  if (/^src\/router\/index\.[jt]s$/.test(file)) {
    return "router entry file";
  }
  if (/\/handlers\/.*Handler\.[jt]s$/.test(file)) {
    return "request or event handler";
  }
  return undefined;
}

function scriptReferencedFiles(repoFiles: string[], command: string): string[] {
  return repoFiles
    .filter((file) => isScriptCandidateFile(file))
    .filter((file) => command.includes(file) || command.includes(`./${file}`));
}

function isScriptCandidateFile(file: string): boolean {
  return (
    !/(^|\/)tests?\//.test(file) &&
    !/^scripts\//.test(file) &&
    sourceExtensions.has(path.extname(file).toLowerCase()) &&
    !isConfigOnlyFile(file)
  );
}

function proposeArchitectureNotes(
  root: string,
  files: string[],
  candidateEntryFiles: ArchitectureEvidenceFile[],
): ArchitectureNoteCandidate[] {
  const repoFiles = files.map((file) => repoPath(root, file));
  const candidates = [
    runtimeCandidate(candidateEntryFiles),
    candidateFor(
      "API surface and routing",
      "Routes, handlers, or API contracts are present.",
      repoFiles,
      /(^openapi\.ya?ml$|\/routes?\/|\/handlers\/|router\/)/,
    ),
    candidateFor(
      "Data model and persistence",
      "Model, schema, migration, or persistence files are present.",
      repoFiles,
      /(\/model\/|\/models\/|\/schema\/|\/schemas\/|dynamodb|prisma|migration|entity)/i,
    ),
    candidateFor(
      "External integrations",
      "Client, cloud, observability, feature flag, or third-party integration files are present.",
      repoFiles,
      /(\/client\.[jt]s$|\/clients\/|\/integrations?\/|\/aws\/|datadog|sentry|splitio|travel-time)/i,
    ),
    candidateFor(
      "Deployment and infrastructure",
      "Infrastructure, deployment, or workflow files are present.",
      repoFiles,
      /(^cdk\/|^\.github\/workflows\/|Dockerfile$|serverless|terraform|cloudformation)/i,
    ),
    candidateFor(
      "Authenticated user workflows",
      "Authentication, user, account, or personalized workflow files are present.",
      repoFiles,
      /(auth|login|user|account|tenant|favourite|favorite)/i,
    ),
    candidateFor(
      "Test strategy and quality gates",
      "Unit, integration, E2E, screenshot, or workflow test files are present.",
      repoFiles,
      /(^tests?\/|\/tests?\/|\.spec\.[jt]sx?$|\.test\.[jt]sx?$|cypress|vitest|jest)/i,
    ),
  ];

  return candidates.filter(isDefined);
}

function runtimeCandidate(
  candidateEntryFiles: ArchitectureEvidenceFile[],
): ArchitectureNoteCandidate | undefined {
  const startFiles = candidateEntryFiles.map((file) => file.path).slice(0, 6);
  if (startFiles.length === 0) {
    return undefined;
  }
  return {
    title: "Runtime flow",
    why: "Candidate entry files suggest startup, request, render, or command paths.",
    startFiles,
  };
}

function candidateFor(
  title: string,
  why: string,
  repoFiles: string[],
  pattern: RegExp,
): ArchitectureNoteCandidate | undefined {
  const startFiles = repoFiles
    .filter((file) => pattern.test(file))
    .sort(compareEvidencePaths)
    .slice(0, 6);
  if (startFiles.length === 0) {
    return undefined;
  }
  return { title, why, startFiles };
}

async function sourceRoots(root: string, files: string[]): Promise<string[]> {
  const roots = new Set<string>();

  for (const name of ["src", "app/src", "lib", "lambda"]) {
    const full = path.join(root, name);
    if (await fileExists(full) && countSourceFilesUnder(files, full) > 0) {
      roots.add(full);
    }
  }

  const cdkSrc = path.join(root, "cdk", "src");
  const cdk = path.join(root, "cdk");
  if (await fileExists(cdkSrc) && countSourceFilesUnder(files, cdkSrc) > 0) {
    roots.add(cdkSrc);
  } else if (await fileExists(cdk) && countSourceFilesUnder(files, cdk) > 0) {
    roots.add(cdk);
  }

  if (roots.size > 0) {
    return [...roots];
  }

  for (const name of ["app", "apps", "packages"]) {
    const full = path.join(root, name);
    if (await fileExists(full)) {
      try {
        const entries = await readdir(full, { withFileTypes: true });
        const subdirs = entries
          .filter((entry) => entry.isDirectory() && !skipDirs.has(entry.name) && !entry.name.startsWith("."))
          .map((entry) => path.join(full, entry.name))
          .filter((dir) => countSourceFilesUnder(files, dir) > 0);
        if (subdirs.length > 0) {
          return subdirs;
        }
      } catch {
        // fall through
      }
      return [full];
    }
  }

  return [root];
}

function matchOne(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

function matchMany(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]).filter(isString);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isMeaningfulScript(name: string, command: string): boolean {
  const trimmed = command.trim();
  if (name.startsWith("_") || /^_+:/.test(name)) {
    return false;
  }
  if (/^echo\s+["'][^"']+["']$/.test(trimmed)) {
    return false;
  }
  return true;
}

function isArchitectureScript(name: string): boolean {
  return /^(build|bundle|client|cleanup|datadog|deploy|destroy|dev|e2e|generate|lambda|migrate|preview|seed|server|serve|start|synth|test)/.test(name);
}

function isConfigOnlyFile(file: string): boolean {
  const name = path.basename(file).toLowerCase();
  return /^tsconfig\b/.test(name) || /^.+\.config\.(cjs|js|mjs|ts)$/.test(name);
}

function isSkippedPath(file: string): boolean {
  return file.split(/[\\/]+/).some((part) => skipDirs.has(part));
}

function isWithin(file: string, dir: string): boolean {
  const relative = path.relative(dir, file);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function repoPath(root: string, file: string): string {
  return toVaultPath(path.relative(root, file));
}

function limitList(items: string[], limit: number): string[] {
  return [...new Set(items)].sort().slice(0, limit);
}

function compareEvidencePaths(a: string, b: string): number {
  return evidencePathRank(a) - evidencePathRank(b) || a.localeCompare(b);
}

function evidencePathRank(file: string): number {
  let rank = 0;
  if (/(\.spec\.|\.test\.|^tests?\/|\/tests?\/|__snapshots__)/i.test(file)) {
    rank += 100;
  }
  if (/(^|\/)(__fixtures__|fixtures)\//i.test(file)) {
    rank += 60;
  }
  if (/\.(drawio|gif|jpe?g|png|snap|svg|webp)$/i.test(file)) {
    rank += 50;
  }
  if (/^\.github\/workflows\//.test(file)) {
    rank += 40;
  }
  if (/(\.md$|^docs\/)/i.test(file)) {
    rank += 30;
  }
  return rank;
}

