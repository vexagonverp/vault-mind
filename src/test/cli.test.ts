import path from "node:path";
import { symlink } from "node:fs/promises";
import { expect, test } from "vitest";
import { createProgram, isCliEntrypoint } from "../cli.js";
import { rootPath, tempDir, writePath } from "./helpers.js";

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

test("build command defaults to vault output dir", () => {
  expect(command("build").opts()).toMatchObject({
    out: "vault",
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
  const root = await tempDir("vaultmind-cli-");
  const target = rootPath(root, "cli.js");
  const linked = rootPath(root, "vaultmind");

  await writePath(root, "cli.js", "#!/usr/bin/env node\n");
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
