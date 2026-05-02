"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { safeRenderMathText } from "../lib/latex";

type MathMarkdownProps = {
  children: unknown;
  className?: string;
};

export function MathMarkdown({ children, className }: MathMarkdownProps) {
  const text = safeRenderMathText(children);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="leading-8">{children}</p>,
          li: ({ children }) => <li className="leading-8">{children}</li>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default MathMarkdown;
