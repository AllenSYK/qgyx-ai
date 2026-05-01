import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OriginalExplanation,
  QuizQuestion as CommercialQuizQuestion,
  QuizResult,
  WrongExplanation
} from "@/lib/ai/schema";
import type { AnalysisResult, Quiz, QuizQuestion } from "@/types/quiz";

export type AnalysisJobStatus =
  | "queued"
  | "uploading"
  | "ocr_processing"
  | "generating_explanation"
  | "explanation_done"
  | "generating_quiz"
  | "quiz_done"
  | "completed"
  | "failed";

export const JOB_PROGRESS: Record<AnalysisJobStatus, number> = {
  queued: 0,
  uploading: 10,
  ocr_processing: 25,
  generating_explanation: 50,
  explanation_done: 65,
  generating_quiz: 85,
  quiz_done: 95,
  completed: 100,
  failed: 100
};

export const JOB_STAGE_TEXT: Record<AnalysisJobStatus, string> = {
  queued: "排队中",
  uploading: "正在上传图片",
  ocr_processing: "正在识别题目",
  generating_explanation: "正在生成原题解析",
  explanation_done: "原题解析已完成",
  generating_quiz: "正在生成练习题",
  quiz_done: "Quiz 已准备好",
  completed: "已完成",
  failed: "生成失败，可重试"
};

export function answerLetterToIndex(answer: string) {
  return Math.max(0, ["A", "B", "C", "D"].indexOf(answer.toUpperCase()));
}

export function answerIndexToLetter(index: number): "A" | "B" | "C" | "D" {
  return (["A", "B", "C", "D"][index] || "A") as "A" | "B" | "C" | "D";
}

export function originalExplanationToAnalysisResult(explanation: OriginalExplanation): AnalysisResult {
  const similarIdeas = Array.isArray(explanation.similarIdeas) && explanation.similarIdeas.length > 0
    ? explanation.similarIdeas
    : explanation.keySteps;

  return {
    recognizedText: explanation.detectedText,
    answer: explanation.finalAnswer,
    explanation: explanation.explanation,
    knowledgePoints: [explanation.topic].filter(Boolean),
    commonMistakes: [explanation.commonMistake].filter(Boolean),
    similarIdeas,
    subject: explanation.subject,
    difficulty: explanation.difficulty,
    tags: [explanation.subject, explanation.topic, explanation.difficulty].filter(Boolean)
  };
}

export function quizResultToLegacyQuiz(quizResult: QuizResult, original?: OriginalExplanation | null): Quiz {
  const questions: QuizQuestion[] = quizResult.questions.map((question) => ({
    id: question.id,
    question: question.question,
    options: question.options,
    answerIndex: answerLetterToIndex(question.correctAnswer),
    correctAnswer: question.correctAnswer,
    explanation: "",
    knowledgePoint: question.topic,
    difficulty: question.difficulty,
    subject: original?.subject,
    tags: [original?.subject, question.topic, question.difficulty].filter(Boolean) as string[]
  }));

  return {
    title: original?.topic ? `${original.topic} 变式训练` : "AI 变式训练",
    summary: "围绕原题知识点生成的练习题。解析仅在答错后按需生成。",
    subject: original?.subject,
    questionType: original?.topic,
    sourceType: "image",
    questions
  };
}

export function questionById(quizResult: QuizResult | null | undefined, questionId: string) {
  return quizResult?.questions.find((question) => question.id === questionId) || null;
}

export function createJobStatusPayload(row: {
  id: string;
  status: string | null;
  progress: number | null;
  stage: string | null;
  image_url?: string | null;
  language?: string | null;
  original_explanation?: OriginalExplanation | null;
  quiz_result?: QuizResult | null;
  wrong_explanations?: Record<string, WrongExplanation> | WrongExplanation[] | null;
  quiz_answers?: Record<string, string> | null;
  pdf_url?: string | null;
  error_message?: string | null;
}) {
  const status = (row.status || "queued") as AnalysisJobStatus;

  return {
    jobId: row.id,
    status,
    progress: row.progress ?? JOB_PROGRESS[status] ?? 0,
    stage: row.stage || JOB_STAGE_TEXT[status] || "",
    imageUrl: row.image_url || null,
    language: row.language === "en" ? "en" : "zh",
    originalExplanation: row.original_explanation || null,
    analysis: row.original_explanation ? originalExplanationToAnalysisResult(row.original_explanation) : null,
    quizResult: row.quiz_result || null,
    quiz: row.quiz_result ? quizResultToLegacyQuiz(row.quiz_result, row.original_explanation || null) : null,
    wrongExplanations: row.wrong_explanations || {},
    quizAnswers: row.quiz_answers || {},
    pdfUrl: row.pdf_url || null,
    errorMessage: row.error_message || null
  };
}

export async function updateJobStatus(
  admin: SupabaseClient,
  jobId: string,
  status: AnalysisJobStatus,
  patch: Record<string, unknown> = {}
) {
  const { error } = await admin
    .from("analysis_jobs")
    .update({
      status,
      progress: JOB_PROGRESS[status],
      stage: JOB_STAGE_TEXT[status],
      updated_at: new Date().toISOString(),
      ...patch
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}
