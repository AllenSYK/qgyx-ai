"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import clsx from "clsx";
import { cleanAnalysisMarkdown } from "@/lib/analysisMarkdown";
import { normalizeLatexText } from "@/lib/latex";
import type { AppLanguage } from "@/lib/language";

type MarkdownRendererProps = {
  text?: string | null;
  content?: string | null;
  className?: string;
  as?: "span" | "div" | "p" | "h3";
  language?: AppLanguage;
};

export default function MarkdownRenderer({ text, content, className, as = "div", language }: MarkdownRendererProps) {
  const raw = typeof text === "string" ? text : String(content || "");
  const rendered = normalizeLatexText(cleanAnalysisMarkdown(raw, language));
  const inline = as !== "div";
  const Wrapper = as;

  return (
    <Wrapper
      className={clsx(
        "markdown-renderer math-text min-w-0 break-words text-[15px] leading-7 text-slate-950 antialiased",
        inline ? "inline" : "whitespace-normal",
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
          h1: ({ children }) => <h3 className="mb-3 mt-5 flex w-fit rounded-full bg-blue-50 px-4 py-2 text-lg font-bold text-blue-950 ring-1 ring-blue-100 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-3 mt-5 flex w-fit rounded-full bg-blue-50 px-4 py-2 text-base font-bold text-blue-950 ring-1 ring-blue-100 first:mt-0">{children}</h3>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold text-blue-950 first:mt-0">{children}</h3>,
          strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
          code: ({ children }) => <code className="rounded-lg bg-blue-50 px-1.5 py-0.5 text-[0.95em] font-semibold text-blue-950">{children}</code>,
          pre: ({ children }) => <pre className="my-3 max-w-full overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-white">{children}</pre>
        }}
      >
        {rendered}
      </ReactMarkdown>
    </Wrapper>
  );
}
