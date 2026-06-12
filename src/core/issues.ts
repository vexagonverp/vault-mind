/** Count issues per human-readable label, e.g. `{ "Broken links": 3 }`. */
export function countIssuesByLabel<T extends string>(
  issues: Array<{ type: T }>,
  labels: Record<T, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    const label = labels[issue.type];
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}
