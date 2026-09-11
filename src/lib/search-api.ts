import { joinApi } from "@/lib/config";

export type SearchResult = {
  kind: "post" | "shrine" | "question" | "answer";
  group: string;
  id: string;
  title: string;
  href: string;
  snippet: string;
};

export async function fetchSearchResults(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const response = await fetch(
    `${joinApi("/search")}?q=${encodeURIComponent(query)}`,
    { credentials: "include", signal },
  );
  if (!response.ok) {
    throw new Error("Search failed");
  }
  const json = await response.json();
  return Array.isArray(json) ? (json as SearchResult[]) : [];
}
