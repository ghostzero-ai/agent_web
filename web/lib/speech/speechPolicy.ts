export const SPEECH_CHARACTER_LIMIT = 5_000;
export const SPEECH_CHUNK_LIMIT = 220;

export type PreparedSpeech = {
  text: string;
  truncated: boolean;
};

export function prepareSpeechText(markdown: string): PreparedSpeech {
  const prose = markdown
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, " 代码块已省略。 ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]*\)/gu, "$1")
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/gu, " 公式。 ")
    .replace(/\$[^$\n]+\$|\\\([^\n]*?\\\)/gu, " 公式 ")
    .replace(/\[S(\d+)\]/giu, " 来源 $1 ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[`*_>#~|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (prose.length <= SPEECH_CHARACTER_LIMIT) {
    return { text: prose, truncated: false };
  }
  return {
    text: prose.slice(0, SPEECH_CHARACTER_LIMIT).replace(/\s+\S*$/u, "").trim(),
    truncated: true,
  };
}

export function splitSpeechText(
  text: string,
  limit = SPEECH_CHUNK_LIMIT,
): string[] {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const punctuation = Math.max(
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("；"),
      window.lastIndexOf("，"),
      window.lastIndexOf(". "),
      window.lastIndexOf(", "),
      window.lastIndexOf(" "),
    );
    const cut = punctuation >= Math.floor(limit * 0.45) ? punctuation + 1 : limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
