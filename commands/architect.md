---
description: Scan a codebase and write a maintained set of refreshable architecture notes into the vault
category: meta
triggers_en: ["document this codebase", "architect this project", "map this code into my vault", "generate architecture notes", "refresh architecture docs"]
---

## For future agent
Use this workflow to turn a software project into maintained architecture notes
that future agents can use without re-reading the whole codebase.

This is a hybrid workflow:

- `vaultmind architect` owns the safe scaffold and generated scan facts.
- The agent decides meaningful architecture notes from code and docs.
- The agent may add researched synthesis, rationale, risks, and follow-up notes.
- Human notes stay separate and should be preserved carefully.

## 1. Resolve Inputs

Use the repo path from the user if one is provided. Otherwise infer it from the
conversation or ask for the repo path.

Use the current vault unless the user gives a different vault path.

## 2. Run The Canonical Scan

Run this from the `vault-mind` repo or from any shell where `vaultmind` is on
`PATH`:

```bash
vaultmind architect --repo <repo-path> --vault <vault-path>
```

If the command cannot run, stop and report the blocker. Do not hand-write
replacement architecture files.

## 3. Preserve The Structure

The CLI writes architecture notes under:

```text
Architecture/<repo-slug>/
```

Never dump project notes directly into the root `Architecture/` folder.

The CLI-created note set is:

- `<Project> - Overview.md`
- `<Project> - Scan facts.md`
- `<Project> - Key decisions.md`

The CLI does not create module notes from folder names. Folders such as `src`,
`utils`, `model`, or `app/src` are scan facts, not architecture by themselves.
If a meaningful architecture note is useful, create it from code-backed agent
analysis and link it from the overview.

## 4. Respect Ownership Blocks

Every architecture note can have three ownership zones:

```text
<!-- @generated:start -->
CLI-owned scan output. Reruns may replace this.
<!-- @generated:end -->

<!-- @agent:start -->
Agent-owned synthesis, source-backed interpretation, risks, and follow-ups.
<!-- @agent:end -->

<!-- @user:start -->
Human notes.
<!-- @user:end -->
```

Rules:

- Replace only `@generated` by rerunning the CLI.
- Add agent analysis only inside `@agent`.
- Do not put agent analysis in `@user`.
- Do not edit `@user` unless the user explicitly asks.
- If `@agent` is missing, add it after `@generated` and before `@user`.
- If `@user` is missing, add an empty user block at the end.

## 5. Document Source-Backed Findings

After the CLI scan, inspect the codebase and document useful findings in
`@agent`. For a readable software repo, stopping after the CLI summary is
incomplete.

Minimum source inspection:

- README and docs that describe the project
- manifests and config files surfaced by the scan
- entry points, routes, handlers, pages, or jobs surfaced by the repo
- the main source areas listed in `<Project> - Scan facts.md`

Minimum vault output for a normal repo:

- Overview `@agent`: source-backed orientation and links to any agent-created
  architecture notes
- Key decisions `@agent`: source-backed decision candidates, unknowns, and
  follow-up questions
- Additional architecture notes when source inspection reveals meaningful
  runtime flows, domains, integrations, infrastructure, or data models

Strongly prefer focused graph nodes over one giant overview. For a non-trivial
repo, one or more extra architecture notes is expected unless source inspection
shows the project is genuinely tiny.

Useful graph node candidates:

- runtime flow, request flow, page flow, or job/event flow
- domain model, state model, cache model, or persistence model
- API surface, route group, page group, or user workflow
- external integration with code-backed behavior
- infrastructure, deployment, observability, or security boundary
- cross-cutting subsystem that multiple source areas depend on

Bad graph nodes:

- folder names by themselves, such as `src`, `components`, `utils`, `lib`, or
  `app/src`
- general technology terms, such as React, DynamoDB, API Gateway, or GitHub
  Actions, unless the project has a real source-backed architecture note about
  how that technology is used
- concepts you have not verified in source, docs, config, or manifests

A generic stack summary is not enough. A claim like "CI/CD uses GitHub Actions"
must cite the workflow files or docs actually read; `CI workflows: yes` from the
scan is only a pointer to inspect, not final evidence.

Good additions:

- important runtime flow not obvious from the scan
- cross-module dependencies
- deployment or infrastructure facts
- important decisions visible in code, README, docs, or config
- risks, unknowns, and follow-up questions

For each important claim, include evidence:

- source file paths, config paths, docs paths, or URLs
- commit hashes only if you actually inspected git history
- `confidence: speculation` for inferred rationale, intent, personas, or risks
- `TBD` for unknown facts instead of filling gaps with plausible text

Create extra notes only from meaningful source-backed concepts, not from folder
names. Link every extra note from the overview and link it back to the overview.

## 6. Anti-Fabrication Rules

Describe only what the scan, manifests, docs, config, git history, or source
files actually show.

Never invent:

- modules, packages, services, tables, queues, APIs, or external dependencies
- owners, teams, users, personas, business rationale, or roadmap intent
- data flow, runtime behavior, failure modes, or architecture decisions
- absence of a file, concept, dependency, or link before searching for it

If the scan is thin, keep the notes short. Do not pad. Say what is unknown and
what should be inspected next.

## 7. Search-Completeness Rules

Before claiming something is missing or absent:

- search filenames and content with `rg` or an equivalent fast search
- inspect likely manifests and docs such as `package.json`, README files,
  config folders, infrastructure folders, and route/handler entry points
- state the search scope if the absence matters

Do not claim exhaustive certainty unless you actually searched the relevant
paths.

## 8. Graph Rules

- The project overview note must link every sibling architecture note.
- Every module or key-decision note must link back to the project overview note.
- Extra agent-created architecture notes must link back to the overview and at
  least one related sibling note.
- Do not leave architecture notes orphaned.

## 9. Report Back

Summarize:

- the repo scanned
- files written or refreshed
- which source-backed findings were added
- any blockers or follow-up questions

## AI-first Rule

Every note created or updated by this workflow must keep frontmatter, a
`## For future agent` preamble, source paths or URLs for important claims, and
confidence markers for inference.

Use wikilinks only for existing notes or notes you intentionally create. Do not
create phantom graph nodes for general technology terms such as cloud services,
databases, frameworks, or libraries. Use plain text unless the concept has a
real vault note.

## Anti-Fabrication Rule

Search exhaustively before claiming any note, file, command, module, dependency,
service, or repo path is absent. False absence is the most common failure mode.
Never invent facts, entities, or dates; mark unknowns as `TBD`. See the
anti-fabrication and search-completeness rules in `references/ai-first-rules.md`.
