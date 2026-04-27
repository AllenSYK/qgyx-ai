"use client";

import { useMemo } from "react";
import katex from "katex";
import clsx from "clsx";

type MathTextProps = {
  text: string;
  className?: string;
  as?: "span" | "div" | "p" | "h3";
};

type Segment = {
  value: string;
  math: boolean;
  display: boolean;
};

const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

function parseMathText(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(mathPattern)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({
        value: text.slice(lastIndex, index),
        math: false,
        display: false
      });
    }

    const raw = match[0];
    const display = raw.startsWith("$$") || raw.startsWith("\\[");
    const value = raw.startsWith("$$")
      ? raw.slice(2, -2)
      : raw.startsWith("\\[")
        ? raw.slice(2, -2)
        : raw.startsWith("\\(")
          ? raw.slice(2, -2)
          : raw.slice(1, -1);

    segments.push({
      value,
      math: true,
      display
    });
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      value: text.slice(lastIndex),
      math: false,
      display: false
    });
  }

  return segments.length > 0 ? segments : [{ value: text, math: false, display: false }];
}

function renderFormula(value: string, displayMode: boolean) {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false
    });
  } catch {
    return value;
  }
}

export default function MathText({ text, className, as = "span" }: MathTextProps) {
  const segments = useMemo(() => parseMathText(text || ""), [text]);
  const Tag = as;

  return (
    <Tag className={clsx("math-text whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, index) => {
        if (!segment.math) {
          return <span key={`${segment.value}-${index}`}>{segment.value}</span>;
        }

        return (
          <span
            key={`${segment.value}-${index}`}
            className={clsx(segment.display ? "my-2 block overflow-x-auto py-1" : "inline-block max-w-full align-baseline")}
            dangerouslySetInnerHTML={{
              __html: renderFormula(segment.value, segment.display)
            }}
          />
        );
      })}
    </Tag>
  );
}
