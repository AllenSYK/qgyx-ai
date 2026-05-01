export const runtime = "nodejs";
export const maxDuration = 180;

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionById } from "@/lib/analysis-jobs";
import { generateWrongExplanation } from "@/lib/ai/generateWrongExplanation";
import type { OriginalExplanation, QuizResult, WrongExplanation } from "@/lib/ai/schema";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { normalizeLanguage } from "@/lib/language";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AnswerLetter = "A" | "B" | "C" | "D";

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再查看错题解析。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return apiError("缺少 jobId。");
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id,quiz_result,quiz_answers,wrong_explanations,original_explanation,language")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const quizResult = job?.quiz_result as QuizResult | null;
    const answers = (job?.quiz_answers || {}) as Record<string, AnswerLetter>;
    const originalExplanation = job?.original_explanation as OriginalExplanation | null;
    const language = normalizeLanguage(job?.language);

    if (!job || !quizResult || !originalExplanation) {
      return apiError("Quiz 尚未准备好。", 409);
    }

    if (Object.keys(answers).length < quizResult.questions.length) {
      return apiSuccess({
        ready: false,
        message: "请完成全部 Quiz 后查看错题解析。",
        wrongExplanations: {}
      });
    }

    let wrongExplanations = (job.wrong_explanations || {}) as Record<string, WrongExplanation>;
    const wrongQuestions = quizResult.questions.filter((question) => answers[question.id] && answers[question.id] !== question.correctAnswer);
    const missing = wrongQuestions.filter((question) => !wrongExplanations[question.id]);

    if (missing.length > 0) {
      const generated = await Promise.allSettled(
        missing.map(async (question) => {
          const explanation = await generateWrongExplanation({
            question,
            userAnswer: answers[question.id],
            originalExplanation,
            language
          });
          return [question.id, explanation] as const;
        })
      );

      const next = { ...wrongExplanations };

      generated.forEach((result) => {
        if (result.status === "fulfilled") {
          next[result.value[0]] = result.value[1];
        }
      });

      wrongExplanations = next;

      await admin
        .from("analysis_jobs")
        .update({
          wrong_explanations: wrongExplanations,
          updated_at: new Date().toISOString()
        })
        .eq("id", jobId)
        .eq("user_id", user.id);
    }

    return apiSuccess({
      ready: true,
      message: wrongQuestions.length > 0 ? "错题解析已生成。" : "本次没有错题。",
      wrongExplanations,
      wrongQuestions: wrongQuestions.map((question) => ({
        ...questionById(quizResult, question.id),
        userAnswer: answers[question.id]
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取错题解析失败。";
    return apiError(message, 500);
  }
}
