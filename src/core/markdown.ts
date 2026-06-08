/** Render `items` as a markdown bullet list, falling back to a single `empty` bullet. */
export function renderBulletList(items: string[], empty: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}
