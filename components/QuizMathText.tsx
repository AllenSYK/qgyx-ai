"use client";

import type { ElementType } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { normalizeQuizMathText } from "@/lib/quiz-math";

type QuizMathTextProps = {
  text?: string | null;
  className?: string;
  as?: ElementType;
};

export function InlineQuizMathText({ text, className }: Omit<QuizMathTextProps, "as">) {
  return (
    <MarkdownRenderer
      as="span"
      text={normalizeQuizMathText(text || "")}
      className={className || "inline"}
    />
  );
}

export default function QuizMathText({ text, className, as = "div" }: QuizMathTextProps) {
  return (
    <MarkdownRenderer
      as={as}
      text={normalizeQuizMathText(text || "")}
      className={className}
    />
  );
}
