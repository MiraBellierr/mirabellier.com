import { all, createLowlight } from "lowlight";

export const lowlight = createLowlight(all);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  docker: "dockerfile",
  cs: "csharp",
};

const PREFERRED_LANGUAGES = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "bash",
  "json",
  "html",
  "css",
  "scss",
  "sql",
  "yaml",
  "markdown",
  "swift",
  "go",
  "rust",
  "java",
  "kotlin",
  "php",
  "ruby",
  "c",
  "cpp",
  "csharp",
  "dockerfile",
];

const allLanguages = lowlight.listLanguages().sort((left, right) =>
  left.localeCompare(right),
);

const seenLanguages = new Set<string>();

export const CODE_BLOCK_LANGUAGES = [
  ...PREFERRED_LANGUAGES,
  ...allLanguages,
].filter((language) => {
  if (seenLanguages.has(language)) {
    return false;
  }

  seenLanguages.add(language);
  return true;
});

const SPECIAL_LANGUAGE_LABELS: Record<string, string> = {
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  dockerfile: "Dockerfile",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  markdown: "Markdown",
  php: "PHP",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  sql: "SQL",
  swift: "Swift",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
};

export const normalizeCodeBlockLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase();

  if (!normalized || normalized === "auto") {
    return "";
  }

  return LANGUAGE_ALIASES[normalized] ?? normalized;
};

export const isSupportedCodeBlockLanguage = (language: string) => {
  if (!language) {
    return true;
  }

  return lowlight.registered(language);
};

export const formatCodeBlockLanguage = (language?: string | null) => {
  if (!language) {
    return "Auto";
  }

  return (
    SPECIAL_LANGUAGE_LABELS[language] ??
    language
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
};
