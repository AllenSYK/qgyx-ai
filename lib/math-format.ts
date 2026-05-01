import { normalizeLatexText } from "@/lib/latex";

export type MathSegment = {
  value: string;
  math: boolean;
  display: boolean;
};

export const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

const superscriptMap: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  n: "ⁿ"
};

export function normalizeMathTextForDisplay(text: string) {
  return normalizeLatexText(text || "").replace(/\\\\/g, "\\").replace(/\r\n/g, "\n");
}

export function splitMathText(text: string): MathSegment[] {
  const normalized = normalizeMathTextForDisplay(text);
  const segments: MathSegment[] = [];
  let lastIndex = 0;

  for (const match of normalized.matchAll(mathPattern)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({
        value: normalized.slice(lastIndex, index),
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

  if (lastIndex < normalized.length) {
    segments.push({
      value: normalized.slice(lastIndex),
      math: false,
      display: false
    });
  }

  return segments.length > 0 ? segments : [{ value: normalized, math: false, display: false }];
}

function toSuperscript(value: string) {
  return Array.from(value.replace(/[{}]/g, ""))
    .map((char) => superscriptMap[char] || char)
    .join("");
}

export function latexToPdfText(input: string) {
  return input
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\pi/g, "π")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/([A-Za-z0-9)\]}])\^(\{?[0-9a-zA-Z+-]+\}?)/g, (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`)
    .replace(/\\left|\\right/g, "")
    .replace(/\\/g, "");
}

export function mathTextToPdfText(text: string) {
  return splitMathText(text)
    .map((segment) => (segment.math ? latexToPdfText(segment.value) : segment.value))
    .join("");
}
