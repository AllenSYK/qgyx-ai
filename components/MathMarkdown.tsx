"use client";

import MarkdownRenderer from "@/components/MarkdownRenderer";

type MathMarkdownProps = {
  children: unknown;
  className?: string;
};

export function MathMarkdown({ children, className }: MathMarkdownProps) {
  return <MarkdownRenderer className={className}>{String(children ?? "")}</MarkdownRenderer>;
}

export default MathMarkdown;
