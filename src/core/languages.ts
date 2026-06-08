export const languagesByExtension: Record<string, string> = {
  ".py": "Python",
  ".js": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".jsx": "JavaScript",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".sh": "Shell",
  ".sql": "SQL",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".md": "Markdown",
};

// Code extensions, excluding Markdown. Used to separate real source files from
// docs, manifests, and config when ranking files.
export const sourceExtensions = new Set(
  Object.keys(languagesByExtension).filter((extension) => extension !== ".md"),
);
