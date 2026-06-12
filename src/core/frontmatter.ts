import matter from "gray-matter";

export function parseFrontmatter(text: string): matter.GrayMatterFile<string> {
  return matter(text);
}

export function hasFrontmatter(text: string): boolean {
  return matter.test(text);
}

export function frontmatterStringValue(value: unknown, fallback = ""): string {
  if (value === undefined) return fallback;
  return String(value);
}

export function frontmatterArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

/** The `source-repo` path a scanned note was generated from, if recorded. */
export function sourceRepoValue(frontmatter: Record<string, unknown>): string | undefined {
  const value = frontmatter["source-repo"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
