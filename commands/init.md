---
description: Bootstrap the smallest useful AI-first vault base with index.md and log.md
category: meta
triggers_en: ["init vault", "bootstrap vault", "setup vault", "create local vault"]
---

## For future agent
Use this workflow to create the smallest useful vault base. Prefer the CLI so
the generated files stay consistent across agents.

Run from any shell where `vaultmind` is on `PATH`:

```bash
vaultmind init --path <vault-path>
```

Create only the missing minimal base files: `index.md` and `log.md`. Do not
create a folder taxonomy, templates, or personal placeholder notes until the
vault actually needs them. Do not overwrite existing notes.

Do not create placeholder concept notes just to satisfy graph shape. Create
concept notes only when they have useful durable content.

After init, install the agent skills and `AGENTS.md` into the vault:

```bash
vaultmind build --out <vault-path>
```

## Anti-Fabrication Rule

Search exhaustively before claiming any note, file, command, workflow, or vault
path is absent. False absence is the most common failure mode. Never invent
facts, entities, or dates; mark unknowns as `TBD`. See the anti-fabrication and
search-completeness rules in `references/ai-first-rules.md`.
