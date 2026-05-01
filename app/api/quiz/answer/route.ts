export const runtime = "nodejs";
export const maxDuration = 120;

import { after } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionById } from "@/lib/analysis-jobs";
import { generateWrongExplanation } from "@/lib/ai/generateWrongExplanation";
import type { OriginalExplanation, QuizResult, WrongExplanation } from "@/lib/ai/schema";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { normalizeLanguage } from "@/lib/language";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AnswerLetter = "A" | "B" | "C" | "D";

function normalizeAnswer(value: unknown): AnswerLetter | null {
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : null;
}

async function generateWrongForQuestion({
  jobId,
  userId,
  questionId,
  answer
}: {
  jobId: string;
  userId: string;
  questionId: string;
  answer: AnswerLetter;
}) {
  const admin = createSupabaseAdminClient();
  const { data: job, error } = await admin
    .from("analysis_jobs")
    .select("id,quiz_result,original_explanation,wrong_explanations,language")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const quizResult = job?.quiz_result as QuizResult | null;
  const originalExplanation = job?.original_explanation as OriginalExplanation | null;
  const language = normalizeLanguage(job?.language);
  const question = questionById(quizResult, questionId);

  if (!job || !quizResult || !originalExplanation || !question || question.correctAnswer === answer) {
    return;
  }

  const current = (job.wrong_explanations || {}) as Record<string, WrongExplanation>;

  if (current[questionId]) {
    return;
  }

  const explanation = await generateWrongExplanation({
    question,
    userAnswer: answer,
    originalExplanation,
    language
  });

  await admin
    .from("analysis_jobs")
    .update({
      wrong_explanations: {
        ...current,
        [questionId]: explanation
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId)
    .eq("user_id", userId);
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再提交答案。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as
      | {
          jobId?: string;
          questionId?: string;
          answer?: string;
        }
      | null;

    const answer = normalizeAnswer(body?.answer);

    if (!body?.jobId || !body.questionId || !answer) {
      return apiError("答案数据不完整。");
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id,quiz_result,quiz_answers")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const quizResult = job?.quiz_result as QuizResult | null;
    const question = questionById(quizResult, body.questionId);

    if (!job || !quizResult || !question) {
      return apiError("Quiz 尚未准备好，请稍后再试。", 409);
    }

    const answers = {
      ...((job.quiz_answers || {}) as Record<string, AnswerLetter>),
      [body.questionId]: answer
    };
    const correct = question.correctAnswer === answer;

    const { error: updateError } = await admin
      .from("analysis_jobs")
      .update({
        quiz_answers: answers,
        updated_at: new Date().toISOString()
      })
      .eq("id", body.jobId)
      .eq("user_id", user.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!correct) {
      after(() => {
        void generateWrongForQuestion({
          jobId: body.jobId as string,
          userId: user.id,
          questionId: body.questionId as string,
          answer
        }).catch((error) => {
          console.error("Wrong explanation generation failed:", error);
        });
      });
    }

    return apiSuccess({
      correct,
      correctAnswer: question.correctAnswer,
      userAnswer: answer,
      correctAnswerIndex: ["A", "B", "C", "D"].indexOf(question.correctAnswer),
      message: correct ? "回答正确，本题不生成解析。" : "已记录，完成全部题目后可查看错题解析。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交答案失败。";
    return apiError(message, 500);
  }
}
