const LATEX_COMMANDS =
  "frac|dfrac|tfrac|sqrt|left|right|cdot|times|quad|qquad|Rightarrow|Leftarrow|rightarrow|leftarrow|le|ge|neq|approx|sin|cos|tan|arcsin|arccos|arctan|ln|log|pi|theta|alpha|beta|gamma|Delta|delta|lambda|mu|rho|sigma|omega|vec|mathbf|overline|boxed|angle|triangle|int|sum|lim|text";

const PROSE_WORDS = [
  "where",
  "given",
  "substitute",
  "then",
  "because",
  "and",
  "or",
  "therefore",
  "vertex",
  "translation",
  "answer",
  "explanation",
  "solution",
  "point",
  "points",
  "line",
  "lines",
  "find",
  "show",
  "calculate",
  "normal",
  "tangent",
  "curve"
];

type Segment = {
  value: string;
  math: boolean;
};

function repairBrokenSyntax(input: string) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\$/g, "$")
    .replace(/\${3,}/g, "$$")
    .replace(/\\dfrac/g, "\\frac")
    .replace(/\\tfrac/g, "\\frac")
    .replace(/\\frac\s*\$+\s*/g, "\\frac")
    .replace(/\\sqrt\s*\$+\s*/g, "\\sqrt")
    .replace(/\\boxed\s*\$+\s*/g, "\\boxed")
    .replace(/\\text\s*\$+\s*/g, "\\text")
    .replace(/\\frac\s*\{([^{}\n]+)\}\s*\$+\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\sqrt\s*\{([^{}\n]+)\}\s*\$+/g, "\\sqrt{$1}")
    .replace(/\$+(?=\})/g, "")
    .replace(/\$+\s*([,，。；;:：)）])/g, "$1")
    .replace(/([（(])\s*\$+/g, "$1")
    .replace(/^\s*\${1,2}\s*$/gm, "")
    .replace(/\$+\s*\$+/g, "$$")
    .replace(/\bsqrt\s*\(([^()\n]{1,80})\)/gi, "\\sqrt{$1}")
    .replace(/\bdy\s*\/\s*dx\b/g, "\\frac{dy}{dx}")
    .replace(/\bdx\s*\/\s*d\\theta\b/g, "\\frac{dx}{d\\theta}")
    .replace(/\bdy\s*\/\s*d\\theta\b/g, "\\frac{dy}{d\\theta}")
    .replace(/\bdx\s*\/\s*dtheta\b/g, "\\frac{dx}{d\\theta}")
    .replace(/\bdy\s*\/\s*dtheta\b/g, "\\frac{dy}{d\\theta}")
    .trim();
}

function hasCjk(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function hasLatexCommand(value: string) {
  return new RegExp(`\\\\(?:${LATEX_COMMANDS})\\b`).test(value);
}

function hasMathSignal(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (hasLatexCommand(text)) return true;
  if (/\\[A-Za-z]+/.test(text)) return true;
  if (/[=^_<>+\-*/]||||||⇒/.test(text) && /[A-Za-z0-9]/.test(text)) return true;
  if (/\b\d+\s*\/\s*\d+\b/.test(text)) return true;
  if (/\b[A-Za-z]{1,3}\s*\/\s*[A-Za-z]{1,3}\b/.test(text)) return true;
  return false;
}

function isProse(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (hasCjk(text)) return true;

  const lower = text.toLowerCase();
  if (PROSE_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(lower))) return true;

  const words = text.match(/[A-Za-z]{2,}/g) || [];
  const mathLike = hasMathSignal(text);

  if (!mathLike && words.length >= 1) return true;
  if (!hasLatexCommand(text) && words.length >= 3) return true;

  return false;
}

function shouldKeepMath(value: string) {
  const clean = repairBrokenSyntax(value).trim();
  return Boolean(clean && hasMathSignal(clean) && !isProse(clean));
}

function wrapMath(value: string) {
  const clean = repairBrokenSyntax(value).trim();
  if (!clean || !shouldKeepMath(clean)) return clean;
  if (clean.startsWith("$") && clean.endsWith("$")) return clean;
  return `$${clean}$`;
}

