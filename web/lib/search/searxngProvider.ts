import type { WebCitation, WebSearchProvider } from "./webSearch";

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  publishedDate?: unknown;
};

type SearxngResponse = { results?: unknown };

const MAX_RESPONSE_BYTES = 2_000_000;

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function safeHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class SearxngProvider implements WebSearchProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 8_000,
    private readonly maxResults = 6,
  ) {}

  async search(query: string, signal?: AbortSignal): Promise<WebCitation[]> {
    const endpoint = new URL("search", `${this.baseUrl.replace(/\/+$/u, "")}/`);
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("safesearch", "1");
    endpoint.searchParams.set("language", "all");

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: combinedSignal,
    });
    if (!response.ok) throw new Error(`Search provider returned ${response.status}.`);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error("Search response is too large.");
    const payload = JSON.parse(text) as SearxngResponse;
    if (!Array.isArray(payload.results)) return [];

    const fetchedAt = new Date().toISOString();
    const seen = new Set<string>();
    const normalized: WebCitation[] = [];
    for (const raw of payload.results as SearxngResult[]) {
      const url = safeHttpUrl(raw.url);
      const title = cleanText(raw.title, 500);
      if (!url || !title || seen.has(url.href)) continue;
      seen.add(url.href);
      normalized.push({
        id: `S${normalized.length + 1}`,
        title,
        url: url.href,
        snippet: cleanText(raw.content, 1_500),
        source: url.hostname.replace(/^www\./u, ""),
        publishedAt: isoDateOrNull(raw.publishedDate),
        fetchedAt,
      });
      if (normalized.length >= this.maxResults) break;
    }
    return normalized;
  }
}

export function createConfiguredWebSearchProvider(): WebSearchProvider | undefined {
  const baseUrl = process.env.WEB_SEARCH_BASE_URL?.trim();
  if (!baseUrl) return undefined;
  return new SearxngProvider(baseUrl);
}
