---
description: Catalog a codebase's anti-patterns ("what not to do") from git-history signals and PR review comments, with source-backed evidence
category: meta
triggers_en: ["find anti-patterns", "what not to do in this repo", "catalog tech debt", "document bad patterns", "mine PR comments for anti-patterns"]
---

## For future agent
Use this workflow to turn a repo's failure trail - its churn, its fixes, and its
code-review history - into a maintained catalog of anti-patterns that agents and
humans can avoid repeating.

This is a hybrid workflow, the same shape as `$vault-architect`:

- `vaultmind antipatterns` owns the deterministic git-history signal scan.
- The agent decides what is actually an anti-pattern, from source and PRs.
- `vaultmind review` verifies every finding cites evidence that resolves.

The CLI never decides what is an anti-pattern. A high-churn file is a lead, not
a finding. Confirm the real smell in source before you name it.

## 1. Resolve Inputs

Use the repo path from the user if one is provided. Otherwise infer it from the
conversation or ask. Use the current vault unless the user gives another.

## 2. Run The Signal Scan

```bash
vaultmind antipatterns --repo <repo-path> --vault <vault-path>
```

This writes one note at:

```text
Anti-patterns/<repo-slug>/<Project> - Anti-patterns.md
```

The generated block lists deterministic git-history signals:

- **Change hotspots** - files with the most commits (fragile or overloaded code).
- **Fix-prone files** - files most often in fix/bug/revert/hotfix commits.
- **Remediation commits** - notable reverts, hotfixes, rollbacks, workarounds.

If the command cannot run, stop and report the blocker. Do not hand-write a
replacement note.

## 3. Gather Review Evidence

The richest signal is code review. For the hotspot and fix-prone files, pull the
pull-request review comments that touched them:

```bash
gh pr list --repo <owner/repo> --state merged --limit 100 --json number,title,url
gh api repos/<owner/repo>/pulls/<n>/comments --jq '.[].body'
```

Read what reviewers actually flagged. A recurring review comment across PRs is
the strongest evidence an anti-pattern is real and not a one-off. If `gh` is not
available or the repo is not on GitHub, say so and rely on source inspection.

## 4. Confirm In Source

For each candidate, open the cited file and confirm the smell exists now. A file
can be high-churn for healthy reasons (it is a real hub). Do not promote a lead
to a finding without reading the code.

## 5. Reuse Existing Patterns (Dedup)

Before naming anything, read the root index `Anti-patterns/_Index.md` and the
`Anti-patterns/_patterns/` folder. If this repo's smell is an existing pattern,
reuse that exact `[[pattern name]]` - do not coin a synonym. Merging by meaning
is your job; the rollup only dedups by exact name. Coin a new name only for a
genuinely new pattern.

## 6. Write Findings (Instances)

Record findings only inside the `@agent` block. A finding is one *instance* of an
anti-pattern in this repo. Each needs:

- a short symptom - what the bad pattern is
- `Evidence:` a `path/to/file.ts:line`, a PR link, or a commit hash
- a `confidence:` marker - `speculation` unless a source states it directly
- a "Do instead:" fix, linking `CODING_GUIDELINES` where the repo has one

Then add one machine-readable marker line per finding so the index can roll it
up. Keep all three fields on the same line:

```text
pattern: [[Name]]; status: active; example: app/src/foo.ts:42
```

- `pattern:` - the durable pattern (reused from step 5, or new)
- `status:` - `active`, or `resolved` once the instance is fixed
- `example:` - one representative `path:line`; the index displays it and flags it
  when the path no longer resolves

Cluster findings by theme. Do not edit the `@generated` block by hand; rerun the
CLI to refresh it. Never edit `@user`.

## 7. Maintain Pattern Notes (The Durable Index)

Instances die when the code is fixed; the *pattern* is the lesson that must
survive. For each distinct pattern, create or update a durable note at:

```text
Anti-patterns/_patterns/<Pattern Name>.md
```

Give it frontmatter (`type: antipattern-pattern`, `status: active`) and a body
that opens with the one-line rule ("Don't X - do Y instead"); the index pulls
the first non-heading line as the rule. This note is the seed for
`CODING_GUIDELINES`. Every
instance's `pattern: [[Name]]` links up to it, so the pattern accumulates
evidence across repos and persists at zero instances.

Then refresh the deterministic cross-repo rollup:

```bash
vaultmind antipatterns --index --vault <vault-path>
```

This writes `Anti-patterns/_Index.md` - the durable master list: every pattern
with its rule, its examples per repo (flagged when a path no longer resolves),
and active/resolved counts. Any pattern referenced by an instance but missing a
`_patterns/<Name>.md` note is listed under "Undefined Patterns"; write the note.

## 8. Verify

```bash
vaultmind review --path <vault-path>/Anti-patterns/<repo-slug>
```

Fix every `broken_evidence_path` (the cited file does not exist) and
`missing_evidence` before reporting done. An anti-pattern whose citation does
not resolve is not a finding.

## 9. Report And Log

Summarize the repo scanned, signals surfaced, findings written (with their
evidence), and any blockers. The CLI appends a one-line entry to `log.md`; if it
cannot, report that.

## AI-first Rule

Every note keeps frontmatter, a `## For future agent` preamble, `Evidence:`
source paths or URLs for each finding, and `confidence:` markers for inference.
Use wikilinks only for notes that exist or that you intentionally create.

## Anti-Fabrication Rule

Search exhaustively before claiming a pattern, file, or review comment is
absent. Never invent file paths, PR numbers, quotes, or commit hashes; mark
unknowns as `TBD`. A churn number is not proof of a smell - cite the source line
that shows it. See the anti-fabrication and search-completeness rules in
`references/ai-first-rules.md`.
