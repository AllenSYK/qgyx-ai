import type {
  OriginalExplanation,
  QuizQuestion,
  QuizResult,
  WrongExplanation
} from "@/lib/ai/schema";
import { cleanFinalAnswerChunk } from "@/lib/ai/finalAnswerMode";
import { normalizeLatexText } from "@/lib/latex";
import { normalizeQuizMathText } from "@/lib/quiz-math";

function cleanText(value: string) {
  return normalizeQuizMathText(normalizeLatexText(cleanFinalAnswerChunk(value)));
}

function cleanTextArray(value: string[] | undefined) {
  return value?.map(cleanText);
}

function cleanSteps(steps: OriginalExplanation["steps"]) {
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => ({
    title: cleanText(s.title),
    content: cleanText(s.content),
    formula: cleanText(s.formula || "")
  }));
}

export function cleanOriginalExplanationMath(value: OriginalExplanation): OriginalExplanation {
  return {
    ...value,
    title: cleanText(value.title),
    detectedText: cleanText(value.detectedText),
    subject: cleanText(value.subject),
    topic: cleanText(value.topic),
    explanation: cleanText(value.explanation),
    keySteps: value.keySteps.map(cleanText),
    knowledgePoints: cleanTextArray(value.knowledgePoints),
    finalAnswer: cleanText(value.finalAnswer),
    commonMistake: cleanText(value.commonMistake),
    similarIdeas: value.similarIdeas.map(cleanText),
    steps: cleanSteps(value.steps),
    formulas: cleanTextArray(value.formulas) || [],
    warnings: value.warnings || []
  };
}

export function cleanQuizQuestionMath(value: QuizQuestion): QuizQuestion {
  return {
    ...value,
    question: normalizeQuizMathText(value.question),
    options: value.options.map((option) => normalizeQuizMathText(option)),
    topic: cleanText(value.topic)
  };
}

export function cleanQuizResultMath(value: QuizResult): QuizResult {
  return {
    ...value,
    questions: value.questions.map(cleanQuizQuestionMath)
  };
}

export function cleanWrongExplanationMath(value: WrongExplanation): WrongExplanation {
  return {
    ...value,
    whyWrong: cleanText(value.whyWrong),
    explanation: cleanText(value.explanation),
    correctMethod: cleanText(value.correctMethod),
    similarTip: cleanText(value.similarTip)
  };
}
