"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import clsx from "clsx";
import { normalizeLatexText } from "@/lib/latex";

type MarkdownRendererProps = {
  text?: string | null;
  className?: string;
  as?: "span" | "div" | "p" | "h3";
};

function stripThinkingText(input: string) {
  let text = String(input || "");

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<think>[\s\S]*$/gi, "");

  text = text.replace(
    /(^|\n)#{0,6}\s*(思考过程|推理过程|推理草稿|内部思考|内部推理|Thinking|Reasoning|Chain of Thought|Analysis)\s*[:：]?\s*[\s\S]*?(?=\n#{1,6}\s*(题目|答案|解析|涉及知识点|知识点|易错点|类似题目思路)|$)/gi,
    "$1"
  );

  text = text.replace(/^\s*(让我先思考|我先分析|我们先分析|思路如下|推理如下|Thinking:|Reasoning:).*$/gim, "");

  return text.trim();
}

export default function MarkdownRenderer({ text, className, as = "div" }: MarkdownRendererProps) {
  const content = normalizeLatexText(stripThinkingText(String(text || "")));
  const inline = as === "span";
  const Wrapper = as;

  return (
    <Wrapper className={clsx("markdown-renderer math-text break-words", inline ? "inline" : "whitespace-pre-wrap", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false, errorColor: "#1f2937" }]]}
        components={{
          p: ({ children }) =>
            inline ? <span>{children}</span> : <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          h1: ({ children }) => <h3 className="mb-2 text-lg font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="mb-2 font-semibold">{children}</h3>,
          code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.95em]">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-white">{children}</pre>
        }}
      >
        {content}
      </ReactMarkdown>
    </Wrapper>
  );
}