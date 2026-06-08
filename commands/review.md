---
description: Red-team agent-authored findings against the source they cite - deterministic evidence gate first, then parallel skeptic subagents that try to refute each claim
category: meta
triggers_en: ["technical review", "red team this codebase", "verify the architecture notes", "stress test these findings", "review the anti-patterns"]
---

## For future agent
Use this workflow to verify findings that another agent wrote into the vault -
architecture notes from `$vault-architect`, anti-pattern reviews, or any note
with an `@agent` block. The goal is the opposite of authoring: prove the
findings wrong before they are trusted.

This is a hybrid workflow:

- `vaultmind review` owns the deterministic evidence gate.
- Parallel skeptic subagents own the adversarial judgement.
- The verdict, with citations, is written back into the vault.

Do not be agreeable. A finding survives only if its cited evidence actually
supports it in the source. If you cannot open the cited source, the finding is
unverified, not confirmed.

## 1. Resolve Inputs

The optional argument is a target: a vault path, an `Architecture/<slug>/`
folder, a single note, or a repo whose review notes you should check. If none is
given, infer the target from the conversation, then ask if it is still unclear.

Use the current vault unless the user gives a different vault path.

## 2. Run The Deterministic Gate

Run from any shell where `vaultmind` is on `PATH`:

```bash
vaultmind review --path <vault-path> --json
```

This reports, per note with an `@agent` block:

- `unfilled_agent_block` - the agent never replaced the template. The review is
  not done; do not proceed as if findings exist.
- `missing_evidence` - findings carry no `Evidence:` marker.
- `broken_evidence_path` - a cited source path does not exist in `source-repo`.

Triage every gate issue before the red-team pass. A `broken_evidence_path` is an
automatic refutation - the claim cites a file that is not there. If the command
cannot run, stop and report the blocker. Do not hand-wave the gate.

## 3. Extract The Claims

From each surviving `@agent` block, list the discrete claims. A claim is one
checkable assertion: a runtime flow, a dependency, a decision, an anti-pattern,
or a risk. Pair each claim with the `Evidence:` it cites and its stated
`confidence:`.

## 4. Red-Team In Parallel

For each claim, spawn parallel skeptic subagents. Each gets one lens and is told
to refute, not to agree:

- **Evidence agent**: open every cited source path or URL. Does the file, at the
  cited lines, actually say what the claim says? Quote the relevant lines. If the
  evidence does not support the claim, refute it.
- **Counter-evidence agent**: search the source repo for code, config, docs, or
  history that contradicts the claim. A claim that ignores a contradicting source
  is unsafe.
- **Speculation agent**: is the claim inferred rationale, intent, persona, or
  risk presented as fact? If so it must carry `confidence: speculation`. Flag
  any inference dressed as a confirmed finding.

Default to refuted when uncertain. A claim is confirmed only when the evidence
agent can quote source that directly supports it and the counter-evidence agent
finds nothing that overturns it.

## 5. Verdict

Synthesize one verdict per claim:

- **Confirmed**: cited source directly supports it. Keep as is.
- **Needs evidence**: plausible but the cited evidence is thin, missing, or only
  a pointer. Downgrade confidence or add the missing source paths.
- **Refuted**: cited evidence does not support it, a source contradicts it, or
  the path is broken. Remove the claim or rewrite it to match the source, and
  record why.

Edit findings only inside `@agent`. Never touch `@user`. Preserve the
`@generated` block. When you remove or rewrite a refuted claim, leave a short
`confidence: speculation` note explaining the refutation so the next agent does
not re-add it.

## 6. Report And Log

Summarize:

- target reviewed and how many notes had `@agent` blocks
- deterministic gate issues, by type
- per claim: confirmed / needs-evidence / refuted, with the deciding source path
- which findings were edited, downgraded, or removed

Append a one-line entry to `log.md` under today's date noting the review and the
confirmed / refuted counts. If the vault has a project hub or daily note for the
target, link the review from it; if not, report that the backlink was skipped.

## AI-first Rule

Every note edited by this workflow keeps frontmatter, a `## For future agent`
preamble, `Evidence:` source paths or URLs for surviving claims, and
`confidence:` markers for any inference. Use wikilinks only for notes that exist
or that you intentionally create.

## Anti-Fabrication Rule

Search exhaustively before claiming a source, file, or contradiction is absent.
False absence is the most common failure mode - and for a red team it is the
worst, because it lets a wrong finding survive. Never invent sources, quotes, or
line numbers; mark unverifiable claims as `TBD` and treat them as not yet
confirmed. See the anti-fabrication and search-completeness rules in
`references/ai-first-rules.md`.
