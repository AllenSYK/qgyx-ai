export const runtime = "nodejs";
export const maxDuration = 300;

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  createJobStatusPayload,
  originalExplanationToAnalysisResult,
  quizResultToLegacyQuizForLanguage,
  updateJobStatus
} from "@/lib/analysis-jobs";
import { generateOriginalExplanation } from "@/lib/ai/generateOriginalExplanation";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import type { OriginalExplanation, QuizResult } from "@/lib/ai/schema";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { createGenerationAllowancePayload, getGenerationAllowance } from "@/lib/membership";
import { normalizeLanguage } from "@/lib/language";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let retryJobId = "";

  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再重试任务。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as { jobId?: string } | null;

    if (!body?.jobId) {
      return apiError("缺少 jobId。");
    }

    retryJobId = body.jobId;
    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id,status,detected_text,original_explanation,quiz_result,language")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!job) {
      return apiError("任务不存在或无权访问。", 404);
    }

    const originalExplanation = job.original_explanation as OriginalExplanation | null;
    const quizResult = job.quiz_result as QuizResult | null;

    if (job.status !== "failed" && originalExplanation && quizResult) {
      return apiSuccess(createJobStatusPayload({ ...job, progress: 100, stage: "已完成" }));
    }

    if (!job.detected_text && !originalExplanation) {
      return apiError("该任务缺少识别文本，无法从失败阶段继续，请选择更清晰、完整的题目图片。", 422);
    }

    let nextOriginal = originalExplanation;
    let nextQuiz = quizResult;
    const language = normalizeLanguage(job.language);

    if (!nextOriginal) {
      const allowance = await getGenerationAllowance(admin, user.id);

      if (!allowance.allowed) {
        return apiError("当前额度不足，无法重试原题解析。", 402);
      }

      await updateJobStatus(admin, job.id as string, "generating_explanation", {
        error_message: null
      });

      nextOriginal = await generateOriginalExplanation({
        detectedText: String(job.detected_text),
        imageSummary: "来自失败任务重试。",
        language
      });

      await admin.from("ai_usage_logs").insert({
        user_id: user.id,
        job_id: job.id,
        mode: "quiz_analysis",
        action: "original_explanation",
        status: "success"
      });
    }

    if (!nextQuiz) {
      await updateJobStatus(admin, job.id as string, "generating_quiz", {
        original_explanation: nextOriginal,
        error_message: null
      });

      nextQuiz = await generateQuiz({
        detectedText: String(job.detected_text || nextOriginal.detectedText),
        originalExplanation: nextOriginal,
        subject: nextOriginal.subject,
        topic: nextOriginal.topic,
        difficulty: nextOriginal.difficulty,
        questionCount: 3,
        language
      });
    }

    const { data: updated, error: updateError } = await admin
      .from("analysis_jobs")
      .update({
        status: "completed",
        progress: 100,
        stage: "已完成",
        original_explanation: nextOriginal,
        quiz_result: nextQuiz,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)
      .eq("user_id", user.id)
      .select("id,status,progress,stage,image_url,language,original_explanation,quiz_result,wrong_explanations,quiz_answers,pdf_url,error_message")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const refreshedAllowance = await getGenerationAllowance(admin, user.id);

    return apiSuccess({
      ...createJobStatusPayload(updated),
      ...createGenerationAllowancePayload(refreshedAllowance),
      analysis: originalExplanationToAnalysisResult(nextOriginal),
      quiz: quizResultToLegacyQuizForLanguage(nextQuiz, nextOriginal, language)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重试任务失败。";

    if (retryJobId) {
      const admin = createSupabaseAdminClient();
      await updateJobStatus(admin, retryJobId, "failed", {
        error_message: message.includes("Quiz") ? message : `Quiz 生成失败，可重试：${message}`
      }).catch(() => undefined);
    }

    return apiError(message, 500);
  }
}
