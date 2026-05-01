"use client";

import MarkdownRenderer from "@/components/MarkdownRenderer";

type MathTextProps = {
  text: string;
  className?: string;
  as?: "span" | "div" | "p" | "h3";
};

export default function MathText({ text, className, as = "span" }: MathTextProps) {
  return <MarkdownRenderer text={text} className={className} as={as} />;
}
