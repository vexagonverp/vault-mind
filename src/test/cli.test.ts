import path from "node:path";
import os from "node:os";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { createProgram, isCliEntrypoint } from "../cli.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test("registers the public commander commands", () => {
  expect(createProgram(repoRoot).commands.map((command) => command.name())).toEqual([
    "commands",
    "build",
    "init",
    "health",
    "architect",
    "print",
    "run",
    "version",
  ]);
});

test("build command defaults to codex-cli", () => {
  expect(command("build").opts()).toMatchObject({
    platform: "codex-cli",
  });
});

test("init command only accepts a vault path option", () => {
  expect(command("init").options.map((option) => option.long)).toEqual(["--path"]);
});

test("architect command defaults to the local vault", () => {
  expect(command("architect").opts()).toMatchObject({
    vault: "vault",
  });
});

test("CLI entrypoint accepts symlinked global bins", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vaultmind-cli-"));
  const target = path.join(root, "cli.js");
  const linked = path.join(root, "vaultmind");

  await writeFile(target, "#!/usr/bin/env node\n", "utf8");
  await symlink(target, linked);

  expect(isCliEntrypoint(linked, target)).toBe(true);
});

function command(name: string) {
  const found = createProgram(repoRoot).commands.find((item) => item.name() === name);
  if (found === undefined) {
    throw new Error(`Missing command: ${name}`);
  }
  return found;
}