function splitMathSegments(input: string): Segment[] {
  const text = String(input || "");
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("$", cursor);

    if (start === -1) {
      segments.push({ value: text.slice(cursor), math: false });
      break;
    }

    if (start > cursor) {
      segments.push({ value: text.slice(cursor, start), math: false });
    }

    const display = text.startsWith("$$", start);
    const delimiter = display ? "$$" : "$";
    const end = text.indexOf(delimiter, start + delimiter.length);

    if (end === -1) {
      segments.push({ value: text.slice(start), math: false });
      break;
    }

    segments.push({
      value: text.slice(start, end + delimiter.length),
      math: true
    });
    cursor = end + delimiter.length;
  }

  return segments;
}

function normalizeExistingMath(segment: string) {
  if (segment.startsWith("$$") && segment.endsWith("$$")) {
    const fixed = repairBrokenSyntax(segment.slice(2, -2)).trim();
    if (!fixed) return "";
    if (!shouldKeepMath(fixed)) return fixed;
    return `$$${fixed}$$`;
  }

  if (segment.startsWith("$") && segment.endsWith("$")) {
    const fixed = repairBrokenSyntax(segment.slice(1, -1)).trim();
    if (!fixed) return "";
    if (!shouldKeepMath(fixed)) return fixed;
    return `$${fixed}$`;
  }

  return segment;
}

function wrapBareMathInText(input: string) {
  let next = input;

  next = next.replace(
    /(\\frac\{[^{}\n]+\}\{[^{}\n]+\}|\\sqrt\{[^{}\n]+\}|\\boxed\{[^{}\n]+\}|\\left\.?\s*[^，。；;\n]{1,160}?\\right\.?\|?|\\angle\s*[A-Za-z0-9]+)/g,
    (match) => wrapMath(match)
  );

  next = next.replace(/\bdy\s*\/\s*dx\b/g, () => wrapMath("\\frac{dy}{dx}"));
  next = next.replace(/\bdx\s*\/\s*d\\theta\b/g, () => wrapMath("\\frac{dx}{d\\theta}"));
  next = next.replace(/\bdy\s*\/\s*d\\theta\b/g, () => wrapMath("\\frac{dy}{d\\theta}"));

  next = next.replace(
    /(\\(?:sin|cos|tan|theta|pi|Rightarrow|cdot|times|quad)\b(?:\^\{?[A-Za-z0-9+\-]+\}?|[A-Za-z0-9\\{}^_\s+\-*/=().]){0,80})/g,
    (match) => wrapMath(match)
  );

  next = next.replace(
    /(^|[\s（(，。；、])([A-Za-z]\^[{]?[0-9A-Za-z+\-]+[}]?)/g,
    (_match, prefix: string, formula: string) => `${prefix}${wrapMath(formula)}`
  );

  next = next.replace(
    /(^|[\s（(，。；、])([A-Za-z][ \t]*=[ \t]*[A-Za-z0-9\\{}^_+\-*/(). \t]{1,80})/g,
    (_match, prefix: string, formula: string) => `${prefix}${wrapMath(formula)}`
  );

  return next;
}

function normalizeMathBlocks(value: string) {
  return splitMathSegments(repairBrokenSyntax(value))
    .map((segment) => (segment.math ? normalizeExistingMath(segment.value) : wrapBareMathInText(segment.value)))
    .join("")
    .replace(/\$\$([,，。；;:：])/g, "$1")
    .replace(/([A-Za-z0-9}\)])\$\$(?=[,，。；;:：])/g, "$1")
    .replace(/([A-Za-z0-9}\)])\$\$(?=\s*$)/gm, "$1")
    .replace(/^\s*\${1,2}\s*$/gm, "")
    .replace(/\$\s+\$/g, "")
    .trim();
}

export function normalizeLatexText(input: string) {
  return normalizeMathBlocks(String(input || "")).trim();
}

export const fixLatex = normalizeLatexText;