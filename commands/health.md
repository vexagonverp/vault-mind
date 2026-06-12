---
description: Audit an Obsidian vault for duplicate notes, stale tasks, missing frontmatter, empty folders, broken wikilinks, orphan notes, and template leftovers
category: meta
triggers_en: ["vault health", "check my vault", "audit vault", "find vault issues"]
---

## For future agent
Use this workflow to inspect vault structure and report issues. It is read-only;
do not patch the vault while running health.

Run from any shell where `vaultmind` is on `PATH`:

```bash
vaultmind health --path <vault-path>
```

Report duplicates, stale tasks, missing frontmatter, empty folders, broken
wikilinks, orphan notes, and template leftovers. Do not edit the vault
automatically.

Do not treat unresolved graph nodes as real notes. A wikilink to a missing note
is a broken link, not useful structure. Prefer plain text for general technology
terms unless the vault intentionally has a note for that concept.

## Anti-Fabrication Rule

Search exhaustively before claiming any note, file, link target, workflow, or
vault path is absent. False absence is the most common failure mode. Never
invent facts, entities, or dates; mark unknowns as `TBD`. See the
anti-fabrication and search-completeness rules in `references/ai-first-rules.md`.
