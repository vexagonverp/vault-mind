import { expect, test } from "vitest";
import { hasFrontmatter, parseFrontmatter } from "../frontmatter.js";

test("parses scalar and inline-array frontmatter", () => {
  const parsed = parseFrontmatter(withFrontmatter(`---
description: Check vault
category: meta
tags: [health, meta]
ai-first: true
---`));

  expect(hasFrontmatter(withFrontmatter("---\ndescription: Check vault\n---"))).toBe(true);
  expect(parsed.data.description).toBe("Check vault");
  expect(parsed.data.category).toBe("meta");
  expect(parsed.data.tags).toEqual(["health", "meta"]);
  expect(parsed.data["ai-first"]).toBe(true);
  expect(parsed.content.trim()).toBe("Body");
});

test("parses block-array frontmatter", () => {
  const parsed = parseFrontmatter(withFrontmatter(`---
tags:
  - research
  - vault
---`));

  expect(parsed.data.tags).toEqual(["research", "vault"]);
});

test("parses nested YAML frontmatter", () => {
  const parsed = parseFrontmatter(withFrontmatter(`---
related:
  people:
    - Ada
    - Grace
counts:
  notes: 2
---`));

  expect(parsed.data.related).toEqual({
    people: ["Ada", "Grace"],
  });
  expect(parsed.data.counts).toEqual({
    notes: 2,
  });
});

test("reports no frontmatter when the document has no opening delimiter", () => {
  const parsed = parseFrontmatter("# Note\n\nBody");

  expect(hasFrontmatter("# Note\n\nBody")).toBe(false);
  expect(parsed.data).toEqual({});
  expect(parsed.content).toBe("# Note\n\nBody");
});

function withFrontmatter(frontmatter: string, body = "Body"): string {
  return `${frontmatter}\n\n${body}`;
}
