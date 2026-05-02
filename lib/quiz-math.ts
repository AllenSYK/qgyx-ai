import type { QuizQuestion, WrongQuestion } from "@/types/quiz";

const mathDelimiterPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
const latexSignalPattern =
  /\\text\{|\\frac|\\sqrt|\\times|\\div|\\cdot|\\left|\\right|\\sin|\\cos|\\tan|\\pi|\\leq|\\geq|\\neq|\\approx|\^|_/;
const latexCommandAfterEscapedSlashPattern =
  /\\\\(?=(text|frac|sqrt|times|div|cdot|left|right|sin|cos|tan|pi|leq|geq|neq|approx)\b|\(|\)|\[|\])/g;
const unitLatexPattern =
  /((?:[-+]?\d+(?:\.\d+)?|[A-Za-z](?!\.\s)(?:_[A-Za-z0-9{}]+)?)(?:[0-9A-Za-z+\-*/=().,\s\\{}^_]*?)\\text\{[^}]+\}(?:[0-9A-Za-z+\-*/=().,\s\\{}^_]*)?)/g;
const generalLatexPattern =
  /((?:\\(?:frac|sqrt)\{[^{}]+\}(?:\{[^{}]+\})?|\\(?:sin|cos|tan|left|right|times|div|cdot|pi|leq|geq|neq|approx)\b|[A-Za-z0-9)\]}]\s*[\^_]\s*\{?[A-Za-z0-9+\-]+\}?)(?:[0-9A-Za-z+\-*/=().,\s\\{}^_]*)?)/g;
const bareEquationPattern = /([A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z0-9+\-*/().\s^_]+)/g;

function hasMathDelimiter(input: string) {
  return /\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/.test(input);
}

function wrapMath(match: string) {
  if (!match.trim() || hasMathDelimiter(match)) {
    return match;
  }

  const leading = match.match(/^\s*/)?.[0] || "";
  const trailing = match.match(/\s*$/)?.[0] || "";
  return `${leading}$${match.trim()}$${trailing}`;
}

function protectWrapped(match: string, protectedMath: string[]) {
  const token = `@@QGYXMATH${protectedMath.length}@@`;
  protectedMath.push(wrapMath(match));
  return token;
}

function restoreProtectedMath(input: string, protectedMath: string[]) {
  return protectedMath.reduce(
    (text, value, index) => text.replaceAll(`@@QGYXMATH${index}@@`, value),
    input
  );
}

function wrapNakedLatex(segment: string) {
  if (!latexSignalPattern.test(segment) && !/[A-Za-z][A-Za-z0-9_]*\s*=/.test(segment)) {
    return segment;
  }

  const protectedMath: string[] = [];
  let text = segment.replace(unitLatexPattern, (match) => protectWrapped(match, protectedMath));
  text = text.replace(generalLatexPattern, (match) => protectWrapped(match, protectedMath));
  text = text.replace(bareEquationPattern, (match) => protectWrapped(match, protectedMath));

  return restoreProtectedMath(text, protectedMath);
}

export function normalizeQuizMathText(input: string | null | undefined): string {
  if (!input) return "";

  let text = String(input)
    .replace(/\r\n/g, "\n")
    .replace(latexCommandAfterEscapedSlashPattern, "\\");

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
