export function projectSlug(value: string): string {
  const slug = value
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "project";
}

export function projectTitle(value: string): string {
  const words = value
    .replace(/^@/, "")
    .replace(/[/:\\_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  return words.map(formatTitleWord).join(" ") || "Project";
}

function formatTitleWord(word: string): string {
  const acronym = word.toLowerCase();
  if (["api", "cli", "ui", "ux", "sdk", "id", "url", "http"].includes(acronym)) {
    return acronym.toUpperCase();
  }
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}
