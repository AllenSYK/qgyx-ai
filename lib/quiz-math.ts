import type { QuizQuestion, WrongQuestion } from "@/types/quiz";

const mathDelimiterPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
const latexSignalPattern =
  /\\(?:text|mathrm|operatorname|frac|dfrac|tfrac|sqrt|times|div|cdot|left|right|sin|cos|tan|cot|sec|csc|ln|log|lim|sum|prod|int|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|leq|geq|neq|approx|equiv|pm|mp|infty|in|notin|subset|subseteq|cup|cap|angle|triangle|parallel|perp|overline|vec|begin|end)\b|\^|_|[\u00b2\u00b3\u2070-\u2079\u207a\u207b\u2264\u2265\u2260\u2248\u03c0\u221a\u222b]/;
const latexCommandAfterEscapedSlashPattern =
  /\\\\(?=(text|mathrm|operatorname|frac|dfrac|tfrac|sqrt|times|div|cdot|left|right|sin|cos|tan|cot|sec|csc|ln|log|lim|sum|prod|int|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|leq|geq|neq|approx|equiv|pm|mp|infty|in|notin|subset|subseteq|cup|cap|angle|triangle|parallel|perp|overline|vec|begin|end)\b|\(|\)|\[|\]|\$)/g;
const unitLatexPattern =
  /((?:[-+]?\d+(?:\.\d+)?|[A-Za-z](?!\.\s)(?:_[A-Za-z0-9{}]+)?)(?:[0-9A-Za-z+\-*/=().,\s\\{}^_]*?)\\text\{[^}]+\}(?:[0-9A-Za-z+\-*/=().,\s\\{}^_]*)?)/g;
const latexEnvironmentPattern =
  /(\\begin\{(aligned|array|matrix|cases|pmatrix|bmatrix|vmatrix|smallmatrix)\}[\s\S]*?\\end\{\2\})/g;
const generalLatexPattern =
  /((?:\\(?:frac|dfrac|tfrac)\{[^{}]+\}(?:\{[^{}]+\})?|\\sqrt(?:\[[^\]]+\])?\{[^{}]+\}|\\(?:sin|cos|tan|cot|sec|csc|ln|log|lim|sum|prod|int|left|right|times|div|cdot|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|leq|geq|neq|approx|equiv|pm|mp|infty|in|notin|subset|subseteq|cup|cap|angle|triangle|parallel|perp|overline|vec)\b|[A-Za-z0-9)\]}]\s*[\^_]\s*\{?[A-Za-z0-9+\-]+\}?)(?:[0-9A-Za-z+\-*/=<>()[\].,;:\s\\{}^_|&]*)?)/g;
const bareEquationPattern = /([A-Za-z][A-Za-z0-9_]*\s*=\s*[0-9A-Za-z+\-*/=<>()[\].,\s\\{}^_]+)/g;
const standaloneMathLinePattern = /^[\s0-9A-Za-z\\{}()[\]\+\-*/=<>.,;:^_|&]+$/;

function normalizeCommonMathSymbols(input: string) {
  return input
    .replace(/\u03c0/g, "\\pi")
    .replace(/\u03b8/g, "\\theta")
    .replace(/\u03b1/g, "\\alpha")
    .replace(/\u03b2/g, "\\beta")
    .replace(/\u03b3/g, "\\gamma")
    .replace(/\u03bb/g, "\\lambda")
    .replace(/\u2212/g, "-")
    .replace(/\u2264/g, "\\leq")
    .replace(/\u2265/g, "\\geq")
    .replace(/\u2260/g, "\\neq")
    .replace(/\u2248/g, "\\approx")
    .replace(/\u221a/g, "\\sqrt")
    .replace(/\u222b/g, "\\int")
    .replace(/\u221e/g, "\\infty")
    .replace(/\u00d7/g, "\\times")
    .replace(/\u00f7/g, "\\div")
    .replace(/([A-Za-z0-9)\]}])\u00b2/g, "$1^2")
    .replace(/([A-Za-z0-9)\]}])\u00b3/g, "$1^3")
    .replace(/([A-Za-z0-9)\]}])\u2074/g, "$1^4")
    .replace(/([A-Za-z0-9)\]}])\u2075/g, "$1^5")
    .replace(/([A-Za-z0-9)\]}])\u2076/g, "$1^6")
    .replace(/([A-Za-z0-9)\]}])\u2077/g, "$1^7")
    .replace(/([A-Za-z0-9)\]}])\u2078/g, "$1^8")
    .replace(/([A-Za-z0-9)\]}])\u2079/g, "$1^9")
    .replace(/([A-Za-z0-9)\]}])\u2070/g, "$1^0")
    .replace(/\\sqrt\s*([A-Za-z0-9])/g, "\\sqrt{$1}");
}

function hasMathDelimiter(input: string) {
  return /\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/.test(input);
}

