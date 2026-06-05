import matter from "gray-matter";

export function parseFrontmatter(text: string): matter.GrayMatterFile<string> {
  return matter(text);
}

export function hasFrontmatter(text: string): boolean {
  return matter.test(text);
}
