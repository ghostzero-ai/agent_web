import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MarkdownMessageProps = {
  content: string;
};

function normalizeProseLine(line: string): string {
  let result = "";
  let index = 0;

  while (index < line.length) {
    if (line[index] === "`") {
      let endOfTicks = index;
      while (line[endOfTicks] === "`") endOfTicks += 1;
      const delimiter = line.slice(index, endOfTicks);
      const closingIndex = line.indexOf(delimiter, endOfTicks);
      if (closingIndex === -1) return result + line.slice(index);
      result += line.slice(index, closingIndex + delimiter.length);
      index = closingIndex + delimiter.length;
      continue;
    }

    const delimiter = line.slice(index, index + 2);
    if (delimiter === "\\(" || delimiter === "\\)") {
      result += "$";
      index += 2;
      continue;
    }
    if (delimiter === "\\[" || delimiter === "\\]") {
      result += "\n$$\n";
      index += 2;
      continue;
    }

    result += line[index];
    index += 1;
  }

  return result;
}

/**
 * DeepSeek 等模型经常输出 \(...\) / \[...\]，而 remark-math 解析 $ 定界符。
 * 只转换 Markdown prose；代码围栏和行内代码必须保持原样。
 */
export function normalizeMathDelimiters(markdown: string): string {
  let fence: { marker: "`" | "~"; length: number } | null = null;

  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (
          fenceMatch &&
          fenceMatch[1][0] === fence.marker &&
          fenceMatch[1].length >= fence.length
        ) {
          fence = null;
        }
        return line;
      }

      if (fenceMatch) {
        fence = {
          marker: fenceMatch[1][0] as "`" | "~",
          length: fenceMatch[1].length,
        };
        return line;
      }

      return normalizeProseLine(line);
    })
    .join("\n");
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const normalizedContent = normalizeMathDelimiters(content);

  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => {
            void node;
            return (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            );
          },
          code: ({ node, className, ...props }) => {
            void node;
            return (
              <code
                {...props}
                className={`${className ?? ""} rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10`}
              />
            );
          },
          pre: ({ node, ...props }) => {
            void node;
            return (
              <pre
                {...props}
                className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-zinc-100 dark:bg-zinc-900"
              />
            );
          },
          table: ({ node, ...props }) => {
            void node;
            return (
              <div className="overflow-x-auto">
                <table {...props} />
              </div>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
