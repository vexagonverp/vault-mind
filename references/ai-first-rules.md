# AI-First Note Rules

Every note written for an agent-readable vault should include:

- Frontmatter with `date`, `type`, `tags`, and `ai-first: true`.
- A `## For future agent` preamble.
- Obsidian wikilinks for existing notes or notes you intentionally create.
- Source URLs and recency markers for external claims.
- Confidence levels where the text relies on inference.

## Wikilink Discipline

Do not create phantom graph nodes. Before adding a wikilink, make sure a note
with that title exists or create the note intentionally. If a term is only a
general technology, library, service, or concept and there is no vault note for
it, write it as plain text instead of `[[wikilinking]]` it.

## Anti-Fabrication

Search exhaustively before claiming any note, person, file, command, workflow,
module, dependency, service, or path is absent. False absence is the most common
failure mode.

Never invent facts, entities, dates, data flow, ownership, rationale, or
decisions. Mark unknowns as `TBD`, and mark inferred rationale or risk with
`confidence: speculation`.

## Search Completeness

Before claiming absence, search filenames and content with `rg` or the fastest
available equivalent. Inspect likely manifests, README files, config folders,
docs, and entry points. State the search scope when the claim matters.

Keep notes useful for future retrieval, not just pleasant for immediate reading.
