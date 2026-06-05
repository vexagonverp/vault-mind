# vault-mind

An AI operating layer for a local Obsidian vault.

`vault-mind` keeps a small vault inside this repo, generates agent instructions
for Codex and Gemini, and gives both agents deterministic workflows for common
vault tasks.

The local vault lives at:

```text
vault/
```

That folder is ignored by git, so your personal notes and generated agent files
stay local.

## Quick Start

```bash
pnpm install
pnpm run link
pnpm vault:init
pnpm codex
pnpm gemini
pnpm vault:health
```

This installs the local `vaultmind` command, creates the minimal vault files,
generates Codex/Gemini agent files, and checks the vault for structure issues.

The `pnpm run link` step matters because generated agent workflows call
`vaultmind`. Without it, Codex and Gemini can still read the vault, but they
cannot run the deterministic workflows unless you manually give them repo-local
`pnpm` commands.

Then open the vault in Obsidian:

```text
vault/
```

## Use With Codex Or Gemini

First confirm the CLI is available:

```bash
vaultmind --help
```

Start the agent from inside the vault:

```bash
cd vault
codex
```

or:

```bash
cd vault
gemini
```

Both agents read `AGENTS.md`. Generated platform files live in:

```text
vault/.agents/
vault/.gemini/
```

Use the generated workflow names for each agent:

```text
Codex:
$vault-mind-obsidian-health
$vault-mind-obsidian-init
$vault-mind-obsidian-architect

Gemini:
/vault-mind-obsidian-health
/vault-mind-obsidian-init
/vault-mind-obsidian-architect
```

Codex gets these as skills under `.agents/`. Gemini gets them as slash commands
under `.gemini/commands/`. The old short slash commands like `/obsidian-health`
are not generated.

## Common Tasks

Check the local vault:

```bash
pnpm vault:health
```

Generate the architecture scaffold and scan facts for another repo into this
vault:

```bash
pnpm vault:architect --repo /path/to/repo
```

That command is the scaffold, not the full documentation pass. For source-backed
findings, use `$vault-mind-obsidian-architect` in Codex or
`/vault-mind-obsidian-architect` in Gemini and point it at the repo. The agent
should inspect source files and write findings into `@agent` blocks with
evidence and confidence markers.

Regenerate agent files:

```bash
pnpm codex
pnpm gemini
```

## CLI Install Notes

Install the CLI globally from this repo:

```bash
pnpm run link
vaultmind --help
```

Do not use `pnpm link --global`; current pnpm expects a directory argument for
that command. The repo script builds first, then runs:

```bash
pnpm add -g .
```

If pnpm says the global bin directory is not in `PATH`, run:

```bash
pnpm setup
```

Then restart your shell and run `pnpm run link` again.

You can skip global install only if agents will not run workflows themselves and
you plan to run the repo-local `pnpm` scripts manually.

## CLI Commands

```bash
vaultmind init --path /path/to/vault
vaultmind build --platform codex-cli --out /path/to/vault
vaultmind build --platform gemini-cli --out /path/to/vault
vaultmind health --path /path/to/vault
vaultmind architect --repo /path/to/repo --vault /path/to/vault
```

Repo-local shortcuts target `./vault`:

```bash
pnpm vault:init
pnpm codex
pnpm gemini
pnpm vault:health
pnpm vault:architect --repo /path/to/repo
```

## Dependency Policy

- Runtime dependencies: `commander` and `gray-matter`.
- Dev dependencies: TypeScript, ESLint, and Vitest.
- Avoid adding packages unless they remove real complexity or risk.
