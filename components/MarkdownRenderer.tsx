"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { ElementType, ReactNode } from "react";

type Props = {
  content?: string | null;
  text?: string | null;
  children?: ReactNode;
  className?: string;
  as?: ElementType;
  language?: unknown;
  [key: string]: unknown;
};

function toRemarkMathSyntax(input: string) {
  let output = "";
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("\\[", index)) {
      const end = input.indexOf("\\]", index + 2);

      if (end === -1) {
        output += input.slice(index);
        break;
      }

      output += `\n$$\n${input.slice(index + 2, end).trim()}\n$$\n`;
      index = end + 2;
      continue;
    }

    if (input.startsWith("\\(", index)) {
      const end = input.indexOf("\\)", index + 2);

      if (end === -1) {
        output += input.slice(index);
        break;
      }

      output += `$${input.slice(index + 2, end).trim()}$`;
      index = end + 2;
      continue;
    }

    output += input[index];
    index += 1;
  }

  return output;
}

export default function MarkdownRenderer({
  content,
  text,
  children,
  className,
  as = "div"
}: Props) {
  const value = toRemarkMathSyntax(String(content ?? text ?? children ?? ""));
  const Wrapper = as as ElementType;
  const inline = as === "span";
  const wrapperClassName = ["markdown-renderer math-text", className].filter(Boolean).join(" ");

  return (
    <Wrapper className={wrapperClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) =>
            inline ? <span className="leading-8">{children}</span> : <p className="my-2 leading-8">{children}</p>,
          li: ({ children }) => <li className="my-1 leading-8">{children}</li>
        }}
      >
        {value}
      </ReactMarkdown>
    </Wrapper>
  );
}
