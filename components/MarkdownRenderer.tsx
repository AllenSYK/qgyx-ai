"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import clsx from "clsx";
import { normalizeLatexText } from "@/lib/latex";

type MarkdownRendererProps = {
  text?: string | null;
  content?: string | null;
  className?: string;
  as?: "span" | "div" | "p" | "h3";
};

function stripNoise(input: string) {
  let text = String(input || "");

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<think>[\s\S]*$/gi, "");

  const badLine =
    /(Wait|Actually|Let'?s|Let me double-check|This contradicts|recompute|re-evaluate|mistake|correction|double-check|错误|重新检查|再核对|矛盾|纠正|等等|实际上|我先|我来分析|让我们分析|思考过程|推理过程|内部分析)/i;

  text = text
    .split("\n")
    .filter((line) => !badLine.test(line.trim()))
    .join("\n");

  text = text.replace(/(^|\n)#{1,6}\s*(Question|题目|识别到的题目|题目识别|OCR|Image Description|图片描述)\s*\n[\s\S]*?(?=\n#{1,6}\s*(Answer|答案|Explanation|解析)|$)/gi, "$1");

  return text.trim();
}

export default function MarkdownRenderer({ text, content, className, as = "div" }: MarkdownRendererProps) {
  const raw = typeof text === "string" ? text : String(content || "");
  const rendered = normalizeLatexText(stripNoise(raw));
  const inline = as === "span";
  const Wrapper = as;

  return (
    <Wrapper
      className={clsx(
        "markdown-renderer math-text break-words text-[15px] leading-7 text-slate-950 antialiased",
        inline ? "inline" : "whitespace-pre-wrap",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false, errorColor: "#0f172a" }]]}
        components={{
          p: ({ children }) =>
            inline ? <span className="text-slate-950">{children}</span> : <p className="mb-3 leading-7 text-slate-950 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 text-slate-950">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 text-slate-950">{children}</ol>,
          li: ({ children }) => <li className="leading-7 text-slate-950">{children}</li>,
          h1: ({ children }) => <h3 className="mb-3 mt-5 rounded-2xl bg-blue-50 px-4 py-2 text-lg font-bold text-blue-950 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-3 mt-5 rounded-2xl bg-blue-50 px-4 py-2 text-base font-bold text-blue-950 first:mt-0">{children}</h3>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold text-blue-950 first:mt-0">{children}</h3>,
          strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
          code: ({ children }) => <code className="rounded-lg bg-blue-50 px-1.5 py-0.5 text-[0.95em] font-semibold text-blue-950">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-white">{children}</pre>
        }}
      >
        {rendered}
      </ReactMarkdown>
    </Wrapper>
  );
}