function wrapMath(match: string, display = false) {
  if (!match.trim() || hasMathDelimiter(match)) {
    return match;
  }

  const leading = match.match(/^\s*/)?.[0] || "";
  const trailing = match.match(/\s*$/)?.[0] || "";

  if (display) {
    return `${leading}\n\\[\n${match.trim()}\n\\]\n${trailing}`;
  }

  return `${leading}$${match.trim()}$${trailing}`;
}

function protectWrapped(match: string, protectedMath: string[], display = false) {
  const token = `@@QGYXMATH${protectedMath.length}@@`;
  protectedMath.push(wrapMath(match, display));
  return token;
}

function restoreProtectedMath(input: string, protectedMath: string[]) {
  return protectedMath.reduce(
    (text, value, index) => text.replaceAll(`@@QGYXMATH${index}@@`, value),
    input
  );
}

function isStandaloneMathLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || hasMathDelimiter(trimmed)) return false;
  if (/^(#{1,6}\s+|[-*+]\s+|\d+[.)、]\s+)/.test(trimmed)) return false;
  if (/^[A-Za-z ]+[:：]/.test(trimmed)) return false;
  if (/[\u4e00-\u9fff]/.test(trimmed)) return false;
  if (!latexSignalPattern.test(trimmed) && !/[A-Za-z][A-Za-z0-9_]*\s*=/.test(trimmed)) return false;
  if (!standaloneMathLinePattern.test(trimmed)) return false;

  return /[=<>\\^_]/.test(trimmed);
}

function wrapNakedLatexLine(line: string) {
  if (!latexSignalPattern.test(line) && !/[A-Za-z][A-Za-z0-9_]*\s*=/.test(line)) {
    return line;
  }

  if (isStandaloneMathLine(line)) {
    return wrapMath(line, true);
  }

  const protectedMath: string[] = [];
  let text = line.replace(latexEnvironmentPattern, (match) => protectWrapped(match, protectedMath, true));
  text = text.replace(unitLatexPattern, (match) => protectWrapped(match, protectedMath));
  text = text.replace(generalLatexPattern, (match) => protectWrapped(match, protectedMath));
  text = text.replace(bareEquationPattern, (match) => protectWrapped(match, protectedMath));

  return restoreProtectedMath(text, protectedMath);
}

function wrapNakedLatex(segment: string) {
  return segment.split("\n").map(wrapNakedLatexLine).join("\n");
}

export function normalizeQuizMathText(input: string | null | undefined): string {
  if (!input) return "";

  let text = String(input)
    .replace(/\r\n/g, "\n")
    .replace(latexCommandAfterEscapedSlashPattern, "\\")
    .replace(/\\\$/g, "$");

  text = normalizeCommonMathSymbols(text);

  text = text
    .replace(/,\\text\{/g, "\\,\\text{")
    .replace(/(\d)\s*,\s*\\text\{/g, "$1\\,\\text{")
    .replace(/\\text\{\s*([^}]*?)\s*\}/g, "\\text{$1}");

  let output = "";
  let lastIndex = 0;

  for (const match of text.matchAll(mathDelimiterPattern)) {
    const index = match.index ?? 0;
    output += wrapNakedLatex(text.slice(lastIndex, index));
    output += match[0];
    lastIndex = index + match[0].length;
  }

  output += wrapNakedLatex(text.slice(lastIndex));
  return output;
}

export function normalizeQuizQuestionMath<T extends QuizQuestion>(question: T): T {
  return {
    ...question,
    question: normalizeQuizMathText(question.question),
    options: question.options.map((option) => normalizeQuizMathText(option)),
    explanation: question.explanation ? normalizeQuizMathText(question.explanation) : question.explanation,
    knowledgePoint: normalizeQuizMathText(question.knowledgePoint),
    topic: question.topic ? normalizeQuizMathText(question.topic) : question.topic
  };
}

export function normalizeQuizQuestionsMath<T extends QuizQuestion>(questions: T[] | undefined): T[] {
  return (questions || []).map(normalizeQuizQuestionMath);
}

export function normalizeWrongQuestionMath<T extends WrongQuestion>(question: T): T {
  return {
    ...question,
    question: normalizeQuizMathText(question.question),
    options: question.options?.map((option) => normalizeQuizMathText(option)),
    explanation: normalizeQuizMathText(question.explanation),
    knowledgePoint: question.knowledgePoint ? normalizeQuizMathText(question.knowledgePoint) : question.knowledgePoint,
    errorReason: question.errorReason ? normalizeQuizMathText(question.errorReason) : question.errorReason,
    improvementSuggestion: question.improvementSuggestion
      ? normalizeQuizMathText(question.improvementSuggestion)
      : question.improvementSuggestion
  };
}

export function normalizeWrongQuestionsMath<T extends WrongQuestion>(questions: T[] | undefined): T[] {
  return (questions || []).map(normalizeWrongQuestionMath);
}
